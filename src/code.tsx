/** @jsxImportSource react */
import { Component, Suspense, useMemo, type ComponentType, type ReactNode } from 'react';
// Present only when the consumer names one: see `code.module` in docs.config.
import { Code as ProvidedCode, provided as hasProvidedCode } from 'virtual:storybook-docs/code';

export type CodeBlockProps = {
  code: string;
  /** Language hint for the consumer's highlighter, as an id (`tsx`, `bash`, `json`). */
  language?: string;
  /**
   * What this code is, for a screen reader. Each example on a page needs its own, or every
   * renderer's landmark carries the same name and the page has duplicate landmarks.
   */
  label?: string;
};

/** Keeps a consumer's code block from taking a page down: a code sample is never worth that. */
class CodeBoundary extends Component<{ code: string; language?: string; label?: string; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed) return <PlainCode code={this.props.code} language={this.props.language} label={this.props.label} />;
    return this.props.children;
  }
}

function PlainCode({ code, language, label }: CodeBlockProps) {
  return (
    <pre className="code" data-lang={language || undefined} aria-label={label}>
      {code}
    </pre>
  );
}

/**
 * One code block for every place the docs show code: the page snippet, each example's Code panel
 * and every fenced block in authored Markdown. Renders the design system's own code block when the
 * consumer provides one, so code looks exactly as it does in the system it documents.
 */
export function CodeBlock({ code, language, label }: CodeBlockProps) {
  const Provided = ProvidedCode as ComponentType<CodeBlockProps> | undefined;
  const trimmed = useMemo(() => code.trim(), [code]);
  if (!hasProvidedCode || !Provided) return <PlainCode code={trimmed} language={language} label={label} />;
  return (
    <CodeBoundary code={trimmed} language={language} label={label}>
      <Suspense fallback={<PlainCode code={trimmed} language={language} label={label} />}>
        <Provided code={trimmed} language={language} label={label} />
      </Suspense>
    </CodeBoundary>
  );
}
