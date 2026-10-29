import type { CatalogEntry, PageEntry } from './config';

/** Matched components and pages listed; a component's story rows ride along with it. */
export const MAX_MATCHES = 10;
export const MAX_STORIES_PER_COMPONENT = 2;

export type SearchRow = { entry: CatalogEntry; story?: string } | { page: PageEntry };

export interface TextSegment {
  text: string;
  match: boolean;
}

/** Splits `text` around the first case-insensitive occurrence of `needle`; never produces HTML. */
export function highlightSegments(text: string, needle: string): TextSegment[] {
  const term = needle.trim().toLowerCase();
  const lower = text.toLowerCase();
  const start = term && lower.length === text.length ? lower.indexOf(term) : -1;
  if (start < 0) return [{ text, match: false }];
  const end = start + term.length;
  return [
    { text: text.slice(0, start), match: false },
    { text: text.slice(start, end), match: true },
    { text: text.slice(end), match: false },
  ].filter((segment) => segment.text);
}

function scoreItem(item: { name: string; group: string; storybookTitle?: string }, needle: string): number {
  const name = item.name.toLowerCase();
  if (name === needle) return 100;
  if (name.startsWith(needle)) return 80;
  if (name.includes(needle)) return 60;
  if (item.group.toLowerCase().includes(needle)) return 40;
  if (item.storybookTitle?.toLowerCase().includes(needle)) return 30;
  return -1;
}

/**
 * Ranked option rows: a component row when the component itself matches, followed by up to
 * `MAX_STORIES_PER_COMPONENT` rows for its stories whose names match. Pages rank by the same
 * score as components.
 */
export function searchCatalog(catalog: CatalogEntry[], query: string, pages: PageEntry[] = []): SearchRow[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  const components = catalog.map((entry) => {
    const stories = entry.stories.filter((story) => story.toLowerCase().includes(needle)).slice(0, MAX_STORIES_PER_COMPONENT);
    const score = scoreItem(entry, needle);
    const rows: SearchRow[] = [...(score >= 0 ? [{ entry }] : []), ...stories.map((story) => ({ entry, story }))];
    return { name: entry.name, score: score >= 0 ? score : stories.length ? 20 : -1, rows };
  });
  const pageMatches = pages.map((page) => ({ name: page.name, score: scoreItem(page, needle), rows: [{ page }] }));
  return [...components, ...pageMatches]
    .filter((candidate) => candidate.score >= 0)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .slice(0, MAX_MATCHES)
    .flatMap(({ rows }) => rows);
}

/** The component or page a row opens. */
export const rowTarget = (row: SearchRow): CatalogEntry | PageEntry => ('page' in row ? row.page : row.entry);

export const rowKey = (row: SearchRow): string =>
  'page' in row ? `pages/${row.page.slug}` : row.story ? `${row.entry.slug}--${row.story}` : row.entry.slug;

export const rowLabel = (row: SearchRow): string =>
  'page' in row ? row.page.name : row.story ? `${row.entry.name} › ${row.story}` : row.entry.name;

export const rowPath = (row: SearchRow): string =>
  'page' in row
    ? `/pages/${row.page.slug}`
    : `/components/${row.entry.slug}${row.story ? `?story=${encodeURIComponent(row.story)}` : ''}`;

/** The secondary line: the group, plus the story count on a component row. */
export const rowMeta = (row: SearchRow): string =>
  'page' in row || row.story ? rowTarget(row).group : `${row.entry.group} · ${row.entry.stories.length} stories`;
