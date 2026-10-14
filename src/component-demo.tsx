/** @jsxImportSource react */
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { CodeBlock } from './code';
import type { StoryControl } from './controls';
import { LazySection } from './story-view';
import { storyLink } from './toc';
import './controls.css';
import './component-demo.css';

const COPIED_MS = 1800;

export interface ComponentDemoProps {
  story: string;
  storyName: string;
  authoredStory?: string;
  skipped: string[];
  controls: StoryControl[];
  args: Record<string, unknown>;
  unavailable: string | null;
  changed: boolean;
  onControlChange: (name: string, value: unknown) => void;
  onReset: () => void;
  storyLayout: 'centered' | 'fullscreen' | 'padded';
  snippet: string | null;
  codeLanguage: string;
  children: ReactNode;
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.className = 'toc-clipboard';
    document.body.append(area);
    area.select();
    const copied = document.execCommand('copy');
    area.remove();
    return copied;
  }
}

function CopyLink({ name, story }: { name: string; story: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), COPIED_MS);
    return () => window.clearTimeout(timer);
  }, [copied]);
  return (
    <>
      <button type="button" className="toc-copy" aria-label={`Copy link to ${name}`}
        onClick={async () => setCopied(await copyText(storyLink(window.location, story)))}>
        {copied ? 'Copied' : 'Copy link'}
      </button>
      <span role="status" className="toc-sr">{copied ? `Link to ${name} copied` : ''}</span>
    </>
  );
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

export function hasHorizontalOverflow({ scrollWidth, clientWidth }: Pick<HTMLElement, 'scrollWidth' | 'clientWidth'>) {
  return scrollWidth > clientWidth;
}

export function ComponentDemo({
  story, storyName, authoredStory, skipped, controls, args, unavailable, changed,
  onControlChange, onReset, storyLayout, snippet, codeLanguage, children,
}: ComponentDemoProps) {
  const [codeOpen, setCodeOpen] = useState(false);
  const controlsLabelId = useId();
  const canvasRef = useRef<HTMLDivElement>(null);
  const [scrollable, setScrollable] = useState(false);
  useEffect(() => {
    const canvas = canvasRef.current;
    const content = canvas?.firstElementChild;
    if (!canvas || !content) return;
    const measure = () => setScrollable(hasHorizontalOverflow(canvas));
    let frame = 0;
    const scheduleMeasure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    measure();
    const resize = new ResizeObserver(scheduleMeasure);
    resize.observe(canvas);
    resize.observe(content);
    const mutations = new MutationObserver(scheduleMeasure);
    mutations.observe(content, { childList: true, subtree: true, attributes: true, characterData: true });
    return () => {
      resize.disconnect();
      mutations.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [children, story]);
  const [laneLayout, setLaneLayout] = useState<string>(storyLayout);
  const laneRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (!node) return;
      const content = node.firstElementChild;
      if (!(content instanceof HTMLElement)) return;
      setLaneLayout(storyLayout !== 'fullscreen' && /^inline/.test(getComputedStyle(content).display) ? 'inline' : storyLayout);
    },
    [storyLayout],
  );
  return (
    <div className="frame" data-story={story}>
      <header><span>{storyName}</span><span data-toc-slot=""><CopyLink name={storyName} story={story} /></span></header>
      {authoredStory ? <p className="story-blurb">{authoredStory}</p> : null}
      {skipped.length ? <p className="sd-controls-note">Not run here: {skipped.join(', ')}. See it in Storybook.</p> : null}
      {unavailable ? <p className="sd-controls-note">{unavailable}</p> : (
        <div className="sd-controls" role="group" aria-labelledby={controlsLabelId}>
          <p className="sd-controls-label" id={controlsLabelId}>Controls for {storyName}</p>
          <div className="sd-controls-fields">
            {controls.map((control) => (
              <ControlInput key={control.name} control={control} value={args[control.name]}
                onChange={(value) => onControlChange(control.name, value)} />
            ))}
            <button className="sd-controls-reset" type="button" disabled={!changed} onClick={onReset}>Reset</button>
          </div>
        </div>
      )}
      <div className="shot" data-layout={storyLayout} ref={canvasRef}
        tabIndex={scrollable ? 0 : undefined} role={scrollable ? 'region' : undefined}
        aria-label={scrollable ? storyName : undefined}>
        <LazySection>
          <div className="story-lane" data-layout={laneLayout} ref={laneRef}>{children}</div>
        </LazySection>
      </div>
      <details className="code-toggle" onToggle={(event) => setCodeOpen(event.currentTarget.open)}>
        <summary><span className="sd-demo-code-actions">Code</span></summary>
        {codeOpen ? <div className="sd-demo-code">{snippet
          ? <CodeBlock code={snippet} language={codeLanguage} label={`${storyName} code`} />
          : <p>No usage code is authored for this component.</p>
        }</div> : null}
      </details>
    </div>
  );
}
