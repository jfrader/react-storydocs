const RAIL_MEDIA = '(min-width: 1180px)';
const RAIL_GAP = 20;

export function followRail(rail: HTMLElement, header: HTMLElement) {
  const track = rail.parentElement;
  if (!track) return () => {};
  const media = window.matchMedia(RAIL_MEDIA);
  let lastY = window.scrollY;
  let direction: 'down' | 'up' = 'down';
  let spacer = 0;
  const geometry = () => {
    const top = header.offsetHeight + RAIL_GAP;
    const viewportBottom = window.innerHeight - RAIL_GAP;
    const height = rail.offsetHeight;
    return {
      top, viewportBottom, height,
      fits: top + height <= viewportBottom,
      trackTop: track.getBoundingClientRect().top + window.scrollY,
      maxOffset: Math.max(0, track.clientHeight - height),
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
    track.style.setProperty('--sd-rail-offset', `${spacer}px`);
    rail.style.position = 'sticky';
    rail.style.top = g.fits ? `${g.top}px` : direction === 'down' ? `${g.viewportBottom - g.height}px` : 'auto';
    rail.style.bottom = g.fits || direction === 'down' ? 'auto' : `${window.innerHeight - g.top - g.height}px`;
  };
  const onScroll = () => {
    const y = window.scrollY;
    const next = y > lastY ? 'down' : y < lastY ? 'up' : direction;
    if (next !== direction && media.matches) {
      const g = geometry();
      spacer = direction === 'down'
        ? Math.min(Math.max(spacer, lastY + g.viewportBottom - g.height - g.trackTop), g.maxOffset)
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
    window.removeEventListener('scroll', onScroll);
    window.removeEventListener('resize', relayout);
    media.removeEventListener('change', relayout);
    clear();
  };
}
