import { REACT_STORYDOCS_BASE, hrefFor } from './base';
import { hashPath } from './toc';

export function standaloneStoryHref(slug: string, story: string): string {
  return `#${hrefFor(`/stories/${encodeURIComponent(slug)}/${encodeURIComponent(story)}`)}`;
}

export function componentStoryHref(slug: string, story: string): string {
  return `#${hrefFor(`/components/${encodeURIComponent(slug)}`)}?${new URLSearchParams({ story })}`;
}

export function parseStoryRoute(hash: string, base = REACT_STORYDOCS_BASE): { slug: string; story: string } | null {
  const path = hashPath(hash).replace(/^#/, '');
  const prefix = `${base}/stories/`;
  if (!path.startsWith(prefix)) return null;
  const segments = path.slice(prefix.length).split('/');
  if (segments.length !== 2 || segments.some((segment) => !segment)) return null;
  try {
    return { slug: decodeURIComponent(segments[0]!), story: decodeURIComponent(segments[1]!) };
  } catch {
    return null;
  }
}
