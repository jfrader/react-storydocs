/**
 * The engine's Vite plugin.
 *
 * It reads the configured story files, builds the catalog from them, and serves the
 * engine's app through virtual modules. A consumer therefore only writes a config file,
 * an `index.html` and a two-line entry — no component list, no copied prop tables.
 */
import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from 'node:fs';
import path from 'node:path';
import { withCompilerOptions } from 'react-docgen-typescript';
import ts from 'typescript';
import type { Plugin, ResolvedConfig } from 'vite';
import { collectMatches, extractTitle, readStoryFile, toKebab } from './scan.ts';
import type { CatalogEntry, StorybookDocsConfig, ThemeRole } from './config.js';

export interface PropDoc {
  name: string;
  type: string;
  typeUnavailable?: boolean;
  required: boolean;
  defaultValue: string | null;
  description: string;
  inheritedFrom?: string;
  tags?: { name: string; text: string }[];
  members?: PropDoc[];
}

export interface ComponentPropsDoc {
  name: string;
  props: PropDoc[];
  /** Native element whose full prop set also applies (e.g. `button` for Dialog.Trigger). */
  native?: string;
}

function compareProps(a: PropDoc, b: PropDoc): number {
  return Number(Boolean(a.inheritedFrom)) - Number(Boolean(b.inheritedFrom))
    || Number(b.required) - Number(a.required)
    || a.name.localeCompare(b.name);
}

/** Storybook's own approach: parse the component sources for their public props. */
const DOCGEN_COMPILER_OPTIONS: ts.CompilerOptions = {
  jsx: ts.JsxEmit.React,
  module: ts.ModuleKind.CommonJS,
  target: ts.ScriptTarget.Latest,
  esModuleInterop: true,
};

const TYPE_PROPS_COMPILER_OPTIONS: ts.CompilerOptions = {
  jsx: ts.JsxEmit.ReactJSX,
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  skipLibCheck: true,
  strict: true,
};

const docgen = withCompilerOptions(DOCGEN_COMPILER_OPTIONS, {
  savePropValueAsString: true,
  shouldExtractLiteralValuesFromEnum: true,
  shouldRemoveUndefinedFromOptional: true,
  // Keep the component's own props (and its local types); drop inherited DOM/React props and
  // the utility-type plumbing that TypeScript's own libs and DefinitelyTyped add. The check is
  // by *package*, not by "contains node_modules" — when a design system is consumed from
  // node_modules, that path test would drop every prop.
  propFilter: (prop: { parent?: { fileName?: string } }) =>
    !/(^|\/)node_modules\/(@types|typescript)(\/|$)/.test(prop.parent?.fileName ?? ''),
});

const VIRTUAL_PREFIX = 'virtual:storybook-docs/';
const FILE_PREFIX = 'storybook-docs-file:';

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
  'dangerText',
  'success',
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
      spacing: (config.pages?.spacing ?? true) && hasTokens,
      effects: (config.pages?.effects ?? true) && hasTokens,
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

  const propsCache = new Map<string, ComponentPropsDoc[]>();
  let isBuild = false;
  const programCaches = new Map<ts.CompilerOptions, { host: ts.CompilerHost; program?: ts.Program }>();
  const createPropsProgram = (sources: string[], compilerOptions: ts.CompilerOptions) => {
    if (!isBuild) return ts.createProgram(sources, compilerOptions);
    let cache = programCaches.get(compilerOptions);
    if (!cache) {
      const host = ts.createCompilerHost(compilerOptions);
      const getSourceFile = host.getSourceFile;
      const sourceFiles = new Map<string, ts.SourceFile>();
      host.getSourceFile = (fileName, languageVersion, onError, shouldCreateNewSourceFile) => {
        const key = host.getCanonicalFileName(fileName);
        const cached = sourceFiles.get(key);
        if (cached && !shouldCreateNewSourceFile) return cached;
        const source = getSourceFile(fileName, languageVersion, onError, shouldCreateNewSourceFile);
        if (source) sourceFiles.set(key, source);
        return source;
      };
      cache = { host };
      programCaches.set(compilerOptions, cache);
    }
    cache.program = ts.createProgram(sources, compilerOptions, cache.host, cache.program);
    return cache.program;
  };

  const toPropDoc = (prop: unknown): PropDoc => {
    const value = prop as {
      name: string;
      type?: { name?: string; value?: { value: string }[] };
      required?: boolean;
      defaultValue?: unknown;
      description?: string;
    };
    // react-docgen reports the default as `{ value }` or null; a prop without one must stay null so
    // the table shows nothing rather than the string "null" (and controls can tell the difference).
    const declared = value.defaultValue as { value?: unknown } | string | null | undefined;
    const raw = declared !== null && typeof declared === 'object' ? declared.value : declared;
    const text = declared === null || raw === undefined || raw === 'undefined'
      ? null
      : typeof raw === 'object' ? JSON.stringify(raw) ?? null : String(raw);
    return {
      name: value.name,
      type: value.type?.name === 'enum' && Array.isArray(value.type.value)
        ? value.type.value.map((option) => option.value).join(' | ')
        : value.type?.name ?? 'unknown',
      typeUnavailable: !value.type?.name,
      required: Boolean(value.required),
      defaultValue: text !== null && (value.type?.name === 'string' || value.type?.value?.some((option) => option.value === JSON.stringify(text)))
        ? JSON.stringify(text)
        : text,
      description: value.description ?? '',
    };
  };

  /** Parses every component declared in the folder — compound parts included. */
  const collectProps = (slug: string): ComponentPropsDoc[] => {
    const cached = propsCache.get(slug);
    if (cached) return cached;
    const storyFile = resolvedStoryFiles.get(slug);
    if (storyFile) {
      const directory = path.dirname(storyFile);
      const sources = readdirSync(directory)
        .filter((file) => /\.tsx?$/.test(file) && !file.endsWith('.stories.tsx'))
        .map((file) => path.join(directory, file));
      if (sources.length > 0) {
        try {
          const parsed = docgen
            .parseWithProgramProvider(sources, () => createPropsProgram(sources, DOCGEN_COMPILER_OPTIONS))
            .map((result) => ({
              name: result.displayName,
              props: Object.values(result.props ?? {})
                .map(toPropDoc)
                .sort(compareProps),
            }))
            .filter((component) => component.props.length > 0);
          // The same component is often reported twice (declaration + index re-export).
          // Candidates that do not belong to this component (helpers, unrelated types)
          // are dropped when a name-matching candidate exists.
          const entryName = catalog.entries.find((candidate) => candidate.slug === slug)?.name ?? '';
          const matchesOwnName = (name: string) =>
            entryName.length > 0 && name.toLowerCase().startsWith(entryName.toLowerCase());
          const relevant = parsed.some((component) => matchesOwnName(component.name))
            ? parsed.filter((component) => matchesOwnName(component.name))
            : parsed;
          const typed = collectTypeProps(sources, entryName);
          const components = mergePropsTables(typed.length > 0
            ? [...relevant.filter((table) => typed.some((item) => item.name === table.name)), ...typed]
            : relevant);
          propsCache.set(slug, components);
          return components;
        } catch (cause) {
          console.warn(`storybook-docs: could not read props for "${slug}" (${String(cause)})`);
        }
      }
    }
    propsCache.set(slug, []);
    return [];
  };

  /** Follow callable exports and their members, not unrelated exported helper types. */
  const collectTypeProps = (sources: string[], entryName: string): ComponentPropsDoc[] => {
    const program = createPropsProgram(sources, TYPE_PROPS_COMPILER_OPTIONS);
    const checker = program.getTypeChecker();
    const tables: ComponentPropsDoc[] = [];
    const isExternal = (fileName: string) => /(^|\/)node_modules\/(@types|typescript)(\/|$)/.test(fileName);

    const unresolved = Symbol('unresolved');
    const literalValue = (node: ts.Expression, seen = new Set<ts.Node>()): unknown => {
      if (seen.has(node)) return unresolved;
      const visited = new Set(seen).add(node);
      if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
      if (ts.isNumericLiteral(node)) return Number(node.text);
      if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
      if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
      if (node.kind === ts.SyntaxKind.NullKeyword) return null;
      if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isSatisfiesExpression(node)) return literalValue(node.expression, visited);
      if (ts.isIdentifier(node)) {
        const symbol = checker.getSymbolAtLocation(node);
        const target = symbol && (symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol);
        const declaration = target?.valueDeclaration;
        if (declaration && ts.isVariableDeclaration(declaration) && declaration.initializer && ts.isVariableDeclarationList(declaration.parent) && (declaration.parent.flags & ts.NodeFlags.Const)) {
          return literalValue(declaration.initializer, visited);
        }
      }
      if (ts.isPrefixUnaryExpression(node) && ts.isNumericLiteral(node.operand)) {
        if (node.operator === ts.SyntaxKind.MinusToken) return -Number(node.operand.text);
        if (node.operator === ts.SyntaxKind.PlusToken) return Number(node.operand.text);
      }
      if (ts.isArrayLiteralExpression(node)) {
        const values = node.elements.map((element) => literalValue(element, visited));
        return values.includes(unresolved) ? unresolved : values;
      }
      if (ts.isObjectLiteralExpression(node)) {
        const entries: [string, unknown][] = [];
        for (const property of node.properties) {
          if (!ts.isPropertyAssignment(property) || ts.isComputedPropertyName(property.name)) return unresolved;
          const value = literalValue(property.initializer, visited);
          if (value === unresolved) return unresolved;
          entries.push([property.name.text, value]);
        }
        return Object.fromEntries(entries);
      }
      return unresolved;
    };

    const describeProps = (type: ts.Type, location: ts.Node, depth = 0): PropDoc[] =>
      checker.getPropertiesOfType(type).filter((symbol) => symbol.getName() !== 'key').map((symbol) => {
        const declaration = symbol.valueDeclaration ?? symbol.declarations?.[0];
        const propType = checker.getTypeOfSymbolAtLocation(symbol, declaration ?? location);
        const optional = (symbol.flags & ts.SymbolFlags.Optional) !== 0;
        const typeFlags = ts.TypeFormatFlags.NoTruncation | ts.TypeFormatFlags.UseAliasDefinedOutsideCurrentScope;
        const literalUnion = propType.isUnion() && propType.types.every((part) => Boolean(part.flags & (ts.TypeFlags.Literal | ts.TypeFlags.Null | ts.TypeFlags.Undefined)));
        const printedType = checker.typeToString(propType, undefined, typeFlags);
        const displayType = literalUnion && propType.isUnion()
          ? propType.types.filter((part) => !optional || !(part.flags & ts.TypeFlags.Undefined)).map((part) => checker.typeToString(part, undefined, typeFlags)).join(' | ').replace(/false \| true/g, 'boolean')
          : optional ? printedType.replace(/ \| undefined$/, '') : printedType;
        const parent = declaration?.parent;
        const inheritedFrom = declaration && (isExternal(declaration.getSourceFile().fileName) || !sources.includes(declaration.getSourceFile().fileName))
          ? parent && (ts.isInterfaceDeclaration(parent) || ts.isTypeAliasDeclaration(parent)) ? parent.name.text : path.basename(declaration.getSourceFile().fileName)
          : undefined;
        const memberType = checker.getNonNullableType(propType);
        const hasLocalMembers = !checker.isArrayType(memberType) && !checker.isTupleType(memberType) && !memberType.getCallSignatures().length && checker.getPropertiesOfType(memberType).some((member) => member.declarations?.some((node) => !isExternal(node.getSourceFile().fileName)));
        return {
          name: symbol.getName(),
          type: displayType || 'unknown',
          typeUnavailable: false,
          required: !optional,
          defaultValue: null,
          description: ts.displayPartsToString(symbol.getDocumentationComment(checker)).trim(),
          inheritedFrom,
          tags: symbol.getJsDocTags(checker).filter((tag) => ['deprecated', 'since', 'example'].includes(tag.name)).map((tag) => ({ name: tag.name, text: ts.displayPartsToString(tag.text) })),
          members: depth === 0 && (symbol.getName() === 'slotProps' || (!inheritedFrom && hasLocalMembers)) ? describeProps(memberType, location, depth + 1) : undefined,
        };
      }).sort(compareProps);

    const visitComponent = (type: ts.Type, label: string, location: ts.Node, depth = 0) => {
      const signature = type.getCallSignatures()[0];
      if (signature) {
        const parameter = signature.getParameters()[0];
        if (parameter) {
          const declaration = signature.getDeclaration();
          const propsType = checker.getTypeOfSymbolAtLocation(parameter, declaration ?? location);
          const props = describeProps(propsType, declaration ?? location);
          const binding = declaration?.parameters[0]?.name;
          const readDefaults = (elements: readonly ts.BindingElement[]) => {
            for (const element of elements) {
              const prop = props.find((item) => item.name === (element.propertyName ?? element.name).getText());
              if (prop && element.initializer && element.initializer.getText() !== 'undefined') {
                const value = literalValue(element.initializer);
                prop.defaultValue = value === unresolved ? element.initializer.getText() : JSON.stringify(value) ?? null;
              }
            }
          };
          if (binding && ts.isObjectBindingPattern(binding)) readDefaults(binding.elements);
          const parameterNames = binding && ts.isIdentifier(binding) ? [binding.text] : binding && ts.isObjectBindingPattern(binding)
            ? binding.elements.filter((element) => element.dotDotDotToken && ts.isIdentifier(element.name)).map((element) => element.name.getText()) : [];
          const readBodyDefaults = (node: ts.Node) => {
            if (ts.isFunctionLike(node) && node !== declaration) return;
            if (ts.isVariableDeclaration(node) && ts.isObjectBindingPattern(node.name) && node.initializer) {
              const input = ts.isCallExpression(node.initializer) ? node.initializer.arguments : [node.initializer];
              if (input.some((argument) => ts.isIdentifier(argument) && parameterNames.includes(argument.text))) {
                const inputType = checker.getTypeAtLocation(node.initializer);
                const elements = node.name.elements.filter((element) => {
                  const name = (element.propertyName ?? element.name).getText();
                  const original = propsType.getProperty(name);
                  const projected = inputType.getProperty(name);
                  return original?.declarations?.some((item) => projected?.declarations?.includes(item));
                });
                readDefaults(elements);
              }
            }
            ts.forEachChild(node, readBodyDefaults);
          };
          if (declaration) {
            ts.forEachChild(declaration, readBodyDefaults);
          }
          tables.push({ name: label, props });
        }
      }
      if (depth >= 2) return;
      for (const member of checker.getPropertiesOfType(type)) {
        const memberType = checker.getTypeOfSymbolAtLocation(member, member.valueDeclaration ?? location);
        if (memberType.getCallSignatures().length > 0 && !['bind', 'call', 'apply'].includes(member.getName())) {
          visitComponent(memberType, `${label}.${member.getName()}`, location, depth + 1);
        }
      }
    };
    for (const file of sources) {
      const source = program.getSourceFile(file);
      const module = source && checker.getSymbolAtLocation(source);
      if (!source || !module) continue;
      for (const symbol of checker.getExportsOfModule(module)) {
        if (symbol.getName() !== entryName && symbol.getName() !== 'default') continue;
        const target = symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
        visitComponent(checker.getTypeOfSymbolAtLocation(target, target.valueDeclaration ?? source), entryName, source);
      }
    }
    return tables;
  };

  const mergePropsTables = (tables: ComponentPropsDoc[]): ComponentPropsDoc[] => {
    const byName = new Map<string, ComponentPropsDoc>();
    for (const table of tables) {
      const existing = byName.get(table.name);
      if (!existing) byName.set(table.name, table);
      else {
        const props = new Map(existing.props.filter((prop) => prop.name !== 'key').map((prop) => [prop.name, prop]));
        for (const prop of table.props) {
          const previous = props.get(prop.name);
          props.set(prop.name, { ...previous, ...prop, defaultValue: prop.defaultValue ?? previous?.defaultValue ?? null });
        }
        byName.set(table.name, { ...existing, ...table, props: [...props.values()].sort(compareProps) });
      }
    }
    return [...byName.values()].sort((a, b) => a.name.split('.').length - b.name.split('.').length || a.name.localeCompare(b.name));
  };

  const propsCode = (slug: string) =>
    `export const components = ${JSON.stringify(collectProps(slug))};`;

  const propsIndexCode = () => `
export function loadProps(slug) {
  switch (slug) {
${catalog.entries.map((entry) => `    case ${JSON.stringify(entry.slug)}: return import(${JSON.stringify(`${VIRTUAL_PREFIX}props/${entry.slug}`)});`).join('\n')}
    default: return Promise.resolve({ components: [] });
  }
}
`;

  const guidanceFiles = new Map<string, string>();
  const indexGuidance = () => {
    guidanceFiles.clear();
    for (const dir of [config.guidance?.dir ?? []].flat()) {
      const directory = path.resolve(projectRoot, dir);
      if (!existsSync(directory)) continue;
      for (const file of readdirSync(directory)) {
        if (!file.endsWith('.md')) continue;
        guidanceFiles.set(file.slice(0, -'.md'.length), path.join(directory, file));
      }
    }
  };

  const guidanceIndexCode = () => `
export function loadGuidance(slug) {
  switch (slug) {
${[...guidanceFiles.keys()].map((slug) => `    case ${JSON.stringify(slug)}: return import(${JSON.stringify(`${VIRTUAL_PREFIX}guidance/${slug}`)});`).join('\n')}
    default: return Promise.resolve({ markdown: '' });
  }
}
`;

  const guidanceCode = (slug: string) => {
    const file = guidanceFiles.get(slug);
    const markdown = file ? readFileSync(file, 'utf8') : '';
    return `export const markdown = ${JSON.stringify(markdown)};`;
  };

  /**
   * The consumer's own code renderer, when it names one. Re-exported through a virtual module so
   * the engine's components can render code with the design system's block (and its highlighter)
   * without importing any design system itself.
   */
  const codeModuleCode = () => {
    const module = config.code?.module;
    if (!module) return 'export const provided = false;\nexport const Code = undefined;\n';
    const resolved = path.resolve(projectRoot, module);
    if (!existsSync(resolved)) {
      throw new Error(`storybook-docs: code.module "${module}" does not exist (looked in ${resolved})`);
    }
    return `import { lazy } from 'react';\nexport const Code = lazy(() => import(${JSON.stringify(resolved)}));\nexport const provided = true;\n`;
  };

  const releasesCode = () => {
    const readIfPresent = (candidate: string | undefined): string | null => {
      if (!candidate) return null;
      const resolved = path.resolve(projectRoot, candidate);
      return existsSync(resolved) ? readFileSync(resolved, 'utf8') : null;
    };
    let version = config.site.version ?? null;
    if (!version && config.releases?.versionFrom) {
      const manifest = readIfPresent(config.releases.versionFrom);
      if (manifest) {
        try {
          version = (JSON.parse(manifest) as { version?: string }).version ?? null;
        } catch {
          version = null;
        }
      }
    }
    const changelog = readIfPresent(config.releases?.changelog);
    return `export const releases = ${JSON.stringify({ version, changelog })};`;
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
      isBuild = resolved.command === 'build';
      projectRoot = options.root ?? resolved.root;
      catalog = buildCatalog(config, projectRoot);
      indexGuidance();
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
    buildStart() {
      propsCache.clear();
      programCaches.clear();
    },
    closeBundle() {
      programCaches.clear();
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
      if (name === 'catalog') return catalogCode();
      if (name === 'site') return siteCode();
      if (name === 'tokens') return tokensCode();
      if (name === 'global-styles') return globalStylesCode();
      if (name === 'stub-storybook-test') return STORYBOOK_TEST_STUB;
      if (name === 'props') return propsIndexCode();
      if (name.startsWith('props/')) return propsCode(name.slice('props/'.length));
      if (name === 'guidance') return guidanceIndexCode();
      if (name.startsWith('guidance/')) return guidanceCode(name.slice('guidance/'.length));
      if (name === 'releases') return releasesCode();
      if (name === 'code') return codeModuleCode();
      return null;
    },
  };
}

export default storybookDocs;
