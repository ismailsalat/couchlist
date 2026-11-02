/**
 * Guide topics and device filtering.
 *
 * "Start here" is not a topic: it is a curated selection drawn from every
 * topic, so it is a flag on a guide rather than an eighth category.
 */

export const GuideTopic = {
  BLOCKING: 'BLOCKING',
  WATCHING: 'WATCHING',
  READING: 'READING',
  TRANSLATION: 'TRANSLATION',
  SUBTITLES: 'SUBTITLES',
  CASTING: 'CASTING',
  FIXES: 'FIXES',
} as const;
export type GuideTopic = (typeof GuideTopic)[keyof typeof GuideTopic];

export const START_HERE = 'start' as const;
export type GuideTopicFilter = GuideTopic | typeof START_HERE;

export interface GuideTopicMeta {
  topic: GuideTopic;
  /** URL segment, also the value used by the topic rail. */
  slug: string;
  title: string;
  description: string;
  /** Lucide icon name, matching the approved reference. */
  icon: string;
}

export const GUIDE_TOPICS: readonly GuideTopicMeta[] = [
  {
    topic: GuideTopic.BLOCKING,
    slug: 'ad-blocking',
    title: 'Ad blocking',
    description: 'Choose a setup that fits your browser and device.',
    icon: 'shield-check',
  },
  {
    topic: GuideTopic.WATCHING,
    slug: 'watching-apps',
    title: 'Watching apps',
    description: 'Find a title, stream a catalog, or play your own files.',
    icon: 'circle-play',
  },
  {
    topic: GuideTopic.READING,
    slug: 'reading-apps',
    title: 'Reading apps',
    description: 'Manga, manhwa, and comics—with a reader that suits you.',
    icon: 'book-open',
  },
  {
    topic: GuideTopic.TRANSLATION,
    slug: 'translation',
    title: 'Translation',
    description: 'Understand a panel, a speech bubble, or a source in another language.',
    icon: 'languages',
  },
  {
    topic: GuideTopic.SUBTITLES,
    slug: 'subtitles-and-audio',
    title: 'Subtitles & audio',
    description: 'Get the right language, readable captions, and better timing.',
    icon: 'captions',
  },
  {
    topic: GuideTopic.CASTING,
    slug: 'tv-and-casting',
    title: 'TV & casting',
    description: 'Move from a small screen to your favorite seat.',
    icon: 'cast',
  },
  {
    topic: GuideTopic.FIXES,
    slug: 'common-fixes',
    title: 'Common fixes',
    description: 'Small checks for the things that interrupt a good watch or read.',
    icon: 'wrench',
  },
];

export const START_HERE_META = {
  slug: START_HERE,
  title: 'Start here',
  description: 'A few good starting points for your next couch session.',
  icon: 'compass',
} as const;

export function guideTopicMeta(topic: GuideTopic): GuideTopicMeta {
  const meta = GUIDE_TOPICS.find((entry) => entry.topic === topic);
  if (!meta) throw new Error(`Unknown guide topic: ${topic}`);
  return meta;
}

export function parseGuideTopicFilter(value: string | null | undefined): GuideTopicFilter {
  if (!value || value === START_HERE) return START_HERE;
  const bySlug = GUIDE_TOPICS.find((entry) => entry.slug === value);
  if (bySlug) return bySlug.topic;
  const byName = GUIDE_TOPICS.find((entry) => entry.topic === value.toUpperCase());
  return byName?.topic ?? START_HERE;
}

export function guideTopicSlug(topic: GuideTopicFilter): string {
  return topic === START_HERE ? START_HERE : guideTopicMeta(topic).slug;
}

/* ------------------------------- devices -------------------------------- */

export const GuideDevice = {
  ANY: 'any',
  COMPUTER: 'computer',
  IPHONE: 'iphone',
  ANDROID: 'android',
  TV: 'tv',
} as const;
export type GuideDevice = (typeof GuideDevice)[keyof typeof GuideDevice];

export const GUIDE_DEVICE_OPTIONS: ReadonlyArray<{ value: GuideDevice; label: string }> = [
  { value: GuideDevice.ANY, label: 'Any device' },
  { value: GuideDevice.COMPUTER, label: 'Computer' },
  { value: GuideDevice.IPHONE, label: 'iPhone / iPad' },
  { value: GuideDevice.ANDROID, label: 'Android' },
  { value: GuideDevice.TV, label: 'TV' },
];

export function parseGuideDevice(value: string | null | undefined): GuideDevice {
  switch (value) {
    case GuideDevice.COMPUTER:
    case GuideDevice.IPHONE:
    case GuideDevice.ANDROID:
    case GuideDevice.TV:
      return value;
    default:
      return GuideDevice.ANY;
  }
}

export interface GuideDeviceFlags {
  deviceComputer: boolean;
  deviceIphone: boolean;
  deviceAndroid: boolean;
  deviceTv: boolean;
}

/**
 * Whether a guide applies to the chosen device.
 *
 * An app is excluded when it is not supported there. Device support is stored
 * per platform precisely so that one app name cannot imply every platform.
 */
export function guideSupportsDevice(guide: GuideDeviceFlags, device: GuideDevice): boolean {
  switch (device) {
    case GuideDevice.COMPUTER:
      return guide.deviceComputer;
    case GuideDevice.IPHONE:
      return guide.deviceIphone;
    case GuideDevice.ANDROID:
      return guide.deviceAndroid;
    case GuideDevice.TV:
      return guide.deviceTv;
    default:
      return true;
  }
}

export function devicesFromFlags(flags: GuideDeviceFlags): GuideDevice[] {
  const result: GuideDevice[] = [];
  if (flags.deviceComputer) result.push(GuideDevice.COMPUTER);
  if (flags.deviceIphone) result.push(GuideDevice.IPHONE);
  if (flags.deviceAndroid) result.push(GuideDevice.ANDROID);
  if (flags.deviceTv) result.push(GuideDevice.TV);
  return result;
}
