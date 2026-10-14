import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { Children, createElement, isValidElement, type ComponentType, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

test('TOC labels truncate within their rail without losing their full name', () => {
  const require = createRequire(import.meta.url);
  const labels = ['Interaction & keyboard', 'Long authored subheading', 'TriggerDefaultPrevented'];
  const scan = {
    pageKey: 'example',
    sections: [{ id: 'section', title: labels[0], subs: [{ id: 'sub', title: labels[1] }], stories: [{ id: 'story', name: labels[2] }] }],
    frames: [],
  };
  const states = [scan, null, { section: null, story: null }];
  let hook = 0;
  const compiled = ts.transpileModule(readFileSync(new URL('../src/toc.tsx', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports: { PageRail?: ComponentType<{ pageKey: string }> } = {};
  runInNewContext(`(function(require, exports) { ${compiled}\n})`, {
    window: { location: { hash: '#/components/example' } },
  })((name: string) => {
    if (name === 'react') return {
      ...require(name),
      useState: () => [states[hook++], () => {}],
      useEffect: () => {},
      useLayoutEffect: () => {},
      useRef: (current: unknown) => ({ current }),
      useCallback: (callback: unknown) => callback,
    };
    return name.startsWith('./') ? {} : require(name);
  }, exports);
  const html = renderToStaticMarkup(createElement(exports.PageRail!, { pageKey: 'example' }));
  for (const label of labels) {
    const escaped = label.replaceAll('&', '&amp;');
    assert.ok(html.includes(`title="${escaped}"`), `full title for ${label}`);
    assert.ok(html.includes(`>${escaped}</button>`), `accessible text for ${label}`);
  }
  const css = readFileSync(new URL('../src/toc.css', import.meta.url), 'utf8');
  const button = css.match(/\.toc-link\s*\{([^}]+)\}/)?.[1] ?? '';
  for (const declaration of ['display: block', 'width: 100%', 'min-width: 0', 'overflow: hidden', 'white-space: nowrap', 'text-overflow: ellipsis']) {
    assert.ok(button.includes(declaration), `bounded ellipsis requires ${declaration}`);
  }
});

test('rail followers reset before paint on route changes, but not on same-page renders', () => {
  const require = createRequire(import.meta.url);
  const calls: string[] = [];
  let dependencies: unknown[] = [];
  let cleanup: (() => void) | undefined;
  const compiled = ts.transpileModule(readFileSync(new URL('../src/toc.tsx', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const header = {};
  const element = { closest: () => ({ querySelector: () => header }) };
  const ref = { current: element };
  const exports: { useRailFollow?: (railRef: typeof ref, ready: boolean, pageKey: string) => void } = {};
  runInNewContext(`(function(require, exports) { ${compiled}\n})`)((name: string) => {
    if (name === 'react') return {
      ...require(name),
      useEffect: () => { throw new Error('rail reset must happen before paint'); },
      useLayoutEffect: (effect: () => (() => void) | undefined, next: unknown[]) => {
        if (next.length === dependencies.length && next.every((value, index) => value === dependencies[index])) return;
        cleanup?.();
        dependencies = next;
        cleanup = effect();
      },
    };
    if (name === './rail') return {
      followRail: (rail: unknown, top: unknown) => {
        assert.equal(rail, element);
        assert.equal(top, header);
        calls.push('follow');
        return () => { calls.push('clear'); };
      },
    };
    return name.startsWith('./') ? {} : require(name);
  }, exports);
  exports.useRailFollow!(ref, true, 'game-table');
  exports.useRailFollow!(ref, true, 'game-table');
  assert.deepEqual(calls, ['follow']);
  exports.useRailFollow!(ref, true, 'pill');
  assert.deepEqual(calls, ['follow', 'clear', 'follow']);
  exports.useRailFollow!(ref, false, 'pill');
  assert.deepEqual(calls, ['follow', 'clear', 'follow', 'clear']);
});

test('the shell gives both rails a new lifetime for each destination page', () => {
  const require = createRequire(import.meta.url);
  const calls: unknown[][] = [];
  const resets: ScrollToOptions[] = [];
  const refs: Array<{ current: unknown }> = [];
  let refHook = 0;
  const frames = new Map<number, () => void>();
  let frameId = 0;
  let layoutCleanup: (() => void) | undefined;
  const catalog = ['game-table', 'pill', 'effects'].map((slug) => ({ slug, group: 'Examples', name: slug }));
  const window = { location: { hash: '#/components/game-table' }, scrollTo: (options: ScrollToOptions) => { resets.push({ ...options }); } };
  const compiled = ts.transpileModule(readFileSync(new URL('../src/app.tsx', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports: { DocsApp?: () => ReactElement<{ children: ReactNode }> } = {};
  const modules: Record<string, unknown> = {
    'virtual:storybook-docs/catalog': { catalog, groups: ['Examples'], stats: {} },
    'virtual:storybook-docs/site': { pages: {}, site: { title: 'Example' }, theme: {} },
    'virtual:storybook-docs/releases': { releases: {} },
    './base': { STORYBOOK_DOCS_BASE: '', hrefFor: (path: string) => path },
    './toc': { hashPath: (hash: string) => hash.slice(1), PageRail: () => null, useRailFollow: (...args: unknown[]) => calls.push(args) },
  };
  runInNewContext(`(function(require, exports) { ${compiled}\n})`, {
    window, document: {},
    requestAnimationFrame: (callback: () => void) => { frames.set(++frameId, callback); return frameId; },
    cancelAnimationFrame: (id: number) => { frames.delete(id); },
  })((name: string) => {
    if (name === 'react') return {
      ...require(name),
      useState: (initial: unknown) => [typeof initial === 'function' ? initial() : initial, () => {}],
      useRef: (current: unknown) => refs[refHook++] ??= { current },
      useEffect: () => {},
      useLayoutEffect: (effect: () => (() => void) | undefined) => { layoutCleanup?.(); layoutCleanup = effect(); },
    };
    return modules[name] ?? (name.startsWith('./') ? {} : require(name));
  }, exports);
  const destinations = ['components/game-table', 'components/pill', 'components/effects'].map((path) => ({ path, pageKey: path }));
  destinations.push({ path: 'tokens/effects', pageKey: 'effects' });
  for (const { path, pageKey } of destinations) {
    window.location.hash = `#/${path}`;
    refHook = 0;
    const shell = exports.DocsApp!();
    const rail = Children.toArray(shell.props.children).at(-1);
    assert.ok(isValidElement<{ pageKey: string }>(rail));
    assert.equal(rail.props.pageKey, pageKey);
    assert.ok(rail.key?.endsWith(pageKey), `TOC remount key for ${path}`);
    if (path.startsWith('components/')) {
      const main = Children.toArray(shell.props.children).find((child) => isValidElement(child) && child.type === 'main');
      assert.ok(isValidElement<{ children: ReactNode }>(main));
      const content = main.props.children;
      assert.ok(isValidElement(content));
      assert.equal(content.key, pageKey, 'the old scroll target must not be reused by the destination component page');
    }
    assert.deepEqual(calls.at(-1)?.slice(1), [true, pageKey], `nav follower route key for ${path}`);
    if (path === 'components/game-table') assert.equal(resets.length, 0, 'initial mounting preserves reload scroll restoration');
    else assert.deepEqual(resets.at(-1), { top: 0, left: 0, behavior: 'instant' }, 'navigation resets the committed destination before paint');
  }
  assert.equal(resets.length, destinations.length - 1);
  assert.equal(frames.size, 1, 'rapid navigation cancels the old destination reset');
  const nextFrame = [...frames.values()][0];
  assert.ok(nextFrame);
  nextFrame();
  assert.equal(resets.length, destinations.length, 'the destination reset is repeated after compositor/layout updates');
});

function scrollFixture() {
  const require = createRequire(import.meta.url);
  const timers = new Map<number, () => void>();
  let id = 0;
  let calls = 0;
  const element = {
    isConnected: true,
    scrollIntoView: () => { calls += 1; },
    getBoundingClientRect: () => ({ top: 300 }),
  };
  const window = {
    location: { hash: '#/components/game-table' },
    scrollY: 4000,
    matchMedia: () => ({ matches: true }),
    setTimeout: (callback: () => void, delay: number) => {
      assert.equal(delay, 250);
      timers.set(++id, callback);
      return id;
    },
    clearTimeout: (timer: number) => { timers.delete(timer); },
  };
  const compiled = ts.transpileModule(readFileSync(new URL('../src/toc.tsx', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports: { scrollToElement?: (target: typeof element) => () => void } = {};
  runInNewContext(`(function(require, exports) { ${compiled}\nexports.scrollToElement = scrollToElement; })`, { window })((name: string) =>
    name.startsWith('./') ? {} : require(name), exports);
  return { window, element, timers, scroll: () => exports.scrollToElement!(element), calls: () => calls };
}

test('TOC settling cannot scroll a reused heading after navigating to another page', () => {
  const f = scrollFixture();
  f.scroll();
  assert.equal(f.calls(), 1);
  const queued = [...f.timers.values()][0];
  assert.ok(queued);
  f.window.location.hash = '#/components/pill';
  queued();
  assert.equal(f.element.isConnected, true, 'React may reuse the Props heading across component pages');
  assert.equal(f.calls(), 1, 'the old route must not pull the new page down to Props');
});

test('TOC scroll cancellation clears the timer and makes an already queued callback inert', () => {
  const f = scrollFixture();
  const cancel = f.scroll();
  const queued = [...f.timers.values()][0];
  assert.ok(queued);
  cancel();
  assert.equal(f.timers.size, 0);
  queued();
  assert.equal(f.calls(), 1);
  assert.equal(f.timers.size, 0);
});
