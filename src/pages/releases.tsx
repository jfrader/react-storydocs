/** @jsxImportSource react */

import type { ReactNode } from 'react';
import { releases } from 'virtual:react-storydocs/releases';
import { MarkdownView } from '../guidance';

export function ReleasesPage(): ReactNode {
  return (
    <>
      <div className="crumb">Releases</div>
      <h1>Releases</h1>
      {releases.version ? (
        <p className="lede">
          Current release <span className="chip">v{releases.version}</span>
        </p>
      ) : null}

      {releases.changelog ? <MarkdownView markdown={releases.changelog} /> : null}
    </>
  );
}
