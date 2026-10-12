/**
 * Optional authored guidance: plain Markdown files in a configured directory, one per
 * component slug (`button.md`) plus optionally `index.md` for the overview. Stories can
 * generate examples and props; they cannot write "when to use this" — that prose lives here.
 */
import { useEffect, useState } from 'react';
import { marked } from 'marked';
import { loadGuidance } from 'virtual:storybook-docs/guidance';

export function Guidance({ slug, placeholder }: { slug: string; placeholder?: string }) {
  const [html, setHtml] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let alive = true;
    setHtml(null);
    setMissing(false);
    loadGuidance(slug)
      .then((module) => {
        if (!alive) return;
        const markdown = (module as { markdown?: string }).markdown;
        if (!markdown) {
          setMissing(true);
          return;
        }
        setHtml(marked.parse(markdown, { async: false }) as string);
      })
      .catch(() => {
        if (alive) setMissing(true);
      });
    return () => {
      alive = false;
    };
  }, [slug]);

  if (missing) {
    return placeholder ? (
      <section className="guidance guidance-empty">
        <h2>Guidance</h2>
        <p className="hint">{placeholder}</p>
      </section>
    ) : null;
  }
  if (html === null) return null;
  return <section className="guidance" dangerouslySetInnerHTML={{ __html: html }} />;
}
