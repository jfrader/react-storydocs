import ts from 'typescript';

const options: ts.CompilerOptions = { target: ts.ScriptTarget.Latest, jsx: ts.JsxEmit.Preserve, noLib: true };
const UNRESOLVED_NAME_DIAGNOSTICS = new Set([2304, 2552, 2580, 2581, 2582, 2591, 2592, 18004]);

export function snippetProgram(file: ts.SourceFile) {
  const host = ts.createCompilerHost(options);
  host.getSourceFile = (name) => name === file.fileName ? file : undefined;
  return ts.createProgram([file.fileName], options, host);
}

let globals: Set<string> | undefined;
function globalNames() {
  if (!globals) {
    // TypeScript's platform declarations, not a hand-maintained list of JS globals.
    const host = ts.createCompilerHost({ target: ts.ScriptTarget.Latest });
    const lib = host.getDefaultLibFileName({ target: ts.ScriptTarget.Latest });
    const libraries = ts.createProgram([lib], { target: ts.ScriptTarget.Latest });
    const file = libraries.getSourceFile(lib)!;
    globals = new Set(libraries.getTypeChecker().getSymbolsInScope(file, ts.SymbolFlags.Value).map((symbol) => symbol.name));
  }
  return globals;
}

export function unresolvedSnippetBindings(source: string, localTags = new Set<string>()): string[] {
  const file = ts.createSourceFile('snippet.tsx', `declare const args: any;\n${source}`, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const program = snippetProgram(file);
  const expression = file.statements.find(ts.isExpressionStatement)?.expression;
  const rootTag = expression && (ts.isJsxElement(expression) ? expression.openingElement.tagName
    : ts.isJsxSelfClosingElement(expression) ? expression.tagName : undefined);
  const publicRoot = rootTag?.getText(file).split('.')[0];
  const identifiers = new Map<number, ts.Identifier>();
  const visit = (node: ts.Node) => {
    if (ts.isIdentifier(node)) identifiers.set(node.getStart(file), node);
    ts.forEachChild(node, visit);
  };
  visit(file);
  const unresolved = new Set<string>();
  for (const diagnostic of program.getSemanticDiagnostics(file)) {
    if (!UNRESOLVED_NAME_DIAGNOSTICS.has(diagnostic.code) || diagnostic.start === undefined) continue;
    const node = identifiers.get(diagnostic.start);
    if (!node) continue;
    let tag: ts.Node = node;
    while (ts.isPropertyAccessExpression(tag.parent) && tag.parent.expression === tag) tag = tag.parent;
    const jsxTag = (ts.isJsxOpeningElement(tag.parent) || ts.isJsxClosingElement(tag.parent)
      || ts.isJsxSelfClosingElement(tag.parent)) && tag.parent.tagName === tag;
    if (!(jsxTag && node.text === publicRoot && !localTags.has(node.text))
      && !globalNames().has(node.text)) unresolved.add(node.text);
  }
  return [...unresolved].sort();
}
