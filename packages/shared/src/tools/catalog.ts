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

export type ToolState = 'READY' | 'COMING_SOON';

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
    slug: 'site-safety',
    name: 'Is this site safe?',
    blurb: 'Paste a link and see what Couchlist and the public blocklists know about it.',
    tag: 'Safety',
    palette: 'green',
    state: 'READY',
    icon: 'shield',
    runsInBrowser: false,
  },
  {
    slug: 'site-down',
    name: 'Site down — what else?',
    blurb: 'Dead link in, mirrors and close alternatives out.',
    tag: 'Links',
    palette: 'blue',
    state: 'READY',
    icon: 'link',
    runsInBrowser: false,
  },
  {
    slug: 'ad-blocker',
    name: 'Ad blocker check',
    blurb: 'Tells you whether yours is actually working, right now.',
    tag: 'Safety',
    palette: 'green',
    state: 'READY',
    icon: 'shield',
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
    slug: 'region',
    name: 'Region check',
    blurb: 'Whether a site works where you are, or only elsewhere.',
    tag: 'Links',
    palette: 'blue',
    state: 'READY',
    icon: 'globe',
    runsInBrowser: true,
  },
  {
    slug: 'download-check',
    name: 'Download safety check',
    blurb: 'Spots the .exe pretending to be a video, without uploading anything.',
    tag: 'Safety',
    palette: 'green',
    state: 'READY',
    icon: 'download',
    runsInBrowser: true,
  },
  {
    slug: 'subtitles',
    name: 'Subtitle tools',
    blurb: 'Fix timing, convert formats, repair garbled text.',
    tag: 'Subtitles',
    palette: 'pink',
    state: 'COMING_SOON',
    icon: 'captions',
    runsInBrowser: true,
    plan: 'Shift or stretch a .srt, convert between .ass, .vtt and .srt, repair subtitles that show as nonsense, and strip the advert lines rippers bake in.',
  },
  {
    slug: 'video',
    name: 'Video tools',
    blurb: 'Pull subtitles out of an .mkv, trim, compress.',
    tag: 'Video',
    palette: 'purple',
    state: 'COMING_SOON',
    icon: 'film',
    runsInBrowser: true,
    plan: 'Extract the subtitle tracks baked into an .mkv, cut a clip, or shrink a file — all on your own machine. It needs a large one-time download in the browser, which is why it is not first in the queue.',
  },
  {
    slug: 'comics',
    name: 'Comic file tools',
    blurb: 'Build a .cbz, shrink one, split long strips.',
    tag: 'Files',
    palette: 'teal',
    state: 'COMING_SOON',
    icon: 'book',
    runsInBrowser: true,
    plan: 'Turn a folder of chapter images into one .cbz your reader opens, shrink an oversized volume, and cut a giant webtoon strip into readable pages.',
  },
];

export function toolBySlug(slug: string): ToolMeta | undefined {
  return TOOLS.find((tool) => tool.slug === slug);
}

export const READY_TOOLS: readonly ToolMeta[] = TOOLS.filter((tool) => tool.state === 'READY');
export const UPCOMING_TOOLS: readonly ToolMeta[] = TOOLS.filter((tool) => tool.state === 'COMING_SOON');
