import type { ComponentType } from 'react';
import { LegacyProvider } from '../packages/acme-ui/src/legacy-src/LegacyContext';

export default function legacyDecorator(Story: ComponentType) {
  return <LegacyProvider><Story /></LegacyProvider>;
}
