import { useId, useState } from 'react';
import { usageSnippet } from './sections';
import { LazySection, StoryView } from './story-view';
import './controls.css';

interface StoryShape {
  args?: Record<string, unknown>;
  argTypes?: Record<string, Record<string, unknown>>;
  render?: unknown;
}

export interface StoryControl {
  name: string;
  type: 'boolean' | 'select' | 'number' | 'text';
  options?: unknown[];
}

export function getStoryControls(meta: StoryShape, story: StoryShape) {
  const args = { ...meta.args, ...story.args };
  const controls: StoryControl[] = [];
  if (typeof story.render === 'function' || typeof meta.render === 'function') {
    return { args, controls, unavailable: 'Controls unavailable: this story uses a custom render.' };
  }
  for (const [name, definition] of Object.entries({ ...meta.argTypes, ...story.argTypes })) {
    const control = definition.control;
    if (control === false || control === null) continue;
    const type = typeof control === 'string'
      ? control
      : control && typeof control === 'object' && 'type' in control
        ? control.type
        : undefined;
    if (type === 'boolean' || type === 'number' || type === 'text' || type === 'string') {
      controls.push({ name, type: type === 'string' ? 'text' : type });
    } else if ((type === 'select' || type === 'radio') && Array.isArray(definition.options) && definition.options.length > 0) {
      controls.push({ name, type: 'select', options: definition.options });
    } else {
      continue;
    }
    if (Object.hasOwn(definition, 'defaultValue')) args[name] = definition.defaultValue;
  }
  return {
    args,
    controls,
    unavailable: controls.length === 0 ? 'Controls unavailable: this story has no supported argTypes.' : null,
  };
}

function ControlInput({ control, value, onChange }: {
  control: StoryControl;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const id = useId();
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
      ) : (
        <input id={id} type={control.type === 'number' ? 'number' : 'text'}
          step={control.type === 'number' ? 'any' : undefined}
          value={typeof value === 'string' || typeof value === 'number' ? value : ''}
          onChange={(event) => onChange(control.type === 'number'
            ? event.target.value === '' ? undefined : event.target.valueAsNumber
            : event.target.value)} />
      )}
    </div>
  );
}

export function ControlledStoryFrame({ module, story, componentName }: {
  module: Record<string, unknown>;
  story: string;
  componentName: string;
}) {
  const meta = (module.default ?? {}) as StoryShape;
  const definition = (module[story] ?? {}) as StoryShape;
  const { args: defaults, controls, unavailable } = getStoryControls(meta, definition);
  const [edits, setEdits] = useState<Record<string, unknown>>({});
  const args = { ...defaults, ...edits };
  const changed = Object.entries(edits).some(([name, value]) => !Object.is(value, defaults[name]));
  const snippet = typeof definition.render === 'function' || typeof meta.render === 'function'
    ? null
    : usageSnippet(componentName, args);
  return (
    <div className="frame">
      <header><span>{story}</span></header>
      {unavailable ? <p className="sd-controls-note">{unavailable}</p> : (
        <fieldset className="sd-controls">
          <legend>Controls for {story}</legend>
          <div className="sd-controls-fields">
            {controls.map((control) => (
              <ControlInput key={control.name} control={control} value={args[control.name]}
                onChange={(value) => setEdits((current) => ({ ...current, [control.name]: value }))} />
            ))}
            <button className="sd-controls-reset" type="button" disabled={!changed} onClick={() => setEdits({})}>Reset</button>
          </div>
        </fieldset>
      )}
      <div className="shot">
        <LazySection><StoryView module={module} story={story} overrides={unavailable ? undefined : args} /></LazySection>
      </div>
      {snippet ? (
        <details className="code-toggle"><summary>Code</summary><pre className="code">{snippet}</pre></details>
      ) : null}
    </div>
  );
}
