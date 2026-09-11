"use client";

import { useMemo, useState } from "react";
import { MediaTypeMark } from "./media-thumbnail";
import { SourceSafetyNote } from "./source-safety-note";

export interface ServerSourcePost {
  id: string;
  guildId: string;
  userId: string;
  username: string;
  globalName: string | null;
  avatarUrl: string | null;
  watchSourceId: string | null;
  sourceName: string | null;
  sourceType: string | null;
  accessType: string | null;
  domain: string;
  homepageUrl: string;
  suggestedName: string;
  comment: string | null;
  mediaTitle: string | null;
  mediaType: "ANIME" | "MOVIE" | "TV" | null;
  supportsAnime: boolean;
  supportsMovies: boolean;
  supportsTv: boolean;
  createdAt: string;
  ratingAverage: number | null;
  ratingCount: number;
  overallRatingAverage: number | null;
  overallRatingCount: number;
  reliabilityPercent: number | null;
  workingRecent: number;
  brokenRecent: number;
  healthStatus: "HEALTHY" | "WATCH" | "DEGRADED" | "POSSIBLY_UNAVAILABLE";
  weightedScore: number;
}

type Sort = "top" | "rated" | "working" | "new";
type MediaFilter = "all" | "anime" | "movies" | "tv";

export function ServerSources({
  guildDiscordId,
  initialPosts,
}: {
  guildDiscordId: string;
  initialPosts: ServerSourcePost[];
}) {
  const [posts, setPosts] = useState(initialPosts);
  const [sort, setSort] = useState<Sort>("top");
  const [mediaFilter, setMediaFilter] = useState<MediaFilter>("all");
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const sorted = useMemo(() => posts
    .filter((post) => mediaFilter === "all"
      || (mediaFilter === "anime" && post.supportsAnime)
      || (mediaFilter === "movies" && post.supportsMovies)
      || (mediaFilter === "tv" && post.supportsTv))
    .sort((a, b) => {
      if (sort === "rated") return b.ratingCount - a.ratingCount || b.weightedScore - a.weightedScore;
      if (sort === "working") return b.workingRecent - a.workingRecent || (b.reliabilityPercent ?? -1) - (a.reliabilityPercent ?? -1);
      if (sort === "new") return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      return b.weightedScore - a.weightedScore || b.ratingCount - a.ratingCount;
    }), [posts, sort, mediaFilter]);

  async function refresh() {
    const response = await fetch(`/api/server/${guildDiscordId}/sources`);
    if (!response.ok) return;
    const payload = (await response.json()) as { posts: ServerSourcePost[] };
    setPosts(payload.posts.map((post) => ({ ...post, createdAt: String(post.createdAt) })));
  }

  async function action(postId: string, payload: Record<string, unknown>) {
    if (busy) return;
    setBusy(postId);
    try {
      setMessage(null);
      const response = await fetch(`/api/server/${guildDiscordId}/sources`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = (await response.json().catch(() => null)) as { accepted?: boolean; error?: { message?: string } } | null;
      if (!response.ok) { setMessage(body?.error?.message ?? "Could not save that action."); return; }
      if (payload.action === "promote") setMessage(body?.accepted === false ? "That source is already waiting for Couchlist review." : "Sent to Couchlist for review.");
      if (payload.action === "report") setMessage("Report sent.");
      await refresh();
    } catch {
      setMessage("Could not reach Couchlist.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-bold">Sources shared by this server</h2>
          <p className="muted mt-1">Members can share where they watch. Server posts stay in this community unless someone sends one to Couchlist for review.</p>
        </div>
        <button type="button" className="btn-primary" onClick={() => setShowForm((value) => !value)}>+ Share Source</button>
      </div>

      {showForm ? <ShareSourceForm guildDiscordId={guildDiscordId} onSaved={async () => { setShowForm(false); await refresh(); }} /> : null}

      <SourceSafetyNote />

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <span className="muted mr-1 text-[11px] font-bold uppercase tracking-[0.12em]">Show</span>
        {([
          ["all", "All", "tag-official"],
          ["anime", "Anime", "tag-anime"],
          ["movies", "Movies", "tag-movie"],
          ["tv", "TV", "tag-tv"],
        ] as Array<[MediaFilter, string, string]>).map(([value, label, activeClass]) => (
          <button key={value} type="button" onClick={() => setMediaFilter(value)} className={mediaFilter === value ? `tag ${activeClass}` : "tag tag-neutral"}>{label}</button>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="muted mr-1 text-[11px] font-bold uppercase tracking-[0.12em]">Sort</span>
        {([[
          "top", "Top Rated"
        ], ["rated", "Most Rated"], ["working", "Recently Working"], ["new", "Newest"]] as Array<[Sort, string]>).map(([value, label]) => (
          <button key={value} type="button" onClick={() => setSort(value)} className={sort === value ? "tag tag-official" : "tag tag-neutral"}>{label}</button>
        ))}
      </div>
      {message ? <p className="mt-3 text-xs font-bold text-text-secondary">{message}</p> : null}

      {sorted.length ? (
        <div className="mt-4 grid gap-3">
          {sorted.map((post, index) => (
            <ServerSourceCard
              key={post.id}
              post={post}
              rank={sort === "top" ? index + 1 : null}
              busy={busy === post.id}
              onAction={(payload) => action(post.id, payload)}
            />
          ))}
        </div>
      ) : (
        <div className="watch-source-card mt-4 rounded-[22px] border p-6 text-center">
          <p className="font-display font-bold">No server sources yet.</p>
          <p className="muted mt-1">Be the first person to share a place your server uses.</p>
        </div>
      )}
    </section>
  );
}

function ShareSourceForm({ guildDiscordId, onSaved }: { guildDiscordId: string; onSaved: () => Promise<void> | void }) {
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [comment, setComment] = useState("");
  const [title, setTitle] = useState("");
  const [anime, setAnime] = useState(false);
  const [movies, setMovies] = useState(false);
  const [tv, setTv] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!url.trim() || busy) return;
    setBusy(true); setError(null);
    try {
      const response = await fetch(`/api/server/${guildDiscordId}/sources`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "share", homepageUrl: url.trim(), suggestedName: name.trim() || undefined, comment: comment.trim() || undefined, mediaTitle: title.trim() || undefined, supportsAnime: anime, supportsMovies: movies, supportsTv: tv }),
      });
      const payload = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
      if (!response.ok) { setError(payload?.error?.message ?? "Could not share this source."); return; }
      await onSaved();
    } catch { setError("Could not reach Couchlist."); } finally { setBusy(false); }
  }

  return (
    <div className="watch-source-card mt-4 rounded-[22px] border p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <input className="input" placeholder="https://example.com" value={url} onChange={(e) => setUrl(e.target.value)} />
        <input className="input" placeholder="Source name (optional)" value={name} onChange={(e) => setName(e.target.value)} />
        <input className="input" placeholder="Title (optional)" value={title} onChange={(e) => setTitle(e.target.value)} />
        <input className="input" placeholder="Short comment (optional)" value={comment} onChange={(e) => setComment(e.target.value)} />
      </div>
      <div className="mt-3 flex flex-wrap gap-4 text-sm font-bold">
        <Check label="Anime" checked={anime} onChange={setAnime} />
        <Check label="Movies" checked={movies} onChange={setMovies} />
        <Check label="TV" checked={tv} onChange={setTv} />
        {!anime && !movies && !tv ? <span className="muted text-xs">Leave blank if you are not sure.</span> : null}
      </div>
      <button type="button" className="btn-primary mt-4" disabled={busy || !url.trim()} onClick={() => void submit()}>{busy ? "Sharing…" : "Share with server"}</button>
      {error ? <p className="mt-2 text-xs font-bold text-status-live">{error}</p> : null}
    </div>
  );
}

function ServerSourceCard({ post, rank, busy, onAction }: { post: ServerSourcePost; rank: number | null; busy: boolean; onAction: (payload: Record<string, unknown>) => Promise<void> | void }) {
  const [reporting, setReporting] = useState(false);
  const healthLabel = post.healthStatus === "POSSIBLY_UNAVAILABLE" ? "Possibly unavailable" : post.healthStatus === "DEGRADED" ? "Degraded" : post.healthStatus === "WATCH" ? "Some issues" : "Healthy";
  const healthClass = post.healthStatus === "HEALTHY" ? "tag-free" : post.healthStatus === "WATCH" ? "tag-rent" : "tag-broken";
  return (
    <article className="watch-source-card rounded-[22px] border p-4 transition hover:border-primary/50">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {rank ? <span className="tag tag-rating">#{rank}</span> : null}
            <p className="font-display truncate text-base font-bold">{post.sourceName ?? post.suggestedName}</p>
            <span className={`tag ${healthClass}`}>{healthLabel}</span>
          </div>
          <p className="muted mt-0.5 truncate text-xs">{post.domain}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {post.supportsAnime ? <span className="tag tag-anime">Anime</span> : null}
            {post.supportsMovies ? <span className="tag tag-movie">Movies</span> : null}
            {post.supportsTv ? <span className="tag tag-tv">TV</span> : null}
            {!post.supportsAnime && !post.supportsMovies && !post.supportsTv ? <span className="tag tag-neutral">Type not set</span> : null}
            {post.sourceType ? <span className={`tag ${post.sourceType === "OFFICIAL" ? "tag-official" : post.sourceType === "COMMUNITY" ? "tag-community" : "tag-unverified"}`}>{pretty(post.sourceType)}</span> : <span className="tag tag-community">Server suggestion</span>}
            {post.accessType && post.accessType !== "UNKNOWN" ? <span className={`tag ${accessClass(post.accessType)}`}>{pretty(post.accessType)}</span> : null}
          </div>
          {post.mediaTitle && post.mediaType ? (
            <div className="mt-3 flex items-center gap-2 rounded-2xl border border-border/80 bg-background/45 p-2.5">
              <MediaTypeMark mediaType={post.mediaType} />
              <div className="min-w-0"><p className="muted text-[10px] font-black uppercase tracking-[0.1em]">Shared for</p><p className="truncate text-sm font-bold text-[#dbe7f7]">{post.mediaTitle}</p></div>
            </div>
          ) : post.mediaTitle ? <p className="mt-2 text-sm font-bold text-[#dbe7f7]">For: {post.mediaTitle}</p> : null}
          {post.comment ? <p className="mt-2 text-sm text-text-secondary">“{post.comment}”</p> : null}
          <p className="muted mt-2 text-xs">Suggested by {post.globalName ?? post.username}</p>
        </div>
        <a href={post.homepageUrl} target="_blank" rel="noopener noreferrer nofollow" className="btn-secondary">Open ↗</a>
      </div>

      <div className="mt-4 grid gap-3 border-t border-border/80 pt-3 sm:grid-cols-2">
        <div>
          <p className="text-xs font-bold">Your server</p>
          <p className="mt-1 text-sm"><span className="text-status-rating">★ {post.ratingAverage?.toFixed(1) ?? "—"}</span> <span className="muted">· {post.ratingCount} ratings</span></p>
          {post.watchSourceId ? <p className="muted mt-1 text-xs">Couchlist overall: ★ {post.overallRatingAverage?.toFixed(1) ?? "—"} · {post.overallRatingCount}</p> : null}
        </div>
        <div>
          <p className="text-xs font-bold">Reliability</p>
          <p className="mt-1 text-sm">{post.reliabilityPercent === null ? "No signal yet" : `${post.reliabilityPercent}% working`}</p>
          <p className="muted mt-1 text-xs">{post.workingRecent} working · {post.brokenRecent} broken in recent votes</p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="muted text-xs font-bold">Rate:</span>
        {[1,2,3,4,5].map((rating) => <button key={rating} type="button" disabled={busy} aria-label={`Rate ${rating} stars`} onClick={() => void onAction({ action: "rate", postId: post.id, rating })} className="text-lg text-status-rating transition hover:scale-110">★</button>)}
        <button type="button" disabled={busy} className="btn-secondary px-3 py-1.5 text-xs" onClick={() => void onAction({ action: "health", postId: post.id, status: "WORKING" })}>Works for me</button>
        <button type="button" disabled={busy} className="btn-secondary px-3 py-1.5 text-xs" onClick={() => void onAction({ action: "health", postId: post.id, status: "BROKEN", reason: "BROKEN_LINK" })}>Not working</button>
        <button type="button" disabled={busy} className="text-xs font-bold text-primary hover:text-primary-hover" onClick={() => void onAction({ action: "promote", postId: post.id })}>Suggest to Couchlist</button>
        <button type="button" className="text-xs font-bold text-text-secondary hover:text-status-live" onClick={() => setReporting((value) => !value)}>Report</button>
      </div>

      {reporting ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-background/50 p-3">
          {["BROKEN_LINK", "WRONG_TITLE", "UNSAFE_REDIRECT", "SPAM", "OTHER"].map((reason) => (
            <button key={reason} type="button" className="tag tag-neutral" onClick={() => { setReporting(false); void onAction({ action: "report", postId: post.id, reason }); }}>{pretty(reason)}</button>
          ))}
        </div>
      ) : null}
    </article>
  );
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <label className="inline-flex items-center gap-2"><input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />{label}</label>;
}

function accessClass(value: string) { if (value === "FREE" || value === "FREE_WITH_ADS") return "tag-free"; if (value === "RENT" || value === "BUY") return "tag-rent"; if (value === "LIBRARY_CARD") return "tag-library"; return "tag-subscription"; }

function pretty(value: string) { return value.toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase()); }
