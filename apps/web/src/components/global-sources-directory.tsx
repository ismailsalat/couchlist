'use client';

import { useMemo, useState } from 'react';
import { SourceSiteIcon } from './source-site-icon';

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
    <div className="mt-7">
      <div className="source-directory-tools">
        <input
          className="input source-directory-search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search sources…"
          aria-label="Search source directory"
        />

        <div className="source-directory-filter-row" aria-label="Filter sources">
          {FILTERS.map(([value, label, tone]) => (
            <button key={value} type="button" onClick={() => setFilter(value)} className={filter === value ? `tag ${tone}` : 'tag tag-neutral'}>
              {label}
            </button>
          ))}
        </div>

        <div className="source-directory-sort-row">
          <span className="text-xs font-black text-text-secondary">Sort</span>
          {SORTS.map(([value, label]) => (
            <button key={value} type="button" onClick={() => setSort(value)} className={sort === value ? 'tag tag-official' : 'tag tag-neutral'}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-5 flex items-center justify-between gap-3">
        <p className="font-display text-lg font-bold">{filtered.length} source{filtered.length === 1 ? '' : 's'}</p>
        {filter !== 'ALL' || query ? (
          <button type="button" className="text-xs font-bold text-primary hover:text-primary-hover" onClick={() => { setFilter('ALL'); setQuery(''); }}>
            Clear
          </button>
        ) : null}
      </div>

      {filtered.length ? (
        <div className="source-directory-list mt-3">
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
        <div className="mt-4 rounded-2xl border border-border bg-card/75 p-6 text-center">
          <p className="font-display font-bold">No matching sources.</p>
          <p className="muted mt-1">Try another search or filter.</p>
        </div>
      )}

      <PublicSuggestion />
    </div>
  );
}

const FILTERS: Array<[Filter, string, string]> = [
  ['ALL', 'All', 'tag-official'], ['ANIME', 'Anime', 'tag-anime'], ['MOVIES', 'Movies', 'tag-movie'], ['TV', 'TV', 'tag-tv'],
  ['OFFICIAL', 'Official', 'tag-official'], ['COMMUNITY', 'Community', 'tag-community'], ['UNVERIFIED', 'Unverified', 'tag-unverified'],
  ['FREE', 'Free', 'tag-free'], ['SUBSCRIPTION', 'Subscription', 'tag-subscription'], ['RENT_BUY', 'Rent / Buy', 'tag-rent'],
];
const SORTS: Array<[Sort, string]> = [['LIKED', 'Most Liked'], ['VOTES', 'Most Votes'], ['WORKING', 'Recently Working'], ['NEW', 'Newest']];

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
    if (!canVote) return;
    if (busy) return;
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

  return (
    <article className="source-directory-row">
      <a className="source-directory-main source-directory-primary-link" href={source.homepageUrl} target="_blank" rel="noopener noreferrer nofollow">
        <SourceSiteIcon domain={source.domain} name={source.name} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate font-display text-lg font-bold">{source.name}</h2>
            <span className={`tag ${health.tone}`}>{health.label}</span>
          </div>
          <p className="muted truncate text-xs">{source.domain}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {source.supportsAnime ? <span className="tag tag-anime">Anime</span> : null}
            {source.supportsMovies ? <span className="tag tag-movie">Movies</span> : null}
            {source.supportsTv ? <span className="tag tag-tv">TV</span> : null}
            {!source.supportsAnime && !source.supportsMovies && !source.supportsTv ? <span className="tag tag-neutral">Type not set</span> : null}
            <span className={`tag ${sourceTypeTone(source.sourceType)}`}>{pretty(source.sourceType)}</span>
            {source.accessType !== 'UNKNOWN' ? <span className={`tag ${accessTone(source.accessType)}`}>{pretty(source.accessType)}</span> : null}
          </div>
          <p className="mt-2 text-xs text-text-secondary">
            {source.reliabilityPercent === null
              ? 'No working reports yet'
              : `${source.reliabilityPercent}% working · ${source.workingRecent} working · ${source.brokenRecent} not working`}
          </p>
        </div>
      </a>

      <div className="source-directory-actions">
        {canVote ? (
          <>
            <button type="button" disabled={busy} className="source-vote-button" onClick={() => void react('LIKE')} aria-label={`Like ${source.name}`}>
              <span aria-hidden="true">👍</span><span>{likes}</span>
            </button>
            <button type="button" disabled={busy} className="source-vote-button" onClick={() => void react('DISLIKE')} aria-label={`Dislike ${source.name}`}>
              <span aria-hidden="true">👎</span><span>{dislikes}</span>
            </button>
          </>
        ) : (
          <>
            <a className="source-vote-button" href="/api/auth/login" title="Sign in to like"><span aria-hidden="true">👍</span><span>{likes}</span></a>
            <a className="source-vote-button" href="/api/auth/login" title="Sign in to dislike"><span aria-hidden="true">👎</span><span>{dislikes}</span></a>
          </>
        )}
        <a className="source-open-button" href={source.homepageUrl} target="_blank" rel="noopener noreferrer nofollow">
          Open source <span aria-hidden="true">↗</span>
        </a>
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
      if (!response.ok) {
        setMessage(payload?.error?.message ?? 'Could not send suggestion.');
      } else if (payload?.accepted === false) {
        setMessage('That source is already waiting for review.');
      } else {
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
    <section className="source-suggestion-box mt-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-bold">Know another source?</h2>
          <p className="muted mt-1">Send the website. It stays pending until an admin reviews it.</p>
        </div>
        <button type="button" className="btn-secondary min-h-[46px]" onClick={() => setOpen((value) => !value)}>{open ? 'Close' : 'Suggest a source'}</button>
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
            <button type="button" className="btn-primary min-h-[46px]" disabled={busy || !url.trim()} onClick={() => void submit()}>{busy ? 'Sending…' : 'Submit suggestion'}</button>
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
  if (value === 'POSSIBLY_UNAVAILABLE') return { label: 'Not working', tone: 'tag-broken' };
  if (value === 'DEGRADED') return { label: 'Issues reported', tone: 'tag-broken' };
  if (signalCount === 0) return { label: 'No signal yet', tone: 'tag-neutral' };
  if (value === 'WATCH') return { label: 'Some issues', tone: 'tag-rent' };
  return { label: 'Working', tone: 'tag-free' };
}
function sourceTypeTone(value: string) { return value === 'OFFICIAL' ? 'tag-official' : value === 'COMMUNITY' ? 'tag-community' : value === 'UNVERIFIED' ? 'tag-unverified' : value === 'RENT_BUY' ? 'tag-rent' : value === 'LIBRARY' ? 'tag-library' : value === 'PUBLIC_DOMAIN' || value === 'FREE_AD_SUPPORTED' ? 'tag-free' : 'tag-neutral'; }
function accessTone(value: string) { return value === 'FREE' || value === 'FREE_WITH_ADS' ? 'tag-free' : value === 'SUBSCRIPTION' ? 'tag-subscription' : value === 'RENT' || value === 'BUY' ? 'tag-rent' : 'tag-neutral'; }
function pretty(value: string) { return value.toLowerCase().replaceAll('_', ' ').replace(/\b\w/g, (character) => character.toUpperCase()); }
