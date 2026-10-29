import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { build, createServer } from 'vite';
import type { ReactStorydocsConfig, CatalogEntry, PageEntry } from '../src/config.ts';
import { reactStorydocs } from '../src/vite-plugin.ts';
import type { ComponentPropsDoc } from '../src/vite-plugin.ts';

const engineRoot = path.resolve(import.meta.dirname, '..');
const prefix = 'virtual:react-storydocs/';

async function fixture(overrides: Partial<ReactStorydocsConfig> = {}, files: Record<string, string> = {}) {
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
  for (const [name, source] of Object.entries(files)) write(name, source);
  const config: ReactStorydocsConfig = {
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
      plugins: [reactStorydocs({ config, root })],
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
    const { catalog, pages, groups, stats, storySource } = await consumer.evaluate('catalog');
    assert.equal(storySource, '@fixture/ui');
    assert.deepEqual(pages, [], 'guidance without frontmatter declares no page');
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
    assert.match(await consumer.source('props'), /virtual:react-storydocs\/props\/button/);
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
    assert.match(await consumer.source('story-sources'), /virtual:react-storydocs\/story-sources\/button/);
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

test('guidance files with frontmatter become pages in the catalog, outside component guidance', async () => {
  const consumer = await fixture({}, {
    'guidance/base/install.md': '---\ntitle: Installation\n---\n# Install\n\nRun `pnpm add`.\n',
    'guidance/base/motion.md': '---\ngroup: Feedback\n---\n\n# Motion & `timing`\n\nKeep it short.\n',
    'guidance/override/patterns.md': '---\ntitle: Action patterns\ngroup: Primitives\n---\nBody.\n',
    'guidance/override/index.md': '---\ntitle: Ignored\n---\nOverview prose.\n',
  });
  try {
    const { pages, groups, stats } = await consumer.evaluate('catalog');
    assert.deepEqual(pages.map(({ slug, name, group }: PageEntry) => ({ slug, name, group })), [
      { slug: 'patterns', name: 'Action patterns', group: 'Actions' },
      { slug: 'motion', name: 'Motion & timing', group: 'Feedback' },
      { slug: 'install', name: 'Installation', group: 'Getting started' },
    ]);
    assert.deepEqual(groups, ['Actions', 'Feedback', 'Getting started']);
    assert.deepEqual(stats, { components: 3, stories: 9, groups: 3 });
    assert.match(await consumer.source('catalog'), /import\("virtual:react-storydocs\/pages\/install"\)/);
    assert.equal((await consumer.evaluate('pages/install')).markdown, '# Install\n\nRun `pnpm add`.\n');
    assert.equal((await consumer.evaluate('pages/motion')).markdown.trim(), 'Keep it short.');
    assert.equal((await consumer.evaluate('pages/unknown')).markdown, '');
    const index = await consumer.source('guidance');
    assert.doesNotMatch(index, /install|motion|patterns/);
    assert.equal((await consumer.evaluate('guidance/index')).markdown, '---\ntitle: Ignored\n---\nOverview prose.\n');
    assert.equal((await consumer.evaluate('guidance/button')).markdown, '# Updated button\n');
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

test('virtual api without a renderer exports an explicit fallback', async () => {
  const consumer = await fixture();
  try {
    const api = await consumer.evaluate('api');
    assert.equal(api.provided, false);
    assert.equal(api.Api, undefined);
  } finally { await consumer.close(); }
});

test('virtual api re-exports the configured consumer renderer', async () => {
  const consumer = await fixture({ api: { module: './api.ts' } });
  try {
    writeFileSync(path.join(consumer.root, 'api.ts'), 'export default function Api() { return null; }\n');
    const source = await consumer.source('api');
    assert.match(source, /export const provided = true;/);
    assert.match(source, /lazy\(/);
    assert.ok(source.includes(JSON.stringify(path.join(consumer.root, 'api.ts'))));
  } finally { await consumer.close(); }
});

test('virtual api fails loudly when the configured renderer is missing', async () => {
  const consumer = await fixture({ api: { module: './missing-api.ts' } });
  try {
    await assert.rejects(consumer.source('api'), /react-storydocs: api\.module "\.\/missing-api\.ts" does not exist/);
  } finally { await consumer.close(); }
});

test('virtual composition fails loudly when the configured panel is missing', async () => {
  const consumer = await fixture({ composition: { module: './missing-composition.ts' } });
  try {
    await assert.rejects(consumer.source('composition'), /react-storydocs: composition\.module "\.\/missing-composition\.ts" does not exist/);
  } finally { await consumer.close(); }
});

test('virtual code fails loudly when the configured renderer is missing', async () => {
  const consumer = await fixture({ code: { module: './missing-code.ts' } });
  try {
    await assert.rejects(consumer.source('code'), /react-storydocs: code\.module "\.\/missing-code\.ts" does not exist/);
  } finally { await consumer.close(); }
});

test('virtual decorators eagerly normalize single, array and absent default exports', async () => {
  const consumer = await fixture({ decorators: { module: './decorators.ts' } });
  try {
    writeFileSync(path.join(consumer.root, 'decorators.ts'), 'export const named = true; export default function decorator(Story) { return Story(); }');
    const source = await consumer.source('decorators');
    assert.match(source, /import \* as mod from/);
    assert.ok(!source.includes('lazy'));
    const loaded = await consumer.server.ssrLoadModule(`${prefix}decorators`);
    assert.equal(loaded.decorators.length, 1);
    assert.equal(typeof loaded.decorators[0], 'function');
  } finally { await consumer.close(); }
  for (const code of ['export default [() => null, () => null];', 'export const named = true;']) {
    const consumer = await fixture({ decorators: { module: './decorators.ts' } });
    try {
      writeFileSync(path.join(consumer.root, 'decorators.ts'), code);
      const loaded = await consumer.server.ssrLoadModule(`${prefix}decorators`);
      assert.equal(loaded.decorators.length, code.includes('default') ? 2 : 0);
    } finally { await consumer.close(); }
  }
  const absent = await fixture();
  try { assert.deepEqual((await absent.evaluate('decorators')).decorators, []); }
  finally { await absent.close(); }
});

test('virtual decorators fail loudly when the configured module is missing', async () => {
  const consumer = await fixture({ decorators: { module: './missing.ts' } });
  try {
    await assert.rejects(consumer.source('decorators'), /react-storydocs: decorators\.module "\.\/missing\.ts" does not exist \(looked in /);
  } finally { await consumer.close(); }
});

test('fixture Widget requires global decorators and resolves its separated props', async () => {
  const root = path.join(engineRoot, 'examples/fixtures');
  const config: ReactStorydocsConfig = (await import(path.join(root, 'docs.config.mjs'))).default;
  const server = await createServer({
    configFile: false, root, logLevel: 'silent', plugins: [reactStorydocs({ config, root })],
    oxc: { jsx: { runtime: 'automatic' } },
    server: { middlewareMode: true, watch: null }, optimizeDeps: { noDiscovery: true, entries: [] },
  });
  try {
    const require = createRequire(path.join(root, 'package.json'));
    const { createElement } = require('react');
    const { renderToStaticMarkup } = require('react-dom/server');
    const { StoryView } = await server.ssrLoadModule(path.join(engineRoot, 'src/story-view.tsx'));
    const module = await server.ssrLoadModule(path.join(root, 'packages/acme-ui/src/components/legacy/widget.stories.tsx'));
    assert.throws(() => renderToStaticMarkup(createElement(StoryView, { module, story: 'Default' })), /useLegacy must be used inside LegacyProvider/);
    const { LegacyProvider } = await server.ssrLoadModule(path.join(root, 'packages/acme-ui/src/legacy-src/LegacyContext.tsx'));
    const legacyDecorator = (Story: () => unknown) => createElement(LegacyProvider, null, Story());
    for (const story of ['Default', 'Disabled']) {
      const html = renderToStaticMarkup(createElement(StoryView, { module, story, decorators: [legacyDecorator] }));
      assert.match(html, /Records/);
      assert.match(html, /3/);
      assert.match(html, /Slot content/);
      assert.equal(html.includes('disabled=""'), story === 'Disabled');
    }
    const { components } = await server.ssrLoadModule(`${prefix}props/widget`);
    const widget = components.find((component: ComponentPropsDoc) => component.name === 'Widget');
    assert.ok(widget);
    assert.deepEqual(widget.props.map(({ name }: { name: string }) => name).sort(), ['children', 'count', 'disabled', 'label']);
    const mui = (await server.ssrLoadModule(`${prefix}props/mui-field`)).components.find((component: ComponentPropsDoc) => component.name === 'MuiField');
    assert.ok(mui);
    assert.ok(mui.props.some(({ name }: { name: string }) => name === 'hint'));
    assert.ok(mui.props.some(({ name, inheritedFrom }: { name: string; inheritedFrom?: string }) => name === 'label' && inheritedFrom));
    assert.ok(mui.props.some(({ name }: { name: string }) => name === 'variant'));
  } finally { await server.close(); }
});

test('fixtures consumer builds the engine and every story through real virtual modules', async () => {
  const root = path.join(engineRoot, 'examples/fixtures');
  const configFile = path.join(root, 'docs.config.mjs');
  const config: ReactStorydocsConfig = (await import(configFile)).default;
  const modules = new Set<string>();
  await build({
    configFile: false, root, logLevel: 'silent',
    resolve: { alias: [
      { find: '@jfrader/react-storydocs/theme', replacement: path.join(engineRoot, 'src/docs-theme.ts') },
      { find: '@jfrader/react-storydocs', replacement: path.join(engineRoot, 'src/index.ts') },
    ] },
    plugins: [reactStorydocs({ config, root }), {
      name: 'assert-consumer-graph',
      moduleParsed(module) { modules.add(module.id); },
    }],
    build: { write: false, minify: false },
  });
  for (const name of ['catalog', 'site', 'tokens', 'props', 'guidance', 'story-sources', 'releases', 'code', 'composition', 'decorators', 'global-styles']) {
    assert.ok(modules.has(`\0${prefix}${name}`), `${name} participates in the consumer build`);
  }
  for (const slug of ['button', 'alert', 'select', 'widget', 'mui-field']) {
    assert.ok([...modules].some((id) => id.endsWith(`/${slug}.stories.tsx`)), `${slug} story resolves`);
    assert.ok(modules.has(`\0${prefix}props/${slug}`), `${slug} props resolve`);
    assert.ok(modules.has(`\0${prefix}story-sources/${slug}`), `${slug} story sources resolve`);
  }
});
