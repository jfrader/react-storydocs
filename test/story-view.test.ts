import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { runInThisContext } from 'node:vm';
import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import * as sections from '../src/sections.ts';
import type { StoryView as View } from '../src/story-view.tsx';

const require = createRequire(import.meta.url);
const compiled = ts.transpileModule(readFileSync(new URL('../src/story-view.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
}).outputText;
const exports: { StoryView?: typeof View } = {};
runInThisContext(`(function(require, exports) { ${compiled}\n})`)((name: string) =>
  name === './sections' ? sections : name.startsWith('./') ? {} : require(name), exports);
const StoryView = exports.StoryView!;

test('render and decorators receive merged CSF context and decorators can override args', () => {
  const order: string[] = [];
  const decorate = (name: string) => (Story: (update?: { args?: Record<string, unknown> }) => unknown, context: { args: Record<string, unknown> }) => {
    order.push(name);
    return Story(name === 'story' ? { args: { ...context.args, label: 'decorated' } } : undefined);
  };
  const module = {
    default: {
      title: 'Actions/Button', args: { label: 'meta', icon: 'save' }, globals: { theme: 'dark', locale: 'en' },
      parameters: { docs: { source: { code: 'meta', language: 'tsx' } } },
      argTypes: { icon: { mapping: { save: 'mapped' } } },
      decorators: [decorate('meta-first'), decorate('meta-last')],
    },
    Example: {
      name: 'Authored name', args: { label: 'story' }, globals: { theme: 'light' },
      parameters: { docs: { source: { code: 'story' } } }, decorators: [decorate('story')],
      render: (args: Record<string, unknown>, context: Record<string, unknown>) => {
        assert.deepEqual(context.globals, { theme: 'light', locale: 'en' });
        assert.deepEqual(context.parameters, { docs: { source: { code: 'story', language: 'tsx' } } });
        assert.equal(context.name, 'Authored name');
        assert.equal(args.icon, 'mapped');
        return createElement('span', null, String(args.label));
      },
    },
  };
  assert.equal(renderToStaticMarkup(createElement(StoryView, { module, story: 'Example' })), '<span>decorated</span>');
  assert.deepEqual(order, ['meta-last', 'meta-first', 'story']);
});

test('decorator context updates replace args like Storybook rather than merging them', () => {
  const module = {
    default: { args: { omitted: 'meta' }, render: (args: Record<string, unknown>) => createElement('span', null, Object.keys(args).join(',')) },
    Example: { decorators: [(Story: (update: { args: Record<string, unknown> }) => unknown) => Story({ args: { only: true } })] },
  };
  assert.equal(renderToStaticMarkup(createElement(StoryView, { module, story: 'Example' })), '<span>only</span>');
});

test('annotation merge replaces arrays and false while retaining sibling keys', () => {
  assert.deepEqual(sections.mergeAnnotations(
    { field: { control: 'radio', options: ['a'], table: { category: 'base' } } },
    { field: { control: false, options: ['b'] } },
  ), { field: { control: false, options: ['b'], table: { category: 'base' } } });
});

test('function stories render their args and context inside story, meta and global decorators', () => {
  const order: string[] = [];
  const decorate = (name: string) => (Story: () => ReactNode) => {
    order.push(name);
    return createElement('div', { 'data-wrapper': name }, Story());
  };
  const Template = (args: Record<string, unknown>, context: { name: string; story: string }) => {
    assert.equal(context.name, 'Default');
    assert.equal(context.story, 'Default');
    return createElement('span', null, String(args.label));
  };
  const Default = Object.assign(Template.bind({}), { args: { label: 'CSF2' }, decorators: [decorate('story')] });
  const html = renderToStaticMarkup(createElement(StoryView, {
    module: { default: { args: { label: 'meta' }, decorators: [decorate('meta')] }, Default },
    story: 'Default', decorators: [decorate('global')],
  }));
  assert.equal(html, '<div data-wrapper="global"><div data-wrapper="meta"><div data-wrapper="story"><span>CSF2</span></div></div></div>');
  assert.deepEqual(order, ['global', 'meta', 'story']);
});
