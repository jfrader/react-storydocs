import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { test } from 'node:test';
import { DocsThemeContext, useDocsTheme } from '../src/docs-theme.ts';

function Consumer() {
  const { theme, values, setTheme } = useDocsTheme();
  return createElement('span', null, `${theme}:${values.join('/')}:${typeof setTheme}`);
}

test('useDocsTheme reads the value the docs app provides', () => {
  const html = renderToStaticMarkup(createElement(
    DocsThemeContext.Provider,
    { value: { theme: 'dark', values: ['dark', 'light'], setTheme: () => {} } },
    createElement(Consumer),
  ));
  assert.equal(html, '<span>dark:dark/light:function</span>');
});

test('useDocsTheme fails loudly outside the docs app', () => {
  assert.throws(() => renderToStaticMarkup(createElement(Consumer)), /useDocsTheme must be used inside a react-storydocs app/);
});
