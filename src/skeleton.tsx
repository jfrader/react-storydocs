/** @jsxImportSource react */

import type { ReactNode } from 'react';
/**
 * Loading placeholders. One primitive, reused wherever something async is coming:
 * example frames, the guidance block, the props table and the component header.
 */
export function Skeleton({
  width = '100%',
  height = 12,
  lines = 1,
}: {
  width?: number | string;
  height?: number;
  lines?: number;
}): ReactNode {
  if (lines > 1) {
    return (
      <span className="skeleton-stack" aria-hidden="true">
        {Array.from({ length: lines }, (_, index) => (
          <span
            key={index}
            className="skeleton"
            style={{ width: index === lines - 1 ? '62%' : width, height }}
          />
        ))}
      </span>
    );
  }
  return <span className="skeleton" aria-hidden="true" style={{ width, height }} />;
}
