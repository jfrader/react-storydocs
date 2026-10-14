import assert from 'node:assert/strict';
import { test } from 'node:test';
import { extractStorySources } from '../src/build/story-sources.ts';
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
