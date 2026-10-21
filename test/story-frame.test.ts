import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { runInThisContext } from 'node:vm';
import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import * as sections from '../src/sections.ts';
import type { StoryFrameProps } from '../src/story-frame.tsx';

const require = createRequire(import.meta.url);
function load(file: string, dependencies: Record<string, unknown>) {
  const source = readFileSync(new URL(file, import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022,
  } }).outputText;
  const exports: Record<string, any> = {};
  runInThisContext(`(function(require, exports) { ${compiled} })`)(
    (id: string) => dependencies[id] ?? (id.endsWith('.css') ? {} : require(id)), exports,
  );
  return exports;
}
const base = { REACT_STORYDOCS_BASE: '/docs', hrefFor: (path: string) => `/docs${path}` };
const toc = load('../src/toc.tsx', { './scroll': {} });
const routes = load('../src/story-route.ts', { './base': base, './toc': toc });

test('standalone links encode export keys and preserve the published site hash base', () => {
  const hash = routes.standaloneStoryHref('nested/widget', 'With space/#?');
  assert.equal(hash, '#/docs/stories/nested%2Fwidget/With%20space%2F%23%3F');
  assert.deepEqual(routes.parseStoryRoute(hash), { slug: 'nested/widget', story: 'With space/#?' });
  assert.deepEqual(routes.parseStoryRoute('#/stories/widget/Default', ''), { slug: 'widget', story: 'Default' });
  assert.equal(routes.componentStoryHref('widget', 'With space'), '#/docs/components/widget?story=With+space');
  for (const hash of ['#/docs/stories/widget', '#/docs/stories/widget/', '#/docs/stories/a/b/c', '#/docs/stories/a/%zz', '#/docs/components/a?story=B']) {
    assert.equal(routes.parseStoryRoute(hash), null);
  }
});

const frameDependencies = {
  './story-route': routes,
  './toc': { storyLink: () => 'https://ui.jfrader.com/#/components/widget?story=Default' },
  './code': { CodeBlock: ({ code }: { code: string }) => createElement('pre', null, code) },
};
const frame = load('../src/story-frame.tsx', frameDependencies);
const props: StoryFrameProps = {
  componentSlug: 'widget', story: 'Default', storyName: 'Default', controls: [], args: {}, changed: false,
  onControlChange: () => undefined, onReset: () => undefined, storyLayout: 'padded',
  snippet: '<Widget />', codeLanguage: 'tsx', children: null,
};

test('layout follows story annotations, then meta, with padded as the default', () => {
  const { storyLayout } = load('../src/story-view.tsx', { './sections': sections });
  assert.equal(storyLayout({ default: {}, Default: {} }, 'Default'), 'padded');
  for (const layout of ['centered', 'padded', 'fullscreen']) {
    assert.equal(storyLayout({ default: { parameters: { layout } }, Default: {} }, 'Default'), layout);
    assert.equal(storyLayout({ default: { parameters: { layout: 'fullscreen' } }, Default: { parameters: { layout } } }, 'Default'), layout);
  }
});

test('toolbar exposes a controlled code panel, copy link and safe new-tab fullscreen link', () => {
  const html = renderToStaticMarkup(createElement(frame.StoryFrame, props));
  assert.match(html, /class="frame" data-story="Default"/);
  const controls = html.match(/aria-controls="([^"]+)"/)!;
  assert.ok(controls);
  assert.ok(html.includes(`id="${controls[1]}" hidden="" class="sd-frame-code"`));
  assert.match(html, /aria-label="View code"[^>]+aria-expanded="false"/);
  assert.match(html, /aria-label="Copy link to Default"/);
  assert.match(html, /href="#\/docs\/stories\/widget\/Default" target="_blank" rel="noreferrer" aria-label="Open Default full screen"/);
  assert.doesNotMatch(html, /<details|&lt;Widget/);
});

test('copy code writes the snippet and announces success', async () => {
  const react = require('react');
  const runtime = require('react/jsx-runtime');
  const actions: Record<string, () => Promise<void>> = {};
  const statuses: unknown[] = [];
  let written = '';
  const original = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { clipboard: { writeText: async (text: string) => { written = text; } } } });
  try {
    const capture = (type: unknown, props: any, key?: string) => {
      if (type === 'button' && props.onClick) actions[props['aria-label']] = props.onClick;
      return type === runtime.Fragment || Array.isArray(props.children) ? runtime.jsxs(type, props, key) : runtime.jsx(type, props, key);
    };
    const openFrame = load('../src/story-frame.tsx', {
      ...frameDependencies,
      react: { ...react, useState: (value: unknown) => [value === false ? true : value, (value: unknown) => statuses.push(value)], useEffect: () => undefined },
      'react/jsx-runtime': { ...runtime, jsx: capture, jsxs: capture },
    });
    const html = renderToStaticMarkup(createElement(openFrame.StoryFrame, props));
    assert.match(html, /&lt;Widget \/&gt;/);
    assert.match(html, /<span>tsx<\/span>/);
    await actions['Copy code']!();
    assert.equal(written, '<Widget />');
    assert.ok(statuses.includes('Code copied'));
    assert.match(html, /role="status"/);
  } finally {
    if (original) Object.defineProperty(globalThis, 'navigator', original);
    else Reflect.deleteProperty(globalThis, 'navigator');
  }
});

test('denied clipboard falls back, removes its textarea and handles fallback failure', async () => {
  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  let removed = 0;
  let selected = 0;
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { clipboard: { writeText: async () => { throw new Error('Denied'); } } } });
  const document = { createElement: () => ({ value: '', className: '', setAttribute() {}, select() { selected++; }, remove() { removed++; } }), body: { append() {} }, execCommand: () => true };
  Object.defineProperty(globalThis, 'document', { configurable: true, value: document });
  try {
    assert.equal(await frame.copyText('Example'), true);
    document.execCommand = () => { throw new Error('Denied'); };
    assert.equal(await frame.copyText('Example'), false);
    assert.equal(removed, 2);
    assert.equal(selected, 2);
  } finally {
    for (const [name, descriptor] of [['navigator', originalNavigator], ['document', originalDocument]] as const) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    }
  }
});

test('invalid standalone routes explain the failure and link back without rendering a story', () => {
  const page = load('../src/pages/story-page.tsx', {
    'virtual:react-storydocs/catalog': { catalog: [{ slug: 'widget', name: 'Widget', stories: ['Default'] }] },
    'virtual:react-storydocs/decorators': { decorators: [] }, '../base': base,
    '../docs-theme.js': {}, '../sections': sections, '../story-route': routes,
    '../story-view': { StoryView: () => { throw new Error('Invalid story rendered'); } },
  });
  const missingComponent = renderToStaticMarkup(createElement(page.StandaloneStoryPage, { slug: 'missing', story: 'Default' }));
  assert.match(missingComponent, /Component not found/);
  assert.match(missingComponent, /href="#\/docs\/"/);
  const missingStory = renderToStaticMarkup(createElement(page.StandaloneStoryPage, { slug: 'widget', story: 'Missing' }));
  assert.match(missingStory, /Story not found/);
  assert.match(missingStory, /href="#\/docs\/components\/widget\?story=Missing"/);
});

test('standalone page composes story args and decorators and uses the app-owned theme action', () => {
  const module = {
    default: { args: { label: 'Meta' }, component: ({ label }: { label: string }) => createElement('button', null, label), parameters: { layout: 'centered' } },
    Default: { args: { label: 'Story' } },
  };
  const view = load('../src/story-view.tsx', { './sections': sections });
  const page = load('../src/pages/story-page.tsx', {
    'virtual:react-storydocs/catalog': { catalog: [{ slug: 'widget', name: 'Widget', stories: ['Default'] }] },
    'virtual:react-storydocs/decorators': { decorators: [(Story: () => ReactNode) => createElement('div', { 'data-provider': 'global' }, Story())] },
    '../base': base, '../sections': sections, '../story-route': routes,
    '../story-view': { ...view, useStoryModule: () => ({ module, error: null }) },
  });
  const html = renderToStaticMarkup(createElement(page.StandaloneStoryPage, {
    slug: 'widget', story: 'Default', themeAction: createElement('button', { 'aria-label': 'Switch to light theme' }, 'light'),
  }));
  assert.match(html, /aria-label="Switch to light theme"/);
  assert.match(html, /data-layout="centered"/);
  assert.match(html, /data-provider="global"><button>Story<\/button>/);
  for (const width of ['Fill', '1024', '768', '390']) assert.ok(html.includes(`>${width}</button>`));
  assert.doesNotMatch(html, /sd-controls|class="top"|class="nav"/);
});
