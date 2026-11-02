'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { GUIDE_DEVICE_OPTIONS, GUIDE_TOPICS, GuideDevice } from '@couchlist/shared';

/**
 * Edits one guide.
 *
 * Every field the brief calls editable is here: title, task, topic, devices,
 * browser notes, steps, official links, cost, published state and sort order.
 *
 * "I checked the links and claims just now" is a separate tick, because the
 * reviewed date must mean a human looked, not that somebody fixed a typo.
 */
export function GuideAdminRow({
  guide,
}: {
  guide: {
    id: string;
    slug: string;
    title: string;
    task: string;
    topic: string;
    summary: string;
    steps: string[];
    links: Array<{ label: string; url: string }>;
    note: string | null;
    costNote: string | null;
    browserNotes: string | null;
    devices: GuideDevice[];
    deviceLabel: string;
    keywords: string;
    isStarter: boolean;
    isPublished: boolean;
    sortOrder: number;
    lastReviewedAt: string | null;
  };
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

    const steps = String(form.get('steps') ?? '')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

    const links = String(form.get('links') ?? '')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [label, url] = line.split('|').map((part) => part.trim());
        return { label: label ?? '', url: url ?? '' };
      })
      .filter((link) => link.label && link.url);

    try {
      const response = await fetch(`/api/admin/guides/${guide.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          slug: String(form.get('slug') ?? ''),
          title: String(form.get('title') ?? ''),
          task: String(form.get('task') ?? ''),
          topic: String(form.get('topic') ?? ''),
          summary: String(form.get('summary') ?? ''),
          steps,
          links,
          note: String(form.get('note') ?? '') || undefined,
          costNote: String(form.get('costNote') ?? '') || undefined,
          browserNotes: String(form.get('browserNotes') ?? '') || undefined,
          deviceComputer: form.get('deviceComputer') === 'on',
          deviceIphone: form.get('deviceIphone') === 'on',
          deviceAndroid: form.get('deviceAndroid') === 'on',
          deviceTv: form.get('deviceTv') === 'on',
          deviceLabel: String(form.get('deviceLabel') ?? ''),
          keywords: String(form.get('keywords') ?? ''),
          isStarter: form.get('isStarter') === 'on',
          isPublished: form.get('isPublished') === 'on',
          sortOrder: Number(form.get('sortOrder') ?? 100),
          markReviewedNow: form.get('markReviewedNow') === 'on',
        }),
      });
      const body = await response.json();
      if (!response.ok) {
        setError(body?.error?.message ?? 'That did not save.');
        return;
      }
      setStatus(body.reviewed ? 'Saved and marked reviewed.' : 'Saved.');
      router.refresh();
    } catch {
      setError('No connection. Try again.');
    } finally {
      setBusy(false);
    }
  }

  const deviceField: Record<GuideDevice, string> = {
    [GuideDevice.ANY]: '',
    [GuideDevice.COMPUTER]: 'deviceComputer',
    [GuideDevice.IPHONE]: 'deviceIphone',
    [GuideDevice.ANDROID]: 'deviceAndroid',
    [GuideDevice.TV]: 'deviceTv',
  };

  return (
    <div className="border-b border-line p-3.5 last:border-b-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="m-0 text-sm font-semibold text-text">
            {guide.title}
            {!guide.isPublished ? (
              <span className="ml-2 rounded-pill border border-line bg-active px-2 py-px text-xs text-muted">
                Draft
              </span>
            ) : null}
            {guide.isStarter ? (
              <span className="ml-2 rounded-pill border border-line bg-accent-soft px-2 py-px text-xs text-accent">
                Start here
              </span>
            ) : null}
          </p>
          <p className="m-0 mt-0.5 text-sm text-muted">
            {guide.task} ·{' '}
            {guide.lastReviewedAt ? (
              `checked ${guide.lastReviewedAt}`
            ) : (
              <span className="text-warn-text">never reviewed</span>
            )}
          </p>
        </div>

        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          className="cl-touch inline-flex shrink-0 items-center rounded-pill border border-line bg-surface px-3 py-2 text-sm text-text hover:bg-hover"
        >
          {open ? 'Close' : 'Edit'}
        </button>
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
          <Text name="title" label="Title (the task)" defaultValue={guide.title} />
          <Text name="task" label="Tool and scope" defaultValue={guide.task} />
          <Text name="slug" label="URL slug" defaultValue={guide.slug} />

          <label className="text-sm">
            <span className="mb-1 block text-muted">Topic</span>
            <select name="topic" defaultValue={guide.topic} className={field}>
              {GUIDE_TOPICS.map((entry) => (
                <option key={entry.topic} value={entry.topic}>
                  {entry.title}
                </option>
              ))}
            </select>
          </label>

          <Area name="summary" label="Summary" defaultValue={guide.summary} span rows={2} />
          <Area
            name="steps"
            label="Steps (one per line)"
            defaultValue={guide.steps.join('\n')}
            span
            rows={4}
          />
          <Area
            name="links"
            label="Official links (one per line, as: Label | https://…)"
            defaultValue={guide.links.map((link) => `${link.label} | ${link.url}`).join('\n')}
            span
            rows={3}
          />
          <Area
            name="browserNotes"
            label="Browser support"
            defaultValue={guide.browserNotes ?? ''}
            span
            rows={2}
          />
          <Text name="costNote" label="Cost" defaultValue={guide.costNote ?? ''} />
          <Text name="deviceLabel" label="Device label shown on the row" defaultValue={guide.deviceLabel} />
          <Area name="note" label="Limitations" defaultValue={guide.note ?? ''} span rows={2} />
          <Area name="keywords" label="Search keywords" defaultValue={guide.keywords} span rows={2} />

          <fieldset className="m-0 border-0 p-0 text-sm sm:col-span-2">
            <legend className="mb-1.5 text-muted">Supported devices</legend>
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              {GUIDE_DEVICE_OPTIONS.filter((option) => option.value !== GuideDevice.ANY).map(
                (option) => (
                  <label key={option.value} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      name={deviceField[option.value]}
                      defaultChecked={guide.devices.includes(option.value)}
                      className="h-4 w-4 accent-[var(--cl-selected)]"
                    />
                    {option.label}
                  </label>
                ),
              )}
            </div>
          </fieldset>

          <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm sm:col-span-2">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                name="isPublished"
                defaultChecked={guide.isPublished}
                className="h-4 w-4 accent-[var(--cl-selected)]"
              />
              Published
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                name="isStarter"
                defaultChecked={guide.isStarter}
                className="h-4 w-4 accent-[var(--cl-selected)]"
              />
              Show in Start here
            </label>
            <label className="flex items-center gap-2">
              <span className="text-muted">Order</span>
              <input
                type="number"
                name="sortOrder"
                min={0}
                max={1000}
                defaultValue={guide.sortOrder}
                className="w-20 rounded-field border border-line bg-bg px-2 py-1.5 text-sm text-text"
              />
            </label>
          </div>

          <label className="flex items-start gap-2 rounded-field border border-line bg-bg p-3 text-sm sm:col-span-2">
            <input
              type="checkbox"
              name="markReviewedNow"
              className="mt-0.5 h-4 w-4 accent-[var(--cl-selected)]"
            />
            <span>
              <span className="block text-text">I checked the links and claims just now</span>
              <span className="block text-muted">
                Only tick this if you actually opened the links and confirmed the platform support
                and pricing. It sets the date readers see.
              </span>
            </span>
          </label>

          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={busy}
              className="cl-touch inline-flex items-center rounded-pill bg-selected px-3.5 py-2 text-sm font-semibold text-selected-fg hover:bg-selected-hover disabled:opacity-60"
            >
              {busy ? 'Saving…' : 'Save guide'}
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}

const field = 'w-full rounded-field border border-line bg-bg px-3 py-2 text-sm text-text';

function Text({ name, label, defaultValue }: { name: string; label: string; defaultValue: string }) {
  return (
    <label className="text-sm">
      <span className="mb-1 block text-muted">{label}</span>
      <input name={name} defaultValue={defaultValue} className={field} />
    </label>
  );
}

function Area({
  name,
  label,
  defaultValue,
  span,
  rows,
}: {
  name: string;
  label: string;
  defaultValue: string;
  span?: boolean;
  rows: number;
}) {
  return (
    <label className={`text-sm ${span ? 'sm:col-span-2' : ''}`}>
      <span className="mb-1 block text-muted">{label}</span>
      <textarea name={name} rows={rows} defaultValue={defaultValue} className={field} />
    </label>
  );
}
