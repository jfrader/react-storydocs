import type { ReactStorydocsConfig } from '../config.js';

export function tokensCode(tokens: ReactStorydocsConfig['tokens']): string {
  if (!tokens?.varsModule) return `export const vars = {};`;
  const named = tokens.varsExport ?? 'vars';
  return `export { ${named} as vars } from ${JSON.stringify(tokens.varsModule)};`;
}
