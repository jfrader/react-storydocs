/** @jsxImportSource react */
import { releases } from 'virtual:storybook-docs/releases';
import { MarkdownView } from '../guidance';

export function ReleasesPage() {
  return (
    <>
      <div className="crumb">Releases</div>
      <h1>Releases</h1>
      <p className="lede">
        {releases.version ? (
          <>
            Current release <span className="chip">v{releases.version}</span> — the changelog below is read from the
            repository, so it cannot drift from the code that shipped.
          </>
        ) : (
          'The changelog below is read from the repository, so it cannot drift from the code that shipped.'
        )}
      </p>

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
