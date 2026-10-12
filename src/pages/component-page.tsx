import { useMemo } from 'react';
import type { CatalogEntry } from '../config';
import { Guidance } from '../guidance';
import { sectionStories, usageSnippet } from '../sections';
import { LazySection, StoryView, useStoryModule } from '../story-view';
import { useProps, type ComponentPropsDoc } from '../props';

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

function PropsTable({
  components,
  argTypes,
  defaultArgs,
}: {
  components: ComponentPropsDoc[] | null;
  argTypes: Record<string, Record<string, unknown>>;
  defaultArgs: Record<string, unknown>;
}) {
  if (components && components.length > 0) {
    const single = components.length === 1;
    return (
      <>
        {components.map((component) => (
          <section key={component.name}>
            {!single ? <h3>{component.name}</h3> : null}
            {component.native ? (
              <p className="hint">
                Also accepts every native <code>&lt;{component.native}&gt;</code> prop.
              </p>
            ) : null}
            <table>
              <thead>
                <tr>
                  <th>Prop</th>
                  <th>Type</th>
                  <th>Default</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {component.props.map((prop) => (
                  <tr key={prop.name}>
                    <td>
                      <code>{prop.name}</code>
                      {prop.required ? <span className="req">required</span> : null}
                    </td>
                    <td>
                      <code className="type">{prop.type}</code>
                    </td>
                    <td>{prop.defaultValue ?? '—'}</td>
                    <td>{prop.description || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ))}
      </>
    );
  }
  if (Object.keys(argTypes).length > 0) {
    return (
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
    );
  }
  return <p>The props were not extracted for this component; the types live in the component source.</p>;
}

export function ComponentPage({ entry }: { entry: CatalogEntry }) {
  const { module, error } = useStoryModule(entry);
  const props = useProps(entry.slug);
  const meta = (module?.default ?? {}) as MetaShape;
  const argTypes = meta.argTypes ?? {};
  const defaultArgs = meta.args ?? {};
  const description = meta.parameters?.docs?.description?.component;
  const sections = useMemo(() => sectionStories(entry.stories), [entry.stories]);
  const snippet = useMemo(() => usageSnippet(entry.name, defaultArgs), [entry.name, defaultArgs]);
  const propCount = props ? props.reduce((total, component) => total + component.props.length, 0) : Object.keys(argTypes).length;

  return (
    <>
      <div className="crumb">
        {entry.group} / {entry.name}
      </div>
      <h1>{entry.name}</h1>
      <div className="summary-row">
        <span className="chip">{entry.stories.length} stories</span>
        <span className="chip">{propCount} props</span>
        <span className="chip">from the story module + component source</span>
      </div>
      <p className="lede">
        {description ?? `${entry.name} — every story in ${entry.storybookTitle} is rendered below, in sections.`}
      </p>

      {error ? <div className="story-failed">Could not load the story module: {error}</div> : null}
      {!module && !error ? <p>Loading stories…</p> : null}

      {module ? (
        <>
          {snippet ? (
            <>
              <h2>Usage</h2>
              <pre className="code">{snippet}</pre>
              <p className="hint">Derived from the default story’s arguments, so it never drifts from what is rendered.</p>
            </>
          ) : null}

          <Guidance
            slug={entry.slug}
            placeholder="Authored guidance belongs here: what this component is for, when not to use it, and the accessibility notes a prop table cannot carry. Write it once in the configured guidance directory."
          />

          {sections.map((section) => (
            <section key={section.title}>
              <h2>{section.title}</h2>
              <p className="section-blurb">{section.blurb}</p>
              {section.stories.map((story) => {
                const definition = (module[story] ?? {}) as { render?: unknown; args?: Record<string, unknown> };
                const storySnippet =
                  typeof definition.render === 'function'
                    ? null
                    : usageSnippet(entry.name, { ...meta.args, ...definition.args });
                return (
                  <div className="frame" key={story}>
                    <header>
                      <span>{story}</span>
                    </header>
                    <div className="shot">
                      <LazySection>
                        <StoryView module={module} story={story} />
                      </LazySection>
                    </div>
                    {storySnippet ? (
                      <details className="code-toggle">
                        <summary>Code</summary>
                        <pre className="code">{storySnippet}</pre>
                      </details>
                    ) : null}
                  </div>
                );
              })}
            </section>
          ))}
        </>
      ) : null}

      <h2>Props</h2>
      <PropsTable components={props} argTypes={argTypes} defaultArgs={defaultArgs} />

      <h2>Notes</h2>
      <p>
        Everything above is generated from this component’s story module and source files. Editorial judgement —
        when to reach for it, when not to — is written next to the code and rendered as guidance above.
      </p>
    </>
  );
}
