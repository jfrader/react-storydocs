/** @jsxImportSource react */

import type { ReactNode } from 'react';
import { vars } from 'virtual:storybook-docs/tokens';

const token = vars as Record<string, unknown>;
const sizes = Object.entries((token.textSize as Record<string, string>) ?? {});
const weights = Object.entries((token.fontWeight as Record<string, string>) ?? {});
const families = Object.entries((token.font as Record<string, string>) ?? {});

export function TypePage(): ReactNode {
  return (
    <>
      <div className="crumb">Foundations / Typography</div>
      <h1>Typography</h1>
      <p className="lede">
        The type scale, weights and families the components read from the token source. Every row is shown at its real
        value — this is a specimen, not a screenshot.
      </p>

      {families.length > 0 ? (
        <>
          <h2>Family</h2>
          {families.map(([name, reference]) => (
            <div className="scale-row" key={name}>
              <span className="meta">
                {name} · {reference}
              </span>
              <span style={{ fontFamily: reference, fontSize: '20px' }}>
                The quick brown fox jumps over the lazy dog
              </span>
            </div>
          ))}
        </>
      ) : null}

      <h2>Scale</h2>
      {sizes.length > 0 ? (
        sizes.map(([name, reference]) => (
          <div className="scale-row" key={name}>
            <span className="meta">
              {name} · {reference}
            </span>
            <span style={{ fontSize: reference }}>Save changes · 0123456789</span>
          </div>
        ))
      ) : (
        <p>No text-size tokens were found in the configured token module.</p>
      )}

      {weights.length > 0 ? (
        <>
          <h2>Weights</h2>
          {weights.map(([name, reference]) => (
            <div className="scale-row" key={name}>
              <span className="meta">
                {name} · {reference}
              </span>
              <span style={{ fontWeight: reference as unknown as number, fontSize: '18px' }}>
                Design system documentation
              </span>
            </div>
          ))}
        </>
      ) : null}

      <h2>Rules</h2>
      <ul>
        <li>Sizes and line-heights come from tokens; components never set raw font sizes.</li>
        <li>Numbers that update live use tabular figures so they do not jitter.</li>
      </ul>
    </>
  );
}
