/** Consumers mount under a sub-path by exporting `window.__STORYBOOK_DOCS_BASE__` (e.g. '/docs'). */
export const STORYBOOK_DOCS_BASE = ((): string => {
  const globalBase = (globalThis as { __STORYBOOK_DOCS_BASE__?: string }).__STORYBOOK_DOCS_BASE__;
  if (globalBase) return globalBase.replace(/\/$/, '');
  const { pathname } = window.location;
  return pathname === '/' || pathname.endsWith('.html') ? '' : pathname.replace(/\/$/, '');
})();

export const hrefFor = (path: string): string => `${STORYBOOK_DOCS_BASE}${path}`;
