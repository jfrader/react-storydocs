import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInThisContext } from 'node:vm';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement, type ComponentType } from 'react';
import ts from 'typescript';
import { matchGlob } from '../src/scan.ts';
import { sectionStories, usageSnippet } from '../src/sections.ts';

test('shell brand links to the base-aware overview and follows the skip link', () => {
  const require = createRequire(import.meta.url);
  const compiled = ts.transpileModule(readFileSync(new URL('../src/app.tsx', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports: { DocsApp?: ComponentType } = {};
  const modules: Record<string, unknown> = {
    'virtual:storybook-docs/catalog': { catalog: [], groups: [], stats: { components: 0, stories: 0 } },
    'virtual:storybook-docs/site': { pages: {}, site: { title: 'Example UI', mark: 'E' }, theme: {} },
    'virtual:storybook-docs/releases': { releases: {} },
    './base': { STORYBOOK_DOCS_BASE: 'docs/', hrefFor: (path: string) => `/docs${path}` },
    './toc': { hashPath: (hash: string) => hash.slice(1) },
    './search': { SearchBox: () => null },
    './pages/overview': { OverviewPage: () => null },
  };
  runInThisContext(`(function(require, exports) { ${compiled}\n})`)((name: string) =>
    modules[name] ?? (name.startsWith('./') ? {} : require(name)), exports);
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { location: { hash: '#/docs/' } } });
  try {
    const html = renderToStaticMarkup(createElement(exports.DocsApp!));
    assert.match(html, /<a class="brand-link" href="#\/docs\/">\s*<span class="mark" aria-hidden="true">E<\/span>\s*<span class="brand">Example UI<\/span><\/a>/);
    assert.ok(html.indexOf('class="skip"') < html.indexOf('<button'), 'skip link precedes every button');
    assert.ok(html.indexOf('class="skip"') < html.indexOf('class="brand-link"'), 'skip link precedes the brand link');
  } finally {
    if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow);
    else Reflect.deleteProperty(globalThis, 'window');
  }
});

test('matchGlob: one segment wildcard', () => {
  assert.equal(matchGlob('src/components/*/*.stories.tsx', 'src/components/button/button.stories.tsx'), true);
  assert.equal(matchGlob('src/components/*/*.stories.tsx', 'src/components/button/nested/button.stories.tsx'), false);
  assert.equal(matchGlob('src/components/*/*.stories.tsx', 'src/components/button/button.tsx'), false);
});

test('matchGlob: partial segment wildcard and deep match', () => {
  assert.equal(matchGlob('*.stories.tsx', 'button.stories.tsx'), true);
  assert.equal(matchGlob('**/*.stories.tsx', 'a/b/c/button.stories.tsx'), true);
  assert.equal(matchGlob('src/*.tsx', 'src/a/b.tsx'), false);
});

test('sectionStories: buckets by convention and keeps every story', () => {
  const stories = ['Default', 'Variants', 'Sizes', 'Loading', 'Rtl', 'ForcedColors', 'Keyboard', 'LongContent', 'Reject'];
  const sections = sectionStories(stories);
  const seen = sections.flatMap((section) => section.stories);
  assert.deepEqual([...seen].sort(), [...stories].sort(), 'every story appears exactly once');
  const titles = sections.map((section) => section.title);
  assert.ok(titles.includes('Overview'));
  assert.ok(titles.includes('Environments'), 'Rtl/ForcedColors land in Environments');
  assert.ok(titles.includes('Variants & sizes'));
});

test('sectionStories: never loses an unrecognised story', () => {
  const sections = sectionStories(['Wibble', 'Default']);
  assert.equal(sections.flatMap((section) => section.stories).length, 2);
});

test('usageSnippet: primitives only, handlers and node children dropped', () => {
  const snippet = usageSnippet('Button', {
    variant: 'solid',
    size: 'md',
    loading: false,
    disabled: true,
    onClick: () => undefined,
    children: 'Save',
  });
  assert.equal(snippet, '<Button variant="solid" size="md" disabled>Save</Button>');
});

test('usageSnippet: returns null without args and renders an ellipsis for node children', () => {
  assert.equal(usageSnippet('Button', undefined), null);
  const snippet = usageSnippet('Card', { children: { $$typeof: Symbol('react.element') } });
  assert.equal(snippet, '<Card>\n  …\n</Card>');
});
