import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolveSections, sectionStories } from '../src/sections.ts';

test('authored sections preserve order, omit unknown/hidden/duplicate stories and remove the featured story', () => {
  assert.deepEqual(resolveSections(['Default', 'Variant', 'Controlled', 'Unlisted'], [
    { title: 'Basic', stories: ['Unknown', 'Hidden', 'Variant', 'Default'] },
    { title: 'Behavior', stories: ['Default', 'Controlled', 'Variant'] },
    { title: 'Empty', stories: ['Unknown'] },
  ], 'Default'), {
    example: 'Variant', sections: [
      { title: 'Basic', stories: ['Default'] },
      { title: 'Behavior', stories: ['Controlled'] },
    ],
  });
});

test('a featured-only section has no heading and an explicit empty list has no fallback', () => {
  assert.deepEqual(resolveSections(['Default'], [{ title: 'Basic', stories: ['Default'] }], 'Default'), { example: 'Default', sections: [] });
  assert.deepEqual(resolveSections(['Default'], [], 'Default'), { example: null, sections: [] });
});

test('absent sections retain the heuristic selection and buckets', () => {
  assert.deepEqual(resolveSections(['Default', 'Loading', 'Other'], undefined, 'Default'), {
    example: 'Default', sections: sectionStories(['Loading', 'Other']),
  });
});

test('non-array sections fall back to heuristics and malformed entries are skipped', () => {
  const stories = ['Default', 'Loading', 'Other'];
  for (const malformed of [null, {}, 'Basic', 42]) {
    assert.deepEqual(resolveSections(stories, malformed, 'Default'), resolveSections(stories, undefined, 'Default'));
  }
  assert.deepEqual(resolveSections(stories, [null, 'Bad', {}, { title: 'Bad', stories: {} },
    { title: 'Basic', stories: ['Other', null, 42, 'Loading'] }], 'Default'), {
    example: 'Other', sections: [{ title: 'Basic', stories: ['Loading'] }],
  });
});
