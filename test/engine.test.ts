import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { runInThisContext } from 'node:vm';
import { renderToStaticMarkup } from 'react-dom/server';
import { Children, createElement, isValidElement, type ComponentType, type ReactElement, type ReactNode } from 'react';
import ts from 'typescript';
import { matchGlob, storyIdentity } from '../src/scan.ts';
import { buildCatalog, catalogCode, storyImportSpecifier } from '../src/build/catalog.ts';
import { sectionStories, usageSnippet, buildUsageSnippet, selectExample } from '../src/sections.ts';

test('shell brand links to the base-aware overview and follows the skip link', () => {
  const require = createRequire(import.meta.url);
  const compiled = ts.transpileModule(readFileSync(new URL('../src/app.tsx', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports: { DocsApp?: ComponentType } = {};
  const modules: Record<string, unknown> = {
    'virtual:react-storydocs/catalog': { catalog: [{ group: 'Foundations', slug: 'theme', name: 'Theme', load: () => {} }], groups: ['Foundations'], stats: { components: 1, stories: 1 } },
    'virtual:react-storydocs/site': { pages: { color: true }, site: { title: 'Example UI', mark: 'E' }, theme: {} },
    'virtual:react-storydocs/releases': { releases: {} },
    './base': { REACT_STORYDOCS_BASE: 'docs/', hrefFor: (path: string) => `/docs${path}` },
    './docs-theme.js': { DocsThemeContext: { Provider: ({ children }: { children: unknown }) => children } },
    './toc': { hashPath: (hash: string) => hash.slice(1) },
    './story-route': { parseStoryRoute: () => null },
    './search': { SearchBox: () => null },
    './nav-reveal': { revealActiveNavLink: () => {} },
    './pages/overview': { OverviewPage: () => null },
  };
  runInThisContext(`(function(require, exports) { ${compiled}\n})`)((name: string) =>
    modules[name] ?? (name.startsWith('./') ? {} : require(name)), exports);
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { location: { hash: '#/docs/' } } });
  try {
    const html = renderToStaticMarkup(createElement(exports.DocsApp!));
    assert.match(html, /<a class="brand-link" href="#\/docs\/">\s*<span class="mark" aria-hidden="true">E<\/span>\s*<span class="brand">Example UI<\/span><\/a>/);
    assert.ok(html.indexOf('class="skip"') < html.indexOf('<button'), 'skip link precedes every button');
    assert.ok(html.indexOf('class="skip"') < html.indexOf('class="brand-link"'), 'skip link precedes the brand link');
    const groupTitles = [...html.matchAll(/class="grp"[^>]*><span>([^<]+)<\/span>/g)].map((match) => match[1]);
    assert.deepEqual(groupTitles, ['Design tokens', 'Foundations']);
    assert.match(html, /href="#\/docs\/tokens\/color"/);
    assert.match(html, /href="#\/docs\/components\/theme"/);
  } finally {
    if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow);
    else Reflect.deleteProperty(globalThis, 'window');
  }
});

type NavGroupProps = { id: string; title: string; page: string | null; children: ReactNode };
type NavGroupElement = ReactElement<{ children: ReactNode }>;

/** Renders NavGroup like a mounted component: state survives renders and a render-phase update
 * re-renders before the tree is read. */
function navGroupHarness() {
  const require = createRequire(import.meta.url);
  const compiled = ts.transpileModule(readFileSync(new URL('../src/app.tsx', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  let state: unknown;
  let rendering = false;
  let pending = false;
  const exports: { NavGroup?: (props: NavGroupProps) => NavGroupElement } = {};
  runInThisContext(`(function(require, exports) { ${compiled}\nexports.NavGroup = NavGroup; })`)((name: string) => {
    if (name === 'react') return {
      ...require(name),
      useState: (initial: unknown) => {
        state ??= typeof initial === 'function' ? (initial as () => unknown)() : initial;
        const set = (next: unknown) => {
          state = typeof next === 'function' ? (next as (current: unknown) => unknown)(state) : next;
          if (rendering) pending = true;
        };
        return [state, set];
      },
    };
    return name.startsWith('.') || name.startsWith('virtual:') ? {} : require(name);
  }, exports);
  return (props: Omit<NavGroupProps, 'id' | 'title'>) => {
    const full = { id: 'test-group', title: 'Examples', ...props };
    let group: NavGroupElement | undefined;
    rendering = true;
    do {
      pending = false;
      group = exports.NavGroup!(full);
    } while (pending);
    rendering = false;
    return group!;
  };
}

test('nav groups use native keyboard activation and open the group their page belongs to', () => {
  const render = navGroupHarness();
  const read = (page: string | null) => {
    const group = render({ page, children: createElement('a', { href: '#example' }, 'Example') });
    const [button, links] = Children.toArray(group.props.children);
    assert.ok(isValidElement<{ type: string; disabled: boolean; 'aria-expanded': boolean; 'aria-controls': string; onClick: () => void }>(button));
    assert.ok(isValidElement<{ id: string; hidden: boolean }>(links));
    return { button, links };
  };
  const collapsed = read(null);
  assert.equal(collapsed.button.type, 'button', 'Enter and Space use the browser native button activation');
  assert.equal(collapsed.button.props.type, 'button');
  assert.equal(collapsed.links.props.hidden, true);
  assert.equal(collapsed.button.props['aria-controls'], collapsed.links.props.id);
  collapsed.button.props.onClick();
  const expanded = read(null);
  assert.equal(expanded.button.props['aria-expanded'], true);
  assert.equal(expanded.links.props.hidden, false);
  expanded.button.props.onClick();
  const closedAgain = read(null);
  assert.equal(closedAgain.links.props.hidden, true);
  assert.equal(closedAgain.button.props.disabled, undefined);
});

test('a landing page opens its group, survives a route out, and reopens for the next landing', () => {
  const render = navGroupHarness();
  const hidden = (page: string | null) => {
    const group = render({ page, children: createElement('a', { href: '#example' }, 'Example') });
    const links = Children.toArray(group.props.children)[1];
    assert.ok(isValidElement<{ hidden: boolean }>(links));
    return links.props.hidden;
  };
  assert.equal(hidden('button'), false, 'a page the reader navigated to belongs to an open group');
  const group = render({ page: 'button', children: createElement('a', { href: '#example' }, 'Example') });
  const button = Children.toArray(group.props.children)[0];
  assert.ok(isValidElement<{ onClick: () => void }>(button));
  button.props.onClick();
  assert.equal(hidden('button'), true, 'the landing group can also collapse');
  assert.equal(hidden(null), true, "a route outside the group keeps the reader's choice");
  assert.equal(hidden('button-group'), false, 'a new landing reopens a group the reader closed');
});

test('expanded nav groups render every link without a secondary toggle', () => {
  const render = () => navGroupHarness();
  for (let landing = 0; landing < 25; landing++) {
    const group = render()({ page: 'input', children:
      Array.from({ length: 25 }, (_, index) => createElement('a', { key: index, 'aria-current': index === landing ? 'page' : undefined }, index)) });
    const container = Children.toArray(group.props.children)[1];
    assert.ok(isValidElement<{ children: ReactNode; hidden: boolean }>(container));
    const links = Children.toArray(container.props.children).map((link) => {
      assert.ok(isValidElement<{ children: number; 'aria-current'?: string }>(link));
      return link;
    });
    assert.equal(container.props.hidden, false);
    assert.equal(links.length, 25);
    assert.ok(links.some((link) => link.props.children === landing && link.props['aria-current'] === 'page'));
    assert.deepEqual(links.map((link) => link.props.children), Array.from({ length: 25 }, (_, index) => index));
  }
  const collapsed = render()({ page: null, children:
    Array.from({ length: 25 }, (_, index) => createElement('a', { key: index }, index)) });
  const container = Children.toArray(collapsed.props.children)[1];
  assert.ok(isValidElement<{ children: ReactNode; hidden: boolean }>(container));
  assert.equal(container.props.hidden, true);
  assert.equal(Children.count(container.props.children), 25, 'collapsed groups retain every link');
});

test('matchGlob: one segment wildcard', () => {
  assert.equal(matchGlob('src/components/*/*.stories.tsx', 'src/components/button/button.stories.tsx'), true);
  assert.equal(matchGlob('src/components/*/*.stories.tsx', 'src/components/button/nested/button.stories.tsx'), false);
  assert.equal(matchGlob('src/components/*/*.stories.tsx', 'src/components/button/button.tsx'), false);
});

test('storyIdentity: file slugs stay independent of dotted, nested and numbered display titles', () => {
  assert.deepEqual(storyIdentity('/components/next/next.stories.tsx', 'Foundations/Next.js'),
    { group: 'Foundations', name: 'Next.js', slug: 'next' });
  assert.deepEqual(storyIdentity('/components/chart/chart.stories.ts', 'Data/Charts/Chart 2.0'),
    { group: 'Data/Charts', name: 'Chart 2.0', slug: 'chart' });
  assert.deepEqual(storyIdentity('/components/chart2/chart2.stories.jsx', 'Data/Chart2'),
    { group: 'Data', name: 'Chart2', slug: 'chart2' });
  assert.deepEqual(storyIdentity('/components/button/button.stories.tsx', 'Button'),
    { group: 'Components', name: 'Button', slug: 'button' });
});

test('storyImportSpecifier: package names pass through, checkout paths borrow package.json, importFrom wins', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'react-storydocs-import-'));
  try {
    writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: '@acme/ui' }));
    assert.equal(storyImportSpecifier({ from: '@acme/ui', pattern: 'src/**/*.stories.tsx' }, root), '@acme/ui');
    assert.equal(storyImportSpecifier({ from: '.', pattern: 'src/**/*.stories.tsx' }, root), '@acme/ui');
    assert.equal(storyImportSpecifier({ from: '.', pattern: 'src/**/*.stories.tsx', importFrom: '@override/ui' }, root), '@override/ui');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('catalog: dotted titles resolve to their file slug and duplicate filenames fail rather than overwrite', () => {
  const story = { file: '/components/next/next.stories.tsx', facts: { title: 'Foundations/Next.js', stories: ['Default'], hasComponent: false, component: null } };
  const catalog = buildCatalog([story], undefined);
  assert.equal(catalog.entries[0]?.slug, 'next');
  assert.equal(catalog.files.get('next'), story.file);
  assert.match(catalogCode(catalog), /slug: "next", name: "Next\.js"/);
  assert.throws(() => buildCatalog([story, { ...story, file: '/other/next.stories.tsx' }], undefined), /duplicate story slug "next"/);
});

test('selectExample: settled initial snapshots precede interaction-only fallbacks', () => {
  assert.equal(selectExample(['DealAndPlay', 'Light', 'InitialSnapshot', 'ReducedMotion'].map((name) => ({ name }))), 'InitialSnapshot');
  assert.equal(selectExample(['InitialSnapshot', 'Default'].map((name) => ({ name }))), 'Default');
});

test('matchGlob: partial segment wildcard and deep match', () => {
  assert.equal(matchGlob('*.stories.tsx', 'button.stories.tsx'), true);
  assert.equal(matchGlob('**/*.stories.tsx', 'a/b/c/button.stories.tsx'), true);
  assert.equal(matchGlob('src/*.tsx', 'src/a/b.tsx'), false);
});

test('sectionStories: buckets by convention and keeps every story', () => {
  const stories = ['Default', 'Variants', 'Sizes', 'Loading', 'Rtl', 'ForcedColors', 'Keyboard', 'LongContent', 'Reject'];
  const sections = sectionStories(stories);
  const seen = sections.flatMap((section) => section.stories);
  assert.deepEqual([...seen].sort(), [...stories].sort(), 'every story appears exactly once');
  const titles = sections.map((section) => section.title);
  assert.ok(titles.includes('Overview'));
  assert.ok(titles.includes('Environments'), 'Rtl/ForcedColors land in Environments');
  assert.ok(titles.includes('Variants & sizes'));
});

test('sectionStories: displays variants before environments and keeps match priority', () => {
  const sections = sectionStories(['Default', 'DarkVariants', 'Sizes', 'LightTheme', 'Keyboard', 'LongContent', 'Reject', 'Wibble']);
  assert.deepEqual(sections.map((section) => section.title), [
    'Overview',
    'Variants & sizes',
    'Interaction & keyboard',
    'Content & layout',
    'Environments',
    'Edge cases',
    'More stories',
  ]);
  const environments = sections.find((section) => section.title === 'Environments')!;
  assert.ok(environments.stories.includes('DarkVariants'), 'environment match still wins when both patterns match');
  assert.ok(environments.stories.includes('LightTheme'));
  assert.deepEqual(sections.find((section) => section.title === 'Variants & sizes')?.stories, ['Sizes']);
});

test('sectionStories: never loses an unrecognised story', () => {
  const sections = sectionStories(['Wibble', 'Default']);
  assert.equal(sections.flatMap((section) => section.stories).length, 2);
});

test('usageSnippet: preserves authored booleans and omits handlers', () => {
  const snippet = usageSnippet('Button', {
    variant: 'solid',
    size: 'md',
    loading: false,
    disabled: true,
    onClick: () => undefined,
    children: 'Save',
  });
  assert.equal(snippet, '<Button variant="solid" size="md" loading={false} disabled>Save</Button>');
});

test('usageSnippet: unavailable arguments never become a made-up fragment', () => {
  assert.equal(usageSnippet('Button', undefined), null);
  const snippet = usageSnippet('Card', { children: { $$typeof: Symbol('react.element') } });
  assert.equal(snippet, null);
  assert.equal(usageSnippet('Card', {}), null);
  assert.equal(usageSnippet('Card', { onClick: () => undefined }), null);
});

test('selectExample: rich compositions introduce a component before its bare Default', () => {
  assert.equal(selectExample(['Default', 'HighlightedLight', 'Highlighted', 'HighlightedTsx'].map((name) => ({ name }))), 'Highlighted');
  assert.equal(selectExample(['Default', 'Text', 'Circle', 'Card'].map((name) => ({ name }))), 'Card');
});

test('selectExample: Default/Primary then descriptions and showcases, never debug states', () => {
  assert.equal(selectExample(['WithIcons', 'Default', 'Sizes'].map((name) => ({ name }))), 'Default');
  assert.equal(selectExample(['WithIcons', 'Primary'].map((name) => ({ name }))), 'Primary');
  assert.equal(selectExample([{ name: 'Sizes' }, { name: 'Composition', description: 'A complete form.' }]), 'Composition');
  assert.equal(selectExample([{ name: 'Other' }, { name: 'WithIcons' }]), 'WithIcons');
  assert.equal(selectExample([{ name: 'Other' }, { name: 'Demo', description: 'A useful example.' }]), 'Demo');
  assert.equal(selectExample(['Loading', 'Disabled', 'Error', 'RTL', 'ForcedColors', 'KeyboardActivation', 'HighlightFailure'].map((name) => ({ name, description: 'State.' }))), null);
  assert.equal(selectExample([]), null);
});

test('selectExample: overlay anatomy prefers an open showcase over its trigger-only Default', () => {
  const stories = [{ name: 'Default' }, { name: 'CustomPreview', args: { defaultOpen: true } },
    { name: 'PersistentOpen', args: { defaultOpen: true } }];
  assert.equal(selectExample(stories, ['Trigger', 'Content']), 'PersistentOpen');
  assert.equal(selectExample(stories, ['Target', 'Panel']), 'PersistentOpen');
  assert.equal(selectExample(stories, ['Input', 'Popup']), 'PersistentOpen');
  assert.equal(selectExample(stories), 'Default');
  assert.equal(selectExample(stories, ['Trigger']), 'Default');
  assert.equal(selectExample(stories.slice(0, 2), ['Trigger', 'Content']), 'CustomPreview');
  assert.equal(selectExample([{ name: 'Default' }, { name: 'Open' }], ['Trigger', 'Content']), 'Open');
  assert.equal(selectExample([{ name: 'Default' }, { name: 'PlanZeroAndLongIdentity', args: { open: true } },
    { name: 'OpenDesktop', args: { defaultOpen: true } }], ['Trigger', 'Content']), 'OpenDesktop');
});

test('selectExample: open siblings never admit debug states or override explicit closed args', () => {
  const stories = ['ControlledOpen', 'Disabled', 'Error', 'RTL', 'PersistentOpenLight', 'KeyboardOpen',
    'OpenControlled', 'OpenInvalid', 'PersistentOpenKeyboard', 'OutsidePress', 'PlanZero', 'OpenNoDescription']
    .map((name) => ({ name, args: { open: true } }));
  assert.equal(selectExample([{ name: 'Default' }, ...stories], ['Trigger', 'Content']), 'Default');
  assert.equal(selectExample(stories, ['Trigger', 'Content']), null);
  assert.equal(selectExample([{ name: 'Default' }, { name: 'Open', args: { open: false } }], ['Trigger', 'Content']), 'Default');
  assert.equal(selectExample([{ name: 'Default' }, { name: 'Persistent', args: { defaultOpen: false } }], ['Trigger', 'Content']), 'Default');
  assert.equal(selectExample([{ name: 'Default' }, { name: 'OpenOnClickOptIn' }], ['Trigger', 'Content']), 'Default');
  assert.equal(selectExample([{ name: 'Default' }, { name: 'Open', args: { defaultOpen: true, open: false } }], ['Trigger', 'Content']), 'Default');
  assert.equal(selectExample([{ name: 'Default' }, { name: 'First', args: { open: true } },
    { name: 'Second', args: { open: true } }], ['Trigger', 'Content']), 'First');
});

test('selectExample: list anatomy and single-widget open callbacks identify hidden surfaces', () => {
  const onOpenChange = () => undefined;
  assert.equal(selectExample([{ name: 'Composition' }, { name: 'Open', args: { defaultOpen: true } }],
    ['Input', 'List', 'Item']), 'Open');
  assert.equal(selectExample([{ name: 'Default', args: { onOpenChange } },
    { name: 'PersistentOpen', args: { onOpenChange, open: true } }], ['displayName']), 'PersistentOpen');
  assert.equal(selectExample([{ name: 'Composition' },
    { name: 'PersistentOpen', args: { onOpenChange, defaultOpen: true } }]), 'PersistentOpen');
  assert.equal(selectExample([{ name: 'Default' }, { name: 'PersistentOpen', args: { open: true } }]), 'Default');
  assert.equal(selectExample([{ name: 'Default' }, { name: 'PersistentOpen', args: { onOpenChange } }]), 'Default');
});

test('selectExample: single-widget open signals preserve state and explicit-closed exclusions', () => {
  const onOpenChange = () => undefined;
  assert.equal(selectExample([{ name: 'Default' },
    ...['DisabledOpen', 'ControlledOpen', 'PersistentOpenLight', 'OpenSelected', 'OpenError']
      .map(name => ({ name, args: { onOpenChange, open: true } }))]), 'Default');
  assert.equal(selectExample([{ name: 'Default' },
    { name: 'PersistentOpen', args: { onOpenChange, defaultOpen: true, open: false } }]), 'Default');
  assert.equal(selectExample([{ name: 'Default' },
    { name: 'PersistentOpen', args: { onOpenChange, open: true } }], [], { defaultOpen: true }), 'Default');
  assert.equal(selectExample([{ name: 'Default' },
    { name: 'PersistentOpen', args: { onOpenChange, open: true } }], [], null), 'Default');
  assert.equal(selectExample([{ name: 'Default', args: { open: true } },
    { name: 'PersistentOpen', args: { onOpenChange, open: true } }]), 'Default');
  for (const name of ['Expanded', 'PersistentExpanded', 'PersistentViewer', 'NullSelection']) {
    assert.equal(selectExample([{ name: 'Highlighted' },
      { name, args: { onOpenChange, open: true } }]), 'Highlighted');
  }
});

test('selectExample: notification duration and Persistent names cannot manufacture a populated queue', () => {
  const stories = [{ name: 'Default', args: { dismissLabel: 'Close notification' } },
    { name: 'Persistent', args: { duration: null } }];
  assert.equal(selectExample(stories, ['Provider', 'Viewport']), 'Default');
  assert.equal(selectExample([{ name: 'Default' }, { name: 'PersistentStack' }]), 'Default');
});

test('selectExample: opaque widgets do not treat interaction-dependent open permission as visible content', () => {
  const onOpenChange = () => undefined;
  const persistent = { name: 'PersistentOpen', args: { onOpenChange, open: true } };
  const interaction = { ...persistent, play: async ({ userEvent }: { userEvent: { click: () => void } }) => userEvent.click() };
  assert.equal(selectExample([{ name: 'Composition' }, interaction]), 'Composition');
  assert.equal(selectExample([{ name: 'Default' }, { ...persistent,
    play: ({ fireEvent }: { fireEvent: { select: () => void } }) => fireEvent.select() }]), 'Default');
  assert.equal(selectExample([{ name: 'Default' }, { ...persistent, play: () => assert.ok(true) }]), 'PersistentOpen');
  assert.equal(selectExample([{ name: 'Default' }, interaction], ['Trigger', 'Content']), 'PersistentOpen');
});

test('selectExample: stable ties and moving the selection keep each story once', () => {
  const stories = ['Loading', 'Sizes', 'WithIcons', 'Other'];
  const chosen = selectExample(stories.map((name) => ({ name })));
  assert.equal(chosen, 'Sizes');
  const remaining = sectionStories(stories.filter((name) => name !== chosen)).flatMap((section) => section.stories);
  assert.deepEqual([chosen, ...remaining].sort(), [...stories].sort());
});

test('buildUsageSnippet: root import and a complete args-derived example', () => {
  assert.equal(buildUsageSnippet({ componentName: 'Button', from: '@acme/ui', args: { variant: 'solid', children: 'Save' } }),
    "import { Button } from '@acme/ui';\n\n<Button variant=\"solid\">Save</Button>");
  assert.equal(buildUsageSnippet({ componentName: 'Skeleton', from: '@acme/ui', args: { width: 240, height: 16 } }),
    "import { Skeleton } from '@acme/ui';\n\n<Skeleton width={240} height={16} />");
  assert.equal(buildUsageSnippet({ componentName: 'Dialog.Content', from: '@acme/ui', args: { children: 'Hello' } }),
    "import { Dialog } from '@acme/ui';\n\n<Dialog.Content>Hello</Dialog.Content>");
  assert.equal(buildUsageSnippet({ componentName: 'Dialog', jsxName: 'Dialog.Content', from: '@acme/ui', args: { children: 'Hello' } }),
    "import { Dialog } from '@acme/ui';\n\n<Dialog.Content>Hello</Dialog.Content>");
  assert.equal(buildUsageSnippet({ componentName: 'Dialog', component: { displayName: 'Dialog.Content' }, from: '@acme/ui', args: { children: 'Hello' } }),
    "import { Dialog } from '@acme/ui';\n\n<Dialog.Content>Hello</Dialog.Content>");
});

test('buildUsageSnippet: a render that only spreads args yields the named arguments', () => {
  assert.equal(
    buildUsageSnippet({ componentName: 'Button', from: '@acme/ui', renderSource: '<Button {...args} data-ui="custom" />', args: { children: 'Save', tone: 'accent' } }),
    "import { Button } from '@acme/ui';\n\n<Button tone=\"accent\">Save</Button>",
  );
  // A composition the arguments cannot describe still keeps its own extracted source.
  assert.equal(
    buildUsageSnippet({ componentName: 'Button', from: '@acme/ui', renderSource: '<div>{TONES.map((tone) => <Button tone={tone} />)}</div>', args: { children: 'Save' } }),
    '<div>{TONES.map((tone) => <Button tone={tone} />)}</div>',
  );
});

test('buildUsageSnippet: compound root args do not invent its missing anatomy', () => {
  const component = Object.assign(() => null, { List: () => null, Panel: () => null });
  assert.equal(buildUsageSnippet({ componentName: 'Tabs', component, from: '@acme/ui', args: { defaultValue: 'one' } }), null);
  assert.equal(buildUsageSnippet({ componentName: 'Tabs', component, from: '@acme/ui', source: '<Tabs><Tabs.Panel value="one">One</Tabs.Panel></Tabs>' }),
    "import { Tabs } from '@acme/ui';\n\n<Tabs><Tabs.Panel value=\"one\">One</Tabs.Panel></Tabs>");
});

test('buildUsageSnippet: preserves authored compound JSX, helper imports and existing imports', () => {
  const source = "import { helper } from '@acme/ui/helper';\n\n<Dialog><Dialog.Content>Hello</Dialog.Content></Dialog>";
  assert.equal(buildUsageSnippet({ componentName: 'Dialog', from: '@acme/ui', source }), "import { Dialog } from '@acme/ui';\n\n" + source);
  const imported = 'import { Dialog, Button } from "@acme/ui";\n<Dialog.Content>Hello</Dialog.Content>';
  assert.equal(buildUsageSnippet({ componentName: 'Dialog', from: '@acme/ui', source: imported }), imported);
  assert.equal(buildUsageSnippet({ componentName: 'Button', from: '@acme/ui', source: '<Button>Authored</Button>', args: { children: 'Args' } }),
    "import { Button } from '@acme/ui';\n\n<Button>Authored</Button>");
  assert.equal(buildUsageSnippet({ componentName: 'Dialog', from: '@acme/ui' }), null);
});

test('usageSnippet: escapes JSX, keeps JSON props and rejects unrepresentable values', () => {
  assert.equal(usageSnippet('Input', { label: '"quoted" & <tag>', children: '{hello}' }), '<Input label={"\\"quoted\\" & <tag>"}>{"{hello}"}</Input>');
  assert.equal(usageSnippet('Input', { inputProps: { readOnly: true }, value: 0, optional: null }), '<Input inputProps={{"readOnly":true}} value={0} optional={null} />');
  assert.equal(usageSnippet('Table', { columns: [{ accessor: () => 1 }] }), null);
  assert.equal(usageSnippet('Input', { value: Number.NaN }), null);
  const cyclic: Record<string, unknown> = {};
  cyclic.self = cyclic;
  assert.equal(usageSnippet('Input', { options: cyclic }), null);
});

test('usageSnippet: children null renders nothing, so it never becomes a {null} fragment', () => {
  assert.equal(usageSnippet('Deck', { children: null }), null);
  assert.equal(usageSnippet('DialogStack', { children: null, open: true }), '<DialogStack open />');
  assert.equal(usageSnippet('Card', { children: 'Save' }), '<Card>Save</Card>');
});

test('buildUsageSnippet: an entry whose subject is not the page name owns its imports', () => {
  // Games/Deck is backed by DeckProvider: the page name is not an exported component, so the
  // authored snippet must survive untouched instead of getting an invented `import { Deck }`.
  const provider = "import { DeckProvider, defineDeck } from '@jfrader/ui';\n\n<DeckProvider decks={[myDeck]} default=\"spanish\">{children}</DeckProvider>";
  assert.equal(buildUsageSnippet({ componentName: 'Deck', from: '@jfrader/ui', source: provider, args: { children: null } }), provider);
  // A component page keeps the convenience import, with or without its own helper imports.
  assert.equal(buildUsageSnippet({ componentName: 'Button', from: '@acme/ui', source: '<Button>Save</Button>' }),
    "import { Button } from '@acme/ui';\n\n<Button>Save</Button>");
  const helper = "import { helper } from '@acme/ui/helper';\n\n<Dialog><Dialog.Content>Hello</Dialog.Content></Dialog>";
  assert.equal(buildUsageSnippet({ componentName: 'Dialog', from: '@acme/ui', source: helper }),
    "import { Dialog } from '@acme/ui';\n\n" + helper);
});

test('buildUsageSnippet: authored snippet importing root from a subpath or root owns its imports without duplicates', () => {
  // 1. Snippet autorado que importa el símbolo raíz desde un subpath de `from` -> sin cambios, sin segundo import
  const subpathSnippet = "import { GameCard } from '@jfrader/ui/game-card';\n\n<GameCard rank=\"A\" suit=\"spades\" />";
  assert.equal(buildUsageSnippet({ componentName: 'GameCard', from: '@jfrader/ui', source: subpathSnippet }), subpathSnippet);

  const multiSubpath = "import { GameCard, Suit } from '@jfrader/ui/game-card';\n\n<GameCard rank=\"A\" suit=\"spades\" />";
  assert.equal(buildUsageSnippet({ componentName: 'GameCard', from: '@jfrader/ui', source: multiSubpath }), multiSubpath);

  // 2. Snippet autorado que lo importa desde el root (`from`) -> sin cambios
  const rootSnippet = "import { GameCard } from '@jfrader/ui';\n\n<GameCard rank=\"A\" suit=\"spades\" />";
  assert.equal(buildUsageSnippet({ componentName: 'GameCard', from: '@jfrader/ui', source: rootSnippet }), rootSnippet);

  // 3. Ejemplo sin imports -> el motor antepone el import generado
  const noImportSnippet = '<GameCard rank="A" suit="spades" />';
  assert.equal(buildUsageSnippet({ componentName: 'GameCard', from: '@jfrader/ui', source: noImportSnippet }),
    "import { GameCard } from '@jfrader/ui';\n\n<GameCard rank=\"A\" suit=\"spades\" />");

  // 4. Extracto del `render` de la historia -> antepone el import generado
  assert.equal(buildUsageSnippet({ componentName: 'GameCard', from: '@jfrader/ui', renderSource: '<GameCard {...args} />' }),
    "import { GameCard } from '@jfrader/ui';\n\n<GameCard {...args} />");

  // 5. Los recaudos que ya existen siguen
  // Sujeto que es un provider/compound sin anatomía
  const compound = Object.assign(() => null, { Header: () => null });
  assert.equal(buildUsageSnippet({ componentName: 'Tabs', component: compound, from: '@jfrader/ui', args: { defaultValue: 'one' } }), null);

  // rootTag !== rootName
  const provider = "import { GameCardProvider } from '@jfrader/ui/game-card';\n\n<GameCardProvider><GameCard /></GameCardProvider>";
  assert.equal(buildUsageSnippet({ componentName: 'GameCard', from: '@jfrader/ui', source: provider }), provider);

  // from vacío
  assert.equal(buildUsageSnippet({ componentName: 'GameCard', from: '', source: '<GameCard />' }), '<GameCard />');
  assert.equal(buildUsageSnippet({ componentName: 'GameCard', from: '   ', renderSource: '<GameCard {...args} />' }), '<GameCard {...args} />');
});
