/** @jsxImportSource react */
import { useEffect, useMemo, useRef, useState } from 'react';
import { catalog } from 'virtual:storybook-docs/catalog';
import { hrefFor } from './base';

const MAX_RESULTS = 10;

export function SearchBox() {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listId = 'storybook-docs-search-results';
  const optionId = (slug: string) => `${listId}-${slug}`;

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return [];
    return catalog
      .map((entry) => {
        const name = entry.name.toLowerCase();
        const group = entry.group.toLowerCase();
        const title = entry.storybookTitle.toLowerCase();
        const storyHit = entry.stories.some((story) => story.toLowerCase().includes(needle));
        const score = name === needle ? 100 : name.startsWith(needle) ? 80 : name.includes(needle) ? 60 : group.includes(needle) ? 40 : title.includes(needle) ? 30 : storyHit ? 20 : -1;
        return { entry, score };
      })
      .filter((candidate) => candidate.score >= 0)
      .sort((a, b) => b.score - a.score || a.entry.name.localeCompare(b.entry.name))
      .slice(0, MAX_RESULTS)
      .map((candidate) => candidate.entry);
  }, [query]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const go = (slug: string) => {
    window.location.hash = hrefFor(`/components/${slug}`);
    setOpen(false);
    setQuery('');
    inputRef.current?.blur();
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      setActive((current) => {
        const next = event.key === 'ArrowDown' ? current + 1 : current - 1;
        return (next + results.length) % Math.max(results.length, 1);
      });
      return;
    }
    if (event.key === 'Enter' && results[active]) {
      event.preventDefault();
      go(results[active].slug);
      return;
    }
    if (event.key === 'Escape') {
      setOpen(false);
      setQuery('');
      inputRef.current?.blur();
    }
  };

  const expanded = open && results.length > 0;

  return (
    <div className="search">
      <input
        ref={inputRef}
        type="text"
        role="combobox"
        aria-expanded={expanded}
        aria-controls={listId}
        aria-activedescendant={expanded ? optionId(results[active]?.slug ?? '') : undefined}
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
      {expanded ? (
        <ul id={listId} role="listbox" aria-label="Components" className="search-results">
          {results.map((entry, index) => (
            <li
              key={entry.slug}
              id={optionId(entry.slug)}
              role="option"
              aria-selected={index === active}
              onMouseEnter={() => setActive(index)}
              onMouseDown={(event) => {
                event.preventDefault();
                go(entry.slug);
              }}
            >
              <b>{entry.name}</b>
              <span>
                {entry.group} · {entry.stories.length} stories
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
