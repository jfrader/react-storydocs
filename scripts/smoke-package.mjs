import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(import.meta.url);
const manifest = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const temporary = await mkdtemp(path.join(root, 'node_modules/.package-smoke-'));
const run = (command, args, cwd = temporary) => execFileSync(command, args, { cwd, stdio: 'inherit' });
const write = (name, content) => writeFile(path.join(temporary, name), content);

try {
  run('pnpm', ['pack', '--pack-destination', temporary], root);
  const archives = (await readdir(temporary)).filter(name => name.endsWith('.tgz'));
  assert.equal(archives.length, 1, 'Expected exactly one release tarball');
  const archive = path.join(temporary, archives[0]);
  const contents = execFileSync('tar', ['-tzf', archive], { encoding: 'utf8' }).trim().split('\n');
  console.log(`Tarball contents:\n${contents.join('\n')}`);
  for (const name of contents) {
    assert.match(name, /^package\/(?:package\.json|LICENSE|README\.md|docs\/(?:CONFIG|RELEASING)\.md|dist\/[\w/-]+\.(?:js|css|d\.ts))$/, `Unexpected shipped file: ${name}`);
  }
  await mkdir(path.join(temporary, 'unpacked'));
  run('tar', ['-xzf', archive, '-C', 'unpacked']);
  const packed = JSON.parse(await readFile(path.join(temporary, 'unpacked/package/package.json'), 'utf8'));
  assert.equal(packed.version, manifest.version);
  // One shape: what the manifest declares is what ships. The entries still have to point into
  // dist and exist in the tarball, which the checks below enforce.
  assert.deepEqual(packed.exports, manifest.exports, 'Packed entries must match the manifest');
  assert.deepEqual(packed.sideEffects, ['**/*.css'], 'CSS must survive consumer tree shaking');
  for (const entry of Object.values(packed.exports)) {
    for (const target of Object.values(entry)) {
      assert.match(target, /^\.\/dist\//, 'Published entries must not resolve to sources');
      await readFile(path.join(temporary, 'unpacked/package', target));
    }
  }
  for (const name of ['index.css', 'styles.css', 'virtual.d.ts']) {
    assert.ok((await readFile(path.join(temporary, 'unpacked/package/dist', name))).length, `Missing or empty ${name}`);
  }

  const dependencies = Object.fromEntries(['react', 'react-dom', 'vite', 'typescript', '@types/node', '@types/react', '@types/react-dom'].map(name => [name, require(`${name}/package.json`).version]));
  dependencies[manifest.name] = `file:${archive}`;
  await write('package.json', JSON.stringify({ name: 'storybook-docs-package-smoke', private: true, type: 'module', dependencies }, null, 2));
  run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund']);
  const installed = path.join(temporary, 'node_modules', manifest.name);
  assert.equal(await realpath(installed), installed, 'Consumer must install the tarball, not a link');
  const installedManifest = JSON.parse(await readFile(path.join(installed, 'package.json'), 'utf8'));
  assert.deepEqual(installedManifest.exports, packed.exports);
  const consumerRequire = createRequire(path.join(temporary, 'package.json'));
  for (const name of Object.keys(dependencies)) {
    if (name === manifest.name) continue;
    const resolved = await realpath(consumerRequire.resolve(`${name}/package.json`));
    assert.ok(resolved.startsWith(`${temporary}${path.sep}node_modules${path.sep}`), `Consumer dependency leaked from parent checkout: ${name}`);
  }
  await write('index.html', '<!doctype html><html lang="en"><head><meta charset="UTF-8"><title>Package smoke</title></head><body><div id="root"></div><script type="module" src="/main.tsx"></script></body></html>');
  await write('main.tsx', "import { start } from '@jfrader/storybook-docs';\nstart();\n");
  await write('Button.stories.tsx', "function Button({ label = 'Hello' }: { label?: string }) { return <button>{label}</button>; }\nexport default { title: 'Actions/Button', component: Button };\nexport const Default = { args: { label: 'Tarball story' } };\n");
  await write('vite.config.mjs', "import { defineConfig } from 'vite';\nimport { storybookDocs } from '@jfrader/storybook-docs/vite';\nexport default defineConfig({ plugins: [storybookDocs({ config: { site: { title: 'Smoke' }, stories: { from: '.', pattern: '*.stories.tsx' } } })], esbuild: { jsx: 'automatic' } });\n");
  await write('types.ts', `import type { StorybookDocsConfig, CatalogEntry } from '@jfrader/storybook-docs';
import { storybookDocs } from '@jfrader/storybook-docs/vite';
import { site } from 'virtual:storybook-docs/site';
import { catalog } from 'virtual:storybook-docs/catalog';
import { vars } from 'virtual:storybook-docs/tokens';
import { loadProps } from 'virtual:storybook-docs/props';
import { loadGuidance } from 'virtual:storybook-docs/guidance';
import { releases } from 'virtual:storybook-docs/releases';
import { Code, provided } from 'virtual:storybook-docs/code';
import { Composition, provided as compositionProvided } from 'virtual:storybook-docs/composition';
import 'virtual:storybook-docs/global-styles';
const config: StorybookDocsConfig = { site, stories: { from: '.', pattern: '*.stories.tsx' } };
const entries: CatalogEntry[] = catalog;
// @ts-expect-error Virtual types must not silently resolve as any.
const invalid: number = site.title;
const panel: typeof Composition = compositionProvided ? Composition : undefined;
void [storybookDocs({ config }), entries, vars, loadProps, loadGuidance, releases, Code, provided, panel, invalid];
`);
  await write('tsconfig.json', JSON.stringify({ compilerOptions: { target: 'ES2022', module: 'ESNext', moduleResolution: 'bundler', strict: true, skipLibCheck: false, noEmit: true, jsx: 'react-jsx', types: ['node', 'react', 'react-dom'], noUncheckedSideEffectImports: true }, include: ['*.ts', '*.tsx'] }, null, 2));
  run(process.execPath, ['node_modules/typescript/bin/tsc', '--noEmit']);
  console.log('PASS: installed browser/plugin declarations and all virtual module types (skipLibCheck=false)');
  run(process.execPath, ['node_modules/vite/bin/vite.js', 'build']);
  const assets = path.join(temporary, 'dist/assets');
  const outputs = await readdir(assets);
  const css = outputs.filter(name => name.endsWith('.css'));
  assert.ok(css.length, 'Consumer build emitted no CSS');
  const styles = (await Promise.all(css.map(name => readFile(path.join(assets, name), 'utf8')))).join('\n');
  assert.ok(styles.includes('--sd-bg'), 'Consumer CSS is missing engine styles');
  const javascript = (await Promise.all(outputs.filter(name => name.endsWith('.js')).map(name => readFile(path.join(assets, name), 'utf8')))).join('\n');
  assert.ok(!javascript.includes('virtual:storybook-docs/'), 'Unresolved engine virtual modules in consumer output');
  assert.ok(javascript.includes('Tarball story'), 'Consumer did not bundle the scanned story');
  console.log(`PASS: ${manifest.name}@${manifest.version} tarball installed, types checked, plugin/virtual modules built, CSS retained`);
} finally {
  await rm(temporary, { recursive: true, force: true });
}
