/** @jsxImportSource react */
import { Component, createElement, useEffect, useRef, useState, type ComponentType, type ReactNode } from 'react';
import type { CatalogEntry } from './config';
import { Skeleton } from './skeleton';

/** The slice of CSF the docs front needs. Decorators, loaders and play functions stay in Storybook. */
interface StoryDefinition {
  decorators?: unknown[];
  render?: (args: Record<string, unknown>, context: unknown) => ReactNode;
  args?: Record<string, unknown>;
}

interface MetaDefinition {
  render?: (args: Record<string, unknown>, context: unknown) => ReactNode;
  decorators?: unknown[];
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

/** Renders a story from its own module: meta decorators, the meta component with merged args, the
 * story's own decorators, or the story's render — the same composition order Storybook uses. */
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
  // Storybook's precedence: the story's own render, then the meta's render, then the component
  // with its args. Skipping the meta render breaks every story that only overrides args.
  const render = definition.render ?? meta.render;
  const node =
    typeof render === 'function'
      ? render(args, {})
      : meta.component
        ? createElement(meta.component, args)
        : null;
  if (!node) return <div className="story-failed">Story “{story}” has nothing to render.</div>;
  const decorators = [
    ...((meta.decorators ?? []) as DecoratorLike[]),
    ...((definition.decorators ?? []) as DecoratorLike[]),
  ];
  const decorated = decorators.length
    ? applyDecorators(node, decorators, { args, globals: {}, viewMode: 'story' })
    : node;
  return <StoryBoundary story={story}>{decorated}</StoryBoundary>;
}

type DecoratorLike = (Story: () => ReactNode, context: unknown) => ReactNode;

/** Storybook's order: meta decorators wrap story decorators, which wrap the story itself. */
function applyDecorators(node: ReactNode, decorators: DecoratorLike[], context: unknown): ReactNode {
  return decorators.reduceRight<ReactNode>(
    (inner, decorator) => decorator(() => inner, context),
    node,
  );
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
      { rootMargin: '640px 0px' },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [visible]);
  return <div ref={ref}>{visible ? children : <div className="lazy-placeholder"><Skeleton width={190} /></div>}</div>;
}
