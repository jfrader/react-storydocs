import { existsSync } from 'node:fs';
import path from 'node:path';
import { collectMatches, readStoryFile, storyIdentity } from '../scan.ts';
import type { CatalogEntry, StorybookDocsConfig } from '../config.js';
import { FILE_PREFIX } from './module-ids.ts';

const DEFAULT_GROUP_ORDER = [
  'Getting started', 'Foundations', 'Actions', 'Forms', 'Inputs', 'Data display',
  'Feedback', 'Navigation', 'Surfaces', 'Pickers', 'Layout', 'Content', 'Components',
];

export interface StoryFile {
  file: string;
  facts: NonNullable<ReturnType<typeof readStoryFile>>;
}

export interface Catalog {
  entries: CatalogEntry[];
  groups: string[];
  stats: { components: number; stories: number; groups: number };
  files: Map<string, string>;
  components: Map<string, string | null>;
}

export function resolveStoryRoot(from: string, root: string): string {
  if (from.startsWith('.') || path.isAbsolute(from)) {
    const resolved = path.resolve(root, from);
    if (!existsSync(resolved)) {
      throw new Error(`storybook-docs: story root "${from}" does not exist (looked in ${resolved})`);
    }
    return resolved;
  }
  let dir = root;
  for (;;) {
    const candidate = path.join(dir, 'node_modules', from);
    if (existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) {
      throw new Error(`storybook-docs: package "${from}" is not installed from ${root}`);
    }
    dir = parent;
  }
}

export function scanStories(config: StorybookDocsConfig['stories'], root: string): StoryFile[] {
  const stories: StoryFile[] = [];
  for (const file of collectMatches(resolveStoryRoot(config.from, root), config.pattern)) {
    const facts = readStoryFile(file);
    if (facts) stories.push({ file, facts });
  }
  return stories;
}

export function buildCatalog(stories: StoryFile[], groupsConfig: StorybookDocsConfig['groups']): Catalog {
  const rename = groupsConfig?.rename ?? {};
  const order = groupsConfig?.order ?? DEFAULT_GROUP_ORDER;
  const entries: CatalogEntry[] = [];
  const files = new Map<string, string>();
  const components = new Map<string, string | null>();
  for (const { file, facts } of stories) {
    const { group: authoredGroup, name, slug } = storyIdentity(file, facts.title);
    if (files.has(slug)) {
      throw new Error(`storybook-docs: duplicate story slug "${slug}" in "${files.get(slug)}" and "${file}"`);
    }
    files.set(slug, file);
    components.set(slug, facts.component);
    entries.push({
      slug,
      name,
      group: rename[authoredGroup] ?? authoredGroup,
      storybookTitle: facts.title,
      stories: facts.stories,
      hasComponent: facts.hasComponent,
      load: () => import(/* @vite-ignore */ `${FILE_PREFIX}${file}`),
    });
  }
  entries.sort((a, b) => {
    const indexA = order.indexOf(a.group);
    const indexB = order.indexOf(b.group);
    if (indexA !== indexB) return (indexA === -1 ? 99 : indexA) - (indexB === -1 ? 99 : indexB);
    return a.name.localeCompare(b.name);
  });
  const groups = [...new Set(entries.map((entry) => entry.group))].sort((a, b) => {
    const indexA = order.indexOf(a);
    const indexB = order.indexOf(b);
    return (indexA === -1 ? 99 : indexA) - (indexB === -1 ? 99 : indexB);
  });
  return {
    entries,
    groups,
    files,
    components,
    stats: {
      components: entries.length,
      stories: entries.reduce((total, entry) => total + entry.stories.length, 0),
      groups: groups.length,
    },
  };
}

export function catalogCode(catalog: Catalog): string {
  const resolveStoryFile = (entry: CatalogEntry): string => {
    const found = catalog.files.get(entry.slug);
    if (!found) throw new Error(`storybook-docs: no file resolved for "${entry.slug}"`);
    return found;
  };
  return `
export const catalog = [
${catalog.entries
  .map(
    (entry) =>
      `  { slug: ${JSON.stringify(entry.slug)}, name: ${JSON.stringify(entry.name)}, group: ${JSON.stringify(entry.group)}, ` +
      `storybookTitle: ${JSON.stringify(entry.storybookTitle)}, hasComponent: ${entry.hasComponent}, ` +
      `stories: ${JSON.stringify(entry.stories)}, load: () => import(${JSON.stringify(`${FILE_PREFIX}${resolveStoryFile(entry)}`)}) },`,
  )
  .join('\n')}
];
export const groups = ${JSON.stringify(catalog.groups)};
export const stats = ${JSON.stringify(catalog.stats)};
`;
}
