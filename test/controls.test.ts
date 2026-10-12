import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { runInThisContext } from 'node:vm';
import ts from 'typescript';
import type { getStoryControls as GetStoryControls } from '../src/controls.tsx';

const require = createRequire(import.meta.url);
const source = readFileSync(new URL('../src/controls.tsx', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
}).outputText;
const exports: { getStoryControls?: typeof GetStoryControls } = {};
runInThisContext(`(function(require, exports) { ${compiled}\n})`)((name: string) =>
  name.startsWith('./') ? {} : require(name), exports);
const getStoryControls = exports.getStoryControls!;

test('controls merge story args and argTypes, preferring explicit argType defaults', () => {
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
  assert.deepEqual(result.args, { size: 'lg', loading: false, count: 0, children: 'Save' });
  assert.deepEqual(result.controls.map(({ name, type }) => [name, type]), [
    ['size', 'select'], ['loading', 'boolean'], ['count', 'number'], ['children', 'text'],
  ]);
  assert.equal(result.unavailable, null);
  assert.equal(meta.args.loading, true, 'defaults do not mutate the imported story module');
  assert.deepEqual(getStoryControls(meta, {}).args, { size: 'md', loading: false, count: 0, children: '' });
});

test('unsupported, disabled and optionless controls are ignored without changing args', () => {
  const result = getStoryControls({ args: { color: 'red' }, argTypes: {
    color: { control: 'color', defaultValue: 'blue' },
    object: { control: 'object' },
    disabled: { control: false },
    missing: { control: 'select' },
    empty: { control: 'radio', options: [] },
    inferred: { type: 'boolean' },
  } }, {});
  assert.deepEqual(result.controls, []);
  assert.deepEqual(result.args, { color: 'red' });
  assert.match(result.unavailable!, /no supported argTypes/);
});

test('custom renders and absent argTypes retain story defaults and explain unavailability', () => {
  const meta = { args: { loading: true }, argTypes: { loading: { control: 'boolean', defaultValue: false } } };
  const custom = getStoryControls(meta, { render: () => null, args: { label: 'Custom' } });
  assert.deepEqual(custom.args, { loading: true, label: 'Custom' });
  assert.deepEqual(custom.controls, []);
  assert.match(custom.unavailable!, /custom render/);
  assert.match(getStoryControls({ ...meta, render: () => null }, {}).unavailable!, /custom render/);
  assert.match(getStoryControls({}, {}).unavailable!, /no supported argTypes/);
});

test('select options keep primitive value types rather than coercing to strings', () => {
  const options = [0, 1, false, true];
  const result = getStoryControls({ argTypes: { value: { control: 'select', options } } }, { args: { value: false } });
  assert.equal(result.controls[0]?.options, options);
  assert.equal(result.args.value, false);
});
