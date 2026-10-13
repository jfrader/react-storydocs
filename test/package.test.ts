import assert from 'node:assert/strict';
import { mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { storybookDocs } from '../src/vite-plugin.ts';

test('plugin resolves linked files to their real location for relative imports', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'storybook-docs-resolution-'));
  try {
    const file = `${directory}/fixture.ts`;
    const linked = `${directory}/linked.ts`;
    writeFileSync(file, 'export const fixture = true;');
    symlinkSync(file, linked);
    const plugin = storybookDocs({
      config: { site: { title: 'Test' }, stories: { from: directory, pattern: '*.stories.tsx' } },
    });
    const hook = plugin.resolveId;
    assert.equal(typeof hook, 'function');
    if (typeof hook !== 'function') throw new Error('Missing resolveId function');
    const resolved = Reflect.apply(hook, {}, [`storybook-docs-file:${linked}`]);
    assert.equal(resolved, realpathSync(file));
    assert.equal(Reflect.apply(hook, {}, ['virtual:storybook-docs/catalog']), '\0virtual:storybook-docs/catalog');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
