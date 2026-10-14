/** @jsxImportSource react */
import { useCallback, useEffect, useRef, useState } from 'react';
import './toc.css';

const STORY_PARAM = 'story';
const SCROLL_OFFSET_PX = 76;
const SETTLE_TICK_MS = 250;
const SETTLE_TICKS = 16;
const SETTLE_TOLERANCE_PX = 4;
const FLASH_MS = 2600;
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
  story: string;
  element: HTMLElement;
}

interface SectionItem {
  id: string;
  title: string;
  element: HTMLElement;
  heading: HTMLElement;
  stories: StoryItem[];
  subs: Array<{ id: string; title: string; element: HTMLElement }>;
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
  /** Authored `###` headings belong in the rail, nested under the `h2` they follow. */
  // Only the page's own headings: a story may render its own `h3` (several render "Filters"), and
  // the rail is a map of the documentation, not of the examples.
  const subHeadings = [...root.querySelectorAll<HTMLElement>('h3')].filter(
    (heading) => heading.textContent && !heading.closest('.story-lane') && !heading.closest('.frame'),
  );
  root.querySelectorAll<HTMLElement>('h2').forEach((heading) => {
    if (!heading.textContent) return;
    if (heading.closest('.story-lane') || heading.closest('.frame')) return;
    heading.id ||= unique('section', heading.textContent);
    heading.dataset.toc = '';
    const section = heading.parentElement?.tagName === 'SECTION' ? heading.parentElement : null;
    const stories: StoryItem[] = [];
    section?.querySelectorAll<HTMLElement>(':scope > .frame').forEach((frame) => {
      const header = frame.querySelector<HTMLElement>(':scope > header');
      const name = header?.querySelector('span')?.textContent;
      if (!header || !name) return;
      const story = frame.dataset.story ?? name;
      frame.id ||= unique('story', story);
      frame.dataset.toc = '';
      const item = { id: frame.id, name, story, element: frame };
      stories.push(item);
      frames.push(item);
    });
    // Everything between this h2 and the next belongs to this section.
    const following = [...root.querySelectorAll<HTMLElement>('h2, h3')];
    const start = following.indexOf(heading);
    const end = following.findIndex((candidate, index) => index > start && candidate.tagName === 'H2');
    const subs = following
      .slice(start + 1, end === -1 ? undefined : end)
      .filter((candidate) => candidate.tagName === 'H3' && subHeadings.includes(candidate))
      .map((candidate) => {
        candidate.id ||= unique('sub', candidate.textContent ?? '');
        candidate.dataset.toc = '';
        return { id: candidate.id, title: candidate.textContent ?? '', element: candidate };
      });
    sections.push({ id: heading.id, title: heading.textContent, element: section ?? heading, heading, stories, subs });
  });
  // Authored display names repeat (several stories all named `Filters`): the rail shows the export
  // name beside them so a reader can tell which is which.
  const counts = new Map<string, number>();
  for (const item of frames) counts.set(item.name, (counts.get(item.name) ?? 0) + 1);
  for (const item of frames) {
    if ((counts.get(item.name) ?? 0) > 1 && item.story && item.story !== item.name) {
      item.name = `${item.name} · ${item.story}`;
    }
  }
  return { pageKey, sections, frames };
}

const signature = (scan: Scan) =>
  `${scan.pageKey}|${scan.sections
    .map((s) => `${s.id}(${s.subs.map((sub) => sub.id).join('+')}):${s.stories.map((st) => `${st.id}:${st.name}`).join(',')}`)
    .join(';')}`;

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

/** The "On this page" rail and the `?story=` deep-link landing. */
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
      scan.frames.find((frame) => frame.story === target) ??
      scan.frames.find((frame) => frame.story.toLowerCase() === target.toLowerCase()) ??
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
                {section.subs.length > 0 ? (
                  <ul>
                    {section.subs.map((sub) => (
                      <li key={sub.id}>
                        <button type="button" className="toc-link toc-sub" onClick={() => go(sub.element)}>
                          {sub.title}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
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
    </>
  );
}
