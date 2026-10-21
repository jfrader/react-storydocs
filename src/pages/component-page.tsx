/** @jsxImportSource react */
import { Component, Suspense, useEffect, useMemo, useState, type ComponentType, type ReactNode } from 'react';
import type { CatalogEntry } from '../config';
import { storySource } from 'virtual:storybook-docs/catalog';
import { decorators as globalDecorators } from 'virtual:storybook-docs/decorators';
import { hrefFor } from '../base';
import { Guidance } from '../guidance';
import { CodeBlock } from '../code';
import { defaultsFromProps } from '../controls';
import { MarkdownView } from '../guidance';
import { resolveSections, selectExample, type DocsParameters } from '../sections';
import { useStoryModule } from '../story-view';
import { ControlledStoryFrame } from '../controls';
import { useProps, type CatalogRef, type ComponentPropsDoc, type PropDoc } from '../props';
import { Composition as ProvidedComposition, provided as hasComposition } from 'virtual:storybook-docs/composition';
import { Skeleton } from '../skeleton';
import { loadStorySources } from 'virtual:storybook-docs/story-sources';
import { scrollToElement } from '../scroll';

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
  component?: { displayName?: string };
  argTypes?: Record<string, Record<string, unknown>>;
  args?: Record<string, unknown>;
  parameters?: { docs?: DocsParameters };
}

interface UsageStory {
  args?: Record<string, unknown>;
  play?: unknown;
  parameters?: { docs?: DocsParameters };
}


function TableFrame({ label, children, className = '' }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className="table-scroll" role="region" aria-label={label} tabIndex={0}>
      <table className={`props-table${className ? ` ${className}` : ''}`}>
        <caption className="sr-only">{label}</caption>
        {children}
      </table>
    </div>
  );
}

function PropNotes({ prop }: { prop: PropDoc }) {
  const nativeStyle = prop.name === 'style' && !prop.description;
  return (
    <>
      {prop.description ? <MarkdownView markdown={prop.description} /> : null}
      {nativeStyle ? <MarkdownView markdown="Native style overrides. `sx` applies design-system styling last." /> : null}
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

const SHAPE_PREVIEW_FIELDS = 3;

const apiSlug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function PartLink({ name, children }: { name: string; children: ReactNode }) {
  const scrollToPart = () => {
    const heading = document.getElementById(`api-${apiSlug(name)}`);
    if (heading) scrollToElement(heading);
  };
  return <button type="button" className="api-part-link" onClick={scrollToPart}>{children}</button>;
}

function SlotsTable({ components }: { components: ComponentPropsDoc[] }) {
  const slots = new Map<string, PropDoc>();
  for (const propName of ['slotProps', 'slots']) {
    for (const component of components) {
      for (const member of component.props.find((prop) => prop.name === propName)?.members ?? []) {
        const previous = slots.get(member.name);
        slots.set(member.name, previous ? {
          ...member, ...previous,
          description: previous.description || member.description,
          part: previous.part ?? member.part,
          component: previous.component ?? member.component,
          defaultElement: previous.defaultElement ?? member.defaultElement,
        } : member);
      }
    }
  }
  if (!slots.size) return null;
  return <>
    <h3>Slots</h3>
    <TableFrame label="Slots" className="slots-table">
      <thead><tr><th scope="col">Slot</th><th scope="col">Default</th><th scope="col">Description</th></tr></thead>
      <tbody>{Array.from(slots.values()).sort((a, b) => Number(b.name === 'root') - Number(a.name === 'root') || a.name.localeCompare(b.name)).map((slot) => {
        const local = components.find((component) => component.name === (slot.component?.name ?? slot.defaultElement));
        return <tr key={slot.name}>
          <th scope="row"><code>{slot.name}</code>{slot.part ? <small><code>data-ui="{slot.part}"</code></small> : null}</th>
          <td>{local ? <PartLink name={local.name}><code>{local.name}</code></PartLink>
            : slot.component ? <a href={`#${hrefFor(`/components/${slot.component.slug}`)}`}><code>{slot.component.name}</code></a>
            : slot.defaultElement ? <code>{slot.defaultElement}</code> : '—'}</td>
          <td>{slot.description ? <MarkdownView markdown={slot.description} /> : '—'}</td>
        </tr>;
      })}</tbody>
    </TableFrame>
  </>;
}

function PropType({ prop }: { prop: PropDoc }) {
  // Native style objects describe the platform, not this component. Expanding CSSProperties turns
  // one style row into hundreds of MDN member tables; the type text and a note are the API here.
  const nativeStyle = prop.name === 'style' || /CSSProperties/.test(prop.type);
  const signature = nativeStyle ? undefined : prop.signatures?.[0];
  const visibleMembers = nativeStyle ? undefined : prop.members;
  const fields = visibleMembers?.slice(0, SHAPE_PREVIEW_FIELDS).map((member) => `${member.name}${member.required ? '' : '?'}: …`).join('; ');
  return (
    <>
      <TypeText prop={prop} signature={signature?.type} />
      {signature ? (
        <details>
          <summary>Signature details</summary>
          {prop.type !== signature.type ? <code className="type">{prop.type}</code> : null}
          {prop.signatures?.map((item, index) => (
            <div key={index}>
              <code className="type">{item.type}</code>
              <dl>{item.parameters.filter((parameter) => parameter.description).map((parameter) => (
                <div key={parameter.name}>
                  <dt><code>{parameter.name}: {parameter.type}</code></dt>
                  <dd><MarkdownView markdown={parameter.description} /></dd>
                </div>
              ))}</dl>
            </div>
          ))}
        </details>
      ) : null}
      {visibleMembers?.length ? (
        <details>
          <summary>Fields <code>{`{ ${fields}${visibleMembers.length > SHAPE_PREVIEW_FIELDS ? '; …' : ''} }`}</code></summary>
          <dl>
            {visibleMembers.map((member) => (
              <div key={member.name}>
                <dt><code>{member.name}{member.required ? '' : '?'}</code>{member.required ? ' (required)' : ''}</dt>
                <dd><PropType prop={member} /><PropNotes prop={member} /></dd>
              </div>
            ))}
          </dl>
        </details>
      ) : null}
    </>
  );
}

function TypeText({ prop, signature }: { prop: PropDoc; signature?: string }) {
  const text = prop.typeUnavailable ? 'Not resolved' : signature ?? prop.type;
  const code = <code className={signature ? 'type signature' : 'type'} tabIndex={signature ? 0 : undefined}>{text}</code>;
  return prop.component
    ? <a href={`#${hrefFor(`/components/${prop.component.slug}`)}`}>{code}</a>
    : code;
}

class CompositionBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

function CompositionPanel({ entry, components, uses }: {
  entry: { slug: string; name: string; group: string };
  components: ComponentPropsDoc[] | null;
  uses: CatalogRef[];
}) {
  if (!hasComposition || !ProvidedComposition) return null;
  const Panel = ProvidedComposition as ComponentType<{
    entry: { slug: string; name: string; group: string };
    components: ComponentPropsDoc[] | null;
    uses: CatalogRef[];
  }>;
  return (
    <CompositionBoundary>
      <Suspense fallback={null}>
        <Panel entry={entry} components={components} uses={uses} />
      </Suspense>
    </CompositionBoundary>
  );
}

function InheritedLinks({ component }: { component: ComponentPropsDoc }) {
  const bases = Array.from(new Map(component.props.flatMap((prop) => prop.inheritedComponent ? [[prop.inheritedComponent.slug, prop.inheritedComponent] as const] : [])).values());
  const external = Array.from(new Set(component.props
    .filter((prop) => prop.inheritedFrom && !prop.inheritedComponent)
    .map((prop) => prop.inheritedFrom!)
    .filter((name) => !/\.d\.ts$/.test(name))));
  return <>
    {bases.map((entry) => <p key={entry.slug}>Also accepts the props of <a href={`#${hrefFor(`/components/${entry.slug}`)}`}>{entry.name}</a>.</p>)}
    {component.native ? <p>Also accepts the attributes of <code>&lt;{component.native}&gt;</code>.</p> : null}
    {external.length ? <p>Also accepts inherited props from {external.map((name, index) => <span key={name}>{index ? ', ' : ''}<code>{name}</code></span>)}.</p> : null}
  </>;
}

function PropRows({ props }: { props: PropDoc[] }) {
  return props.map((prop) => (
    <tr key={prop.name}>
      <th scope="row">
        <code>{prop.name}</code>
        {prop.required ? <span className="req">required</span> : null}
      </th>
      <td>
        <PropType prop={prop} />
      </td>
      <td><code>{prop.defaultValue === 'undefined' ? '—' : prop.defaultValue ?? '—'}</code></td>
      <td><PropNotes prop={prop} /></td>
    </tr>
  ));
}

const DOM_INHERITED = /^(?:HTML|Aria|DOM|Ref)Attributes$/;

/** Group inherited props by the contract that declares them. DOM/ARIA groups last; they are the
 * least useful part of a wrapper library's API and make a 300-row table unreadable. */
function groupInherited(props: PropDoc[]): Array<[string, PropDoc[]]> {
  const groups = new Map<string, PropDoc[]>();
  for (const prop of props) {
    const name = prop.inheritedFrom && !/\.d\.[cm]?ts$/.test(prop.inheritedFrom) ? prop.inheritedFrom : 'Other';
    groups.set(name, [...(groups.get(name) ?? []), prop]);
  }
  return Array.from(groups).sort(([a], [b]) => {
    const rank = (name: string) => (DOM_INHERITED.test(name) ? 2 : name === 'Other' ? 1 : 0);
    return rank(a) - rank(b) || a.localeCompare(b);
  });
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
    return (
      <>
        {components.map((component, index) => {
          const inherited = component.props.filter((prop) => prop.inheritedFrom);
          const inheritedGroups = groupInherited(inherited);
          return (
            <section className="api-part" key={component.name}>
              <h3 id={`api-${apiSlug(component.name)}`}>{component.name}</h3>
              {index > 0 && component.description ? <MarkdownView markdown={component.description} /> : null}
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
              <InheritedLinks component={component} />
              {inherited.length > 0 ? <details className="api-inherited">
                <summary>Inherited props <span className="count">{inherited.length}</span></summary>
                {inheritedGroups.map(([name, props]) => (
                  <details className="api-inherited-group" key={name}>
                    <summary>{name} <span className="count">{props.length}</span></summary>
                    <TableFrame label={`${component.name} ${name} props`}>
                      <thead>
                        <tr>
                          <th scope="col">Prop</th>
                          <th scope="col">Type</th>
                          <th scope="col">Default</th>
                          <th scope="col">Notes</th>
                        </tr>
                      </thead>
                      <tbody>
                        <PropRows props={props} />
                      </tbody>
                    </TableFrame>
                  </details>
                ))}
              </details> : null}
            </section>
          );
        })}
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
  const [storySources, setStorySources] = useState<{ slug: string; sources: Record<string, string> } | null>(null);
  useEffect(() => {
    let active = true;
    loadStorySources(entry.slug).then(({ sources }) => {
      if (active) setStorySources({ slug: entry.slug, sources });
    }).catch(() => {
      if (active) setStorySources(null);
    });
    return () => { active = false; };
  }, [entry.slug]);
  const sources = storySources?.slug === entry.slug ? storySources.sources : {};
  const loaded = useProps(entry.slug);
  const props = loaded?.components ?? null;
  const uses = loaded?.uses ?? [];
  // The rail must not offer targets while the page is still assembling: the story module and the
  // props table arrive after the first paint, and every anchor below them would move. The
  // attribute lives on the main column because this page renders as a fragment.
  const settled = Boolean(module || error) && loaded !== null;
  useEffect(() => {
    const main = document.querySelector<HTMLElement>('.main');
    if (!main) return;
    if (settled) main.removeAttribute('data-page-ready');
    else main.setAttribute('data-page-ready', 'pending');
    return () => main.removeAttribute('data-page-ready');
  }, [settled]);
  const meta = (module?.default ?? {}) as MetaShape;
  const argTypes = meta.argTypes ?? {};
  const defaultArgs = meta.args ?? {};
  const description = meta.parameters?.docs?.description?.component ?? props?.[0]?.description;
  const usage = meta.parameters?.docs?.usage;
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
  // Controls show the component's own defaults until the reader changes them.
  const componentDefaults = useMemo(
    () => defaultsFromProps(props?.find((component) => component.name === entry.name)?.props ?? []),
    [props, entry.name],
  );
  const fallbackExample = selectExample(visibleStories.map((name) => ({
    name,
    description: (module?.[name] as UsageStory | undefined)?.parameters?.docs?.description?.story,
    args: { ...defaultArgs, ...(module?.[name] as UsageStory | undefined)?.args },
    play: (module?.[name] as UsageStory | undefined)?.play,
  })), Object.keys(meta.component ?? {}), props === null ? null : componentDefaults);
  const { example, sections } = resolveSections(visibleStories, meta.parameters?.docs?.sections, fallbackExample);
  const storyCount = sections.reduce((total, section) => total + section.stories.length, example ? 1 : 0);
  // Own props only: inherited ones (DOM, ARIA) live behind their own disclosure, so counting them
  // here would show a number the reader cannot act on.
  const propCount = props
    ? props.reduce((total, component) => total + component.props.filter((prop) => !prop.inheritedFrom).length, 0)
    : Object.keys(argTypes).length;

  return (
    <>
      <div className="crumb">
        {[...entry.group.split('/'), entry.name].join(' / ')}
      </div>
      <h1>{entry.name}</h1>
      <div className="summary-row">
        <span className="chip">{module ? storyCount : entry.stories.length} stories</span>
        <span className="chip">{propCount} props</span>
      </div>
      {description ? <p className="lede">{description}</p> : null}

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
          {example ? <ControlledStoryFrame key={`${entry.slug}:${example}`} module={module} story={example} componentName={entry.name} componentDefaults={componentDefaults} renderSource={sources[example]} decorators={globalDecorators} /> : null}
          {usage ? (
            <>
              <h2>Usage</h2>
              <MarkdownView markdown={usage} />
            </>
          ) : null}

          <Guidance slug={entry.slug} />
          <CompositionPanel entry={entry} components={props} uses={uses} />

          {sections.map((section) => (
            <section key={section.title}>
              <h2>{section.title}</h2>
              {section.stories.map((story) => (
                <ControlledStoryFrame key={`${entry.slug}:${story}`} module={module} story={story} componentName={entry.name} componentDefaults={componentDefaults} renderSource={sources[story]} decorators={globalDecorators} />
              ))}
            </section>
          ))}
        </>
      ) : null}

      {entry.hasComponent || props?.length || Object.keys(argTypes).length || uses.length ? <>
        <h2>API</h2>
        {entry.hasComponent && storySource ? <CodeBlock code={`import { ${props?.[0]?.name ?? entry.name} } from '${storySource}';`} language="tsx" label="Import" /> : null}
        <PropsTable components={props} argTypes={argTypes} defaultArgs={defaultArgs} />
        <SlotsTable components={props ?? []} />
        {uses.length ? <><h3>Also uses</h3><ul>{uses.map((component) => <li key={component.slug}><a href={`#${hrefFor(`/components/${component.slug}`)}`}>{component.name}</a></li>)}</ul></> : null}
      </> : null}
    </>
  );
}
