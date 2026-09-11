'use client';

import { useMemo, useState } from 'react';
import { SourceSiteIcon } from './source-site-icon';
import { SourceSafetyNote } from './source-safety-note';

export interface GlobalSourceItem {
  id: string;
  name: string;
  domain: string;
  homepageUrl: string;
  sourceType: string;
  accessType: string;
  supportsAnime: boolean;
  supportsMovies: boolean;
  supportsTv: boolean;
  likes: number;
  dislikes: number;
  likePercent: number | null;
  sentimentScore: number;
  reliabilityPercent: number | null;
  workingRecent: number;
  brokenRecent: number;
  healthStatus: 'HEALTHY' | 'WATCH' | 'DEGRADED' | 'POSSIBLY_UNAVAILABLE';
  discoveredAt: string | null;
}

type Filter = 'ALL' | 'ANIME' | 'MOVIES' | 'TV' | 'OFFICIAL' | 'COMMUNITY' | 'UNVERIFIED' | 'FREE' | 'SUBSCRIPTION' | 'RENT_BUY';
type Sort = 'LIKED' | 'VOTES' | 'WORKING' | 'NEW';

export function GlobalSourcesDirectory({ sources, canVote }: { sources: GlobalSourceItem[]; canVote: boolean }) {
  const [directorySources, setDirectorySources] = useState(sources);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('ALL');
  const [sort, setSort] = useState<Sort>('LIKED');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return directorySources
      .filter((source) => {
        if (q && !`${source.name} ${source.domain}`.toLowerCase().includes(q)) return false;
        if (filter === 'ANIME') return source.supportsAnime;
        if (filter === 'MOVIES') return source.supportsMovies;
        if (filter === 'TV') return source.supportsTv;
        if (filter === 'OFFICIAL') return source.sourceType === 'OFFICIAL';
        if (filter === 'COMMUNITY') return source.sourceType === 'COMMUNITY';
        if (filter === 'UNVERIFIED') return source.sourceType === 'UNVERIFIED';
        if (filter === 'FREE') return source.accessType === 'FREE' || source.accessType === 'FREE_WITH_ADS';
        if (filter === 'SUBSCRIPTION') return source.accessType === 'SUBSCRIPTION';
        if (filter === 'RENT_BUY') return source.accessType === 'RENT' || source.accessType === 'BUY' || source.sourceType === 'RENT_BUY';
        return true;
      })
      .sort((a, b) => {
        if (sort === 'VOTES') return (b.likes + b.dislikes) - (a.likes + a.dislikes) || b.sentimentScore - a.sentimentScore;
        if (sort === 'WORKING') return b.workingRecent - a.workingRecent || (b.reliabilityPercent ?? -1) - (a.reliabilityPercent ?? -1) || b.sentimentScore - a.sentimentScore;
        if (sort === 'NEW') return Date.parse(b.discoveredAt ?? '0') - Date.parse(a.discoveredAt ?? '0');
        return b.sentimentScore - a.sentimentScore || b.likes - a.likes || a.dislikes - b.dislikes;
      });
  }, [directorySources, query, filter, sort]);

  return (
    <div className="mt-6">
      <div className="source-directory-tools">
        <input
          className="input source-directory-search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search sources…"
          aria-label="Search source directory"
        />

        <div className="source-directory-filter-scroller" aria-label="Filter sources">
          {FILTERS.map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setFilter(value)}
              className={filter === value ? 'source-filter-chip source-filter-chip-active' : 'source-filter-chip'}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="source-directory-sort-compact">
          <label htmlFor="source-sort">Sort</label>
          <select id="source-sort" value={sort} onChange={(event) => setSort(event.target.value as Sort)}>
            {SORTS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          {(filter !== 'ALL' || query) ? (
            <button type="button" className="source-clear-button" onClick={() => { setFilter('ALL'); setQuery(''); }}>Clear</button>
          ) : null}
        </div>
      </div>

      <SourceSafetyNote />

      <div className="source-directory-count">
        <strong>{filtered.length}</strong> source{filtered.length === 1 ? '' : 's'}
      </div>

      {filtered.length ? (
        <div className="source-directory-list">
          {filtered.map((source) => (
            <SourceDirectoryRow
              key={source.id}
              source={source}
              canVote={canVote}
              onStats={(next) => setDirectorySources((current) => current.map((item) => item.id === source.id ? { ...item, ...next } : item))}
            />
          ))}
        </div>
      ) : (
        <div className="source-directory-empty">
          <p className="font-display font-bold">No matching sources.</p>
          <p className="muted mt-1">Try another search or filter.</p>
        </div>
      )}

      <PublicSuggestion />
    </div>
  );
}

const FILTERS: Array<[Filter, string]> = [
  ['ALL', 'All'], ['ANIME', 'Anime'], ['MOVIES', 'Movies'], ['TV', 'TV'],
  ['OFFICIAL', 'Official'], ['COMMUNITY', 'Community'], ['UNVERIFIED', 'Unverified'],
  ['FREE', 'Free'], ['SUBSCRIPTION', 'Subscription'], ['RENT_BUY', 'Rent / Buy'],
];
const SORTS: Array<[Sort, string]> = [['LIKED', 'Most liked'], ['VOTES', 'Most votes'], ['WORKING', 'Recently working'], ['NEW', 'Newest']];

function SourceDirectoryRow({
  source,
  canVote,
  onStats,
}: {
  source: GlobalSourceItem;
  canVote: boolean;
  onStats: (stats: Partial<GlobalSourceItem>) => void;
}) {
  const [likes, setLikes] = useState(source.likes);
  const [dislikes, setDislikes] = useState(source.dislikes);
  const [busy, setBusy] = useState(false);
  const health = healthMeta(source.healthStatus, source.workingRecent + source.brokenRecent);

  async function react(reaction: 'LIKE' | 'DISLIKE') {
    if (!canVote || busy) return;
    setBusy(true);
    try {
      const response = await fetch('/api/watch/feedback', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'react', sourceId: source.id, reaction }),
      });
      if (!response.ok) return;
      const payload = (await response.json()) as { stats?: { likes?: number; dislikes?: number; likePercent?: number | null; sentimentScore?: number } | null };
      const nextLikes = payload.stats?.likes ?? likes;
      const nextDislikes = payload.stats?.dislikes ?? dislikes;
      setLikes(nextLikes);
      setDislikes(nextDislikes);
      onStats({
        likes: nextLikes,
        dislikes: nextDislikes,
        likePercent: payload.stats?.likePercent ?? source.likePercent,
        sentimentScore: payload.stats?.sentimentScore ?? source.sentimentScore,
      });
    } finally {
      setBusy(false);
    }
  }

  const metadata = [
    ...mediaLabels(source),
    pretty(source.sourceType),
    ...(source.accessType !== 'UNKNOWN' ? [pretty(source.accessType)] : []),
  ];

  return (
    <article className="source-directory-row">
      <div className="source-directory-main">
        <SourceSiteIcon domain={source.domain} name={source.name} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="source-directory-title-line">
            <a className="source-directory-name" href={source.homepageUrl} target="_blank" rel="noopener noreferrer nofollow">{source.name}</a>
            <span className={`source-health source-health-${health.tone}`}><span aria-hidden="true">•</span>{health.label}</span>
          </div>
          <p className="source-directory-domain">{source.domain}</p>
          <p className="source-directory-meta">{metadata.join(' · ') || 'Type not set'}</p>
          <p className="source-directory-reliability">{reliabilityText(source)}</p>
        </div>
      </div>

      <div className="source-directory-actions">
        {canVote ? (
          <>
            <button type="button" disabled={busy} className="source-vote-button" onClick={() => void react('LIKE')} aria-label={`Like ${source.name}`}><span aria-hidden="true">👍</span><span>{likes}</span></button>
            <button type="button" disabled={busy} className="source-vote-button" onClick={() => void react('DISLIKE')} aria-label={`Dislike ${source.name}`}><span aria-hidden="true">👎</span><span>{dislikes}</span></button>
          </>
        ) : (
          <>
            <a className="source-vote-button" href="/api/auth/login" title="Sign in to like"><span aria-hidden="true">👍</span><span>{likes}</span></a>
            <a className="source-vote-button" href="/api/auth/login" title="Sign in to dislike"><span aria-hidden="true">👎</span><span>{dislikes}</span></a>
          </>
        )}
        <a className="source-open-button" href={source.homepageUrl} target="_blank" rel="noopener noreferrer nofollow">Open <span aria-hidden="true">↗</span></a>
      </div>
    </article>
  );
}

function PublicSuggestion() {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState('');
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const [anime, setAnime] = useState(false);
  const [movies, setMovies] = useState(false);
  const [tv, setTv] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function submit() {
    if (!url.trim() || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch('/api/watch/suggest', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          homepageUrl: url.trim(),
          suggestedName: name.trim() || undefined,
          comment: note.trim() || undefined,
          supportsAnime: anime,
          supportsMovies: movies,
          supportsTv: tv,
        }),
      });
      const payload = (await response.json().catch(() => null)) as { accepted?: boolean; error?: { message?: string } } | null;
      if (!response.ok) setMessage(payload?.error?.message ?? 'Could not send suggestion.');
      else if (payload?.accepted === false) setMessage('That source is already waiting for review.');
      else {
        setUrl(''); setName(''); setNote(''); setAnime(false); setMovies(false); setTv(false);
        setMessage('Suggestion sent for review.');
      }
    } catch {
      setMessage('Could not reach Couchlist.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="source-suggestion-box mt-7" id="suggest-source">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-bold">Know another source?</h2>
          <p className="muted mt-1">Send the website. An admin reviews it before it is added.</p>
        </div>
        <button type="button" className="source-suggest-toggle" onClick={() => setOpen((value) => !value)}>{open ? 'Close' : 'Suggest a source'}</button>
      </div>
      {open ? (
        <div className="mt-4 grid gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <input className="input" placeholder="https://example.com" value={url} onChange={(event) => setUrl(event.target.value)} />
            <input className="input" placeholder="Name (optional)" value={name} onChange={(event) => setName(event.target.value)} />
          </div>
          <div className="flex flex-wrap gap-4 text-sm font-bold">
            <Check label="Anime" checked={anime} onChange={setAnime} />
            <Check label="Movies" checked={movies} onChange={setMovies} />
            <Check label="TV" checked={tv} onChange={setTv} />
          </div>
          <input className="input" placeholder="Short note (optional)" value={note} onChange={(event) => setNote(event.target.value)} />
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className="btn-primary min-h-[44px]" disabled={busy || !url.trim()} onClick={() => void submit()}>{busy ? 'Sending…' : 'Submit suggestion'}</button>
            {message ? <p className="muted text-xs">{message}</p> : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <label className="inline-flex items-center gap-2"><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />{label}</label>;
}

function healthMeta(value: GlobalSourceItem['healthStatus'], signalCount: number) {
  if (value === 'POSSIBLY_UNAVAILABLE') return { label: 'Not working', tone: 'broken' };
  if (value === 'DEGRADED') return { label: 'Issues reported', tone: 'broken' };
  if (signalCount === 0) return { label: 'No signal yet', tone: 'neutral' };
  if (value === 'WATCH') return { label: 'Some issues', tone: 'watch' };
  return { label: 'Working', tone: 'working' };
}

function mediaLabels(source: GlobalSourceItem): string[] {
  const values: string[] = [];
  if (source.supportsAnime) values.push('Anime');
  if (source.supportsMovies) values.push('Movies');
  if (source.supportsTv) values.push('TV');
  return values;
}

function reliabilityText(source: GlobalSourceItem): string {
  if (source.reliabilityPercent === null) return 'No working reports yet';
  return `${source.reliabilityPercent}% working from recent reports`;
}

function pretty(value: string) {
  return value.toLowerCase().replaceAll('_', ' ').replace(/\b\w/g, (character) => character.toUpperCase());
}
