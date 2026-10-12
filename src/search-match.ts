import type { CatalogEntry } from './config';

export const MAX_COMPONENTS = 10;
export const MAX_STORIES_PER_COMPONENT = 2;

export interface SearchRow {
  entry: CatalogEntry;
  story?: string;
}

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

function scoreEntry(entry: CatalogEntry, needle: string): number {
  const name = entry.name.toLowerCase();
  if (name === needle) return 100;
  if (name.startsWith(needle)) return 80;
  if (name.includes(needle)) return 60;
  if (entry.group.toLowerCase().includes(needle)) return 40;
  if (entry.storybookTitle.toLowerCase().includes(needle)) return 30;
  return -1;
}

/**
 * Ranked option rows: a component row when the component itself matches, followed by up to
 * `MAX_STORIES_PER_COMPONENT` rows for its stories whose names match.
 */
export function searchCatalog(catalog: CatalogEntry[], query: string): SearchRow[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  return catalog
    .map((entry) => {
      const stories = entry.stories.filter((story) => story.toLowerCase().includes(needle)).slice(0, MAX_STORIES_PER_COMPONENT);
      const score = scoreEntry(entry, needle);
      return { entry, stories, score: score >= 0 ? score : stories.length ? 20 : -1, componentHit: score >= 0 };
    })
    .filter((candidate) => candidate.score >= 0)
    .sort((a, b) => b.score - a.score || a.entry.name.localeCompare(b.entry.name))
    .slice(0, MAX_COMPONENTS)
    .flatMap(({ entry, stories, componentHit }) => [
      ...(componentHit ? [{ entry }] : []),
      ...stories.map((story) => ({ entry, story })),
    ]);
}

export const rowKey = (row: SearchRow): string => (row.story ? `${row.entry.slug}--${row.story}` : row.entry.slug);

export const rowLabel = (row: SearchRow): string => (row.story ? `${row.entry.name} › ${row.story}` : row.entry.name);

export const rowPath = (row: SearchRow): string =>
  `/components/${row.entry.slug}${row.story ? `?story=${encodeURIComponent(row.story)}` : ''}`;
