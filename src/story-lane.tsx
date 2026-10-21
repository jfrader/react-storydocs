/** @jsxImportSource react */
import { useCallback, useState, type ReactNode } from 'react';

type StoryLayout = 'centered' | 'padded' | 'fullscreen';

export function resolveLaneLayout(layout: StoryLayout, display: string): StoryLayout | 'inline' {
  return layout === 'padded' && /^inline/.test(display) ? 'inline' : layout;
}

export function StoryLane({ layout, children }: { layout: StoryLayout; children: ReactNode }) {
  const [laneLayout, setLaneLayout] = useState<StoryLayout | 'inline'>(layout);
  const laneRef = useCallback((node: HTMLDivElement | null) => {
    if (!node) return;
    const content = node.firstElementChild;
    setLaneLayout(content instanceof HTMLElement ? resolveLaneLayout(layout, getComputedStyle(content).display) : layout);
  }, [layout, children]);
  return <div className="story-lane" data-layout={laneLayout} ref={laneRef}>{children}</div>;
}
