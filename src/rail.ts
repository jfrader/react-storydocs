const RAIL_MEDIA = '(min-width: 1180px)';
const RAIL_GAP = 20;
const RAIL_SETTLE_MS = 120;

export function followRail(rail: HTMLElement, header: HTMLElement) {
  const track = rail.parentElement;
  if (!track) return () => {};
  const media = window.matchMedia(RAIL_MEDIA);
  let lastY = window.scrollY;
  let direction: 'down' | 'up' = 'down';
  let spacer = 0;
  let scrolling = false;
  let settleTimer: number | undefined;
  const geometry = () => {
    const top = header.offsetHeight + RAIL_GAP;
    const viewportBottom = window.innerHeight - RAIL_GAP;
    const height = rail.offsetHeight;
    return {
      top, viewportBottom, height,
      fits: top + height <= viewportBottom,
      trackTop: track.getBoundingClientRect().top + window.scrollY + RAIL_GAP,
      maxOffset: Math.max(0, track.clientHeight - height - RAIL_GAP),
    };
  };
  const clear = () => {
    rail.removeAttribute('style');
    track.removeAttribute('style');
  };
  const arm = (g = geometry()) => {
    if (!media.matches) {
      clear();
      return;
    }
    spacer = g.fits ? 0 : Math.min(spacer, g.maxOffset);
    track.style.setProperty('--sd-rail-start', `${RAIL_GAP}px`);
    track.style.setProperty('--sd-rail-offset', `${spacer}px`);
    rail.style.position = 'sticky';
    const parkedTop = g.fits ? g.top : g.viewportBottom - g.height;
    const armedTop = Number.parseFloat(rail.style.top);
    const stableTop = scrolling && Number.isFinite(armedTop) ? Math.min(armedTop, parkedTop) : parkedTop;
    rail.style.top = g.fits || direction === 'down' ? `${stableTop}px` : 'auto';
    rail.style.bottom = g.fits || direction === 'down' ? 'auto' : `${window.innerHeight - g.top - g.height}px`;
  };
  const onScroll = () => {
    const y = window.scrollY;
    scrolling = true;
    window.clearTimeout(settleTimer);
    settleTimer = window.setTimeout(() => {
      scrolling = false;
      arm();
    }, RAIL_SETTLE_MS);
    const next = y > lastY ? 'down' : y < lastY ? 'up' : direction;
    if (next !== direction && media.matches) {
      const g = geometry();
      const armedTop = Number.parseFloat(rail.style.top);
      spacer = direction === 'down'
        ? Math.min(Math.max(spacer, lastY + (Number.isFinite(armedTop) ? armedTop : g.viewportBottom - g.height) - g.trackTop), g.maxOffset)
        : Math.max(Math.min(spacer, lastY + g.top - g.trackTop), 0);
      direction = next;
      arm(g);
    }
    direction = next;
    lastY = y;
  };
  const relayout = () => arm();
  const observer = new ResizeObserver(relayout);
  observer.observe(rail);
  observer.observe(track);
  observer.observe(header);
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', relayout);
  media.addEventListener('change', relayout);
  arm();
  return () => {
    observer.disconnect();
    window.clearTimeout(settleTimer);
    window.removeEventListener('scroll', onScroll);
    window.removeEventListener('resize', relayout);
    media.removeEventListener('change', relayout);
    clear();
  };
}
