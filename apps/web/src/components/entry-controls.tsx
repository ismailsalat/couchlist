"use client";

import { useState } from "react";
import { ActionToast } from "./action-toast";
import { STATUS_LABEL, STATUS_STYLE, type ListStatus } from "@/lib/status";

type Status = ListStatus;

export interface EntryState {
  status: Status;
  rating: number | null;
  progress: number | null;
}

/**
 * One deliberately small editor for a title.
 *
 * Mutations update local state after the API confirms the save. We do not run
 * a full router.refresh() after every click: that used to make the page enter a
 * server-render transition and could leave the status controls feeling stuck.
 */
export function EntryControls({
  media,
  initial,
  supportsProgress,
  episodeCount,
}: {
  media: { provider: string; mediaType: string; providerMediaId: string };
  initial: EntryState | null;
  supportsProgress: boolean;
  episodeCount: number | null;
}) {
  const [entry, setEntry] = useState<EntryState | null>(initial);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function send(
    method: "POST" | "PATCH" | "DELETE",
    body: Record<string, unknown>,
  ) {
    setError(null);
    setMessage(null);

    try {
      const response = await fetch("/api/me/list", {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ media, ...body }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        setError(payload?.error?.message ?? "Something went wrong. Try again.");
        return null;
      }
      return (await response.json()) as { entry?: EntryState };
    } catch {
      setError("Could not reach Couchlist. Try again.");
      return null;
    }
  }

  async function setStatus(status: Status) {
    if (saving) return;
    if (entry?.status === status) {
      setError(null);
      setMessage(
        `Already saved as ${STATUS_LABEL[status]}. You can change it anytime.`,
      );
      return;
    }

    setSaving(true);
    try {
      const result = await send(entry ? "PATCH" : "POST", { status });
      if (result) {
        setEntry((current) => ({
          ...(current ?? { rating: null, progress: null }),
          status,
        }));
        setMessage(
          `${STATUS_LABEL[status]} saved. You can change this anytime.`,
        );
      }
    } finally {
      setSaving(false);
    }
  }

  async function setRating(value: string) {
    if (saving || !entry) return;
    const numeric = value === "" ? null : Number(value);
    if (
      numeric !== null &&
      (!Number.isFinite(numeric) || numeric < 1 || numeric > 10)
    ) {
      setError("Ratings run from 1 to 10.");
      return;
    }
    const rating = numeric === null ? null : Math.round(numeric * 10) / 10;

    setSaving(true);
    try {
      const result = await send("PATCH", { rating });
      if (result) {
        setEntry((current) => (current ? { ...current, rating } : current));
        setMessage(
          rating === null
            ? "Rating cleared."
            : `Rating updated to ${rating.toFixed(1)}.`,
        );
      }
    } finally {
      setSaving(false);
    }
  }

  async function setProgress(value: string) {
    if (saving || !entry) return;
    const progress = value === "" ? null : Number.parseInt(value, 10);
    if (progress !== null && Number.isNaN(progress)) return;
    if (progress !== null && progress < 0) {
      setError("Episode progress cannot be negative.");
      return;
    }
    if (progress !== null && episodeCount && progress > episodeCount) {
      setError(`That title currently has ${episodeCount} episodes.`);
      return;
    }

    setSaving(true);
    try {
      const result = await send("PATCH", { progress });
      if (result) {
        setEntry((current) => (current ? { ...current, progress } : current));
        setMessage(
          progress === null
            ? "Progress cleared."
            : `Progress updated to episode ${progress}.`,
        );
      }
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (saving || !entry) return;
    setSaving(true);
    try {
      const result = await send("DELETE", {});
      if (result) {
        setEntry(null);
        setMessage("Removed from your Couchlist.");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-6">
      <div className="flex flex-wrap gap-2" aria-label="Your list status">
        {(Object.keys(STATUS_LABEL) as Status[]).map((status) => {
          const selected = entry?.status === status;
          return (
            <button
              key={status}
              type="button"
              disabled={saving}
              aria-pressed={selected}
              onClick={() => void setStatus(status)}
              className={
                selected
                  ? `btn border px-4 py-2 ${STATUS_STYLE[status].badge}`
                  : "btn-secondary"
              }
            >
              {STATUS_LABEL[status]}
            </button>
          );
        })}

        {entry ? (
          <button
            type="button"
            disabled={saving}
            onClick={() => void remove()}
            className="btn-secondary"
          >
            Remove
          </button>
        ) : null}
      </div>

      <p className="muted mt-2 text-xs">
        {entry
          ? `Saved as ${STATUS_LABEL[entry.status]}. Change it whenever you want.`
          : "Pick where this title belongs on your Couchlist."}
      </p>

      {entry ? (
        <div className="mt-4 flex flex-wrap items-end gap-5">
          <label className="block">
            <span className="muted mb-1 block">Your rating</span>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                max={10}
                step={0.1}
                inputMode="decimal"
                defaultValue={entry.rating ?? ""}
                disabled={saving}
                onBlur={(event) => void setRating(event.target.value)}
                className="input w-24 py-2"
                aria-label="Your rating out of 10"
              />
              <span className="muted">/ 10</span>
            </div>
          </label>

          {supportsProgress ? (
            <label className="block">
              <span className="muted mb-1 block">
                Episode progress{episodeCount ? ` (of ${episodeCount})` : ""}
              </span>
              <input
                type="number"
                min={0}
                max={episodeCount ?? undefined}
                inputMode="numeric"
                defaultValue={entry.progress ?? ""}
                disabled={saving}
                onBlur={(event) => void setProgress(event.target.value)}
                className="input w-32 py-2"
              />
            </label>
          ) : null}
        </div>
      ) : null}

      {saving ? <p className="muted mt-3 text-xs">Saving…</p> : null}
      {message ? <ActionToast message={message} /> : null}
      {error ? <ActionToast message={error} kind="error" /> : null}
    </div>
  );
}
