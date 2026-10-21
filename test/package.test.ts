import assert from 'node:assert/strict';
import { mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { reactStorydocs } from '../src/vite-plugin.ts';

test('plugin resolves linked files to their real location for relative imports', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'react-storydocs-resolution-'));
  try {
    const file = `${directory}/fixture.ts`;
    const linked = `${directory}/linked.ts`;
    writeFileSync(file, 'export const fixture = true;');
    symlinkSync(file, linked);
    const plugin = reactStorydocs({
      config: { site: { title: 'Test' }, stories: { from: directory, pattern: '*.stories.tsx' } },
    });
    const hook = plugin.resolveId;
    assert.equal(typeof hook, 'function');
    if (typeof hook !== 'function') throw new Error('Missing resolveId function');
    const resolved = Reflect.apply(hook, {}, [`react-storydocs-file:${linked}`]);
    assert.equal(resolved, realpathSync(file));
    assert.equal(Reflect.apply(hook, {}, ['virtual:react-storydocs/catalog']), '\0virtual:react-storydocs/catalog');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
