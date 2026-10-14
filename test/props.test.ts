import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { runInThisContext } from 'node:vm';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import { storybookDocs, type ComponentPropsDoc } from '../src/vite-plugin.ts';
import type { ResolvedConfig } from 'vite';

function extract(source: string): ComponentPropsDoc[] {
  const root = mkdtempSync(path.join(tmpdir(), 'storybook-docs-props-'));
  try {
    symlinkSync(path.resolve('node_modules'), path.join(root, 'node_modules'), 'dir');
    mkdirSync(path.join(root, 'widget'));
    writeFileSync(path.join(root, 'widget/widget.tsx'), source);
    writeFileSync(path.join(root, 'widget/widget.stories.tsx'), "const meta = { title: 'Components/Widget', component: Widget }; export default meta; export const Default = {};");
    const plugin = storybookDocs({ root, config: { site: { title: 'Fixture' }, stories: { from: '.', pattern: '**/*.stories.tsx' } } });
    const resolved = plugin.configResolved as (config: ResolvedConfig) => void;
    resolved.call({}, { root } as ResolvedConfig);
    const load = plugin.load as (id: string) => string;
    const code = load.call({}, '\0virtual:storybook-docs/props/widget');
    return JSON.parse(code.replace('export const components = ', '').replace(/;$/, ''));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('callable exports document compound parts without exported props types, not helper interfaces', () => {
  const tables = extract(`
    import type { ComponentPropsWithRef } from 'react';
    export interface WidgetRenderProps { helper: string }
    interface RootProps { mode?: 'quiet' | 'loud'; items?: string[]; config?: { count: number }; nullable?: null; skipped?: string }
    function Root({ mode = 'quiet', items = [], config = { count: 2 }, nullable = null, skipped = undefined }: RootProps) { return null; }
    function Content(props: Omit<ComponentPropsWithRef<'dialog'>, 'open'> & {
      /** Old option. @deprecated Use mode instead. */
      old?: boolean;
      /** @since 2.0 */
      version?: string;
      /** @example <Widget.Content label="Hi" /> */
      label: string;
      slotProps?: { body?: { tone?: 'info' | 'warning' } };
    }) { return null; }
    export const Widget = Object.assign(Root, { Content });
  `);
  assert.deepEqual(tables.map((table) => table.name), ['Widget', 'Widget.Content']);
  const root = tables[0]!;
  const prop = (name: string) => root.props.find((item) => item.name === name)!;
  assert.match(prop('mode').type, /quiet.*loud/);
  assert.doesNotMatch(prop('mode').type, /enum|undefined/);
  assert.equal(prop('mode').defaultValue, '"quiet"');
  assert.equal(prop('items').defaultValue, '[]');
  assert.equal(prop('config').defaultValue, '{"count":2}');
  assert.equal(prop('nullable').defaultValue, 'null');
  assert.equal(prop('skipped').defaultValue, null);
  assert.equal(prop('mode').required, false);
  const content = tables[1]!;
  assert.equal(content.props.find((item) => item.name === 'label')?.required, true);
  assert.equal(content.props.find((item) => item.name === 'old')?.tags?.[0]?.name, 'deprecated');
  assert.equal(content.props.find((item) => item.name === 'version')?.tags?.[0]?.text, '2.0');
  assert.match(content.props.find((item) => item.name === 'label')?.tags?.[0]?.text ?? '', /Widget.Content/);
  assert.ok(content.props.find((item) => item.name === 'aria-label')?.inheritedFrom);
  assert.ok(content.props.find((item) => item.name === 'ref')?.inheritedFrom);
  assert.ok(!content.props.some((item) => item.name === 'key' || item.name === 'open'));
  assert.equal(content.props.find((item) => item.name === 'slotProps')?.members?.[0]?.name, 'body');
  assert.match(content.props.find((item) => item.name === 'slotProps')?.members?.[0]?.type ?? '', /info.*warning/);
});

test('type text is not cut at 140 characters and expression defaults remain source snippets', () => {
  const values = Array.from({ length: 25 }, (_, index) => `'option-${index}'`).join(' | ');
  const tables = extract(`
    const fallback = () => ({ value: 1 });
    export function Widget({ value = fallback() }: { value?: ${values} }) { return null; }
  `);
  const prop = tables[0]!.props.find((item) => item.name === 'value')!;
  assert.match(prop.type, /option-24/);
  assert.ok(prop.type.length > 140);
  assert.equal(prop.defaultValue, 'fallback()');
});

test('body destructuring keeps source defaults and ReactNode aliases without compiler file paths', () => {
  const tables = extract(`
    import type { ReactNode } from 'react';
    interface Labels {
      /** @deprecated Use title. */
      old?: string;
      title?: string;
    }
    interface Props { children?: ReactNode; visible?: boolean; labels?: Labels }
    function omit(props: Props): Props { return props; }
    function Content({ children, ...props }: Props) { const { visible = true } = omit(props); return null; }
    export const Widget = Object.assign((props: Props) => null, { Content });
  `);
  const props = tables.find((table) => table.name === 'Widget.Content')!.props;
  assert.equal(props.find((prop) => prop.name === 'visible')?.defaultValue, 'true');
  assert.equal(props.find((prop) => prop.name === 'children')?.type, 'ReactNode');
  assert.equal(props.find((prop) => prop.name === 'labels')?.members?.find((prop) => prop.name === 'old')?.tags?.[0]?.name, 'deprecated');
  assert.doesNotMatch(JSON.stringify(tables), /import\("|node_modules|storybook-docs-props-/);
});

test('mapped slot names and const literal defaults are resolved without evaluating expressions', () => {
  const tables = extract(`
    const EMPTY = { text: '', mentions: [] } as const;
    const dynamic = () => [];
    type Part = 'caption' | 'cell';
    interface Props { value?: unknown; slotProps?: Partial<Record<Part, { tone?: 'info' | 'warning' }>>; dynamic?: unknown }
    export function Widget({ value = EMPTY, dynamic: computed = dynamic() }: Props) { return null; }
  `);
  const props = tables[0]!.props;
  assert.equal(props.find((prop) => prop.name === 'value')?.defaultValue, '{"text":"","mentions":[]}');
  assert.equal(props.find((prop) => prop.name === 'dynamic')?.defaultValue, 'dynamic()');
  assert.deepEqual(props.find((prop) => prop.name === 'slotProps')?.members?.map((member) => member.name), ['caption', 'cell']);
  assert.match(props.find((prop) => prop.name === 'slotProps')?.members?.[0]?.type ?? '', /info.*warning/);
});

test('props presentation shows allowed values, JSDoc and collapsed inherited props', () => {
  const require = createRequire(import.meta.url);
  const source = readFileSync(new URL('../src/pages/component-page.tsx', import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const exports: { PropsTable?: (props: { components: ComponentPropsDoc[]; argTypes: Record<string, Record<string, unknown>>; defaultArgs: Record<string, unknown> }) => ReturnType<typeof createElement> } = {};
  runInThisContext(`(function(require, exports) { ${compiled}; exports.PropsTable = PropsTable; })`)(
    (name: string) => name === 'virtual:storybook-docs/catalog' ? { storySource: '@acme/ui' } : name === 'virtual:storybook-docs/story-sources' ? { loadStorySources: async () => ({ sources: {} }) } : name.startsWith('../') ? { MarkdownView: ({ markdown }: { markdown: string }) => createElement('p', null, markdown) } : require(name), exports,
  );
  const markup = renderToStaticMarkup(createElement(exports.PropsTable!, {
    components: [{ name: 'Widget', props: [
      { name: 'mode', type: '"quiet" | "loud"', required: true, defaultValue: 'null', description: 'Choose a mode.', tags: [{ name: 'deprecated', text: 'Use tone.' }] },
      { name: 'aria-label', type: 'string', required: false, defaultValue: null, description: '', inheritedFrom: 'AriaAttributes' },
    ] }], argTypes: {}, defaultArgs: {},
  }));
  assert.match(markup, /quiet.*loud/);
  assert.match(markup, /required/);
  assert.match(markup, /Deprecated/);
  assert.match(markup, /<code>null<\/code>/);
  assert.match(markup, /<details><summary>Inherited props \(1\)<\/summary>/);
  assert.doesNotMatch(markup, /\[object Object\]|undefined/);
});

test('docgen fallback keeps local children when catalog and component names differ', () => {
  const tables = extract(`
    import type { ReactNode } from 'react';
    export function ActualWidget({ children }: { children?: ReactNode }) { return <div>{children}</div>; }
  `);
  assert.equal(tables[0]?.name, 'ActualWidget');
  assert.equal(tables[0]?.props.find((prop) => prop.name === 'children')?.type, 'ReactNode');
});
