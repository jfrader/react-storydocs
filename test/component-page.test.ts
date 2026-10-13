import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { runInThisContext } from 'node:vm';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import type { CatalogEntry } from '../src/config.ts';
import * as sections from '../src/sections.ts';

function renderPage(module: Record<string, unknown>, name = 'Button') {
  const require = createRequire(import.meta.url);
  const source = readFileSync(new URL('../src/pages/component-page.tsx', import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const exports: { ComponentPage?: (props: { entry: CatalogEntry }) => ReturnType<typeof createElement> } = {};
  const dependencies: Record<string, unknown> = {
    'virtual:storybook-docs/catalog': { storySource: '@fixture/ui' },
    '../sections': sections,
    '../story-view': { useStoryModule: () => ({ module }) },
    '../props': { useProps: () => [] },
    '../controls': {
      defaultsFromProps: () => ({}),
      ControlledStoryFrame: ({ story }: { story: string }) => createElement('div', { 'data-story': story }, story),
    },
    '../code': { CodeBlock: ({ code }: { code: string }) => createElement('pre', null, code) },
    '../guidance': { Guidance: () => null, MarkdownView: ({ markdown }: { markdown: string }) => createElement('p', null, markdown) },
    '../skeleton': { Skeleton: () => null },
  };
  runInThisContext(`(function(require, exports) { ${compiled} })`)(
    (id: string) => dependencies[id] ?? require(id), exports,
  );
  return renderToStaticMarkup(createElement(exports.ComponentPage!, { entry: {
    slug: 'fixture', name, group: 'Fixtures', storybookTitle: `Fixtures/${name}`,
    stories: Object.keys(module).filter((key) => key !== 'default'), hasComponent: true, load: async () => module,
  } }));
}

test('component page moves its selected frame above Usage exactly once', () => {
  const markup = renderPage({
    default: { component: {}, args: { children: 'Save' } },
    Default: {}, Loading: {}, Highlighted: {}, Hidden: { tags: ['!autodocs'] },
  });
  assert.ok(markup.indexOf('data-story="Highlighted"') < markup.indexOf('<h2>Usage</h2>'));
  assert.equal(markup.match(/data-story="Highlighted"/g)?.length, 1);
  assert.equal(markup.match(/data-story="Default"/g)?.length, 1);
  assert.doesNotMatch(markup, /data-story="Hidden"/);
});

test('component page uses overlay anatomy and open args without admitting !autodocs fixtures', () => {
  const component = Object.assign(() => null, { Trigger: () => null, Content: () => null });
  const markup = renderPage({
    default: { component }, Default: {},
    Open: { tags: ['!autodocs'], args: { defaultOpen: true } },
    PersistentOpen: { args: { defaultOpen: true } },
    DisabledOpen: { args: { open: true } },
  }, 'Dialog');
  assert.ok(markup.indexOf('data-story="PersistentOpen"') < markup.indexOf('<h2>Usage</h2>'));
  assert.equal(markup.match(/data-story="PersistentOpen"/g)?.length, 1);
  assert.doesNotMatch(markup, /data-story="Open"/);
});

test('documentation table styling cannot leak into story or portalled calendar tables', () => {
  const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
  assert.doesNotMatch(css, /(?:^|\n)(?:table|th|td|tbody th|th \+ th|td \+ td)\s*[{,]/);
  for (const selector of ['table', 'table th', 'table tbody th', 'table td']) {
    assert.ok(css.includes(`:is(.table-scroll, .guidance-table) > ${selector} {`));
  }
});

test('component page combines meta callbacks and sibling open args for single-widget surfaces', () => {
  const markup = renderPage({
    default: { component: () => null, args: { onOpenChange: () => undefined } },
    Default: {}, HiddenOpen: { tags: ['!autodocs'], args: { open: true } },
    PersistentOpen: { args: { open: true } },
  }, 'TimePicker');
  assert.ok(markup.indexOf('data-story="PersistentOpen"') < markup.indexOf('<h2>Usage</h2>'));
  assert.equal(markup.match(/data-story="PersistentOpen"/g)?.length, 1);
  assert.doesNotMatch(markup, /data-story="HiddenOpen"/);
});

test('component Usage merges default-story args, even when its render is custom', () => {
  const markup = renderPage({
    default: { component: {}, args: { variant: 'solid', children: 'Meta' } },
    Default: { args: { children: 'Save' }, render: () => null },
  });
  assert.match(markup, /import \{ Button \} from &#x27;@fixture\/ui&#x27;/);
  assert.match(markup, /&lt;Button variant=&quot;solid&quot;&gt;Save&lt;\/Button&gt;/);
  assert.doesNotMatch(markup, /&gt;Meta&lt;/);
});

test('component Usage retains authored source when a story overrides only language', () => {
  const markup = renderPage({
    default: { component: {}, parameters: { docs: { source: { code: '<Dialog.Content>Hello</Dialog.Content>' } } } },
    Default: { parameters: { docs: { source: { language: 'jsx' } } } },
  }, 'Dialog');
  assert.match(markup, /import \{ Dialog \}/);
  assert.match(markup, /&lt;Dialog.Content&gt;Hello&lt;\/Dialog.Content&gt;/);
});

test('component Usage falls back to another authored composition rather than a bare compound root', () => {
  const markup = renderPage({
    default: { component: Object.assign(() => null, { Content: () => null }), args: { defaultOpen: false } },
    Default: { render: () => null },
    Composition: { parameters: { docs: { source: { code: '<Dialog><Dialog.Content>Hello</Dialog.Content></Dialog>' } } } },
  }, 'Dialog');
  assert.match(markup, /&lt;Dialog&gt;&lt;Dialog.Content&gt;Hello&lt;\/Dialog.Content&gt;&lt;\/Dialog&gt;/);
  assert.doesNotMatch(markup, /&lt;Dialog defaultOpen/);
});

test('component Usage uses dotted part identity and reports missing compound examples honestly', () => {
  const part = renderPage({
    default: { component: { displayName: 'Dialog.Content' } }, Default: { args: { children: 'Hello' } },
  }, 'Dialog');
  assert.match(part, /import \{ Dialog \}/);
  assert.match(part, /&lt;Dialog.Content&gt;Hello&lt;\/Dialog.Content&gt;/);
  const missing = renderPage({ default: { component: {} }, Default: { render: () => null } }, 'Dialog');
  assert.match(missing, /No usage code is authored for this component\./);
  assert.doesNotMatch(missing, /import \{ Dialog \}|&lt;Dialog/);
});
