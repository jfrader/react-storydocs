/**
 * The navigation rail is its own scroll owner. Revealing the page a reader landed on moves that
 * rail and nothing else: the document keeps the position its own navigation gave it.
 */

/** Vertical offset that shows a link with the least movement, or null when it already fits. */
export function railOffsetFor(railTop: number, railBottom: number, linkTop: number, linkBottom: number): number | null {
  if (linkTop < railTop) return linkTop - railTop;
  if (linkBottom > railBottom) return linkBottom - railBottom;
  return null;
}

/**
 * Brings the selected navigation link into the rail. A hidden rail (a closed mobile drawer) or a
 * link inside a collapsed group has no box to compare, so it waits for the next call.
 */
export function revealActiveNavLink(nav: Element | null): void {
  if (!nav || nav.clientHeight === 0) return;
  const link = nav.querySelector<HTMLElement>('a[aria-current="page"]');
  if (!link || link.offsetParent === null) return;
  const rail = nav.getBoundingClientRect();
  const box = link.getBoundingClientRect();
  const offset = railOffsetFor(rail.top, rail.bottom, box.top, box.bottom);
  if (offset !== null) nav.scrollTop += offset;
}
