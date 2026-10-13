/** @jsxImportSource react */

import type { ReactNode } from 'react';
import { vars } from 'virtual:storybook-docs/tokens';

const token = vars as Record<string, unknown>;
const shadow = Object.entries((token.shadow as Record<string, string>) ?? {});
const motion = (token.motion as Record<string, Record<string, string>>) ?? {};
const duration = Object.entries(motion.duration ?? {});
const easing = Object.entries(motion.ease ?? motion.easing ?? {});

export function EffectsPage(): ReactNode {
  return (
    <>
      <div className="crumb">Foundations / Elevation &amp; motion</div>
      <h1>Elevation &amp; motion</h1>
      <p className="lede">
        Shadow roles and motion timings.
      </p>

      {shadow.length > 0 ? (
        <>
          <h2>Elevation</h2>
          <div className="shadow-row">
            {shadow.map(([name, reference]) => (
              <div className="shadow-cell" key={name}>
                <span className="shadow-box" style={{ boxShadow: reference }} />
                <span className="meta">
                  {name} · {reference}
                </span>
              </div>
            ))}
          </div>
        </>
      ) : null}

      {duration.length > 0 ? (
        <>
          <h2>Durations</h2>
          <div className="scale-rows">
            {duration.map(([name, reference]) => (
              <div className="space-row" key={name}>
                <span className="meta">
                  {name} · {reference}
                </span>
                <span className="motion-demo" style={{ animationDuration: reference }} />
              </div>
            ))}
          </div>
        </>
      ) : null}

      {easing.length > 0 ? (
        <>
          <h2>Easing</h2>
          <div className="scale-rows">
            {easing.map(([name, reference]) => (
              <div className="space-row" key={name}>
                <span className="meta">
                  {name} · {reference}
                </span>
                <code>{reference}</code>
              </div>
            ))}
          </div>
        </>
      ) : null}

      <h2>Rules</h2>
      <ul>
        <li>Motion is a hint, never a requirement: every animation needs a reduced-motion branch that still completes the lifecycle.</li>
        <li>Transitions list the properties they animate — never <code>transition: all</code>.</li>
        <li>Elevation encodes layering, not decoration: overlays sit above content, and the shadow role says how far.</li>
      </ul>
    </>
  );
}
