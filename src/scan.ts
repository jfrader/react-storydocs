/**
 * Pure scanning helpers: locating story files, reading their metadata and matching globs.
 * No Vite, no docgen — this module is what the engine's tests exercise.
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

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

/** Every file under `rootDir` whose path relative to it matches the glob. */
export function collectMatches(rootDir: string, pattern: string): string[] {
  const matches: string[] = [];
  const visit = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name);
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

/** The meta title lives in the module's `meta` object — fixtures elsewhere in the file also
    contain `title:` keys, so the scan is scoped to the meta declaration first. */
export function extractTitle(source: string): string | null {
  const metaStart = source.search(/\bconst\s+meta\b/);
  if (metaStart >= 0) {
    const rest = source.slice(metaStart);
    const end = rest.search(/export\s+default\s+meta|satisfies\s+Meta|\)\s*;\s*$/m);
    const scope = end >= 0 ? rest.slice(0, end) : rest.slice(0, 6000);
    const scoped = scope.match(/title:\s*'([^']+)'/) ?? scope.match(/title:\s*"([^"]+)"/);
    if (scoped?.[1]) return scoped[1];
  }
  const anywhere = source.match(/title:\s*'([^']+)'/) ?? source.match(/title:\s*"([^"]+)"/);
  return anywhere?.[1] ?? null;
}

export interface StoryFileFacts {
  title: string;
  stories: string[];
  hasComponent: boolean;
}

export function readStoryFile(file: string): StoryFileFacts | null {
  const source = readFileSync(file, 'utf8');
  const title = extractTitle(source);
  if (!title) return null;
  const module = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const bindings = new Map<string, ts.Expression>();
  const exports = new Map<string, ts.Expression | undefined>();
  let meta: ts.Expression | undefined;
  for (const statement of module.statements) {
    if (ts.isExportAssignment(statement) && !statement.isExportEquals) meta = statement.expression;
    if (!ts.isVariableStatement(statement)) continue;
    const exported = statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword);
    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name)) continue;
      if (declaration.initializer) bindings.set(declaration.name.text, declaration.initializer);
      if (exported) exports.set(declaration.name.text, declaration.initializer);
    }
  }
  const resolve = (node: ts.Expression | undefined, seen = new Set<ts.Expression>()): ts.Expression | undefined => {
    if (!node || seen.has(node)) return undefined;
    seen.add(node);
    if (ts.isIdentifier(node)) return resolve(bindings.get(node.text), seen);
    if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isSatisfiesExpression(node)) return resolve(node.expression, seen);
    return node;
  };
  const hidden = (expression: ts.Expression | undefined) => {
    const object = resolve(expression);
    if (!object || !ts.isObjectLiteralExpression(object)) return false;
    const tags = object.properties.find((property): property is ts.PropertyAssignment =>
      ts.isPropertyAssignment(property) && !ts.isComputedPropertyName(property.name) && property.name.text === 'tags');
    const array = resolve(tags?.initializer);
    return Boolean(array && ts.isArrayLiteralExpression(array) && array.elements.some((element) => {
      const tag = resolve(element);
      return tag && ts.isStringLiteral(tag) && tag.text === '!autodocs';
    }));
  };
  if (hidden(meta)) return null;
  const stories = [...exports].filter(([, expression]) => !hidden(expression)).map(([name]) => name);
  if (!stories.length) return null;
  return { title, stories, hasComponent: /component:\s*\w+/.test(source) };
}

export const toKebab = (value: string) =>
  value
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();

export function storyIdentity(file: string, title: string) {
  const [group = 'Components', ...leaf] = title.split('/');
  const filename = path.basename(file).replace(/\.stories\.[^.]+$/, '');
  return { group, name: leaf.join('/') || filename, slug: toKebab(filename) };
}
