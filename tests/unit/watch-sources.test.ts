import { describe, expect, it } from 'vitest';
import {
  AudioFilter,
  WatchAccessType,
  WatchFilter,
  WatchSourceType,
  canEmbedSource,
  canonicalizeExternalUrl,
  groupWatchOptions,
  isAuthorizedSourceType,
  isPrivateHostname,
  isSafeExternalUrl,
  lastCheckedText,
  matchesAudioFilter,
  matchesFilter,
  normalizeDomain,
  sortWatchOptions,
  watchHealthStatus,
  weightedWatchRating,
  type WatchOption,
} from '@couchlist/shared';

function option(overrides: Partial<WatchOption> = {}): WatchOption {
  return {
    id: 'mws_1',
    sourceId: 'wsr_1',
    name: 'Example Service',
    domain: 'example.com',
    sourceType: WatchSourceType.OFFICIAL,
    accessType: WatchAccessType.SUBSCRIPTION,
    quality: 'UNKNOWN',
    audio: 'UNKNOWN',
    priceLabel: null,
    regionInfo: null,
    availabilityUrl: 'https://example.com/watch',
    availabilityStatus: 'AVAILABLE',
    lastCheckedAt: null,
    requiresAccount: false,
    isVerified: true,
    allowsEmbed: false,
    ...overrides,
  };
}

describe('source domain normalization', () => {
  it('collapses case, www and trailing dots to one form', () => {
    expect(normalizeDomain('WWW.Example.com.')).toBe('example.com');
    expect(normalizeDomain('https://www.example.com/some/path')).toBe('example.com');
    expect(normalizeDomain('example.com')).toBe('example.com');
  });

  it('keeps distinct subdomains distinct', () => {
    expect(normalizeDomain('watch.example.com')).toBe('watch.example.com');
    expect(normalizeDomain('watch.example.com')).not.toBe(normalizeDomain('example.com'));
  });

  it('rejects hostnames that cannot identify a public source', () => {
    expect(normalizeDomain('localhost')).toBeNull();
    expect(normalizeDomain('')).toBeNull();
    expect(normalizeDomain('not a domain')).toBeNull();
  });
});

describe('duplicate source detection', () => {
  it('treats spelling variants of one site as the same source', () => {
    const variants = [
      'https://www.example.com',
      'https://example.com/',
      'http://EXAMPLE.com',
      'https://example.com/#top',
    ];
    const domains = new Set(variants.map((url) => normalizeDomain(url)));
    expect(domains.size).toBe(1);
  });

  it('canonicalizes URLs so the same page stores once', () => {
    expect(canonicalizeExternalUrl('https://www.example.com/watch/#play')).toBe(
      'https://example.com/watch',
    );
  });
});

describe('invalid protocol rejection', () => {
  it('refuses non-http schemes', () => {
    expect(isSafeExternalUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeExternalUrl('data:text/html;base64,PHNjcmlwdD4=')).toBe(false);
    expect(isSafeExternalUrl('file:///etc/passwd')).toBe(false);
    expect(isSafeExternalUrl('ftp://example.com/movie')).toBe(false);
  });

  it('accepts ordinary http and https links', () => {
    expect(isSafeExternalUrl('https://example.com/watch')).toBe(true);
    expect(isSafeExternalUrl('http://example.com/watch')).toBe(true);
  });

  it('refuses embedded credentials', () => {
    expect(isSafeExternalUrl('https://user:pass@example.com')).toBe(false);
  });
});

describe('SSRF and private-network protection', () => {
  it('blocks loopback, private ranges and cloud metadata', () => {
    for (const host of [
      'localhost',
      '127.0.0.1',
      '10.0.0.5',
      '172.16.4.2',
      '192.168.1.1',
      '169.254.169.254',
      '100.64.0.1',
      '0.0.0.0',
      '::1',
      'fd00::1',
      'internal.local',
      'metadata.google.internal',
    ]) {
      expect(isPrivateHostname(host), host).toBe(true);
    }
  });

  it('allows ordinary public hosts', () => {
    expect(isPrivateHostname('example.com')).toBe(false);
    expect(isPrivateHostname('8.8.8.8')).toBe(false);
  });

  it('refuses URLs pointing at private addresses', () => {
    expect(isSafeExternalUrl('http://169.254.169.254/latest/meta-data/')).toBe(false);
    expect(isSafeExternalUrl('http://localhost:3000/admin')).toBe(false);
  });
});

describe('official and community classification', () => {
  it('treats authorized tiers as official', () => {
    expect(isAuthorizedSourceType(WatchSourceType.OFFICIAL)).toBe(true);
    expect(isAuthorizedSourceType(WatchSourceType.FREE_AD_SUPPORTED)).toBe(true);
    expect(isAuthorizedSourceType(WatchSourceType.RENT_BUY)).toBe(true);
    expect(isAuthorizedSourceType(WatchSourceType.PUBLIC_DOMAIN)).toBe(true);
  });

  it('treats community and unverified as not official', () => {
    expect(isAuthorizedSourceType(WatchSourceType.COMMUNITY)).toBe(false);
    expect(isAuthorizedSourceType(WatchSourceType.UNVERIFIED)).toBe(false);
  });

  it('separates the two tiers for display', () => {
    const grouped = groupWatchOptions([
      option({ id: 'a', sourceType: WatchSourceType.OFFICIAL }),
      option({ id: 'b', sourceType: WatchSourceType.COMMUNITY }),
      option({ id: 'c', sourceType: WatchSourceType.UNVERIFIED }),
    ]);
    expect(grouped.authorized.map((entry) => entry.id)).toEqual(['a']);
    expect(grouped.community.map((entry) => entry.id)).toEqual(['b', 'c']);
  });
});

describe('embedding rules', () => {
  it('only permits embedding for opted-in public-domain sources', () => {
    expect(
      canEmbedSource({ sourceType: WatchSourceType.PUBLIC_DOMAIN, allowsEmbed: true }),
    ).toBe(true);
    expect(
      canEmbedSource({ sourceType: WatchSourceType.PUBLIC_DOMAIN, allowsEmbed: false }),
    ).toBe(false);
    expect(canEmbedSource({ sourceType: WatchSourceType.COMMUNITY, allowsEmbed: true })).toBe(
      false,
    );
    expect(canEmbedSource({ sourceType: WatchSourceType.OFFICIAL, allowsEmbed: true })).toBe(
      false,
    );
  });
});

describe('filters', () => {
  const free = option({ id: 'free', accessType: WatchAccessType.FREE_WITH_ADS });
  const sub = option({ id: 'sub', accessType: WatchAccessType.SUBSCRIPTION });
  const rent = option({ id: 'rent', accessType: WatchAccessType.RENT });
  const community = option({ id: 'com', sourceType: WatchSourceType.COMMUNITY });

  it('filters Free', () => {
    const kept = [free, sub, rent].filter((entry) => matchesFilter(entry, WatchFilter.FREE));
    expect(kept.map((entry) => entry.id)).toEqual(['free']);
  });

  it('filters Official', () => {
    const kept = [free, community].filter((entry) =>
      matchesFilter(entry, WatchFilter.OFFICIAL),
    );
    expect(kept.map((entry) => entry.id)).toEqual(['free']);
  });

  it('filters Community', () => {
    const kept = [free, community].filter((entry) =>
      matchesFilter(entry, WatchFilter.COMMUNITY),
    );
    expect(kept.map((entry) => entry.id)).toEqual(['com']);
  });

  it('filters Rent / Buy', () => {
    const kept = [free, sub, rent].filter((entry) =>
      matchesFilter(entry, WatchFilter.RENT_BUY),
    );
    expect(kept.map((entry) => entry.id)).toEqual(['rent']);
  });

  it('filters an aggregate chooser by its provider access metadata', () => {
    const chooser = option({
      id: 'chooser',
      accessType: WatchAccessType.UNKNOWN,
      providerOptions: [
        { name: 'Service A', accessTypes: [WatchAccessType.SUBSCRIPTION] },
        { name: 'Service B', accessTypes: [WatchAccessType.RENT] },
      ],
    });
    expect(matchesFilter(chooser, WatchFilter.SUBSCRIPTION)).toBe(true);
    expect(matchesFilter(chooser, WatchFilter.RENT_BUY)).toBe(true);
    expect(matchesFilter(chooser, WatchFilter.FREE)).toBe(false);
  });

  it('keeps everything under All', () => {
    const all = [free, sub, rent, community];
    expect(all.filter((entry) => matchesFilter(entry, WatchFilter.ALL))).toHaveLength(4);
  });

  it('treats a sub/dub source as matching either audio filter', () => {
    const both = option({ audio: 'SUB_DUB' });
    expect(matchesAudioFilter(both, AudioFilter.SUB)).toBe(true);
    expect(matchesAudioFilter(both, AudioFilter.DUB)).toBe(true);
    expect(matchesAudioFilter(option({ audio: 'SUB' }), AudioFilter.DUB)).toBe(false);
  });
});

describe('ordering', () => {
  it('puts authorized sources before community ones', () => {
    const sorted = sortWatchOptions([
      option({ id: 'com', sourceType: WatchSourceType.COMMUNITY }),
      option({ id: 'official', sourceType: WatchSourceType.OFFICIAL }),
    ]);
    expect(sorted[0]?.id).toBe('official');
  });

  it('floats a preferred source without hiding the others', () => {
    const all = [
      option({ id: 'a', sourceId: 'wsr_a', name: 'A' }),
      option({ id: 'b', sourceId: 'wsr_b', name: 'B' }),
      option({ id: 'c', sourceId: 'wsr_c', name: 'C' }),
    ];
    const sorted = sortWatchOptions(all, 'wsr_c');
    expect(sorted[0]?.sourceId).toBe('wsr_c');
    expect(sorted).toHaveLength(3);
  });

  it('ranks available above recently unavailable', () => {
    const sorted = sortWatchOptions([
      option({ id: 'down', availabilityStatus: 'RECENTLY_UNAVAILABLE' }),
      option({ id: 'up', availabilityStatus: 'AVAILABLE' }),
    ]);
    expect(sorted.map((entry) => entry.id)).toEqual(['up', 'down']);
  });

  it('uses clear health thresholds for recent broken reports', () => {
    expect(watchHealthStatus(0)).toBe('HEALTHY');
    expect(watchHealthStatus(2)).toBe('HEALTHY');
    expect(watchHealthStatus(3)).toBe('WATCH');
    expect(watchHealthStatus(5)).toBe('DEGRADED');
    expect(watchHealthStatus(10)).toBe('POSSIBLY_UNAVAILABLE');
  });

  it('does not let one 5-star vote outrank a proven highly rated source', () => {
    expect(weightedWatchRating(4.8, 300)).toBeGreaterThan(weightedWatchRating(5, 1));
  });

  it('lowers a degraded source beneath a similarly rated healthy source', () => {
    const sorted = sortWatchOptions([
      option({
        id: 'degraded',
        ratingAverage: 4.8,
        ratingCount: 100,
        healthStatus: 'DEGRADED',
      }),
      option({
        id: 'healthy',
        ratingAverage: 4.6,
        ratingCount: 100,
        healthStatus: 'HEALTHY',
      }),
    ]);
    expect(sorted[0]?.id).toBe('healthy');
  });
});

describe('quality honesty', () => {
  it('reports unknown quality rather than inventing a resolution', () => {
    expect(option().quality).toBe('UNKNOWN');
  });

  it('has no last-checked text until something has actually checked', () => {
    expect(lastCheckedText(null)).toBeNull();
  });

  it('describes how long ago a check happened', () => {
    const now = new Date('2026-01-01T12:00:00Z');
    expect(lastCheckedText(new Date('2026-01-01T09:00:00Z'), now)).toBe('Last checked 3h ago');
    expect(lastCheckedText(new Date('2026-01-01T11:30:00Z'), now)).toBe('Last checked 30m ago');
  });
});
