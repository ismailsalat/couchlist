/**
 * Quiet, earned marks on a profile.
 *
 * Deliberately not a points economy. Every one of these is a statement of
 * something that actually happened, in the past tense, and none of them can
 * be farmed by posting more: the ones that are about volume need accepted
 * contributions, and the ones that are about quality need other people to
 * have done something with what you found.
 *
 * Pure, so the rules are testable and so a profile page never has to ask the
 * database what somebody has earned.
 */

export interface MilestoneInput {
  sourcesFound: number;
  correctionsAccepted: number;
  guidesWritten: number;
  savesOfTheirFinds: number;
  votesOnTheirFinds: number;
  hasTrustedFind: boolean;
}

export interface Milestone {
  id: string;
  label: string;
  /** Why it was given, in words a person would use. */
  note: string;
}

export function milestonesFor(input: MilestoneInput): Milestone[] {
  const earned: Milestone[] = [];

  if (input.sourcesFound >= 1) {
    earned.push({
      id: 'first-find',
      label: 'First find',
      note: 'Found something nobody had listed yet.',
    });
  }
  for (const threshold of [5, 25, 100]) {
    if (input.sourcesFound >= threshold) {
      earned.push({
        id: `finds-${threshold}`,
        label: `${threshold} sources`,
        note: `Found ${threshold} sites that were accepted.`,
      });
    }
  }

  if (input.correctionsAccepted >= 10) {
    earned.push({
      id: 'corrections-10',
      label: 'Keeps it accurate',
      note: 'Ten accepted corrections. Unglamorous and the reason the directory works.',
    });
  }

  if (input.guidesWritten >= 1) {
    earned.push({
      id: 'guide-writer',
      label: 'Wrote a guide',
      note: 'Explained how to do something, for everybody else.',
    });
  }

  if (input.hasTrustedFind) {
    earned.push({
      id: 'trusted-find',
      label: 'Found a trusted pick',
      note: 'Something they found was good enough to be pinned by a moderator.',
    });
  }

  for (const threshold of [10, 100, 1000]) {
    if (input.savesOfTheirFinds >= threshold) {
      earned.push({
        id: `saved-${threshold}`,
        label: `Saved ${threshold.toLocaleString()} times`,
        note: `People have saved something they found ${threshold.toLocaleString()} times.`,
      });
    }
  }

  return earned;
}
