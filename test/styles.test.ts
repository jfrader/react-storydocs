import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

/**
 * Stylesheet contracts the chrome depends on, asserted from source because the emitted CSS is what a
 * consumer loads and nothing here renders a browser. Each case names the reader-visible failure it
 * prevents, so a change that breaks one is a change to the documented look, not a refactor.
 */
const styles = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');

const rule = (selector: string) => {
  const match = styles.match(new RegExp(`${selector.replace('.', '\\.')}\\s*\\{([^}]*)\\}`));
  assert.ok(match, `${selector} has no rule in src/styles.css`);
  return match[1]!;
};

test('the nav column paints the surface, not just the sticky list', () => {
  // The sticky nav is only as tall as its list, so on a long page the panel used to stop short and
  // the page background showed under it.
  assert.match(rule('.nav-track'), /background:\s*var\(--sd-surface\)/,
    '.nav-track must paint --sd-surface: the sticky nav is shorter than its column');
  assert.match(rule('.nav'), /background:\s*var\(--sd-surface\)/,
    '.nav keeps its own paint so the panel is opaque while it sticks');
});

test('rails have bounded native scrolling instead of following document scroll', () => {
  assert.match(rule('.rail-track'), /min-width:\s*0/);
  const rail = rule('.rail-track > :is\\(\\.nav, \\.toc\\)');
  assert.match(rail, /position:\s*sticky/);
  assert.match(rail, /max-block-size:\s*calc\(100dvh/);
  assert.match(rail, /overflow-y:\s*auto/);
  assert.doesNotMatch(styles, /--sd-rail-offset|--sd-rail-start/);
});

test('heading navigation applies the sticky header offset only once', () => {
  const toc = readFileSync(new URL('../src/toc.css', import.meta.url), 'utf8');
  assert.match(rule('html'), /scroll-padding-top:/);
  assert.doesNotMatch(toc, /scroll-margin-top:/);
});

test('long inline usage and API tokens wrap rather than widening the document', () => {
  assert.match(styles, /\.guidance :is\(p, li, code\),\s*\.api-part :is\(p, li, code\),\s*\.props-table :is\(p, li, code\)\s*\{\s*overflow-wrap:\s*anywhere/);
});
