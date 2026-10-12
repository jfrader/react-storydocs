<<<<<<< HEAD
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
=======
/** @jsxImportSource react */
import { useEffect, useMemo, useRef, useState } from 'react';
>>>>>>> master
import { catalog } from 'virtual:storybook-docs/catalog';
import { hrefFor } from './base';
import {
  highlightSegments,
  rowKey,
  rowPath,
  searchCatalog,
  type SearchRow,
} from './search-match';
import './search.css';

export function renderHighlighted(text: string, query: string): ReactNode {
  const segments = highlightSegments(text, query);
  return segments.map((segment, index) =>
    segment.match ? <mark key={index}>{segment.text}</mark> : segment.text
  );
}

export function SearchBox() {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listId = 'storybook-docs-search-results';
  const optionId = (key: string) => `${listId}-${key}`;

  const results = useMemo<SearchRow[]>(() => {
    return searchCatalog(catalog, query);
  }, [query]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  useEffect(() => {
    const onGlobalKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
        setOpen(true);
      }
    };
    window.addEventListener('keydown', onGlobalKeyDown);
    return () => window.removeEventListener('keydown', onGlobalKeyDown);
  }, []);

  const go = (row: SearchRow) => {
    window.location.hash = hrefFor(rowPath(row));
    setOpen(false);
    setQuery('');
    inputRef.current?.blur();
  };

  const hasQuery = query.trim().length > 0;
  const hasResults = results.length > 0;
  const showDropdown = open && (hasResults || hasQuery);

  const activeRow = hasResults && results[active] ? results[active] : undefined;
  const activeOptionId = activeRow ? optionId(rowKey(activeRow)) : undefined;

  useEffect(() => {
    if (showDropdown && activeOptionId) {
      const el = document.getElementById(activeOptionId);
      el?.scrollIntoView({ block: 'nearest' });
    }
  }, [activeOptionId, showDropdown]);

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      if (results.length === 0) return;
      setActive((current) => {
        const next = event.key === 'ArrowDown' ? current + 1 : current - 1;
        return (next + results.length) % results.length;
      });
      return;
    }
    if (event.key === 'Enter') {
      if (activeRow) {
        event.preventDefault();
        go(activeRow);
      }
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(false);
      setQuery('');
      inputRef.current?.blur();
    }
  };

  return (
    <div className="search">
      <input
        ref={inputRef}
        type="text"
        role="combobox"
        aria-expanded={showDropdown}
        aria-controls={hasResults ? listId : undefined}
        aria-activedescendant={showDropdown ? activeOptionId : undefined}
        aria-autocomplete="list"
        aria-label={`Search ${catalog.length} components`}
        placeholder={`Search ${catalog.length} components…  ⌘K`}
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        onKeyDown={onKeyDown}
      />
      {showDropdown ? (
        <div className="search-dropdown">
          {hasResults ? (
            <ul id={listId} role="listbox" aria-label="Components" className="search-results">
              {results.map((row, index) => {
                const key = rowKey(row);
                const optId = optionId(key);
                return (
                  <li
                    key={key}
                    id={optId}
                    role="option"
                    aria-selected={index === active}
                    aria-label={row.story ? `${row.entry.name}, ${row.story}` : row.entry.name}
                    onMouseEnter={() => setActive(index)}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      go(row);
                    }}
                  >
                    <span className="search-result-main">
                      <b className="search-result-name">{renderHighlighted(row.entry.name, query)}</b>
                      {row.story ? (
                        <>
                          <span className="search-result-sep" aria-hidden="true"> › </span>
                          <span className="search-result-story">{renderHighlighted(row.story, query)}</span>
                        </>
                      ) : null}
                    </span>
                    <span className="search-result-meta">
                      {row.story ? row.entry.group : `${row.entry.group} · ${row.entry.stories.length} stories`}
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="search-empty" role="status">
              No components match ‘{query.trim()}’
            </div>
          )}
          <div className="search-footer" aria-hidden="true">
            <span className="search-footer-item"><kbd>↑</kbd><kbd>↓</kbd> navigate</span>
            <span className="search-footer-sep">·</span>
            <span className="search-footer-item"><kbd>Enter</kbd> open</span>
            <span className="search-footer-sep">·</span>
            <span className="search-footer-item"><kbd>Esc</kbd> close</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
