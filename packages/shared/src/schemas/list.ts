import { z } from 'zod';
import { mediaIdentitySchema } from '../media/identity.js';

/**
 * Request schemas.
 *
 * Every mutation validates against one of these on the server. The client
 * hiding a button is not a security control.
 */

export const listStatusSchema = z.enum(['WATCHING', 'COMPLETED', 'PLAN_TO_WATCH']);
export type ListStatusValue = z.infer<typeof listStatusSchema>;

export const ratingSchema = z
  .number()
  .min(1, 'Ratings run from 1 to 10.')
  .max(10, 'Ratings run from 1 to 10.')
  .multipleOf(0.5, 'Ratings go in half points.');

export const progressSchema = z.number().int().min(0).max(100_000);

export const upsertListEntrySchema = z.object({
  media: mediaIdentitySchema,
  status: listStatusSchema,
  rating: ratingSchema.nullable().optional(),
  progress: progressSchema.nullable().optional(),
});
export type UpsertListEntryInput = z.infer<typeof upsertListEntrySchema>;

export const updateListEntrySchema = z
  .object({
    status: listStatusSchema.optional(),
    rating: ratingSchema.nullable().optional(),
    progress: progressSchema.nullable().optional(),
  })
  .refine(
    (value) =>
      value.status !== undefined || value.rating !== undefined || value.progress !== undefined,
    { message: 'Nothing to update.' },
  );
export type UpdateListEntryInput = z.infer<typeof updateListEntrySchema>;

export const searchQuerySchema = z.object({
  q: z.string().trim().min(1, 'Type something to search for.').max(120),
  type: z.enum(['all', 'anime', 'movie', 'tv']).default('all'),
});

export const watchTogetherRequestSchema = z.object({
  // The caller is always included server-side, so one other Couchlist friend is enough.
  userIds: z.array(z.string().min(1).max(64)).min(1).max(9),
  mediaType: z.enum(['anime', 'movie', 'tv', 'anything']).default('anything'),
  allowRewatch: z.boolean().default(false),
});
export type WatchTogetherRequest = z.infer<typeof watchTogetherRequestSchema>;

export const privacySettingsSchema = z.object({
  profileVisibility: z.enum(['MUTUAL_SERVERS', 'PRIVATE']),
  showRatings: z.boolean(),
  showProgress: z.boolean(),
});
export type PrivacySettings = z.infer<typeof privacySettingsSchema>;
