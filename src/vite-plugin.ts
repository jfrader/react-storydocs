/**
 * The engine's Vite plugin.
 *
 * It reads the configured story files, builds the catalog from them, and serves the
 * engine's app through virtual modules. A consumer therefore only writes a config file,
 * an `index.html` and a two-line entry — no component list, no copied prop tables.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import type { Plugin, ResolvedConfig } from 'vite';
import type { CatalogEntry, StorybookDocsConfig, ThemeRole } from './config';

const VIRTUAL_PREFIX = 'virtual:storybook-docs/';
const FILE_PREFIX = 'storybook-docs-file:';

const toKebab = (value: string) =>
  value
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();

const DEFAULT_GROUP_ORDER = [
  'Getting started',
  'Foundations',
  'Actions',
  'Forms',
  'Inputs',
  'Data display',
  'Feedback',
  'Navigation',
  'Surfaces',
  'Pickers',
  'Layout',
  'Content',
  'Components',
];

const THEME_ROLES: ThemeRole[] = [
  'bg',
  'surface',
  'surfaceRaised',
  'surfaceHover',
  'border',
  'borderSubtle',
  'text',
  'textMuted',
  'textSubtle',
  'accent',
  'accentText',
  'accentSoft',
  'accentContrast',
  'danger',
  'focusRing',
];

/** Resolves a package name or a path into the directory that holds the story files. */
function resolveStoryRoot(from: string, root: string): string {
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

/** Minimal glob: `*` matches within a path segment, `**` matches any depth. */
export function matchGlob(pattern: string, candidate: string): boolean {
  const patternParts = pattern.split('/');
  const candidateParts = candidate.split('/');
  const segmentRegExp = (segment: string) =>
    new RegExp(`^${segment.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*')}$`);
  const walk = (patternIndex: number, candidateIndex: number): boolean => {
    if (patternIndex === patternParts.length) return candidateIndex === candidateParts.length;
    const patternPart = patternParts[patternIndex];
    if (patternPart === '**') {
      for (let skip = candidateIndex; skip <= candidateParts.length; skip += 1) {
        if (walk(patternIndex + 1, skip)) return true;
      }
      return false;
    }
    if (candidateIndex >= candidateParts.length) return false;
    if (segmentRegExp(patternPart ?? '').test(candidateParts[candidateIndex] ?? '')) {
      return walk(patternIndex + 1, candidateIndex + 1);
    }
    return false;
  };
  return walk(0, 0);
}

function collectMatches(rootDir: string, pattern: string): string[] {
  const matches: string[] = [];
  const visit = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        visit(full);
        continue;
      }
      const relative = path.relative(rootDir, full).split(path.sep).join('/');
      if (matchGlob(pattern, relative)) matches.push(full);
    }
  };
  visit(rootDir);
  return matches.sort();
}

interface StoryFileFacts {
  title: string;
  stories: string[];
  hasComponent: boolean;
}

function readStoryFile(file: string): StoryFileFacts | null {
  const source = readFileSync(file, 'utf8');
  const titleMatch = source.match(/title:\s*'([^']+)'/) ?? source.match(/title:\s*"([^"]+)"/);
  const title = titleMatch?.[1];
  if (!title) return null;
  const stories = [...source.matchAll(/^export const ([A-Za-z0-9_]+)/gm)].map((match) => match[1] ?? '');
  return { title, stories, hasComponent: /component:\s*\w+/.test(source) };
}

function buildCatalog(config: StorybookDocsConfig, root: string) {
  const storyRoot = resolveStoryRoot(config.stories.from, root);
  const rename = config.groups?.rename ?? {};
  const order = config.groups?.order ?? DEFAULT_GROUP_ORDER;
  const entries: CatalogEntry[] = [];

  for (const file of collectMatches(storyRoot, config.stories.pattern)) {
    const facts = readStoryFile(file);
    if (!facts) continue;
    const [authoredGroup = 'Components', name = path.basename(path.dirname(file))] = facts.title.split('/');
    entries.push({
      slug: toKebab(name),
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
    stats: {
      components: entries.length,
      stories: entries.reduce((total, entry) => total + entry.stories.length, 0),
      groups: groups.length,
    },
  };
}

/** A permissive stand-in for `storybook/test`: play functions never run in the docs front. */
const STORYBOOK_TEST_STUB = `
const chainable = (impl) => {
  const callable = (...args) => (typeof impl === 'function' ? impl(...args) : undefined);
  const chain = () => callable;
  for (const name of [
    'mockName', 'mockImplementation', 'mockImplementationOnce', 'mockResolvedValue',
    'mockResolvedValueOnce', 'mockRejectedValue', 'mockReturnValue', 'mockReturnThis',
    'mockReset', 'mockClear', 'mockRestore',
  ]) callable[name] = chain;
  callable.mock = { calls: [], results: [] };
  return callable;
};
export const fn = (impl) => chainable(impl);
export const spyOn = () => chainable();
export const mocked = (value) => value;
export const expect = () => new Proxy({}, { get: () => () => undefined });
export const within = () => new Proxy({}, { get: () => () => ({}) });
export const waitFor = (callback) => Promise.resolve(typeof callback === 'function' ? callback() : undefined);
export const userEvent = new Proxy({}, { get: () => () => Promise.resolve() });
export const fireEvent = () => true;
export const cleanup = () => {};
`;

export interface StorybookDocsPluginOptions {
  config: StorybookDocsConfig;
  /** Overrides the Vite root (defaults to the resolved Vite project root). */
  root?: string;
}

export function storybookDocs(options: StorybookDocsPluginOptions): Plugin {
  const { config } = options;
  let projectRoot = options.root ?? process.cwd();
  let catalog = buildCatalog(config, projectRoot);

  const engineStyles = path.join(import.meta.dirname, 'styles.css');

  const catalogCode = () => `
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

  const siteCode = () => {
    const hasTokens = Boolean(config.tokens?.varsModule);
    const pages = {
      overview: config.pages?.overview ?? true,
      api: config.pages?.api ?? true,
      color: (config.pages?.color ?? true) && hasTokens,
      typography: (config.pages?.typography ?? true) && hasTokens,
    };
    const theme = {
      attribute: config.theme?.attribute ?? 'data-theme',
      values: config.theme?.values ?? ['dark', 'light'],
      vars: config.theme?.vars ?? {},
    };
    const themeCss = Object.entries(theme.vars)
      .filter(([role]) => THEME_ROLES.includes(role as ThemeRole))
      .map(([role, reference]) => `  --sd-${role.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}: ${reference};`)
      .join('\n');
    return `
export const site = ${JSON.stringify(config.site)};
export const theme = ${JSON.stringify(theme)};
export const pages = ${JSON.stringify(pages)};
export const hasTokens = ${JSON.stringify(hasTokens)};
export const themeCss = ${JSON.stringify(themeCss ? `:root {\n${themeCss}\n}` : '')};
`;
  };

  const tokensCode = () => {
    if (!config.tokens?.varsModule) return `export const vars = {};`;
    const named = config.tokens.varsExport ?? 'vars';
    return `export { ${named} as vars } from ${JSON.stringify(config.tokens.varsModule)};`;
  };

  const globalStylesCode = () => {
    const imports = [
      `import ${JSON.stringify(`${FILE_PREFIX}${engineStyles}`)};`,
      ...(config.tokens?.css ?? []).map((specifier) => `import ${JSON.stringify(specifier)};`),
    ];
    return imports.join('\n');
  };

  // The catalog's loaders are rebuilt lazily because Vite resolves the project root late.
  const resolveStoryFile = (entry: CatalogEntry): string => {
    const found = resolvedStoryFiles.get(entry.slug);
    if (!found) throw new Error(`storybook-docs: no file resolved for "${entry.slug}"`);
    return found;
  };
  const resolvedStoryFiles = new Map<string, string>();

  return {
    name: 'storybook-docs',
    enforce: 'pre',
    config() {
      // The engine is usually consumed through a link, so React would otherwise resolve
      // twice (engine copy + consumer copy). One instance, always.
      return { resolve: { dedupe: ['react', 'react-dom'] } };
    },
    configResolved(resolved: ResolvedConfig) {
      projectRoot = options.root ?? resolved.root;
      catalog = buildCatalog(config, projectRoot);
      resolvedStoryFiles.clear();
      for (const file of collectMatches(resolveStoryRoot(config.stories.from, projectRoot), config.stories.pattern)) {
        const facts = readStoryFile(file);
        if (!facts) continue;
        const [, name = path.basename(path.dirname(file))] = facts.title.split('/');
        resolvedStoryFiles.set(toKebab(name), file);
      }
      this.info?.(
        `storybook-docs: ${catalog.stats.components} components, ${catalog.stats.stories} stories, ${catalog.stats.groups} groups from ${config.stories.from}`,
      );
    },
    resolveId(id: string) {
      if (id.startsWith(VIRTUAL_PREFIX)) return `\0${id}`;
      if (id.startsWith(FILE_PREFIX)) return id.slice(FILE_PREFIX.length);
      // Story modules import `storybook/test` for their play functions. Play functions are
      // never executed here, and that package is a dev dependency of the host app rather
      // than of the documented library (so it cannot be resolved from the library's path).
      // Serve a permissive stub instead of dragging Storybook's test runtime into the docs.
      if (id === 'storybook/test') return `\0${VIRTUAL_PREFIX}stub-storybook-test`;
      return null;
    },
    load(id: string) {
      if (!id.startsWith(`\0${VIRTUAL_PREFIX}`)) return null;
      const name = id.slice(`\0${VIRTUAL_PREFIX}`.length);
      if (name === 'catalog') return catalogCode();
      if (name === 'site') return siteCode();
      if (name === 'tokens') return tokensCode();
      if (name === 'global-styles') return globalStylesCode();
      if (name === 'stub-storybook-test') return STORYBOOK_TEST_STUB;
      return null;
    },
  };
}

export default storybookDocs;
