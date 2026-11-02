'use client';

import { createContext, useContext, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Selecting several sources and acting on them at once.
 *
 * Clearing out a run of duplicates used to mean opening each row, typing its
 * domain back and confirming — right for one deletion, absurd for twenty.
 * Selection moves the care from each individual action to one deliberate step
 * at the end, where the whole list is shown before anything happens.
 *
 * The confirmation is the count rather than a typed name, for the same
 * reason: it cannot come from a stray click, it stays bearable at twenty, and
 * it fails safe — if the selection changed, the number will not match and the
 * server refuses.
 */

interface SelectionState {
  selected: Set<string>;
  toggle: (id: string) => void;
  isSelected: (id: string) => boolean;
}

const SelectionContext = createContext<SelectionState | null>(null);

export function useSourceSelection(): SelectionState {
  const context = useContext(SelectionContext);
  if (!context) {
    // Rendered outside a provider: behave as though nothing is selectable
    // rather than throwing and taking the page down.
    return { selected: new Set(), toggle: () => {}, isSelected: () => false };
  }
  return context;
}

export function SourceSelectionProvider({
  sources,
  children,
}: {
  /** Everything on this page, so "select all" means this page and says so. */
  sources: Array<{ id: string; name: string; domain: string }>;
  children: React.ReactNode;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const value = useMemo<SelectionState>(
    () => ({
      selected,
      isSelected: (id) => selected.has(id),
      toggle: (id) =>
        setSelected((previous) => {
          const next = new Set(previous);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          return next;
        }),
    }),
    [selected],
  );

  return (
    <SelectionContext.Provider value={value}>
      <SelectionBar
        sources={sources}
        selected={selected}
        onSelectAll={() => setSelected(new Set(sources.map((source) => source.id)))}
        onClear={() => setSelected(new Set())}
      />
      {children}
    </SelectionContext.Provider>
  );
}

/** The checkbox on a row. */
export function SourceCheckbox({ id, name }: { id: string; name: string }) {
  const { isSelected, toggle } = useSourceSelection();
  return (
    <label className="cl-touch flex h-11 w-9 shrink-0 cursor-pointer items-center justify-center sm:h-8 sm:w-7">
      <input
        type="checkbox"
        checked={isSelected(id)}
        onChange={() => toggle(id)}
        aria-label={`Select ${name}`}
        className="h-4 w-4 accent-[var(--cl-selected)]"
      />
    </label>
  );
}

function SelectionBar({
  sources,
  selected,
  onSelectAll,
  onClear,
}: {
  sources: Array<{ id: string; name: string; domain: string }>;
  selected: Set<string>;
  onSelectAll: () => void;
  onClear: () => void;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const chosen = sources.filter((source) => selected.has(source.id));
  const allOnPage = chosen.length === sources.length && sources.length > 0;

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/admin/sources', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ids: chosen.map((source) => source.id),
          confirmCount: chosen.length,
          reason: reason || undefined,
        }),
      });
      const body = await response.json();
      if (!response.ok) {
        setError(body?.error?.message ?? 'That did not go through.');
        return;
      }
      setConfirming(false);
      onClear();
      router.refresh();
    } catch {
      setError('No connection. Try again.');
    } finally {
      setBusy(false);
    }
  }

  if (chosen.length === 0) {
    return (
      <div className="mb-2.5 flex flex-wrap items-center gap-2 text-sm text-muted">
        <button
          type="button"
          onClick={onSelectAll}
          disabled={sources.length === 0}
          className="cl-touch rounded-pill border border-line bg-bg px-3 py-1.5 text-sm text-text hover:bg-hover disabled:opacity-50"
        >
          Select all on this page
        </button>
        <span>Tick rows to delete several at once.</span>
      </div>
    );
  }

  return (
    <div className="sticky top-2 z-20 mb-2.5 rounded-card border-2 border-accent bg-surface p-3 shadow-pop">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-bold text-text">
          {chosen.length} selected
        </span>
        {!allOnPage ? (
          <button
            type="button"
            onClick={onSelectAll}
            className="cl-touch rounded-pill border border-line bg-bg px-3 py-1.5 text-sm text-text hover:bg-hover"
          >
            Select all {sources.length} on this page
          </button>
        ) : null}
        <button
          type="button"
          onClick={onClear}
          className="cl-touch rounded-pill border border-line bg-bg px-3 py-1.5 text-sm text-muted hover:bg-hover hover:text-text"
        >
          Clear
        </button>
        <button
          type="button"
          onClick={() => setConfirming((value) => !value)}
          className="cl-touch ml-auto rounded-pill border border-danger-line bg-bg px-3.5 py-1.5 text-sm font-semibold text-danger-text hover:bg-danger-bg"
        >
          Delete {chosen.length}…
        </button>
      </div>

      {confirming ? (
        <div className="mt-3 rounded-card border-2 border-danger-line bg-danger-bg p-3 text-sm text-danger-text">
          <p className="m-0 font-bold">
            Delete {chosen.length} source{chosen.length === 1 ? '' : 's'} permanently?
          </p>
          {/*
            * Every name, before anything happens. A count alone is easy to
            * agree to without knowing what is in it.
            */}
          <ul className="m-0 mt-2 max-h-40 list-none overflow-y-auto p-0">
            {chosen.map((source) => (
              <li key={source.id} className="py-px">
                <span className="font-semibold">{source.name}</span>{' '}
                <span className="opacity-75">{source.domain}</span>
              </li>
            ))}
          </ul>
          <p className="m-0 mt-2">
            Their votes, saves, credit and places in collections go too. Accounts are not
            affected. This cannot be undone.
          </p>

          <label className="mt-2.5 block">
            <span className="mb-1 block">Why, for the audit log</span>
            <input
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              maxLength={300}
              placeholder="Duplicates of existing listings"
              className="w-full rounded-field border border-danger-line bg-bg px-3 py-2 text-sm text-text"
            />
          </label>

          {error ? (
            <p role="alert" className="m-0 mt-2 font-semibold">
              {error}
            </p>
          ) : null}

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void remove()}
              disabled={busy}
              className="cl-touch rounded-pill bg-selected px-3.5 py-2 text-sm font-semibold text-selected-fg disabled:opacity-50"
            >
              {busy ? 'Deleting…' : `Delete ${chosen.length} for good`}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="cl-touch rounded-pill border border-line bg-bg px-3.5 py-2 text-sm text-text hover:bg-hover"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
