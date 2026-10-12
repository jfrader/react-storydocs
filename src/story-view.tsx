import { Component, createElement, useEffect, useRef, useState, type ComponentType, type ReactNode } from 'react';
import type { CatalogEntry } from './config';

/** The slice of CSF the docs front needs. Decorators, loaders and play functions stay in Storybook. */
interface StoryDefinition {
  render?: (args: Record<string, unknown>, context: unknown) => ReactNode;
  args?: Record<string, unknown>;
}

interface MetaDefinition {
  component?: ComponentType<Record<string, unknown>>;
  args?: Record<string, unknown>;
  argTypes?: Record<string, Record<string, unknown>>;
  parameters?: { docs?: { description?: { component?: string } } };
}

class StoryBoundary extends Component<{ children: ReactNode; story: string }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed) {
      return (
        <div className="story-failed">
          “{this.props.story}” needs project-level Storybook decorators to render outside Storybook.
        </div>
      );
    }
    return this.props.children;
  }
}

/** Renders a story from its own module: the meta component with merged args, or the story's render. */
export function StoryView({
  module,
  story,
  overrides,
}: {
  module: Record<string, unknown>;
  story: string;
  overrides?: Record<string, unknown>;
}) {
  const meta = (module.default ?? {}) as MetaDefinition;
  const definition = (module[story] ?? {}) as StoryDefinition;
  const args = { ...meta.args, ...definition.args, ...overrides };
  const node =
    typeof definition.render === 'function'
      ? definition.render(args, {})
      : meta.component
        ? createElement(meta.component, args)
        : null;
  if (!node) return <div className="story-failed">Story “{story}” has nothing to render.</div>;
  return <StoryBoundary story={story}>{node}</StoryBoundary>;
}

/** Lazily imports the same module Storybook loads; resolves once per entry. */
export function useStoryModule(entry: CatalogEntry) {
  const [module, setModule] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    setModule(null);
    setError(null);
    entry
      .load()
      .then((loaded) => {
        if (alive) setModule(loaded);
      })
      .catch((cause: unknown) => {
        if (alive) setError(cause instanceof Error ? cause.message : String(cause));
      });
    return () => {
      alive = false;
    };
  }, [entry]);
  return { module, error };
}

/** Mounts children only once they have been scrolled near, so pages with many stories stay cheap. */
export function LazySection({ children, placeholder = '…' }: { children: ReactNode; placeholder?: string }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!element || visible) return;
    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '320px 0px' },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [visible]);
  return <div ref={ref}>{visible ? children : <div className="lazy-placeholder">{placeholder}</div>}</div>;
}
