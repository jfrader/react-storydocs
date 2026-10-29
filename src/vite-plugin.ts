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
import type { ReactStorydocsConfig } from './config.js';
import type { CatalogRef, ComponentPropsDoc } from './prop-docs.js';
import { buildCatalog, catalogCode, resolveStoryRoot, scanStories, storyImportSpecifier } from './build/catalog.ts';
import { siteCode } from './build/site.ts';
import { tokensCode } from './build/tokens.ts';
import { globalStylesCode } from './build/global-styles.ts';
import { createPropsCollector, propsCode, propsIndexCode } from './build/props.ts';
import { guidanceCode, guidanceIndexCode, indexGuidance, readPage, type GuidanceIndex } from './build/guidance.ts';
import { readReleases, releasesCode } from './build/releases.ts';
import { codeModuleCode, resolveCodeModule } from './build/code.ts';
import { compositionModuleCode, resolveCompositionModule } from './build/composition.ts';
import { apiModuleCode, resolveApiModule } from './build/api.ts';
import { decoratorsModuleCode, resolveDecoratorsModule } from './build/decorators.ts';
import { STORYBOOK_TEST_STUB } from './build/storybook-test.ts';
import { FILE_PREFIX, VIRTUAL_PREFIX } from './build/module-ids.ts';
import { extractStorySources, storySourcesCode, storySourcesIndexCode } from './build/story-sources.ts';

export type { ComponentPropsDoc, PropDoc } from './prop-docs.js';

export interface ReactStorydocsPluginOptions {
  config: ReactStorydocsConfig;
  /** Overrides the Vite root (defaults to the resolved Vite project root). */
  root?: string;
}

export function reactStorydocs(options: ReactStorydocsPluginOptions): Plugin {
  const { config } = options;
  let projectRoot = options.root ?? process.cwd();
  let catalog = buildCatalog(scanStories(config.stories, projectRoot), config.groups);
  catalog.files.clear();
  const engineStyles = path.join(import.meta.dirname, 'styles.css');
  const propsCache = new Map<string, { components: ComponentPropsDoc[]; uses: CatalogRef[] }>();
  const storySourcesCache = new Map<string, Record<string, string>>();
  const propsCollector = createPropsCollector();
  let buildMode = false;
  let guidance: GuidanceIndex = { guidance: new Map(), pages: [] };

  const loadProps = (slug: string) => {
    let collected = propsCache.get(slug);
    if (!collected) {
      const name = catalog.entries.find((entry) => entry.slug === slug)?.name ?? '';
      collected = propsCollector.collect(catalog.files.get(slug), name, slug, catalog.entries.flatMap((entry) => {
        const storyFile = catalog.files.get(entry.slug);
        return storyFile ? [{ name: entry.name, slug: entry.slug, storyFile }] : [];
      }), catalog.components.get(slug));
      propsCache.set(slug, collected);
    }
    const code = propsCode(collected.components, collected.uses);
    // Each slug is requested once per build. Keeping its prop rows alive duplicates the virtual
    // module and grows the heap across the whole catalog.
    if (buildMode) propsCache.delete(slug);
    return code;
  };

  const modules: Record<string, () => string> = {
    catalog: () => `${catalogCode(catalog)}\nexport const storySource = ${JSON.stringify(storyImportSpecifier(config.stories, projectRoot))};`,
    site: () => siteCode(config),
    tokens: () => tokensCode(config.tokens),
    'global-styles': () => globalStylesCode(engineStyles, config.tokens?.css),
    'stub-storybook-test': () => STORYBOOK_TEST_STUB,
    props: () => propsIndexCode(catalog.entries.map((entry) => entry.slug)),
    guidance: () => guidanceIndexCode(guidance.guidance.keys()),
    'story-sources': () => storySourcesIndexCode(catalog.files.keys()),
    releases: () => releasesCode(readReleases(config, projectRoot)),
    code: () => codeModuleCode(resolveCodeModule(config.code?.module, projectRoot)),
    composition: () => compositionModuleCode(resolveCompositionModule(config.composition?.module, projectRoot)),
    api: () => apiModuleCode(resolveApiModule(config.api?.module, projectRoot)),
    decorators: () => decoratorsModuleCode(resolveDecoratorsModule(config.decorators?.module, projectRoot)),
  };

  return {
    name: 'react-storydocs',
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
      buildMode = resolved.command === 'build';
      propsCollector.setBuildMode(buildMode);
      projectRoot = options.root ?? resolved.root;
      guidance = indexGuidance(config.guidance, projectRoot);
      catalog = buildCatalog(scanStories(config.stories, projectRoot), config.groups, guidance.pages);
      this.info?.(
        `react-storydocs: ${catalog.stats.components} components, ${catalog.stats.stories} stories, ${catalog.stats.groups} groups from ${config.stories.from}`,
      );
    },
    buildStart() {
      propsCache.clear();
      storySourcesCache.clear();
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
      if (name.startsWith('story-sources/')) {
        const storyFile = catalog.files.get(name.slice('story-sources/'.length));
        if (!storyFile) return storySourcesCode({});
        const file = realpathSync(storyFile);
        let sources = storySourcesCache.get(file);
        if (!sources) {
          sources = extractStorySources(readFileSync(file, 'utf8'));
          storySourcesCache.set(file, sources);
        }
        this.addWatchFile(file);
        return storySourcesCode(sources);
      }
      if (name.startsWith('guidance/')) {
        const file = guidance.guidance.get(name.slice('guidance/'.length));
        return guidanceCode(file ? readFileSync(file, 'utf8') : '');
      }
      if (name.startsWith('pages/')) {
        const file = guidance.pages.find((page) => page.slug === name.slice('pages/'.length))?.file;
        return guidanceCode(file ? readPage(file, readFileSync(file, 'utf8'))?.body ?? '' : '');
      }
      return null;
    },
    watchChange(file) {
      storySourcesCache.delete(file);
    },
  };
}

export default reactStorydocs;
