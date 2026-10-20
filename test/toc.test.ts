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
  // Hook order: page readiness, the scan, the deep-link target, the active ids.
  const states = [true, scan, null, { section: null, story: null }];
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

test('route changes replace document targets but preserve navigation group identity', () => {
  const require = createRequire(import.meta.url);
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
    'virtual:storybook-docs/site': { pages: { color: true }, site: { title: 'Example' }, theme: {} },
    'virtual:storybook-docs/releases': { releases: {} },
    './base': { STORYBOOK_DOCS_BASE: '', hrefFor: (path: string) => path },
    './toc': { hashPath: (hash: string) => hash.slice(1), PageRail: () => null },
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
  let groupKeys: Array<string | null> | undefined;
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
    const navTrack = Children.toArray(shell.props.children).find((child) => isValidElement<{ className?: string }>(child) && child.props.className === 'rail-track nav-track');
    assert.ok(isValidElement<{ children: ReactNode }>(navTrack));
    const nav = Children.only(navTrack.props.children);
    assert.ok(isValidElement<{ children: ReactNode }>(nav));
    const keys = Children.toArray(nav.props.children).flatMap((child) =>
      isValidElement<{ active?: boolean }>(child) && child.props.active !== undefined ? [child.key] : []);
    assert.equal(keys.length, 2, 'both foundations and component groups are checked');
    groupKeys ??= keys;
    assert.deepEqual(keys, groupKeys, `navigation state survives ${path}`);
    if (path === 'components/game-table') assert.equal(resets.length, 0, 'initial mounting preserves reload scroll restoration');
    else assert.deepEqual(resets.at(-1), { top: 0, left: 0, behavior: 'instant' }, 'navigation resets the committed destination before paint');
  }
  assert.equal(resets.length, destinations.length - 1);
  assert.equal(frames.size, 0, 'route navigation never schedules a second reset over user input');
});

function scrollFixture(reducedMotion: boolean) {
  const timers = new Map<number, () => void>();
  let id = 0;
  const calls: ScrollIntoViewOptions[] = [];
  const focuses: FocusOptions[] = [];
  const element = {
    isConnected: true,
    tabIndex: 0,
    focus: (options: FocusOptions) => { focuses.push({ ...options }); },
    scrollIntoView: (options: ScrollIntoViewOptions) => { calls.push({ ...options }); },
    getBoundingClientRect: () => ({ top: 300 }),
  };
  const window = {
    location: { hash: '#/components/game-table' },
    scrollY: 4000,
    matchMedia: () => ({ matches: reducedMotion }),
    setTimeout: (callback: () => void) => {
      timers.set(++id, callback);
      return id;
    },
    clearTimeout: (timer: number) => { timers.delete(timer); },
  };
  const compiled = ts.transpileModule(readFileSync(new URL('../src/scroll.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports: { scrollToElement?: (target: typeof element) => void } = {};
  runInNewContext(compiled, { window, exports });
  return { window, element, timers, scroll: () => exports.scrollToElement!(element), calls, focuses };
}

for (const reducedMotion of [false, true]) {
  test(`TOC scrolls once without correcting later user input (reduced motion: ${reducedMotion})`, () => {
    const f = scrollFixture(reducedMotion);
    f.scroll();
    assert.equal(f.element.tabIndex, -1, 'the destination is focusable without adding a tab stop');
    assert.deepEqual(f.focuses, [{ preventScroll: true }], 'keyboard scrolling follows the document destination, not the TOC rail');
    assert.deepEqual(f.calls, [{ behavior: 'instant', block: 'start' }]);
    assert.equal(f.timers.size, 0, 'the browser, not a settle loop, owns the requested scroll');
  });
}
