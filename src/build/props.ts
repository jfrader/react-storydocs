import { readdirSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { withCompilerOptions } from 'react-docgen-typescript';
import ts from 'typescript';
import type { CatalogRef, ComponentPropsDoc, PropDoc } from '../prop-docs.js';
import { VIRTUAL_PREFIX } from './module-ids.ts';

function compareProps(a: PropDoc, b: PropDoc): number {
  return Number(Boolean(a.inheritedFrom)) - Number(Boolean(b.inheritedFrom))
    || Number(b.required) - Number(a.required)
    || a.name.localeCompare(b.name);
}

const isExternal = (fileName: string) => /(^|\/)node_modules\/(@types|typescript)(\/|$)/.test(fileName);

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
  skipChildrenPropWithoutDoc: false,
  // Keep the component's own props (and its local types); drop inherited DOM/React props and
  // the utility-type plumbing that TypeScript's own libs and DefinitelyTyped add. The check is
  // by *package*, not by "contains node_modules" — when a design system is consumed from
  // node_modules, that path test would drop every prop.
  propFilter: (prop: { parent?: { fileName?: string } }) => !isExternal(prop.parent?.fileName ?? ''),
});

export function toPropDoc(prop: unknown): PropDoc {
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
}

function ownsComponentName(component: string, name: string) {
  // A shared part type (`ToastPartProps`, `CardPartProps`) is NOT the component, even when it
  // lives in that component's folder; the link would promise a default renderer that is false.
  // A root contract (`SurfaceRootSlotProps`, `GameCardRootProps`) IS that component's material.
  return name === component
    || name === `${component}Props`
    || name === `${component}SlotProps`
    || name === `${component}RootSlotProps`;
}

function capitalizedValueImport(clause: ts.ImportClause) {
  if (clause.name && /^[A-Z]/.test(clause.name.text)) return true;
  const named = clause.namedBindings;
  if (!named || !ts.isNamedImports(named)) return false;
  return named.elements.some((element) => !element.isTypeOnly && /^[A-Z]/.test((element.propertyName ?? element.name).text));
}

/** Capitalized value imports whose module lives in another catalog component's folder. */
export function referencedUses(
  sources: string[],
  bases: { name: string; slug: string; storyFile: string }[],
  selfDirectory: string,
): CatalogRef[] {
  const catalogs = bases.flatMap((base) => {
    try {
      const directory = path.dirname(realpathSync(base.storyFile));
      return directory === selfDirectory ? [] : [{ ...base, directory }];
    } catch {
      return [];
    }
  });
  const uses = new Map<string, CatalogRef>();
  for (const file of sources) {
    const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const visit = (node: ts.Node) => {
      if (ts.isImportDeclaration(node) && node.importClause && !node.importClause.isTypeOnly && ts.isStringLiteral(node.moduleSpecifier)) {
        // A linked design system resolves inside `node_modules`, so `isExternalLibraryImport` is
        // true for its own source. The catalog directory is the real test, not that flag.
        const resolved = ts.resolveModuleName(node.moduleSpecifier.text, file, TYPE_PROPS_COMPILER_OPTIONS, ts.sys).resolvedModule;
        if (resolved) {
          try {
            const directory = path.dirname(realpathSync(resolved.resolvedFileName));
            const base = catalogs.find((item) => item.directory === directory);
            if (base && capitalizedValueImport(node.importClause)) uses.set(base.slug, { name: base.name, slug: base.slug });
          } catch {
            // A missing import is not a relationship.
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return [...uses.values()];
}

export function createPropsCollector() {
  let isBuild = false;
  const componentDirectories = new Map<string, string | null>();
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
    // Do not thread the previous program through: its type caches accumulate across every
    // component and dominate the docs build's heap. The host still reuses parsed source text.
    cache.program = ts.createProgram(sources, compilerOptions, cache.host);
    return cache.program;
  };

  const resolveComponentDirectory = (storyFile: string, componentName: string): string | null => {
    const key = `${storyFile}\0${componentName}`;
    if (componentDirectories.has(key)) return componentDirectories.get(key)!;
    let directory: string | null = null;
    try {
      const program = createPropsProgram([storyFile], TYPE_PROPS_COMPILER_OPTIONS);
      const checker = program.getTypeChecker();
      const source = program.getSourceFile(storyFile);
      for (const statement of source?.statements ?? []) {
        if (!ts.isImportDeclaration(statement) || !statement.importClause) continue;
        const clause = statement.importClause;
        const named = clause.namedBindings;
        const binding = clause.name?.text === componentName ? clause.name
          : named && ts.isNamedImports(named)
            ? named.elements.find((element) => (element.propertyName ?? element.name).text === componentName || element.name.text === componentName)?.name
            : undefined;
        if (!binding) continue;
        const symbol = checker.getSymbolAtLocation(binding);
        const target = symbol && (symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol);
        const file = target?.declarations?.[0]?.getSourceFile().fileName;
        if (file) directory = path.dirname(realpathSync(file));
        break;
      }
    } catch { /* Unresolved components keep the story directory. */ }
    componentDirectories.set(key, directory);
    return directory;
  };
  /** Parses every component declared in the folder — compound parts included. */
  const collect = (storyFile: string | undefined, entryName: string, slug: string, bases: { name: string; slug: string; storyFile: string }[] = [], componentName?: string | null): { components: ComponentPropsDoc[]; uses: CatalogRef[] } => {
    entryName = entryName.split('/').pop() ?? entryName;
    if (storyFile) {
      const storyDirectory = path.dirname(storyFile);
      const readSources = (folder: string) => readdirSync(folder)
        .filter((file) => /\.tsx?$/.test(file) && !/\.stories\.tsx?$/.test(file))
        .map((file) => path.join(folder, file));
      // Follow the imported component first. The story folder is only the fallback; a helper
      // file beside the stories must not hide a component that lives elsewhere.
      let directory = (componentName && resolveComponentDirectory(storyFile, componentName)) || storyDirectory;
      let sources = readSources(directory);
      if (!sources.length && directory !== storyDirectory) {
        directory = storyDirectory;
        sources = readSources(directory);
      }
      if (sources.length > 0) {
        try {
          const parsed = docgen
            .parseWithProgramProvider(sources, () => createPropsProgram(sources, DOCGEN_COMPILER_OPTIONS))
            .map((result) => ({
              name: result.displayName,
              description: result.description || undefined,
              props: Object.values(result.props ?? {})
                .map(toPropDoc)
                .sort(compareProps),
            }))
            .filter((component) => component.props.length > 0);
          // The same component is often reported twice (declaration + index re-export).
          // Candidates that do not belong to this component (helpers, unrelated types)
          // are dropped when a name-matching candidate exists.
          const matchesOwnName = (name: string) =>
            entryName.length > 0 && name.toLowerCase().startsWith(entryName.toLowerCase());
          const relevant = parsed.some((component) => matchesOwnName(component.name))
            ? parsed.filter((component) => matchesOwnName(component.name))
            : parsed;
          const typed = collectTypeProps(sources, entryName, bases, slug);
          let selfDirectory = directory;
          try { selfDirectory = realpathSync(directory); } catch { /* the story path is enough */ }
          return {
            components: mergePropsTables(typed.length > 0
              ? [...relevant.filter((table) => typed.some((item) => item.name === table.name)), ...typed]
              : relevant),
            uses: referencedUses(sources, bases, selfDirectory),
          };
        } catch (cause) {
          console.warn(`react-storydocs: could not read props for "${slug}" (${String(cause)})`);
        }
      }
    }
    return { components: [], uses: [] };
  };

  /** Follow callable exports and their members, not unrelated exported helper types. */
  const collectTypeProps = (sources: string[], entryName: string, bases: { name: string; slug: string; storyFile: string }[], slug = ''): ComponentPropsDoc[] => {
    const program = createPropsProgram(sources, TYPE_PROPS_COMPILER_OPTIONS);
    const checker = program.getTypeChecker();
    const tables: ComponentPropsDoc[] = [];
    const baseContracts = bases.filter((base) => base.name !== entryName).map((base) => ({
      ...base,
      directory: path.dirname(realpathSync(base.storyFile)),
      declarations: new Set<ts.Declaration>(),
    }));
    const readContract = (type: ts.Type, location: ts.Node, declarations: Set<ts.Declaration>, depth = 0) => {
      for (const signature of type.getCallSignatures()) {
        const parameter = signature.getParameters()[0];
        if (!parameter) continue;
        const propsType = checker.getTypeOfSymbolAtLocation(parameter, signature.getDeclaration() ?? location);
        for (const prop of checker.getPropertiesOfType(propsType)) {
          prop.declarations?.forEach((declaration) => declarations.add(declaration));
        }
      }
      if (depth >= 2) return;
      for (const member of checker.getPropertiesOfType(type)) {
        if (['bind', 'call', 'apply'].includes(member.getName())) continue;
        const memberType = checker.getTypeOfSymbolAtLocation(member, member.valueDeclaration ?? location);
        if (memberType.getCallSignatures().length) readContract(memberType, location, declarations, depth + 1);
      }
    };
    for (const source of program.getSourceFiles()) {
      if (isExternal(source.fileName)) continue;
      const directory = path.dirname(realpathSync(source.fileName));
      const candidates = baseContracts.filter((base) => base.directory === directory);
      if (!candidates.length) continue;
      const module = checker.getSymbolAtLocation(source);
      if (!module) continue;
      for (const symbol of checker.getExportsOfModule(module)) {
        for (const base of candidates.filter((candidate) => candidate.name === symbol.getName())) {
          const target = symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
          readContract(checker.getTypeOfSymbolAtLocation(target, target.valueDeclaration ?? source), source, base.declarations);
        }
      }
    }

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

    const selfDirectory = sources[0] ? path.dirname(realpathSync(sources[0])) : '';
    // Generated parts carry their own data-ui token in this component's source. The token is the
    // honest answer to "what does this slot render by default?".
    const parts = new Map<string, string>();
    for (const file of sources) {
      for (const match of readFileSync(file, 'utf8').matchAll(/data-ui="([a-z0-9-]+)"/g)) {
        const token = match[1]!;
        const key = token.startsWith(`${slug}-`) ? token.slice(slug.length + 1) : token;
        if (!parts.has(key)) parts.set(key, token);
      }
    }
    const partToken = (key: string) => parts.get(key) ?? parts.get(key.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase());
    const catalogOf = (symbol: ts.Symbol, requireOwnName = true): CatalogRef | undefined => {
      const target = symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
      for (const declaration of target.declarations ?? []) {
        const file = declaration.getSourceFile().fileName;
        if (isExternal(file)) continue;
        let directory: string;
        try { directory = path.dirname(realpathSync(file)); } catch { continue; }
        if (directory === selfDirectory) continue;
        const base = baseContracts.find((item) => item.directory === directory);
        if (!base) continue;
        if (!requireOwnName || ownsComponentName(base.name, target.getName())) {
          return { name: base.name, slug: base.slug };
        }
      }
      return undefined;
    };
    const htmlTags = new Map<string, string[]>();
    for (const source of program.getSourceFiles()) {
      if (!source.fileName.endsWith('/lib.dom.d.ts')) continue;
      for (const node of source.statements) {
        if (!ts.isInterfaceDeclaration(node) || node.name.text !== 'HTMLElementTagNameMap') continue;
        for (const member of node.members) {
          if (!ts.isPropertySignature(member) || !member.type || !ts.isStringLiteral(member.name)) continue;
          const name = checker.getTypeFromTypeNode(member.type).getSymbol()?.getName();
          if (name) htmlTags.set(name, [...(htmlTags.get(name) ?? []), member.name.text]);
        }
      }
    }
    type SlotDefault = Pick<PropDoc, 'component' | 'defaultElement'>;
    const uniformDefault = (values: (SlotDefault | undefined)[]): SlotDefault | undefined => {
      const component = values.find((value) => value?.component);
      if (component) return component;
      const element = values[0]?.defaultElement;
      return element && values.every((value) => value?.defaultElement === element) ? { defaultElement: element } : undefined;
    };
    const defaultFromType = (type: ts.Type, seen = new Set<ts.Type>()): SlotDefault | undefined => {
      if (seen.has(type) || seen.size > 32) return undefined;
      const visited = new Set(seen).add(type);
      const symbol = type.aliasSymbol ?? type.getSymbol();
      const component = symbol ? catalogOf(symbol) : undefined;
      if (component) return { component };
      if (type.isUnion()) return uniformDefault(type.types.map((part) => defaultFromType(part, visited)));
      if (type.isIntersection()) {
        const values = type.types.map((part) => defaultFromType(part, visited));
        return values.find((value) => value?.component) ?? values.find((value) => value !== undefined);
      }
      const tags = htmlTags.get(type.getSymbol()?.getName() ?? '');
      if (tags?.length === 1) return { defaultElement: tags[0] };
      const args = [
        ...(type.aliasTypeArguments ?? []),
        ...((type.flags & ts.TypeFlags.Object) && ((type as ts.ObjectType).objectFlags & ts.ObjectFlags.Reference)
          ? checker.getTypeArguments(type as ts.TypeReference) : []),
      ];
      for (const arg of args) {
        const value = defaultFromType(arg, visited);
        if (value) return value;
      }
      return undefined;
    };
    const defaultFromNode = (node: ts.TypeNode, seen = new Set<ts.Node>()): SlotDefault | undefined => {
      if (seen.has(node) || seen.size > 32) return undefined;
      const visited = new Set(seen).add(node);
      if (ts.isParenthesizedTypeNode(node)) return defaultFromNode(node.type, visited);
      if (ts.isUnionTypeNode(node)) return uniformDefault(node.types.map((part) => defaultFromNode(part, visited)));
      if (ts.isIntersectionTypeNode(node)) {
        const values = node.types.map((part) => defaultFromNode(part, visited));
        return values.find((value) => value?.component) ?? values.find((value) => value !== undefined);
      }
      if (ts.isIndexedAccessTypeNode(node) && ts.isTypeReferenceNode(node.objectType)
        && ['HTMLElementTagNameMap', 'HTMLTagNameMap'].includes(node.objectType.typeName.getText())
        && ts.isLiteralTypeNode(node.indexType) && ts.isStringLiteral(node.indexType.literal)) return { defaultElement: node.indexType.literal.text };
      if (ts.isTypeReferenceNode(node)) {
        const symbol = checker.getSymbolAtLocation(node.typeName);
        const target = symbol && (symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol);
        const component = target ? catalogOf(target) : undefined;
        if (component) return { component };
        const name = target?.getName();
        const argument = node.typeArguments?.[0];
        if (name === 'ComponentPropsWithRef' && argument && ts.isLiteralTypeNode(argument) && ts.isStringLiteral(argument.literal)) return { defaultElement: argument.literal.text };
        if ((name === 'ComponentType' || name === 'ElementType') && argument) return defaultFromNode(argument, visited);
        if (name === 'HTMLAttributes' || name === 'DetailedHTMLProps') {
          for (const argument of node.typeArguments ?? []) {
            const value = defaultFromNode(argument, visited);
            if (value) return value;
          }
        }
        for (const declaration of target?.declarations ?? []) {
          if (ts.isTypeAliasDeclaration(declaration) && !declaration.typeParameters?.length) {
            return defaultFromNode(declaration.type, visited);
          }
        }
      }
      return defaultFromType(checker.getTypeFromTypeNode(node));
    };
    const defaultFromContract = (type: ts.Type, declaration: ts.Declaration | undefined): SlotDefault | undefined => {
      const node = declaration && ts.isPropertySignature(declaration) ? declaration.type : undefined;
      return (node ? defaultFromNode(node) : undefined) ?? defaultFromType(checker.getNonNullableType(type));
    };
    const slotCatalogs = (type: ts.Type, location: ts.Node): Map<string, SlotDefault> => {
      const catalogs = new Map<string, SlotDefault>();
      for (const name of ['slots', 'slotProps']) {
        const slots = type.getProperty(name);
        if (!slots) continue;
        const slotType = checker.getNonNullableType(checker.getTypeOfSymbolAtLocation(slots, location));
        for (const member of checker.getPropertiesOfType(slotType)) {
          const declaration = member.valueDeclaration ?? member.declarations?.[0];
          const value = defaultFromContract(checker.getTypeOfSymbolAtLocation(member, declaration ?? location), declaration);
          if (value?.component) catalogs.set(member.getName(), value);
        }
      }
      return catalogs;
    };
    const slotsObject = (node: ts.Expression, source: ts.SourceFile, seen = new Set<ts.Node>()): ts.ObjectLiteralExpression | undefined => {
      if (seen.has(node) || seen.size > 32) return undefined;
      const visited = new Set(seen).add(node);
      if (ts.isObjectLiteralExpression(node)) return node;
      if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isSatisfiesExpression(node)) return slotsObject(node.expression, source, visited);
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
        && node.expression.expression.getText() === 'Object' && node.expression.name.text === 'freeze' && node.arguments.length === 1) {
        return slotsObject(node.arguments[0]!, source, visited);
      }
      if (ts.isIdentifier(node)) {
        const declaration = checker.getSymbolAtLocation(node)?.valueDeclaration;
        if (declaration && declaration.getSourceFile() === source && ts.isVariableDeclaration(declaration)
          && declaration.initializer && ts.isVariableDeclarationList(declaration.parent) && (declaration.parent.flags & ts.NodeFlags.Const)) {
          return slotsObject(declaration.initializer, source, visited);
        }
      }
      return undefined;
    };
    const displayNameOf = (target: ts.Symbol): string | undefined => {
      const source = target.valueDeclaration?.getSourceFile();
      if (!source) return undefined;
      let displayName: string | undefined;
      const visit = (node: ts.Node) => {
        if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken
          && ts.isPropertyAccessExpression(node.left) && node.left.name.text === 'displayName'
          && checker.getSymbolAtLocation(node.left.expression) === target && ts.isStringLiteral(node.right)) {
          displayName = node.right.text;
        }
        ts.forEachChild(node, visit);
      };
      visit(source);
      return displayName;
    };
    const defaultFromValue = (node: ts.Expression, symbol?: ts.Symbol): SlotDefault | undefined => {
      if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isSatisfiesExpression(node)) return defaultFromValue(node.expression);
      if (ts.isStringLiteral(node)) return { defaultElement: node.text };
      if (!ts.isIdentifier(node) || !/^[A-Z]/.test(node.text)) return undefined;
      const reference = symbol ?? checker.getSymbolAtLocation(node);
      const target = reference && (reference.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(reference) : reference);
      const type = checker.getTypeAtLocation(node);
      if (!target?.declarations?.length || !(type.getCallSignatures().length || type.getConstructSignatures().length)) return undefined;
      const component = catalogOf(target, false);
      return component ? { component } : { defaultElement: displayNameOf(target) ?? node.text };
    };
    const nullishOperands = (node: ts.Expression): ts.Expression[] => {
      if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isSatisfiesExpression(node)) return nullishOperands(node.expression);
      return ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken
        ? [...nullishOperands(node.left), ...nullishOperands(node.right)] : [node];
    };
    const bodySlotDefaults = new Map<ts.Declaration, SlotDefault>();
    for (const file of sources) {
      const source = program.getSourceFile(file);
      if (!source) continue;
      const visit = (node: ts.Node) => {
        if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && /^[A-Z]/.test(node.name.text) && node.initializer) {
          const [access, ...fallbacks] = nullishOperands(node.initializer);
          if (access && ts.isPropertyAccessExpression(access)) {
            const member = checker.getSymbolAtLocation(access.name);
            const value = fallbacks.map((fallback) => defaultFromValue(fallback)).find((value) => value !== undefined);
            if (value) for (const declaration of member?.declarations ?? []) {
              if (!bodySlotDefaults.has(declaration)) bodySlotDefaults.set(declaration, value);
            }
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(source);
    }
    const valueSlotDefaults = (declaration: ts.SignatureDeclaration | undefined, propsType: ts.Type): Map<string, SlotDefault> => {
      const defaults = new Map<string, SlotDefault>();
      if (!declaration) return defaults;
      const source = declaration.getSourceFile();
      let object: ts.ObjectLiteralExpression | undefined;
      const binding = declaration.parameters[0]?.name;
      if (binding && ts.isObjectBindingPattern(binding)) {
        const slot = binding.elements.find((element) => (element.propertyName ?? element.name).getText() === 'slots');
        if (slot?.initializer) object = slotsObject(slot.initializer, source);
      }
      const visit = (node: ts.Node) => {
        if (object || (ts.isFunctionLike(node) && node !== declaration)) return;
        if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken
          && (ts.isIdentifier(node.left) ? node.left.text === 'slots' : ts.isPropertyAccessExpression(node.left) && node.left.name.text === 'slots')) {
          object = slotsObject(node.right, source);
        }
        ts.forEachChild(node, visit);
      };
      visit(declaration);
      for (const property of object?.properties ?? []) {
        if ((!ts.isPropertyAssignment(property) && !ts.isShorthandPropertyAssignment(property)) || ts.isComputedPropertyName(property.name)) continue;
        const value = ts.isPropertyAssignment(property) ? property.initializer : property.name;
        const symbol = ts.isShorthandPropertyAssignment(property) ? checker.getShorthandAssignmentValueSymbol(property) : undefined;
        const element = defaultFromValue(value, symbol);
        if (element) defaults.set(property.name.text, element);
      }
      const slots = propsType.getProperty('slots');
      if (slots) {
        const type = checker.getNonNullableType(checker.getTypeOfSymbolAtLocation(slots, declaration));
        for (const member of checker.getPropertiesOfType(type)) {
          const value = member.declarations?.map((item) => bodySlotDefaults.get(item)).find((value) => value !== undefined);
          if (value && !defaults.has(member.getName())) defaults.set(member.getName(), value);
        }
      }
      return defaults;
    };

    const describe = (symbol: ts.Symbol): string =>
      ts.displayPartsToString(symbol.getDocumentationComment(checker)).trim();

    const describeComponent = (symbol: ts.Symbol, seen = new Set<ts.Symbol>()): string => {
      if (seen.has(symbol)) return '';
      seen.add(symbol);
      if (symbol.flags & ts.SymbolFlags.Alias) return describeComponent(checker.getAliasedSymbol(symbol), seen);
      const own = describe(symbol);
      if (own) return own;
      for (const declaration of symbol.declarations ?? []) {
        const value = ts.isPropertyAssignment(declaration) ? declaration.initializer : undefined;
        const target = value && ts.isIdentifier(value) ? checker.getSymbolAtLocation(value)
          : ts.isShorthandPropertyAssignment(declaration) ? checker.getShorthandAssignmentValueSymbol(declaration) : undefined;
        if (target) {
          const description = describeComponent(target, seen);
          if (description) return description;
        }
      }
      return '';
    };

    const nativeFromProps = (type: ts.Type, location: ts.Node, node: ts.TypeNode | undefined): string | undefined => {
      const ref = type.getProperty('ref');
      if (ref) {
        const text = checker.typeToString(checker.getTypeOfSymbolAtLocation(ref, ref.valueDeclaration ?? location), undefined, ts.TypeFormatFlags.NoTruncation);
        const elements = new Set(Array.from(text.matchAll(/\bHTML\w*Element\b/g), (match) => match[0]));
        if (elements.size > 1) return undefined;
        if (elements.size) {
          const tags = Array.from(elements).flatMap((element) => htmlTags.get(element) ?? []);
          if (tags.length === 1) return tags[0];
        }
      }
      const tags = new Set<string>();
      const seen = new Set<ts.Node>();
      const visit = (node: ts.Node) => {
        if (seen.has(node)) return;
        seen.add(node);
        if (ts.isTypeReferenceNode(node) || ts.isExpressionWithTypeArguments(node)) {
          const name = ts.isTypeReferenceNode(node) ? node.typeName : node.expression;
          const symbol = checker.getSymbolAtLocation(name);
          const target = symbol && (symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol);
          const argument = node.typeArguments?.[0];
          if (target && ['ComponentPropsWithRef', 'ComponentProps'].includes(target.getName())
            && argument && ts.isLiteralTypeNode(argument) && ts.isStringLiteral(argument.literal)) {
            tags.add(argument.literal.text);
          } else {
            for (const declaration of target?.declarations ?? []) {
              if (ts.isTypeAliasDeclaration(declaration)) visit(declaration.type);
              if (ts.isInterfaceDeclaration(declaration)) declaration.heritageClauses?.forEach((clause) => clause.types.forEach(visit));
            }
          }
        } else if (ts.isIntersectionTypeNode(node) || ts.isUnionTypeNode(node)) node.types.forEach(visit);
        else if (ts.isParenthesizedTypeNode(node)) visit(node.type);
      };
      if (node) visit(node);
      return tags.size === 1 ? Array.from(tags)[0] : undefined;
    };

    const cleanComment = (text: string): string =>
      text.replace(/^\/\*\*?/, '').replace(/\*\/\s*$/, '')
        .split('\n').map((line) => line.replace(/^\s*\*\s?/, '')).join(' ')
        .replace(/\s+/g, ' ').trim();

    /**
     * `slotProps?: Partial<Record<'header' | 'body', …>>` synthesizes its keys, so the checker
     * reports no declarations for them. The comment is the block written before each literal, and
     * TypeScript attaches nothing to a literal inside a union: the gap between two members is what
     * carries it.
     */
    const partComments = (declaration: ts.Declaration | undefined): Map<string, string> => {
      const comments = new Map<string, string>();
      const typeNode = declaration && ts.isPropertySignature(declaration) ? declaration.type : undefined;
      if (!typeNode) return comments;
      const visited = new Set<ts.Node>();
      const scan = (node: ts.Node) => {
        if (visited.has(node)) return;
        visited.add(node);
        if (ts.isUnionTypeNode(node)) {
          const source = node.getSourceFile().getFullText();
          let previousEnd = node.getStart();
          for (const member of node.types) {
            const block = source.slice(previousEnd, member.getStart()).match(/\/\*\*[\s\S]*?\*\//)?.[0];
            const name = ts.isLiteralTypeNode(member) && ts.isStringLiteral(member.literal) ? member.literal.text : undefined;
            if (block && name) comments.set(name, cleanComment(block));
            previousEnd = member.getEnd();
          }
        }
        // `slotProps?: WidgetSlotProps` keeps the keys in the alias the name points at.
        const named = ts.isTypeReferenceNode(node) ? node.typeName : undefined;
        const symbol = named ? checker.getSymbolAtLocation(named) : undefined;
        for (const target of symbol?.declarations ?? []) {
          if (ts.isTypeAliasDeclaration(target)) scan(target.type);
        }
        ts.forEachChild(node, scan);
      };
      scan(typeNode);
      return comments;
    };

    const describeProps = (type: ts.Type, location: ts.Node, depth = 0, partDocs: Map<string, string> = new Map(), slotDefaults?: Map<string, SlotDefault>, catalogs?: Map<string, SlotDefault>, slotMember = false): PropDoc[] =>
      checker.getPropertiesOfType(type).filter((symbol) => {
        if (symbol.getName() === 'key') return false;
        // Nested types describe the design system's own contract; native DOM/React fields belong
        // to the element note ("Also accepts native <button> props"), not to every field list.
        if (depth === 0) return true;
        const declaration = symbol.valueDeclaration ?? symbol.declarations?.[0];
        return !declaration || !isExternal(declaration.getSourceFile().fileName);
      }).map((symbol) => {
        const declaration = symbol.valueDeclaration ?? symbol.declarations?.[0];
        const propType = checker.getTypeOfSymbolAtLocation(symbol, declaration ?? location);
        const optional = (symbol.flags & ts.SymbolFlags.Optional) !== 0;
        const typeFlags = ts.TypeFormatFlags.NoTruncation | ts.TypeFormatFlags.UseAliasDefinedOutsideCurrentScope;
        const literalUnion = propType.isUnion() && propType.types.every((part) => Boolean(part.flags & (ts.TypeFlags.Literal | ts.TypeFlags.Null | ts.TypeFlags.Undefined)));
        const printedType = checker.typeToString(propType, undefined, typeFlags);
        const displayType = (literalUnion && propType.isUnion()
          ? propType.types.filter((part) => !optional || !(part.flags & ts.TypeFlags.Undefined)).map((part) => checker.typeToString(part, undefined, typeFlags)).join(' | ').replace(/false \| true/g, 'boolean')
          : optional ? printedType.replace(/ \| undefined$/, '') : printedType).replace(/^NoInfer<(.*)>$/, '$1')
          .replace(/^\(\((.*)\) => (.*)\)$/, '($1) => $2');
        const parent = declaration?.parent;
        const declarationName = declaration ? parent && (ts.isInterfaceDeclaration(parent) || ts.isTypeAliasDeclaration(parent)) ? parent.name.text : path.basename(declaration.getSourceFile().fileName) : undefined;
        const inheritedComponent = declaration ? baseContracts.find((base) =>
          base.declarations.has(declaration)
          && base.directory === path.dirname(realpathSync(declaration.getSourceFile().fileName)),
        ) : undefined;
        const inheritedFrom = declaration && (inheritedComponent || isExternal(declaration.getSourceFile().fileName) || !sources.includes(declaration.getSourceFile().fileName))
          ? declarationName
          : undefined;
        const memberType = checker.getNonNullableType(propType);
        // Any array of local records is a contract readers need to inspect. Native/external
        // element shapes collapse to no members, and the size cap keeps the docs build bounded.
        const elementType = depth === 0 ? checker.getIndexTypeOfType(memberType, ts.IndexKind.Number) : undefined;
        const elementMembersRaw = elementType ? describeProps(elementType, location, depth + 1) : undefined;
        const elementMembers = elementMembersRaw && elementMembersRaw.length <= 20 ? elementMembersRaw : undefined;
        const nonCallableAlternatives = propType.isUnion() ? propType.types
          .filter((part) => Boolean(part.flags & (ts.TypeFlags.Null | ts.TypeFlags.Undefined)) && (!optional || !(part.flags & ts.TypeFlags.Undefined)))
          .map((part) => checker.typeToString(part, undefined, typeFlags)) : [];
        const signatures = memberType.getCallSignatures().map((signature) => {
          const signatureType = checker.signatureToString(signature, location, typeFlags | ts.TypeFormatFlags.WriteArrowStyleSignature);
          return {
            type: nonCallableAlternatives.length ? `(${signatureType}) | ${nonCallableAlternatives.join(' | ')}` : signatureType,
            parameters: signature.getParameters().map((parameter) => {
              const parameterType = checker.getTypeOfSymbolAtLocation(parameter, parameter.valueDeclaration ?? location);
              const nonNullParameter = checker.getNonNullableType(parameterType);
              const parameterSymbol = nonNullParameter.aliasSymbol ?? nonNullParameter.getSymbol();
              const parameterLocal = parameterSymbol?.declarations?.some((node) => !isExternal(node.getSourceFile().fileName)) ?? false;
              const parameterProperties = checker.getPropertiesOfType(nonNullParameter).filter((member) => {
                const memberDeclaration = member.valueDeclaration ?? member.declarations?.[0];
                return !memberDeclaration || !isExternal(memberDeclaration.getSourceFile().fileName);
              });
              const parameterShape = parameterLocal
                && parameterProperties.length <= 20
                && Boolean(nonNullParameter.flags & (ts.TypeFlags.Object | ts.TypeFlags.Intersection))
                && !checker.isArrayType(nonNullParameter)
                && !checker.isTupleType(nonNullParameter)
                && nonNullParameter.getCallSignatures().length === 0;
              const parameterMembers = parameterShape ? describeProps(parameterType, location, 2) : undefined;
              return {
                name: parameter.getName(),
                type: checker.typeToString(parameterType, location, typeFlags),
                description: ts.displayPartsToString(parameter.getDocumentationComment(checker)).trim(),
                members: parameterMembers?.length ? parameterMembers : undefined,
              };
            }),
          };
        });
        const objectTypes = memberType.isUnion() ? memberType.types : [memberType];
        const shape = objectTypes.every((part) => Boolean(part.flags & (ts.TypeFlags.Object | ts.TypeFlags.Intersection)))
          && !checker.isArrayType(memberType) && !checker.isTupleType(memberType) && !signatures.length;
        const properties = shape ? checker.getPropertiesOfType(memberType) : [];
        const declaredIn = (member: ts.Symbol, files: string[]) =>
          Boolean(member.declarations?.some((node) => files.includes(node.getSourceFile().fileName)));
        const hasLocalMembers = properties.some((member) => member.declarations?.some((node) => !isExternal(node.getSourceFile().fileName)));
        // A slot's own contract expands only when this component declares it: the generated part
        // accepts the family's part props, while a slot typed as another component's props links
        // to that component instead of restating its whole DOM surface.
        const ownedMembers = properties.length > 0 && properties.every((member) => declaredIn(member, sources));
        const isSlotMap = ['slots', 'slotProps'].includes(symbol.getName());
        const contractDefault = defaultFromContract(propType, declaration);
        const slotDefault = slotDefaults
          ? contractDefault ?? catalogs?.get(symbol.getName()) ?? slotDefaults.get(symbol.getName())
          : contractDefault?.component ? contractDefault : undefined;
        return {
          name: symbol.getName(),
          type: displayType || 'unknown',
          typeUnavailable: false,
          required: !optional,
          defaultValue: null,
          description: describe(symbol) || partDocs.get(symbol.getName()) || '',
          inheritedFrom,
          inheritedComponent: inheritedComponent ? { name: inheritedComponent.name, slug: inheritedComponent.slug } : undefined,
          component: slotDefault?.component,
          defaultElement: slotDefault?.defaultElement,
          part: depth === 0 ? undefined : partToken(symbol.getName()),
          signatures: signatures.length ? signatures : undefined,
          element: elementMembers?.length ? { type: checker.typeToString(elementType as ts.Type, undefined, typeFlags), members: elementMembers } : undefined,
          tags: symbol.getJsDocTags(checker).filter((tag) => ['deprecated', 'since', 'example'].includes(tag.name)).map((tag) => ({ name: tag.name, text: ts.displayPartsToString(tag.text) })),
          // A slot map is this component's contract even when the owner adopts it from a shared
          // seam, so both `slots` and `slotProps` expand wherever they are declared.
          members: depth === 0
            ? (isSlotMap || (!inheritedFrom && hasLocalMembers)
              ? describeProps(memberType, location, depth + 1, partComments(declaration), isSlotMap ? valueSlotDefaults(ts.isFunctionLike(location) ? location : undefined, type) : undefined, isSlotMap ? slotCatalogs(type, location) : undefined, true)
              : undefined)
            : depth === 1 && ((slotMember && !inheritedComponent && hasLocalMembers && properties.length <= 20) || (!inheritedFrom && ownedMembers)) ? describeProps(memberType, location, depth + 1) : undefined,
        };
      }).sort(compareProps);

    const visitComponent = (type: ts.Type, label: string, location: ts.Node, symbol: ts.Symbol, depth = 0) => {
      const typeFlags = ts.TypeFormatFlags.NoTruncation | ts.TypeFormatFlags.UseAliasDefinedOutsideCurrentScope;
      const callSignatures = type.getCallSignatures();
      if (callSignatures.length > 0) {
        const rows = new Map<string, { prop: PropDoc; signature: number }>();
        const exclusions = new Map<string, number[]>();
        const propsTypes: ts.Type[] = [];
        let defaultsDeclaration: ts.SignatureDeclaration | undefined;
        for (const [index, signature] of callSignatures.entries()) {
          const parameter = signature.getParameters()[0];
          if (!parameter) continue;
          const declaration = signature.getDeclaration();
          const propsType = checker.getTypeOfSymbolAtLocation(parameter, declaration ?? location);
          propsTypes.push(propsType);
          for (const row of describeProps(propsType, declaration ?? location)) {
            const excluded = row.type === 'never' || row.type === 'undefined';
            if (excluded) exclusions.set(row.name, [...(exclusions.get(row.name) ?? []), index]);
            const previous = rows.get(row.name);
            if (!previous) rows.set(row.name, { prop: row, signature: index });
            else if ((previous.prop.type === 'never' || previous.prop.type === 'undefined') && !excluded) {
              rows.set(row.name, { prop: row, signature: index });
            }
          }
          const binding = declaration?.parameters[0]?.name;
          if (!defaultsDeclaration && binding && ts.isObjectBindingPattern(binding)) defaultsDeclaration = declaration;
        }
        const props = [...rows.values()].map(({ prop, signature }) => {
          const excluded = exclusions.get(prop.name) ?? [];
          // Only mark a prop when the other overload excludes it; shared props stay unmarked.
          return callSignatures.length > 1 && excluded.length > 0 && !excluded.includes(signature)
            ? { ...prop, signature }
            : prop;
        }).sort(compareProps);
        const propsType = propsTypes[0];
        if (propsType) {
          const declaration = defaultsDeclaration ?? callSignatures[0]?.getDeclaration();
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
          if (declaration) ts.forEachChild(declaration, readBodyDefaults);
          // Family defaults: a root forwards props to the part that owns the initializer. Read the
          // component folder's own binding defaults so the table does not print `—` for a real one.
          const sourceDefaults = new Map<string, string>();
          for (const file of sources) {
            const source = program.getSourceFile(file);
            if (!source) continue;
            const visit = (node: ts.Node) => {
              if (ts.isBindingElement(node) && node.initializer && node.initializer.getText() !== 'undefined') {
                const name = (node.propertyName ?? node.name).getText();
                if (!sourceDefaults.has(name)) {
                  const value = literalValue(node.initializer);
                  sourceDefaults.set(name, value === unresolved ? node.initializer.getText() : JSON.stringify(value) ?? null);
                }
              }
              ts.forEachChild(node, visit);
            };
            visit(source);
          }
          for (const prop of props) {
            if (prop.defaultValue === null && sourceDefaults.has(prop.name)) prop.defaultValue = sourceDefaults.get(prop.name)!;
          }
          const componentSymbol = type.getSymbol();
          const genericSignature = callSignatures.find((signature) => signature.typeParameters?.length);
          const typeParameters = (genericSignature?.typeParameters ?? []).map((parameter) => {
            const constraint = parameter.getConstraint();
            const fallback = parameter.getDefault();
            return {
              name: parameter.symbol?.getName() ?? '?',
              constraint: constraint ? checker.typeToString(constraint, undefined, typeFlags) : undefined,
              default: fallback ? checker.typeToString(fallback, undefined, typeFlags) : undefined,
            };
          });
          tables.push({
            name: label,
            description: describeComponent(symbol) || (componentSymbol ? describeComponent(componentSymbol) : '') || undefined,
            native: nativeFromProps(propsType, declaration ?? location, declaration?.parameters[0]?.type),
            typeParameters: typeParameters.length ? typeParameters : undefined,
            props,
          });
        }
      }
      if (depth >= 2) return;
      for (const member of checker.getPropertiesOfType(type)) {
        const memberType = checker.getTypeOfSymbolAtLocation(member, member.valueDeclaration ?? location);
        if (memberType.getCallSignatures().length > 0 && !['bind', 'call', 'apply'].includes(member.getName())) {
          visitComponent(memberType, `${label}.${member.getName()}`, location, member, depth + 1);
        }
      }
    };
    const exports: { symbol: ts.Symbol; source: ts.SourceFile }[] = [];
    for (const file of sources) {
      const source = program.getSourceFile(file);
      const module = source && checker.getSymbolAtLocation(source);
      if (!source || !module) continue;
      for (const symbol of checker.getExportsOfModule(module)) {
        exports.push({ symbol, source });
      }
    }
    const exact = exports.filter(({ symbol }) => symbol.getName() === entryName || symbol.getName() === 'default');
    const candidates = exact.length ? exact : exports.filter(({ symbol }) =>
      entryName.length > 0 && symbol.getName().toLowerCase().startsWith(entryName.toLowerCase()),
    );
    for (const { symbol, source } of candidates) {
      const target = symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
      visitComponent(checker.getTypeOfSymbolAtLocation(target, target.valueDeclaration ?? source), symbol.getName() === 'default' ? entryName : symbol.getName(), source, target);
    }
    return tables;
  };

  return {
    collect,
    setBuildMode(value: boolean) { isBuild = value; },
    clearPrograms() { programCaches.clear(); componentDirectories.clear(); },
  };
}

export function mergePropsTables(tables: ComponentPropsDoc[]): ComponentPropsDoc[] {
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
      byName.set(table.name, { ...existing, ...table, typeParameters: table.typeParameters ?? existing.typeParameters, props: [...props.values()].sort(compareProps) });
    }
  }
  return [...byName.values()].sort((a, b) => a.name.split('.').length - b.name.split('.').length || a.name.localeCompare(b.name));
}

export function propsCode(components: ComponentPropsDoc[], uses: CatalogRef[] = []): string {
  return `export const components = ${JSON.stringify(components)};\nexport const uses = ${JSON.stringify(uses)};`;
}

export function propsIndexCode(slugs: Iterable<string>): string {
  return `
export function loadProps(slug) {
  switch (slug) {
${[...slugs].map((slug) => `    case ${JSON.stringify(slug)}: return import(${JSON.stringify(`${VIRTUAL_PREFIX}props/${slug}`)});`).join('\n')}
    default: return Promise.resolve({ components: [], uses: [] });
  }
}
`;
}
