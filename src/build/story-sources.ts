import ts from 'typescript';
import { VIRTUAL_PREFIX } from './module-ids.ts';
import { STORY_EXCERPT } from '../sections.ts';
import { snippetProgram, unresolvedSnippetBindings } from './snippet-bindings.ts';

function unwrap(node: ts.Expression): ts.Expression {
  while (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isSatisfiesExpression(node)
    || ts.isTypeAssertionExpression(node)) node = node.expression;
  return node;
}

const MAX_HELPER_DEPTH = 3;

interface HelperExpansion {
  inlined: string[];
  remaining: { name: string; reason: string }[];
}

export function extractStorySourceDetails(source: string): {
  sources: Record<string, string>;
  helpers: Record<string, HelperExpansion>;
} {
  const file = ts.createSourceFile('stories.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const checker = snippetProgram(file).getTypeChecker();
  const declarations = new Map<string, ts.Expression | ts.FunctionDeclaration>();
  const exports = new Map<string, string>();
  for (const statement of file.statements) {
    const exported = ts.canHaveModifiers(statement)
      && ts.getModifiers(statement)?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword);
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name) || !declaration.initializer) continue;
        declarations.set(declaration.name.text, declaration.initializer);
        if (exported) exports.set(declaration.name.text, declaration.name.text);
      }
    } else if (ts.isFunctionDeclaration(statement) && statement.name) {
      declarations.set(statement.name.text, statement);
      if (exported) exports.set(statement.name.text, statement.name.text);
    } else if (ts.isExportDeclaration(statement) && !statement.moduleSpecifier
      && statement.exportClause && ts.isNamedExports(statement.exportClause)) {
      for (const element of statement.exportClause.elements) {
        exports.set(element.name.text, (element.propertyName ?? element.name).text);
      }
    }
  }

  const renderFor = (node: ts.Expression | ts.FunctionDeclaration, seen = new Set<string>()): ts.FunctionLikeDeclaration | null | undefined => {
    if (ts.isFunctionDeclaration(node)) return node;
    node = unwrap(node);
    if (ts.isIdentifier(node)) {
      if (seen.has(node.text)) return;
      seen.add(node.text);
      const declaration = declarations.get(node.text);
      return declaration ? renderFor(declaration, seen) : undefined;
    }
    if ((ts.isPropertyAccessExpression(node) && node.name.text === 'render')
      || (ts.isElementAccessExpression(node) && ts.isStringLiteral(node.argumentExpression)
        && node.argumentExpression.text === 'render')) return renderFor(node.expression, seen);
    if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) return node;
    if (!ts.isObjectLiteralExpression(node)) return;
    for (const property of [...node.properties].reverse()) {
      if (ts.isSpreadAssignment(property)) {
        const render = renderFor(property.expression, new Set(seen));
        if (render !== undefined) return render;
      } else if (property.name && (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name))
        && property.name.text === 'render') {
        if (ts.isMethodDeclaration(property)) return property;
        if (ts.isPropertyAssignment(property)) return renderFor(property.initializer, seen) ?? null;
        if (ts.isShorthandPropertyAssignment(property)) return renderFor(property.name, seen) ?? null;
        return null;
      }
    }
  };

  const hasJsx = (node: ts.Node): boolean => ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)
    || ts.isJsxFragment(node) || (ts.forEachChild(node, hasJsx) ?? false);
  const returnsCache = new Map<ts.FunctionLikeDeclaration, ts.Expression[]>();
  const returnCounts = new Map<ts.FunctionLikeDeclaration, number>();
  const returnedJsx = (render: ts.FunctionLikeDeclaration): ts.Expression[] => {
    const cached = returnsCache.get(render);
    if (cached) return cached;
    const expressions: ts.Expression[] = [];
    if (!render.body) return expressions;
    let returnCount = 0;
    if (ts.isBlock(render.body)) {
      const visit = (node: ts.Node) => {
        if (ts.isFunctionLike(node)) return;
        if (ts.isReturnStatement(node)) {
          returnCount += 1;
          if (node.expression && hasJsx(node.expression)) expressions.push(unwrap(node.expression));
          return;
        }
        ts.forEachChild(node, visit);
      };
      ts.forEachChild(render.body, visit);
    } else {
      returnCount = 1;
      if (hasJsx(render.body)) expressions.push(unwrap(render.body));
    }
    returnsCache.set(render, expressions);
    returnCounts.set(render, returnCount);
    return expressions;
  };

  const helperFor = (name: string, seen = new Set<string>()): ts.FunctionLikeDeclaration | undefined => {
    if (seen.has(name)) return;
    seen.add(name);
    const declaration = declarations.get(name);
    if (!declaration) return;
    if (ts.isFunctionDeclaration(declaration)) return declaration;
    const expression = unwrap(declaration);
    if (ts.isIdentifier(expression)) return helperFor(expression.text, seen);
    if (ts.isArrowFunction(expression) || ts.isFunctionExpression(expression)) return expression;
  };

  const bindingContains = (binding: ts.BindingName, name: string): boolean => ts.isIdentifier(binding)
    ? binding.text === name
    : binding.elements.some((element) => ts.isBindingElement(element) && bindingContains(element.name, name));
  const isShadowed = (expression: ts.Expression, name: string): boolean => {
    for (let node: ts.Node | undefined = expression.parent; node; node = node.parent) {
      if (ts.isFunctionLike(node) && node.parameters.some((parameter) => bindingContains(parameter.name, name))) return true;
      if (ts.isBlock(node) && node.statements.some((statement) =>
        (ts.isVariableStatement(statement) && statement.declarationList.declarations.some((declaration) => bindingContains(declaration.name, name)))
        || (ts.isFunctionDeclaration(statement) && statement.name?.text === name))) return true;
    }
    return false;
  };

  const mapCache = new Map<ts.Expression, boolean>();
  const hasUnknownMap = (helper: ts.FunctionLikeDeclaration, jsx: ts.Expression): boolean => {
    const cached = mapCache.get(jsx);
    if (cached !== undefined) return cached;
    const bindings = new Map<string, ts.Expression | undefined>();
    for (const [name, declaration] of declarations) {
      bindings.set(name, ts.isFunctionDeclaration(declaration) ? undefined : declaration);
    }
    const bind = (scope: typeof bindings, name: ts.BindingName, initializer?: ts.Expression) => {
      if (ts.isIdentifier(name)) scope.set(name.text, initializer);
      else for (const element of name.elements) {
        if (ts.isBindingElement(element)) bind(scope, element.name, element.initializer);
      }
    };
    const addScope = (node: ts.Node, parent: typeof bindings): typeof bindings => {
      const scope = new Map(parent);
      if (ts.isFunctionLike(node)) {
        for (const parameter of node.parameters) bind(scope, parameter.name, parameter.initializer);
      }
      if (ts.isBlock(node)) {
        for (const statement of node.statements) {
          if (ts.isVariableStatement(statement)) {
            for (const declaration of statement.declarationList.declarations) bind(scope, declaration.name, declaration.initializer);
          } else if (ts.isFunctionDeclaration(statement) && statement.name) scope.set(statement.name.text, undefined);
        }
      }
      return scope;
    };
    const ancestors: ts.Node[] = [];
    for (let node: ts.Node = jsx.parent; node !== helper; node = node.parent) ancestors.push(node);
    let scope = addScope(helper, bindings);
    for (const node of ancestors.reverse()) scope = addScope(node, scope);
    const knownCollection = (expression: ts.Expression, bindings: typeof scope, seen = new Set<string>()): boolean => {
      expression = unwrap(expression);
      if (ts.isArrayLiteralExpression(expression)) {
        return expression.elements.every((element) => !ts.isSpreadElement(element) || knownCollection(element.expression, bindings, new Set(seen)));
      }
      if (ts.isIdentifier(expression)) {
        if (seen.has(expression.text)) return false;
        seen.add(expression.text);
        const initializer = bindings.get(expression.text);
        return Boolean(initializer && knownCollection(initializer, bindings, seen));
      }
      if (ts.isCallExpression(expression) && ts.isPropertyAccessExpression(expression.expression)
        && ['slice', 'filter', 'toSorted', 'toReversed'].includes(expression.expression.name.text)) {
        return knownCollection(expression.expression.expression, bindings, seen);
      }
      return false;
    };
    const visit = (node: ts.Node, bindings: typeof scope): boolean => {
      if (ts.isFunctionLike(node) || ts.isBlock(node)) bindings = addScope(node, bindings);
      if (ts.isCallExpression(node)) {
        const target = node.expression;
        const map = (ts.isPropertyAccessExpression(target) && target.name.text === 'map')
          || (ts.isElementAccessExpression(target) && ts.isStringLiteral(target.argumentExpression)
            && target.argumentExpression.text === 'map');
        if (map && !knownCollection(target.expression, bindings)) return true;
      }
      return ts.forEachChild(node, (child) => visit(child, bindings)) ?? false;
    };
    const unknown = visit(jsx, scope);
    mapCache.set(jsx, unknown);
    return unknown;
  };

  const textWithBindings = (expression: ts.Expression, bindings: Map<ts.Symbol, string>): string => {
    const edits: { start: number; end: number; text: string }[] = [];
    const visit = (node: ts.Node) => {
      if (ts.isIdentifier(node)) {
        const symbol = checker.getSymbolAtLocation(node);
        const text = symbol && bindings.get(symbol);
        const parent = node.parent;
        const tag = (ts.isJsxOpeningElement(parent) || ts.isJsxClosingElement(parent) || ts.isJsxSelfClosingElement(parent))
          && parent.tagName === node;
        if (text && !tag) edits.push({ start: node.getStart(file) - expression.getStart(file), end: node.end - expression.getStart(file),
          text: ts.isShorthandPropertyAssignment(parent) ? `${node.text}: ${text}` : text });
      }
      ts.forEachChild(node, visit);
    };
    visit(expression);
    let text = expression.getText(file);
    for (const edit of edits.reverse()) text = text.slice(0, edit.start) + edit.text + text.slice(edit.end);
    return text;
  };
  const inlineRoot = (expression: ts.Expression, detail: HelperExpansion, trail: string[] = [], bindings = new Map<ts.Symbol, string>()): string => {
    const tag = ts.isJsxElement(expression) ? expression.openingElement.tagName
      : ts.isJsxSelfClosingElement(expression) ? expression.tagName : undefined;
    const name = tag && ts.isIdentifier(tag) && /^[A-Z]/.test(tag.text) ? tag.text : undefined;
    const helper = name && helperFor(name);
    if (!name || !declarations.has(name)) return textWithBindings(expression, bindings);
    if (!helper) {
      const reason = 'local definition is not a direct function';
      detail.remaining.push({ name, reason });
      return `// ${name} not expanded: ${reason}.\n${textWithBindings(expression, bindings)}`;
    }
    const returned = returnedJsx(helper);
    const jsx = returned[0];
    const reason = isShadowed(expression, name) ? 'file helper is shadowed in this scope'
      : trail.includes(name) ? 'recursive helper cycle'
      : trail.length >= MAX_HELPER_DEPTH ? `helper depth limit (${MAX_HELPER_DEPTH})`
        : returnCounts.get(helper) !== 1 || returned.length !== 1 || !jsx || !(ts.isJsxElement(jsx) || ts.isJsxSelfClosingElement(jsx) || ts.isJsxFragment(jsx))
          ? 'no single literal JSX return'
          : hasUnknownMap(helper, jsx) ? 'maps over a collection without a local array definition' : undefined;
    if (reason) {
      detail.remaining.push({ name, reason });
      return `// ${name} not expanded: ${reason}.\n${textWithBindings(expression, bindings)}`;
    }
    detail.inlined.push(name);
    const attributes = ts.isJsxElement(expression) ? expression.openingElement.attributes
      : ts.isJsxSelfClosingElement(expression) ? expression.attributes : undefined;
    const parameter = helper.parameters[0]?.name;
    const rootAttributes = ts.isJsxElement(jsx!) ? jsx!.openingElement.attributes
      : ts.isJsxSelfClosingElement(jsx!) ? jsx!.attributes : undefined;
    const spread = attributes?.properties.length === 1 ? attributes.properties[0] : undefined;
    if (parameter && ts.isIdentifier(parameter) && spread && ts.isJsxSpreadAttribute(spread)
      && textWithBindings(spread.expression, bindings) === 'args'
      && rootAttributes?.properties.some((prop) => ts.isJsxSpreadAttribute(prop)
        && ts.isIdentifier(prop.expression) && prop.expression.text === parameter.text)) {
      const symbol = checker.getSymbolAtLocation(parameter);
      if (symbol) bindings = new Map(bindings).set(symbol, 'args');
    }
    return `// JSX from ${name}, as authored.\n${inlineRoot(jsx!, detail, [...trail, name], bindings)}`;
  };

  const sources: Record<string, string> = {};
  const helpers: Record<string, HelperExpansion> = {};
  for (const [name, local] of exports) {
    const declaration = declarations.get(local);
    const render = declaration && renderFor(declaration);
    if (!render?.body) continue;
    const expressions = returnedJsx(render);
    if (expressions.length) {
      const detail: HelperExpansion = { inlined: [], remaining: [] };
      const bindings = new Map<ts.Symbol, string>();
      const parameter = render.parameters[0]?.name;
      if (parameter && ts.isIdentifier(parameter)) {
        const symbol = checker.getSymbolAtLocation(parameter);
        if (symbol) bindings.set(symbol, 'args');
      }
      const jsx = expressions.map((expression) => inlineRoot(expression, detail, [], bindings)).join('\n\n');
      const unresolved = unresolvedSnippetBindings(jsx, new Set(declarations.keys()));
      const incomplete = detail.remaining.length || unresolved.length || expressions.length > 1;
      sources[name] = incomplete
        ? `${STORY_EXCERPT}${unresolved.length ? `; unresolved bindings: ${unresolved.join(', ')}` : '; multiple return branches'}.\n${jsx}` : jsx;
      if (detail.inlined.length || detail.remaining.length) helpers[name] = detail;
    }
  }
  return { sources, helpers };
}

export function extractStorySources(source: string): Record<string, string> {
  return extractStorySourceDetails(source).sources;
}

export function storySourcesIndexCode(slugs: Iterable<string>): string {
  return `
export function loadStorySources(slug) {
  switch (slug) {
${[...slugs].map((slug) => `    case ${JSON.stringify(slug)}: return import(${JSON.stringify(`${VIRTUAL_PREFIX}story-sources/${slug}`)});`).join('\n')}
    default: return Promise.resolve({ sources: {} });
  }
}
`;
}

export function storySourcesCode(sources: Record<string, string>): string {
  return `export const sources = ${JSON.stringify(sources)};`;
}
