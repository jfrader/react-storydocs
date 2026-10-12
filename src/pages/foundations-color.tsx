/** @jsxImportSource react */
import { vars } from 'virtual:storybook-docs/tokens';

const colorSection = (vars as Record<string, unknown>).color as Record<string, string> | undefined;
const roles = Object.entries(colorSection ?? {}).sort(([a], [b]) => a.localeCompare(b));

export function ColorPage() {
  return (
    <>
      <div className="crumb">Foundations / Color</div>
      <h1>Color</h1>
      <p className="lede">
        {roles.length} color roles, read live from the design system&apos;s token module. The swatches follow the theme
        toggle, because they are the real variables rather than copies of them.
      </p>

      <h2>Roles</h2>
      <div className="swatches">
        {roles.map(([role, reference]) => (
          <div className="sw" key={role}>
            <div className="c" style={{ background: reference }} />
            <div className="n">
              <b>{role}</b>
              {reference}
            </div>
          </div>
        ))}
      </div>

      <h2>Rules</h2>
      <ul>
        <li>Components read token roles; the application decides the theme (an attribute on the root, or a scoped theme wrapper).</li>
        <li>Control boundaries hold ≥3:1 against both the page and the control interior (WCAG 1.4.11).</li>
        <li>Raw values live in the token source only — this page is where they are allowed to be visible.</li>
        <li>State is never signalled by color alone; tones pair with glyphs, text or outlines.</li>
      </ul>
    </>
  );
}
