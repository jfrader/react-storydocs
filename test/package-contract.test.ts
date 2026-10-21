import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

const root = path.resolve(import.meta.dirname, '..');

test('packed public entries point to included dist files, never consumer-unbuildable source', () => {
  const destination = mkdtempSync(path.join(root, '.package-test-'));
  try {
    execFileSync('pnpm', ['pack', '--pack-destination', destination], { cwd: root, stdio: 'pipe' });
    const archives = readdirSync(destination).filter((file) => file.endsWith('.tgz'));
    assert.equal(archives.length, 1);
    const archive = path.join(destination, archives[0]!);
    const entries = new Set(execFileSync('tar', ['-tzf', archive], { encoding: 'utf8' }).trim().split('\n'));
    const manifest = JSON.parse(execFileSync('tar', ['-xOf', archive, 'package/package.json'], { encoding: 'utf8' }));
    const local = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
    assert.deepEqual(Object.keys(manifest.exports).sort(), ['.', './theme', './vite']);
    assert.deepEqual(manifest.exports, local.exports);
    for (const conditions of Object.values(manifest.exports)) {
      for (const target of Object.values(conditions as Record<string, string>)) {
        assert.match(target, /^\.\/dist\//);
        assert.ok(entries.has(`package/${target.slice(2)}`), `${target} must be packed`);
      }
    }
    for (const file of ['dist/index.css', 'dist/styles.css', 'dist/virtual.d.ts']) {
      assert.ok(entries.has(`package/${file}`), `${file} must be packed`);
    }
    const plugin = execFileSync('tar', ['-xOf', archive, 'package/dist/vite-plugin.js'], { encoding: 'utf8' });
    assert.doesNotMatch(plugin, /from ['"]\.\.?\/[^'"]+\.ts['"]/);
  } finally {
    rmSync(destination, { recursive: true, force: true });
  }
});
