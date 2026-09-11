/**
 * Status colours.
 *
 * "Watching" is a list state, not a live one. It used to render green, which
 * read as "this person is watching right now" — green is now reserved for
 * presence and red only ever means an active session.
 */

export type ListStatus = 'WATCHING' | 'COMPLETED' | 'PLAN_TO_WATCH';

export const STATUS_LABEL: Record<ListStatus, string> = {
  WATCHING: 'Watching',
  COMPLETED: 'Completed',
  PLAN_TO_WATCH: 'Plan to Watch',
};

export interface StatusStyle {
  /** Small round indicator, used in pulse cards and list rows. */
  dot: string;
  /** Pill/badge styling: background, border and text together. */
  badge: string;
  /** Bare text colour for inline metadata. */
  text: string;
}

export const STATUS_STYLE: Record<ListStatus, StatusStyle> = {
  WATCHING: {
    dot: 'bg-status-watching',
    badge: 'border-status-watching/35 bg-status-watching/10 text-status-watching',
    text: 'text-status-watching',
  },
  COMPLETED: {
    dot: 'bg-status-completed',
    badge: 'border-status-completed/35 bg-status-completed/10 text-status-completed',
    text: 'text-status-completed',
  },
  PLAN_TO_WATCH: {
    dot: 'bg-status-planned',
    badge: 'border-status-planned/35 bg-status-planned/10 text-status-planned',
    text: 'text-status-planned',
  },
};

/**
 * Presence and session states. Kept apart from list status on purpose: these
 * describe a person right now, list status describes a title on a list.
 */
export const PRESENCE_STYLE = {
  /** Actually in an active Couchlist session. Nothing else may use red. */
  live: {
    dot: 'bg-status-live animate-pulse-soft',
    badge: 'border-status-live/40 bg-status-live/10 text-status-live',
    text: 'text-status-live',
  },
  /** Signed in and available. Nothing else may use green. */
  online: {
    dot: 'bg-status-online',
    badge: 'border-status-online/35 bg-status-online/10 text-status-online',
    text: 'text-status-online',
  },
  offline: {
    dot: 'bg-text-secondary/50',
    badge: 'border-border bg-background/50 text-text-secondary',
    text: 'text-text-secondary',
  },
} as const;

export type PresenceState = keyof typeof PRESENCE_STYLE;
