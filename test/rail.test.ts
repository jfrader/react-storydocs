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
    setTimeout: (callback: () => void) => { settle = callback; return 1; },
    clearTimeout: () => { settle = () => {}; },
  };
  let settle = () => {};
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
  return { rail, style, properties, window, media, listeners, scroll, resize: () => resize(), settle: () => settle(), cleanup, disconnected: () => disconnected };
}

test('rails switch armed edge only on reversal and freeze at the previous scroll position', () => {
  const f = fixture();
  assert.equal(f.style.position, 'sticky');
  assert.equal(f.style.top, '-920px');
  assert.equal(f.style.bottom, 'auto');
  f.scroll(4000);
  assert.equal(f.properties.get('--sd-rail-offset'), '0px');
  f.scroll(3880);
  assert.equal(f.properties.get('--sd-rail-start'), '20px');
  assert.equal(f.properties.get('--sd-rail-offset'), '3004px');
  assert.equal(f.style.top, 'auto');
  assert.equal(f.style.bottom, '-976px');
  f.scroll(3760);
  assert.equal(f.properties.get('--sd-rail-offset'), '3004px');
  f.scroll(3880);
  assert.equal(f.style.top, '-920px');
  assert.equal(f.properties.get('--sd-rail-offset'), '3004px');
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
  assert.equal(f.properties.get('--sd-rail-offset'), '3004px');
  assert.equal(f.style.top, '-1120px');
  f.rail.offsetHeight = 1900;
  f.resize();
  assert.equal(f.properties.get('--sd-rail-offset'), '3004px');
  assert.equal(f.style.top, '-1220px');
  f.cleanup();
});

test('shrinking a tall rail while scrolling down keeps its top until scrolling settles', () => {
  const f = fixture();
  f.scroll(4000);
  f.rail.offsetHeight = 1686;
  f.resize();
  assert.equal(f.style.top, '-920px', 'no 114px jump against downward scrolling');
  f.scroll(4120);
  f.resize();
  assert.equal(f.style.top, '-920px');
  assert.equal(f.properties.get('--sd-rail-offset'), '0px');
  f.settle();
  assert.equal(f.style.top, '-806px', 'the resized rail parks at the fold after scrolling stops');
  f.cleanup();
});

test('reversing during a deferred resize freezes the actually armed top', () => {
  const f = fixture();
  f.scroll(4000);
  f.rail.offsetHeight = 1686;
  f.resize();
  f.scroll(3880);
  assert.equal(f.properties.get('--sd-rail-offset'), '3004px', 'reversal captures the held -920px inset, not the new -806px inset');
  assert.equal(f.style.top, 'auto');
  assert.equal(f.style.bottom, '-862px');
  f.cleanup();
});

test('collapsing a tall rail into a fitting rail during scrolling parks at the header only after idle', () => {
  const f = fixture();
  f.scroll(4000);
  f.rail.offsetHeight = 524;
  f.resize();
  assert.equal(f.style.top, '-920px');
  assert.equal(f.properties.get('--sd-rail-offset'), '0px');
  f.scroll(4120);
  f.resize();
  assert.equal(f.style.top, '-920px');
  f.scroll(4000);
  assert.equal(f.style.top, '-920px', 'reversal does not jump to the header before idle');
  f.settle();
  assert.equal(f.style.top, '76px');
  assert.equal(f.style.bottom, 'auto');
  f.cleanup();
  f.settle();
  assert.equal(f.style.position, '', 'cleanup cancels deferred re-arming');
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

test('short-rail insets keep the whole rail visible through scrolling, reversal and resize', () => {
  const f = fixture();
  for (const viewport of [900, 700]) {
    f.window.innerHeight = viewport;
    for (const height of [28, 600, viewport - 76 - 20]) {
      f.rail.offsetHeight = height;
      f.resize();
      for (const y of [0, 120, 240, 360, 480, 360, 240, 120, 0]) {
        f.scroll(y);
        const top = Number.parseFloat(f.style.top);
        assert.ok(top >= 76 - 2, `top remains below the header at y=${y}`);
        assert.ok(top + height <= viewport - 8, `bottom remains above the fold at y=${y}`);
        assert.equal(f.style.bottom, 'auto');
        assert.equal(f.properties.get('--sd-rail-offset'), '0px');
      }
    }
  }
  f.cleanup();
});
