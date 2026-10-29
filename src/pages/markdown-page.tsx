/** @jsxImportSource react */

import type { ReactNode } from 'react';
import type { PageEntry } from '../config';
import { LazyMarkdown } from '../guidance';

export function MarkdownPage({ page }: { page: PageEntry }): ReactNode {
  return (
    <>
      <div className="crumb">{[...page.group.split('/'), page.name].join(' / ')}</div>
      <h1>{page.name}</h1>
      <LazyMarkdown load={page.load} />
    </>
  );
}
