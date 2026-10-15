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
  if (!name.startsWith(component)) return false;
  return name.length === component.length || name[component.length] !== name[component.length]!.toLowerCase();
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

  /** Parses every component declared in the folder — compound parts included. */
  const collect = (storyFile: string | undefined, entryName: string, slug: string, bases: { name: string; slug: string; storyFile: string }[] = []): { components: ComponentPropsDoc[]; uses: CatalogRef[] } => {
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
          console.warn(`storybook-docs: could not read props for "${slug}" (${String(cause)})`);
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
    const catalogOf = (symbol: ts.Symbol): CatalogRef | undefined => {
      const target = symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
      for (const declaration of target.declarations ?? []) {
        const file = declaration.getSourceFile().fileName;
        if (isExternal(file)) continue;
        let directory: string;
        try { directory = path.dirname(realpathSync(file)); } catch { continue; }
        if (directory === selfDirectory) continue;
        const base = baseContracts.find((item) => item.directory === directory);
        if (!base) continue;
        const parent = declaration.parent;
        const named = parent && (ts.isInterfaceDeclaration(parent) || ts.isTypeAliasDeclaration(parent) || ts.isClassDeclaration(parent) || ts.isFunctionDeclaration(parent))
          ? parent.name?.text ?? ''
          : '';
        if ([target.getName(), named].some((name) => ownsComponentName(base.name, name))) {
          return { name: base.name, slug: base.slug };
        }
      }
      return undefined;
    };
    const referencedCatalog = (type: ts.Type, seen = new Set<ts.Type>()): CatalogRef | undefined => {
      if (seen.has(type) || seen.size > 16) return undefined;
      seen.add(type);
      if (type.isUnion() || type.isIntersection()) {
        for (const part of type.types) {
          const found = referencedCatalog(part, seen);
          if (found) return found;
        }
        return undefined;
      }
      const symbol = type.aliasSymbol ?? type.getSymbol();
      const direct = symbol ? catalogOf(symbol) : undefined;
      if (direct) return direct;
      const args = [
        ...(type.aliasTypeArguments ?? []),
        ...((type.flags & ts.TypeFlags.Object) && ((type as ts.ObjectType).objectFlags & ts.ObjectFlags.Reference)
          ? checker.getTypeArguments(type as ts.TypeReference)
          : []),
      ];
      for (const arg of args) {
        const found = referencedCatalog(arg, seen);
        if (found) return found;
      }
      return undefined;
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
        const declarationName = declaration ? parent && (ts.isInterfaceDeclaration(parent) || ts.isTypeAliasDeclaration(parent)) ? parent.name.text : path.basename(declaration.getSourceFile().fileName) : undefined;
        const inheritedComponent = declaration ? baseContracts.find((base) =>
          base.declarations.has(declaration)
          && base.directory === path.dirname(realpathSync(declaration.getSourceFile().fileName)),
        ) : undefined;
        const inheritedFrom = declaration && (inheritedComponent || isExternal(declaration.getSourceFile().fileName) || !sources.includes(declaration.getSourceFile().fileName))
          ? declarationName
          : undefined;
        const memberType = checker.getNonNullableType(propType);
        const nonCallableAlternatives = propType.isUnion() ? propType.types
          .filter((part) => Boolean(part.flags & (ts.TypeFlags.Null | ts.TypeFlags.Undefined)) && (!optional || !(part.flags & ts.TypeFlags.Undefined)))
          .map((part) => checker.typeToString(part, undefined, typeFlags)) : [];
        const signatures = memberType.getCallSignatures().map((signature) => {
          const signatureType = checker.signatureToString(signature, location, typeFlags | ts.TypeFormatFlags.WriteArrowStyleSignature);
          return {
            type: nonCallableAlternatives.length ? `(${signatureType}) | ${nonCallableAlternatives.join(' | ')}` : signatureType,
            parameters: signature.getParameters().map((parameter) => ({
              name: parameter.getName(),
              type: checker.typeToString(checker.getTypeOfSymbolAtLocation(parameter, parameter.valueDeclaration ?? location), location, typeFlags),
              description: ts.displayPartsToString(parameter.getDocumentationComment(checker)).trim(),
            })),
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
        return {
          name: symbol.getName(),
          type: displayType || 'unknown',
          typeUnavailable: false,
          required: !optional,
          defaultValue: null,
          description: ts.displayPartsToString(symbol.getDocumentationComment(checker)).trim(),
          inheritedFrom,
          inheritedComponent: inheritedComponent ? { name: inheritedComponent.name, slug: inheritedComponent.slug } : undefined,
          component: referencedCatalog(propType),
          part: depth === 0 ? undefined : partToken(symbol.getName()),
          signatures: signatures.length ? signatures : undefined,
          tags: symbol.getJsDocTags(checker).filter((tag) => ['deprecated', 'since', 'example'].includes(tag.name)).map((tag) => ({ name: tag.name, text: ts.displayPartsToString(tag.text) })),
          // A slot map is this component's contract even when the owner adopts it from a shared
          // seam, so both `slots` and `slotProps` expand wherever they are declared.
          members: depth === 0
            ? (symbol.getName() === 'slots' || symbol.getName() === 'slotProps' || (!inheritedFrom && hasLocalMembers)
              ? describeProps(memberType, location, depth + 1)
              : undefined)
            : depth === 1 && !inheritedFrom && ownedMembers ? describeProps(memberType, location, depth + 1) : undefined,
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

  return {
    collect,
    setBuildMode(value: boolean) { isBuild = value; },
    clearPrograms() { programCaches.clear(); },
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
      byName.set(table.name, { ...existing, ...table, props: [...props.values()].sort(compareProps) });
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
