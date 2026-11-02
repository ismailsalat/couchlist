/**
 * Contributor credit.
 *
 * Anonymous credit is a public *display* choice, not a deletion. The server
 * keeps the submitting account so moderation still works; the public shape is
 * what hides it.
 *
 * The rule enforced here: an anonymous contribution must not leak identity
 * through a name, a profile link, an avatar, or an id that can be joined back
 * to an account. `publicCredit` is the only approved way to build that shape,
 * so there is one place to audit.
 */

export const CreditMode = {
  CREDITED: 'CREDITED',
  ANONYMOUS: 'ANONYMOUS',
} as const;
export type CreditMode = (typeof CreditMode)[keyof typeof CreditMode];

export const ANONYMOUS_DISPLAY_NAME = 'Anonymous';

export function parseCreditMode(value: unknown): CreditMode {
  return value === CreditMode.ANONYMOUS ? CreditMode.ANONYMOUS : CreditMode.CREDITED;
}

/** What a public response may say about who contributed something. */
export type PublicCredit =
  | { anonymous: true; displayName: typeof ANONYMOUS_DISPLAY_NAME }
  | {
      anonymous: false;
      displayName: string;
      /** Stable public profile id. Present only for credited contributions. */
      userId: string;
      avatarUrl: string | null;
      /**
       * True when the account has an uploaded picture. A boolean rather than
       * a URL, so an anonymous credit cannot carry an identifying address and
       * the caller is forced through Couchlist's own avatar route.
       */
      hasAvatar: boolean;
    };

export interface CreditInput {
  creditMode: CreditMode;
  user: {
    id: string;
    displayName: string | null;
    username?: string | null;
    avatarUrl?: string | null;
    avatarMime?: string | null;
    deletedAt?: Date | null;
  } | null;
}

/**
 * Builds the public credit shape.
 *
 * Anonymous, a deleted account, and a detached row all collapse to the same
 * output, so a reader cannot tell them apart and a deleted account's old
 * identity is not exposed through its credits.
 */
export function publicCredit({ creditMode, user }: CreditInput): PublicCredit {
  if (creditMode === CreditMode.ANONYMOUS || !user || user.deletedAt) {
    return { anonymous: true, displayName: ANONYMOUS_DISPLAY_NAME };
  }

  const displayName = user.displayName?.trim() || user.username?.trim();
  if (!displayName) {
    return { anonymous: true, displayName: ANONYMOUS_DISPLAY_NAME };
  }

  return {
    anonymous: false,
    displayName,
    userId: user.id,
    avatarUrl: user.avatarUrl ?? null,
    hasAvatar: Boolean(user.avatarMime),
  };
}

export const ContributionKind = {
  NEW_SOURCE: 'NEW_SOURCE',
  CORRECTION: 'CORRECTION',
  GUIDE: 'GUIDE',
  GUIDE_CORRECTION: 'GUIDE_CORRECTION',
} as const;
export type ContributionKind = (typeof ContributionKind)[keyof typeof ContributionKind];

export const CONTRIBUTION_KIND_LABEL: Record<ContributionKind, string> = {
  NEW_SOURCE: 'Suggested a source',
  CORRECTION: 'Corrected a source',
  GUIDE: 'Wrote a guide',
  GUIDE_CORRECTION: 'Corrected a guide',
};

export const ContributionStatus = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
} as const;
export type ContributionStatus =
  (typeof ContributionStatus)[keyof typeof ContributionStatus];

export const CONTRIBUTION_STATUS_LABEL: Record<ContributionStatus, string> = {
  PENDING: 'Pending review',
  APPROVED: 'Approved',
  REJECTED: 'Not accepted',
};

/**
 * A one-line summary of who contributed something.
 *
 * A source that lots of people suggested would otherwise print a wall of
 * names, so after two the rest become a count. The original contributor is
 * sorted first, because "who found it first" is the part people look for.
 * Anonymous entries take part in the count but are never named.
 */
export function creditSummaryLine(
  credits: Array<{ isOriginal: boolean; credit: PublicCredit }>,
): string {
  if (credits.length === 0) return '';

  const names = [...credits]
    .sort((a, b) => Number(b.isOriginal) - Number(a.isOriginal))
    .map((entry) => (entry.credit.anonymous ? ANONYMOUS_DISPLAY_NAME : entry.credit.displayName));

  if (names.length === 1) return names[0]!;
  if (names.length === 2) return `${names[0]} and ${names[1]}`;

  const rest = names.length - 2;
  return `${names[0]}, ${names[1]} and ${rest} ${rest === 1 ? 'other' : 'others'}`;
}
