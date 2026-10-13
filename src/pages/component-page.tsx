/** @jsxImportSource react */
import { useMemo, type ReactNode } from 'react';
import type { CatalogEntry } from '../config';
import { Guidance } from '../guidance';
import { CodeBlock } from '../code';
import { defaultsFromProps } from '../controls';
import { MarkdownView } from '../guidance';
import { sectionStories, usageSnippet, type DocsParameters } from '../sections';
import { useStoryModule } from '../story-view';
import { ControlledStoryFrame } from '../controls';
import { useProps, type ComponentPropsDoc, type PropDoc } from '../props';
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

function PropNotes({ prop }: { prop: PropDoc }) {
  return (
    <>
      {prop.description ? <MarkdownView markdown={prop.description} /> : null}
      {prop.tags?.map((tag, index) => (
        <div key={`${tag.name}:${index}`}>
          <strong>{tag.name === 'deprecated' ? 'Deprecated' : tag.name === 'since' ? 'Since' : 'Example'}</strong>
          {tag.name === 'example' ? <pre><code>{tag.text}</code></pre> : tag.text ? <MarkdownView markdown={tag.text} /> : null}
        </div>
      ))}
      {prop.inheritedFrom ? <small>Inherited from <code>{prop.inheritedFrom}</code></small> : null}
      {!prop.description && !prop.tags?.length && !prop.inheritedFrom ? '—' : null}
    </>
  );
}

function PropRows({ props }: { props: PropDoc[] }) {
  return props.map((prop) => (
    <tr key={prop.name}>
      <th scope="row">
        <code>{prop.name}</code>
        {prop.required ? <span className="req">required</span> : null}
      </th>
      <td>
        <code className="type">{prop.typeUnavailable ? 'Not resolved' : prop.type}</code>
        {prop.members?.length ? (
          <details>
            <summary>{prop.name === 'slotProps' ? 'Slots' : 'Fields'}</summary>
            <dl>
              {prop.members.map((member) => (
                <div key={member.name}>
                  <dt><code>{member.name}</code>{member.required ? ' (required)' : ''}</dt>
                  <dd><code>{member.type}</code><PropNotes prop={member} /></dd>
                </div>
              ))}
            </dl>
          </details>
        ) : null}
      </td>
      <td><code>{prop.defaultValue === 'undefined' ? '—' : prop.defaultValue ?? '—'}</code></td>
      <td><PropNotes prop={prop} /></td>
    </tr>
  ));
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
                Native element: <code>&lt;{component.native}&gt;</code>.
              </p>
            ) : null}
            {component.props.some((prop) => !prop.inheritedFrom) ? <TableFrame label={`${component.name} props`}>
              <thead>
                <tr>
                  <th scope="col">Prop</th>
                  <th scope="col">Type</th>
                  <th scope="col">Default</th>
                  <th scope="col">Notes</th>
                </tr>
              </thead>
              <tbody>
                <PropRows props={component.props.filter((prop) => !prop.inheritedFrom)} />
              </tbody>
            </TableFrame> : <p>No component-specific props.</p>}
            {component.props.some((prop) => prop.inheritedFrom) ? (
              <details>
                <summary>Inherited props ({component.props.filter((prop) => prop.inheritedFrom).length})</summary>
                <TableFrame label={`${component.name} inherited props`}>
                  <thead><tr><th scope="col">Prop</th><th scope="col">Type</th><th scope="col">Default</th><th scope="col">Notes</th></tr></thead>
                  <tbody><PropRows props={component.props.filter((prop) => prop.inheritedFrom)} /></tbody>
                </TableFrame>
              </details>
            ) : null}
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
              <td>{Array.isArray(definition.options) ? definition.options.map((option) => formatValue(option)).join(' | ') : '—'}</td>
              <td>{formatValue(defaultArgs[prop])}</td>
            </tr>
          ))}
        </tbody>
      </TableFrame>
    );
  }
  return <p>No props.</p>;
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
  // Controls show the component's own defaults until the reader changes them.
  const componentDefaults = useMemo(
    () => defaultsFromProps(props?.find((component) => component.name === entry.name)?.props ?? []),
    [props, entry.name],
  );

  return (
    <>
      <div className="crumb">
        {entry.group} / {entry.name}
      </div>
      <h1>{entry.name}</h1>
      <div className="summary-row">
        <span className="chip">{module ? visibleStories.length : entry.stories.length} stories</span>
        <span className="chip">{propCount} props</span>
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
              {section.stories.map((story) => (
                <ControlledStoryFrame key={`${entry.slug}:${story}`} module={module} story={story} componentName={entry.name} componentDefaults={componentDefaults} />
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
