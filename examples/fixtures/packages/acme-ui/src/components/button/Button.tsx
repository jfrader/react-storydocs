import type { ReactNode } from 'react';

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  disabled = false,
  ...props
}: {
  children?: ReactNode;
  variant?: 'primary' | 'secondary';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  [key: string]: unknown;
}) {
  const cls = ['btn', variant, size].filter(Boolean).join(' ');
  return (
    <button className={cls} disabled={disabled} {...props}>
      {children}
    </button>
  );
}
