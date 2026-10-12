import type { ReactNode } from 'react';

export function Alert({
  children,
  tone = 'info',
  ...props
}: {
  children?: ReactNode;
  tone?: 'info' | 'success' | 'warning' | 'danger';
  [key: string]: unknown;
}) {
  const cls = ['alert', tone].filter(Boolean).join(' ');
  return (
    <div className={cls} {...props}>
      {children}
    </div>
  );
}
