import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { CatalogEntry } from '../src/config.ts';
import { highlightSegments, rowKey, rowLabel, rowPath, searchCatalog } from '../src/search-match.ts';

const entry = (name: string, stories: string[], group = 'Inputs'): CatalogEntry => ({
  slug: name.toLowerCase(),
  name,
  group,
  storybookTitle: `${group}/${name}`,
  stories,
  hasComponent: true,
  load: async () => ({}),
});

const catalog = [
  entry('Button', ['Default', 'Variants', 'SizeVariants', 'ExtraVariants']),
  entry('Badge', ['Default']),
  entry('Dialog', ['Default'], 'Overlays'),
];

test('highlightSegments: splits around the first case-insensitive match', () => {
  assert.deepEqual(highlightSegments('Button', 'TT'), [
    { text: 'Bu', match: false },
    { text: 'tt', match: true },
    { text: 'on', match: false },
  ]);
  assert.deepEqual(highlightSegments('Button', 'zz'), [{ text: 'Button', match: false }]);
  assert.deepEqual(highlightSegments('Button', '  '), [{ text: 'Button', match: false }]);
});

test('highlightSegments: user text stays plain text', () => {
  assert.deepEqual(highlightSegments('<b>x</b>', 'b>x'), [
    { text: '<', match: false },
    { text: 'b>x', match: true },
    { text: '</b>', match: false },
  ]);
});

test('searchCatalog: story-only match yields capped story rows, no component row', () => {
  const rows = searchCatalog(catalog, 'variants');
  assert.deepEqual(rows.map(rowLabel), ['Button › Variants', 'Button › SizeVariants']);
  assert.ok(rows.every((row) => row.story));
});

test('searchCatalog: component match ranks first and precedes its story rows', () => {
  const rows = searchCatalog(catalog, 'b');
  assert.deepEqual(rows.map(rowLabel).slice(0, 2), ['Badge', 'Button']);
  assert.equal(searchCatalog(catalog, 'zzzz').length, 0);
  assert.equal(searchCatalog(catalog, '   ').length, 0);
});

test('row helpers: unique keys and deep-link shape', () => {
  const [row] = searchCatalog(catalog, 'variants');
  assert.equal(rowKey(row), 'button--Variants');
  assert.equal(rowPath(row), '/components/button?story=Variants');
  assert.equal(rowPath({ entry: catalog[1] }), '/components/badge');
});
