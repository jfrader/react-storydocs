import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { runInThisContext } from 'node:vm';
import ts from 'typescript';
import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as sections from '../src/sections.ts';
import type { getStoryControls as GetStoryControls, defaultsFromProps as DefaultsFromProps, parseDefault as ParseDefault, ControlledStoryFrame as Frame, hasHorizontalOverflow as HasHorizontalOverflow } from '../src/controls.tsx';

const require = createRequire(import.meta.url);
const source = readFileSync(new URL('../src/controls.tsx', import.meta.url), 'utf8');
const compile = (source: string) => ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
}).outputText;
const compiled = compile(source);
const demoCompiled = compile(readFileSync(new URL('../src/component-demo.tsx', import.meta.url), 'utf8'));
const storyOverrides: unknown[] = [];
const snippetArgs: unknown[] = [];
const snippets: (string | null)[] = [];

function loadControls(observeStories = false) {
  const exports: { getStoryControls?: typeof GetStoryControls; defaultsFromProps?: typeof DefaultsFromProps; parseDefault?: typeof ParseDefault; ControlledStoryFrame?: typeof Frame; hasHorizontalOverflow?: typeof HasHorizontalOverflow } = {};
  const sectionsModule = observeStories ? {
    ...sections,
    usageSnippet: (name: string, args: Record<string, unknown> | undefined) => {
      const snippet = sections.usageSnippet(name, args);
      snippetArgs.push(args);
      snippets.push(snippet);
      return snippet;
    },
  } : sections;
  const demoExports = {};
  const resolve = (name: string): unknown =>
    name === './sections' ? sectionsModule
      : name === './component-demo' ? demoExports
        : name === './toc' ? { storyLink: () => '' }
      : name === './story-view' ? {
        LazySection: observeStories ? ({ children }: { children: ReactNode }) => children : () => null,
        StoryView: ({ overrides }: { overrides: unknown }) => { storyOverrides.push(overrides); return null; },
      }
        : name === './code' ? { CodeBlock: () => { throw new Error('Closed Code panel rendered eagerly'); } }
          : name === 'virtual:storybook-docs/catalog' ? { storySource: '@jfrader/ui' }
          : name.startsWith('./') ? {} : require(name);
  runInThisContext(`(function(require, exports) { ${demoCompiled}\n})`)(resolve, demoExports);
  runInThisContext(`(function(require, exports) { ${compiled}\n})`)(resolve, exports);
  return exports;
}

const exports = loadControls();
const getStoryControls = exports.getStoryControls!;

test('canvas keyboard access requires actual horizontal overflow', () => {
  const overflow = exports.hasHorizontalOverflow!;
  assert.equal(overflow({ scrollWidth: 501, clientWidth: 500 }), true);
  assert.equal(overflow({ scrollWidth: 500, clientWidth: 500 }), false);
  assert.equal(overflow({ scrollWidth: 499, clientWidth: 500 }), false);
  assert.equal(overflow({ scrollWidth: 0, clientWidth: 0 }), false);
});

test('stories without snippets retain a deferred Code panel and no initial canvas tab stop', () => {
  const html = renderToStaticMarkup(createElement(exports.ControlledStoryFrame!, {
    componentName: 'Flex', story: 'Default', module: { default: {}, Default: { render: () => null } },
  }));
  assert.match(html, /<summary><span class="sd-demo-code-actions">Code<\/span><\/summary><\/details>/);
  assert.ok(!html.includes('No usage code'), 'fallback is deferred until the panel opens');
  assert.ok(!html.includes('tabindex'), 'unmeasured canvases do not enter the tab order');
});

test('controls merge annotations without replacing explicit args with argType defaults', () => {
  const meta = {
    args: { size: 'md', loading: true, count: 5, children: 'Save' },
    argTypes: {
      size: { control: 'radio', options: ['sm', 'md', 'lg'] },
      loading: { control: { type: 'boolean' }, defaultValue: false },
      count: { control: 'number', defaultValue: 0 },
      children: { control: 'text', defaultValue: '' },
    },
  };
  const story = { args: { size: 'lg' }, argTypes: { children: { control: 'string' } } };
  const result = getStoryControls(meta, story);
  assert.deepEqual(result.args, { size: 'lg', loading: true, count: 5, children: 'Save' });
  assert.deepEqual(result.controls.map(({ name, type }) => [name, type]), [
    ['size', 'select'], ['loading', 'boolean'], ['count', 'number'], ['children', 'text'],
  ]);
  assert.equal(meta.args.loading, true, 'defaults do not mutate the imported story module');
  assert.deepEqual(getStoryControls(meta, {}).args, meta.args);
  assert.equal(getStoryControls({ argTypes: { count: { control: 'number', defaultValue: 2 } } }, {}).args.count, 2);
  assert.equal(getStoryControls(meta, { args: { count: undefined } }).args.count, undefined);
});

test('demo owns its header action, authored blurb and skipped-hook notice without a TOC portal', () => {
  const html = renderToStaticMarkup(createElement(exports.ControlledStoryFrame!, {
    componentName: 'Widget', story: 'Example', module: {
      default: { loaders: [() => null] },
      Example: { name: 'Authored example', beforeEach: () => null,
        parameters: { viewport: 'mobile', docs: { description: { story: 'An authored blurb.' } } } },
    },
  }));
  assert.match(html, /aria-label="Copy link to Authored example"/);
  assert.match(html, /<p class="story-blurb">An authored blurb\.<\/p>/);
  assert.match(html, /Setup not run here and shown at this page’s width\. Open it in Storybook\./);
  assert.ok(!html.includes('loaders'));
  assert.ok(!html.includes('beforeEach'));
  assert.ok(!html.includes('viewport'));
  assert.match(html, /<header><span>Authored example<\/span>/);
});

test('frame with setup hooks shows setup notice without hook names', () => {
  const html = renderToStaticMarkup(createElement(exports.ControlledStoryFrame!, {
    componentName: 'Widget', story: 'Example', module: {
      default: {},
      Example: { name: 'Authored example', beforeEach: () => null },
    },
  }));
  assert.match(html, /Setup not run here\. Open it in Storybook\./);
  assert.ok(!html.includes('beforeEach'));
  assert.ok(!html.includes('loaders'));
  assert.ok(!html.includes('viewport'));
});

test('frame with viewport parameter shows width notice without hook names or the word viewport', () => {
  const html = renderToStaticMarkup(createElement(exports.ControlledStoryFrame!, {
    componentName: 'Widget', story: 'Example', module: {
      default: {},
      Example: { name: 'Authored example', parameters: { viewport: 'mobile' } },
    },
  }));
  assert.match(html, /Shown at this page’s width\. Open it in Storybook\./);
  assert.ok(!html.includes('beforeEach'));
  assert.ok(!html.includes('loaders'));
  assert.ok(!html.includes('viewport'));
});

test('demo code surface resets are scoped to the slot, not the story canvas or consumer classes', () => {
  const css = readFileSync(new URL('../src/component-demo.css', import.meta.url), 'utf8');
  assert.match(css, /\.frame \.sd-demo-code > \*,\s*\.frame \.sd-demo-code > \* > \*,\s*\.frame \.sd-demo-code pre/);
  assert.match(css, /box-shadow: none;\s*background: transparent;/);
  assert.ok(!css.includes('data-ui'), 'consumer selectors are not part of the demo contract');
});

test('unsupported, disabled and optionless controls are ignored without changing args', () => {
  const result = getStoryControls({ args: { color: 'red' }, argTypes: {
    color: { control: 'color', defaultValue: 'blue' },
    disabled: { control: false },
    missing: { control: 'select' },
    empty: { control: 'radio', options: [] },
    inferred: { type: 'boolean' },
  } }, {});
  assert.deepEqual(result.controls, []);
  assert.deepEqual(result.args, { color: 'red' });
  const html = renderToStaticMarkup(createElement(exports.ControlledStoryFrame!, {
    componentName: 'Widget', story: 'Example', module: {
      default: { args: { color: 'red' }, argTypes: {
        color: { control: 'color', defaultValue: 'blue' },
        disabled: { control: false },
        missing: { control: 'select' },
        empty: { control: 'radio', options: [] },
        inferred: { type: 'boolean' },
      } },
      Example: {},
    },
  }));
  assert.ok(!html.includes('class="sd-controls"'));
  assert.ok(!html.includes('sd-controls-note'));
  assert.ok(!html.includes('No controls'));
});

test('custom renders accept controls and retain story defaults', () => {
  const meta = { args: { loading: true }, argTypes: { loading: { control: 'boolean', defaultValue: false } } };
  const custom = getStoryControls(meta, { render: () => null, args: { label: 'Custom' } });
  assert.deepEqual(custom.args, { loading: true, label: 'Custom' });
  assert.deepEqual(custom.controls, [{ name: 'loading', type: 'boolean' }]);
  assert.equal(custom.controls.length, 1);
  assert.equal(getStoryControls({ ...meta, render: () => null }, {}).controls.length, 1);
  assert.equal(getStoryControls({}, {}).controls.length, 0);
  const html = renderToStaticMarkup(createElement(exports.ControlledStoryFrame!, {
    componentName: 'Button', story: 'Example',
    module: { default: meta, Example: {
      name: 'Authored example', render: () => null,
      parameters: { layout: 'fullscreen', docs: { source: { code: '<Button />' } } },
    } },
  }));
  assert.match(html, /Controls for Authored example/);
  assert.match(html, /data-story="Example"/);
  assert.match(html, /data-layout="fullscreen"/);
  assert.match(html, /<summary><span class="sd-demo-code-actions">Code<\/span><\/summary><\/details>/);
  assert.ok(!html.includes('&lt;Button'), 'closed Code panels do not render their source');
});

test('story without controls renders no controls panel and no placeholder', () => {
  const html = renderToStaticMarkup(createElement(exports.ControlledStoryFrame!, {
    componentName: 'Button', story: 'Plain',
    module: { default: {}, Plain: { name: 'Plain', render: () => null } },
  }));
  assert.ok(!html.includes('class="sd-controls"'));
  assert.ok(!html.includes('sd-controls-label'));
  assert.ok(!html.includes('sd-controls-note'));
  assert.ok(!html.includes('No controls'));
});

test('story control overrides retain inherited options and support corpus control types', () => {
  const result = getStoryControls({ argTypes: {
    mode: { control: 'radio', options: ['a', 'b'] },
    value: { control: { type: 'range', min: 0, max: 100, step: 5 } },
    data: { control: 'object' },
  } }, { argTypes: { mode: { control: 'inline-radio' } } });
  assert.deepEqual(result.controls, [
    { name: 'mode', type: 'select', options: ['a', 'b'] },
    { name: 'value', type: 'range', min: 0, max: 100, step: 5 },
    { name: 'data', type: 'object' },
  ]);
});

test('select options keep primitive value types rather than coercing to strings', () => {
  const options = [0, 1, false, true];
  const result = getStoryControls({ argTypes: { value: { control: 'select', options } } }, { args: { value: false } });
  assert.equal(result.controls[0]?.options, options);
  assert.equal(result.args.value, false);
});

test('parseDefault reads the source snippet docgen reports', () => {
  const parse = exports.parseDefault!;
  assert.equal(parse("'md'"), 'md');
  assert.equal(parse('"Secondary action"'), 'Secondary action');
  assert.equal(parse('false'), false);
  assert.equal(parse('3'), 3);
});

test('component defaults fill args only where the story declares nothing', () => {
  const defaults = exports.defaultsFromProps!([
    { name: 'size', defaultValue: { value: "'md'" } },
    { name: 'disabled', defaultValue: { value: 'false' } },
    { name: 'label' },
  ]);
  assert.deepEqual(defaults, { size: 'md', disabled: false });

  const withStoryArgs = exports.getStoryControls!({ args: { size: 'lg' } }, {}, defaults);
  assert.equal(withStoryArgs.args.size, 'lg', 'story args win over the component default');
  assert.equal(withStoryArgs.args.disabled, false, 'component default used when nothing declares it');
});

test('literal defaults keep objects, arrays and null; expressions never become bogus argument strings', () => {
  const parse = exports.parseDefault!;
  assert.deepEqual(parse('{"count":2,"labels":["one"]}'), { count: 2, labels: ['one'] });
  assert.deepEqual(parse('[]'), []);
  assert.equal(parse('null'), null);
  assert.equal(parse('undefined'), undefined);
  assert.equal(parse('fallback()'), undefined);
  assert.equal(parse('vars.space[2]'), undefined);
  assert.equal(parse('"a\\nb"'), 'a\nb');
  assert.deepEqual(exports.defaultsFromProps!([
    { name: 'items', defaultValue: '[]' },
    { name: 'nullable', defaultValue: 'null' },
    { name: 'expression', defaultValue: 'fallback()' },
    { name: 'absent', defaultValue: 'undefined' },
  ]), { items: [], nullable: null });
});

test('component defaults are display-only, never injected into stories or usage snippets', () => {
  const module = {
    default: { component: () => null, args: { label: 'Story' }, argTypes: { size: { control: 'text' } } },
    Default: { args: { label: 'Example' } },
  };
  storyOverrides.length = 0;
  snippetArgs.length = 0;
  snippets.length = 0;
  const observing = loadControls(true);
  const markup = renderToStaticMarkup(createElement(observing.ControlledStoryFrame!, {
    module, story: 'Default', componentName: 'Widget', componentDefaults: { size: 'sm' },
  }));
  assert.match(markup, /value="sm"/, 'the control displays the source-derived default');
  assert.deepEqual(storyOverrides, [{}], 'only explicit reader edits override the story');
  // The frame and the page share one builder now, so assert it directly: the story's own arguments
  // become JSX arguments, and the component's source-derived default (size: 'sm' above) never does.
  const built = sections.buildUsageSnippet({
    componentName: 'Widget',
    from: '@jfrader/ui',
    args: { label: 'Example' },
    component: () => null,
  });
  assert.equal(built, `import { Widget } from '@jfrader/ui';\n\n<Widget label="Example" />`);
  assert.ok(!/size/.test(built ?? ''), 'the source-derived default never becomes a JSX argument');
});
