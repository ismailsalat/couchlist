"use client";

import { useMemo, useState } from "react";
import { SourceSiteIcon } from "./source-site-icon";
import { SourceSafetyNote } from "./source-safety-note";
import {
  ACCESS_TEXT,
  AUDIO_TEXT,
  AudioFilter,
  COMMUNITY_SOURCE_DISCLAIMER,
  QUALITY_TEXT,
  SOURCE_TYPE_TEXT,
  WatchFilter,
  availabilityText,
  groupWatchOptions,
  lastCheckedText,
  matchesAudioFilter,
  matchesFilter,
  sortWatchOptions,
  weightedWatchRating,
  type WatchOption,
} from "@couchlist/shared";

const PAGE_SIZE = 5;
type SourceSort = "recommended" | "top" | "rated" | "working";
const FILTERS: Array<{ value: WatchFilter; label: string }> = [
  { value: "ALL", label: "All" },
  { value: "FREE", label: "Free" },
  { value: "SUBSCRIPTION", label: "Subscription" },
  { value: "RENT_BUY", label: "Rent / Buy" },
  { value: "OFFICIAL", label: "Official" },
  { value: "COMMUNITY", label: "Community" },
];
const AUDIO_FILTERS: Array<{ value: AudioFilter; label: string }> = [
  { value: "ANY", label: "Any" },
  { value: "SUB", label: "Sub" },
  { value: "DUB", label: "Dub" },
];

export function WatchSection({
  options,
  isAnime,
  degraded,
  requiresJustWatchAttribution,
  preferredSourceId,
  mediaContext,
}: {
  options: WatchOption[];
  isAnime: boolean;
  degraded: boolean;
  requiresJustWatchAttribution: boolean;
  preferredSourceId: string | null;
  mediaContext: { contentKey: string; title: string; mediaType: "ANIME" | "MOVIE" | "TV" };
}) {
  const [filter, setFilter] = useState<WatchFilter>("ALL");
  const [audio, setAudio] = useState<AudioFilter>("ANY");
  const [sourceSort, setSourceSort] = useState<SourceSort>("recommended");
  const visible = useMemo(() => {
    const filtered = options.filter((option) => matchesFilter(option, filter) && matchesAudioFilter(option, audio));
    const confirmed = rankOptions(filtered.filter((option) => !option.directoryOnly), sourceSort, preferredSourceId);
    const directory = rankOptions(filtered.filter((option) => option.directoryOnly), sourceSort, preferredSourceId);
    return { confirmed: groupWatchOptions(confirmed), directory };
  }, [options, filter, audio, sourceSort, preferredSourceId]);

  return (
    <div>
      {options.length > 0 ? (
        <>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Filter sources">
            {FILTERS.map((entry) => <FilterChip key={entry.value} label={entry.label} active={filter === entry.value} onClick={() => setFilter(entry.value)} />)}
          </div>
          {isAnime ? (
            <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Filter audio">
              {AUDIO_FILTERS.map((entry) => <FilterChip key={entry.value} label={entry.label} active={audio === entry.value} onClick={() => setAudio(entry.value)} subtle />)}
            </div>
          ) : null}
          <div className="mt-3 flex flex-wrap items-center gap-2" role="group" aria-label="Sort sources">
            <span className="muted mr-1 text-[11px] font-bold uppercase tracking-[0.12em]">Sort</span>
            {([
              ["recommended", "Recommended"],
              ["top", "Top Rated"],
              ["rated", "Most Rated"],
              ["working", "Recently Working"],
            ] as Array<[SourceSort, string]>).map(([value, label]) => (
              <FilterChip key={value} label={label} active={sourceSort === value} onClick={() => setSourceSort(value)} subtle />
            ))}
          </div>
          {degraded ? <p className="muted mt-4 text-xs">Some sources couldn&apos;t be refreshed, so this list may be incomplete.</p> : null}
          <SourceSafetyNote />
          <SourceGroup heading="Listed for this title" options={visible.confirmed.authorized} emptyText="" />
          {visible.confirmed.community.length > 0 ? <SourceGroup heading="Community links for this title" options={visible.confirmed.community} emptyText="" disclaimer={COMMUNITY_SOURCE_DISCLAIMER} /> : null}
          {visible.directory.length > 0 ? (
            <SourceGroup
              heading={`More ${mediaContext.mediaType === "ANIME" ? "anime" : mediaContext.mediaType === "MOVIE" ? "movie" : "TV"} sources`}
              options={visible.directory}
              emptyText=""
              disclaimer="These sources support this media type in general. Couchlist has not confirmed this exact title there yet."
            />
          ) : null}
          {visible.confirmed.authorized.length === 0 && visible.confirmed.community.length === 0 && visible.directory.length === 0 ? (
            <p className="muted mt-5 text-sm">No sources match these filters.</p>
          ) : null}
          {requiresJustWatchAttribution ? <p className="muted mt-6 text-[11px]">Streaming availability for movies and TV is provided by JustWatch via TMDB.</p> : null}
        </>
      ) : (
        <div className="watch-source-card rounded-[22px] border p-6 text-center">
          <p className="font-display text-base font-bold">No signal yet</p>
          <p className="muted mx-auto mt-2 max-w-sm">{degraded ? "We couldn't reach the sources that track this title. Try again in a bit." : "Nothing has been catalogued for this title yet."}</p>
        </div>
      )}

      <SuggestSource mediaContext={mediaContext} />
    </div>
  );
}

function SourceGroup({ heading, options, emptyText, disclaimer }: { heading: string; options: WatchOption[]; emptyText: string; disclaimer?: string }) {
  const [shown, setShown] = useState(PAGE_SIZE);
  if (options.length === 0 && !emptyText) return null;
  const remaining = options.length - shown;
  return (
    <section className="mt-7">
      <div className="flex items-center gap-3">
        <h3 className="font-display text-xs font-bold uppercase tracking-[0.14em] text-text-secondary">{heading}</h3>
        <span className="h-px flex-1 bg-border" aria-hidden="true" />
        <span className="text-[11px] font-bold text-text-secondary">{options.length} source{options.length === 1 ? "" : "s"}</span>
      </div>
      {disclaimer ? <p className="mt-3 rounded-xl border border-border bg-[#0b1016] px-3 py-2.5 text-[11px] leading-relaxed text-text-secondary">{disclaimer}</p> : null}
      {options.length === 0 ? <p className="muted mt-3 text-xs">{emptyText}</p> : (
        <ul className="mt-3 space-y-3">{options.slice(0, shown).map((option) => <SourceRow key={option.id} option={option} />)}</ul>
      )}
      {remaining > 0 ? <button type="button" onClick={() => setShown((current) => current + PAGE_SIZE)} className="btn-secondary mt-3 w-full sm:w-auto">Show {Math.min(remaining, PAGE_SIZE)} more</button> : null}
      {shown > PAGE_SIZE && remaining <= 0 ? <button type="button" onClick={() => setShown(PAGE_SIZE)} className="btn-secondary mt-3 w-full sm:w-auto">Show fewer</button> : null}
    </section>
  );
}

function SourceRow({ option }: { option: WatchOption }) {
  const [ratingAverage, setRatingAverage] = useState(option.ratingAverage ?? null);
  const [ratingCount, setRatingCount] = useState(option.ratingCount ?? 0);
  const [reliability, setReliability] = useState(option.reliabilityPercent ?? null);
  const [health, setHealth] = useState<NonNullable<WatchOption["healthStatus"]>>(option.healthStatus ?? "HEALTHY");
  const [reported, setReported] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reportMenu, setReportMenu] = useState(false);
  const checked = lastCheckedText(option.lastCheckedAt ? new Date(option.lastCheckedAt) : null);

  async function feedback(payload: Record<string, unknown>) {
    if (busy) return;
    setBusy(true);
    try {
      const response = await fetch("/api/watch/feedback", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sourceId: option.sourceId, ...payload }) });
      if (response.ok) {
        const body = (await response.json()) as { stats?: { ratingAverage: number | null; ratingCount: number; reliabilityPercent: number | null; healthStatus: NonNullable<WatchOption["healthStatus"]> } | null };
        if (body.stats) { setRatingAverage(body.stats.ratingAverage); setRatingCount(body.stats.ratingCount); setReliability(body.stats.reliabilityPercent); setHealth(body.stats.healthStatus); }
      }
    } finally { setBusy(false); }
  }

  async function report(reason: string) {
    if (busy || reported) return;
    setBusy(true);
    try {
      const response = await fetch("/api/watch/report", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(option.directoryOnly
          ? { watchSourceId: option.sourceId, reason }
          : { mediaWatchSourceId: option.id, reason }),
      });
      if (response.ok) { setReported(true); setReportMenu(false); }
    } finally { setBusy(false); }
  }

  const healthLabel = health === "POSSIBLY_UNAVAILABLE" ? "Possibly unavailable" : health === "DEGRADED" ? "Degraded" : health === "WATCH" ? "Some issues" : "Healthy";
  const healthClass = health === "HEALTHY" ? "tag-free" : health === "WATCH" ? "tag-rent" : "tag-broken";

  return (
    <li className="watch-source-card rounded-[22px] border px-4 py-4 transition hover:border-primary/50">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 gap-3">
          <SourceSiteIcon domain={option.domain} name={option.name} size="sm" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-display truncate font-bold">{option.name}</p>
              <span className={`tag ${healthClass}`}>{healthLabel}</span>
            </div>
            <p className="muted mt-0.5 truncate text-xs">{option.domain}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {option.supportsAnime ? <Tag className="tag-anime">Anime</Tag> : null}
            {option.supportsMovies ? <Tag className="tag-movie">Movies</Tag> : null}
            {option.supportsTv ? <Tag className="tag-tv">TV</Tag> : null}
            {!option.supportsAnime && !option.supportsMovies && !option.supportsTv ? <Tag className="tag-neutral">Type not set</Tag> : null}
            <Tag className={option.sourceType === "OFFICIAL" ? "tag-official" : option.sourceType === "COMMUNITY" ? "tag-community" : option.sourceType === "UNVERIFIED" ? "tag-unverified" : "tag-neutral"}>{SOURCE_TYPE_TEXT[option.sourceType]}</Tag>
            <Tag className={accessClass(option.accessType)}>{option.priceLabel ?? ACCESS_TEXT[option.accessType]}</Tag>
            <Tag className="tag-neutral">{QUALITY_TEXT[option.quality]}</Tag>
            {option.audio !== "UNKNOWN" ? <Tag className={option.audio === "DUB" ? "tag-dub" : option.audio === "SUB" ? "tag-sub" : "tag-subdub"}>{AUDIO_TEXT[option.audio]}</Tag> : null}
          </div>
          {option.providerOptions?.length ? <p className="muted mt-2 text-[11px]">Available via {formatProviderOptions(option.providerOptions)}</p> : null}
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs">
            <span><strong className="text-status-rating">★ {ratingAverage?.toFixed(1) ?? "—"}</strong> <span className="muted">· {ratingCount} ratings</span></span>
            <span><strong>{reliability === null ? "No reliability signal" : `${reliability}% working`}</strong></span>
          </div>
            <p className="muted mt-2 text-[11px]">
              {option.directoryOnly
                ? "General source · not confirmed for this exact title"
                : `${availabilityText(option.availabilityStatus)}${checked ? ` · ${checked}` : ""}`}
            </p>
          </div>
        </div>
        <a href={option.availabilityUrl} target="_blank" rel="noopener noreferrer nofollow" className="btn-secondary min-h-[46px] px-5">Open ↗</a>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border/80 pt-3">
        <span className="muted text-xs font-bold">Rate:</span>
        {[1,2,3,4,5].map((rating) => <button key={rating} type="button" disabled={busy} aria-label={`Rate ${rating} stars`} onClick={() => void feedback({ action: "rate", rating })} className="text-lg text-status-rating transition hover:scale-110 disabled:opacity-50">★</button>)}
        <button type="button" disabled={busy} className="btn-secondary px-3 py-1.5 text-xs" onClick={() => void feedback({ action: "health", status: "WORKING" })}>Works for me</button>
        <button type="button" disabled={busy} className="btn-secondary px-3 py-1.5 text-xs" onClick={() => void feedback({ action: "health", status: "BROKEN", reason: "BROKEN_LINK" })}>Not working</button>
        <button type="button" disabled={reported} onClick={() => setReportMenu((value) => !value)} className="text-xs font-bold text-text-secondary hover:text-status-live disabled:opacity-60">{reported ? "Reported" : "Report"}</button>
      </div>
      {reportMenu ? <div className="mt-3 flex flex-wrap gap-2 rounded-2xl border border-border bg-background/50 p-3">{["BROKEN_LINK", "WRONG_TITLE", "UNSAFE_REDIRECT", "SPAM", "OTHER"].map((reason) => <button key={reason} type="button" className="tag tag-neutral" onClick={() => void report(reason)}>{pretty(reason)}</button>)}</div> : null}
    </li>
  );
}

function SuggestSource({ mediaContext }: { mediaContext: { contentKey: string; title: string; mediaType: "ANIME" | "MOVIE" | "TV" } }) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [comment, setComment] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [anime, setAnime] = useState(mediaContext.mediaType === "ANIME");
  const [movies, setMovies] = useState(mediaContext.mediaType === "MOVIE");
  const [tv, setTv] = useState(mediaContext.mediaType === "TV");

  async function submit() {
    if (!url.trim() || busy) return;
    setBusy(true); setError(null);
    try {
      const response = await fetch("/api/watch/suggest", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ homepageUrl: url.trim(), availabilityUrl: url.trim(), suggestedName: name.trim() || undefined, comment: comment.trim() || undefined, supportsAnime: anime, supportsMovies: movies, supportsTv: tv, contentKey: mediaContext.contentKey, mediaType: mediaContext.mediaType, mediaTitle: mediaContext.title }) });
      const payload = (await response.json().catch(() => null)) as { accepted?: boolean; error?: { message?: string } } | null;
      if (!response.ok) { setError(payload?.error?.message ?? "Could not submit this suggestion."); return; }
      if (payload?.accepted === false) { setError("That source is already waiting for review."); return; }
      setSubmitted(true);
    } catch { setError("Could not reach Couchlist."); } finally { setBusy(false); }
  }

  return (
    <section className="mt-8 rounded-[22px] border border-dashed border-primary/35 bg-primary/[0.05] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><p className="font-display font-bold">Can&apos;t find where to watch?</p><p className="muted mt-1 text-xs">Suggest a source for review. Community suggestions never publish automatically.</p></div>
        <button type="button" className="btn-secondary" onClick={() => setOpen((value) => !value)}>{open ? "Close" : "Suggest a Source"}</button>
      </div>
      {open ? submitted ? <p className="mt-4 text-sm font-bold text-status-online">Suggestion sent for review.</p> : (
        <div className="mt-4">
          <div className="grid gap-3 sm:grid-cols-2"><input className="input" placeholder="https://example.com/title" value={url} onChange={(e) => setUrl(e.target.value)} /><input className="input" placeholder="Source name (optional)" value={name} onChange={(e) => setName(e.target.value)} /><input className="input sm:col-span-2" placeholder="Short note (optional)" value={comment} onChange={(e) => setComment(e.target.value)} /></div>
          <div className="mt-3 flex flex-wrap gap-4 text-sm font-bold"><Check label="Anime" checked={anime} onChange={setAnime} /><Check label="Movies" checked={movies} onChange={setMovies} /><Check label="TV" checked={tv} onChange={setTv} /></div>
          <button type="button" className="btn-primary mt-4" disabled={busy || !url.trim()} onClick={() => void submit()}>{busy ? "Sending…" : "Submit Suggestion"}</button>
          {error ? <p className="mt-2 text-xs font-bold text-status-live">{error}</p> : null}
        </div>
      ) : null}
    </section>
  );
}

function rankOptions(options: WatchOption[], sort: SourceSort, preferredSourceId: string | null): WatchOption[] {
  if (sort === "recommended") return sortWatchOptions(options, preferredSourceId);
  const healthPenalty = (option: WatchOption) => option.healthStatus === "POSSIBLY_UNAVAILABLE" ? 1.5 : option.healthStatus === "DEGRADED" ? 0.75 : option.healthStatus === "WATCH" ? 0.3 : 0;
  const standing = (option: WatchOption) => weightedWatchRating(option.ratingAverage ?? null, option.ratingCount ?? 0) - healthPenalty(option);
  return [...options].sort((a, b) => {
    if (sort === "rated") return (b.ratingCount ?? 0) - (a.ratingCount ?? 0) || standing(b) - standing(a) || a.name.localeCompare(b.name);
    if (sort === "working") {
      return healthPenalty(a) - healthPenalty(b)
        || (b.reliabilityPercent ?? -1) - (a.reliabilityPercent ?? -1)
        || (b.workingRecent ?? 0) - (a.workingRecent ?? 0)
        || standing(b) - standing(a)
        || a.name.localeCompare(b.name);
    }
    return standing(b) - standing(a) || (b.ratingCount ?? 0) - (a.ratingCount ?? 0) || a.name.localeCompare(b.name);
  });
}

function Tag({ children, className }: { children: React.ReactNode; className: string }) { return <span className={`tag ${className}`}>{children}</span>; }
function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) { return <label className="inline-flex items-center gap-2"><input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />{label}</label>; }
function accessClass(type: string) { if (type === "FREE" || type === "FREE_WITH_ADS") return "tag-free"; if (type === "SUBSCRIPTION") return "tag-subscription"; if (type === "RENT" || type === "BUY") return "tag-rent"; return "tag-neutral"; }
function pretty(value: string) { return value.toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase()); }
function formatProviderOptions(providers: NonNullable<WatchOption["providerOptions"]>) { const visible = providers.slice(0,4).map((provider) => { const access = provider.accessTypes.map((type) => ACCESS_TEXT[type]).join(" / "); return access ? `${provider.name} (${access})` : provider.name; }); const remaining = providers.length - visible.length; return `${visible.join(", ")}${remaining > 0 ? ` +${remaining} more` : ""}`; }
function FilterChip({ label, active, onClick, subtle = false }: { label: string; active: boolean; onClick: () => void; subtle?: boolean }) { return <button type="button" onClick={onClick} aria-pressed={active} className={active ? "tag tag-official" : `tag tag-neutral ${subtle ? "opacity-90" : ""}`}>{label}</button>; }
