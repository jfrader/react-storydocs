import assert from 'node:assert/strict';
import { test } from 'node:test';
import { railOffsetFor, revealActiveNavLink } from '../src/nav-reveal.ts';

type Box = { top: number; bottom: number };
type FakeLink = { offsetParent: unknown; getBoundingClientRect: () => Box };
const box = (top: number, bottom: number): Box => ({ top, bottom });

const rail = (overrides: {
  scrollTop?: number;
  height?: number;
  rail: Box;
  link?: FakeLink | null;
}) => {
  const link: FakeLink | null = overrides.link === undefined ? { offsetParent: {}, getBoundingClientRect: () => box(700, 728) } : overrides.link;
  const nav = {
    clientHeight: overrides.height ?? 500,
    scrollTop: overrides.scrollTop ?? 0,
    getBoundingClientRect: () => overrides.rail,
    querySelector: (selector: string) => (selector === 'a[aria-current="page"]' ? link : null),
  };
  return nav;
};

test('a link already inside the rail keeps the rail where it is', () => {
  assert.equal(railOffsetFor(100, 600, 200, 228), null);
  assert.equal(railOffsetFor(100, 600, 100, 128), null);
  assert.equal(railOffsetFor(100, 600, 572, 600), null);
});

test('a link below the rail moves it down by the hidden part only', () => {
  assert.equal(railOffsetFor(100, 600, 700, 728), 128);
});

test('a link above the rail moves it up by the hidden part only', () => {
  assert.equal(railOffsetFor(100, 600, 40, 68), -60);
});

test('revealing the selected link moves the rail, not the document', () => {
  const nav = rail({ scrollTop: 240, rail: box(100, 600) });
  revealActiveNavLink(nav as unknown as Element);
  assert.equal(nav.scrollTop, 368);
});

test('a hidden rail or a collapsed group is left alone until it has a box', () => {
  const closed = rail({ height: 0, rail: box(0, 0) });
  revealActiveNavLink(closed as unknown as Element);
  assert.equal(closed.scrollTop, 0);

  const collapsed = rail({ scrollTop: 120, rail: box(100, 600), link: { offsetParent: null, getBoundingClientRect: () => box(0, 0) } });
  revealActiveNavLink(collapsed as unknown as Element);
  assert.equal(collapsed.scrollTop, 120);

  revealActiveNavLink(null);
});
