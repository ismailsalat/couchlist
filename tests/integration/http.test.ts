import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { seed } from '../../packages/db/src/scripts/seed';
import { reset } from '../../packages/db/src/scripts/reset';

/**
 * End-to-end HTTP tests against the real production build.
 *
 * The sandbox cannot download a Playwright browser, so these exercise the same
 * routes at the HTTP level: real Next.js server, real database, real session
 * cookies, real authorization. The browser-level assertions live in
 * tests/e2e/smoke.spec.ts for local runs.
 */
const PORT = 3123;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://postgres@127.0.0.1:5432/couchlist_test';

const TEST_USER = { discordId: '900000000000000101', username: 'test-user' };
const TEST_ALT = { discordId: '900000000000000102', username: 'test-alt' };
const TEST_GUILD = '900000000000000001';

let server: ChildProcess;

async function waitForServer(timeoutMs = 60_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${BASE_URL}/api/health`);
      if (response.status < 500) return;
    } catch {
      // Not up yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error('web server did not start in time');
}

/** Signs in through the dev login and returns the session cookie. */
async function login(account: { discordId: string; username: string }): Promise<string> {
  const response = await fetch(`${BASE_URL}/api/auth/dev-login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...account, guildIds: [TEST_GUILD] }),
  });

  expect(response.status).toBe(200);
  const cookie = response.headers.getSetCookie().find((value) => value.startsWith('couchlist_session'));
  expect(cookie).toBeTruthy();
  return cookie!.split(';')[0]!;
}

function authed(cookie: string): RequestInit {
  return { headers: { cookie, 'content-type': 'application/json' } };
}

beforeAll(async () => {
  await reset(DATABASE_URL);
  await seed(DATABASE_URL);

  server = spawn('npm', ['run', 'start', '--workspace', '@couchlist/web'], {
    cwd: new URL('../..', import.meta.url).pathname,
    env: {
      ...process.env,
      PORT: String(PORT),
      DATABASE_URL,
      ENVIRONMENT: 'development',
      NODE_ENV: 'production',
      ALLOW_DEV_LOGIN: 'true',
      APP_BASE_URL: BASE_URL,
      AUTH_SECRET: 'x'.repeat(32),
      DISCORD_CLIENT_ID: 'test',
      DISCORD_CLIENT_SECRET: 'test',
      TMDB_API_KEY: 'test',
      LOG_LEVEL: 'error',
    },
    stdio: 'ignore',
  });

  await waitForServer();
}, 90_000);

afterAll(() => {
  server?.kill('SIGTERM');
});

describe('public pages', () => {
  it('serves the landing page', async () => {
    const response = await fetch(BASE_URL);
    const html = await response.text();
    expect(response.status).toBe(200);
    expect(html).toContain('Track what');
    expect(html).toContain('Continue with Discord');
  });

  it('reports health without leaking infrastructure detail', async () => {
    const response = await fetch(`${BASE_URL}/api/health`);
    const body = await response.json();

    expect(body.database).toBe('healthy');
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain('postgres');
    expect(serialized).not.toContain('password');
    expect(serialized).not.toMatch(/5432/);
  });
});

describe('authentication', () => {
  it('rejects unauthenticated API access', async () => {
    for (const path of ['/api/me/list', '/api/me/profile', '/api/search?q=test']) {
      const response = await fetch(`${BASE_URL}${path}`);
      expect(response.status).toBe(401);
    }
  });

  it('redirects signed-out visitors away from private pages', async () => {
    const response = await fetch(`${BASE_URL}/home`, { redirect: 'manual' });
    expect([302, 307]).toContain(response.status);
  });

  it('issues an httpOnly session cookie on dev login', async () => {
    const response = await fetch(`${BASE_URL}/api/auth/dev-login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...TEST_USER, guildIds: [TEST_GUILD] }),
    });

    const cookie = response.headers.getSetCookie().find((v) => v.startsWith('couchlist_session'));
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=lax');
  });

  it('rejects a malformed dev login payload', async () => {
    const response = await fetch(`${BASE_URL}/api/auth/dev-login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ discordId: 'not-a-snowflake', username: 'x' }),
    });
    expect(response.status).toBe(400);
  });
});

describe('private data caching', () => {
  it('marks authenticated pages as private and uncacheable', async () => {
    const cookie = await login(TEST_USER);
    const response = await fetch(`${BASE_URL}/home`, authed(cookie));

    // `no-store` is what actually keeps a shared cache from holding this.
    const cacheControl = response.headers.get('cache-control') ?? '';
    expect(cacheControl).toContain('private');
    expect(cacheControl).toContain('no-store');
  });

  it('varies private API responses on the session cookie', async () => {
    const cookie = await login(TEST_USER);
    const response = await fetch(`${BASE_URL}/api/me/list`, authed(cookie));

    expect(response.headers.get('cache-control')).toContain('no-store');
    // Next replaces Vary on page routes but preserves it on API routes, which
    // is where a cache would most plausibly key on the response body.
    expect(response.headers.get('vary')).toContain('Cookie');
  });

  it('sets basic security headers', async () => {
    const response = await fetch(BASE_URL);
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('x-frame-options')).toBe('DENY');
  });
});

describe('list mutations', () => {
  it('reads the signed-in user\'s own list', async () => {
    const cookie = await login(TEST_USER);
    const response = await fetch(`${BASE_URL}/api/me/list`, authed(cookie));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.counts.COMPLETED).toBeGreaterThan(0);
  });

  it('rejects an out-of-range rating with a readable message', async () => {
    const cookie = await login(TEST_USER);
    const response = await fetch(`${BASE_URL}/api/me/list`, {
      method: 'PATCH',
      ...authed(cookie),
      body: JSON.stringify({
        media: { provider: 'ANILIST', providerMediaId: '16498', mediaType: 'ANIME' },
        rating: 99,
      }),
    });

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe('CL_VALIDATION_FAILED');
    expect(body.error.message).toMatch(/1 to 10/);
    expect(body.error.requestId).toMatch(/^req_/);
  });

  it('rejects negative progress', async () => {
    const cookie = await login(TEST_USER);
    const response = await fetch(`${BASE_URL}/api/me/list`, {
      method: 'PATCH',
      ...authed(cookie),
      body: JSON.stringify({
        media: { provider: 'ANILIST', providerMediaId: '16498', mediaType: 'ANIME' },
        progress: -5,
      }),
    });
    expect(response.status).toBe(400);
  });

  it('rejects episode progress on a movie', async () => {
    const cookie = await login(TEST_USER);
    const response = await fetch(`${BASE_URL}/api/me/list`, {
      method: 'PATCH',
      ...authed(cookie),
      body: JSON.stringify({
        media: { provider: 'TMDB', providerMediaId: '157336', mediaType: 'MOVIE' },
        progress: 3,
      }),
    });

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.message).toMatch(/Movies do not track episode progress/);
  });

  it('rejects an unsupported provider and type combination', async () => {
    const cookie = await login(TEST_USER);
    const response = await fetch(`${BASE_URL}/api/me/list`, {
      method: 'PATCH',
      ...authed(cookie),
      body: JSON.stringify({
        media: { provider: 'ANILIST', providerMediaId: '1', mediaType: 'MOVIE' },
        status: 'WATCHING',
      }),
    });
    expect(response.status).toBe(400);
  });

  it('updates a rating and persists it', async () => {
    const cookie = await login(TEST_USER);
    const media = { provider: 'ANILIST', providerMediaId: '16498', mediaType: 'ANIME' };

    const update = await fetch(`${BASE_URL}/api/me/list`, {
      method: 'PATCH',
      ...authed(cookie),
      body: JSON.stringify({ media, rating: 9.5 }),
    });
    expect(update.status).toBe(200);

    const list = await (await fetch(`${BASE_URL}/api/me/list`, authed(cookie))).json();
    const entry = list.entries.find(
      (row: { providerMediaId: string }) => row.providerMediaId === '16498',
    );
    expect(entry.rating).toBe(9.5);
  });

  it('reports a missing entry rather than creating one on PATCH', async () => {
    const cookie = await login(TEST_USER);
    const response = await fetch(`${BASE_URL}/api/me/list`, {
      method: 'PATCH',
      ...authed(cookie),
      body: JSON.stringify({
        media: { provider: 'ANILIST', providerMediaId: '99999999', mediaType: 'ANIME' },
        status: 'WATCHING',
      }),
    });

    expect(response.status).toBe(404);
    expect((await response.json()).error.message).toMatch(/not on your list/);
  });
});

describe('cross-user authorization', () => {
  it('lets two members of the same server compare', async () => {
    const mainCookie = await login(TEST_USER);
    await login(TEST_ALT);

    const profile = await (await fetch(`${BASE_URL}/api/me/profile`, authed(mainCookie))).json();
    expect(profile.user.username).toBe('test-user');

    // Discover the alt through the shared server rather than guessing an id.
    const guild = await (
      await fetch(`${BASE_URL}/api/guilds/${TEST_GUILD}`, authed(mainCookie))
    ).json();
    expect(guild.memberCount).toBe(2);
  });

  it('refuses a guild the user does not belong to', async () => {
    const cookie = await login(TEST_USER);
    const response = await fetch(`${BASE_URL}/api/guilds/900000000000000999`, authed(cookie));
    expect(response.status).toBe(403);
    expect((await response.json()).error.code).toBe('CL_FORBIDDEN_GUILD');
  });

  it('refuses comparison with an unknown user', async () => {
    const cookie = await login(TEST_USER);
    const response = await fetch(`${BASE_URL}/api/compare/usr_nonexistent`, authed(cookie));
    expect([403, 404]).toContain(response.status);
  });

  it('refuses Watch Together with someone who is not a Couchlist friend', async () => {
    const cookie = await login(TEST_USER);
    const response = await fetch(`${BASE_URL}/api/watch-together`, {
      method: 'POST',
      ...authed(cookie),
      body: JSON.stringify({
        userIds: ['usr_outsider', 'usr_another'],
        mediaType: 'anything',
      }),
    });

    expect(response.status).toBe(403);
  });
});

describe('watch together', () => {
  it('returns overlapping plan-to-watch titles for the seeded pair', async () => {
    const mainCookie = await login(TEST_USER);
    const altCookie = await login(TEST_ALT);

    const altId = (await (await fetch(`${BASE_URL}/api/me/profile`, authed(altCookie))).json()).user
      .id;

    const response = await fetch(`${BASE_URL}/api/watch-together`, {
      method: 'POST',
      ...authed(mainCookie),
      body: JSON.stringify({ userIds: [altId], mediaType: 'anything' }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    // Vinland Saga is on both seeded plan-to-watch lists.
    expect(body.candidates.map((item: { title: string }) => item.title)).toContain('Vinland Saga');
    expect(body.participants).toHaveLength(2);
  });

  it('excludes a title the group has already completed', async () => {
    const mainCookie = await login(TEST_USER);
    const altCookie = await login(TEST_ALT);
    const altId = (await (await fetch(`${BASE_URL}/api/me/profile`, authed(altCookie))).json()).user
      .id;

    const body = await (
      await fetch(`${BASE_URL}/api/watch-together`, {
        method: 'POST',
        ...authed(mainCookie),
        body: JSON.stringify({ userIds: [altId], mediaType: 'anything' }),
      })
    ).json();

    // Both seeded users completed Attack on Titan.
    expect(body.candidates.map((item: { title: string }) => item.title)).not.toContain(
      'Attack on Titan',
    );
  });

  it('filters by media type', async () => {
    const mainCookie = await login(TEST_USER);
    const altCookie = await login(TEST_ALT);
    const altId = (await (await fetch(`${BASE_URL}/api/me/profile`, authed(altCookie))).json()).user
      .id;

    const body = await (
      await fetch(`${BASE_URL}/api/watch-together`, {
        method: 'POST',
        ...authed(mainCookie),
        body: JSON.stringify({ userIds: [altId], mediaType: 'movie' }),
      })
    ).json();

    expect(body.candidates.every((item: { identity: { mediaType: string } }) =>
      item.identity.mediaType === 'MOVIE')).toBe(true);
  });
});

describe('session revocation', () => {
  it('stops accepting a cookie after the account is deleted', async () => {
    const cookie = await login({ discordId: '900000000000000199', username: 'temp-user' });

    expect((await fetch(`${BASE_URL}/api/me/list`, authed(cookie))).status).toBe(200);

    const deleted = await fetch(`${BASE_URL}/api/me/profile`, {
      method: 'DELETE',
      ...authed(cookie),
    });
    expect(deleted.status).toBe(200);

    // The same cookie must no longer authenticate anything.
    expect((await fetch(`${BASE_URL}/api/me/list`, authed(cookie))).status).toBe(401);
  });

  it('stops accepting a cookie after disconnecting', async () => {
    const cookie = await login({ discordId: '900000000000000198', username: 'temp-two' });

    await fetch(`${BASE_URL}/api/me/profile?mode=disconnect`, {
      method: 'DELETE',
      ...authed(cookie),
    });

    expect((await fetch(`${BASE_URL}/api/me/list`, authed(cookie))).status).toBe(401);
  });
});

describe('data export', () => {
  it('exports the caller\'s own data without session material', async () => {
    const cookie = await login(TEST_USER);
    const response = await fetch(`${BASE_URL}/api/me/profile`, {
      method: 'POST',
      ...authed(cookie),
    });

    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).toContain('entries');
    expect(body).not.toContain('tokenHash');
  });
});
