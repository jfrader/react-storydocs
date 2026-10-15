import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { build, createServer } from 'vite';
import type { StorybookDocsConfig, CatalogEntry } from '../src/config.ts';
import { storybookDocs } from '../src/vite-plugin.ts';
import type { ComponentPropsDoc } from '../src/vite-plugin.ts';

const engineRoot = path.resolve(import.meta.dirname, '..');
const prefix = 'virtual:storybook-docs/';

async function fixture(overrides: Partial<StorybookDocsConfig> = {}) {
  const root = mkdtempSync(path.join(engineRoot, '.plugin-test-'));
  const write = (name: string, source: string) => {
    const file = path.join(root, name);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, source);
  };
  write('library/src/button/button.tsx', `
import type { ReactElement, ReactNode } from 'react';
export interface ButtonProps {
  label: string;
  children?: ReactNode;
  disabled?: boolean;
  count?: number;
  size?: 'sm' | 'lg';
}
export function Button({ label, disabled = false, count = 0, size = 'sm' }: ButtonProps): ReactElement {
  return <button disabled={disabled}>{label} {count} {size}</button>;
}
`);
  for (const [folder, title] of [['button', 'Primitives/Button'], ['alert', 'Feedback/Alert'], ['icon-button', 'Primitives/IconButton']]) {
    write(`library/src/${folder}/${folder}.stories.tsx`, `
const Component = (args) => <button {...args}>Fixture</button>;
const meta = { title: '${title}', component: Component, tags: ['autodocs'] };
export default meta;
export const Default = { tags: ['smoke'], args: {} };
export const Disabled = { args: { disabled: true } };
export const Rendered = { render: (args) => <Component {...args} /> };
`);
  }
  mkdirSync(path.join(root, 'node_modules/@fixture'), { recursive: true });
  symlinkSync(path.join(root, 'library'), path.join(root, 'node_modules/@fixture/ui'), 'dir');
  write('guidance/base/button.md', '# Original button\n');
  write('guidance/base/alert.md', '# Alert\n');
  write('guidance/override/button.md', '# Updated button\n');
  write('guidance/override/ignored.txt', 'Not guidance');
  write('library/package.json', '{"version":"2.3.4"}');
  write('CHANGELOG.md', '# Changelog\n\n## 2.3.4\n\n- **Fixed** defaults.\n');
  write('code.ts', 'export default function Code() { return null; }');
  const config: StorybookDocsConfig = {
    site: { title: 'Test consumer' },
    stories: { from: '@fixture/ui', pattern: 'src/**/*.stories.tsx' },
    groups: { rename: { Primitives: 'Actions' }, order: ['Actions', 'Feedback'] },
    guidance: { dir: ['guidance/base', 'guidance/missing', 'guidance/override'] },
    releases: { versionFrom: 'library/package.json', changelog: 'CHANGELOG.md' },
    ...overrides,
  };
  try {
    const server = await createServer({
      configFile: false, root, logLevel: 'silent',
      plugins: [storybookDocs({ config, root })],
      server: { middlewareMode: true, watch: null },
      optimizeDeps: { noDiscovery: true, entries: [] },
    });
    const container = server.environments.client!.pluginContainer;
    const source = async (name: string) => {
      const resolved = await container.resolveId(`${prefix}${name}`);
      assert.equal(resolved?.id, `\0${prefix}${name}`);
      const loaded = await container.load(resolved!.id);
      assert.ok(loaded, `${name} must have a loader`);
      return typeof loaded === 'string' ? loaded : loaded.code;
    };
    const evaluate = async (name: string) => import(`data:text/javascript;base64,${Buffer.from(await source(name)).toString('base64')}`);
    return { root, config, server, container, source, evaluate, close: async () => {
      await server.close();
      rmSync(root, { recursive: true, force: true });
    } };
  } catch (error) {
    rmSync(root, { recursive: true, force: true });
    throw error;
  }
}

test('virtual catalog preserves group order, slugs and tagged story exports inside the linked package', async () => {
  const consumer = await fixture();
  try {
    const { catalog, groups, stats, storySource } = await consumer.evaluate('catalog');
    assert.equal(storySource, '@fixture/ui');
    assert.deepEqual(catalog.map(({ slug, name, group, stories, hasComponent }: CatalogEntry) => ({ slug, name, group, stories, hasComponent })), [
      { slug: 'button', name: 'Button', group: 'Actions', stories: ['Default', 'Disabled', 'Rendered'], hasComponent: true },
      { slug: 'icon-button', name: 'IconButton', group: 'Actions', stories: ['Default', 'Disabled', 'Rendered'], hasComponent: true },
      { slug: 'alert', name: 'Alert', group: 'Feedback', stories: ['Default', 'Disabled', 'Rendered'], hasComponent: true },
    ]);
    assert.deepEqual(groups, ['Actions', 'Feedback']);
    assert.deepEqual(stats, { components: 3, stories: 9, groups: 2 });
    const source = await consumer.source('catalog');
    const imports = [...source.matchAll(/import\(("[^"]+")\)/g)].map((match) => JSON.parse(match[1]!));
    assert.equal(imports.length, 3);
    for (const id of imports) {
      const resolved = await consumer.container.resolveId(id);
      assert.ok(resolved);
      assert.ok(resolved.id.startsWith(`${realpathSync(path.join(consumer.root, 'library'))}${path.sep}`));
      assert.match(readFileSync(resolved.id, 'utf8'), /tags: \['autodocs'\]/);
    }
  } finally { await consumer.close(); }
});

test('virtual props retain real defaults and null for missing defaults', async () => {
  const consumer = await fixture();
  try {
    assert.match(await consumer.source('props'), /virtual:storybook-docs\/props\/button/);
    const { components }: { components: ComponentPropsDoc[] } = await consumer.evaluate('props/button');
    const button = components.find(({ name }) => name === 'Button');
    assert.ok(button);
    assert.deepEqual(Object.fromEntries(button.props.map(({ name, defaultValue }) => [name, defaultValue])), {
      label: null, children: null, disabled: 'false', count: '0', size: '"sm"',
    });
    for (const { props } of components) {
      for (const prop of props) {
        assert.notEqual(prop.defaultValue, 'null');
        assert.notEqual(prop.defaultValue, '[object Object]');
      }
    }
    assert.deepEqual((await consumer.evaluate('props/unknown')).components, []);
  } finally { await consumer.close(); }
});

test('virtual story sources are per component, cached and invalidated when the story changes', async () => {
  const consumer = await fixture();
  try {
    assert.match(await consumer.source('story-sources'), /virtual:storybook-docs\/story-sources\/button/);
    const sources = { Rendered: '// JSX from Component, as authored.\n<button {...args}>Fixture</button>' };
    assert.deepEqual((await consumer.evaluate('story-sources/button')).sources, sources);
    assert.deepEqual((await consumer.evaluate('story-sources/alert')).sources, sources);
    assert.deepEqual((await consumer.evaluate('story-sources/unknown')).sources, {});
    const file = path.join(consumer.root, 'library/src/button/button.stories.tsx');
    writeFileSync(file, readFileSync(file, 'utf8').replace('<Component {...args} />', '<Updated />'));
    assert.deepEqual((await consumer.evaluate('story-sources/button')).sources, sources);
    await consumer.container.watchChange(file, { event: 'update' });
    assert.deepEqual((await consumer.evaluate('story-sources/button')).sources, { Rendered: '<Updated />' });
  } finally { await consumer.close(); }
});

test('virtual guidance merges directories, with later overrides and empty missing slugs', async () => {
  const consumer = await fixture();
  try {
    const index = await consumer.source('guidance');
    assert.equal([...index.matchAll(/case "button"/g)].length, 1);
    assert.match(index, /case "alert"/);
    assert.doesNotMatch(index, /ignored/);
    assert.equal((await consumer.evaluate('guidance/button')).markdown, '# Updated button\n');
    assert.equal((await consumer.evaluate('guidance/alert')).markdown, '# Alert\n');
    assert.equal((await consumer.evaluate('guidance/unknown')).markdown, '');
  } finally { await consumer.close(); }
});

test('virtual releases read manifest version and preserve renderable changelog Markdown', async () => {
  const consumer = await fixture();
  try {
    const { releases } = await consumer.evaluate('releases');
    assert.deepEqual(releases, { version: '2.3.4', changelog: readFileSync(path.join(consumer.root, 'CHANGELOG.md'), 'utf8') });
    const { marked } = await import('marked');
    assert.match(await marked.parse(releases.changelog), /<h2>2\.3\.4<\/h2>/);
    assert.match(await marked.parse(releases.changelog), /<strong>Fixed<\/strong> defaults/);
  } finally { await consumer.close(); }
});

test('virtual releases prefer explicit site versions and tolerate absent optional files', async () => {
  const consumer = await fixture({ site: { title: 'Test', version: '9.0.0' }, releases: { versionFrom: 'missing.json', changelog: 'missing.md' } });
  try {
    assert.deepEqual((await consumer.evaluate('releases')).releases, { version: '9.0.0', changelog: null });
  } finally { await consumer.close(); }
});

test('virtual code without a renderer exports an explicit fallback', async () => {
  const consumer = await fixture();
  try {
    const code = await consumer.evaluate('code');
    assert.equal(code.provided, false);
    assert.equal(code.Code, undefined);
  } finally { await consumer.close(); }
});

test('virtual code re-exports the configured consumer renderer', async () => {
  const consumer = await fixture({ code: { module: './code.ts' } });
  try {
    const source = await consumer.source('code');
    // The renderer is imported lazily: its highlighter must not sit in the initial bundle.
    assert.match(source, /export const provided = true;/);
    assert.match(source, /lazy\(/);
    assert.ok(source.includes(JSON.stringify(path.join(consumer.root, 'code.ts'))), 'imports the configured module');
  } finally { await consumer.close(); }
});

test('virtual composition without a panel exports an explicit fallback', async () => {
  const consumer = await fixture();
  try {
    const composition = await consumer.evaluate('composition');
    assert.equal(composition.provided, false);
    assert.equal(composition.Composition, undefined);
  } finally { await consumer.close(); }
});

test('virtual composition re-exports the configured consumer panel', async () => {
  const consumer = await fixture({ composition: { module: './composition.ts' } });
  try {
    writeFileSync(path.join(consumer.root, 'composition.ts'), 'export default function Composition() { return null; }\n');
    const source = await consumer.source('composition');
    assert.match(source, /export const provided = true;/);
    assert.match(source, /lazy\(/);
    assert.ok(source.includes(JSON.stringify(path.join(consumer.root, 'composition.ts'))));
  } finally { await consumer.close(); }
});

test('virtual composition fails loudly when the configured panel is missing', async () => {
  const consumer = await fixture({ composition: { module: './missing-composition.ts' } });
  try {
    await assert.rejects(consumer.source('composition'), /storybook-docs: composition\.module "\.\/missing-composition\.ts" does not exist/);
  } finally { await consumer.close(); }
});

test('virtual code fails loudly when the configured renderer is missing', async () => {
  const consumer = await fixture({ code: { module: './missing-code.ts' } });
  try {
    await assert.rejects(consumer.source('code'), /storybook-docs: code\.module "\.\/missing-code\.ts" does not exist/);
  } finally { await consumer.close(); }
});

test('fixtures consumer builds the engine and every story through real virtual modules', async () => {
  const root = path.join(engineRoot, 'examples/fixtures');
  const configFile = path.join(root, 'docs.config.mjs');
  const config: StorybookDocsConfig = (await import(configFile)).default;
  const modules = new Set<string>();
  await build({
    configFile: false, root, logLevel: 'silent',
    resolve: { alias: { '@jfrader/storybook-docs': path.join(engineRoot, 'src/index.ts') } },
    plugins: [storybookDocs({ config, root }), {
      name: 'assert-consumer-graph',
      moduleParsed(module) { modules.add(module.id); },
    }],
    build: { write: false, minify: false },
  });
  for (const name of ['catalog', 'site', 'tokens', 'props', 'guidance', 'story-sources', 'releases', 'code', 'composition', 'global-styles']) {
    assert.ok(modules.has(`\0${prefix}${name}`), `${name} participates in the consumer build`);
  }
  for (const slug of ['button', 'alert', 'select']) {
    assert.ok([...modules].some((id) => id.endsWith(`/${slug}.stories.tsx`)), `${slug} story resolves`);
    assert.ok(modules.has(`\0${prefix}props/${slug}`), `${slug} props resolve`);
    assert.ok(modules.has(`\0${prefix}story-sources/${slug}`), `${slug} story sources resolve`);
  }
});
