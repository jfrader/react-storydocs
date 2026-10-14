import assert from 'node:assert/strict';
import { test } from 'node:test';
import { extractStorySources, extractStorySourceDetails } from '../src/build/story-sources.ts';
import { buildUsageSnippet } from '../src/sections.ts';

test('extracts verbatim JSX from object renders, functions and fragments', () => {
  assert.deepEqual(extractStorySources(`
export const Default: Story = { render: (args) => (<Dialog {...args}>\n  <Dialog.Close>Close</Dialog.Close>\n</Dialog>) } satisfies Story;
export const Function = function (args) { return <Button {...args} />; };
export function Fragment() { return <><Button /><span>Text</span></>; }
export const Method = { render(args) { return <Button {...args}>Go</Button>; } };
`), {
    Default: '<Dialog {...args}>\n  <Dialog.Close>Close</Dialog.Close>\n</Dialog>',
    Function: '<Button {...args} />',
    Fragment: '<><Button /><span>Text</span></>',
    Method: '<Button {...args}>Go</Button>',
  });
});

test('ignores args-only stories, play JSX, helper calls and nested function returns', () => {
  assert.deepEqual(extractStorySources(`
export const Args = { args: { children: 'Go' } };
export const Play = { play: () => <Button />, render: () => null };
export const Helper = { render: (args) => helper(args) };
export const Nested = { render: () => { const child = () => { return <Button />; }; return child(); } };
`), {});
});

test('preserves conditional expressions and marks multiple return branches without evaluating args', () => {
  assert.deepEqual(extractStorySources(`
export const Conditional = { render: (args) => args.open ? <Open {...args} /> : <Closed /> };
export const Branches = { render: (args) => { switch (args.mode) { case 'a': return <A />; default: return <B />; } } };
`), {
    Conditional: 'args.open ? <Open {...args} /> : <Closed />',
    Branches: '// JSX return branches as authored in the story.\n<A />\n\n<B />',
  });
});

test('resolves local render references, aliases and spreads with last-property precedence', () => {
  assert.deepEqual(extractStorySources(`
const Template = (args) => <Button {...args} />;
const Original = { render: Template };
export { Original as Alias };
export const Inherited = { ...Original, args: { disabled: true } };
export const Override = { ...Original, render: () => <Other /> };
export const LastSpread = { render: () => <Other />, ...Original };
export const RenderReference = { render: Original.render };
export const BracketReference = { render: Original['render'] };
export const Empty = { ...Original, render: undefined };
const Suppressed = { render: undefined };
export const EmptySpread = { ...Original, ...Suppressed };
const Cycle = { ...Cycle };
export const Circular = { ...Cycle };
`), {
    Alias: '<Button {...args} />', Inherited: '<Button {...args} />',
    Override: '<Other />', LastSpread: '<Button {...args} />',
    RenderReference: '<Button {...args} />', BracketReference: '<Button {...args} />',
  });
});

test('frame source precedence keeps authored code, then render JSX, then args; page usage is unchanged', () => {
  const options = { componentName: 'Button', from: '@fixture/ui', args: { children: 'Go' }, renderSource: '<Fixture {...args} />' };
  assert.equal(buildUsageSnippet({ ...options, source: "import { Button } from '@fixture/ui';\n<Button>Authored</Button>" }),
    "import { Button } from '@fixture/ui';\n<Button>Authored</Button>");
  assert.equal(buildUsageSnippet(options), '<Fixture {...args} />');
  assert.equal(buildUsageSnippet({ ...options, source: '  ' }), '<Fixture {...args} />');
  assert.equal(buildUsageSnippet({ ...options, renderSource: undefined }), "import { Button } from '@fixture/ui';\n\n<Button>Go</Button>");
  assert.equal(buildUsageSnippet({ componentName: 'Button', from: '@fixture/ui' }), null);
});

test('inlines same-file function and const root helpers, keeping helper JSX and arguments literal', () => {
  const source = `
function DialogExample(props) { return <Dialog {...props} defaultOpen><Dialog.Content>{props.children}</Dialog.Content></Dialog>; }
const MenuExample = (args) => <Menu {...args}><Menu.Content>Open</Menu.Content></Menu>;
export const DialogStory = { render: (args) => <DialogExample {...args} /> };
export const MenuStory = { render: (args) => <MenuExample {...args} /> };
export const ArgsOnly = { args: { children: 'Open' } };
`;
  assert.deepEqual(extractStorySources(source), {
    DialogStory: '// JSX from DialogExample, as authored.\n<Dialog {...props} defaultOpen><Dialog.Content>{props.children}</Dialog.Content></Dialog>',
    MenuStory: '// JSX from MenuExample, as authored.\n<Menu {...args}><Menu.Content>Open</Menu.Content></Menu>',
  });
});

test('recurses through root helpers and aliases but not nested components or imported components', () => {
  const detail = extractStorySourceDetails(`
import { Imported } from './external';
function Outer(props) { return <Middle {...props} />; }
const Middle = (args) => <Inner {...args} />;
const Alias = Middle;
const Inner = (args) => <Real {...args}><Outer /><Imported /></Real>;
export const Story = { render: (args) => <Outer {...args} /> };
export const Aliased = { render: (args) => <Alias {...args} /> };
export const External = { render: (args) => <Imported {...args} /> };
`);
  assert.equal(detail.sources.Story, '// JSX from Outer, as authored.\n// JSX from Middle, as authored.\n// JSX from Inner, as authored.\n<Real {...args}><Outer /><Imported /></Real>');
  assert.deepEqual(detail.helpers.Story, { inlined: ['Outer', 'Middle', 'Inner'], remaining: [] });
  assert.deepEqual(detail.helpers.Aliased, { inlined: ['Alias', 'Inner'], remaining: [] });
  assert.equal(detail.sources.External, '<Imported {...args} />');
  assert.equal(detail.helpers.External, undefined);
});

test('stops at three helper levels and protects cycles without losing the last authored JSX', () => {
  const detail = extractStorySourceDetails(`
const A = (args) => <B {...args} />;
const B = (args) => <C {...args} />;
const C = (args) => <D {...args} />;
const D = (args) => <Real {...args} />;
const Cycle = (args) => <Cycle {...args} />;
const Left = (args) => <Right {...args} />;
const Right = (args) => <Left {...args} />;
export const Deep = { render: (args) => <A {...args} /> };
export const Recursive = { render: (args) => <Cycle {...args} /> };
export const Mutual = { render: (args) => <Left {...args} /> };
`);
  assert.ok(detail.sources.Deep?.endsWith('// D not expanded: helper depth limit (3).\n<D {...args} />'));
  assert.deepEqual(detail.helpers.Deep?.remaining, [{ name: 'D', reason: 'helper depth limit (3)' }]);
  assert.deepEqual(detail.helpers.Recursive?.remaining, [{ name: 'Cycle', reason: 'recursive helper cycle' }]);
  assert.deepEqual(detail.helpers.Mutual?.remaining, [{ name: 'Left', reason: 'recursive helper cycle' }]);
});

test('allows maps over story-defined arrays and stops at unknown, imported or shadowed collections', () => {
  const detail = extractStorySourceDetails(`
import { EXTERNAL } from './data';
const ITEMS = [{ value: 'one' }];
const ALIAS = ITEMS;
const DefaultCollection = ({ items = ITEMS, ...args }) => <Tabs {...args}>{items.map(item => <Tabs.Tab>{item.value}</Tabs.Tab>)}</Tabs>;
const ImportedDefault = ({ items = EXTERNAL }) => <Tabs>{items.map(item => <Tabs.Tab>{item.value}</Tabs.Tab>)}</Tabs>;
const Known = ({ count, ...args }) => <Tabs {...args}>{ALIAS.slice(0, count).map(item => <Tabs.Tab>{item.value}</Tabs.Tab>)}</Tabs>;
const Local = (args) => { const items = ['one']; return <Tabs {...args}>{items.map(item => <Tabs.Tab>{item}</Tabs.Tab>)}</Tabs>; };
const Unknown = (args) => <Tabs>{args.items.map(item => <Tabs.Tab>{item}</Tabs.Tab>)}</Tabs>;
const Imported = () => <Tabs>{EXTERNAL['map'](item => <Tabs.Tab>{item}</Tabs.Tab>)}</Tabs>;
const Shadowed = (ITEMS) => <Tabs>{ITEMS.map(item => <Tabs.Tab>{item}</Tabs.Tab>)}</Tabs>;
const Indirect = (args) => { const items = args.items; return <Tabs>{items.map(item => <Tabs.Tab>{item}</Tabs.Tab>)}</Tabs>; };
const CallbackShadow = () => <Tabs>{ITEMS.map(ITEMS => <Tabs.Panel>{ITEMS.map(item => <span>{item}</span>)}</Tabs.Panel>)}</Tabs>;
function BlockScope() { { const external = ['one']; } return <Tabs>{external.map(item => <span>{item}</span>)}</Tabs>; }
export const KnownStory = { render: (args) => <Known {...args} /> };
export const DefaultStory = { render: (args) => <DefaultCollection {...args} /> };
export const ImportedDefaultStory = { render: () => <ImportedDefault /> };
export const LocalStory = { render: (args) => <Local {...args} /> };
export const UnknownStory = { render: (args) => <Unknown {...args} /> };
export const ImportedStory = { render: (args) => <Imported {...args} /> };
export const ShadowedStory = { render: (args) => <Shadowed {...args} /> };
export const IndirectStory = { render: (args) => <Indirect {...args} /> };
export const CallbackStory = { render: () => <CallbackShadow /> };
export const BlockStory = { render: () => <BlockScope /> };
`);
  assert.equal(detail.helpers.KnownStory?.remaining.length, 0);
  assert.equal(detail.helpers.LocalStory?.remaining.length, 0);
  assert.equal(detail.helpers.DefaultStory?.remaining.length, 0);
  for (const story of ['UnknownStory', 'ImportedStory', 'ShadowedStory', 'IndirectStory', 'CallbackStory', 'BlockStory', 'ImportedDefaultStory']) {
    assert.equal(detail.helpers[story]?.remaining[0]?.reason, 'maps over a collection without a local array definition');
    assert.deepEqual(detail.helpers[story]?.inlined, []);
  }
});

test('keeps helper names for conditional or multiple returns, factories and non-JSX helpers', () => {
  const detail = extractStorySourceDetails(`
const Conditional = (args) => args.open ? <Open /> : <Closed />;
function Branches(args) { if (args.open) return <Open />; return <Closed />; }
function Nullable(args) { if (!args.open) return null; return <Open />; }
const Factory = memo(() => <Real />);
const NoJsx = () => renderSomething();
export const ConditionalStory = { render: (args) => <Conditional {...args} /> };
export const BranchesStory = { render: (args) => <Branches {...args} /> };
export const NullableStory = { render: (args) => <Nullable {...args} /> };
export const FactoryStory = { render: (args) => <Factory {...args} /> };
export const NoJsxStory = { render: (args) => <NoJsx {...args} /> };
`);
  for (const story of ['ConditionalStory', 'BranchesStory', 'NullableStory', 'NoJsxStory']) {
    assert.equal(detail.helpers[story]?.remaining[0]?.reason, 'no single literal JSX return');
  }
  assert.equal(detail.helpers.FactoryStory?.remaining[0]?.reason, 'local definition is not a direct function');
});

test('does not confuse render-local bindings with same-named file helpers', () => {
  const detail = extractStorySourceDetails(`
const Wrapper = (args) => <Real {...args} />;
export const Parameter = { render: (Wrapper) => <Wrapper /> };
export const Destructured = { render: ({ Wrapper }) => <Wrapper /> };
export const Variable = { render: () => { const Wrapper = () => <Other />; return <Wrapper />; } };
export const Function = { render: () => { function Wrapper() { return <Other />; } return <Wrapper />; } };
`);
  for (const story of ['Parameter', 'Destructured', 'Variable', 'Function']) {
    assert.deepEqual(detail.helpers[story], {
      inlined: [], remaining: [{ name: 'Wrapper', reason: 'file helper is shadowed in this scope' }],
    });
    assert.ok(detail.sources[story]?.endsWith('<Wrapper />'));
  }
});
