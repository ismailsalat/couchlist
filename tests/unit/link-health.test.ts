import { describe, expect, it, vi } from 'vitest';
import {
  HEALTH_FAILURES_BEFORE_FLAG,
  checkSourceHealth,
  countsAsFailure,
  describeFetchError,
  describeLastCheck,
  interpretStatus,
  needsAttention,
  sameSite,
  type HealthFetch,
} from '@couchlist/shared';

/**
 * The link checker asks somebody else's server a question on our behalf, and
 * then follows wherever that server points. That makes it the one part of the
 * app that can be aimed: a listing whose DNS changes, or a redirect to an
 * internal address, turns a maintenance job into a way of reaching things
 * nothing else can reach.
 *
 * These tests are mostly about refusing, and about not crying wolf.
 */

function respond(status: number, location?: string): Awaited<ReturnType<HealthFetch>> {
  return {
    status,
    headers: { get: (name: string) => (name.toLowerCase() === 'location' ? (location ?? null) : null) },
  };
}

describe('reading a response', () => {
  it('treats success as success', () => {
    for (const code of [200, 204, 299]) expect(interpretStatus(code).status).toBe('OK');
  });

  it('does not call a site dead for refusing a robot', () => {
    // Plenty of hosts turn away an unfamiliar client and serve browsers fine.
    // Counting these as failures would flag half the directory.
    for (const code of [401, 403, 405, 429]) {
      const verdict = interpretStatus(code);
      expect(verdict.status).toBe('OK');
      expect(verdict.detail).toMatch(/by hand/u);
    }
  });

  it('treats a genuine error as an error', () => {
    for (const code of [404, 410, 500, 502]) expect(interpretStatus(code).status).toBe('ERROR');
  });
});

describe('following redirects', () => {
  it('follows a redirect inside the same site and reports what it found', async () => {
    const doFetch = vi
      .fn<HealthFetch>()
      .mockResolvedValueOnce(respond(301, 'https://example.com/library'))
      .mockResolvedValueOnce(respond(200));

    const outcome = await checkSourceHealth('https://example.com/', doFetch);
    expect(outcome.status).toBe('OK');
    expect(doFetch).toHaveBeenCalledTimes(2);
    // Never automatic: each hop is checked before it is followed.
    expect(doFetch.mock.calls[0]![1].redirect).toBe('manual');
  });

  it('refuses a redirect into the private network', async () => {
    for (const target of [
      'http://127.0.0.1/admin',
      'http://169.254.169.254/latest/meta-data/',
      'http://10.0.0.5/',
      'http://[::1]/',
      'http://localhost:8080/',
    ]) {
      const doFetch = vi.fn<HealthFetch>().mockResolvedValueOnce(respond(302, target));
      const outcome = await checkSourceHealth('https://example.com/', doFetch);
      expect(outcome.status, `followed ${target}`).toBe('REFUSED');
      // Refused before the second request, not after it.
      expect(doFetch).toHaveBeenCalledTimes(1);
    }
  });

  it('refuses a redirect to a scheme it will not request', async () => {
    const doFetch = vi.fn<HealthFetch>().mockResolvedValueOnce(respond(302, 'file:///etc/passwd'));
    expect((await checkSourceHealth('https://example.com/', doFetch)).status).toBe('REFUSED');
  });

  it('gives up rather than following a redirect loop forever', async () => {
    const doFetch = vi
      .fn<HealthFetch>()
      .mockResolvedValue(respond(302, 'https://example.com/again'));
    const outcome = await checkSourceHealth('https://example.com/', doFetch);
    expect(outcome.status).toBe('MOVED');
    expect(doFetch.mock.calls.length).toBeLessThanOrEqual(6);
  });

  it('notices a move to a different site', async () => {
    const doFetch = vi
      .fn<HealthFetch>()
      .mockResolvedValueOnce(respond(301, 'https://somewhere-else.test/'))
      .mockResolvedValueOnce(respond(200));

    const outcome = await checkSourceHealth('https://example.com/', doFetch);
    expect(outcome.finalUrl).toContain('somewhere-else.test');
  });

  it('refuses a redirect that says nothing about where', async () => {
    const doFetch = vi.fn<HealthFetch>().mockResolvedValueOnce(respond(302));
    expect((await checkSourceHealth('https://example.com/', doFetch)).status).toBe('ERROR');
  });
});

describe('addresses it will not fetch at all', () => {
  it('refuses a stored address that no longer passes the safety checks', async () => {
    const doFetch = vi.fn<HealthFetch>();
    for (const url of ['http://127.0.0.1/', 'javascript:alert(1)', 'http://169.254.169.254/']) {
      const outcome = await checkSourceHealth(url, doFetch);
      expect(outcome.status).toBe('REFUSED');
    }
    // Never requested.
    expect(doFetch).not.toHaveBeenCalled();
  });
});

describe('when the network says nothing', () => {
  it('reports a timeout as unreachable rather than as an error', async () => {
    const doFetch = vi.fn<HealthFetch>().mockRejectedValue(
      Object.assign(new Error('aborted'), { name: 'AbortError' }),
    );
    const outcome = await checkSourceHealth('https://example.com/', doFetch, { timeoutMs: 1000 });
    expect(outcome.status).toBe('UNREACHABLE');
    expect(outcome.detail).toMatch(/within 1 second/u);
  });

  it('reports a refused connection as unreachable', async () => {
    const doFetch = vi.fn<HealthFetch>().mockRejectedValue(new Error('ECONNREFUSED'));
    expect((await checkSourceHealth('https://example.com/', doFetch)).status).toBe('UNREACHABLE');
  });
});

describe('deciding what is worth a moderator', () => {
  it('counts only real failures against a source', () => {
    expect(countsAsFailure('ERROR')).toBe(true);
    expect(countsAsFailure('UNREACHABLE')).toBe(true);
    // A site that moved is not a site that broke.
    expect(countsAsFailure('MOVED')).toBe(false);
    expect(countsAsFailure('OK')).toBe(false);
    expect(countsAsFailure('REFUSED')).toBe(false);
  });

  it('waits for a run of failures rather than reacting to one', () => {
    const base = { healthStatus: 'ERROR', openReports: 0 };
    expect(needsAttention({ ...base, healthFailures: 1 })).toBe(false);
    expect(needsAttention({ ...base, healthFailures: HEALTH_FAILURES_BEFORE_FLAG - 1 })).toBe(false);
    expect(needsAttention({ ...base, healthFailures: HEALTH_FAILURES_BEFORE_FLAG })).toBe(true);
  });

  it('flags a move or a refusal immediately, because both need a decision', () => {
    expect(needsAttention({ healthFailures: 0, healthStatus: 'MOVED', openReports: 0 })).toBe(true);
    expect(needsAttention({ healthFailures: 0, healthStatus: 'REFUSED', openReports: 0 })).toBe(true);
  });

  it('listens to people as well as to the network', () => {
    expect(needsAttention({ healthFailures: 0, healthStatus: 'OK', openReports: 3 })).toBe(true);
    expect(needsAttention({ healthFailures: 0, healthStatus: 'OK', openReports: 2 })).toBe(false);
  });
});

describe('comparing hosts', () => {
  it('treats www as the same site', () => {
    expect(sameSite('www.example.com', 'example.com')).toBe(true);
    expect(sameSite('EXAMPLE.com', 'example.com')).toBe(true);
  });

  it('does not treat a lookalike as the same site', () => {
    expect(sameSite('example.com', 'example.net')).toBe(false);
    expect(sameSite('example.com', 'evil-example.com')).toBe(false);
  });
});

describe('describing the last check to a reader', () => {
  const at = new Date('2026-06-10T12:00:00Z');

  it('says nothing when the address has never been checked', () => {
    expect(
      describeLastCheck({ at: null, status: null, failures: 0, now: at }),
    ).toBeNull();
  });

  it('counts the days in words a reader expects', () => {
    const cases: Array<[string, string]> = [
      ['2026-06-10T18:00:00Z', 'Link checked today.'],
      ['2026-06-11T13:00:00Z', 'Link checked yesterday.'],
      ['2026-06-13T12:00:00Z', 'Link checked 3 days ago.'],
      ['2026-07-10T12:00:00Z', 'Link checked 30 days ago.'],
    ];

    for (const [now, expected] of cases) {
      expect(
        describeLastCheck({ at, status: 'OK', failures: 0, now: new Date(now) }),
      ).toBe(expected);
    }
  });

  it('claims no upkeep once the check is older than a month', () => {
    expect(
      describeLastCheck({ at, status: 'OK', failures: 0, now: new Date('2026-08-01T12:00:00Z') }),
    ).toBeNull();
  });

  it('ignores a clock that reads earlier than the check', () => {
    expect(
      describeLastCheck({ at, status: 'OK', failures: 0, now: new Date('2026-06-09T12:00:00Z') }),
    ).toBeNull();
  });

  it('tells a reader about a failing address without calling it dead', () => {
    const note = describeLastCheck({
      at,
      status: 'UNREACHABLE',
      failures: HEALTH_FAILURES_BEFORE_FLAG,
      now: new Date('2026-06-11T12:00:00Z'),
    });

    expect(note).toContain('could not reach');
    expect(note).toContain('may be temporary');
    expect(note).not.toContain('dead');
    expect(note).not.toContain('broken');
  });

  it('says nothing alarming while failures are still below the threshold', () => {
    expect(
      describeLastCheck({
        at,
        status: 'ERROR',
        failures: HEALTH_FAILURES_BEFORE_FLAG - 1,
        now: new Date('2026-06-11T12:00:00Z'),
      }),
    ).toBe('Link checked yesterday.');
  });

  it('mentions a redirect, because the listing is now pointing elsewhere', () => {
    expect(
      describeLastCheck({ at, status: 'MOVED', failures: 0, now: new Date('2026-06-11T12:00:00Z') }),
    ).toContain('redirects somewhere else');
  });
});

describe('putting a connection failure in words', () => {
  it('names the common failures instead of saying "fetch failed"', () => {
    const cases: Array<[string, RegExp]> = [
      ['ENOTFOUND', /no longer resolves/],
      ['ECONNREFUSED', /refused the connection/],
      ['ECONNRESET', /closed the connection/],
      ['ETIMEDOUT', /timed out/],
      ['EHOSTUNREACH', /No route/],
      ['CERT_HAS_EXPIRED', /certificate has expired/],
      ['ERR_TLS_CERT_ALTNAME_INVALID', /different domain/],
    ];

    for (const [code, expected] of cases) {
      const error = Object.assign(new TypeError('fetch failed'), { cause: { code } });
      expect(describeFetchError(error, 10_000)).toMatch(expected);
    }
  });

  it('reports a timeout as the wait a reader would recognise', () => {
    const abort = Object.assign(new Error('aborted'), { name: 'AbortError' });
    expect(describeFetchError(abort, 10_000)).toBe('No answer within 10 seconds.');
  });

  it('never passes Node\'s empty message through', () => {
    expect(describeFetchError(new TypeError('fetch failed'), 10_000)).toBe('Could not connect.');
    expect(describeFetchError(undefined, 10_000)).toBe('Could not connect.');
  });

  it('keeps a message that actually says something', () => {
    expect(describeFetchError(new Error('Unsupported protocol'), 10_000)).toBe(
      'Unsupported protocol',
    );
  });
});
