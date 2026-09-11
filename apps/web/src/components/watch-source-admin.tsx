"use client";

import { useMemo, useState } from "react";

interface Stats {
  ratingAverage: number | null;
  ratingCount: number;
  likes: number;
  dislikes: number;
  reliabilityPercent: number | null;
  brokenRecent: number;
  healthStatus: string;
}

interface SourceRow {
  id: string;
  name: string;
  domain: string;
  homepageUrl: string;
  sourceType: string;
  accessType: string;
  origin: string;
  supportsAnime: boolean;
  supportsMovies: boolean;
  supportsTv: boolean;
  isEnabled: boolean;
  isVerified: boolean;
  adminRankPenalty: number;
  adminHealthOverride: string | null;
  stats?: Stats | null;
}

interface CandidateRow {
  id: string;
  domain: string;
  suggestedName: string;
  homepageUrl: string;
  guildId: string | null;
  supportsAnime: boolean;
  supportsMovies: boolean;
  supportsTv: boolean;
  comment: string | null;
  mediaTitle: string | null;
  createdAt: string;
}

interface ReportRow {
  id: string;
  reason: string;
  details: string | null;
  createdAt: string;
  watchSourceId: string | null;
  serverWatchPostId: string | null;
  domain: string | null;
  name: string | null;
}

interface PreviewResult {
  rows: number;
  create: number;
  update: number;
  duplicates: number;
  invalid: Array<{ index: number; reason: string }>;
  created?: number;
  updated?: number;
  applied?: boolean;
  failed?: Array<{ domain?: string; contentKey?: string; reason: string }>;
}

type Tab = "sources" | "suggestions" | "reports" | "advanced";

const FILTERS = [
  { label: "All", params: {} },
  { label: "Official", params: { sourceType: "OFFICIAL" } },
  { label: "Community", params: { sourceType: "COMMUNITY" } },
  { label: "Unverified", params: { sourceType: "UNVERIFIED" } },
  { label: "Enabled", params: { enabled: "true" } },
  { label: "Disabled", params: { enabled: "false" } },
] as const;

const SOURCE_TYPES = ["OFFICIAL", "COMMUNITY", "UNVERIFIED", "FREE_AD_SUPPORTED", "RENT_BUY", "LIBRARY", "PUBLIC_DOMAIN"];
const ACCESS_TYPES = ["UNKNOWN", "FREE", "FREE_WITH_ADS", "SUBSCRIPTION", "RENT", "BUY", "LIBRARY_CARD"];

export function WatchSourceAdmin({
  initialSources,
  initialCandidates,
  initialReports,
}: {
  initialSources: SourceRow[];
  initialCandidates: CandidateRow[];
  initialReports: ReportRow[];
}) {
  const [tab, setTab] = useState<Tab>("sources");
  const [sources, setSources] = useState(initialSources);
  const [candidates, setCandidates] = useState(initialCandidates);
  const [reports, setReports] = useState(initialReports);
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState(0);
  const [loading, setLoading] = useState(false);

  async function load(filterIndex = activeFilter, term = search) {
    setLoading(true);
    setActiveFilter(filterIndex);
    try {
      const params = new URLSearchParams(FILTERS[filterIndex]?.params as Record<string, string>);
      if (term.trim()) params.set("search", term.trim());
      const response = await fetch(`/api/dev/watch-sources?${params.toString()}`);
      if (!response.ok) return;
      const payload = (await response.json()) as {
        sources: SourceRow[];
        candidates: CandidateRow[];
        reports: ReportRow[];
      };
      setSources(payload.sources);
      setCandidates(payload.candidates);
      setReports(payload.reports);
    } finally {
      setLoading(false);
    }
  }

  async function manage(payload: Record<string, unknown>) {
    const response = await fetch("/api/dev/watch-sources/manage", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
      throw new Error(body?.error?.message ?? "Could not save that change.");
    }
    await load();
  }

  return (
    <div className="mt-8">
      <div className="flex flex-wrap gap-2 border-b border-border pb-3">
        {([
          ["sources", "Sources"],
          ["suggestions", `Suggestions${candidates.length ? ` (${candidates.length})` : ""}`],
          ["reports", `Reports${reports.length ? ` (${reports.length})` : ""}`],
          ["advanced", "Advanced"],
        ] as Array<[Tab, string]>).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setTab(value)}
            className={tab === value ? "tag tag-official" : "tag tag-neutral"}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "sources" ? (
        <SourcesTab
          sources={sources}
          search={search}
          setSearch={setSearch}
          activeFilter={activeFilter}
          loading={loading}
          load={load}
          manage={manage}
        />
      ) : null}
      {tab === "suggestions" ? <SuggestionsTab rows={candidates} manage={manage} /> : null}
      {tab === "reports" ? <ReportsTab rows={reports} sources={sources} manage={manage} /> : null}
      {tab === "advanced" ? <AdvancedTab onApplied={() => load()} /> : null}
    </div>
  );
}

function SourcesTab({
  sources,
  search,
  setSearch,
  activeFilter,
  loading,
  load,
  manage,
}: {
  sources: SourceRow[];
  search: string;
  setSearch: (value: string) => void;
  activeFilter: number;
  loading: boolean;
  load: (filterIndex?: number, term?: string) => Promise<void>;
  manage: (payload: Record<string, unknown>) => Promise<void>;
}) {
  return (
    <div className="space-y-8 pt-6">
      <QuickAdd manage={manage} />

      <section>
        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            className="input"
            placeholder="Search by name or domain"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void load(activeFilter, search);
            }}
          />
          <button type="button" className="btn-secondary shrink-0" onClick={() => void load(activeFilter, search)}>
            Search
          </button>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {FILTERS.map((filter, index) => (
            <button
              key={filter.label}
              type="button"
              aria-pressed={activeFilter === index}
              onClick={() => void load(index, search)}
              className={activeFilter === index ? "tag tag-official" : "tag tag-neutral"}
            >
              {filter.label}
            </button>
          ))}
        </div>

        <p className="muted mt-3 text-xs">{loading ? "Loading…" : `${sources.length} sources`}</p>
        <div className="mt-3 grid gap-3">
          {sources.map((source) => (
            <SourceAdminCard key={`${source.id}:${source.isEnabled}:${source.adminRankPenalty}:${source.adminHealthOverride ?? "AUTO"}:${source.name}`} source={source} manage={manage} />
          ))}
          {sources.length === 0 ? <p className="muted">No sources match.</p> : null}
        </div>
      </section>
    </div>
  );
}

function QuickAdd({ manage }: { manage: (payload: Record<string, unknown>) => Promise<void> }) {
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [sourceType, setSourceType] = useState("UNVERIFIED");
  const [accessType, setAccessType] = useState("UNKNOWN");
  const [anime, setAnime] = useState(false);
  const [movies, setMovies] = useState(false);
  const [tv, setTv] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function submit() {
    if (!url.trim() || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      await manage({
        action: "quick-add",
        homepageUrl: url.trim(),
        name: name.trim() || undefined,
        sourceType,
        accessType,
        supportsAnime: anime,
        supportsMovies: movies,
        supportsTv: tv,
        isEnabled: enabled,
      });
      setUrl("");
      setName("");
      setMessage("Source saved.");
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="watch-admin-panel rounded-[24px] border border-border p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-bold">Quick Add Source</h2>
          <p className="muted mt-1">Paste one website. JSON is only for bulk work now.</p>
        </div>
        <span className="tag tag-unverified">Manual review</span>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <input className="input" placeholder="https://example.com" value={url} onChange={(e) => setUrl(e.target.value)} />
        <input className="input" placeholder="Name (optional)" value={name} onChange={(e) => setName(e.target.value)} />
        <select className="input" value={sourceType} onChange={(e) => setSourceType(e.target.value)}>
          {SOURCE_TYPES.map((value) => <option key={value}>{value}</option>)}
        </select>
        <select className="input" value={accessType} onChange={(e) => setAccessType(e.target.value)}>
          {ACCESS_TYPES.map((value) => <option key={value}>{value}</option>)}
        </select>
      </div>
      <div className="mt-4 flex flex-wrap gap-4 text-sm font-bold">
        <Check label="Anime" checked={anime} onChange={setAnime} />
        <Check label="Movies" checked={movies} onChange={setMovies} />
        <Check label="TV" checked={tv} onChange={setTv} />
        <span className="muted text-xs">Leave Anime, Movies, and TV unchecked if you are not sure.</span>
        <Check label="Enable immediately" checked={enabled} onChange={setEnabled} />
      </div>
      <div className="mt-4 flex items-center gap-3">
        <button type="button" className="btn-primary" disabled={busy || !url.trim()} onClick={() => void submit()}>
          {busy ? "Saving…" : "Add Source"}
        </button>
        {message ? <p className="muted text-xs">{message}</p> : null}
      </div>
    </section>
  );
}

function SourceAdminCard({ source, manage }: { source: SourceRow; manage: (payload: Record<string, unknown>) => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(source);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stats = source.stats;

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await manage({ action: "edit", ...draft, sourceId: source.id });
      setEditing(false);
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="watch-admin-panel rounded-[22px] border border-border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-display font-bold">{source.name}</p>
          <p className="muted truncate text-xs">{source.domain}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {source.supportsAnime ? <span className="tag tag-anime">Anime</span> : null}
            {source.supportsMovies ? <span className="tag tag-movie">Movies</span> : null}
            {source.supportsTv ? <span className="tag tag-tv">TV</span> : null}
            {!source.supportsAnime && !source.supportsMovies && !source.supportsTv ? <span className="tag tag-neutral">Type not set</span> : null}
            <span className={`tag ${sourceTypeClass(source.sourceType)}`}>{pretty(source.sourceType)}</span>
            <span className={`tag ${accessClass(source.accessType)}`}>{pretty(source.accessType)}</span>
            {stats ? <span className={`tag ${stats.healthStatus === "HEALTHY" ? "tag-free" : stats.healthStatus === "WATCH" ? "tag-rent" : "tag-broken"}`}>{healthText(stats.healthStatus)}</span> : null}
          </div>
          <p className="muted mt-2 text-xs">
            👍 {stats?.likes ?? 0} · 👎 {stats?.dislikes ?? 0}
            {stats?.reliabilityPercent !== null && stats?.reliabilityPercent !== undefined ? ` · ${stats.reliabilityPercent}% working` : " · no working signal"}
            {stats?.brokenRecent ? ` · ${stats.brokenRecent} recent broken` : ""}
          </p>
          {source.adminRankPenalty > 0 || source.adminHealthOverride ? (
            <p className="mt-2 text-xs font-bold text-[#ffd18a]">
              Admin: {source.adminRankPenalty > 0 ? `ranking lowered ${source.adminRankPenalty}` : ""}
              {source.adminRankPenalty > 0 && source.adminHealthOverride ? " · " : ""}
              {source.adminHealthOverride ? `status ${source.adminHealthOverride.toLowerCase()}` : ""}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <span className={source.isEnabled ? "tag tag-free" : "tag tag-neutral"}>{source.isEnabled ? "Enabled" : "Removed"}</span>
          <button type="button" className="btn-secondary px-3 py-1.5 text-xs" onClick={() => setEditing((v) => !v)}>Edit</button>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2 border-t border-border/80 pt-3">
        <button type="button" className="btn-secondary min-h-[40px] px-3 text-xs" onClick={() => void manage({ action: "admin-control", sourceId: source.id, adminRankPenalty: source.adminRankPenalty > 0 ? 0 : 25, adminHealthOverride: source.adminHealthOverride })}>
          {source.adminRankPenalty > 0 ? "Restore rank" : "Lower ranking"}
        </button>
        <button type="button" className="btn-secondary min-h-[40px] px-3 text-xs" onClick={() => void manage({ action: "admin-control", sourceId: source.id, adminRankPenalty: source.adminRankPenalty, adminHealthOverride: source.adminHealthOverride === "DOWN" ? null : "DOWN" })}>
          {source.adminHealthOverride === "DOWN" ? "Clear not-working" : "Mark not working"}
        </button>
        <button type="button" className="btn-secondary min-h-[40px] px-3 text-xs" onClick={() => void manage({ action: "edit", sourceId: source.id, name: source.name, sourceType: source.sourceType, accessType: source.accessType, supportsAnime: source.supportsAnime, supportsMovies: source.supportsMovies, supportsTv: source.supportsTv, isEnabled: !source.isEnabled, adminRankPenalty: source.adminRankPenalty, adminHealthOverride: source.adminHealthOverride })}>
          {source.isEnabled ? "Remove from directory" : "Restore to directory"}
        </button>
        {(source.adminRankPenalty > 0 || source.adminHealthOverride) ? (
          <button type="button" className="text-xs font-bold text-text-secondary hover:text-text-primary" onClick={() => void manage({ action: "admin-control", sourceId: source.id, adminRankPenalty: 0, adminHealthOverride: null })}>Reset admin controls</button>
        ) : null}
      </div>

      {editing ? (
        <div className="mt-4 rounded-2xl border border-border bg-background/45 p-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <input className="input sm:col-span-3" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            <select className="input" value={draft.sourceType} onChange={(e) => setDraft({ ...draft, sourceType: e.target.value })}>{SOURCE_TYPES.map((v) => <option key={v}>{v}</option>)}</select>
            <select className="input" value={draft.accessType} onChange={(e) => setDraft({ ...draft, accessType: e.target.value })}>{ACCESS_TYPES.map((v) => <option key={v}>{v}</option>)}</select>
            <div className="flex items-center gap-3 px-2"><Check label="Enabled" checked={draft.isEnabled} onChange={(v) => setDraft({ ...draft, isEnabled: v })} /></div>
          </div>
          <div className="mt-3 flex flex-wrap gap-4 text-sm font-bold">
            <Check label="Anime" checked={draft.supportsAnime} onChange={(v) => setDraft({ ...draft, supportsAnime: v })} />
            <Check label="Movies" checked={draft.supportsMovies} onChange={(v) => setDraft({ ...draft, supportsMovies: v })} />
            <Check label="TV" checked={draft.supportsTv} onChange={(v) => setDraft({ ...draft, supportsTv: v })} />
          </div>
          <button type="button" className="btn-primary mt-4" disabled={busy} onClick={() => void save()}>{busy ? "Saving…" : "Save"}</button>
          {error ? <p className="mt-2 text-xs font-bold text-status-live">{error}</p> : null}
        </div>
      ) : null}
    </article>
  );
}

function SuggestionsTab({ rows, manage }: { rows: CandidateRow[]; manage: (payload: Record<string, unknown>) => Promise<void> }) {
  if (!rows.length) return <p className="muted pt-6">No pending suggestions.</p>;
  return (
    <div className="grid gap-3 pt-6">
      {rows.map((row) => <SuggestionCard key={row.id} row={row} manage={manage} />)}
    </div>
  );
}

function SuggestionCard({ row, manage }: { row: CandidateRow; manage: (payload: Record<string, unknown>) => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [sourceType, setSourceType] = useState("UNVERIFIED");
  const [anime, setAnime] = useState(row.supportsAnime);
  const [movies, setMovies] = useState(row.supportsMovies);
  const [tv, setTv] = useState(row.supportsTv);
  const [error, setError] = useState<string | null>(null);

  async function action(kind: "approve" | "reject") {
    setBusy(true);
    setError(null);
    try {
      await manage(kind === "approve" ? {
        action: "approve",
        candidateId: row.id,
        sourceType,
        supportsAnime: anime,
        supportsMovies: movies,
        supportsTv: tv,
      } : { action: "reject", candidateId: row.id });
    } catch (caught) {
      setError((caught as Error).message);
    } finally { setBusy(false); }
  }

  return (
    <article className="watch-admin-panel rounded-[22px] border border-border p-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="font-display font-bold">{row.suggestedName}</p>
          <p className="muted text-xs">{row.domain}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {anime ? <span className="tag tag-anime">Anime</span> : null}
            {movies ? <span className="tag tag-movie">Movies</span> : null}
            {tv ? <span className="tag tag-tv">TV</span> : null}
            {!anime && !movies && !tv ? <span className="tag tag-neutral">Type not set</span> : null}
            {row.guildId ? <span className="tag tag-community">From server</span> : <span className="tag tag-neutral">From website</span>}
          </div>
          {row.mediaTitle ? <p className="muted mt-2 text-xs">Title: {row.mediaTitle}</p> : null}
          {row.comment ? <p className="mt-2 text-sm text-text-secondary">“{row.comment}”</p> : null}
          <a href={row.homepageUrl} target="_blank" rel="noopener noreferrer nofollow" className="mt-2 inline-block text-xs font-bold text-primary hover:text-primary-hover">Open suggested site ↗</a>
        </div>

        <div className="w-full rounded-2xl border border-border bg-background/45 p-3 sm:w-[310px]">
          <p className="text-xs font-bold">Review before approving</p>
          <select className="input mt-2" value={sourceType} onChange={(event) => setSourceType(event.target.value)}>
            {SOURCE_TYPES.map((value) => <option key={value}>{value}</option>)}
          </select>
          <div className="mt-3 flex flex-wrap gap-3 text-xs font-bold">
            <Check label="Anime" checked={anime} onChange={setAnime} />
            <Check label="Movies" checked={movies} onChange={setMovies} />
            <Check label="TV" checked={tv} onChange={setTv} />
          </div>
          <div className="mt-3 flex gap-2">
            <button type="button" className="btn-primary" disabled={busy} onClick={() => void action("approve")}>Approve</button>
            <button type="button" className="btn-secondary" disabled={busy} onClick={() => void action("reject")}>Reject</button>
          </div>
          {error ? <p className="mt-2 text-xs font-bold text-status-live">{error}</p> : null}
        </div>
      </div>
    </article>
  );
}

function ReportsTab({ rows, sources, manage }: { rows: ReportRow[]; sources: SourceRow[]; manage: (payload: Record<string, unknown>) => Promise<void> }) {
  const sourceById = useMemo(() => new Map(sources.map((source) => [source.id, source])), [sources]);
  if (!rows.length) return <p className="muted pt-6">No open reports.</p>;
  return (
    <div className="grid gap-3 pt-6">
      {rows.map((row) => {
        const source = row.watchSourceId ? sourceById.get(row.watchSourceId) : undefined;
        return (
          <article key={row.id} className="watch-admin-panel rounded-[22px] border border-border p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-display font-bold">{row.name ?? "Reported source"}</p>
                <p className="muted text-xs">{row.domain ?? "Unknown domain"}</p>
                <div className="mt-2 flex gap-2"><span className="tag tag-broken">{row.reason}</span></div>
                {row.details ? <p className="muted mt-2 text-xs">{row.details}</p> : null}
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" className="btn-secondary" onClick={() => void manage({ action: "resolve-report", reportId: row.id })}>Keep / Resolve</button>
                {row.serverWatchPostId ? (
                  <button type="button" className="btn-secondary" onClick={() => void manage({ action: "hide-post", postId: row.serverWatchPostId }).then(() => manage({ action: "resolve-report", reportId: row.id }))}>Hide post</button>
                ) : source ? (
                  <button type="button" className="btn-secondary" onClick={() => void manage({ action: "edit", sourceId: source.id, name: source.name, sourceType: source.sourceType, accessType: source.accessType, supportsAnime: source.supportsAnime, supportsMovies: source.supportsMovies, supportsTv: source.supportsTv, isEnabled: false }).then(() => manage({ action: "resolve-report", reportId: row.id }))}>Disable source</button>
                ) : null}
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}

function AdvancedTab({ onApplied }: { onApplied: () => Promise<void> | void }) {
  return (
    <div className="space-y-10 pt-6">
      <ImportPanel heading="Bulk Import Sources" description="Paste source-registry JSON or CSV. Preview writes nothing." placeholder={'[{ "name": "Example", "domain": "example.com" }]'} kind="sources" onApplied={onApplied} />
      <ImportPanel heading="Title Availability Import" description="Attach an existing source domain to a specific canonical Couchlist title." placeholder={'[{ "contentKey": "TMDB:MOVIE:123", "domain": "example.com", "availabilityUrl": "https://example.com/title" }]'} kind="availability" />
    </div>
  );
}

function ImportPanel({ heading, description, placeholder, kind, onApplied }: { heading: string; description: string; placeholder: string; kind: "sources" | "availability"; onApplied?: () => Promise<void> | void }) {
  const [input, setInput] = useState("");
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function runImport(apply: boolean) {
    if (busy || !input.trim()) return;
    setBusy(true); setError(null);
    try {
      const response = await fetch("/api/dev/watch-sources", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ input, apply, kind }) });
      const payload = (await response.json()) as PreviewResult & { error?: { message?: string } };
      if (!response.ok) { setError(payload.error?.message ?? "Import failed."); return; }
      setPreview(payload); if (apply) await onApplied?.();
    } catch { setError("Could not reach Couchlist."); } finally { setBusy(false); }
  }
  return (
    <section>
      <h2 className="font-display text-lg font-bold">{heading}</h2>
      <p className="muted mt-1">{description}</p>
      <textarea className="input mt-3 min-h-[200px] font-mono text-xs" placeholder={placeholder} value={input} onChange={(e) => { setInput(e.target.value); setPreview(null); }} />
      <div className="mt-3 flex gap-2"><button type="button" className="btn-secondary" disabled={busy || !input.trim()} onClick={() => void runImport(false)}>Preview</button><button type="button" className="btn-primary" disabled={busy || !preview || preview.applied} onClick={() => void runImport(true)}>Apply Import</button></div>
      {error ? <p className="mt-3 text-sm font-bold text-status-live">{error}</p> : null}
      {preview ? <div className="watch-admin-panel mt-4 rounded-2xl border border-border p-4"><p className="font-bold">{preview.applied ? "Import applied" : "Preview"}</p><p className="muted mt-2 text-xs">Rows {preview.rows} · New {preview.create} · Updates {preview.update} · Invalid {preview.invalid.length} · Failed {preview.failed?.length ?? 0}</p></div> : null}
    </section>
  );
}

function sourceTypeClass(value: string) { if (value === "OFFICIAL") return "tag-official"; if (value === "COMMUNITY") return "tag-community"; if (value === "UNVERIFIED") return "tag-unverified"; if (value === "RENT_BUY") return "tag-rent"; if (value === "LIBRARY") return "tag-library"; if (value === "PUBLIC_DOMAIN" || value === "FREE_AD_SUPPORTED") return "tag-free"; return "tag-neutral"; }
function accessClass(value: string) { if (value === "FREE" || value === "FREE_WITH_ADS") return "tag-free"; if (value === "SUBSCRIPTION") return "tag-subscription"; if (value === "RENT" || value === "BUY") return "tag-rent"; if (value === "LIBRARY_CARD") return "tag-library"; return "tag-neutral"; }
function pretty(value: string) { return value.toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase()); }

function healthText(value: string) { if (value === "POSSIBLY_UNAVAILABLE") return "Possibly unavailable"; if (value === "DEGRADED") return "Degraded"; if (value === "WATCH") return "Some issues"; return "Healthy"; }

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <label className="inline-flex items-center gap-2"><input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />{label}</label>;
}
