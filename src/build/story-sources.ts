import ts from 'typescript';
import { VIRTUAL_PREFIX } from './module-ids.ts';

function unwrap(node: ts.Expression): ts.Expression {
  while (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isSatisfiesExpression(node)
    || ts.isTypeAssertionExpression(node)) node = node.expression;
  return node;
}

export function extractStorySources(source: string): Record<string, string> {
  const file = ts.createSourceFile('stories.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
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
  const sources: Record<string, string> = {};
  for (const [name, local] of exports) {
    const declaration = declarations.get(local);
    const render = declaration && renderFor(declaration);
    if (!render?.body) continue;
    const expressions: ts.Expression[] = [];
    if (ts.isBlock(render.body)) {
      const visit = (node: ts.Node) => {
        if (ts.isFunctionLike(node)) return;
        if (ts.isReturnStatement(node) && node.expression && hasJsx(node.expression)) {
          expressions.push(unwrap(node.expression));
          return;
        }
        ts.forEachChild(node, visit);
      };
      ts.forEachChild(render.body, visit);
    } else if (hasJsx(render.body)) expressions.push(unwrap(render.body));
    if (expressions.length) {
      const jsx = expressions.map((expression) => expression.getText(file)).join('\n\n');
      sources[name] = expressions.length > 1 ? `// JSX return branches as authored in the story.\n${jsx}` : jsx;
    }
  }
  return sources;
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
