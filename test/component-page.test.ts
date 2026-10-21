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
import * as scroll from '../src/scroll.ts';
import type { CatalogRef, ComponentPropsDoc } from '../src/prop-docs.ts';

function renderPage(module: Record<string, unknown>, name = 'Button', components: ComponentPropsDoc[] = [], uses: CatalogRef[] = [], hasComponent = true) {
  const require = createRequire(import.meta.url);
  const source = readFileSync(new URL('../src/pages/component-page.tsx', import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const exports: { ComponentPage?: (props: { entry: CatalogEntry }) => ReturnType<typeof createElement> } = {};
  const dependencies: Record<string, unknown> = {
    'virtual:react-storydocs/catalog': { storySource: '@fixture/ui' },
    'virtual:react-storydocs/decorators': { decorators: [] },
    '../base': { hrefFor: (path: string) => path },
    'virtual:react-storydocs/story-sources': { loadStorySources: async () => ({ sources: {} }) },
    'virtual:react-storydocs/composition': { provided: false, Composition: undefined },
    'virtual:react-storydocs/api': { provided: false, Api: undefined },
    '../sections': sections,
    '../scroll': scroll,
    '../story-view': { useStoryModule: () => ({ module }) },
    '../props': { useProps: () => ({ components, uses }) },
    '../controls': {
      defaultsFromProps: () => ({}),
      ControlledStoryFrame: ({ story, componentSlug }: { story: string; componentSlug: string }) => createElement('div', { className: 'frame', 'data-story': story, 'data-component': componentSlug }, story),
    },
    '../code': { CodeBlock: ({ code, label }: { code: string; label?: string }) => createElement('pre', { 'aria-label': label }, code) },
    '../guidance': { Guidance: () => null, MarkdownView: ({ markdown }: { markdown: string }) => createElement('p', null, markdown) },
    '../skeleton': { Skeleton: () => null },
  };
  runInThisContext(`(function(require, exports) { ${compiled} })`)(
    (id: string) => dependencies[id] ?? require(id), exports,
  );
  return renderToStaticMarkup(createElement(exports.ComponentPage!, { entry: {
    slug: 'fixture', name, group: 'Fixtures', storybookTitle: `Fixtures/${name}`,
    stories: Object.keys(module).filter((key) => key !== 'default'), hasComponent, load: async () => module,
  } }));
}

test('component page without an authored description omits the introduction and provenance footer', () => {
  const markup = renderPage({ default: { component: {} }, Default: {} });
  assert.doesNotMatch(markup, /class="lede"|every story in/);
  assert.doesNotMatch(markup, /<h2>Notes<\/h2>|Everything above is generated|Editorial judgement/);
  assert.match(markup, /data-story="Default"/);
  assert.match(markup, /class="frame" data-story="Default" data-component="fixture"/);
  assert.doesNotMatch(markup, /<h2>Usage<\/h2>|No usage code is authored/);
  assert.match(markup, /<h2>API<\/h2>/);
});

test('API keeps inherited props available in a disclosure', () => {
  const components = [{
    name: 'Button',
    props: [
      { name: 'label', type: 'string', required: true, defaultValue: null, description: '' },
      { name: 'disabled', type: 'boolean', required: false, defaultValue: null, description: '', inheritedFrom: 'BaseButtonProps' },
    ],
  }];
  const markup = renderPage({ default: { component: {} }, Default: {} }, 'Button', components);
  assert.match(markup, /Inherited props/);
  assert.match(markup, /<code>disabled<\/code>/);
  assert.match(markup, /BaseButtonProps/);
});

test('component page retains an authored description', () => {
  const markup = renderPage({
    default: { component: {}, parameters: { docs: { description: { component: 'Triggers an action.' } } } },
    Default: {},
  });
  assert.match(markup, /<p class="lede">Triggers an action\.<\/p>/);
});

test('component page moves its selected frame above Usage exactly once', () => {
  const markup = renderPage({
    default: { component: {}, args: { children: 'Save' }, parameters: { docs: { usage: 'Use it.' } } },
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
    default: { component, parameters: { docs: { usage: 'Use it.' } } }, Default: {},
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
    default: { component: () => null, args: { onOpenChange: () => undefined }, parameters: { docs: { usage: 'Use it.' } } },
    Default: {}, HiddenOpen: { tags: ['!autodocs'], args: { open: true } },
    PersistentOpen: { args: { open: true } },
  }, 'TimePicker');
  assert.ok(markup.indexOf('data-story="PersistentOpen"') < markup.indexOf('<h2>Usage</h2>'));
  assert.equal(markup.match(/data-story="PersistentOpen"/g)?.length, 1);
  assert.doesNotMatch(markup, /data-story="HiddenOpen"/);
});

test('API import does not duplicate a featured story snippet', () => {
  const markup = renderPage({
    default: { component: {}, args: { variant: 'solid', children: 'Meta' } },
    Default: { args: { children: 'Save' }, render: () => null },
  });
  assert.match(markup, /import \{ Button \} from &#x27;@fixture\/ui&#x27;/);
  assert.doesNotMatch(markup, /&lt;Button|<h2>Usage<\/h2>/);
  assert.doesNotMatch(markup, /&gt;Meta&lt;/);
});

test('page-level source is not repeated outside the example Code panel', () => {
  const markup = renderPage({
    default: { component: {}, parameters: { docs: { source: { code: '<Dialog.Content>Hello</Dialog.Content>' } } } },
    Default: { parameters: { docs: { source: { language: 'jsx' } } } },
  }, 'Dialog');
  assert.match(markup, /import \{ Dialog \}/);
  assert.doesNotMatch(markup, /&lt;Dialog.Content&gt;|<h2>Usage<\/h2>/);
});

test('authored composition source does not become a second page-level snippet', () => {
  const markup = renderPage({
    default: { component: Object.assign(() => null, { Content: () => null }), args: { defaultOpen: false } },
    Default: { render: () => null },
    Composition: { parameters: { docs: { source: { code: '<Dialog><Dialog.Content>Hello</Dialog.Content></Dialog>' } } } },
  }, 'Dialog');
  assert.doesNotMatch(markup, /&lt;Dialog&gt;/);
  assert.doesNotMatch(markup, /&lt;Dialog defaultOpen/);
});

test('API import falls back to the catalog name without docgen', () => {
  const part = renderPage({
    default: { component: { displayName: 'Dialog.Content' } }, Default: { args: { children: 'Hello' } },
  }, 'Dialog');
  assert.match(part, /import \{ Dialog \}/);
  assert.doesNotMatch(part, /&lt;Dialog.Content&gt;/);
  const missing = renderPage({ default: { component: {} }, Default: { render: () => null } }, 'Dialog');
  assert.doesNotMatch(missing, /No usage code is authored for this component\.|&lt;Dialog/);
  assert.match(missing, /import \{ Dialog \}/);
});

test('explicit sections control all examples and keep the featured frame above authored Usage', () => {
  const markup = renderPage({
    default: { component: {}, parameters: { docs: { usage: 'Use the widget.', sections: [
      { title: 'Basic', stories: ['Hidden', 'Variant'] },
      { title: 'Behavior', stories: ['Variant', 'Unknown', 'Controlled'] },
    ] } } },
    Default: {}, Variant: {}, Controlled: {}, Hidden: { tags: ['!autodocs'] },
  });
  assert.ok(markup.indexOf('data-story="Variant"') < markup.indexOf('<h2>Usage</h2>'));
  assert.ok(markup.indexOf('<h2>Behavior</h2>') < markup.indexOf('<h2>API</h2>'));
  assert.equal(markup.match(/data-story="Variant"/g)?.length, 1);
  assert.match(markup, /<span class="chip">2 stories<\/span>/);
  assert.doesNotMatch(markup, /data-story="(?:Hidden|Default|Unknown)"|<h2>Basic<\/h2>|More stories/);
});

test('API renders named parts, descriptions, native notes, slots and relationships with captions', () => {
  const prop = (name: string, extra = {}) => ({ name, type: 'string', required: false, defaultValue: null, description: '', ...extra });
  const markup = renderPage({ default: { component: {} }, Default: {} }, 'Widget', [
    { name: 'Widget', description: 'Root description.', props: [
      prop('slotProps', { members: [prop('root', { description: 'Root slot.', defaultElement: 'div', part: 'widget-root' }), prop('content', { description: 'Content slot.' })] }),
      prop('slots', { members: [prop('content', { description: 'Replacement.', defaultElement: 'Widget.Content' }), prop('action', { component: { name: 'Action', slug: 'action' } }), prop('unknown')] }),
      prop('id', { inheritedFrom: 'HTMLAttributes' }),
    ] },
    { name: 'Widget.Content', description: 'Part description.', native: 'section', props: [] },
  ], [{ name: 'Surface', slug: 'surface' }]);
  assert.equal(markup.match(/Root description\./g)?.length, 1);
  assert.match(markup, /<p class="lede">Root description\.<\/p>/);
  assert.match(markup, /import \{ Widget \}/);
  assert.match(markup, /<section class="api-part"><h3 id="api-widget">Widget<\/h3>/);
  assert.match(markup, /<h3 id="api-widget-content">Widget.Content<\/h3><p>Part description\.<\/p>/);
  assert.match(markup, /Also accepts the attributes of <code>&lt;section&gt;<\/code>/);
  assert.match(markup, /No component-specific props\./);
  assert.match(markup, /Also accepts inherited props from <span><code>HTMLAttributes<\/code>/);
  assert.match(markup, /<summary>Inherited props <span class="count">1<\/span>/);
  assert.match(markup, /<code>id<\/code>/);
  assert.match(markup, /<pre aria-label="Import">import/);
  assert.match(markup, /<h3>Slots<\/h3>/);
  const slots = markup.slice(markup.indexOf('<h3>Slots</h3>'), markup.indexOf('<h3>Also uses</h3>'));
  assert.ok(slots.indexOf('<code>root</code>') < slots.indexOf('<code>action</code>'), slots);
  assert.equal(slots.match(/<code>content<\/code>/g)?.length, 1);
  assert.match(slots, /data-ui=&quot;widget-root&quot;/);
  assert.match(slots, /class="api-part-link"/);
  assert.doesNotMatch(slots, /href="#api-/);
  assert.match(slots, /href="#\/components\/action"/);
  assert.match(slots, /Content slot\./);
  assert.doesNotMatch(slots, /Replacement\./);
  assert.match(markup, /<h3>Also uses<\/h3><ul><li><a href="#\/components\/surface">Surface<\/a>/);
  assert.equal(markup.match(/class="table-scroll"/g)?.length, markup.match(/<caption /g)?.length);
});

test('API retains argTypes fallback and omits empty slot and relationship headings', () => {
  const markup = renderPage({ default: { component: {}, argTypes: { label: { control: 'text' } } }, Default: {} });
  assert.match(markup, /<h2>API<\/h2>/);
  assert.match(markup, /<th scope="col">Control<\/th>/);
  assert.doesNotMatch(markup, /<h3>Slots<\/h3>|<h3>Also uses<\/h3>/);
});

test('Slots merges keys across parts and keeps the first slotProps description', () => {
  const member = (name: string, description: string) => ({ name, description, type: 'object', required: false, defaultValue: null });
  const markup = renderPage({ default: { component: {} }, Default: {} }, 'Widget', [
    { name: 'Widget', props: [{ ...member('slotProps', ''), members: [member('shared', 'Root meaning.')] }] },
    { name: 'Widget.Content', props: [{ ...member('slots', ''), members: [member('shared', 'Part meaning.'), member('extra', 'Extra slot.')] }] },
  ]);
  const slots = markup.slice(markup.indexOf('<h3>Slots</h3>'));
  assert.equal(slots.match(/<code>shared<\/code>/g)?.length, 1);
  assert.match(slots, /Root meaning\./);
  assert.match(slots, /Extra slot\./);
  assert.doesNotMatch(slots, /Part meaning\./);
});

test('an authored introduction overrides root JSDoc without repeating either in API', () => {
  const markup = renderPage({ default: { component: {}, parameters: { docs: { description: { component: 'Authored introduction.' } } } }, Default: {} }, 'Widget', [
    { name: 'Widget', description: 'Source introduction.', props: [] },
  ]);
  assert.equal(markup.match(/Authored introduction\./g)?.length, 1);
  assert.doesNotMatch(markup, /Source introduction\./);
});

test('API does not expand native style members', () => {
  const member = (name: string) => ({ name, type: 'string', description: '', required: false, defaultValue: null });
  const markup = renderPage({ default: { component: {} }, Default: {} }, 'Widget', [{
    name: 'Widget',
    props: [{
      name: 'style', type: 'CSSProperties', description: '', required: false, defaultValue: null,
      members: [member('accentColor'), member('alignContent'), member('background')],
    }],
  }]);
  assert.match(markup, /CSSProperties/);
  assert.match(markup, /Native style overrides/);
  assert.doesNotMatch(markup, /Fields|accentColor|alignContent/);
});

test('inherited catalog and native props are summarized and disclosed', () => {
  const prop = (name: string, extra = {}) => ({ name, type: 'string', description: '', required: false, defaultValue: null, ...extra });
  const markup = renderPage({ default: { component: {} }, Default: {} }, 'Widget', [{ name: 'Widget', native: 'dialog', props: [
    prop('own'), prop('id', { inheritedFrom: 'HTMLAttributes' }),
    prop('surfaceProp', { inheritedFrom: 'SurfaceProps', inheritedComponent: { name: 'Surface', slug: 'surface' } }),
  ] }]);
  assert.match(markup, /Also accepts the props of <a href="#\/components\/surface">Surface<\/a>/);
  assert.match(markup, /Also accepts the attributes of <code>&lt;dialog&gt;<\/code>/);
  assert.match(markup, /<code>own<\/code>/);
  const mainTable = markup.slice(0, markup.indexOf('<details class="api-inherited">'));
  assert.doesNotMatch(mainTable, /<code>id<\/code>|<code>surfaceProp<\/code>/);
  assert.match(markup, /Inherited props <span class="count">2<\/span>/);
  assert.match(markup, /<code>id<\/code>/);
  assert.match(markup, /<code>surfaceProp<\/code>/);
  assert.match(markup, /HTMLAttributes/);
});

test('stories-only pages have no empty API but retain authored argTypes APIs', () => {
  const markup = renderPage({ default: {}, Default: {} }, 'Guide', [], [], false);
  assert.doesNotMatch(markup, /<h2>API<\/h2>|No props\./);
  const withArgs = renderPage({ default: { argTypes: { size: { control: 'text' } } }, Default: {} }, 'Guide', [], [], false);
  assert.match(withArgs, /<h2>API<\/h2>/);
});
