/** @jsxImportSource react */
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { CodeBlock } from './code';
import type { StoryControl } from './controls';
import { storyLink } from './toc';
import { standaloneStoryHref } from './story-route';
import { StoryLane } from './story-lane';
import './controls.css';
import './story-frame.css';

const COPIED_MS = 1800;

export interface StoryFrameProps {
  componentSlug?: string;
  story: string;
  storyName: string;
  authoredStory?: string;
  notice?: string | null;
  controls: StoryControl[];
  args: Record<string, unknown>;
  changed: boolean;
  onControlChange: (name: string, value: unknown) => void;
  onReset: () => void;
  storyLayout: 'centered' | 'fullscreen' | 'padded';
  snippet: string | null;
  codeLanguage: string;
  children: ReactNode;
}

export async function copyText(text: string): Promise<boolean> {
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
    try {
      return document.execCommand('copy');
    } catch {
      return false;
    } finally {
      area.remove();
    }
  }
}

const icons = {
  code: <path d="m8 6-6 6 6 6m8-12 6 6-6 6m-3-15-2 18" />,
  link: <path d="m10 13 4-4m-6 6-1 1a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0m2 3 1-1a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0" />,
  expand: <path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5M3 3l6 6m12-6-6 6M3 21l6-6m12 6-6-6" />,
  copy: <><rect x="8" y="8" width="12" height="13" rx="2" /><path d="M16 8V3H3v13h5" /></>,
  check: <path d="m4 12 5 5L20 6" />,
};

function ActionIcon({ icon }: { icon: keyof typeof icons }) {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{icons[icon]}</svg>;
}

function CopyAction({ label, success, text, icon }: { label: string; success: string; text: () => string; icon: 'copy' | 'link' }) {
  const [status, setStatus] = useState('');
  const copied = status === success;
  useEffect(() => {
    if (!status) return;
    const timer = window.setTimeout(() => setStatus(''), COPIED_MS);
    return () => window.clearTimeout(timer);
  }, [status]);
  return (
    <>
      <button type="button" className={`sd-frame-action sd-frame-copy sd-frame-copy-${icon}`} aria-label={label} title={copied ? 'Copied' : label}
        onClick={async () => setStatus(await copyText(text()) ? success : 'Could not copy. Try again.')}>
        <ActionIcon icon={copied ? 'check' : icon} />
        <span>{copied ? 'Copied' : icon === 'link' ? 'Copy link' : 'Copy code'}</span>
      </button>
      <span role="status" className="toc-sr">{status}</span>
    </>
  );
}

/** Story blurbs are one paragraph of Markdown in practice: inline code is the part that matters. */
function StoryBlurb({ text }: { text: string }) {
  return <p className="story-blurb">{text.split(/(`[^`]+`)/g).map((part, index) =>
    part.length > 2 && part.startsWith('`') && part.endsWith('`')
      ? <code key={index}>{part.slice(1, -1)}</code>
      : part)}</p>;
}

function StoryCodePanel({ id, open, snippet, language, name }: { id: string; open: boolean; snippet: string | null; language: string; name: string }) {
  return <div id={id} hidden={!open} className="sd-frame-code" role="region" aria-label={`${name} code panel`}>
    {open ? <>
      <div className="sd-frame-code-bar"><span>{language}</span>{snippet ? <CopyAction label="Copy code" success="Code copied" text={() => snippet} icon="copy" /> : null}</div>
      <div className="sd-demo-code">{snippet ? <CodeBlock code={snippet} language={language} label={`${name} code`} /> : <p>No usage code for this example.</p>}</div>
    </> : null}
  </div>;
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

export function StoryFrame({
  componentSlug, story, storyName, authoredStory, notice, controls, args, changed,
  onControlChange, onReset, storyLayout, snippet, codeLanguage, children,
}: StoryFrameProps) {
  const [codeOpen, setCodeOpen] = useState(false);
  const codeId = useId();
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
  return (
    <div className="frame" data-story={story}>
      <header><span>{storyName}</span><div className="sd-frame-actions" role="group" aria-label={`${storyName} actions`}>
        <button type="button" className="sd-frame-action" aria-label="View code" title="View code" aria-expanded={codeOpen} aria-controls={codeId} onClick={() => setCodeOpen(!codeOpen)}><ActionIcon icon="code" /></button>
        <CopyAction label={`Copy link to ${storyName}`} success={`Link to ${storyName} copied`} text={() => storyLink(window.location, story)} icon="link" />
        {componentSlug ? <a className="sd-frame-action" href={standaloneStoryHref(componentSlug, story)} target="_blank" rel="noreferrer" aria-label={`Open ${storyName} full screen`} title="Open full screen"><ActionIcon icon="expand" /></a> : null}
      </div></header>
      {authoredStory ? <StoryBlurb text={authoredStory} /> : null}
      {notice ? <p className="sd-controls-note">{notice}</p> : null}
      {controls.length ? (
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
      ) : null}
      <div className="shot" data-layout={storyLayout} ref={canvasRef}
        tabIndex={scrollable ? 0 : undefined} role={scrollable ? 'region' : undefined}
        aria-label={scrollable ? storyName : undefined}>
        <StoryLane layout={storyLayout}>{children}</StoryLane>
      </div>
      <StoryCodePanel id={codeId} open={codeOpen} snippet={snippet} language={codeLanguage} name={storyName} />
    </div>
  );
}
