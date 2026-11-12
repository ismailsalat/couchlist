/**
 * The tools, in one list.
 *
 * The hub page, the individual tool pages and the "coming soon" screen all
 * read from here, so a tool cannot exist in the navigation and be missing a
 * page, or ship without saying which state it is in.
 *
 * `palette` names one of the six pill colours the directory already uses, so
 * a concept keeps its colour across the whole site: subtitles are the same
 * pink in the tools grid and in the guides list.
 */

export const TOOL_PALETTES = ['blue', 'purple', 'green', 'pink', 'olive', 'teal', 'slate'] as const;
export type ToolPalette = (typeof TOOL_PALETTES)[number];

/**
 * `TESTING` is the honest middle.
 *
 * A tool can work and still not be proven — the ad blocker check depends on
 * how somebody's extension behaves, which cannot be verified from here.
 * Calling that Ready overstates it and hiding it behind a cone understates
 * it, so it says what it is and invites being told when it is wrong.
 */
export type ToolState = 'READY' | 'TESTING' | 'COMING_SOON';

export interface ToolMeta {
  slug: string;
  name: string;
  /** One line. Shown on the tile, so it has to fit on two short rows. */
  blurb: string;
  /** The small tag: what kind of thing this is. */
  tag: string;
  palette: ToolPalette;
  state: ToolState;
  /** Lucide-style key the tile maps to a drawn glyph. */
  icon: string;
  /** True when the work happens in the browser and no file is uploaded. */
  runsInBrowser: boolean;
  /** Shown on the coming-soon screen so the promise is specific. */
  plan?: string;
}

export const TOOLS: readonly ToolMeta[] = [
  {
    /*
     * One link tool, not two.
     *
     * "Is this safe?" and "this is down, what else?" were separate tools that
     * took the same input and ran the same lookup. Somebody with a link in
     * their hand has one question — what is this and where else can I go —
     * and making them pick a door first was our problem, not theirs.
     */
    slug: 'site-safety',
    name: 'Check a link',
    blurb: 'Is it safe, where else does it live, and what to use instead.',
    tag: 'Safety',
    palette: 'green',
    state: 'READY',
    icon: 'shield',
    runsInBrowser: false,
  },
  {
    slug: 'subtitles',
    name: 'Fix subtitles',
    blurb: 'Out of sync? Shift it until it matches. Converts and cleans them too.',
    tag: 'Watching',
    palette: 'pink',
    state: 'READY',
    icon: 'captions',
    runsInBrowser: true,
  },
  {
    slug: 'comics',
    name: 'Read manga',
    blurb: 'Import your chapters and read them with no ads. Nothing is uploaded.',
    tag: 'Reading',
    palette: 'teal',
    state: 'READY',
    icon: 'book',
    runsInBrowser: true,
  },
  {
    slug: 'download-check',
    name: 'Check a download',
    blurb: 'Looks the file up by fingerprint against malware databases.',
    tag: 'Safety',
    palette: 'green',
    state: 'TESTING',
    icon: 'download',
    runsInBrowser: true,
  },
  {
    slug: 'status',
    name: 'Live status',
    blurb: 'Which listed sites are answering, and which are down.',
    tag: 'Status',
    palette: 'slate',
    state: 'READY',
    icon: 'pulse',
    runsInBrowser: false,
  },
  {
    slug: 'ad-blocker',
    name: 'Ad blocker check',
    blurb: 'Tells you whether yours is actually working, right now.',
    tag: 'Safety',
    palette: 'green',
    state: 'TESTING',
    icon: 'shield',
    runsInBrowser: true,
  },
  {
    slug: 'video',
    name: 'Video tools',
    blurb: 'Pull subtitles out of an .mkv, trim, compress.',
    tag: 'Watching',
    palette: 'purple',
    state: 'COMING_SOON',
    icon: 'film',
    runsInBrowser: true,
    plan: 'Extract the subtitle tracks baked into an .mkv, cut a clip, or shrink a file \u2014 all on your own machine. It needs a large one-time download in the browser, which is why it is not first in the queue.',
  },
];

export function toolBySlug(slug: string): ToolMeta | undefined {
  return TOOLS.find((tool) => tool.slug === slug);
}

/** Everything somebody can use today, proven or not. */
export const USABLE_TOOLS: readonly ToolMeta[] = TOOLS.filter(
  (tool) => tool.state === 'READY' || tool.state === 'TESTING',
);
export const UPCOMING_TOOLS: readonly ToolMeta[] = TOOLS.filter(
  (tool) => tool.state === 'COMING_SOON',
);
