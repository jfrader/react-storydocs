import type { ReactNode } from 'react';
import { useLegacy } from './LegacyContext';

export interface WidgetProps {
  label: string;
  count?: number;
  disabled?: boolean;
  children?: ReactNode;
}

export function Widget({ label, count, disabled, children }: WidgetProps) {
  useLegacy();
  return <button disabled={disabled}>{label} {count} {children}</button>;
}
