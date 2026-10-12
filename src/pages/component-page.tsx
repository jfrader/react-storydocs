import type { CatalogEntry } from '../config';
import { pages } from 'virtual:storybook-docs/site';
import { hrefFor } from '../base';
import { LazySection, StoryView, useStoryModule } from '../story-view';

function formatValue(value: unknown): string {
  if (value === undefined) return '—';
  if (typeof value === 'function') return 'fn()';
  if (typeof value === 'string') return value.length > 40 ? `${value.slice(0, 37)}…` : value;
  if (typeof value === 'object' && value !== null) {
    if ('$$typeof' in (value as object)) return '<ReactNode>';
    if (Array.isArray(value)) return `[${value.length}]`;
    return '{…}';
  }
  return String(value);
}

interface MetaShape {
  argTypes?: Record<string, Record<string, unknown>>;
  args?: Record<string, unknown>;
  parameters?: { docs?: { description?: { component?: string } } };
}

export function ComponentPage({ entry }: { entry: CatalogEntry }) {
  const { module, error } = useStoryModule(entry);
  const meta = (module?.default ?? {}) as MetaShape;
  const argTypes = meta.argTypes ?? {};
  const defaultArgs = meta.args ?? {};
  const description = meta.parameters?.docs?.description?.component;

  return (
    <>
      <div className="crumb">
        {entry.group} / {entry.name}
      </div>
      <h1>{entry.name}</h1>
      <div className="summary-row">
        <span className="chip">{entry.stories.length} stories</span>
        <span className="chip">{Object.keys(argTypes).length} documented props</span>
        <span className="chip">generated from the story module</span>
      </div>
      <p className="lede">
        {description ?? `Every story in ${entry.storybookTitle} is rendered below — same module, same args.`}
      </p>

      {error ? <div className="story-failed">Could not load the story module: {error}</div> : null}
      {!module && !error ? <p>Loading stories…</p> : null}

      {module ? (
        <>
          <h2>Examples</h2>
          {entry.stories.map((story) => (
            <div className="frame" key={story}>
              <header>
                <span>{story}</span>
              </header>
              <div className="shot">
                <LazySection>
                  <StoryView module={module} story={story} />
                </LazySection>
              </div>
            </div>
          ))}
        </>
      ) : null}

      {pages.api ? (
        <>
          <h2>API</h2>
          {Object.keys(argTypes).length > 0 ? (
            <table>
              <thead>
                <tr>
                  <th>Prop</th>
                  <th>Control</th>
                  <th>Options</th>
                  <th>Default</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(argTypes).map(([prop, definition]) => (
                  <tr key={prop}>
                    <td>
                      <code>{prop}</code>
                    </td>
                    <td>{formatValue(definition.control)}</td>
                    <td>{definition.options ? formatValue(definition.options) : '—'}</td>
                    <td>{formatValue(defaultArgs[prop])}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p>This story module declares no argTypes; the props live in the component source.</p>
          )}
        </>
      ) : null}

      <h2>Guidance</h2>
      <p>
        Editorial guidance — when to reach for this component, when not to, and the accessibility notes that do not fit
        in a prop table — belongs on this page next to the examples. That prose is the one thing stories cannot
        generate; it is written once, in the repository, and stays next to the code.
      </p>
      <p>
        <a href={hrefFor('/')}>← back to the overview</a>
      </p>
    </>
  );
}
