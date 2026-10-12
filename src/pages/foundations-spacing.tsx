import { vars } from 'virtual:storybook-docs/tokens';

const token = vars as Record<string, unknown>;
const space = Object.entries((token.space as Record<string, string>) ?? {});
const radius = Object.entries((token.radius as Record<string, string>) ?? {});
const sizes = Object.entries((token.size as Record<string, string>) ?? {});

export function SpacingPage() {
  return (
    <>
      <div className="crumb">Foundations / Spacing & shape</div>
      <h1>Spacing &amp; shape</h1>
      <p className="lede">
        The space scale, corner radii and fixed sizes components are built from. Layout primitives read these — the
        bars below are the real values, not illustrations.
      </p>

      {space.length > 0 ? (
        <>
          <h2>Space scale</h2>
          <div className="scale-rows">
            {space.map(([name, reference]) => (
              <div className="space-row" key={name}>
                <span className="meta">
                  {name} · {reference}
                </span>
                <span className="bar" style={{ width: reference, background: 'var(--sd-accent)' }} />
                <span className="bar-outline" style={{ width: reference }} />
              </div>
            ))}
          </div>
        </>
      ) : (
        <p>No space tokens were found in the configured token module.</p>
      )}

      {radius.length > 0 ? (
        <>
          <h2>Radii</h2>
          <div className="radius-row">
            {radius.map(([name, reference]) => (
              <div className="radius-cell" key={name}>
                <span className="radius-box" style={{ borderRadius: reference }} />
                <span className="meta">
                  {name} · {reference}
                </span>
              </div>
            ))}
          </div>
        </>
      ) : null}

      {sizes.length > 0 ? (
        <>
          <h2>Sizes</h2>
          <div className="scale-rows">
            {sizes.map(([name, reference]) => (
              <div className="space-row" key={name}>
                <span className="meta">
                  {name} · {reference}
                </span>
                <span className="bar-outline" style={{ width: reference }} />
              </div>
            ))}
          </div>
        </>
      ) : null}

      <h2>Rules</h2>
      <ul>
        <li>Spacing between siblings comes from the scale; arbitrary pixel gaps are a smell.</li>
        <li>Radii follow the token roles so dense and roomy surfaces stay consistent.</li>
        <li>Fixed sizes exist for hit targets — interactive controls stay at or above the minimum target size.</li>
      </ul>
    </>
  );
}
