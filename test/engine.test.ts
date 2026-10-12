import assert from 'node:assert/strict';
import { test } from 'node:test';
import { matchGlob } from '../src/scan.ts';
import { sectionStories, usageSnippet } from '../src/sections.ts';

test('matchGlob: one segment wildcard', () => {
  assert.equal(matchGlob('src/components/*/*.stories.tsx', 'src/components/button/button.stories.tsx'), true);
  assert.equal(matchGlob('src/components/*/*.stories.tsx', 'src/components/button/nested/button.stories.tsx'), false);
  assert.equal(matchGlob('src/components/*/*.stories.tsx', 'src/components/button/button.tsx'), false);
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

test('sectionStories: never loses an unrecognised story', () => {
  const sections = sectionStories(['Wibble', 'Default']);
  assert.equal(sections.flatMap((section) => section.stories).length, 2);
});

test('usageSnippet: primitives only, handlers and node children dropped', () => {
  const snippet = usageSnippet('Button', {
    variant: 'solid',
    size: 'md',
    loading: false,
    disabled: true,
    onClick: () => undefined,
    children: 'Save',
  });
  assert.equal(snippet, '<Button variant="solid" size="md" disabled>Save</Button>');
});

test('usageSnippet: returns null without args and renders an ellipsis for node children', () => {
  assert.equal(usageSnippet('Button', undefined), null);
  const snippet = usageSnippet('Card', { children: { $$typeof: Symbol('react.element') } });
  assert.equal(snippet, '<Card>\n  …\n</Card>');
});
