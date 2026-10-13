import type { StorybookDocsConfig } from '../config.js';

export function tokensCode(tokens: StorybookDocsConfig['tokens']): string {
  if (!tokens?.varsModule) return `export const vars = {};`;
  const named = tokens.varsExport ?? 'vars';
  return `export { ${named} as vars } from ${JSON.stringify(tokens.varsModule)};`;
}
