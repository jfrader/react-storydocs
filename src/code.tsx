/** @jsxImportSource react */
import { Component, useMemo, type ComponentType, type ReactNode } from 'react';
// Present only when the consumer names one: see `code.module` in docs.config.
import { Code as ProvidedCode, provided as hasProvidedCode } from 'virtual:storybook-docs/code';

export type CodeBlockProps = {
  code: string;
  /** Language hint for the consumer's highlighter, as an id (`tsx`, `bash`, `json`). */
  language?: string;
};

/** Keeps a consumer's code block from taking a page down: a code sample is never worth that. */
class CodeBoundary extends Component<{ code: string; language?: string; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed) return <PlainCode code={this.props.code} language={this.props.language} />;
    return this.props.children;
  }
}

function PlainCode({ code, language }: CodeBlockProps) {
  return (
    <pre className="code" data-lang={language || undefined}>
      {code}
    </pre>
  );
}

/**
 * One code block for every place the docs show code: the page snippet, each example's Code panel
 * and every fenced block in authored Markdown. Renders the design system's own code block when the
 * consumer provides one, so code looks exactly as it does in the system it documents.
 */
export function CodeBlock({ code, language }: CodeBlockProps) {
  const Provided = ProvidedCode as ComponentType<CodeBlockProps> | undefined;
  const trimmed = useMemo(() => code.trim(), [code]);
  if (!hasProvidedCode || !Provided) return <PlainCode code={trimmed} language={language} />;
  return (
    <CodeBoundary code={trimmed} language={language}>
      <Provided code={trimmed} language={language} />
    </CodeBoundary>
  );
}
