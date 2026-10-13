/** @jsxImportSource react */
import { useMemo, type ReactNode } from 'react';
import type { CatalogEntry } from '../config';
import { Guidance } from '../guidance';
import { CodeBlock } from '../code';
import { MarkdownView } from '../guidance';
import { sectionStories, usageSnippet, type DocsParameters } from '../sections';
import { useStoryModule } from '../story-view';
import { ControlledStoryFrame } from '../controls';
import { useProps, type ComponentPropsDoc } from '../props';
import { Skeleton } from '../skeleton';

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
  parameters?: { docs?: DocsParameters };
}


function TableFrame({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="table-scroll" role="region" aria-label={label} tabIndex={0}>
      <table>
        <caption className="sr-only">{label}</caption>
        {children}
      </table>
    </div>
  );
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
  if (components === null) {
    return (
      <div className="skeleton-page" aria-busy="true">
        <Skeleton lines={4} height={14} />
      </div>
    );
  }
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
            <TableFrame label={`${component.name} props`}>
              <thead>
                <tr>
                  <th scope="col">Prop</th>
                  <th scope="col">Type</th>
                  <th scope="col">Default</th>
                  <th scope="col">Notes</th>
                </tr>
              </thead>
              <tbody>
                {component.props.map((prop) => (
                  <tr key={prop.name}>
                    <th scope="row">
                      <code>{prop.name}</code>
                      {prop.required ? <span className="req">required</span> : null}
                    </th>
                    <td>
                      <code className="type">{prop.type}</code>
                    </td>
                    <td>{prop.defaultValue ?? '—'}</td>
                    <td>{prop.description || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </TableFrame>
          </section>
        ))}
      </>
    );
  }
  if (Object.keys(argTypes).length > 0) {
    return (
      <TableFrame label="Props">
        <thead>
          <tr>
            <th scope="col">Prop</th>
            <th scope="col">Control</th>
            <th scope="col">Options</th>
            <th scope="col">Default</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(argTypes).map(([prop, definition]) => (
            <tr key={prop}>
              <th scope="row">
                <code>{prop}</code>
              </th>
              <td>{formatValue(definition.control)}</td>
              <td>{definition.options ? formatValue(definition.options) : '—'}</td>
              <td>{formatValue(defaultArgs[prop])}</td>
            </tr>
          ))}
        </tbody>
      </TableFrame>
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
  const usage = meta.parameters?.docs?.usage;
  const authoredCode = meta.parameters?.docs?.source?.code;
  // Authored samples declare their own language; the snippet derived from arguments is JSX.
  const codeLanguage = meta.parameters?.docs?.source?.language ?? 'tsx';
  // Storybook's `!autodocs` tag excludes a story from docs pages; those stories are usually
  // authored that way because rendering them on a docs page is hostile (inert overlays).
  const visibleStories = useMemo(() => {
    if (!module) return entry.stories;
    const metaTags = ((meta as { tags?: string[] }).tags ?? []).map(String);
    return entry.stories.filter((name) => {
      const storyTags = ((module[name] as { tags?: string[] } | undefined)?.tags ?? []).map(String);
      return ![...metaTags, ...storyTags].includes('!autodocs');
    });
  }, [entry.stories, meta, module]);
  const sections = useMemo(() => sectionStories(visibleStories), [visibleStories]);
  // Foundations pages are stories-only metas: there is no component to instantiate, so a usage
  // snippet would be a made-up tag. Skip it there; component pages keep it.
  const snippet = useMemo(
    () =>
      authoredCode ??
      ((meta as { component?: unknown }).component ? usageSnippet(entry.name, defaultArgs) : null),
    [authoredCode, entry.name, defaultArgs, meta],
  );
  const propCount = props ? props.reduce((total, component) => total + component.props.length, 0) : Object.keys(argTypes).length;

  return (
    <>
      <div className="crumb">
        {entry.group} / {entry.name}
      </div>
      <h1>{entry.name}</h1>
      <div className="summary-row">
        <span className="chip">{module ? visibleStories.length : entry.stories.length} stories</span>
        <span className="chip">{propCount} props</span>
        <span className="chip">from the story module + component source</span>
      </div>
      <p className="lede">
        {description ?? `${entry.name} — every story in ${entry.storybookTitle} is rendered below, in sections.`}
      </p>

      {error ? <div className="story-failed">Could not load the story module: {error}</div> : null}
      {!module && !error ? (
        <div className="skeleton-page" aria-busy="true">
          <Skeleton width={260} height={16} />
          <Skeleton height={150} />
          <Skeleton height={150} />
        </div>
      ) : null}

      {module ? (
        <>
          {snippet ? (
            <>
              <h2>Usage</h2>
              <CodeBlock code={snippet} language={codeLanguage} />
              <p className="hint">{authoredCode ? 'Copied from the story’s docs parameters.' : 'Derived from the default story’s arguments, so it never drifts from what is rendered.'}</p>
            </>
          ) : null}
          {usage ? (
            <>
              {snippet ? null : <h2>Usage</h2>}
              <MarkdownView markdown={usage} />
            </>
          ) : null}

          <Guidance slug={entry.slug} />

          {sections.map((section) => (
            <section key={section.title}>
              <h2>{section.title}</h2>
              <p className="section-blurb">{section.blurb}</p>
              {section.stories.map((story) => (
                <ControlledStoryFrame key={`${entry.slug}:${story}`} module={module} story={story} componentName={entry.name} />
              ))}
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
