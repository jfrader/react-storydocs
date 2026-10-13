/** @jsxImportSource react */
import { useState } from 'react';
import { ComponentDemo } from './component-demo';
export { hasHorizontalOverflow } from './component-demo';
import { mergeAnnotations, buildUsageSnippet, type DocsParameters } from './sections';
import { StoryView } from './story-view';
import { storySource } from 'virtual:storybook-docs/catalog';

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
  const args = { ...defaults, ...edits };
  const changed = Object.entries(edits).some(([name, value]) => !Object.is(value, defaults[name]));
  // Storybook semantics: the story's own `layout` decides whether the lane is padded (block)
  // or centred. Components that measure their own width need the padded, full-width lane.
  const requestedLayout = definition.parameters?.layout ?? meta.parameters?.layout;
  const storyLayout = requestedLayout === 'centered' || requestedLayout === 'fullscreen' ? requestedLayout : 'padded';
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
  // One rule for a snippet, shared with the page: authored source first, otherwise the story's own
  // arguments, always with the import. Previously the frame skipped the derived branch whenever a
  // story used a custom render, so its Code panel claimed no code existed while the page above it
  // showed one.
  const snippet = buildUsageSnippet({
    componentName,
    from: storySource,
    args: { ...meta.args, ...definition.args, ...edits },
    source: authoredCode,
    // A story name is not a component name: only a part-qualified name (the rare `Dialog.Content`
    // story) is worth using as the JSX tag, otherwise the component's own name is the honest one.
    jsxName: storyName.includes('.') ? storyName : undefined,
    component: (meta as { component?: unknown }).component,
  });
  return (
    <ComponentDemo story={story} storyName={storyName} authoredStory={authoredStory}
      skipped={skipped} controls={controls} args={args} unavailable={unavailable} changed={changed}
      storyLayout={storyLayout} snippet={snippet} codeLanguage={codeLanguage}
      onControlChange={(name, value) => setEdits((current) => ({ ...current, [name]: value }))}
      onReset={() => setEdits({})}>
      <StoryView module={module} story={story} overrides={edits} />
    </ComponentDemo>
  );
}
