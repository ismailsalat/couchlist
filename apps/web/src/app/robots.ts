import type { MetadataRoute } from 'next';
import { config } from '@/lib/config';

/**
 * Crawler rules.
 *
 * The directory and the guides are meant to be found. Everything personal or
 * administrative is excluded, so private content does not end up in an index
 * even if a URL leaks.
 */
export default function robots(): MetadataRoute.Robots {
  const base = config().APP_BASE_URL.replace(/\/+$/u, '');

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/api/',
          '/admin',
          '/admin/',
          '/account',
          '/saved',
          '/submissions',
          '/submit',
          '/collections',
          '/login',
          '/signup',
          '/verify-email',
          '/forgot-password',
          '/reset-password',
        ],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}
