import { createContext, useContext, type ReactNode } from 'react';

const LegacyContext = createContext<boolean | null>(null);

export function LegacyProvider({ children }: { children: ReactNode }) {
  return <LegacyContext value={true}>{children}</LegacyContext>;
}

export function useLegacy() {
  const value = useContext(LegacyContext);
  if (value === null) throw new Error('useLegacy must be used inside LegacyProvider');
  return value;
}
