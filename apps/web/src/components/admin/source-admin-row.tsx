'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { SOURCE_CATEGORIES, type SourceCategory } from '@couchlist/shared';
import { AdsWarning, AvoidWarning, TrustedMark } from '../ui/category-pill';
import { SourceCheckbox } from './source-selection';

/**
 * One editable source in the admin table.
 *
 * Everything a moderator needs to decide is here — name, address, categories,
 * warning, penalty, open reports — so a decision does not take three screens.
 * Hiding is reversible and asks for a reason.
 */
export function SourceAdminRow({
  source,
  openReports,
}: {
  source: {
    id: string;
    name: string;
    domain: string;
    homepageUrl: string;
    description: string | null;
    categories: SourceCategory[];
    hasLotsOfAds: boolean;
    shouldAvoid: boolean;
    avoidReason: string | null;
    trustedRank: number | null;
    trustedNote: string | null;
    qualityLabel: string | null;
    isEnabled: boolean;
    hiddenReason: string | null;
    adminRankPenalty: number;
    likes: number;
    dislikes: number;
  };
  openReports: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;

    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    setStatus(null);

    try {
      const response = await fetch(`/api/admin/sources/${source.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: String(form.get('name') ?? ''),
          url: String(form.get('url') ?? ''),
          description: String(form.get('description') ?? '') || undefined,
          categories: form.getAll('categories').map(String),
          hasLotsOfAds: form.get('hasLotsOfAds') === 'on',
          shouldAvoid: form.get('shouldAvoid') === 'on',
          trustedRank:
            form.get('trusted') === 'on' ? Number(form.get('trustedRank') ?? 100) : null,
          trustedNote: String(form.get('trustedNote') ?? '').trim() || null,
          qualityLabel: String(form.get('qualityLabel') ?? '').trim() || null,
          avoidReason: String(form.get('avoidReason') ?? '').trim() || null,
          isEnabled: form.get('isEnabled') === 'on',
          adminRankPenalty: Number(form.get('adminRankPenalty') ?? 0),
        }),
      });
      const body = await response.json();
      if (!response.ok) {
        setError(body?.error?.message ?? 'That did not save.');
        return;
      }
      setStatus('Saved.');
      router.refresh();
    } catch {
      setError('No connection. Try again.');
    } finally {
      setBusy(false);
    }
  }

  async function setHidden(hidden: boolean) {
    if (busy) return;
    const reason = hidden
      ? (window.prompt('Why is this being hidden? (kept for the record)') ?? undefined)
      : undefined;
    if (hidden && reason === undefined) return;

    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/sources/${source.id}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ hidden, reason }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setError(body?.error?.message ?? 'That did not go through.');
        return;
      }
      router.refresh();
    } catch {
      setError('No connection. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border-b border-line p-3.5 last:border-b-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        {/* Ticking rows is how several get deleted in one action. */}
        <SourceCheckbox id={source.id} name={source.name} />

        <div className="min-w-0 flex-1">
          <p className="m-0 text-sm font-semibold text-text">
            <Link href={`/sources/${source.id}`} className="text-text no-underline hover:text-accent">
              {source.name}
            </Link>
            {!source.isEnabled ? (
              <span className="ml-2 rounded-pill border border-line bg-active px-2 py-px text-xs text-muted">
                Hidden
              </span>
            ) : null}
            {openReports > 0 ? (
              <span className="ml-2 rounded-pill border border-warn-line bg-warn-bg px-2 py-px text-xs text-warn-text">
                {openReports} open report{openReports === 1 ? '' : 's'}
              </span>
            ) : null}
          </p>
          <p className="m-0 mt-0.5 text-sm text-muted">
            {source.domain} · {source.categories.join(', ') || 'no categories'} ·{' '}
            {source.likes} up / {source.dislikes} down
            {source.adminRankPenalty > 0 ? ` · penalty ${source.adminRankPenalty}` : ''}
          </p>
          {source.hiddenReason ? (
            <p className="m-0 mt-0.5 text-sm text-muted">Hidden because: {source.hiddenReason}</p>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            className="cl-touch inline-flex items-center rounded-pill border border-line bg-surface px-3 py-2 text-sm text-text hover:bg-hover"
          >
            {open ? 'Close' : 'Edit'}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void setHidden(source.isEnabled)}
            className="cl-touch inline-flex items-center rounded-pill border border-line bg-active px-3 py-2 text-sm text-text hover:bg-hover disabled:opacity-60"
          >
            {source.isEnabled ? 'Hide' : 'Restore'}
          </button>
        </div>
      </div>

      {error ? (
        <p role="alert" className="m-0 mt-2 text-sm text-accent">
          {error}
        </p>
      ) : null}
      {status ? (
        <p role="status" className="m-0 mt-2 text-sm text-muted">
          {status}
        </p>
      ) : null}

      {open ? (
        <form onSubmit={save} className="mt-3 grid gap-3 sm:grid-cols-2" noValidate>
          <label className="text-sm">
            <span className="mb-1 block text-muted">Name</span>
            <input name="name" defaultValue={source.name} maxLength={80} required className={adminInput} />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-muted">Website address</span>
            <input name="url" type="url" defaultValue={source.homepageUrl} required className={adminInput} />
          </label>
          <label className="text-sm sm:col-span-2">
            <span className="mb-1 block text-muted">Short description</span>
            <input
              name="description"
              defaultValue={source.description ?? ''}
              maxLength={240}
              className={adminInput}
            />
          </label>

          <fieldset className="m-0 border-0 p-0 text-sm sm:col-span-2">
            <legend className="mb-1.5 text-muted">Categories</legend>
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              {SOURCE_CATEGORIES.map((category) => (
                <label key={category} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    name="categories"
                    value={category}
                    defaultChecked={source.categories.includes(category)}
                    className="h-4 w-4 accent-[var(--cl-selected)]"
                  />
                  {category}
                </label>
              ))}
            </div>
          </fieldset>

          {/*
            * The two warnings, mildest first, grouped so the difference
            * between them is visible at the moment of choosing.
            */}
          <fieldset className="rounded-field border border-line px-3 pb-2.5 pt-1.5 sm:col-span-2">
            <legend className="px-1 text-sm font-semibold text-text">Warnings</legend>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="hasLotsOfAds"
                defaultChecked={source.hasLotsOfAds}
                className="h-4 w-4 accent-[var(--cl-selected)]"
              />
              <span className="inline-flex items-center gap-1.5">
                <AdsWarning />
                <span className="text-muted">it works, it is just unpleasant</span>
              </span>
            </label>

            <label className="mt-2 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="shouldAvoid"
                defaultChecked={source.shouldAvoid}
                className="h-4 w-4 accent-[var(--cl-selected)]"
              />
              <span className="inline-flex items-center gap-1.5">
                <AvoidWarning />
                <span className="text-muted">listed, but tell people not to go</span>
              </span>
            </label>

            <label className="mt-2 block text-sm">
              <span className="mb-1 block text-muted">
                Why to avoid it &mdash; shown to readers, one line
              </span>
              <input
                name="avoidReason"
                defaultValue={source.avoidReason ?? ''}
                maxLength={160}
                placeholder="Asks for a sign-in and does not work without one"
                className={adminInput}
              />
            </label>
          </fieldset>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="isEnabled"
              defaultChecked={source.isEnabled}
              className="h-4 w-4 accent-[var(--cl-selected)]"
            />
            Visible in the directory
          </label>

          {/*
            * A pick, and where it sits among the other picks.
            *
            * Separate from the rank penalty below on purpose: a penalty
            * nudges a source down within the normal ranking, this lifts it
            * out of that ranking entirely. Keeping them apart means each one
            * still means something on its own.
            */}
          <fieldset className="rounded-field border border-trusted-line px-3 pb-2.5 pt-1.5 sm:col-span-2">
            <legend className="px-1 text-sm font-semibold text-text">Trusted pick</legend>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="trusted"
                defaultChecked={source.trustedRank !== null}
                className="h-4 w-4 accent-[var(--cl-selected)]"
              />
              <span className="inline-flex items-center gap-1.5">
                <TrustedMark />
                <span className="text-muted">pin above everything else</span>
              </span>
            </label>

            <div className="mt-2 grid gap-2.5 sm:grid-cols-[120px_minmax(0,1fr)]">
              <label className="text-sm">
                <span className="mb-1 block text-muted">Order</span>
                <input
                  name="trustedRank"
                  type="number"
                  min={0}
                  max={9999}
                  defaultValue={source.trustedRank ?? 100}
                  className={adminInput}
                />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-muted">
                  Why &mdash; readers see this on hover
                </span>
                <input
                  name="trustedNote"
                  defaultValue={source.trustedNote ?? ''}
                  maxLength={160}
                  placeholder="Been reliable for years, no sign-in, no pop-ups"
                  className={adminInput}
                />
              </label>
            </div>
            <p className="m-0 mt-1.5 text-xs text-muted">
              Lower numbers sit higher. Leave them spaced out &mdash; 100, 200, 300 &mdash; so a
              new pick can go between two without renumbering the rest.
            </p>
          </fieldset>

          <label className="text-sm">
            <span className="mb-1 block text-muted">Quality, if worth noting</span>
            <input
              name="qualityLabel"
              defaultValue={source.qualityLabel ?? ''}
              maxLength={12}
              list="row-quality-suggestions"
              placeholder="4K"
              className={adminInput}
            />
            <datalist id="row-quality-suggestions">
              <option value="4K" />
              <option value="1080p" />
              <option value="HD" />
              <option value="SD" />
              <option value="HQ scans" />
              <option value="Official" />
            </datalist>
          </label>

          <label className="text-sm">
            <span className="mb-1 block text-muted">Rank penalty (0–100)</span>
            <input
              name="adminRankPenalty"
              type="number"
              min={0}
              max={100}
              defaultValue={source.adminRankPenalty}
              className={adminInput}
            />
          </label>

          <div className="flex items-end">
            <button
              type="submit"
              disabled={busy}
              className="cl-touch inline-flex items-center rounded-pill bg-selected px-3.5 py-2 text-sm font-semibold text-selected-fg hover:bg-selected-hover disabled:opacity-60"
            >
              {busy ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </form>
      ) : null}

      {open ? <DeleteSource id={source.id} domain={source.domain} name={source.name} /> : null}
    </div>
  );
}

/**
 * Removing a source for good.
 *
 * Hiding is almost always the right answer, and this says so rather than
 * sitting next to it as an equal choice. What makes it safe is not the
 * confirmation box but what the box contains: the counts of everything that
 * goes too, fetched before anything is deleted, so the decision is made with
 * the consequences visible instead of described.
 */
function DeleteSource({ id, domain, name }: { id: string; domain: string; name: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [counts, setCounts] = useState<Record<string, number> | null>(null);

  async function begin() {
    setOpen(true);
    setError(null);
    const response = await fetch(`/api/admin/sources/${id}/references`).catch(() => null);
    if (response?.ok) setCounts(await response.json());
  }

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/sources/${id}`, {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ confirmDomain: typed, reason: reason || undefined }),
      });
      const body = await response.json();
      if (!response.ok) {
        setError(body?.error?.message ?? 'That did not go through.');
        return;
      }
      router.refresh();
    } catch {
      setError('No connection. Try again.');
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <div className="mt-3 border-t border-line pt-3">
        <button
          type="button"
          onClick={() => void begin()}
          className="cl-touch rounded-pill border border-danger-line bg-bg px-3.5 py-2 text-sm text-danger-text hover:bg-danger-bg"
        >
          Delete permanently…
        </button>
        <span className="ml-2 text-xs text-muted">
          Hiding is usually better: it keeps the votes, the saves and the credit.
        </span>
      </div>
    );
  }

  const goes = counts
    ? [
        [counts.votes, 'vote'],
        [counts.saves, 'save'],
        [counts.contributions, 'credited contribution'],
        [counts.reports, 'report'],
        [counts.collections, 'place in a collection'],
      ].filter(([n]) => Number(n) > 0)
    : [];

  return (
    <div className="mt-3 rounded-card border-2 border-danger-line bg-danger-bg p-3.5 text-sm text-danger-text">
      <p className="m-0 font-bold">Delete {name} permanently?</p>

      {counts ? (
        goes.length > 0 ? (
          <p className="m-0 mt-1.5">
            This also deletes{' '}
            {goes
              .map(([n, noun]) => `${n} ${noun}${Number(n) === 1 ? '' : 's'}`)
              .join(', ')
              .replace(/, ([^,]*)$/u, ' and $1')}
            . Accounts are not affected. This cannot be undone.
          </p>
        ) : (
          <p className="m-0 mt-1.5">
            Nothing else references it. This cannot be undone.
          </p>
        )
      ) : (
        <p className="m-0 mt-1.5">Checking what else would go…</p>
      )}

      <label className="mt-2.5 block">
        <span className="mb-1 block">
          Type <span className="font-mono font-bold">{domain}</span> to confirm
        </span>
        <input
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
          autoComplete="off"
          className="w-full rounded-field border border-danger-line bg-bg px-3 py-2 text-sm text-text"
        />
      </label>

      <label className="mt-2 block">
        <span className="mb-1 block">Why, for the audit log</span>
        <input
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          maxLength={300}
          placeholder="Duplicate of another listing"
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
          disabled={busy || typed.trim().toLowerCase() !== domain.toLowerCase()}
          className="cl-touch rounded-pill bg-selected px-3.5 py-2 text-sm font-semibold text-selected-fg disabled:opacity-50"
        >
          {busy ? 'Deleting…' : 'Delete for good'}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setTyped('');
            setError(null);
          }}
          className="cl-touch rounded-pill border border-line bg-bg px-3.5 py-2 text-sm text-text hover:bg-hover"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

const adminInput =
  'w-full rounded-field border border-line bg-bg px-3 py-2 text-sm text-text';
