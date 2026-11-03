import { distance } from 'fastest-levenshtein';

/**
 * Typosquat and homograph detection.
 *
 * The scam this catches is the most common one in this corner of the web: a
 * name people already trust, with a different suffix bolted on
 * (`kissanime.tv.in`), a letter swapped (`an1koto.cz`), or a Unicode
 * lookalike character that renders identically (`аnikoto.cz`, Cyrillic а).
 *
 * This file is pure and holds no data of its own. The caller passes the
 * domains it knows about, which in practice are the ones Couchlist lists.
 * That matters: a generic "does this look like a popular site" check needs a
 * list of popular sites we do not have and could not keep current, whereas
 * "does this look like something in our own directory" is a question our own
 * data answers completely.
 */

/** A known-good domain to compare against. */
export interface KnownDomain {
  /** Full registrable domain, e.g. "anikoto.cz". */
  domain: string;
  /** The label without its public suffix, e.g. "anikoto". */
  label: string;
  /** What to call it in a warning. */
  name: string;
}

export interface LookalikeMatch {
  /** The real thing this resembles. */
  known: KnownDomain;
  /** Why we think so, in one phrase. */
  reason: 'same-name-different-suffix' | 'one-character-off' | 'confusable-characters';
}

/**
 * Characters that collapse onto one another when read quickly.
 *
 * Each group folds to a single representative rather than mapping one
 * character to one other. That matters: `1` can stand in for `l` *or* `i`
 * depending on the font, so a one-to-one table turns `an1koto` into
 * `anlkoto`, which matches nothing. Folding whole groups means both the
 * candidate and the real name land on the same shape.
 *
 * Deliberately short. The point is the handful that appear in real attacks,
 * not a model of Unicode confusables — a non-ASCII name is caught separately
 * by `hasPunycode`.
 */
const GROUPS: readonly (readonly string[])[] = [
  ['i', 'l', '1', '|', '!'],
  ['o', '0'],
  ['e', '3'],
  ['a', '4'],
  ['s', '5'],
  ['t', '7'],
  ['b', '8'],
  ['g', '9', 'q'],
  ['z', '2'],
];

/** Sequences that read as one letter. Applied before the single-character fold. */
const LIGATURES: ReadonlyArray<readonly [string, string]> = [
  ['rn', 'm'],
  ['vv', 'w'],
  ['cl', 'd'],
];

const FOLD = new Map<string, string>();
for (const group of GROUPS) {
  for (const member of group) FOLD.set(member, group[0]!);
}

/** Fold a label into the shape a hurried reader perceives. */
export function perceptualForm(label: string): string {
  let out = label.toLowerCase();
  for (const [from, to] of LIGATURES) out = out.split(from).join(to);
  out = [...out].map((char) => FOLD.get(char) ?? char).join('');
  return out.replace(/[^a-z]/gu, '');
}

/** True when a hostname was written in a non-ASCII script and punycoded. */
export function hasPunycode(hostname: string): boolean {
  return hostname.split('.').some((part) => part.startsWith('xn--'));
}

/**
 * How many edits are forgivable before two names are simply different names.
 *
 * Scaled by length, because one character off a four-letter word is a
 * different word, while one character off a twelve-letter word is a typo.
 */
function allowedEdits(label: string): number {
  if (label.length <= 5) return 0;
  if (label.length <= 9) return 1;
  return 2;
}

/**
 * Compare a candidate against domains we know, worst match first.
 *
 * Returns at most `limit` matches. An exact match on the full domain is not a
 * lookalike and returns nothing — that is simply the site itself, and the
 * caller handles it before reaching here.
 */
export function findLookalikes(
  candidate: { domain: string; label: string },
  known: readonly KnownDomain[],
  limit = 3,
): LookalikeMatch[] {
  const matches: LookalikeMatch[] = [];
  const candidateShape = perceptualForm(candidate.label);
  if (!candidateShape) return matches;

  for (const entry of known) {
    if (entry.domain === candidate.domain) continue;

    // The clearest case: identical name, different registrable domain. This
    // is what `kissanime.tv.in` does to `kissanime.to`.
    if (entry.label === candidate.label) {
      matches.push({ known: entry, reason: 'same-name-different-suffix' });
      continue;
    }

    const knownShape = perceptualForm(entry.label);
    if (!knownShape) continue;

    // Same once the eye-level substitutions are folded away, but spelled
    // differently: digits standing in for letters, rn for m, and so on.
    if (knownShape === candidateShape) {
      matches.push({ known: entry, reason: 'confusable-characters' });
      continue;
    }

    const budget = allowedEdits(entry.label);
    if (budget > 0 && distance(entry.label, candidate.label) <= budget) {
      matches.push({ known: entry, reason: 'one-character-off' });
    }
  }

  const order: Record<LookalikeMatch['reason'], number> = {
    'same-name-different-suffix': 0,
    'confusable-characters': 1,
    'one-character-off': 2,
  };
  matches.sort((a, b) => order[a.reason] - order[b.reason]);
  return matches.slice(0, limit);
}

/** The sentence shown to a person for a given match. */
export function describeLookalike(match: LookalikeMatch): string {
  switch (match.reason) {
    case 'same-name-different-suffix':
      return `This carries the same name as ${match.known.name} (${match.known.domain}) on a different address. Copying a name people already know is the most common way these sites get opened by mistake.`;
    case 'confusable-characters':
      return `Read quickly, this is ${match.known.name} (${match.known.domain}) — but the spelling is not the same. Characters that look alike are swapped in deliberately.`;
    case 'one-character-off':
      return `This is one character away from ${match.known.name} (${match.known.domain}), which is not the same site.`;
  }
}
