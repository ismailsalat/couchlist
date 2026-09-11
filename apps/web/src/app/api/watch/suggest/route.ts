import { z } from 'zod';
import { apiRoute } from '@/lib/api/handler';
import { checkRateLimit } from '@/lib/api/rate-limit';
import { currentUser } from '@/lib/auth/session';
import { submitSourceCandidate } from '@/lib/services/watch';

export const dynamic = 'force-dynamic';

const schema = z.object({
  homepageUrl: z.string().min(1).max(2048),
  suggestedName: z.string().max(120).optional(),
  supportsAnime: z.boolean().default(false),
  supportsMovies: z.boolean().default(false),
  supportsTv: z.boolean().default(false),
  comment: z.string().max(500).optional(),
  contentKey: z.string().max(220).optional(),
  mediaType: z.enum(['ANIME', 'MOVIE', 'TV']).optional(),
  mediaTitle: z.string().max(180).optional(),
  availabilityUrl: z.string().max(2048).optional(),
  // Honeypot for simple anonymous-form spam. Real users never fill this.
  website: z.string().max(0).optional(),
});

/** Suggestions are public, but always enter the human review queue. */
export const POST = apiRoute(async (request) => {
  const user = await currentUser();
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  const anonymousKey = forwarded || request.headers.get('x-real-ip') || 'unknown';
  checkRateLimit(user ? `watch-suggest:${user.id}` : `watch-suggest-anon:${anonymousKey}`, user ? 10 : 4);
  const body = schema.parse(await request.json());
  return submitSourceCandidate({ ...body, userId: user?.id ?? null });
});
