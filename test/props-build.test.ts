import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { test } from 'node:test';
import type { ResolvedConfig } from 'vite';
import { reactStorydocs, type ComponentPropsDoc } from '../src/vite-plugin.ts';
import { createPropsCollector } from '../src/build/props.ts';

test('build collection retains indexed-interface slot maps after other families', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'react-storydocs-build-props-'));
  try {
    symlinkSync(path.resolve('node_modules'), path.join(root, 'node_modules'), 'dir');
    const fixtures: [string, string, string][] = [
      ['button', 'Button', 'export function Button(props: { label?: string }) { return null; }'],
      ['card', 'Card', 'export function Card(props: { title?: string }) { return null; }'],
      ['widget', 'Widget', `
        import type { ComponentPropsWithRef, ComponentType } from 'react';
        type RootProps = ComponentPropsWithRef<'div'> & {
          [attribute: \`data-\${string}\`]: string | number | boolean | undefined;
        };
        type Interpolation<T> = string | T;
        interface SxProps { css?: Interpolation<unknown> }
        export interface WidgetProps extends RootProps, SxProps {
          slots?: {
            /** Replaces the widget root. */
            root?: ComponentType<RootProps>;
          };
          slotProps?: {
            /** Customizes the widget root. */
            root?: RootProps & { css?: Interpolation<unknown> };
          };
        }
        /** Provides the widget. */
        export function WidgetProvider(props: WidgetProps) { return null; }
        export namespace WidgetProvider {
          /** Renders widget content. */
          export function Content(props: { label?: string }) { return null; }
        }
      `],
    ];
    for (const [slug, name, source] of fixtures) {
      mkdirSync(path.join(root, slug));
      writeFileSync(path.join(root, slug, `${slug}.tsx`), source);
      writeFileSync(path.join(root, slug, `${slug}.stories.tsx`), `const meta = { title: 'Components/${name}', component: ${name === 'Widget' ? 'WidgetProvider' : name} }; export default meta; export const Default = {};`);
    }
    const collect = (slugs: string[]) => {
      const plugin = reactStorydocs({ root, config: { site: { title: 'Fixture' }, stories: { from: '.', pattern: '**/*.stories.tsx' } } });
      (plugin.configResolved as (config: ResolvedConfig) => void).call({}, { root, command: 'build' } as ResolvedConfig);
      let components: ComponentPropsDoc[] = [];
      for (const slug of slugs) {
        const code = (plugin.load as (id: string) => string).call({}, `\0virtual:react-storydocs/props/${slug}`);
        components = JSON.parse(code.match(/export const components = (.*);/)![1]!);
      }
      assert.equal(components.find((component) => component.name === 'WidgetProvider')?.description, 'Provides the widget.');
      assert.equal(components.find((component) => component.name === 'WidgetProvider.Content')?.description, 'Renders widget content.');
      return components.find((component) => component.name === 'WidgetProvider')!;
    };
    for (const slugs of [['widget'], ['button', 'card', 'widget']]) {
      const widget = collect(slugs);
      for (const [name, description] of [
        ['slots', 'Replaces the widget root.'],
        ['slotProps', 'Customizes the widget root.'],
      ]) {
        const members = widget.props.find((prop) => prop.name === name)?.members;
        assert.deepEqual(members?.map((member) => ({ name: member.name, description: member.description })), [{ name: 'root', description }], `${slugs.join(' → ')}: ${name}`);
      }
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('Object.assign parts resolve function JSDoc through property initializers and import aliases, and infer native elements', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'react-storydocs-compound-props-'));
  try {
    symlinkSync(path.resolve('node_modules'), path.join(root, 'node_modules'), 'dir');
    writeFileSync(path.join(root, 'parts.tsx'), `
      import type { ComponentPropsWithRef, Ref } from 'react';
      /** Displays dialog content. */
      export function DialogContent(props: ComponentPropsWithRef<'dialog'>) { return null; }
      /** Opens the dialog. */
      export function DialogTrigger(props: { ref?: Ref<HTMLButtonElement>; disabled?: boolean }) { return null; }
    `);
    writeFileSync(path.join(root, 'dialog.tsx'), `
      import type { ComponentProps, Ref } from 'react';
      import { DialogContent, DialogTrigger as TriggerAlias } from './parts';
      function DialogRoot(props: { open?: boolean }) { return null; }
      function DialogClose(props: ComponentProps<'button'> & { ref?: never }) { return null; }
      function Ambiguous(props: { ref?: Ref<HTMLButtonElement | HTMLDialogElement> }) { return null; }
      /** Controls a dialog. */
      export const Dialog = Object.assign(DialogRoot, { Content: DialogContent, Trigger: TriggerAlias, Close: DialogClose, Ambiguous });
    `);
    const components = createPropsCollector().collect(path.join(root, 'dialog.stories.tsx'), 'Dialog', 'dialog').components;
    const part = (name: string) => components.find((component) => component.name === name);
    assert.equal(part('Dialog')?.description, 'Controls a dialog.');
    assert.equal(part('Dialog.Content')?.description, 'Displays dialog content.');
    assert.equal(part('Dialog.Trigger')?.description, 'Opens the dialog.');
    assert.equal(part('Dialog.Content')?.native, 'dialog');
    assert.equal(part('Dialog.Trigger')?.native, 'button');
    assert.equal(part('Dialog.Close')?.native, 'button');
    assert.equal(part('Dialog.Ambiguous')?.native, undefined);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('overloaded generic components expose type parameters, overload ownership, element fields and family defaults', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'react-storydocs-generic-props-'));
  try {
    symlinkSync(path.resolve('node_modules'), path.join(root, 'node_modules'), 'dir');
    writeFileSync(path.join(root, 'choice.tsx'), `
      import type { ReactNode } from 'react';
      export interface Choice<V extends string = string> { value: V; label: ReactNode; disabled?: boolean }
      interface ChoiceOptionsProps<V extends string = string> {
        options: readonly Choice<V>[];
        value?: NoInfer<V>;
        onValueChange?: (value: V) => void;
        size?: 'sm' | 'md';
        children?: never;
        slots?: never;
      }
      interface ChoiceComposedProps { options?: never; children?: ReactNode; slots?: { root?: ReactNode } }
      export interface ChoiceComponent {
        <V extends string = string>(props: ChoiceOptionsProps<V>): null;
        (props: ChoiceComposedProps): null;
      }
      function ChoiceRoot(props: unknown) { return null; }
      function ChoicePart({ size = 'md' }: { size?: 'sm' | 'md' }) { return size ? null : null; }
      export const Choice = ChoiceRoot as ChoiceComponent;
      void ChoicePart;
    `);
    writeFileSync(path.join(root, 'choice.stories.tsx'), `const meta = { title: 'Components/Choice', component: Choice }; export default meta; export const Default = {};`);
    const components = createPropsCollector().collect(path.join(root, 'choice.stories.tsx'), 'Choice', 'choice').components;
    const choice = components.find((component) => component.name === 'Choice');
    assert.ok(choice);
    assert.deepEqual(choice.typeParameters, [{ name: 'V', constraint: 'string', default: 'string' }]);
    const prop = (name: string) => choice.props.find((item) => item.name === name);
    assert.equal(prop('value')?.type, 'V');
    assert.equal(prop('onValueChange')?.type, '(value: V) => void');
    assert.equal(prop('size')?.defaultValue, '"md"');
    assert.deepEqual(prop('options')?.element?.members.map((member) => member.name).sort(), ['disabled', 'label', 'value']);
    assert.equal(prop('options')?.signature, 0);
    assert.equal(prop('children')?.signature, 1);
    assert.equal(prop('children')?.type, 'ReactNode');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('slot props members expand when their contract lives beside the component', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'react-storydocs-slot-members-'));
  try {
    symlinkSync(path.resolve('node_modules'), path.join(root, 'node_modules'), 'dir');
    writeFileSync(path.join(root, 'parts.tsx'), `export interface PartProps { className?: string; sx?: string }`);
    writeFileSync(path.join(root, 'widget.tsx'), `
      import type { ComponentType } from 'react';
      import type { PartProps } from './parts';
      export interface WidgetProps { slotProps?: { resolved?: PartProps }; slots?: { resolved?: ComponentType<PartProps> } }
      export function Widget(props: WidgetProps) { return null; }
    `);
    writeFileSync(path.join(root, 'widget.stories.tsx'), `const meta = { title: 'Components/Widget', component: Widget }; export default meta; export const Default = {};`);
    const widget = createPropsCollector().collect(path.join(root, 'widget.stories.tsx'), 'Widget', 'widget').components.find((component) => component.name === 'Widget');
    const slot = widget?.props.find((prop) => prop.name === 'slotProps')?.members?.find((member) => member.name === 'resolved');
    assert.equal(slot?.type, 'PartProps');
    assert.deepEqual(slot?.members?.map((member) => member.name).sort(), ['className', 'sx']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('signature object parameters expose their fields', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'react-storydocs-signature-members-'));
  try {
    symlinkSync(path.resolve('node_modules'), path.join(root, 'node_modules'), 'dir');
    writeFileSync(path.join(root, 'widget.tsx'), `
      export interface WidgetDetails { currency: string; formatted: string }
      export interface WidgetProps { onValueChange?: (value: number, details: WidgetDetails) => void }
      export function Widget(props: WidgetProps) { return null; }
    `);
    writeFileSync(path.join(root, 'widget.stories.tsx'), `const meta = { title: 'Components/Widget', component: Widget }; export default meta; export const Default = {};`);
    const widget = createPropsCollector().collect(path.join(root, 'widget.stories.tsx'), 'Widget', 'widget').components.find((component) => component.name === 'Widget');
    const parameter = widget?.props.find((prop) => prop.name === 'onValueChange')?.signatures?.[0]?.parameters.find((item) => item.name === 'details');
    assert.equal(parameter?.type, 'WidgetDetails');
    assert.deepEqual(parameter?.members?.map((member) => member.name).sort(), ['currency', 'formatted']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('nested member fields drop external DOM and React props', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'react-storydocs-native-members-'));
  try {
    symlinkSync(path.resolve('node_modules'), path.join(root, 'node_modules'), 'dir');
    writeFileSync(path.join(root, 'widget.tsx'), `
      import type { ButtonHTMLAttributes } from 'react';
      export interface WidgetRenderProps extends ButtonHTMLAttributes<HTMLButtonElement> { ref?: string; 'data-ui'?: string }
      export interface WidgetProps { render?: (props: WidgetRenderProps) => unknown }
      export function Widget(props: WidgetProps) { return null; }
    `);
    writeFileSync(path.join(root, 'widget.stories.tsx'), `const meta = { title: 'Components/Widget', component: Widget }; export default meta; export const Default = {};`);
    const widget = createPropsCollector().collect(path.join(root, 'widget.stories.tsx'), 'Widget', 'widget').components.find((component) => component.name === 'Widget');
    const parameter = widget?.props.find((prop) => prop.name === 'render')?.signatures?.[0]?.parameters[0];
    assert.deepEqual(parameter?.members?.map((member) => member.name).sort(), ['data-ui', 'ref']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('local array element records expose their fields', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'react-storydocs-array-members-'));
  try {
    symlinkSync(path.resolve('node_modules'), path.join(root, 'node_modules'), 'dir');
    writeFileSync(path.join(root, 'widget.tsx'), `
      export interface WidgetRecord { id: string; label: string }
      export interface WidgetProps { records?: readonly WidgetRecord[] }
      export function Widget(props: WidgetProps) { return null; }
    `);
    writeFileSync(path.join(root, 'widget.stories.tsx'), `const meta = { title: 'Components/Widget', component: Widget }; export default meta; export const Default = {};`);
    const widget = createPropsCollector().collect(path.join(root, 'widget.stories.tsx'), 'Widget', 'widget').components.find((component) => component.name === 'Widget');
    assert.equal(widget?.props.find((prop) => prop.name === 'records')?.element?.type, 'WidgetRecord');
    assert.deepEqual(widget?.props.find((prop) => prop.name === 'records')?.element?.members.map((member) => member.name).sort(), ['id', 'label']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('public type names carry a declaration source reference', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'react-storydocs-type-refs-'));
  const widgetDir = path.join(root, 'packages', 'ui', 'src');
  try {
    mkdirSync(widgetDir, { recursive: true });
    symlinkSync(path.resolve('node_modules'), path.join(root, 'node_modules'), 'dir');
    writeFileSync(path.join(widgetDir, 'widget.tsx'), `
      export interface WidgetDetails { currency: string }
      export interface WidgetProps { details?: WidgetDetails; label?: string }
      export function Widget(props: WidgetProps) { return null; }
    `);
    writeFileSync(path.join(widgetDir, 'widget.stories.tsx'), `const meta = { title: 'Components/Widget', component: Widget }; export default meta; export const Default = {};`);
    const widget = createPropsCollector().collect(path.join(widgetDir, 'widget.stories.tsx'), 'Widget', 'widget').components.find((component) => component.name === 'Widget');
    const details = widget?.props.find((prop) => prop.name === 'details')?.typeRefs?.find((ref) => ref.name === 'WidgetDetails');
    assert.ok(details?.source);
    assert.match(details.source.file, /packages\/ui\/src\/widget\.tsx$/);
    assert.equal(typeof details.source.line, 'number');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
