import { execFileSync } from 'node:child_process';
import { copyFile, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { build } from 'esbuild';

await rm('dist', { recursive: true, force: true });
const require = createRequire(import.meta.url);
execFileSync(process.execPath, [require.resolve('typescript/bin/tsc'), '-p', 'tsconfig.build.json'], { stdio: 'inherit' });
const declarations = await readFile('dist/index.d.ts', 'utf8');
await writeFile('dist/index.d.ts', `/// <reference path="./virtual.d.ts" />\n${declarations}`);
await build({
  entryPoints: ['src/index.ts'],
  outfile: 'dist/index.js',
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  jsx: 'automatic',
  packages: 'external',
  external: ['virtual:storybook-docs/*'],
  footer: { js: "import './index.css';" },
});
await build({
  entryPoints: ['src/vite-plugin.ts'],
  outfile: 'dist/vite-plugin.js',
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node22',
  packages: 'external',
});
await copyFile('src/styles.css', 'dist/styles.css');
await copyFile('src/virtual.d.ts', 'dist/virtual.d.ts');
