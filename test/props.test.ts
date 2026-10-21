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
import { createPropsCollector } from '../src/build/props.ts';

test('props follow meta.component through a barrel only when the story folder has no sources', () => {
  const root = mkdtempSync(path.resolve('.props-test-'));
  try {
    for (const folder of ['stories', 'components', 'barrel']) mkdirSync(path.join(root, folder));
    writeFileSync(path.join(root, 'components/Widget.tsx'), 'export function Widget(props: { label: string; count?: number }) { return null; }');
    writeFileSync(path.join(root, 'components/Unrelated.tsx'), 'export function Unrelated(props: { wrong: string }) { return null; }');
    writeFileSync(path.join(root, 'barrel/index.ts'), "export { Widget } from '../components/Widget';");
    const story = path.join(root, 'stories/widget.stories.tsx');
    writeFileSync(story, "import { Widget } from '../barrel'; const meta = { title: 'Forms/Fields/Widget', component: Widget }; export default meta; export const Default = {};");
    const collector = createPropsCollector();
    const separated = collector.collect(story, 'Fields/Widget', 'widget', [], 'Widget').components;
    assert.deepEqual(separated.map(({ name }) => name), ['Widget']);
    assert.deepEqual(separated[0]!.props.map(({ name }) => name).sort(), ['count', 'label']);
    writeFileSync(path.join(root, 'stories/Widget.tsx'), 'export function Widget(props: { local: boolean }) { return null; }');
    const colocated = collector.collect(story, 'Fields/Widget', 'widget', [], 'Widget').components;
    assert.deepEqual(colocated[0]!.props.map(({ name }) => name), ['local']);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

function readConst(code: string, name: string) {
  const marker = `export const ${name} = `;
  const start = code.indexOf(marker);
  if (start < 0) throw new Error(`missing ${name}`);
  let index = start + marker.length;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (; index < code.length; index += 1) {
    const char = code[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === '{' || char === '[') depth += 1;
    else if (char === '}' || char === ']') depth -= 1;
    else if (char === ';' && depth === 0) break;
  }
  return JSON.parse(code.slice(start + marker.length, index));
}

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
    return readConst(code, 'components');
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

test('a mapped slot key carries the comment written above its literal', () => {
  const tables = extract(`
    export interface WidgetPartProps { className?: string }
    export type WidgetSlotProps = Partial<Record<
      | /** Groups the title above the body. */
        'header'
      | /** Holds the widget body. */
        'body',
      WidgetPartProps
    >>;
    export function Widget({ slotProps }: { slotProps?: WidgetSlotProps }) { return null; }
  `);
  const slots = tables[0]!.props.find((prop) => prop.name === 'slotProps')!;
  const described = Object.fromEntries(slots.members?.map((member) => [member.name, member.description]) ?? []);
  assert.deepEqual(described, {
    header: 'Groups the title above the body.',
    body: 'Holds the widget body.',
  });
});

test('single-key inline slot maps retain documented roots with indexed intersection contracts', () => {
  const tables = extract(`
    import type { ComponentPropsWithRef, ComponentType, RefObject } from 'react';
    type ScopeRootProps = ComponentPropsWithRef<'div'> & {
      [attribute: \`data-\${string}\`]: string | number | boolean | undefined;
    };
    interface SxProps { css?: string }
    export interface WidgetProviderProps extends ScopeRootProps, SxProps {
      scopeRef?: RefObject<HTMLElement | null>;
      component?: ComponentType<ScopeRootProps>;
      slots?: {
        /** Replaces the scope root. */
        root?: ComponentType<ScopeRootProps>;
      };
      slotProps?: {
        /** Customizes the scope root. */
        root?: ScopeRootProps & { css?: string };
      };
    }
    function Provider(props: WidgetProviderProps) { return null; }
    export const Widget = Object.assign(() => null, { Provider });
  `);
  const provider = tables.find((table) => table.name === 'Widget.Provider')!;
  for (const [name, description] of [
    ['slots', 'Replaces the scope root.'],
    ['slotProps', 'Customizes the scope root.'],
  ]) {
    const members = provider.props.find((prop) => prop.name === name)?.members;
    assert.equal(members?.length, 1, `${name} expands its single root`);
    assert.equal(members[0]?.name, 'root');
    assert.equal(members[0]?.description, description);
    assert.equal(members[0]?.defaultElement, 'div');
  }
});

test('a slot carries the props its own component declares, and links a foreign contract', () => {
  const tables = extract(`
    import type { ComponentPropsWithRef } from 'react';
    export interface WidgetPartProps { className?: string; css?: string }
    export interface WidgetSlotProps {
      root?: ComponentPropsWithRef<'div'>;
      header?: WidgetPartProps;
    }
    function Root({ slotProps, children }: { slotProps?: WidgetSlotProps; children?: string }) { return null; }
    export const Widget = Object.assign(Root, {});
  `);
  const slots = tables[0]!.props.find((prop) => prop.name === 'slotProps')!;
  const header = slots.members!.find((member) => member.name === 'header')!;
  assert.deepEqual(header.members?.map((member) => member.name).sort(), ['className', 'css']);
  const root = slots.members!.find((member) => member.name === 'root')!;
  assert.equal(root.members, undefined, 'a DOM contract is not restated inline');
});

test('prop types and value imports link other catalog components, not type-only imports', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'storybook-docs-props-'));
  try {
    symlinkSync(path.resolve('node_modules'), path.join(root, 'node_modules'), 'dir');
    const write = (file: string, content: string) => {
      mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
      writeFileSync(path.join(root, file), content);
    };
    write('button/button.tsx', `export interface ButtonProps { label?: string }\nexport function Button(props: ButtonProps) { return null }\n`);
    write('button/button.stories.tsx', "const meta = { title: 'Components/Button', component: Button }; export default meta; export const Default = {};");
    write('drawer/drawer.tsx', `export interface DrawerProps { open?: boolean }\nexport function Drawer(props: DrawerProps) { return null }\n`);
    write('drawer/drawer.stories.tsx', "const meta = { title: 'Components/Drawer', component: Drawer }; export default meta; export const Default = {};");
    write('widget/widget.tsx', `import { Button, type ButtonProps } from '../button/button';\nimport type { DrawerProps } from '../drawer/drawer';\nexport function Widget({ action, slotProps }: { action?: ButtonProps; hidden?: DrawerProps; slotProps?: { icon?: ButtonProps } }) { return <Button />; }\n`);
    write('widget/widget.stories.tsx', "const meta = { title: 'Components/Widget', component: Widget }; export default meta; export const Default = {};");
    const plugin = storybookDocs({ root, config: { site: { title: 'Fixture' }, stories: { from: '.', pattern: '**/*.stories.tsx' } } });
    (plugin.configResolved as (config: ResolvedConfig) => void).call({}, { root } as ResolvedConfig);
    const code = (plugin.load as (id: string) => string).call({}, '\0virtual:storybook-docs/props/widget');
    const components = readConst(code, 'components') as ComponentPropsDoc[];
    const uses = readConst(code, 'uses') as Array<{ name: string; slug: string }>;
    const widget = components.find((table) => table.name === 'Widget')!;
    assert.equal(widget.props.find((prop) => prop.name === 'action')?.component?.slug, 'button');
    assert.equal(widget.props.find((prop) => prop.name === 'hidden')?.component?.slug, 'drawer');
    assert.equal(widget.props.find((prop) => prop.name === 'slotProps')?.members?.find((member) => member.name === 'icon')?.component?.slug, 'button');
    assert.deepEqual(uses, [{ name: 'Button', slug: 'button' }]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('slot defaults link exact component and own props symbols through aliases and wrappers, not shared part types', () => {
  const sharedNames = ['Part', 'Compound', 'Content', 'Trigger', 'Root', 'Common', 'Other'];
  const tables = extract(`
    import type { ComponentType } from 'react';
    import { Button as Action, type ButtonProps as ActionProps, type ButtonSlotProps as ActionSlotProps, type ButtonRootSlotProps as ActionRootSlotProps,
      ${sharedNames.map((name) => `type Button${name}Props`).join(', ')} } from '../button/button';
    export function Widget(props: {
      component?: typeof Action;
      ownProps?: ActionProps;
      ownSlotProps?: ActionSlotProps;
      ownRootSlotProps?: ActionRootSlotProps;
      wrappedComponent?: ComponentType<typeof Action>;
      wrappedProps?: ComponentType<ActionProps>;
      ${sharedNames.map((name) => `shared${name}?: Button${name}Props; wrapped${name}?: ComponentType<Button${name}Props>;`).join('\n')}
    }) { return null; }
  `, {
    'button/button.tsx': `
      export interface ButtonProps { label?: string }
      export interface ButtonSlotProps { icon?: string }
      export interface ButtonRootSlotProps { className?: string }
      export function Button(props: ButtonProps) { return null; }
      ${sharedNames.map((name) => `export interface Button${name}Props { className?: string }`).join('\n')}
    `,
    'button/button.stories.tsx': "const meta = { title: 'Components/Button', component: Button }; export default meta; export const Default = {};",
  });
  const widget = tables.find((table) => table.name === 'Widget')!;
  for (const name of ['component', 'ownProps', 'ownSlotProps', 'ownRootSlotProps', 'wrappedComponent', 'wrappedProps']) {
    const prop = widget.props.find((prop) => prop.name === name);
    assert.ok(prop, name);
    assert.deepEqual(prop.component, { name: 'Button', slug: 'button' }, name);
  }
  for (const suffix of sharedNames) {
    for (const name of [`shared${suffix}`, `wrapped${suffix}`]) {
      const prop = widget.props.find((prop) => prop.name === name);
      assert.ok(prop, name);
      assert.equal(prop.component, undefined, name);
    }
  }
});

test('slot contracts preserve catalog refs through intersection aliases, indexed access and component wrappers', () => {
  const tables = extract(`
    import type { ComponentType, ComponentPropsWithRef } from 'react';
    import type { ButtonRootSlotProps, ButtonPartProps, ButtonProps } from '../button/button';
    interface PanelProps {
      slots?: { root?: ComponentType<ButtonPartProps> };
      slotProps?: { root?: ButtonRootSlotProps };
    }
    interface Props {
      slots?: {
        root?: NonNullable<PanelProps['slots']>['root'];
        wrapped?: ComponentType<ButtonProps>;
        shared?: ComponentType<ButtonPartProps>;
        native?: ComponentType<ComponentPropsWithRef<'span'>>;
      };
      slotProps?: {
        root?: NonNullable<PanelProps['slotProps']>['root'];
        direct?: ButtonRootSlotProps;
        wrapped?: ButtonProps;
      };
    }
    function Local(props: ButtonPartProps) { return null; }
    function Root({ slots = { root: Local, wrapped: Local, native: 'button' } }: Props) { return null; }
    function Panel(props: PanelProps) { return null; }
    export const Widget = Object.assign(Root, { Panel });
  `, {
    'button/button.tsx': `
      export interface ButtonPartProps { className?: string }
      export type ButtonRootSlotProps = Partial<ButtonPartProps> & { css?: string };
      export type ButtonProps = ButtonPartProps & { label?: string };
      export function Button(props: ButtonProps) { return null; }
    `,
    'button/button.stories.tsx': "export default { title: 'Components/Button', component: Button }; export const Default = {};",
  });
  for (const tableName of ['Widget', 'Widget.Panel']) {
    const table = tables.find((table) => table.name === tableName)!;
    for (const name of ['slots', 'slotProps']) {
      const members = table.props.find((prop) => prop.name === name)!.members!;
      const expectedNames = tableName === 'Widget.Panel' ? ['root'] : name === 'slots' ? ['root', 'wrapped'] : ['direct', 'root', 'wrapped'];
      for (const memberName of expectedNames) {
        const member = members.find((member) => member.name === memberName)!;
        assert.deepEqual(member.component, { name: 'Button', slug: 'button' }, `${table.name}.${name}.${member.name}`);
        assert.equal(member.defaultElement, undefined);
      }
    }
  }
  const slots = tables.find((table) => table.name === 'Widget')!.props.find((prop) => prop.name === 'slots')!.members!;
  assert.equal(slots.find((member) => member.name === 'shared')!.component, undefined);
  assert.equal(slots.find((member) => member.name === 'native')!.defaultElement, 'span');
  assert.equal(slots.find((member) => member.name === 'native')!.component, undefined);
});

test('slot member defaults resolve native contracts, wrappers, aliases and uniform unions', () => {
  const tables = extract(`
    import type { ComponentType, ElementType, ComponentPropsWithRef, DetailedHTMLProps, HTMLAttributes } from 'react';
    type ScopeRootProps = ComponentPropsWithRef<'div'> & { [attribute: \`data-\${string}\`]: unknown };
    type Uniform = (HTMLAttributes<HTMLButtonElement> & { primary: true }) | (HTMLAttributes<HTMLButtonElement> & { primary: false });
    export function Widget(props: { slots?: {
      root?: ComponentType<ComponentPropsWithRef<'div'>>;
      button?: ComponentType<DetailedHTMLProps<HTMLAttributes<HTMLButtonElement>, HTMLButtonElement>>;
      indexed?: ComponentType<HTMLAttributes<HTMLElementTagNameMap['section']>>;
      alias?: ElementType<ScopeRootProps>;
      uniform?: ComponentType<Uniform>;
      wrappedUnion?: ComponentType<HTMLAttributes<HTMLSpanElement>> | ElementType<HTMLAttributes<HTMLSpanElement>>;
      dialog?: ComponentType<HTMLAttributes<HTMLDialogElement>>;
      input?: ComponentType<HTMLAttributes<HTMLInputElement>>;
      paragraph?: ComponentType<HTMLAttributes<HTMLParagraphElement>>;
      list?: ComponentType<HTMLAttributes<HTMLOListElement>>;
      heading?: ComponentType<ComponentPropsWithRef<'h3'>>;
      ambiguousHeading?: ComponentType<HTMLAttributes<HTMLHeadingElement>>;
      ambiguous?: ComponentType<HTMLAttributes<HTMLButtonElement> | HTMLAttributes<HTMLDivElement>>;
      partial?: ComponentType<HTMLAttributes<HTMLButtonElement> | { custom: true }>;
      unknown?: ComponentType<{ className?: string }>;
    }; slotProps?: { root?: ComponentPropsWithRef<'div'>; button?: HTMLAttributes<HTMLButtonElement> } }) { return null; }
  `);
  const props = tables[0]!.props;
  const defaults = Object.fromEntries(props.find((prop) => prop.name === 'slots')!.members!.map((member) => [member.name, member.defaultElement]));
  assert.deepEqual(defaults, {
    alias: 'div', ambiguous: undefined, ambiguousHeading: undefined, button: 'button', dialog: 'dialog',
    heading: 'h3', indexed: 'section', input: 'input', list: 'ol', paragraph: 'p', partial: undefined, root: 'div', uniform: 'button', unknown: undefined, wrappedUnion: 'span',
  });
  assert.deepEqual(props.find((prop) => prop.name === 'slotProps')!.members!.map((member) => [member.name, member.defaultElement]), [['button', 'button'], ['root', 'div']]);
});

test('slot member defaults reuse exact foreign contracts and actual shared-part defaults without adding links', () => {
  const tables = extract(`
    import type { ComponentType, ComponentPropsWithRef } from 'react';
    import { Button, ButtonRoot, type ButtonSlotProps } from '../button/button';
    interface ToastPartProps { className?: string }
    interface Slots { item?: ComponentType<ToastPartProps>; toggle?: ComponentType<ToastPartProps>; root?: ComponentType<ToastPartProps>; typed?: ComponentType<ComponentPropsWithRef<'span'>>; contract?: ComponentType<ButtonSlotProps>; dynamic?: ComponentType<ToastPartProps>; local?: ComponentType<ToastPartProps> }
    const Local = () => null;
    const defaults = Object.freeze({ item: 'div', toggle: Button, root: ButtonRoot, typed: 'button', dynamic: choose(), local: Local } satisfies Record<string, unknown>);
    const alias = defaults;
    const defaultSlots = alias;
    function Root({ slots = defaultSlots }: { slots?: Slots; slotProps?: { item?: ToastPartProps; toggle?: ToastPartProps } }) { return null; }
    function Unused(props: { slots?: Slots }) { return null; }
    export const WidgetSlots = defaults;
    function Coalesced({ slots = missing }: { slots?: Slots }) { const actual = slots ?? WidgetSlots; return null; }
    const cycleA = cycleB;
    const cycleB = cycleA;
    function Cyclic({ slots = cycleA }: { slots?: Slots }) { return null; }
    export const Widget = Object.assign(Root, { Unused, Coalesced, Cyclic });
  `, {
    'button/button.tsx': 'export interface ButtonSlotProps { icon?: string } export function Button(props: { className?: string }) { return null; } export const ButtonRoot = Button;',
    'button/button.stories.tsx': "export default { title: 'Components/Button', component: Button }; export const Default = {};",
  });
  const widget = tables.find((table) => table.name === 'Widget')!;
  const slots = widget.props.find((prop) => prop.name === 'slots')!.members!;
  assert.deepEqual(Object.fromEntries(slots.map((member) => [member.name, member.defaultElement])), {
    contract: undefined, dynamic: undefined, item: 'div', local: 'Local', root: undefined, toggle: undefined, typed: 'span',
  });
  for (const name of ['toggle', 'root']) assert.deepEqual(slots.find((member) => member.name === name)!.component, { name: 'Button', slug: 'button' });
  assert.deepEqual(slots.find((member) => member.name === 'contract')!.component, { name: 'Button', slug: 'button' });
  const slotProps = widget.props.find((prop) => prop.name === 'slotProps')!.members!;
  assert.deepEqual(slotProps.map((member) => [member.name, member.defaultElement]), [['item', 'div'], ['toggle', undefined]]);
  assert.deepEqual(slotProps.find((member) => member.name === 'toggle')!.component, { name: 'Button', slug: 'button' });
  assert.equal(tables.find((table) => table.name === 'Widget.Unused')!.props.find((prop) => prop.name === 'slots')!.members!.find((member) => member.name === 'item')!.defaultElement, undefined);
  assert.equal(tables.find((table) => table.name === 'Widget.Coalesced')!.props.find((prop) => prop.name === 'slots')!.members!.find((member) => member.name === 'item')!.defaultElement, 'div');
  assert.equal(tables.find((table) => table.name === 'Widget.Cyclic')!.props.find((prop) => prop.name === 'slots')!.members!.find((member) => member.name === 'item')!.defaultElement, undefined);
});

test('provider-wrapped components collect per-slot body defaults from their private renderer', () => {
  const tables = extract(`
    import type { ComponentType, ComponentPropsWithRef } from 'react';
    import { Button, type ButtonProps } from '../button/button';
    interface ToastPartProps { className?: string }
    interface Slots { root?: ComponentType<ToastPartProps>; list?: ComponentType<ToastPartProps>; toggle?: ComponentType<ButtonProps>; item?: ComponentType<ToastPartProps> }
    interface Props { slots?: Slots; slotProps?: { root?: ToastPartProps; list?: ToastPartProps; toggle?: ButtonProps; item?: ToastPartProps }; component?: ComponentType<ToastPartProps> }
    interface UnrelatedSlots { item?: ComponentType<ToastPartProps> }
    function Unrelated({ slots }: { slots?: UnrelatedSlots }) { const Item = slots?.item ?? 'aside'; return null; }
    function WidgetContent({ slots, slotProps, component, ...props }: Props) {
      const Root = slots?.root ?? component ?? 'div';
      const List = slots?.list ?? 'div';
      const Toggle = slots?.toggle ?? Button;
      const Item = slots?.item ?? 'div';
      return <Root><List><Item /><Toggle /></List></Root>;
    }
    function Provider({ children }: { children?: unknown }) { return null; }
    export function Widget(props: Props) {
      const enabled = true;
      if (!enabled) return null;
      return <Provider><WidgetContent {...props} /></Provider>;
    }
  `, {
    'button/button.tsx': 'export interface ButtonProps { label?: string } export function Button(props: ButtonProps) { return null; }',
    'button/button.stories.tsx': "export default { title: 'Components/Button', component: Button }; export const Default = {};",
  });
  for (const name of ['slots', 'slotProps']) {
    const members = tables[0]!.props.find((prop) => prop.name === name)!.members!;
    assert.deepEqual(Object.fromEntries(members.map((member) => [member.name, member.defaultElement])), { item: 'div', list: 'div', root: 'div', toggle: undefined }, name);
    assert.deepEqual(members.find((member) => member.name === 'toggle')!.component, { name: 'Button', slug: 'button' });
  }
});

test('body slot fallbacks resolve component chains, local parts and imported catalog families', () => {
  const tables = extract(`
    import type { ComponentType, ComponentPropsWithRef } from 'react';
    import { Card, type CardPartProps } from '../card';
    interface PartProps { className?: string }
    interface Slots { root?: ComponentType<PartProps>; title?: ComponentType<PartProps>; surface?: ComponentType<CardPartProps>; typed?: ComponentType<ComponentPropsWithRef<'span'>>; unknown?: ComponentType<PartProps> }
    function CardTitle(props: PartProps) { return null; }
    CardTitle.displayName = 'Widget.Title';
    export function Widget({ slots, component }: { slots?: Slots; slotProps?: { surface?: CardPartProps; title?: PartProps; root?: PartProps }; component?: ComponentType<PartProps> }) {
      const Root = slots?.root ?? component ?? 'div';
      const Title = slots?.title ?? CardTitle;
      const Surface = slots?.surface ?? Card;
      const Typed = slots?.typed ?? 'button';
      const Unknown = slots?.unknown ?? missing;
      return null;
    }
  `, {
    'card/index.ts': "export { Card } from './card'; export type { CardPartProps } from './card';",
    'card/card.tsx': 'export interface CardPartProps { className?: string } export const Card = Object.assign((props: CardPartProps) => null, { Title: (props: CardPartProps) => null });',
    'card/card.stories.tsx': "export default { title: 'Components/Card', component: Card }; export const Default = {};",
  });
  const props = tables[0]!.props;
  assert.deepEqual(Object.fromEntries(props.find((prop) => prop.name === 'slots')!.members!.map((member) => [member.name, member.defaultElement])), { root: 'div', surface: undefined, title: 'Widget.Title', typed: 'span', unknown: undefined });
  for (const name of ['slots', 'slotProps']) {
    const surface = props.find((prop) => prop.name === name)!.members!.find((member) => member.name === 'surface')!;
    assert.deepEqual(surface.component, { name: 'Card', slug: 'card' });
    assert.equal(surface.defaultElement, undefined);
  }
});

test('local slot defaults use their displayName or identifier without a catalog link', () => {
  const tables = extract(`
    import type { ComponentType } from 'react';
    interface PartProps { className?: string }
    interface Slots { part?: ComponentType<PartProps>; unnamed?: ComponentType<PartProps>; root?: ComponentType<PartProps> }
    function WidgetPart(props: PartProps) { return null; }
    WidgetPart.displayName = 'Widget.Part';
    function WidgetUnnamed(props: PartProps) { return null; }
    const defaults = { part: WidgetPart, unnamed: WidgetUnnamed, root: 'div' };
    export function Widget({ slots = defaults }: { slots?: Slots; slotProps?: { part?: PartProps; unnamed?: PartProps; root?: PartProps } }) { return null; }
  `);
  for (const name of ['slots', 'slotProps']) {
    const members = tables[0]!.props.find((prop) => prop.name === name)!.members!;
    assert.deepEqual(Object.fromEntries(members.map((member) => [member.name, member.defaultElement])), { part: 'Widget.Part', root: 'div', unnamed: 'WidgetUnnamed' });
    assert.ok(members.every((member) => member.component === undefined));
  }
});

test('props presentation shows allowed values, JSDoc and compact inherited contracts', () => {
  const require = createRequire(import.meta.url);
  const source = readFileSync(new URL('../src/pages/component-page.tsx', import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const exports: { PropsTable?: (props: { components: ComponentPropsDoc[]; argTypes: Record<string, Record<string, unknown>>; defaultArgs: Record<string, unknown> }) => ReturnType<typeof createElement> } = {};
  const dependencies: Record<string, unknown> = {
    'virtual:storybook-docs/catalog': { storySource: '@acme/ui' },
    'virtual:storybook-docs/decorators': { decorators: [] },
    'virtual:storybook-docs/story-sources': { loadStorySources: async () => ({ sources: {} }) },
    'virtual:storybook-docs/composition': { provided: false, Composition: undefined },
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
  const mainTable = markup.slice(0, markup.indexOf('<details class="api-inherited">'));
  assert.doesNotMatch(mainTable, /<code>aria-label<\/code>|<code>disabled<\/code>/);
  assert.match(markup, /<details class="api-inherited"><summary>Inherited props <span class="count">2<\/span>/);
  assert.match(markup, /<code>aria-label<\/code>/);
  assert.match(markup, /<code>disabled<\/code>/);
  assert.match(markup, /Also accepts the props of .*href="#\/docs\/components\/button".*Button/);
  assert.match(markup, /Also accepts inherited props from .*AriaAttributes/);
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
