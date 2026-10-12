/** @jsxImportSource react */
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import './toc.css';

const STORY_PARAM = 'story';
const SCROLL_OFFSET_PX = 76;
const SETTLE_TICK_MS = 250;
const SETTLE_TICKS = 16;
const SETTLE_TOLERANCE_PX = 4;
const FLASH_MS = 2600;
const COPIED_MS = 1800;
const ACTIVE_ROOT_MARGIN = `-${SCROLL_OFFSET_PX}px 0px -60% 0px`;

/** The hash without its query: `#/components/button?story=Variants` → `#/components/button`. */
export function hashPath(hash: string): string {
  const query = hash.indexOf('?');
  return query === -1 ? hash : hash.slice(0, query);
}

/** The `?story=` deep-link target of a hash, if any. */
export function storyFromHash(hash: string): string | null {
  const query = hash.indexOf('?');
  return query === -1 ? null : new URLSearchParams(hash.slice(query + 1)).get(STORY_PARAM);
}

export function storyLink(location: Location, story: string): string {
  const base = `${location.origin}${location.pathname}${location.search}`;
  return `${base}${hashPath(location.hash)}?${new URLSearchParams({ [STORY_PARAM]: story })}`;
}

interface StoryItem {
  id: string;
  name: string;
  element: HTMLElement;
  slot: HTMLElement;
}

interface SectionItem {
  id: string;
  title: string;
  element: HTMLElement;
  heading: HTMLElement;
  stories: StoryItem[];
}

interface Scan {
  pageKey: string;
  sections: SectionItem[];
  frames: StoryItem[];
}

const slugify = (text: string) =>
  text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

function scanPage(root: HTMLElement, pageKey: string): Scan {
  const used = new Set<string>();
  const unique = (prefix: string, text: string) => {
    const base = `${prefix}-${slugify(text) || 'x'}`;
    let id = base;
    for (let n = 2; used.has(id); n += 1) id = `${base}-${n}`;
    used.add(id);
    return id;
  };
  const sections: SectionItem[] = [];
  const frames: StoryItem[] = [];
  root.querySelectorAll<HTMLElement>('h2').forEach((heading) => {
    if (!heading.textContent) return;
    heading.id ||= unique('section', heading.textContent);
    heading.dataset.toc = '';
    const section = heading.parentElement?.tagName === 'SECTION' ? heading.parentElement : null;
    const stories: StoryItem[] = [];
    section?.querySelectorAll<HTMLElement>(':scope > .frame').forEach((frame) => {
      const header = frame.querySelector<HTMLElement>(':scope > header');
      const name = header?.querySelector('span')?.textContent;
      if (!header || !name) return;
      let slot = header.querySelector<HTMLElement>(':scope > [data-toc-slot]');
      if (!slot) {
        slot = document.createElement('span');
        slot.dataset.tocSlot = '';
        header.append(slot);
      }
      frame.id ||= unique('story', name);
      frame.dataset.toc = '';
      const item = { id: frame.id, name, element: frame, slot };
      stories.push(item);
      frames.push(item);
    });
    sections.push({ id: heading.id, title: heading.textContent, element: section ?? heading, heading, stories });
  });
  return { pageKey, sections, frames };
}

const signature = (scan: Scan) =>
  `${scan.pageKey}|${scan.sections.map((s) => `${s.id}:${s.stories.map((st) => st.id).join(',')}`).join(';')}`;

const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Smooth-scrolls, then corrects once the scroll has stopped and lazily mounted examples have changed the layout. */
function scrollToElement(element: HTMLElement) {
  element.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
  let ticks = SETTLE_TICKS;
  let lastY = window.scrollY;
  const settle = () => {
    if (!element.isConnected || ticks === 0) return;
    ticks -= 1;
    const moving = window.scrollY !== lastY;
    lastY = window.scrollY;
    if (!moving && Math.abs(element.getBoundingClientRect().top - SCROLL_OFFSET_PX) > SETTLE_TOLERANCE_PX) {
      element.scrollIntoView({ behavior: 'auto', block: 'start' });
      lastY = window.scrollY;
    }
    window.setTimeout(settle, SETTLE_TICK_MS);
  };
  window.setTimeout(settle, SETTLE_TICK_MS);
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

function CopyLink({ name }: { name: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), COPIED_MS);
    return () => window.clearTimeout(timer);
  }, [copied]);
  return (
    <>
      <button
        type="button"
        className="toc-copy"
        aria-label={`Copy link to ${name}`}
        onClick={async () => setCopied(await copyText(storyLink(window.location, name)))}
      >
        {copied ? 'Copied' : 'Copy link'}
      </button>
      <span role="status" className="toc-sr">
        {copied ? `Link to ${name} copied` : ''}
      </span>
    </>
  );
}

function useActiveIds(scan: Scan | null) {
  const [active, setActive] = useState<{ section: string | null; story: string | null }>({ section: null, story: null });
  useEffect(() => {
    if (!scan) return;
    const targets: Element[] = [...scan.sections.map((s) => s.element), ...scan.frames.map((f) => f.element)];
    const order = new Map(targets.map((element, index) => [element, index]));
    const visible = new Set<Element>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) (entry.isIntersecting ? visible.add(entry.target) : visible.delete(entry.target));
        const inView = [...visible].sort((a, b) => order.get(a)! - order.get(b)!);
        const section = scan.sections.find((s) => inView.includes(s.element));
        const story = scan.frames.find((f) => inView.includes(f.element));
        if (section || story) setActive((previous) => ({ section: section?.id ?? previous.section, story: story?.id ?? null }));
      },
      { rootMargin: ACTIVE_ROOT_MARGIN },
    );
    targets.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [scan]);
  return active;
}

/** The "On this page" rail, the per-story copy-link buttons and the `?story=` deep-link landing. */
export function PageRail({ pageKey }: { pageKey: string }) {
  const [scan, setScan] = useState<Scan | null>(null);
  const pageKeyRef = useRef(pageKey);
  pageKeyRef.current = pageKey;
  const [target, setTarget] = useState(() => storyFromHash(window.location.hash));
  const flashed = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const main = document.querySelector<HTMLElement>('.main');
    if (!main) return;
    let frame = 0;
    const rescan = () => {
      frame = 0;
      setScan((previous) => {
        const next = scanPage(main, pageKeyRef.current);
        return previous && signature(previous) === signature(next) ? previous : next;
      });
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(rescan);
    };
    const observer = new MutationObserver(schedule);
    observer.observe(main, { childList: true, subtree: true });
    schedule();
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [pageKey]);

  useEffect(() => {
    const onHash = () => setTarget(storyFromHash(window.location.hash));
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    if (!target || !scan || scan.pageKey !== pageKey) return;
    const match =
      scan.frames.find((frame) => frame.name === target) ??
      scan.frames.find((frame) => frame.name.toLowerCase() === target.toLowerCase());
    if (!match) return;
    scrollToElement(match.element);
    flashed.current?.classList.remove('toc-flash');
    match.element.classList.add('toc-flash');
    flashed.current = match.element;
    window.setTimeout(() => match.element.classList.remove('toc-flash'), FLASH_MS);
    setTarget(null);
  }, [target, scan, pageKey]);

  const active = useActiveIds(scan);
  const go = useCallback((element: HTMLElement) => scrollToElement(element), []);

  if (!scan) return null;
  return (
    <>
      {scan.sections.length > 0 ? (
        <aside className="toc" aria-label="On this page">
          <div className="toc-title">On this page</div>
          <ul>
            {scan.sections.map((section) => (
              <li key={section.id}>
                <button
                  type="button"
                  className="toc-link"
                  aria-current={active.section === section.id ? 'location' : undefined}
                  onClick={() => go(section.heading)}
                >
                  {section.title}
                </button>
                {section.stories.length > 0 ? (
                  <ul>
                    {section.stories.map((story) => (
                      <li key={story.id}>
                        <button
                          type="button"
                          className="toc-link toc-story"
                          aria-current={active.story === story.id ? 'location' : undefined}
                          onClick={() => go(story.element)}
                        >
                          {story.name}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
        </aside>
      ) : null}
      {scan.frames.map((frame) => createPortal(<CopyLink name={frame.name} />, frame.slot, frame.id))}
    </>
  );
}
