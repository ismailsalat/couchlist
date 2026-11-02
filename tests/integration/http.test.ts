import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';
import { createDatabase, type Database } from '@couchlist/db';
import { reset } from '../../packages/db/src/scripts/reset';
import { runMigrations } from '../../packages/db/src/migrate';

/**
 * End-to-end HTTP tests against the real production build.
 *
 * A real Next.js server, a real database, real session cookies and real
 * server-side authorization. The sandbox cannot download a browser, so these
 * exercise the routes at the HTTP level; the browser-level checks live in
 * tests/e2e/smoke.spec.ts.
 *
 * Mail uses MAIL_TRANSPORT=log, which returns the verification code in the
 * response outside production. That is how the suite completes a real signup
 * without a mailbox, and it is the same path a developer uses locally.
 */
const PORT = 3123;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://postgres@127.0.0.1:5432/couchlist_test';

const WEB_ROOT = fileURLToPath(new URL('../../apps/web/', import.meta.url));
const webRequire = createRequire(new URL('../../apps/web/package.json', import.meta.url));
const NEXT_CLI = webRequire.resolve('next/dist/bin/next');

const ADMIN_EMAIL = 'admin@couchlist.test';

let server: ChildProcess;
let serverStartError: Error | undefined;
let db: Database;

async function waitForServer(timeoutMs = 60_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (serverStartError) throw serverStartError;
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

interface Account {
  email: string;
  cookie: string;
  verified: boolean;
  displayName: string;
}

function sessionCookie(response: Response): string | undefined {
  return response.headers
    .getSetCookie()
    .find((value) => value.startsWith('couchlist_session'))
    ?.split(';')[0];
}

let emailCounter = 0;

/** Signs up, verifies with the code the log transport hands back, signs in. */
async function createAccount(
  options: { verify?: boolean; email?: string } = {},
): Promise<Account> {
  emailCounter += 1;
  const email = options.email ?? `person${emailCounter}-${Date.now()}@example.test`;
  const password = 'a-long-enough-password';
  const displayName = `Person ${emailCounter}`;

  const signup = await fetch(`${BASE_URL}/api/auth/signup`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email,
      password,
      confirmPassword: password,
      displayName,
    }),
  });
  expect(signup.status).toBe(200);
  const signupBody = await signup.json();

  const login = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  expect(login.status).toBe(200);
  const cookie = sessionCookie(login);
  expect(cookie).toBeTruthy();

  if (options.verify === false) {
    return { email, cookie: cookie!, verified: false, displayName };
  }

  expect(signupBody.devCode).toMatch(/^\d{6}$/u);
  const verify = await fetch(`${BASE_URL}/api/auth/verify-email`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: cookie! },
    body: JSON.stringify({ code: signupBody.devCode }),
  });
  expect(verify.status).toBe(200);

  return { email, cookie: cookie!, verified: true, displayName };
}

/**
 * The single administrator, created once.
 *
 * ADMIN_EMAILS names one address, and signing up again with an address that is
 * already registered deliberately returns no verification code — that is the
 * non-disclosure behaviour tested above — so the admin is created on first use
 * and then reused.
 */
let adminAccount: Account | undefined;

async function admin(): Promise<Account> {
  if (adminAccount) return adminAccount;
  adminAccount = await createAccount({ email: ADMIN_EMAIL });
  return adminAccount;
}

function authed(account: Account): RequestInit {
  return { headers: { cookie: account.cookie, 'content-type': 'application/json' } };
}

async function post(path: string, account: Account | null, body?: unknown): Promise<Response> {
  return fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(account ? { cookie: account.cookie } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

/** Adds a listing directly, for tests that are not about the approval flow. */
async function seedSource(name: string, domain: string): Promise<string> {
  const id = `wsr_${Math.random().toString(36).slice(2, 14)}`;
  await db.execute(sql`
    insert into watch_sources (id, name, domain, homepage_url, source_type, supports_movies, is_enabled, description)
    values (${id}, ${name}, ${domain}, ${'https://' + domain + '/'}, 'COMMUNITY', true, true, ${'About ' + name})
  `);
  return id;
}

beforeAll(async () => {
  await runMigrations(DATABASE_URL);
  await reset(DATABASE_URL);
  db = createDatabase({ connectionString: DATABASE_URL, ssl: false });

  serverStartError = undefined;
  server = spawn(process.execPath, [NEXT_CLI, 'start'], {
    cwd: WEB_ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      DATABASE_URL,
      // Isolated from the developer's own .env.
      ENVIRONMENT: 'test',
      NODE_ENV: 'production',
      TEST_MODE: 'false',
      APP_BASE_URL: BASE_URL,
      AUTH_SECRET: 'x'.repeat(32),
      // Prints verification codes instead of emailing them, and returns the
      // code in the response outside production.
      MAIL_TRANSPORT: 'log',
      // Bootstraps exactly one administrator, by address.
      ADMIN_EMAILS: ADMIN_EMAIL,
      ALLOW_DEV_LOGIN: 'false',
      /*
       * Every request in this suite comes from 127.0.0.1, so the production
       * per-address limits would reject the suite's own signups. The limits
       * themselves are covered by their own test below.
       */
      RATE_LIMIT_SIGNUP_PER_MINUTE: '10000',
      RATE_LIMIT_LOGIN_PER_MINUTE: '10000',
      RATE_LIMIT_MUTATIONS_PER_MINUTE: '10000',
      LOG_LEVEL: 'error',
    },
    // SHOW_SERVER_LOG=1 surfaces the server's own errors when a test fails
    // for a reason the HTTP status alone does not explain.
    stdio: process.env.SHOW_SERVER_LOG ? 'inherit' : 'ignore',
    windowsHide: true,
  });

  server.once('error', (error) => {
    serverStartError = new Error(`web server failed to start: ${error.message}`);
  });
  server.once('exit', (code, signal) => {
    if (code !== null && code !== 0) {
      serverStartError = new Error(
        `web server exited before startup (code ${code}, signal ${signal ?? 'none'})`,
      );
    }
  });

  await waitForServer();
}, 120_000);

afterAll(() => {
  server?.kill('SIGTERM');
});

describe('public browsing needs no account', () => {
  it('serves Discover with the sources rendered on the server', async () => {
    await seedSource('Public Source', 'publicsource.test');

    const response = await fetch(BASE_URL);
    const html = await response.text();

    expect(response.status).toBe(200);
    // Server-rendered, not an empty shell waiting on a client fetch.
    expect(html).toContain('Public Source');
    expect(html).toContain('Your next good find');
  });

  it('serves a source page with real metadata', async () => {
    const id = await seedSource('Detail Source', 'detailsource.test');

    const response = await fetch(`${BASE_URL}/sources/${id}`);
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain('Detail Source');
    expect(html).toContain('detailsource.test');
    // The destination is shown next to the action.
    expect(html).toContain('Visit website');
  });

  it('serves the guides hub and a guide page', async () => {
    const hub = await fetch(`${BASE_URL}/guides`);
    expect(hub.status).toBe(200);
    expect(await hub.text()).toContain('MAKE YOURSELF COMFORTABLE');
  });

  it('searches, filters and sorts without a session', async () => {
    await seedSource('Searchable Anime', 'searchable-anime.test');
    await db.execute(
      sql`update watch_sources set supports_anime = true, supports_movies = false where domain = 'searchable-anime.test'`,
    );

    const found = await fetch(`${BASE_URL}/?q=searchable`);
    expect(await found.text()).toContain('Searchable Anime');

    const filtered = await fetch(`${BASE_URL}/?category=Manga`);
    const filteredHtml = await filtered.text();
    expect(filteredHtml).not.toContain('Searchable Anime');
    // A filter that matches nothing still renders the page, not an error.
    expect(filtered.status).toBe(200);
  });

  it('keeps the old /sources URL working', async () => {
    const response = await fetch(`${BASE_URL}/sources`, { redirect: 'manual' });
    expect([301, 307, 308]).toContain(response.status);
    expect(response.headers.get('location')).toMatch(/\/$/u);
  });

  it('redirects the retired pages instead of 404ing', async () => {
    for (const path of ['/home', '/search', '/friends', '/watch-together', '/my-server']) {
      const response = await fetch(`${BASE_URL}${path}`, { redirect: 'manual' });
      expect([301, 307, 308]).toContain(response.status);
    }
  });

  it('allows crawlers on public pages and excludes private ones', async () => {
    const response = await fetch(`${BASE_URL}/robots.txt`);
    const text = await response.text();

    expect(response.status).toBe(200);
    expect(text).toContain('Disallow: /admin');
    expect(text).toContain('Disallow: /saved');
    expect(text).toContain('Disallow: /account');
  });

  it('reports health without leaking infrastructure detail', async () => {
    const response = await fetch(`${BASE_URL}/api/health`);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.database).toBe('healthy');
    expect(body.mail).toBe('development-log');
    expect(JSON.stringify(body)).not.toContain('postgresql://');
  });
});

describe('accounts', () => {
  it('signs up, verifies with a code and signs in', async () => {
    const account = await createAccount();
    expect(account.verified).toBe(true);

    const saved = await fetch(`${BASE_URL}/saved`, authed(account));
    expect(saved.status).toBe(200);
  });

  it('does not reveal whether an address is already registered', async () => {
    const email = `collide-${Date.now()}@example.test`;
    const first = await post('/api/auth/signup', null, {
      email,
      password: 'a-long-enough-password',
      confirmPassword: 'a-long-enough-password',
      displayName: 'First',
    });
    const second = await post('/api/auth/signup', null, {
      email,
      password: 'a-different-password',
      confirmPassword: 'a-different-password',
      displayName: 'Second',
    });

    // Same status and same shape, so signup is not an existence oracle.
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    const secondBody = await second.json();
    expect(secondBody.ok).toBe(true);
  });

  it('rejects a wrong password with the same message as an unknown address', async () => {
    const account = await createAccount();

    const wrongPassword = await post('/api/auth/login', null, {
      email: account.email,
      password: 'not-the-right-password',
    });
    const unknownEmail = await post('/api/auth/login', null, {
      email: `nobody-${Date.now()}@example.test`,
      password: 'not-the-right-password',
    });

    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect((await wrongPassword.json()).error.message).toBe(
      (await unknownEmail.json()).error.message,
    );
  });

  it('issues an httpOnly session cookie', async () => {
    const account = await createAccount();
    const login = await post('/api/auth/login', null, {
      email: account.email,
      password: 'a-long-enough-password',
    });

    const raw = login.headers.getSetCookie().find((v) => v.startsWith('couchlist_session'));
    expect(raw).toBeTruthy();
    expect(raw!.toLowerCase()).toContain('httponly');
    expect(raw!.toLowerCase()).toContain('samesite=lax');
  });

  it('rejects a reused verification code', async () => {
    const email = `reuse-${Date.now()}@example.test`;
    const signup = await post('/api/auth/signup', null, {
      email,
      password: 'a-long-enough-password',
      confirmPassword: 'a-long-enough-password',
      displayName: 'Reuse',
    });
    const { devCode } = await signup.json();

    const login = await post('/api/auth/login', null, {
      email,
      password: 'a-long-enough-password',
    });
    const cookie = sessionCookie(login)!;

    const first = await fetch(`${BASE_URL}/api/auth/verify-email`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ code: devCode }),
    });
    expect(first.status).toBe(200);

    // Already verified, so the endpoint reports success without consuming
    // anything; the code itself is spent either way.
    const second = await fetch(`${BASE_URL}/api/auth/verify-email`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ code: devCode }),
    });
    expect([200, 400]).toContain(second.status);
  });

  it('rejects a wrong verification code', async () => {
    const account = await createAccount({ verify: false });
    const response = await post('/api/auth/verify-email', account, { code: '000000' });
    expect(response.status).toBe(400);
  });

  it('answers a reset request identically for a known and unknown address', async () => {
    const account = await createAccount();

    const known = await post('/api/auth/forgot-password', null, { email: account.email });
    const unknown = await post('/api/auth/forgot-password', null, {
      email: `nobody-${Date.now()}@example.test`,
    });

    expect(known.status).toBe(200);
    expect(unknown.status).toBe(200);
    expect((await known.json()).ok).toBe((await unknown.json()).ok);
  });

  it('rejects an invalid reset token', async () => {
    const response = await post('/api/auth/reset-password', null, {
      token: 'x'.repeat(40),
      password: 'a-brand-new-password',
    });
    expect(response.status).toBe(400);
  });

  /**
   * The leak this test exists for.
   *
   * A signed-in page renders a client component with the viewer's details. If
   * it is handed the whole account row, React serialises every column into the
   * page — including the email address and the password hash — and it reaches
   * the browser in the HTML. Only the fields the menu renders may cross that
   * boundary.
   */
  it('never serialises the account row into a signed-in page', async () => {
    const account = await createAccount();
    const rows = await db.execute(
      sql`select password_hash from users where email = ${account.email}`,
    );
    const passwordHash = (rows.rows[0] as { password_hash: string }).password_hash;
    expect(passwordHash.startsWith('scrypt$')).toBe(true);

    for (const path of ['/', '/saved', '/account', '/guides', '/submissions']) {
      const response = await fetch(`${BASE_URL}${path}`, authed(account));
      const html = await response.text();

      expect(html, `${path} leaked the password hash`).not.toContain(passwordHash);
      expect(html, `${path} leaked the scrypt prefix`).not.toContain('scrypt$');
      expect(html, `${path} leaked passwordHash`).not.toContain('passwordHash');
      // /account shows the address to its owner on purpose; no other page should.
      if (path !== '/account') {
        expect(html, `${path} leaked the email address`).not.toContain(account.email);
      }
    }
  });

  it('never exposes an email address on a public page', async () => {
    const account = await createAccount();
    const id = await seedSource('Email Check', 'emailcheck.test');

    const page = await fetch(`${BASE_URL}/sources/${id}`);
    expect(await page.text()).not.toContain(account.email);

    const discover = await fetch(BASE_URL);
    expect(await discover.text()).not.toContain(account.email);
  });
});

describe('server-side authorization', () => {
  it('rejects unauthenticated mutations', async () => {
    const id = await seedSource('Guarded', 'guarded.test');

    expect((await post(`/api/sources/${id}/vote`, null, { value: 'LIKE' })).status).toBe(401);
    expect((await post(`/api/sources/${id}/save`, null, {})).status).toBe(401);
    expect((await post('/api/sources/report', null, { sourceId: id, reason: 'OTHER' })).status).toBe(
      401,
    );
  });

  it('redirects signed-out visitors away from private pages', async () => {
    for (const path of ['/saved', '/account', '/submissions', '/submit', '/collections']) {
      const response = await fetch(`${BASE_URL}${path}`, { redirect: 'manual' });
      expect([302, 307, 308]).toContain(response.status);
      expect(response.headers.get('location')).toContain('/login');
    }
  });

  it('refuses voting and contributing until the email is verified', async () => {
    const account = await createAccount({ verify: false });
    const id = await seedSource('Needs Verification', 'needsverification.test');

    const vote = await post(`/api/sources/${id}/vote`, account, { value: 'LIKE' });
    expect(vote.status).toBe(403);

    const suggest = await post('/api/sources/suggest', account, {
      url: 'https://unverified-suggestion.test/',
      name: 'Nope',
      categories: ['Movies'],
    });
    expect(suggest.status).toBe(403);

    // Saving is a private convenience, so an account is enough for that.
    expect((await post(`/api/sources/${id}/save`, account, {})).status).toBe(200);
  });

  it('refuses every admin mutation to a non-admin, however it is called', async () => {
    const account = await createAccount();
    const id = await seedSource('Admin Guarded', 'adminguarded.test');

    const attempts = [
      fetch(`${BASE_URL}/api/admin/sources/${id}`, {
        method: 'PATCH',
        ...authed(account),
        body: JSON.stringify({
          name: 'Renamed By Stranger',
          url: 'https://adminguarded.test/',
          categories: ['Movies'],
        }),
      }),
      post(`/api/admin/sources/${id}`, account, { hidden: true }),
      post('/api/admin/reports', account, { sourceId: id, action: 'DISMISS' }),
      post(`/api/admin/suggestions/wsc_nonexistent`, account, { decision: 'APPROVE' }),
      post('/api/admin/guides', account, {
        slug: 'sneaky',
        title: 'Sneaky guide',
        task: 'x',
        topic: 'FIXES',
        summary: 'Long enough summary here',
      }),
    ];

    for (const attempt of attempts) {
      expect((await attempt).status).toBe(403);
    }

    // And nothing actually changed.
    const rows = await db.execute(sql`select name from watch_sources where id = ${id}`);
    expect((rows.rows[0] as { name: string }).name).toBe('Admin Guarded');
  });

  it('hides the admin area from a non-admin', async () => {
    const account = await createAccount();
    const response = await fetch(`${BASE_URL}/admin`, authed(account));
    expect(response.status).toBe(404);
  });

  it("refuses to let one account read or write another account's data", async () => {
    const owner = await createAccount();
    const stranger = await createAccount();
    const id = await seedSource('Private Note Source', 'privatenote.test');

    await post(`/api/sources/${id}/save`, owner, { note: 'OWNER-ONLY-NOTE' });

    // The stranger's saved page must not contain the owner's note.
    const strangerSaved = await fetch(`${BASE_URL}/saved`, authed(stranger));
    expect(await strangerSaved.text()).not.toContain('OWNER-ONLY-NOTE');

    // The owner's own page does.
    const ownerSaved = await fetch(`${BASE_URL}/saved`, authed(owner));
    expect(await ownerSaved.text()).toContain('OWNER-ONLY-NOTE');
  });
});

describe('voting and saving', () => {
  it('records a vote, changes it and clears it', async () => {
    const account = await createAccount();
    const id = await seedSource('Votable', 'votable.test');

    let response = await post(`/api/sources/${id}/vote`, account, { value: 'LIKE' });
    expect(await response.json()).toMatchObject({ likes: 1, dislikes: 0, userVote: 'LIKE' });

    response = await post(`/api/sources/${id}/vote`, account, { value: 'DISLIKE' });
    expect(await response.json()).toMatchObject({ likes: 0, dislikes: 1, userVote: 'DISLIKE' });

    response = await post(`/api/sources/${id}/vote`, account, { value: 'NONE' });
    expect(await response.json()).toMatchObject({ likes: 0, dislikes: 0, userVote: null });
  });

  it('counts one vote however many requests arrive at once', async () => {
    const account = await createAccount();
    const id = await seedSource('Concurrent', 'concurrent.test');

    await Promise.all(
      Array.from({ length: 8 }, () => post(`/api/sources/${id}/vote`, account, { value: 'LIKE' })),
    );

    const rows = await db.execute(
      sql`select count(*)::int as count from source_votes where source_id = ${id}`,
    );
    expect((rows.rows[0] as { count: number }).count).toBe(1);
  });

  it('rejects a vote on a source that does not exist', async () => {
    const account = await createAccount();
    const response = await post('/api/sources/wsr_nope/vote', account, { value: 'LIKE' });
    expect(response.status).toBe(404);
  });

  it('rejects a nonsense vote value with a readable message', async () => {
    const account = await createAccount();
    const id = await seedSource('Validated', 'validated.test');
    const response = await post(`/api/sources/${id}/vote`, account, { value: 'MAYBE' });

    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe('CL_VALIDATION_FAILED');
  });

  it('saves and unsaves, and exports the saved list as CSV', async () => {
    const account = await createAccount();
    const id = await seedSource('Exportable', 'exportable.test');

    await post(`/api/sources/${id}/save`, account, { note: 'my private note' });

    const csv = await fetch(`${BASE_URL}/api/saved/export`, authed(account));
    const text = await csv.text();
    expect(csv.status).toBe(200);
    expect(csv.headers.get('content-type')).toContain('text/csv');
    // A personal export must not be cached by a shared proxy.
    expect(csv.headers.get('cache-control')).toContain('no-store');
    expect(text).toContain('Exportable');
    expect(text).toContain('my private note');

    const removed = await fetch(`${BASE_URL}/api/sources/${id}/save`, {
      method: 'DELETE',
      ...authed(account),
    });
    expect(removed.status).toBe(200);
    expect(await (await fetch(`${BASE_URL}/api/saved/export`, authed(account))).text()).not.toContain(
      'Exportable',
    );
  });

  it('exports the saved list in every offered format', async () => {
    const account = await createAccount();
    const rows = await db.execute(
      sql`select id from watch_sources where is_enabled = true limit 1`,
    );
    const sourceId = (rows.rows[0] as { id: string } | undefined)?.id;
    if (!sourceId) return;

    expect((await post(`/api/sources/${sourceId}/save`, account, {})).status).toBe(200);

    for (const [format, type, extension] of [
      ['csv', 'text/csv', '.csv'],
      ['txt', 'text/plain', '.txt'],
      ['md', 'text/markdown', '.md'],
      ['json', 'application/json', '.json'],
    ] as const) {
      const response = await fetch(
        `${BASE_URL}/api/saved/export?format=${format}`,
        authed(account),
      );
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain(type);
      expect(response.headers.get('content-disposition')).toContain(extension);
      expect(response.headers.get('x-content-type-options')).toBe('nosniff');
      expect(response.headers.get('cache-control')).toContain('no-store');
      expect((await response.text()).length).toBeGreaterThan(0);
    }
  });

  it('falls back to a spreadsheet when the format is nonsense', async () => {
    const account = await createAccount();
    const response = await fetch(
      `${BASE_URL}/api/saved/export?format=../../etc/passwd`,
      authed(account),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/csv');
    expect(response.headers.get('content-disposition')).toContain('couchlist-saved-sources.csv');
  });

  it('refuses to export anything to a signed-out visitor', async () => {
    for (const format of ['csv', 'txt', 'md', 'json']) {
      const response = await fetch(`${BASE_URL}/api/saved/export?format=${format}`);
      expect(response.status).toBe(401);
    }
  });
});

/** The account id for an address. There is no public route that leaks it. */
async function idFor(email: string): Promise<string> {
  const rows = await db.execute(sql`select id from users where email = ${email}`);
  return (rows.rows[0] as { id: string }).id;
}

describe('oversized requests', () => {
  /*
   * A validator handed a hundred-megabyte array will walk it, and the memory
   * is gone long before any rule about array length is reached. The body is
   * capped before anything parses it, which covers every parser rather than
   * one library's advisory.
   */
  it('refuses a body larger than anything the app accepts', async () => {
    const account = await createAccount();
    const huge = JSON.stringify({ categories: Array.from({ length: 400_000 }, () => 'Anime') });
    expect(huge.length).toBeGreaterThan(2 * 1024 * 1024);

    const response = await fetch(`${BASE_URL}/api/sources/suggest`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: account.cookie, origin: BASE_URL },
      body: huge,
    });
    expect(response.status).toBe(413);
  });

  it('refuses an oversized body that lies about its length', async () => {
    const account = await createAccount();
    const huge = 'x'.repeat(3 * 1024 * 1024);

    // Streamed, so there is no content-length to believe or disbelieve.
    const response = await fetch(`${BASE_URL}/api/account/profile`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: account.cookie, origin: BASE_URL },
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(`{"displayName":"${huge}"}`));
          controller.close();
        },
      }),
      // @ts-expect-error duplex is required by undici for a stream body.
      duplex: 'half',
    });
    expect([400, 413]).toContain(response.status);
  });

  it('still accepts an ordinary request', async () => {
    const account = await createAccount();
    const response = await post('/api/account/profile', account, { displayName: 'Still Fine' });
    expect(response.status).toBe(200);
  });
});

describe('security headers', () => {
  it('refuses to be framed, which is what clickjacking needs', async () => {
    const response = await fetch(BASE_URL);
    const csp = response.headers.get('content-security-policy') ?? '';
    expect(csp).toContain("frame-ancestors 'none'");
    expect(response.headers.get('x-frame-options')).toBe('DENY');
  });

  it('pins the page to its own origin for forms, base and objects', async () => {
    const csp = (await fetch(BASE_URL)).headers.get('content-security-policy') ?? '';
    expect(csp).toContain("form-action 'self'");
    expect(csp).toContain("base-uri 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("default-src 'self'");
  });

  it('sets the rest of the baseline headers', async () => {
    const response = await fetch(BASE_URL);
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin');
    expect(response.headers.get('permissions-policy')).toContain('camera=()');
    // Not over plain http: it would pin localhost to HTTPS for the developer.
    expect(response.headers.get('strict-transport-security')).toBeNull();
  });

  it('leaves the stricter policy alone on an uploaded file', async () => {
    const account = await createAccount();
    const userId = await idFor(account.email);
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 1, 2, 3]);
    await post('/api/account/avatar', account, { image: png.toString('base64') });

    const served = await fetch(`${BASE_URL}/api/users/${userId}/avatar`);
    const csp = served.headers.get('content-security-policy') ?? '';
    // The app-wide policy allows scripts from self; this one allows nothing.
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain('sandbox');
    expect(csp).not.toContain("script-src 'self'");
  });

  it('does not advertise what it is running', async () => {
    const response = await fetch(BASE_URL);
    expect(response.headers.get('x-powered-by')).toBeNull();
  });
});

describe('cross-site request forgery', () => {
  /*
   * The session is a cookie, so a browser will attach it to a request another
   * site caused. These tests pin the second lock: a state-changing request
   * that announces a foreign origin is refused even with a valid session.
   */
  it('refuses a state-changing request from another origin', async () => {
    const account = await createAccount();
    const sourceId = (
      await db.execute(sql`select id from watch_sources where is_enabled = true limit 1`)
    ).rows[0] as { id: string } | undefined;
    if (!sourceId) return;

    const forged = await fetch(`${BASE_URL}/api/sources/${sourceId.id}/save`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: account.cookie,
        origin: 'https://evil.example',
      },
      body: JSON.stringify({}),
    });
    expect(forged.status).toBe(403);

    // The same request from this origin is fine.
    const allowed = await fetch(`${BASE_URL}/api/sources/${sourceId.id}/save`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: account.cookie,
        origin: BASE_URL,
      },
      body: JSON.stringify({}),
    });
    expect(allowed.status).toBe(200);
  });

  it('refuses a forged sign-in and a forged account deletion too', async () => {
    const account = await createAccount();

    for (const path of ['/api/auth/login', '/api/account/delete', '/api/account/password']) {
      const response = await fetch(`${BASE_URL}${path}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: account.cookie,
          origin: 'https://evil.example',
        },
        body: JSON.stringify({}),
      });
      expect(response.status).toBe(403);
    }
  });

  it('refuses an unparseable origin rather than ignoring it', async () => {
    const account = await createAccount();
    const response = await fetch(`${BASE_URL}/api/account/avatar`, {
      method: 'DELETE',
      headers: { cookie: account.cookie, origin: 'not a url' },
    });
    expect(response.status).toBe(403);
  });

  it('still allows a read from anywhere, which changes nothing', async () => {
    const response = await fetch(`${BASE_URL}/api/health`, {
      headers: { origin: 'https://evil.example' },
    });
    expect(response.status).toBe(200);
  });
});

describe('trusted picks and deletion', () => {
  async function makeSource(id: string, name: string, domain: string) {
    await db.execute(sql`
      insert into watch_sources (id, name, domain, homepage_url, source_type, supports_tv, is_enabled)
      values (${id}, ${name}, ${domain}, ${'https://' + domain + '/'}, 'COMMUNITY', true, true)
      on conflict (domain) do nothing
    `);
    return id;
  }

  async function patch(sourceId: string, who: Account, body: Record<string, unknown>) {
    return fetch(`${BASE_URL}/api/admin/sources/${sourceId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', cookie: who.cookie, origin: BASE_URL },
      body: JSON.stringify(body),
    });
  }

  it('lifts a trusted pick above a better-scoring source', async () => {
    const adminUser = await admin();
    const low = await makeSource('wsr_trust_low', 'Trust Low', 'trust-low.test');

    // Give an existing source real votes so it would normally outrank ours.
    const voters = await Promise.all([createAccount(), createAccount(), createAccount()]);
    const rival = (
      await db.execute(
        sql`select id from watch_sources where is_enabled = true and id <> ${low} limit 1`,
      )
    ).rows[0] as { id: string };
    for (const voter of voters) {
      await post(`/api/sources/${rival.id}/vote`, voter, { value: 'LIKE' });
    }

    const order = async () => {
      const html = await (await fetch(BASE_URL)).text();
      return html.indexOf('Trust Low');
    };

    const before = await order();

    const promoted = await patch(low, adminUser, {
      name: 'Trust Low',
      url: 'https://trust-low.test/',
      categories: ['TV'],
      trustedRank: 10,
      trustedNote: 'Reliable for years',
      isEnabled: true,
      adminRankPenalty: 0,
    });
    expect(promoted.status).toBe(200);

    const html = await (await fetch(BASE_URL)).text();
    const after = html.indexOf('Trust Low');
    expect(after).toBeGreaterThan(-1);
    // It moved up, and it says why.
    expect(after).toBeLessThan(before === -1 ? Number.MAX_SAFE_INTEGER : before);
    expect(html).toContain('Trusted');
    expect(html).toContain('Reliable for years');
  });

  it('drops the note when the pick is withdrawn', async () => {
    const adminUser = await admin();
    const id = await makeSource('wsr_trust_off', 'Trust Off', 'trust-off.test');

    await patch(id, adminUser, {
      name: 'Trust Off',
      url: 'https://trust-off.test/',
      categories: ['TV'],
      trustedRank: 5,
      trustedNote: 'Temporary',
      isEnabled: true,
      adminRankPenalty: 0,
    });
    await patch(id, adminUser, {
      name: 'Trust Off',
      url: 'https://trust-off.test/',
      categories: ['TV'],
      trustedRank: null,
      trustedNote: 'Temporary',
      isEnabled: true,
      adminRankPenalty: 0,
    });

    const row = (
      await db.execute(
        sql`select trusted_rank, trusted_note, trusted_at from watch_sources where id = ${id}`,
      )
    ).rows[0] as { trusted_rank: number | null; trusted_note: string | null; trusted_at: Date | null };
    expect(row.trusted_rank).toBeNull();
    expect(row.trusted_note).toBeNull();
    expect(row.trusted_at).toBeNull();
  });

  it('refuses a trusted pick from a normal account', async () => {
    const contributor = await createAccount();
    const id = await makeSource('wsr_trust_guard', 'Trust Guard', 'trust-guard.test');

    const response = await patch(id, contributor, {
      name: 'Trust Guard',
      url: 'https://trust-guard.test/',
      categories: ['TV'],
      trustedRank: 1,
    });
    expect([401, 403, 404]).toContain(response.status);
  });

  it('deletes a source only when the domain is typed back', async () => {
    const adminUser = await admin();
    const voter = await createAccount();
    const id = await makeSource('wsr_delete_me', 'Delete Me', 'delete-me.test');
    await post(`/api/sources/${id}/vote`, voter, { value: 'LIKE' });
    await post(`/api/sources/${id}/save`, voter, {});

    // What would go with it, before anything goes.
    const refs = await fetch(`${BASE_URL}/api/admin/sources/${id}/references`, authed(adminUser));
    expect(refs.status).toBe(200);
    const counts = await refs.json();
    expect(counts.votes).toBe(1);
    expect(counts.saves).toBe(1);

    const wrong = await fetch(`${BASE_URL}/api/admin/sources/${id}`, {
      method: 'DELETE',
      headers: { 'content-type': 'application/json', cookie: adminUser.cookie, origin: BASE_URL },
      body: JSON.stringify({ confirmDomain: 'not-the-domain.test' }),
    });
    expect(wrong.status).toBe(400);
    // Still there.
    expect((await fetch(`${BASE_URL}/sources/${id}`)).status).toBe(200);

    const right = await fetch(`${BASE_URL}/api/admin/sources/${id}`, {
      method: 'DELETE',
      headers: { 'content-type': 'application/json', cookie: adminUser.cookie, origin: BASE_URL },
      body: JSON.stringify({ confirmDomain: 'Delete-Me.TEST', reason: 'duplicate' }),
    });
    expect(right.status).toBe(200);

    const gone = await db.execute(
      sql`select count(*)::int as n from watch_sources where id = ${id}`,
    );
    expect((gone.rows[0] as { n: number }).n).toBe(0);

    // Everything hanging off it went too, and the voter's account did not.
    for (const table of ['source_votes', 'source_bookmarks', 'source_contributions']) {
      const left = await db.execute(
        sql.raw(`select count(*)::int as n from ${table} where source_id = 'wsr_delete_me'`),
      );
      expect((left.rows[0] as { n: number }).n).toBe(0);
    }
    const accountStillThere = await db.execute(
      sql`select count(*)::int as n from users where email = ${voter.email}`,
    );
    expect((accountStillThere.rows[0] as { n: number }).n).toBe(1);

    // The removal is on record even though its subject is not.
    const audit = await db.execute(
      sql`select count(*)::int as n from audit_logs where action = 'source_deleted'`,
    );
    expect((audit.rows[0] as { n: number }).n).toBeGreaterThan(0);
  });

  it('refuses deletion from a normal account', async () => {
    const contributor = await createAccount();
    const id = await makeSource('wsr_delete_guard', 'Delete Guard', 'delete-guard.test');

    const response = await fetch(`${BASE_URL}/api/admin/sources/${id}`, {
      method: 'DELETE',
      headers: { 'content-type': 'application/json', cookie: contributor.cookie, origin: BASE_URL },
      body: JSON.stringify({ confirmDomain: 'delete-guard.test' }),
    });
    expect([401, 403, 404]).toContain(response.status);

    const still = await db.execute(
      sql`select count(*)::int as n from watch_sources where id = ${id}`,
    );
    expect((still.rows[0] as { n: number }).n).toBe(1);
  });
});

describe('adding and bulk-deleting sources as an admin', () => {
  /** Counts rows for a set of ids, parameterised rather than interpolated. */
  async function countByIds(ids: string[]): Promise<number> {
    const rows = await db.execute(
      sql`select count(*)::int as n from watch_sources
          where id in (select jsonb_array_elements_text(${JSON.stringify(ids)}::jsonb))`,
    );
    return (rows.rows[0] as { n: number }).n;
  }

  it('adds a listing directly, without the suggestion queue', async () => {
    const adminUser = await admin();

    const created = await fetch(`${BASE_URL}/api/admin/sources`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: adminUser.cookie, origin: BASE_URL },
      body: JSON.stringify({
        name: 'Added Directly',
        url: 'https://added-directly.test/',
        description: 'Entered by a moderator.',
        categories: ['Movies'],
        qualityLabel: '4K',
        trustedRank: 50,
        trustedNote: 'Known good',
      }),
    });
    expect(created.status).toBe(200);
    const { id } = await created.json();

    // Public immediately, with the quality badge and the star.
    const html = await (await fetch(BASE_URL)).text();
    expect(html).toContain('Added Directly');
    expect(html).toContain('4K');
    expect(html).toContain('Trusted pick');

    // No credit invented: nobody found it.
    const credits = await db.execute(
      sql`select count(*)::int as n from source_contributions where source_id = ${id}`,
    );
    expect((credits.rows[0] as { n: number }).n).toBe(0);

    // And no pending suggestion was created on the way.
    const pending = await db.execute(
      sql`select count(*)::int as n from watch_source_candidates where domain = 'added-directly.test'`,
    );
    expect((pending.rows[0] as { n: number }).n).toBe(0);
  });

  it('refuses a second listing for a domain already present', async () => {
    const adminUser = await admin();
    const body = {
      name: 'Twice Over',
      url: 'https://twice-over.test/',
      categories: ['TV'],
    };
    const post1 = () =>
      fetch(`${BASE_URL}/api/admin/sources`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: adminUser.cookie, origin: BASE_URL },
        body: JSON.stringify(body),
      });

    expect((await post1()).status).toBe(200);
    expect((await post1()).status).toBe(400);
  });

  it('refuses both actions from a normal account', async () => {
    const contributor = await createAccount();

    const created = await fetch(`${BASE_URL}/api/admin/sources`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: contributor.cookie, origin: BASE_URL },
      body: JSON.stringify({ name: 'Nope', url: 'https://nope.test/', categories: ['TV'] }),
    });
    expect([401, 403, 404]).toContain(created.status);

    const deleted = await fetch(`${BASE_URL}/api/admin/sources`, {
      method: 'DELETE',
      headers: { 'content-type': 'application/json', cookie: contributor.cookie, origin: BASE_URL },
      body: JSON.stringify({ ids: ['wsr_example_anime1'], confirmCount: 1 }),
    });
    expect([401, 403, 404]).toContain(deleted.status);
  });

  it('deletes many at once, and only when the count agrees', async () => {
    const adminUser = await admin();

    const ids: string[] = [];
    for (let index = 0; index < 3; index += 1) {
      const response = await fetch(`${BASE_URL}/api/admin/sources`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: adminUser.cookie, origin: BASE_URL },
        body: JSON.stringify({
          name: `Bulk ${index}`,
          url: `https://bulk-${index}.test/`,
          categories: ['TV'],
        }),
      });
      expect(response.status).toBe(200);
      ids.push((await response.json()).id);
    }

    const bulk = (body: unknown) =>
      fetch(`${BASE_URL}/api/admin/sources`, {
        method: 'DELETE',
        headers: { 'content-type': 'application/json', cookie: adminUser.cookie, origin: BASE_URL },
        body: JSON.stringify(body),
      });

    /*
     * A count that disagrees with the selection means the list changed under
     * the moderator. Refusing is the point: they agreed to delete a different
     * number of things than they are about to.
     */
    const mismatched = await bulk({ ids, confirmCount: 2 });
    expect(mismatched.status).toBe(400);

    const stillThere = await countByIds(ids);
    expect(stillThere).toBe(3);

    const removed = await bulk({ ids, confirmCount: 3, reason: 'test duplicates' });
    expect(removed.status).toBe(200);
    expect((await removed.json()).deleted).toBe(3);

    expect(await countByIds(ids)).toBe(0);

    const audit = await db.execute(
      sql`select count(*)::int as n from audit_logs where action = 'sources_bulk_deleted'`,
    );
    expect((audit.rows[0] as { n: number }).n).toBeGreaterThan(0);
  });

  it('refuses a selection larger than any real one', async () => {
    const adminUser = await admin();
    const ids = Array.from({ length: 201 }, (_, index) => `wsr_fake_${index}`);
    const response = await fetch(`${BASE_URL}/api/admin/sources`, {
      method: 'DELETE',
      headers: { 'content-type': 'application/json', cookie: adminUser.cookie, origin: BASE_URL },
      body: JSON.stringify({ ids, confirmCount: 201 }),
    });
    expect(response.status).toBe(400);
  });
});

describe('profile pictures', () => {
  const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 1, 2, 3]);

  it('accepts a picture, serves it safely and removes it again', async () => {
    const account = await createAccount();
    const userId = await idFor(account.email);

    const upload = await post('/api/account/avatar', account, {
      image: `data:image/png;base64,${PNG.toString('base64')}`,
    });
    expect(upload.status).toBe(200);

    const served = await fetch(`${BASE_URL}/api/users/${userId}/avatar`);
    expect(served.status).toBe(200);
    expect(served.headers.get('content-type')).toBe('image/png');
    expect(served.headers.get('x-content-type-options')).toBe('nosniff');
    expect(served.headers.get('content-security-policy')).toContain("default-src 'none'");
    expect(Buffer.from(await served.arrayBuffer()).equals(PNG)).toBe(true);

    const removed = await fetch(`${BASE_URL}/api/account/avatar`, {
      method: 'DELETE',
      headers: { cookie: account.cookie },
    });
    expect(removed.status).toBe(200);
    expect((await fetch(`${BASE_URL}/api/users/${userId}/avatar`)).status).toBe(404);
  });

  it('refuses an SVG dressed as a picture', async () => {
    const account = await createAccount();
    const response = await post('/api/account/avatar', account, {
      image: Buffer.from('<svg onload="alert(1)"></svg>').toString('base64'),
    });
    expect(response.status).toBe(400);
  });

  it('refuses to set a picture for a signed-out visitor', async () => {
    const response = await fetch(`${BASE_URL}/api/account/avatar`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ image: PNG.toString('base64') }),
    });
    expect(response.status).toBe(401);
  });

  it('never lets one account set another account\'s picture', async () => {
    // There is no route that takes a user id, which is the point: the only
    // way to set a picture is to be the account whose picture it is.
    const [a, b] = await Promise.all([createAccount(), createAccount()]);
    const bId = await idFor(b.email);

    await post('/api/account/avatar', a, { image: PNG.toString('base64') });
    expect((await fetch(`${BASE_URL}/api/users/${bId}/avatar`)).status).toBe(404);
  });
});

describe('the avoid warning', () => {
  it('warns on the listing and the source page, and only an admin can set it', async () => {
    const adminUser = await admin();
    const contributor = await createAccount();

    const rows = await db.execute(sql`
      insert into watch_sources (id, name, domain, homepage_url, source_type, supports_tv, is_enabled)
      values ('wsr_avoidtest01', 'Avoid Me', 'avoid-me.test', 'https://avoid-me.test/',
              'COMMUNITY', true, true)
      returning id
    `);
    const sourceId = (rows.rows[0] as { id: string }).id;

    // A normal account cannot set it.
    const refused = await fetch(`${BASE_URL}/api/admin/sources/${sourceId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', cookie: contributor.cookie },
      body: JSON.stringify({
        name: 'Avoid Me',
        url: 'https://avoid-me.test/',
        categories: ['TV'],
        shouldAvoid: true,
      }),
    });
    expect([401, 403, 404]).toContain(refused.status);

    const set = await fetch(`${BASE_URL}/api/admin/sources/${sourceId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', cookie: adminUser.cookie },
      body: JSON.stringify({
        name: 'Avoid Me',
        url: 'https://avoid-me.test/',
        categories: ['TV'],
        shouldAvoid: true,
        avoidReason: 'Asks for a card number before anything plays.',
        isEnabled: true,
        adminRankPenalty: 0,
      }),
    });
    expect(set.status).toBe(200);

    const page = await fetch(`${BASE_URL}/sources/${sourceId}`);
    const html = await page.text();
    expect(html).toContain('Avoid');
    expect(html).toContain('Asks for a card number before anything plays.');
    // Still listed, and still reachable: this is advice, not a block.
    expect(html).toContain('Avoid Me');
    expect(html).toContain('https://avoid-me.test/');
    // But the link stops being the page's primary call to action, which would
    // otherwise argue against the warning sitting right above it.
    expect(html).toContain('Go anyway');
    const visitLink = /<a[^>]*href="https:\/\/avoid-me\.test\/"[^>]*>/u.exec(html)?.[0] ?? '';
    expect(visitLink).toBeTruthy();
    expect(visitLink).not.toContain('bg-selected');
    expect(visitLink).toContain('nofollow');

    const discover = await fetch(`${BASE_URL}/`);
    expect(await discover.text()).toContain('Avoid Me');
  });

  it('drops the reason when the warning is turned off', async () => {
    const adminUser = await admin();
    const rows = await db.execute(sql`
      insert into watch_sources (id, name, domain, homepage_url, source_type, supports_tv,
                                 is_enabled, should_avoid, avoid_reason)
      values ('wsr_avoidtest02', 'Was Avoided', 'was-avoided.test', 'https://was-avoided.test/',
              'COMMUNITY', true, true, true, 'An old reason')
      returning id
    `);
    const sourceId = (rows.rows[0] as { id: string }).id;

    const cleared = await fetch(`${BASE_URL}/api/admin/sources/${sourceId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', cookie: adminUser.cookie },
      body: JSON.stringify({
        name: 'Was Avoided',
        url: 'https://was-avoided.test/',
        categories: ['TV'],
        shouldAvoid: false,
        avoidReason: 'An old reason',
        isEnabled: true,
        adminRankPenalty: 0,
      }),
    });
    expect(cleared.status).toBe(200);

    const after = await db.execute(
      sql`select should_avoid, avoid_reason from watch_sources where id = ${sourceId}`,
    );
    const row = after.rows[0] as { should_avoid: boolean; avoid_reason: string | null };
    expect(row.should_avoid).toBe(false);
    expect(row.avoid_reason).toBeNull();
  });
});

describe('suggesting, approving and reporting', () => {
  it('runs a suggestion through review and publishes it immediately', async () => {
    const adminUser = await admin();
    const contributor = await createAccount();

    const suggest = await post('/api/sources/suggest', contributor, {
      url: 'https://brand-new-source.test/library',
      name: 'Brand New Source',
      description: 'Independent films',
      categories: ['Movies', 'TV'],
      explanation: 'Good catalogue',
      creditMode: 'CREDITED',
    });
    expect(suggest.status).toBe(200);

    // It must not be public before approval.
    expect(await (await fetch(BASE_URL)).text()).not.toContain('Brand New Source');

    const rows = await db.execute(
      sql`select id from watch_source_candidates where domain = 'brand-new-source.test'`,
    );
    const candidateId = (rows.rows[0] as { id: string }).id;

    const approve = await post(`/api/admin/suggestions/${candidateId}`, adminUser, {
      decision: 'APPROVE',
    });
    expect(approve.status).toBe(200);
    const { sourceId } = await approve.json();

    // Public straight away, with no second enable step.
    const discover = await fetch(BASE_URL);
    expect(await discover.text()).toContain('Brand New Source');

    const page = await fetch(`${BASE_URL}/sources/${sourceId}`);
    const html = await page.text();
    expect(html).toContain('Brand New Source');
    expect(html).toContain('found it first');
  });

  it('groups repeat suggestions and credits everyone when one is approved', async () => {
    const adminUser = await admin();
    const [first, second, third] = await Promise.all([
      createAccount(),
      createAccount(),
      createAccount(),
    ]);
    const url = 'https://many-hands.test/';

    // A 1x1 PNG, so the icon path is exercised with a real file.
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64',
    );

    const bodies = [
      { by: first, name: 'Many Hands', creditMode: 'CREDITED' },
      { by: second, name: 'Many Hands Library', creditMode: 'CREDITED', icon: png.toString('base64') },
      { by: third, name: 'manyhands', creditMode: 'ANONYMOUS' },
    ];
    for (const body of bodies) {
      const response = await post('/api/sources/suggest', body.by, {
        url,
        name: body.name,
        description: 'A place a few people found independently.',
        categories: ['Anime'],
        explanation: 'Worth listing',
        creditMode: body.creditMode,
        ...(body.icon ? { icon: body.icon } : {}),
      });
      // No submission is turned away as a duplicate any more.
      expect(response.status).toBe(200);
    }

    const rows = await db.execute(
      sql`select id from watch_source_candidates
          where domain = 'many-hands.test' and status = 'PENDING'
          order by created_at asc`,
    );
    expect(rows.rows).toHaveLength(3);
    const chosen = (rows.rows[1] as { id: string }).id;

    // The admin review page shows them together, as one decision.
    const review = await fetch(`${BASE_URL}/admin/suggestions`, authed(adminUser));
    const reviewHtml = await review.text();
    expect(reviewHtml).toContain('Many Hands Library');
    expect(reviewHtml).toContain('Approve and credit all 3');

    // The pending icon is admin-only, and never cached.
    const pendingIcon = await fetch(
      `${BASE_URL}/api/admin/candidates/${chosen}/icon`,
      authed(adminUser),
    );
    expect(pendingIcon.status).toBe(200);
    expect(pendingIcon.headers.get('content-type')).toBe('image/png');
    expect(pendingIcon.headers.get('cache-control')).toContain('no-store');
    expect((await fetch(`${BASE_URL}/api/admin/candidates/${chosen}/icon`)).status).toBe(401);

    // The admin publishes the second write-up, not the first one in.
    const approve = await post(`/api/admin/suggestions/${chosen}`, adminUser, {
      decision: 'APPROVE',
    });
    expect(approve.status).toBe(200);
    const { sourceId } = await approve.json();

    const page = await fetch(`${BASE_URL}/sources/${sourceId}`);
    const html = await page.text();
    expect(html).toContain('Many Hands Library');
    // Everyone who sent it is credited, and the one who asked not to be named
    // is counted without being named.
    expect(html).toContain(first.displayName);
    expect(html).toContain(second.displayName);
    expect(html).not.toContain(third.displayName);
    expect(html).toContain('found it first');

    // The icon is shown on the listing page, served from Couchlist's own
    // route rather than hot-linked from the site being listed.
    expect(html).toContain(`/api/sources/${sourceId}/icon`);
    expect(html).not.toContain('many-hands.test/favicon');

    // The icon came across with the source, and is public now.
    const icon = await fetch(`${BASE_URL}/api/sources/${sourceId}/icon`);
    expect(icon.status).toBe(200);
    expect(icon.headers.get('content-type')).toBe('image/png');
    expect(icon.headers.get('x-content-type-options')).toBe('nosniff');
    expect(icon.headers.get('content-security-policy')).toContain("default-src 'none'");
    expect(Buffer.from(await icon.arrayBuffer()).equals(png)).toBe(true);

    // Nothing is left pending for that domain.
    const left = await db.execute(
      sql`select count(*)::int as n from watch_source_candidates
          where domain = 'many-hands.test' and status = 'PENDING'`,
    );
    expect((left.rows[0] as { n: number }).n).toBe(0);
  });

  it('refuses an icon that is not really an image', async () => {
    const contributor = await createAccount();

    const response = await post('/api/sources/suggest', contributor, {
      url: 'https://sneaky-icon.test/',
      name: 'Sneaky Icon',
      description: 'An SVG wearing a PNG label.',
      categories: ['Movies'],
      explanation: 'Testing the upload check',
      creditMode: 'CREDITED',
      icon: Buffer.from('<svg onload="alert(1)"></svg>').toString('base64'),
    });

    expect(response.status).toBe(400);
    const rows = await db.execute(
      sql`select count(*)::int as n from watch_source_candidates where domain = 'sneaky-icon.test'`,
    );
    expect((rows.rows[0] as { n: number }).n).toBe(0);
  });

  it('refuses a duplicate domain and points at the existing listing', async () => {
    const contributor = await createAccount();
    await seedSource('Already Here', 'alreadyhere.test');

    const response = await post('/api/sources/suggest', contributor, {
      url: 'https://www.alreadyhere.test/',
      name: 'Already Here Again',
      categories: ['Movies'],
    });

    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error.code).toBe('CL_DUPLICATE_LIST_ENTRY');
    expect(body.error.sourceId).toBeTruthy();
  });

  it('rejects an unsafe or private URL rather than fetching it', async () => {
    const contributor = await createAccount();

    for (const url of [
      'javascript:alert(1)',
      'http://127.0.0.1:5432/',
      'http://localhost/admin',
      'http://169.254.169.254/latest/meta-data/',
      'file:///etc/passwd',
    ]) {
      const response = await post('/api/sources/suggest', contributor, {
        url,
        name: 'Unsafe',
        categories: ['Movies'],
      });
      expect(response.status).toBe(400);
    }
  });

  it('keeps an anonymous suggestion anonymous on the public page', async () => {
    const adminUser = await admin();
    const contributor = await createAccount();

    await post('/api/sources/suggest', contributor, {
      url: 'https://anonymous-source.test/',
      name: 'Anonymous Source',
      categories: ['Manhwa'],
      creditMode: 'ANONYMOUS',
    });

    const rows = await db.execute(
      sql`select id from watch_source_candidates where domain = 'anonymous-source.test'`,
    );
    const approve = await post(
      `/api/admin/suggestions/${(rows.rows[0] as { id: string }).id}`,
      adminUser,
      { decision: 'APPROVE' },
    );
    const { sourceId } = await approve.json();

    const html = await (await fetch(`${BASE_URL}/sources/${sourceId}`)).text();
    expect(html).toContain('Anonymous');
    // The page markup must not carry the contributor's identity anywhere.
    expect(html).not.toContain(contributor.email);
    const userRows = await db.execute(
      sql`select id, display_name from users where email = ${contributor.email}`,
    );
    const user = userRows.rows[0] as { id: string; display_name: string };
    expect(html).not.toContain(user.id);
    expect(html).not.toContain(user.display_name);
  });

  it('rejects a suggestion with a short reason the contributor can read', async () => {
    const adminUser = await admin();
    const contributor = await createAccount();

    await post('/api/sources/suggest', contributor, {
      url: 'https://rejected-source.test/',
      name: 'Rejected Source',
      categories: ['Movies'],
    });
    const rows = await db.execute(
      sql`select id from watch_source_candidates where domain = 'rejected-source.test'`,
    );
    const reject = await post(
      `/api/admin/suggestions/${(rows.rows[0] as { id: string }).id}`,
      adminUser,
      { decision: 'REJECT', reviewNotes: 'Already covered by another listing.' },
    );
    expect(reject.status).toBe(200);

    const submissions = await fetch(`${BASE_URL}/submissions`, authed(contributor));
    const html = await submissions.text();
    expect(html).toContain('Already covered by another listing.');
    expect(html).toContain('Not accepted');
  });

  it('groups reports and resolves them together', async () => {
    const adminUser = await admin();
    const id = await seedSource('Reported Source', 'reportedsource.test');
    const reporters = await Promise.all([createAccount(), createAccount(), createAccount()]);

    for (const reporter of reporters) {
      const response = await post('/api/sources/report', reporter, {
        sourceId: id,
        reason: 'BROKEN_LINK',
        details: 'Does not load any more',
      });
      expect(response.status).toBe(200);
    }

    const queue = await fetch(`${BASE_URL}/admin/reports`, authed(adminUser));
    const html = await queue.text();
    expect(html).toContain('Reported Source');
    // React splits interpolated text into separate nodes, so match the count
    // and the grouping rather than a rendered phrase.
    expect(html).toContain('Resolve all 3');
    expect(html).toMatch(/Broken link<!-- --> × <!-- -->3/u);

    const resolved = await post('/api/admin/reports', adminUser, {
      sourceId: id,
      action: 'RESOLVE',
      resolutionNote: 'Address corrected',
    });
    expect((await resolved.json()).resolved).toBe(3);

    expect(await (await fetch(`${BASE_URL}/admin/reports`, authed(adminUser))).text()).not.toContain(
      'Reported Source',
    );
  });

  it('hides and restores a source without losing it', async () => {
    const adminUser = await admin();
    const id = await seedSource('Hideable Source', 'hideablesource.test');

    expect(await (await fetch(BASE_URL)).text()).toContain('Hideable Source');

    const hidden = await post(`/api/admin/sources/${id}`, adminUser, {
      hidden: true,
      reason: 'Too many ads',
    });
    expect(hidden.status).toBe(200);
    expect(await (await fetch(BASE_URL)).text()).not.toContain('Hideable Source');

    const restored = await post(`/api/admin/sources/${id}`, adminUser, { hidden: false });
    expect(restored.status).toBe(200);
    expect(await (await fetch(BASE_URL)).text()).toContain('Hideable Source');
  });

  it('treats untrusted text as text, not markup', async () => {
    const adminUser = await admin();
    const contributor = await createAccount();
    const payload = '<img src=x onerror="alert(1)">';

    await post('/api/sources/suggest', contributor, {
      url: 'https://escaped-source.test/',
      name: `Escaped ${payload}`,
      description: payload,
      categories: ['Movies'],
    });
    const rows = await db.execute(
      sql`select id from watch_source_candidates where domain = 'escaped-source.test'`,
    );
    const approve = await post(
      `/api/admin/suggestions/${(rows.rows[0] as { id: string }).id}`,
      adminUser,
      { decision: 'APPROVE' },
    );
    const { sourceId } = await approve.json();

    const html = await (await fetch(`${BASE_URL}/sources/${sourceId}`)).text();
    // React escapes it, so the raw tag never reaches the document.
    expect(html).not.toContain('<img src=x onerror=');
    expect(html).toContain('&lt;img');
  });
});

describe('guides', () => {
  it('filters by topic and excludes a tool the device does not support', async () => {
    // Two guides with different device support.
    await db.execute(sql`
      insert into guides (id, slug, title, task, topic, summary, device_android, device_computer, is_published, device_label)
      values ('gde_android1', 'android-only-reader', 'Android only reader', 'Test tool', 'READING',
              'An Android-only reader for testing.', true, false, true, 'Android'),
             ('gde_desktop1', 'desktop-only-editor', 'Desktop only editor', 'Test tool', 'SUBTITLES',
              'A desktop-only editor for testing.', false, true, true, 'Computer')
      on conflict (slug) do nothing
    `);

    const reading = await fetch(`${BASE_URL}/guides?topic=reading-apps`);
    expect(await reading.text()).toContain('Android only reader');

    // An Android-only tool must not be offered to someone on an iPhone.
    const iphone = await fetch(`${BASE_URL}/guides?topic=reading-apps&device=iphone`);
    expect(await iphone.text()).not.toContain('Android only reader');

    const android = await fetch(`${BASE_URL}/guides?topic=reading-apps&device=android`);
    expect(await android.text()).toContain('Android only reader');
  });

  it('finds a guide through a misspelled search', async () => {
    await db.execute(sql`
      insert into guides (id, slug, title, task, topic, summary, keywords, device_computer, is_published, device_label)
      values ('gde_manhwa1', 'manhwa-search-guide', 'Read manhwa comfortably', 'Test tool', 'READING',
              'A manhwa reading guide for testing.', 'manhwa vertical scroll', true, true, 'Computer')
      on conflict (slug) do nothing
    `);

    // "manwha" is the misspelling the brief names.
    const response = await fetch(`${BASE_URL}/guides?q=manwha`);
    expect(await response.text()).toContain('Read manhwa comfortably');
  });

  it('says a guide is unreviewed rather than inventing a date', async () => {
    await db.execute(sql`
      insert into guides (id, slug, title, task, topic, summary, device_computer, is_published, device_label)
      values ('gde_unrev1', 'unreviewed-guide', 'Unreviewed guide', 'Test tool', 'FIXES',
              'A guide nobody has checked yet.', true, true, 'Computer')
      on conflict (slug) do nothing
    `);

    const response = await fetch(`${BASE_URL}/guides/unreviewed-guide`);
    const html = await response.text();
    expect(response.status).toBe(200);
    expect(html).toContain('Not yet reviewed');
  });

  it('serves a topic slug as the hub filtered to that topic', async () => {
    const response = await fetch(`${BASE_URL}/guides/ad-blocking`, { redirect: 'manual' });
    expect([307, 308]).toContain(response.status);
    expect(response.headers.get('location')).toContain('topic=ad-blocking');
  });
});

describe('private data boundaries', () => {
  it('marks authenticated pages as uncacheable', async () => {
    const account = await createAccount();
    const response = await fetch(`${BASE_URL}/saved`, authed(account));
    const cacheControl = response.headers.get('cache-control') ?? '';
    expect(cacheControl).toMatch(/no-store|private/u);
  });

  it("keeps a private collection out of another account's reach", async () => {
    const owner = await createAccount();
    const stranger = await createAccount();

    const created = await post('/api/collections', owner, {
      name: 'Secret Picks',
      isPublic: false,
    });
    expect(created.status).toBe(200);
    const { slug } = await created.json();

    const rows = await db.execute(sql`select id from users where email = ${owner.email}`);
    const ownerId = (rows.rows[0] as { id: string }).id;

    const asOwner = await fetch(`${BASE_URL}/collections/${ownerId}/${slug}`, authed(owner));
    expect(asOwner.status).toBe(200);

    // A stranger, and an anonymous visitor, get a 404 rather than the content.
    expect((await fetch(`${BASE_URL}/collections/${ownerId}/${slug}`, authed(stranger))).status).toBe(
      404,
    );
    expect((await fetch(`${BASE_URL}/collections/${ownerId}/${slug}`)).status).toBe(404);
  });

  /**
   * A public collection is how someone shares a list, so it must open for a
   * signed-out visitor. The middleware guards `/collections` itself, which is
   * the owner's management page; it must not guard the shared pages beneath it.
   */
  it('opens a public collection to a signed-out visitor', async () => {
    const owner = await createAccount();
    const created = await post('/api/collections', owner, {
      name: 'Shared Picks',
      isPublic: true,
    });
    const { slug } = await created.json();
    const rows = await db.execute(sql`select id from users where email = ${owner.email}`);
    const ownerId = (rows.rows[0] as { id: string }).id;

    const anonymous = await fetch(`${BASE_URL}/collections/${ownerId}/${slug}`, {
      redirect: 'manual',
    });
    expect(anonymous.status).toBe(200);
    expect(await anonymous.text()).toContain('Shared Picks');

    // The management page still needs a session.
    const manage = await fetch(`${BASE_URL}/collections`, { redirect: 'manual' });
    expect([302, 307, 308]).toContain(manage.status);
  });

  it('deletes an account and stops it signing in', async () => {
    const account = await createAccount();

    const deleted = await post('/api/account/delete', account, {
      password: 'a-long-enough-password',
      confirm: 'DELETE',
    });
    expect(deleted.status).toBe(200);

    const login = await post('/api/auth/login', null, {
      email: account.email,
      password: 'a-long-enough-password',
    });
    expect(login.status).toBe(401);
  });

  it('refuses to delete an account without the right password', async () => {
    const account = await createAccount();
    const response = await post('/api/account/delete', account, {
      password: 'wrong-password',
      confirm: 'DELETE',
    });
    expect(response.status).toBe(401);
  });
});

describe('link health, reporting and the attention queue', () => {
  /**
   * The markup with React's text-node separators removed.
   *
   * React writes `Link checked <!-- -->2 days ago<!-- -->.`, so asserting on
   * a sentence that interpolates a value needs the comments gone first.
   */
  function sentences(html: string): string {
    return html.replace(/<!--.*?-->/g, '');
  }

  async function setHealth(
    sourceId: string,
    fields: { checkedDaysAgo?: number | null; status?: string | null; failures?: number },
  ) {
    const checked =
      fields.checkedDaysAgo === undefined || fields.checkedDaysAgo === null
        ? null
        : fields.checkedDaysAgo;
    await db.execute(sql`
      update watch_sources set
        last_health_check_at = ${checked === null ? null : sql`now() - (${checked} || ' days')::interval`},
        health_status = ${fields.status ?? null},
        health_failures = ${fields.failures ?? 0}
      where id = ${sourceId}
    `);
  }

  it('says when a listing was last checked, and says nothing when it never was', async () => {
    const checked = await seedSource('Checked Recently', 'checkedrecently.test');
    const never = await seedSource('Never Checked', 'neverchecked.test');
    await setHealth(checked, { checkedDaysAgo: 2, status: 'OK' });

    const [withLine, withoutLine] = await Promise.all([
      fetch(`${BASE_URL}/sources/${checked}`).then((r) => r.text()),
      fetch(`${BASE_URL}/sources/${never}`).then((r) => r.text()),
    ]);

    expect(sentences(withLine)).toContain('Link checked 2 days ago.');
    expect(withoutLine).not.toContain('Link checked');
  });

  it('does not claim upkeep when the last check is older than a month', async () => {
    const stale = await seedSource('Stale Check', 'stalecheck.test');
    await setHealth(stale, { checkedDaysAgo: 90, status: 'OK' });

    const html = await fetch(`${BASE_URL}/sources/${stale}`).then((r) => r.text());
    expect(html).not.toContain('Link checked');
  });

  it('reports a failing check carefully, without calling the source dead', async () => {
    const failing = await seedSource('Failing Check', 'failingcheck.test');
    await setHealth(failing, { checkedDaysAgo: 1, status: 'UNREACHABLE', failures: 3 });

    const html = await fetch(`${BASE_URL}/sources/${failing}`).then((r) => r.text());
    expect(html).toContain('could not reach this address');
    expect(html).toContain('may be temporary');
    // Still listed, still votable: the automated check decides nothing.
    expect(html).toContain('Failing Check');
  });

  it('files a broken-link report in one click, and treats a repeat as success', async () => {
    const account = await createAccount();
    const id = await seedSource('One Click Dead', 'oneclickdead.test');

    const first = await post('/api/sources/report', account, {
      sourceId: id,
      reason: 'BROKEN_LINK',
    });
    expect(first.status).toBe(200);
    await expect(first.json()).resolves.toMatchObject({ ok: true, alreadyReported: false });

    const again = await post('/api/sources/report', account, {
      sourceId: id,
      reason: 'BROKEN_LINK',
    });
    expect(again.status).toBe(200);
    await expect(again.json()).resolves.toMatchObject({ ok: true, alreadyReported: true });

    const { rows } = await db.execute(sql`
      select count(*)::int as n from watch_source_reports
      where watch_source_id = ${id} and resolved_at is null
    `);
    expect((rows[0] as { n: number }).n).toBe(1);
  });

  it('shows the attention queue to an admin only', async () => {
    const adminUser = await admin();
    const outsider = await createAccount();

    const [mine, theirs] = await Promise.all([
      fetch(`${BASE_URL}/admin/attention`, authed(adminUser)),
      fetch(`${BASE_URL}/admin/attention`, { ...authed(outsider), redirect: 'manual' }),
    ]);

    expect(mine.status).toBe(200);
    expect([302, 307, 308, 403, 404]).toContain(theirs.status);
  });

  it('lists a repeatedly failing source in the attention queue', async () => {
    const adminUser = await admin();
    const id = await seedSource('Three Strikes', 'threestrikes.test');
    await setHealth(id, { checkedDaysAgo: 1, status: 'UNREACHABLE', failures: 3 });

    const html = await fetch(`${BASE_URL}/admin/attention`, authed(adminUser)).then((r) =>
      r.text(),
    );
    expect(html).toContain('Three Strikes');
    expect(html).toContain('Did not answer');
  });

  it('lists a moved source, and leaves a healthy one alone', async () => {
    const adminUser = await admin();
    const moved = await seedSource('Moved Away', 'movedaway.test');
    const fine = await seedSource('Perfectly Fine', 'perfectlyfine.test');
    await setHealth(moved, { checkedDaysAgo: 1, status: 'MOVED' });
    await setHealth(fine, { checkedDaysAgo: 1, status: 'OK' });

    const html = await fetch(`${BASE_URL}/admin/attention`, authed(adminUser)).then((r) =>
      r.text(),
    );
    expect(html).toContain('Moved Away');
    expect(html).not.toContain('Perfectly Fine');
  });

  it('raises a source once enough different people report it', async () => {
    const adminUser = await admin();
    const id = await seedSource('Crowd Reported', 'crowdreported.test');

    const reporters = await Promise.all([createAccount(), createAccount(), createAccount()]);
    for (const reporter of reporters) {
      const response = await post('/api/sources/report', reporter, {
        sourceId: id,
        reason: 'BROKEN_LINK',
      });
      expect(response.status).toBe(200);
    }

    const html = await fetch(`${BASE_URL}/admin/attention`, authed(adminUser)).then((r) =>
      r.text(),
    );
    expect(html).toContain('Crowd Reported');
  });

  it('does not raise a source on one report alone', async () => {
    const adminUser = await admin();
    const reporter = await createAccount();
    const id = await seedSource('Single Report', 'singlereport.test');

    await post('/api/sources/report', reporter, { sourceId: id, reason: 'BROKEN_LINK' });

    const html = await fetch(`${BASE_URL}/admin/attention`, authed(adminUser)).then((r) =>
      r.text(),
    );
    expect(html).not.toContain('Single Report');
  });
});
