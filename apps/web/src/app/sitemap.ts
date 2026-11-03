import type { MetadataRoute } from 'next';
import { GUIDE_TOPICS } from '@couchlist/shared';
import { config } from '@/lib/config';
import { repos } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * Sitemap.
 *
 * Public source pages, guides and topic listings only. Private pages are
 * absent here as well as being disallowed in robots.txt.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = config().APP_BASE_URL.replace(/\/+$/u, '');

  const [listing, guides] = await Promise.all([
    repos().sources.list({ limit: 100 }),
    repos().guides.list({}),
  ]);

  return [
    { url: `${base}/`, changeFrequency: 'daily', priority: 1 },
    { url: `${base}/guides`, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${base}/whats-new`, changeFrequency: 'daily', priority: 0.5 },
    // Listed on purpose. A directory that search engines can see has an
    // about, a privacy page and terms reads as a real site, which is half of
    // what a reputation check is looking for.
    { url: `${base}/about`, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${base}/stats`, changeFrequency: 'weekly', priority: 0.4 },
    { url: `${base}/privacy`, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${base}/terms`, changeFrequency: 'yearly', priority: 0.3 },
    ...GUIDE_TOPICS.map((topic) => ({
      url: `${base}/guides?topic=${topic.slug}`,
      changeFrequency: 'weekly' as const,
      priority: 0.6,
    })),
    ...listing.sources.map((source) => ({
      url: `${base}/sources/${source.id}`,
      lastModified: source.createdAt,
      changeFrequency: 'weekly' as const,
      priority: 0.7,
    })),
    ...guides.map((guide) => ({
      url: `${base}/guides/${guide.slug}`,
      lastModified: guide.updatedAt,
      changeFrequency: 'monthly' as const,
      priority: 0.6,
    })),
  ];
}
