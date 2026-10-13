/** @jsxImportSource react */
import { useCallback, useEffect, useId, useState } from 'react';
import { CodeBlock } from './code';
import { mergeAnnotations, usageSnippet, type DocsParameters } from './sections';
import { LazySection, StoryView } from './story-view';
import './controls.css';

interface StoryShape {
  name?: string;
  args?: Record<string, unknown>;
  argTypes?: Record<string, Record<string, unknown>>;
  render?: unknown;
  loaders?: unknown;
  beforeEach?: unknown;
  parameters?: { docs?: DocsParameters; layout?: string; viewport?: unknown };
}

export interface StoryControl {
  name: string;
  type: 'boolean' | 'select' | 'number' | 'text' | 'range' | 'object';
  options?: unknown[];
  min?: number;
  max?: number;
  step?: number;
}

/** Storybook's argTypes can declare a default; the component's own default comes from docgen as a
 * source snippet, so it is parsed back into a value the controls can show. */
export function parseDefault(value: string): unknown {
  const text = value.trim();
  if (text === 'undefined' || text === '') return undefined;
  try {
    return JSON.parse(text);
  } catch {
    if (text.startsWith("'") && text.endsWith("'") && !text.slice(1, -1).includes("'")) return text.slice(1, -1);
  }
  return undefined;
}

/** Every prop docgen gave a default for. Declared before the component's own default so an
 *  argType default still wins. */
/** Docgen reports the default either as a source snippet or as `{ value }`; accept both. */
export function defaultsFromProps(
  props: Array<{ defaultValue?: string | { value?: string } | null; name: string }> = [],
) {
  const defaults: Record<string, unknown> = {};
  for (const prop of Array.isArray(props) ? props : []) {
    const declared = prop?.defaultValue;
    const text = typeof declared === 'string' ? declared : declared?.value;
    if (typeof text === 'string') {
      const value = parseDefault(text);
      if (value !== undefined) defaults[prop.name] = value;
    }
  }
  return defaults;
}

export function getStoryControls(meta: StoryShape, story: StoryShape, componentDefaults: Record<string, unknown> = {}) {
  const args = { ...componentDefaults, ...meta.args, ...story.args };
  const controls: StoryControl[] = [];
  for (const [name, raw] of Object.entries(mergeAnnotations(meta.argTypes, story.argTypes))) {
    const definition = raw as Record<string, unknown>;
    const control = definition.control;
    if (control === false || control === null) continue;
    const type = typeof control === 'string'
      ? control
      : control && typeof control === 'object' && 'type' in control
        ? control.type
        : undefined;
    if (type === 'boolean' || type === 'number' || type === 'text' || type === 'string') {
      controls.push({ name, type: type === 'string' ? 'text' : type });
    } else if ((type === 'select' || type === 'radio' || type === 'inline-radio') && Array.isArray(definition.options) && definition.options.length > 0) {
      controls.push({ name, type: 'select', options: definition.options });
    } else if (type === 'range') {
      const settings = control as { min?: number; max?: number; step?: number };
      controls.push({ name, type, min: settings.min, max: settings.max, step: settings.step });
    } else if (type === 'object') {
      controls.push({ name, type });
    } else {
      continue;
    }
    if (!Object.hasOwn(args, name) && Object.hasOwn(definition, 'defaultValue')) args[name] = definition.defaultValue;
  }
  return {
    args,
    controls,
    unavailable: controls.length === 0 ? 'No controls.' : null,
  };
}

function ControlInput({ control, value, onChange }: {
  control: StoryControl;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const id = useId();
  const [invalid, setInvalid] = useState(false);
  useEffect(() => setInvalid(false), [value]);
  return (
    <div className="sd-control">
      <label htmlFor={id}>{control.name}</label>
      {control.type === 'select' ? (
        <select id={id} value={String(control.options?.findIndex((option) => Object.is(option, value)) ?? -1)}
          onChange={(event) => onChange(control.options?.[Number(event.target.value)])}>
          <option value="-1" disabled>—</option>
          {control.options?.map((option, index) => <option key={index} value={index}>{String(option)}</option>)}
        </select>
      ) : control.type === 'boolean' ? (
        <input id={id} type="checkbox" checked={Boolean(value)} onChange={(event) => onChange(event.target.checked)} />
      ) : control.type === 'object' ? (
        <>
          <textarea key={JSON.stringify(value)} id={id} defaultValue={JSON.stringify(value, null, 2) ?? ''}
            aria-invalid={invalid} aria-describedby={invalid ? `${id}-error` : undefined} onBlur={(event) => {
              try { onChange(JSON.parse(event.target.value)); setInvalid(false); }
              catch { setInvalid(true); }
            }} />
          {invalid ? <span id={`${id}-error`} role="status">Enter valid JSON.</span> : null}
        </>
      ) : (
        <input id={id} type={control.type === 'number' || control.type === 'range' ? control.type : 'text'}
          min={control.min} max={control.max} step={control.step ?? (control.type === 'number' ? 'any' : undefined)}
          value={typeof value === 'string' || typeof value === 'number' ? value : ''}
          onChange={(event) => onChange(control.type === 'number' || control.type === 'range'
            ? event.target.value === '' ? undefined : event.target.valueAsNumber
            : event.target.value)} />
      )}
    </div>
  );
}

export function ControlledStoryFrame({ module, story, componentName, componentDefaults }: {
  module: Record<string, unknown>;
  story: string;
  componentName: string;
  /** Defaults read from the component source, shown until the reader changes them. */
  componentDefaults?: Record<string, unknown>;
}) {
  const meta = (module.default ?? {}) as StoryShape;
  const definition = (module[story] ?? {}) as StoryShape;
  const { args: defaults, controls, unavailable } = getStoryControls(meta, definition, componentDefaults);
  const [edits, setEdits] = useState<Record<string, unknown>>({});
  const [codeOpen, setCodeOpen] = useState(false);
  const args = { ...defaults, ...edits };
  const changed = Object.entries(edits).some(([name, value]) => !Object.is(value, defaults[name]));
  // Storybook semantics: the story's own `layout` decides whether the lane is padded (block)
  // or centred. Components that measure their own width need the padded, full-width lane.
  const requestedLayout = definition.parameters?.layout ?? meta.parameters?.layout;
  const storyLayout = requestedLayout === 'centered' || requestedLayout === 'fullscreen' ? requestedLayout : 'padded';
  const [laneLayout, setLaneLayout] = useState<string>(storyLayout);
  // A block lane is what components that measure their own width need; inline-level content
  // (a lone button, badge, switch) can still be centred visually without shrinking the lane.
  const laneRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (!node) return;
      const content = node.firstElementChild;
      if (!(content instanceof HTMLElement)) return;
      setLaneLayout(storyLayout !== 'fullscreen' && /^inline/.test(getComputedStyle(content).display) ? 'inline' : storyLayout);
    },
    [storyLayout],
  );
  // A stories-only meta (foundations pages) has no component to instantiate, so there is no
  // honest usage snippet to show: skip it rather than inventing a tag from the page name.
  // Storybook's own precedence: an authored `docs.source.code` wins over a generated snippet, and
  // `docs.description.story` documents the individual example.
  const docsOverride = (definition as { parameters?: { docs?: DocsParameters } }).parameters?.docs;
  const docsMeta = (meta as { parameters?: { docs?: DocsParameters } }).parameters?.docs;
  const authoredCode = docsOverride?.source?.code ?? docsMeta?.source?.code;
  const authoredStory = docsOverride?.description?.story ?? docsMeta?.description?.story;
  const storyName = definition.name ?? story;
  const skipped: string[] = (['loaders', 'beforeEach'] as const).filter((key) => meta[key] || definition[key]);
  if (definition.parameters?.viewport ?? meta.parameters?.viewport) skipped.push('viewport');
  const codeLanguage = docsOverride?.source?.language ?? docsMeta?.source?.language ?? 'tsx';
  const snippet = authoredCode ?? (!(meta as { component?: unknown }).component || typeof definition.render === 'function' || typeof meta.render === 'function'
    ? null
    : usageSnippet(componentName, { ...meta.args, ...definition.args, ...edits }));
  return (
    <div className="frame" data-story={story}>
      <header><span>{storyName}</span></header>
      {authoredStory ? <p className="story-blurb">{authoredStory}</p> : null}
      {skipped.length ? <p className="sd-controls-note">Not run here: {skipped.join(', ')}. See it in Storybook.</p> : null}
      {unavailable ? <p className="sd-controls-note">{unavailable}</p> : (
        <fieldset className="sd-controls">
          <legend>Controls for {storyName}</legend>
          <div className="sd-controls-fields">
            {controls.map((control) => (
              <ControlInput key={control.name} control={control} value={args[control.name]}
                onChange={(value) => setEdits((current) => ({ ...current, [control.name]: value }))} />
            ))}
            <button className="sd-controls-reset" type="button" disabled={!changed} onClick={() => setEdits({})}>Reset</button>
          </div>
        </fieldset>
      )}
      <div className="shot" data-layout={storyLayout}>
        <LazySection>
          <div className="story-lane" data-layout={laneLayout} ref={laneRef}>
            <StoryView module={module} story={story} overrides={edits} />
          </div>
        </LazySection>
      </div>
      {snippet ? (
        <details className="code-toggle" onToggle={(event) => setCodeOpen(event.currentTarget.open)}>
          <summary>Code</summary>
          {codeOpen ? <CodeBlock code={snippet} language={codeLanguage} /> : null}
        </details>
      ) : null}
    </div>
  );
}
