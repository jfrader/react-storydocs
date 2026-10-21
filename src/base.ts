/** Consumers mount under a sub-path by exporting `window.__REACT_STORYDOCS_BASE__` (e.g. '/docs'). */
export const REACT_STORYDOCS_BASE = ((): string => {
  const globalBase = (globalThis as { __REACT_STORYDOCS_BASE__?: string }).__REACT_STORYDOCS_BASE__;
  if (globalBase) return globalBase.replace(/\/$/, '');
  const { pathname } = window.location;
  return pathname === '/' || pathname.endsWith('.html') ? '' : pathname.replace(/\/$/, '');
})();

export const hrefFor = (path: string): string => `${REACT_STORYDOCS_BASE}${path}`;
