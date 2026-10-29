import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { marked, type Token, type Tokens } from 'marked';
import { parse as parseYaml } from 'yaml';
import type { ReactStorydocsConfig } from '../config.js';
import { VIRTUAL_PREFIX } from './module-ids.ts';

/** Where a page without a `group` lands: the first group of the default order. */
export const DEFAULT_PAGE_GROUP = 'Getting started';
/** `index.md` is the overview's guidance; it never becomes a page. */
const OVERVIEW_SLUG = 'index';
const FRONTMATTER = /^---[ \t]*\r?\n(?:([\s\S]*?)\r?\n)?---[ \t]*(?:\r?\n|$)/;
const PAGE_KEYS = ['title', 'group'] as const;

export interface GuidancePage {
  slug: string;
  file: string;
  title: string;
  group: string;
  /** The Markdown after the frontmatter, without the H1 when that H1 supplied the title. */
  body: string;
}

export interface GuidanceIndex {
  /** Component and overview guidance, by slug. */
  guidance: Map<string, string>;
  /** Files that declare a page. */
  pages: GuidancePage[];
}

/** A heading's text without its inline Markdown: the navigation shows it as plain text. */
const plainText = (tokens: Token[]): string =>
  tokens.map((token) => ('tokens' in token && token.tokens ? plainText(token.tokens) : 'text' in token ? token.text : '')).join('');

/**
 * Reads a guidance file as a page. A file opening with a frontmatter block is a page; any other
 * file is component guidance and returns `null`. Without a `title`, the first H1 is the title.
 */
export function readPage(file: string, markdown: string): GuidancePage | null {
  const match = FRONTMATTER.exec(markdown);
  if (!match) return null;
  let data: unknown;
  try {
    data = parseYaml(match[1] ?? '') ?? {};
  } catch (error) {
    throw new Error(`react-storydocs: page "${file}" has invalid frontmatter: ${(error as Error).message}`);
  }
  if (typeof data !== 'object' || Array.isArray(data)) {
    throw new Error(`react-storydocs: page "${file}" frontmatter must be a mapping of keys to values`);
  }
  const [title, group] = PAGE_KEYS.map((key) => {
    const value = (data as Record<string, unknown>)[key];
    if (value === undefined || value === null) return '';
    if (typeof value !== 'string') throw new Error(`react-storydocs: page "${file}" frontmatter \`${key}\` must be a string`);
    return value.trim();
  });
  const page = { slug: path.basename(file, '.md'), file, group: group || DEFAULT_PAGE_GROUP };
  const body = markdown.slice(match[0].length);
  if (title) return { ...page, title, body };
  const tokens = marked.lexer(body);
  const heading = tokens.find((token): token is Tokens.Heading => token.type === 'heading' && token.depth === 1);
  const fallback = heading ? plainText(heading.tokens).trim() : '';
  if (!fallback) {
    throw new Error(`react-storydocs: page "${file}" needs a \`title\` in its frontmatter or a "# Heading"`);
  }
  return { ...page, title: fallback, body: tokens.filter((token) => token !== heading).map((token) => token.raw).join('') };
}

export function indexGuidance(guidance: ReactStorydocsConfig['guidance'], root: string): GuidanceIndex {
  const files = new Map<string, string>();
  for (const dir of [guidance?.dir ?? []].flat()) {
    const directory = path.resolve(root, dir);
    if (!existsSync(directory)) continue;
    for (const file of readdirSync(directory)) {
      if (!file.endsWith('.md')) continue;
      files.set(file.slice(0, -'.md'.length), path.join(directory, file));
    }
  }
  const index: GuidanceIndex = { guidance: new Map(), pages: [] };
  for (const [slug, file] of files) {
    const page = slug === OVERVIEW_SLUG ? null : readPage(file, readFileSync(file, 'utf8'));
    if (page) index.pages.push(page);
    else index.guidance.set(slug, file);
  }
  return index;
}

export function guidanceIndexCode(slugs: Iterable<string>): string {
  return `
export function loadGuidance(slug) {
  switch (slug) {
${[...slugs].map((slug) => `    case ${JSON.stringify(slug)}: return import(${JSON.stringify(`${VIRTUAL_PREFIX}guidance/${slug}`)});`).join('\n')}
    default: return Promise.resolve({ markdown: '' });
  }
}
`;
}

export function guidanceCode(markdown: string): string {
  return `export const markdown = ${JSON.stringify(markdown)};`;
}
