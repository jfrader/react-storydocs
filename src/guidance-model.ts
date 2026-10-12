/**
 * Authored guidance Markdown → a small block model the docs render as React nodes.
 * Blockquotes that open with a do/don't marker (`✅ **Do** —`, `Don't:`, `⛔`) become
 * do/don't cards; every other blockquote is a neutral callout. Pure: no DOM, no React.
 */
import { marked, type MarkedToken, type Token, type Tokens } from 'marked';

export type CalloutTone = 'do' | 'dont' | 'note';
export type Align = 'left' | 'center' | 'right' | null;

export type Inline =
  | { kind: 'text'; text: string }
  | { kind: 'strong' | 'em' | 'del'; children: Inline[] }
  | { kind: 'code'; text: string }
  | { kind: 'link'; href: string; external: boolean; children: Inline[] }
  | { kind: 'image'; src: string; alt: string }
  | { kind: 'br' };

export type Block =
  | { kind: 'heading'; depth: number; children: Inline[] }
  | { kind: 'paragraph'; children: Inline[] }
  /** Tight list-item content: inline nodes without a paragraph around them. */
  | { kind: 'text'; children: Inline[] }
  | { kind: 'list'; ordered: boolean; start: number; items: Block[][] }
  | { kind: 'code'; lang: string; text: string }
  | { kind: 'table'; align: Align[]; header: Inline[][]; rows: Inline[][][] }
  | { kind: 'callout'; tone: CalloutTone; children: Block[] }
  | { kind: 'rule' };

const DO_SYMBOLS = ['✅', '✓', '✔'];
const SYMBOL = /^(✅|✓|✔|⛔|✗|✘|❌|🚫)\uFE0F?\s*/u;
const WORD = /^(\*\*|__|\*|_)?(don['’]t|do not|do)\1(?![\p{L}\p{N}'’])/iu;
const SEPARATOR = /^[ \t]*(?:[—–:]|-(?=\s))[ \t]*/u;
const LINE_END = /^[ \t]*(?:\n|$)/;

/** The page owns the h1; authored headings start at h2. */
const MIN_HEADING_DEPTH = 2;
const SAFE_SCHEMES = new Set(['http:', 'https:', 'mailto:', 'tel:']);
const SCHEME = /^([a-z][a-z\d+.-]*:)/i;
const EXTERNAL = /^(?:https?:)?\/\//i;

/**
 * Reads a blockquote's leading do/don't marker. A symbol is a marker on its own; a bare
 * word counts only when emphasised (`**Do**`) or followed by a separator or line end, so
 * "Do you need…" stays a neutral callout. The marker is removed from the returned body.
 */
export function readCallout(text: string): { tone: CalloutTone; body: string } {
  let rest = text.trimStart();
  let tone: CalloutTone = 'note';
  const symbol = SYMBOL.exec(rest);
  if (symbol?.[1]) {
    tone = DO_SYMBOLS.includes(symbol[1]) ? 'do' : 'dont';
    rest = rest.slice(symbol[0].length);
  }
  const word = WORD.exec(rest);
  if (word?.[2]) {
    const wordTone = word[2].toLowerCase() === 'do' ? 'do' : 'dont';
    const after = rest.slice(word[0].length);
    const delimited = Boolean(word[1]) || SEPARATOR.test(after) || LINE_END.test(after);
    if (symbol ? tone === wordTone : delimited) {
      tone = wordTone;
      rest = after;
    }
  }
  if (tone === 'note') return { tone, body: text };
  return { tone, body: rest.replace(SEPARATOR, '').trimStart() };
}

function safeHref(href: string): string | null {
  const scheme = SCHEME.exec(href)?.[1]?.toLowerCase();
  return scheme && !SAFE_SCHEMES.has(scheme) ? null : href;
}

function toInline(tokens: Token[] = []): Inline[] {
  return (tokens as MarkedToken[]).flatMap((token): Inline[] => {
    switch (token.type) {
      case 'text':
        return token.tokens ? toInline(token.tokens) : [{ kind: 'text', text: token.text }];
      case 'escape':
        return [{ kind: 'text', text: token.text }];
      case 'strong':
      case 'em':
      case 'del':
        return [{ kind: token.type, children: toInline(token.tokens) }];
      case 'codespan':
        return [{ kind: 'code', text: token.text }];
      case 'br':
        return [{ kind: 'br' }];
      case 'link': {
        const href = safeHref(token.href);
        const children = toInline(token.tokens);
        return href ? [{ kind: 'link', href, external: EXTERNAL.test(href), children }] : children;
      }
      case 'image': {
        const src = safeHref(token.href);
        return src ? [{ kind: 'image', src, alt: token.text }] : [];
      }
      default:
        // Raw HTML and anything unknown is dropped: guidance is rendered without innerHTML.
        return [];
    }
  });
}

function toCell(cell: Tokens.TableCell): Inline[] {
  return toInline(cell.tokens);
}

/** Converts `marked.lexer()` tokens into the guidance block model. */
export function toBlocks(tokens: Token[]): Block[] {
  return (tokens as MarkedToken[]).flatMap((token): Block[] => {
    switch (token.type) {
      case 'heading':
        return [{ kind: 'heading', depth: Math.max(MIN_HEADING_DEPTH, token.depth), children: toInline(token.tokens) }];
      case 'paragraph':
        return [{ kind: 'paragraph', children: toInline(token.tokens) }];
      case 'text':
        return [{ kind: 'text', children: toInline([token]) }];
      case 'list':
        return [
          {
            kind: 'list',
            ordered: token.ordered,
            start: token.start === '' ? 1 : token.start,
            items: token.items.map((item) => toBlocks(item.tokens)),
          },
        ];
      case 'code':
        return [{ kind: 'code', lang: token.lang ?? '', text: token.text }];
      case 'table':
        return [{ kind: 'table', align: token.align, header: token.header.map(toCell), rows: token.rows.map((row) => row.map(toCell)) }];
      case 'blockquote': {
        const { tone, body } = readCallout(token.text);
        const children = tone === 'note' ? toBlocks(token.tokens) : toBlocks(marked.lexer(body));
        return [{ kind: 'callout', tone, children }];
      }
      case 'hr':
        return [{ kind: 'rule' }];
      default:
        return [];
    }
  });
}

export function parseGuidance(markdown: string): Block[] {
  return toBlocks(marked.lexer(markdown));
}
