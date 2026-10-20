import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { test } from 'node:test';
import type { ResolvedConfig } from 'vite';
import { storybookDocs, type ComponentPropsDoc } from '../src/vite-plugin.ts';

test('build collection retains indexed-interface slot maps after other families', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'storybook-docs-build-props-'));
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
      const plugin = storybookDocs({ root, config: { site: { title: 'Fixture' }, stories: { from: '.', pattern: '**/*.stories.tsx' } } });
      (plugin.configResolved as (config: ResolvedConfig) => void).call({}, { root, command: 'build' } as ResolvedConfig);
      let components: ComponentPropsDoc[] = [];
      for (const slug of slugs) {
        const code = (plugin.load as (id: string) => string).call({}, `\0virtual:storybook-docs/props/${slug}`);
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
