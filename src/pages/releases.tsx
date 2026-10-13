/** @jsxImportSource react */

import type { ReactNode } from 'react';
import { releases } from 'virtual:storybook-docs/releases';
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

      {releases.changelog ? (
        <MarkdownView markdown={releases.changelog} />
      ) : (
        <p className="hint">
          No changelog configured. Point <code>releases.changelog</code> at the design system’s changelog file (and{' '}
          <code>releases.versionFrom</code> at the package that carries the current version) to publish releases here.
        </p>
      )}
    </>
  );
}
