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

function extract(source: string, files: Record<string, string> = {}): ComponentPropsDoc[] {
  const root = mkdtempSync(path.join(tmpdir(), 'storybook-docs-props-'));
  try {
    symlinkSync(path.resolve('node_modules'), path.join(root, 'node_modules'), 'dir');
    mkdirSync(path.join(root, 'widget'));
    writeFileSync(path.join(root, 'widget/widget.tsx'), source);
    for (const [file, content] of Object.entries(files)) {
      mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
      writeFileSync(path.join(root, file), content);
    }
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
  const dependencies: Record<string, unknown> = {
    'virtual:storybook-docs/catalog': { storySource: '@acme/ui' },
    'virtual:storybook-docs/story-sources': { loadStorySources: async () => ({ sources: {} }) },
    '../base': { hrefFor: (path: string) => `/docs${path}` },
  };
  runInThisContext(`(function(require, exports) { ${compiled}; exports.PropsTable = PropsTable; })`)(
    (name: string) => dependencies[name] ?? (name.startsWith('../') ? { MarkdownView: ({ markdown }: { markdown: string }) => createElement('p', null, markdown) } : require(name)), exports,
  );
  const markup = renderToStaticMarkup(createElement(exports.PropsTable!, {
    components: [{ name: 'Widget', props: [
      { name: 'mode', type: '"quiet" | "loud"', required: true, defaultValue: 'null', description: 'Choose a mode.', tags: [{ name: 'deprecated', text: 'Use tone.' }] },
      { name: 'aria-label', type: 'string', required: false, defaultValue: null, description: '', inheritedFrom: 'AriaAttributes' },
      { name: 'disabled', type: 'boolean', required: false, defaultValue: null, description: '', inheritedFrom: 'ButtonProps', inheritedComponent: { name: 'Button', slug: 'button' } },
      { name: 'onClose', type: 'CloseHandler', required: false, defaultValue: null, description: '', signatures: [{ type: '(reason: "escape" | "backdrop") => void', parameters: [{ name: 'reason', type: '"escape" | "backdrop"', description: 'Why the dialog closed.' }] }] },
      { name: 'config', type: 'Config', required: false, defaultValue: null, description: '', members: [{ name: 'root', type: 'string', required: false, defaultValue: null, description: '' }] },
      { name: 'opaque', type: 'object', required: false, defaultValue: null, description: '' },
    ] }], argTypes: {}, defaultArgs: {},
  }));
  assert.match(markup, /quiet.*loud/);
  assert.match(markup, /required/);
  assert.match(markup, /Deprecated/);
  assert.match(markup, /<code>null<\/code>/);
  assert.match(markup, /<details><summary>Inherited props \(2\)<\/summary>/);
  assert.match(markup, /Also available from .*href="#\/docs\/components\/button".*Button/);
  assert.doesNotMatch(markup, /components\/aria/);
  assert.match(markup, /class="type signature" tabindex="0".*reason:.*escape.*backdrop.*=&gt; void/);
  assert.match(markup, /Signature details.*Why the dialog closed/);
  assert.match(markup, /Fields <code>\{ root\?: … \}<\/code>/);
  assert.match(markup, /class="type">object<\/code>/);
  assert.doesNotMatch(markup, /\[object Object\]|undefined/);
});

test('callback aliases retain signatures, overloads and documented parameter meaning', () => {
  const tables = extract(`
    interface CloseHandler {
      /** @param reason Why the dialog closed. */
      (reason: 'escape' | 'backdrop'): void;
      (event: { target: string }, reason: 'outside'): void;
    }
    export function Widget(props: { onClose?: CloseHandler; onChange?: (value: number) => void; opaque?: Function }) { return null; }
  `);
  const props = tables[0]!.props;
  const close = props.find((prop) => prop.name === 'onClose')!;
  assert.equal(close.type, 'CloseHandler');
  assert.equal(close.signatures?.length, 2);
  assert.match(close.signatures![0]!.type, /reason:.*escape.*backdrop.*=> void/);
  assert.equal(close.signatures![0]!.parameters[0]!.description, 'Why the dialog closed.');
  assert.match(props.find((prop) => prop.name === 'onChange')?.signatures?.[0]?.type ?? '', /value: number/);
  assert.equal(props.find((prop) => prop.name === 'opaque')?.signatures, undefined);
});

test('object fields preserve shapes without treating primitive union prototypes as fields', () => {
  const tables = extract(`
    interface Config { root?: string; count: number }
    export function Widget(props: { config?: Config; mixed?: string | Config; viewport: { width: number; height: number } }) { return null; }
  `);
  const props = tables[0]!.props;
  assert.deepEqual(props.find((prop) => prop.name === 'config')?.members?.map((member) => [member.name, member.required]), [['count', true], ['root', false]]);
  assert.equal(props.find((prop) => prop.name === 'mixed')?.members, undefined);
  assert.match(props.find((prop) => prop.name === 'viewport')?.type ?? '', /width: number; height: number/);
});

test('callback signatures preserve nullable and explicitly undefined alternatives', () => {
  const tables = extract(`
    type Handler = (value: string) => void;
    export function Widget(props: { nullable?: Handler | null; unset: Handler | undefined; optional?: Handler }) { return null; }
  `);
  const props = tables[0]!.props;
  assert.match(props.find((prop) => prop.name === 'nullable')?.signatures?.[0]?.type ?? '', /\(\(value: string\) => void\) \| null/);
  assert.match(props.find((prop) => prop.name === 'unset')?.signatures?.[0]?.type ?? '', /\| undefined/);
  assert.doesNotMatch(props.find((prop) => prop.name === 'optional')?.signatures?.[0]?.type ?? '', /undefined/);
});

test('inherited component contracts retain source identity and stay separate from own props', () => {
  const tables = extract(`
    import type { ButtonProps } from '../button/button';
    export function Widget(props: ButtonProps & { label: string }) { return null; }
  `, {
    'button/button.tsx': 'export interface ButtonProps { disabled?: boolean } export function Button(props: ButtonProps) { return null; }',
    'button/button.stories.tsx': "export default { title: 'Components/Button', component: Button }; export const Default = {};",
  });
  assert.equal(tables[0]!.props.find((prop) => prop.name === 'disabled')?.inheritedFrom, 'ButtonProps');
  assert.deepEqual(tables[0]!.props.find((prop) => prop.name === 'disabled')?.inheritedComponent, { name: 'Button', slug: 'button' });
  assert.equal(tables[0]!.props.find((prop) => prop.name === 'label')?.inheritedFrom, undefined);
});

test('inheritance links follow compound public contracts, not props-name guesses', () => {
  const tables = extract(`
    import type { PartOptions, ButtonProps } from '../button/button';
    export function Widget(props: PartOptions & ButtonProps) { return null; }
  `, {
    'button/button.tsx': `
      export interface PartOptions { pressed?: boolean }
      export interface ButtonProps { unrelated?: string }
      export const Button = Object.assign(() => null, { Item: (props: PartOptions) => null });
    `,
    'button/button.stories.tsx': "export default { title: 'Components/Button', component: Button }; export const Default = {};",
  });
  assert.deepEqual(tables[0]!.props.find((prop) => prop.name === 'pressed')?.inheritedComponent, { name: 'Button', slug: 'button' });
  assert.equal(tables[0]!.props.find((prop) => prop.name === 'unrelated')?.inheritedComponent, undefined);
});

test('docgen fallback keeps local children when catalog and component names differ', () => {
  const tables = extract(`
    import type { ReactNode } from 'react';
    export function ActualWidget({ children }: { children?: ReactNode }) { return <div>{children}</div>; }
  `);
  assert.equal(tables[0]?.name, 'ActualWidget');
  assert.equal(tables[0]?.props.find((prop) => prop.name === 'children')?.type, 'ReactNode');
});
