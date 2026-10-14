import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

function fixture() {
  const listeners = new Map<string, () => void>();
  const properties = new Map<string, string>();
  const track = {
    clientHeight: 12000,
    getBoundingClientRect: () => ({ top: 56 - window.scrollY }),
    style: { setProperty: (key: string, value: string) => properties.set(key, value) },
    removeAttribute: () => properties.clear(),
  };
  const style = { position: '', top: '', bottom: '' };
  const rail = {
    parentElement: track, offsetHeight: 1800, style,
    getBoundingClientRect: () => { throw new Error('must never measure the rendered rail'); },
    removeAttribute: () => { style.position = ''; style.top = ''; style.bottom = ''; },
  };
  const media = {
    matches: true,
    addEventListener: (_: string, listener: () => void) => listeners.set('media', listener),
    removeEventListener: () => listeners.delete('media'),
  };
  const window = {
    scrollY: 0, innerHeight: 900,
    matchMedia: () => media,
    addEventListener: (key: string, listener: () => void) => listeners.set(key, listener),
    removeEventListener: (key: string) => listeners.delete(key),
  };
  let resize = () => {};
  let disconnected = false;
  const compiled = ts.transpileModule(readFileSync(new URL('../src/rail.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports: { followRail?: (element: typeof rail, header: { offsetHeight: number }) => () => void } = {};
  runInNewContext(compiled, {
    exports, window,
    ResizeObserver: class {
      constructor(callback: () => void) { resize = callback; }
      observe() {}
      disconnect() { disconnected = true; }
    },
  });
  const cleanup = exports.followRail!(rail, { offsetHeight: 56 });
  const scroll = (y: number) => { window.scrollY = y; listeners.get('scroll')!(); };
  return { rail, style, properties, window, media, listeners, scroll, resize: () => resize(), cleanup, disconnected: () => disconnected };
}

test('rails switch armed edge only on reversal and freeze at the previous scroll position', () => {
  const f = fixture();
  assert.equal(f.style.position, 'sticky');
  assert.equal(f.style.top, '-920px');
  assert.equal(f.style.bottom, 'auto');
  f.scroll(4000);
  assert.equal(f.properties.get('--sd-rail-offset'), '0px');
  f.scroll(3880);
  assert.equal(f.properties.get('--sd-rail-offset'), '3024px');
  assert.equal(f.style.top, 'auto');
  assert.equal(f.style.bottom, '-976px');
  f.scroll(3760);
  assert.equal(f.properties.get('--sd-rail-offset'), '3024px');
  f.scroll(3880);
  assert.equal(f.style.top, '-920px');
  assert.equal(f.properties.get('--sd-rail-offset'), '3024px');
  assert.ok(!('transform' in f.style));
  f.cleanup();
  assert.equal(f.listeners.size, 0);
  assert.equal(f.disconnected(), true);
});

test('viewport and content resize rearm without recapturing the spacer', () => {
  const f = fixture();
  f.scroll(4000);
  f.scroll(3880);
  f.scroll(3760);
  f.scroll(3880);
  f.window.innerHeight = 700;
  f.listeners.get('resize')!();
  assert.equal(f.properties.get('--sd-rail-offset'), '3024px');
  assert.equal(f.style.top, '-1120px');
  f.rail.offsetHeight = 1900;
  f.resize();
  assert.equal(f.properties.get('--sd-rail-offset'), '3024px');
  assert.equal(f.style.top, '-1220px');
  f.cleanup();
});

test('short rails stay top-sticky and below the breakpoint all inline styles are removed', () => {
  const f = fixture();
  f.rail.offsetHeight = 600;
  f.resize();
  assert.equal(f.style.top, '76px');
  f.scroll(4000);
  f.scroll(3880);
  assert.equal(f.style.top, '76px');
  assert.equal(f.properties.get('--sd-rail-offset'), '0px');
  f.media.matches = false;
  f.listeners.get('media')!();
  assert.deepEqual(f.style, { position: '', top: '', bottom: '' });
  assert.equal(f.properties.size, 0);
  f.cleanup();
});
