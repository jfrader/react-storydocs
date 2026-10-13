/**
 * The engine's Vite plugin.
 *
 * It reads the configured story files, builds the catalog from them, and serves the
 * engine's app through virtual modules. A consumer therefore only writes a config file,
 * an `index.html` and a two-line entry — no component list, no copied prop tables.
 */
import { readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import type { Plugin, ResolvedConfig } from 'vite';
import type { StorybookDocsConfig } from './config.js';
import type { ComponentPropsDoc } from './prop-docs.js';
import { buildCatalog, catalogCode, resolveStoryRoot, scanStories } from './build/catalog.ts';
import { siteCode } from './build/site.ts';
import { tokensCode } from './build/tokens.ts';
import { globalStylesCode } from './build/global-styles.ts';
import { createPropsCollector, propsCode, propsIndexCode } from './build/props.ts';
import { guidanceCode, guidanceIndexCode, indexGuidance } from './build/guidance.ts';
import { readReleases, releasesCode } from './build/releases.ts';
import { codeModuleCode, resolveCodeModule } from './build/code.ts';
import { STORYBOOK_TEST_STUB } from './build/storybook-test.ts';
import { FILE_PREFIX, VIRTUAL_PREFIX } from './build/module-ids.ts';

export type { ComponentPropsDoc, PropDoc } from './prop-docs.js';

export interface StorybookDocsPluginOptions {
  config: StorybookDocsConfig;
  /** Overrides the Vite root (defaults to the resolved Vite project root). */
  root?: string;
}

export function storybookDocs(options: StorybookDocsPluginOptions): Plugin {
  const { config } = options;
  let projectRoot = options.root ?? process.cwd();
  let catalog = buildCatalog(scanStories(config.stories, projectRoot), config.groups);
  catalog.files.clear();
  const engineStyles = path.join(import.meta.dirname, 'styles.css');
  const propsCache = new Map<string, ComponentPropsDoc[]>();
  const propsCollector = createPropsCollector();
  let guidanceFiles = new Map<string, string>();

  const loadProps = (slug: string) => {
    let components = propsCache.get(slug);
    if (!components) {
      const name = catalog.entries.find((entry) => entry.slug === slug)?.name ?? '';
      components = propsCollector.collect(catalog.files.get(slug), name, slug);
      propsCache.set(slug, components);
    }
    return propsCode(components);
  };

  const modules: Record<string, () => string> = {
    catalog: () => catalogCode(catalog),
    site: () => siteCode(config),
    tokens: () => tokensCode(config.tokens),
    'global-styles': () => globalStylesCode(engineStyles, config.tokens?.css),
    'stub-storybook-test': () => STORYBOOK_TEST_STUB,
    props: () => propsIndexCode(catalog.entries.map((entry) => entry.slug)),
    guidance: () => guidanceIndexCode(guidanceFiles.keys()),
    releases: () => releasesCode(readReleases(config, projectRoot)),
    code: () => codeModuleCode(resolveCodeModule(config.code?.module, projectRoot)),
  };

  return {
    name: 'storybook-docs',
    enforce: 'pre',
    config() {
      // The engine is usually consumed through a link, so React would otherwise resolve
      // twice (engine copy + consumer copy). One instance, always.
      // The story files live outside this project's root when the design system is linked;
      // without them as optimizer entries, Vite serves their CJS dependencies raw and imports
      // like `hoist-non-react-statics` fail with "does not provide an export named 'default'".
      const entries: string[] = [];
      try {
        const storyRoot = resolveStoryRoot(config.stories.from, process.cwd());
        entries.push(path.join(storyRoot, config.stories.pattern).split(path.sep).join('/'));
      } catch {
        // The root is unknown until configResolved; the resolution above is best-effort.
      }
      return {
        resolve: { dedupe: ['react', 'react-dom'] },
        optimizeDeps: { entries: ['index.html', ...entries] },
      };
    },
    configResolved(resolved: ResolvedConfig) {
      propsCollector.setBuildMode(resolved.command === 'build');
      projectRoot = options.root ?? resolved.root;
      catalog = buildCatalog(scanStories(config.stories, projectRoot), config.groups);
      guidanceFiles = indexGuidance(config.guidance, projectRoot);
      this.info?.(
        `storybook-docs: ${catalog.stats.components} components, ${catalog.stats.stories} stories, ${catalog.stats.groups} groups from ${config.stories.from}`,
      );
    },
    buildStart() {
      propsCache.clear();
      propsCollector.clearPrograms();
    },
    closeBundle() {
      propsCollector.clearPrograms();
    },
    resolveId(id: string) {
      if (id.startsWith(VIRTUAL_PREFIX)) return `\0${id}`;
      if (id.startsWith(FILE_PREFIX)) return realpathSync(id.slice(FILE_PREFIX.length));
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
      const module = Object.hasOwn(modules, name) ? modules[name] : undefined;
      if (module) return module();
      if (name.startsWith('props/')) return loadProps(name.slice('props/'.length));
      if (name.startsWith('guidance/')) {
        const file = guidanceFiles.get(name.slice('guidance/'.length));
        return guidanceCode(file ? readFileSync(file, 'utf8') : '');
      }
      return null;
    },
  };
}

export default storybookDocs;
