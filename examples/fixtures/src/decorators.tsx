import type { ComponentType, ReactNode } from 'react';
import { createTheme, CssBaseline, ThemeProvider } from '@mui/material';
import { useDocsTheme } from '@jfrader/storybook-docs/theme';
import { LegacyProvider } from '../packages/acme-ui/src/legacy-src/LegacyContext';

const light = createTheme({ palette: { mode: 'light' } });
const dark = createTheme({ palette: { mode: 'dark' } });

function MuiDocsTheme({ children }: { children: ReactNode }) {
  const { theme } = useDocsTheme();
  return (
    <ThemeProvider theme={theme === 'light' ? light : dark}>
      <CssBaseline />
      {children}
    </ThemeProvider>
  );
}

export default function fixtureDecorator(Story: ComponentType) {
  return (
    <LegacyProvider>
      <MuiDocsTheme>
        <Story />
      </MuiDocsTheme>
    </LegacyProvider>
  );
}
