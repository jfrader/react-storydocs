import { CodeBlock } from '@jfrader/ui';
import { loadShikiHighlight } from '@jfrader/ui/code-block/shiki';

/**
 * The code renderer the docs site uses everywhere it shows code: the library's own block with its
 * highlighter, so a sample looks the same here as it does in the library's docs.
 */
export default function Code({ code, language }: { code: string; language?: string }) {
  return <CodeBlock code={code} language={language} highlight={loadShikiHighlight} copyable />;
}
