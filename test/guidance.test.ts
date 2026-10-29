import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseGuidance, readCallout, type Block } from '../src/guidance-model.ts';
import { DEFAULT_PAGE_GROUP, readPage } from '../src/build/guidance.ts';

function only<K extends Block['kind']>(markdown: string, kind: K): Extract<Block, { kind: K }> {
  const blocks = parseGuidance(markdown);
  assert.equal(blocks.length, 1, `expected one block, got ${JSON.stringify(blocks)}`);
  const [block] = blocks;
  assert.equal(block?.kind, kind);
  return block as Extract<Block, { kind: K }>;
}

test('guidance: do marker becomes a do card and is stripped from the body', () => {
  const card = only('> ✅ **Do** — one primary action per surface.', 'callout');
  assert.equal(card.tone, 'do');
  assert.deepEqual(card.children, [{ kind: 'paragraph', children: [{ kind: 'text', text: 'one primary action per surface.' }] }]);
});

test("guidance: don't marker becomes a don't card", () => {
  const card = only("> ⛔ **Don't** — swap the label while loading.", 'callout');
  assert.equal(card.tone, 'dont');
  assert.deepEqual(card.children, [{ kind: 'paragraph', children: [{ kind: 'text', text: 'swap the label while loading.' }] }]);
});

test('guidance: markers work with or without an em dash, in any case, as a word or a symbol', () => {
  const cases: Array<[string, 'do' | 'dont']> = [
    ['Do — keep it short', 'do'],
    ['do: keep it short', 'do'],
    ['DO - keep it short', 'do'],
    ['Do\nkeep it short', 'do'],
    ['✅ keep it short', 'do'],
    ["DON'T — stack alerts", 'dont'],
    ["don't: stack alerts", 'dont'],
    ['⛔ stack alerts', 'dont'],
    ['✗ stack alerts', 'dont'],
  ];
  for (const [text, tone] of cases) assert.equal(readCallout(text).tone, tone, text);
  assert.equal(readCallout('Do — keep it short').body, 'keep it short');
  assert.equal(readCallout('do: keep it short').body, 'keep it short');
  // A bare word with no separator is prose, not a marker.
  assert.equal(readCallout('DO keep it short').tone, 'note');
});

test('guidance: other blockquotes stay neutral callouts, prose starting with "Do" included', () => {
  assert.equal(only('> Buttons submit forms by default.', 'callout').tone, 'note');
  const question = only('> Do you need a menu instead?', 'callout');
  assert.equal(question.tone, 'note');
  assert.deepEqual(question.children, [{ kind: 'paragraph', children: [{ kind: 'text', text: 'Do you need a menu instead?' }] }]);
});

test('guidance: fenced code keeps language and text verbatim', () => {
  const code = only('```tsx\n<Button loading>Save</Button>\n```', 'code');
  assert.deepEqual(code, { kind: 'code', lang: 'tsx', text: '<Button loading>Save</Button>' });
});

test('guidance: tables keep header, rows, alignment and inline code', () => {
  const table = only('| Variant | Count |\n| ------- | ----: |\n| `solid` | 1 |\n| `soft` | 2 |', 'table');
  assert.deepEqual(table.align, [null, 'right']);
  assert.deepEqual(table.header, [[{ kind: 'text', text: 'Variant' }], [{ kind: 'text', text: 'Count' }]]);
  assert.deepEqual(table.rows[0], [[{ kind: 'code', text: 'solid' }], [{ kind: 'text', text: '1' }]]);
  assert.equal(table.rows.length, 2);
});

test('guidance: links are flagged external by URL, unsafe schemes are dropped', () => {
  const [paragraph] = parseGuidance('[APG](https://www.w3.org/WAI/) and [card](#/components/card) and [x](javascript:alert(1))');
  assert.equal(paragraph?.kind, 'paragraph');
  const links = paragraph?.kind === 'paragraph' ? paragraph.children.filter((node) => node.kind === 'link') : [];
  assert.deepEqual(links, [
    { kind: 'link', href: 'https://www.w3.org/WAI/', external: true, children: [{ kind: 'text', text: 'APG' }] },
    { kind: 'link', href: '#/components/card', external: false, children: [{ kind: 'text', text: 'card' }] },
  ]);
});

test('guidance: headings start at h2, lists, rules and raw HTML', () => {
  const blocks = parseGuidance('# Title\n\n1. one\n2. *two*\n\n---\n\n<script>alert(1)</script>\n');
  assert.deepEqual(
    blocks.map((block) => block.kind),
    ['heading', 'list', 'rule'],
  );
  assert.equal(blocks[0]?.kind === 'heading' && blocks[0].depth, 2);
  const list = blocks[1];
  assert.ok(list?.kind === 'list' && list.ordered && list.items.length === 2);
});
