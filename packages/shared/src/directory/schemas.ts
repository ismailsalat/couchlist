import { z } from 'zod';
import { SOURCE_CATEGORIES, type SourceCategory } from './categories.js';
import { CreditMode } from './credit.js';
import { isSafeExternalUrl } from '../watch/url.js';

/**
 * Request validation for every directory write.
 *
 * Text that users can type is length-bounded here rather than at the database,
 * so the error that comes back is a sentence instead of a driver message.
 * Every URL goes through `isSafeExternalUrl`, which rejects non-HTTP schemes
 * and private addresses.
 */

const trimmed = (max: number) => z.string().trim().max(max);

export const externalUrlSchema = z
  .string()
  .trim()
  .min(4, 'Enter a website address.')
  .max(2048)
  .refine(isSafeExternalUrl, 'Enter a full http:// or https:// website address.');

export const categoryListSchema = z
  .array(z.enum(SOURCE_CATEGORIES as unknown as [SourceCategory, ...SourceCategory[]]))
  .min(1, 'Choose at least one category.')
  .max(SOURCE_CATEGORIES.length);

export const creditModeSchema = z
  .nativeEnum(CreditMode)
  .default(CreditMode.CREDITED);

/* ------------------------------- accounts ------------------------------- */

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3)
  .max(254)
  .email('Enter a valid email address.');

/**
 * Password rules.
 *
 * Length is the requirement that actually helps. A composition rule
 * ("one symbol, one digit") mostly produces predictable substitutions, so the
 * floor is twelve characters instead.
 */
export const passwordSchema = z
  .string()
  .min(12, 'Use at least 12 characters.')
  .max(200, 'That password is too long.');

export const displayNameSchema = z
  .string()
  .trim()
  .min(2, 'Display names need at least 2 characters.')
  .max(40, 'Display names can be at most 40 characters.')
  // Public, so control characters and layout tricks are not allowed.
  .regex(/^[^\p{Cc}\p{Cf}]+$/u, 'Display names cannot contain control characters.');

/**
 * Signup.
 *
 * The confirmation field is checked here as well as in the browser, so a
 * mistyped password cannot create an account nobody can sign into — the
 * failure mode it exists to prevent is silent, and only shows up later as a
 * login that will never work.
 */
export const signupSchema = z
  .object({
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string().min(1, 'Type your password again to confirm.'),
    displayName: displayNameSchema,
  })
  .refine((value) => value.password === value.confirmPassword, {
    message: 'Those passwords do not match.',
    path: ['confirmPassword'],
  });

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Enter your password.').max(200),
});

/** Six digits, typed by a human from an email. */
export const verificationCodeSchema = z
  .string()
  .trim()
  .regex(/^\d{6}$/u, 'Enter the 6-digit code from your email.');

export const verifyEmailSchema = z.object({ code: verificationCodeSchema });

export const requestPasswordResetSchema = z.object({ email: emailSchema });

export const completePasswordResetSchema = z
  .object({
    token: z.string().trim().min(16).max(256),
    password: passwordSchema,
    confirmPassword: z.string().min(1, 'Type your password again to confirm.'),
  })
  .refine((value) => value.password === value.confirmPassword, {
    message: 'Those passwords do not match.',
    path: ['confirmPassword'],
  });

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password.').max(200),
    newPassword: passwordSchema,
    confirmPassword: z.string().min(1, 'Type your new password again to confirm.'),
  })
  .refine((value) => value.newPassword === value.confirmPassword, {
    message: 'Those passwords do not match.',
    path: ['confirmPassword'],
  });

export const updateProfileSchema = z.object({
  displayName: displayNameSchema.optional(),
});

/** Deleting an account is irreversible, so it is confirmed by password. */
export const deleteAccountSchema = z.object({
  password: z.string().min(1, 'Enter your password to confirm.').max(200),
  confirm: z.literal('DELETE', {
    errorMap: () => ({ message: 'Type DELETE to confirm.' }),
  }),
});

/* ------------------------------- directory ------------------------------ */

export const sourceVoteSchema = z.object({
  value: z.enum(['LIKE', 'DISLIKE', 'NONE']),
});

export const bookmarkSchema = z.object({
  /** Private to the owner. */
  note: trimmed(500).optional(),
});

export const suggestSourceSchema = z.object({
  url: externalUrlSchema,
  name: trimmed(80).min(2, 'Give the source a name.'),
  categories: categoryListSchema,
  description: trimmed(240).optional(),
  /** Why this is worth listing. Helps a moderator decide. */
  explanation: trimmed(600).optional(),
  creditMode: creditModeSchema,
  /**
   * The site's icon, base64 or a data URL.
   *
   * Only length-bounded here; the real check reads the file's magic bytes in
   * `checkIconUpload`, because what a browser calls a PNG proves nothing.
   */
  icon: z.string().max(400_000).optional(),
});

export const suggestCorrectionSchema = z
  .object({
    sourceId: z.string().trim().min(1),
    proposedName: trimmed(80).optional(),
    proposedUrl: externalUrlSchema.optional(),
    proposedDescription: trimmed(240).optional(),
    proposedCategories: categoryListSchema.optional(),
    proposedHasLotsOfAds: z.boolean().optional(),
    explanation: trimmed(600).optional(),
    creditMode: creditModeSchema,
  })
  .refine(
    (value) =>
      value.proposedName !== undefined ||
      value.proposedUrl !== undefined ||
      value.proposedDescription !== undefined ||
      value.proposedCategories !== undefined ||
      value.proposedHasLotsOfAds !== undefined,
    { message: 'Suggest at least one change.' },
  );

/** The three report reasons. Deliberately not a taxonomy. */
export const reportReasonSchema = z.enum(['BROKEN_LINK', 'LOTS_OF_ADS', 'OTHER']);

export const reportSourceSchema = z.object({
  sourceId: z.string().trim().min(1),
  reason: reportReasonSchema,
  details: trimmed(600).optional(),
});

/* -------------------------------- guides -------------------------------- */

export const guideLinkSchema = z.object({
  label: trimmed(60).min(1),
  url: externalUrlSchema,
});

export const suggestGuideSchema = z.object({
  title: trimmed(100).min(4, 'Give the guide a title.'),
  topic: z.enum([
    'BLOCKING',
    'WATCHING',
    'READING',
    'TRANSLATION',
    'SUBTITLES',
    'CASTING',
    'FIXES',
  ]),
  body: trimmed(2000).min(20, 'Describe the steps in a little more detail.'),
  links: z.array(guideLinkSchema).max(6).default([]),
  creditMode: creditModeSchema,
});

export const guideCorrectionSchema = z.object({
  guideId: z.string().trim().min(1),
  kind: z.enum(['CORRECTION', 'BROKEN_LINK']),
  body: trimmed(2000).min(10, 'Say what needs changing.'),
  links: z.array(guideLinkSchema).max(6).default([]),
  creditMode: creditModeSchema,
});

/* ----------------------------- collections ------------------------------ */

export const collectionSchema = z.object({
  name: trimmed(60).min(2, 'Give the collection a name.'),
  description: trimmed(300).optional(),
  isPublic: z.boolean().default(false),
});

export const collectionItemSchema = z.object({
  sourceId: z.string().trim().min(1),
  note: trimmed(300).optional(),
});

/* -------------------------------- admin --------------------------------- */

export const adminSourceSchema = z.object({
  name: trimmed(80).min(2),
  url: externalUrlSchema,
  description: trimmed(240).optional(),
  categories: categoryListSchema,
  hasLotsOfAds: z.boolean().default(false),
  shouldAvoid: z.boolean().default(false),
  /*
   * Null means "not a pick". A number pins it above everything unpicked,
   * lowest first, so a moderator can order their own picks.
   */
  trustedRank: z.number().int().min(0).max(9999).nullable().optional(),
  trustedNote: trimmed(160).optional().nullable(),
  /*
   * Shown to readers beside the warning, so it is held to the same length as
   * a description rather than being a private moderator note.
   */
  avoidReason: trimmed(160).optional().nullable(),
  isEnabled: z.boolean().default(true),
  adminRankPenalty: z.number().int().min(0).max(100).default(0),
});

export const adminReviewSchema = z.object({
  decision: z.enum(['APPROVE', 'REJECT']),
  reviewNotes: trimmed(500).optional(),
  /** Small edits a moderator may make before approving. */
  edits: z
    .object({
      name: trimmed(80).optional(),
      url: externalUrlSchema.optional(),
      description: trimmed(240).optional(),
      categories: categoryListSchema.optional(),
      hasLotsOfAds: z.boolean().optional(),
      shouldAvoid: z.boolean().optional(),
      avoidReason: trimmed(160).optional().nullable(),
    })
    .optional(),
});

/**
 * Deleting a source for good.
 *
 * The domain has to be typed back. It is the one field that is both visible
 * on screen and impossible to produce by clicking in the wrong place, which
 * is the whole point of asking for it.
 */
export const adminDeleteSourceSchema = z.object({
  confirmDomain: trimmed(255).min(1),
  reason: trimmed(300).optional(),
});

export const adminHideSchema = z.object({
  hidden: z.boolean(),
  reason: trimmed(300).optional(),
});

export const adminResolveReportsSchema = z.object({
  sourceId: z.string().trim().min(1),
  action: z.enum(['RESOLVE', 'DISMISS']),
  resolutionNote: trimmed(500).optional(),
});

export const adminGuideSchema = z.object({
  slug: z
    .string()
    .trim()
    .min(3)
    .max(80)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u, 'Use lowercase words separated by hyphens.'),
  title: trimmed(100).min(4),
  task: trimmed(120).min(3),
  topic: z.enum([
    'BLOCKING',
    'WATCHING',
    'READING',
    'TRANSLATION',
    'SUBTITLES',
    'CASTING',
    'FIXES',
  ]),
  summary: trimmed(400).min(10),
  steps: z.array(trimmed(400).min(3)).max(12).default([]),
  links: z.array(guideLinkSchema).max(8).default([]),
  note: trimmed(400).optional(),
  costNote: trimmed(200).optional(),
  browserNotes: trimmed(400).optional(),
  deviceComputer: z.boolean().default(false),
  deviceIphone: z.boolean().default(false),
  deviceAndroid: z.boolean().default(false),
  deviceTv: z.boolean().default(false),
  deviceLabel: trimmed(40).default(''),
  keywords: trimmed(400).default(''),
  isStarter: z.boolean().default(false),
  isPublished: z.boolean().default(false),
  sortOrder: z.number().int().min(0).max(1000).default(100),
  /** Set only when the editor confirms they actually checked the links. */
  markReviewedNow: z.boolean().default(false),
});

export type SignupInput = z.infer<typeof signupSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type SuggestSourceInput = z.infer<typeof suggestSourceSchema>;
export type SuggestCorrectionInput = z.infer<typeof suggestCorrectionSchema>;
export type ReportSourceInput = z.infer<typeof reportSourceSchema>;
export type AdminSourceInput = z.infer<typeof adminSourceSchema>;
export type AdminReviewInput = z.infer<typeof adminReviewSchema>;
export type AdminGuideInput = z.infer<typeof adminGuideSchema>;
export type SuggestGuideInput = z.infer<typeof suggestGuideSchema>;
export type GuideCorrectionInput = z.infer<typeof guideCorrectionSchema>;
export type CollectionInput = z.infer<typeof collectionSchema>;
