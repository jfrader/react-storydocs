import { THEME_ROLES, type ReactStorydocsConfig, type ThemeRole } from '../config.ts';

export function siteCode(config: ReactStorydocsConfig): string {
  const hasTokens = Boolean(config.tokens?.varsModule);
  const pages = {
    overview: config.pages?.overview ?? true,
    api: config.pages?.api ?? true,
    color: (config.pages?.color ?? true) && hasTokens,
    typography: (config.pages?.typography ?? true) && hasTokens,
    spacing: (config.pages?.spacing ?? true) && hasTokens,
    effects: (config.pages?.effects ?? true) && hasTokens,
  };
  const theme = {
    attribute: config.theme?.attribute ?? 'data-theme',
    values: config.theme?.values ?? ['dark', 'light'],
    vars: config.theme?.vars ?? {},
  };
  const themeCss = Object.entries(theme.vars)
    .filter(([role]) => THEME_ROLES.includes(role as ThemeRole))
    .map(([role, reference]) => `  --sd-${role.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}: ${reference};`)
    .join('\n');
  return `
export const site = ${JSON.stringify(config.site)};
export const theme = ${JSON.stringify(theme)};
export const pages = ${JSON.stringify(pages)};
export const hasTokens = ${JSON.stringify(hasTokens)};
export const themeCss = ${JSON.stringify(themeCss ? `:root {\n${themeCss}\n}` : '')};
`;
}
