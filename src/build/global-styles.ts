import { FILE_PREFIX } from './module-ids.ts';

export function globalStylesCode(engineStyles: string, css: string[] = []): string {
  const imports = [
    `import ${JSON.stringify(`${FILE_PREFIX}${engineStyles}`)};`,
    ...css.map((specifier) => `import ${JSON.stringify(specifier)};`),
  ];
  return imports.join('\n');
}
