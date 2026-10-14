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

test('the sticky rail still parks and follows', () => {
  // Removing the spacer or the stickiness belongs to rail.ts's own tests; here we only pin the
  // contract that the track exists and is not collapsed.
  assert.match(rule('.rail-track'), /min-width:\s*0/);
  assert.match(styles, /\.rail-track::before\s*\{[^}]*height:\s*calc\(var\(--sd-rail-start/,
    'the rail spacer drives the follow-and-park behaviour');
});
