'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import {
  BookOpen,
  Captions,
  Cast,
  CirclePlay,
  Compass,
  Languages,
  ShieldCheck,
  Wrench,
} from 'lucide-react';
import { GUIDE_TOPICS, START_HERE, START_HERE_META, type GuideTopicFilter } from '@couchlist/shared';

/**
 * The topic rail.
 *
 * A sidebar on desktop; a two-column grid of wrapping controls on a phone, as
 * in the reference. Each topic is a URL, so a topic is shareable and Back
 * returns to the previous one.
 */

const ICONS: Record<string, typeof Compass> = {
  compass: Compass,
  'shield-check': ShieldCheck,
  'circle-play': CirclePlay,
  'book-open': BookOpen,
  languages: Languages,
  captions: Captions,
  cast: Cast,
  wrench: Wrench,
};

export function GuideTopicRail({
  topic,
  counts,
}: {
  topic: GuideTopicFilter;
  counts: Record<string, number>;
}) {
  const router = useRouter();
  const params = useSearchParams();

  function select(slug: string) {
    const next = new URLSearchParams(params.toString());
    if (slug === START_HERE) next.delete('topic');
    else next.set('topic', slug);
    router.push(`/guides?${next.toString()}`, { scroll: false });
  }

  const entries = [
    { slug: START_HERE_META.slug, title: START_HERE_META.title, icon: START_HERE_META.icon, active: topic === START_HERE },
    ...GUIDE_TOPICS.map((entry) => ({
      slug: entry.slug,
      title: entry.title,
      icon: entry.icon,
      active: topic === entry.topic,
    })),
  ];

  return (
    <aside className="mb-5 border-b border-line pb-4 sm:mb-0 sm:border-b-0 sm:border-r sm:pb-0 sm:pr-4">
      <span className="hidden px-2.5 text-xs tracking-wider text-muted sm:mb-2.5 sm:block">
        FIND YOUR WAY
      </span>

      <nav aria-label="Guide topics" className="grid grid-cols-2 gap-1.5 sm:flex sm:flex-col sm:gap-1">
        {entries.map((entry) => {
          const Icon = ICONS[entry.icon] ?? Compass;
          return (
            <button
              key={entry.slug}
              type="button"
              aria-pressed={entry.active}
              onClick={() => select(entry.slug)}
              className={`cl-touch flex min-h-11 items-center gap-2 rounded-xl px-2.5 py-2.5 text-left text-sm sm:min-h-10 sm:whitespace-nowrap ${
                entry.active
                  ? 'bg-accent-soft text-[#ffb3bd] sm:shadow-[inset_3px_0_0_var(--cl-selected)]'
                  : 'bg-surface text-muted hover:bg-hover hover:text-text sm:bg-transparent'
              }`}
            >
              <Icon aria-hidden="true" className="h-4 w-4 shrink-0" />
              <span className="min-w-0">{entry.title}</span>
              {counts[entry.slug] !== undefined ? (
                <span className="ml-auto hidden text-xs tabular-nums text-muted sm:inline">
                  {counts[entry.slug]}
                </span>
              ) : null}
            </button>
          );
        })}
      </nav>

      <p className="m-0 mt-3 hidden border-t border-line px-2.5 pt-3.5 text-xs leading-relaxed text-muted sm:block">
        Find a source in Discover.
        <br />
        Get it working here.
      </p>
    </aside>
  );
}
