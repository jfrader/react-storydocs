/** @jsxImportSource react */
/**
 * Authored guidance: plain Markdown files in the configured directories, one per component slug
 * (`button.md`) plus optionally `index.md` for the overview. It carries the editorial layer the
 * story files do not — when to reach for a component, when not to, accessibility notes — on top of
 * the usage prose each story authors for itself.
 */
import { createElement, useEffect, useMemo, useState, type ReactNode } from 'react';
import { loadGuidance } from 'virtual:react-storydocs/guidance';
import { CodeBlock } from './code';
import { parseGuidance, type Block, type CalloutTone, type Inline } from './guidance-model';
import { Skeleton } from './skeleton';
import './guidance.css';

const CALLOUT_LABELS: Record<CalloutTone, string | null> = { do: 'Do', dont: "Don't", note: null };

function renderInline(nodes: Inline[]): ReactNode[] {
  return nodes.map((node, index) => {
    switch (node.kind) {
      case 'text':
        return node.text;
      case 'strong':
      case 'em':
      case 'del':
        return createElement(node.kind, { key: index }, renderInline(node.children));
      case 'code':
        return <code key={index}>{node.text}</code>;
      case 'br':
        return <br key={index} />;
      case 'image':
        return <img key={index} src={node.src} alt={node.alt} />;
      case 'link':
        return node.external ? (
          <a key={index} href={node.href} target="_blank" rel="noreferrer noopener">
            {renderInline(node.children)}
          </a>
        ) : (
          <a key={index} href={node.href}>
            {renderInline(node.children)}
          </a>
        );
    }
  });
}

function renderBlocks(blocks: Block[]): ReactNode[] {
  return blocks.map((block, index) => {
    switch (block.kind) {
      case 'heading':
        return createElement(`h${Math.min(block.depth, 6)}`, { key: index }, renderInline(block.children));
      case 'paragraph':
        return <p key={index}>{renderInline(block.children)}</p>;
      case 'text':
        return <span key={index}>{renderInline(block.children)}</span>;
      case 'list': {
        const items = block.items.map((item, itemIndex) => <li key={itemIndex}>{renderBlocks(item)}</li>);
        return block.ordered ? (
          <ol key={index} start={block.start}>
            {items}
          </ol>
        ) : (
          <ul key={index}>{items}</ul>
        );
      }
      case 'code':
        return <CodeBlock key={index} code={block.text} language={block.lang || undefined} />;
      case 'table':
        return (
          <div key={index} className="guidance-table">
            <table>
              <thead>
                <tr>
                  {block.header.map((cell, cellIndex) => (
                    <th key={cellIndex} style={{ textAlign: block.align[cellIndex] ?? undefined }}>
                      {renderInline(cell)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {block.rows.map((row, rowIndex) => (
                  <tr key={rowIndex}>
                    {row.map((cell, cellIndex) => (
                      <td key={cellIndex} style={{ textAlign: block.align[cellIndex] ?? undefined }}>
                        {renderInline(cell)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      case 'callout': {
        const label = CALLOUT_LABELS[block.tone];
        return (
          <aside key={index} className={`guidance-callout guidance-callout-${block.tone}`}>
            {label ? <p className="guidance-callout-label">{label}</p> : null}
            {renderBlocks(block.children)}
          </aside>
        );
      }
      case 'rule':
        return <hr key={index} />;
    }
  });
}

/** Renders parsed guidance Markdown — reused by the Releases page for the changelog. */
export function MarkdownView({ markdown, className = 'guidance' }: { markdown: string; className?: string }) {
  const blocks = useMemo(() => parseGuidance(markdown), [markdown]);
  return <section className={className}>{renderBlocks(blocks)}</section>;
}

export function Guidance({ slug }: { slug: string }) {
  const [blocks, setBlocks] = useState<Block[] | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let alive = true;
    setBlocks(null);
    setMissing(false);
    loadGuidance(slug)
      .then((module) => {
        if (!alive) return;
        const markdown = (module as { markdown?: string }).markdown;
        if (!markdown) {
          setMissing(true);
          return;
        }
        setBlocks(parseGuidance(markdown));
      })
      .catch(() => {
        if (alive) setMissing(true);
      });
    return () => {
      alive = false;
    };
  }, [slug]);

  // No guidance directory entry: the section simply does not exist on this page.
  if (missing) return null;
  if (blocks === null) return (
    <section className="guidance" aria-busy="true">
      <Skeleton lines={3} />
    </section>
  );
  return <section className="guidance">{renderBlocks(blocks)}</section>;
}
