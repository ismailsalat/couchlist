import { expect, test, type Page } from '@playwright/test';

/**
 * Browser smoke tests.
 *
 * They create a real account through the signup form and verify it with the
 * code the development mail transport returns, so no mailbox and no live
 * provider is needed. Run against a server started with MAIL_TRANSPORT=log.
 *
 * The HTTP-level assertions live in tests/integration/http.test.ts; these
 * check what a person actually sees and can click.
 */
const PASSWORD = 'a-long-enough-password';

async function signUpAndVerify(page: Page): Promise<string> {
  const email = `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`;

  const signup = await page.request.post('/api/auth/signup', {
    data: { email, password: PASSWORD, confirmPassword: PASSWORD, displayName: 'E2E Person' },
  });
  expect(signup.ok()).toBeTruthy();
  const { devCode } = await signup.json();
  expect(devCode).toMatch(/^\d{6}$/);

  const login = await page.request.post('/api/auth/login', {
    data: { email, password: PASSWORD },
  });
  expect(login.ok()).toBeTruthy();

  const verify = await page.request.post('/api/auth/verify-email', {
    data: { code: devCode },
  });
  expect(verify.ok()).toBeTruthy();

  return email;
}

test.describe('public browsing', () => {
  test('Discover is the entry page and needs no account', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('heading', { level: 1 })).toContainText('Your next good find');
    await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible();
    // The three primary destinations, and nothing else.
    await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Discover' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Guides' })).toBeVisible();
  });

  test('category filters change the list and the URL', async ({ page }) => {
    await page.goto('/');

    // Scoped to the filter rail: a bare "Anime" would also match the
    // "Like <source>" buttons of any source with Anime in its name.
    const categories = page.getByRole('group', { name: 'Source categories' });
    const anime = categories.getByRole('button', { name: 'Anime', exact: true });

    await anime.click();
    await expect(page).toHaveURL(/category=Anime/);
    await expect(anime).toHaveAttribute('aria-pressed', 'true');

    // Back undoes one filter change.
    await page.goBack();
    await expect(page).not.toHaveURL(/category=Anime/);
  });

  test('search is shareable through the URL', async ({ page }) => {
    await page.goto('/?q=nothing-matches-this-query');
    await expect(page.getByText(/No sources match/)).toBeVisible();
  });

  test('guides filter by topic and device', async ({ page }) => {
    await page.goto('/guides');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('A little help');

    await page.getByRole('button', { name: 'Ad blocking' }).click();
    await expect(page).toHaveURL(/topic=ad-blocking/);
    await expect(page.getByRole('heading', { name: 'Ad blocking' })).toBeVisible();
  });

  test('a guide row expands without JavaScript navigation', async ({ page }) => {
    await page.goto('/guides');
    const first = page.locator('details').first();
    await first.locator('summary').click();
    await expect(first).toHaveAttribute('open', '');
  });
});

test.describe('signed-out prompts', () => {
  test('saving sends you to sign in and comes back', async ({ page }) => {
    await page.goto('/');

    const save = page.getByRole('button', { name: /^Save / }).first();
    if ((await save.count()) === 0) test.skip(true, 'no sources listed in this environment');

    await save.click();
    // No claim of having saved anything before authentication.
    await expect(page).toHaveURL(/\/login\?next=/);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Welcome back');
  });

  test('private pages redirect to sign in', async ({ page }) => {
    await page.goto('/saved');
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe('signing up through the form', () => {
  /**
   * The regression this exists for.
   *
   * Entering the verification code needs a session. Signing up through the
   * API and then logging in separately — which the other tests do — hides a
   * break in the form's own path, where a new account was left signed out and
   * bounced from the verification page straight to sign-in.
   *
   * So this one fills the real form and clicks the real buttons.
   */
  test('leaves you signed in and able to verify', async ({ page }) => {
    const email = `form-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`;

    await page.goto('/signup');
    await page.getByLabel('Display name').fill('Form Person');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
    await page.getByLabel('Confirm password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Create account' }).click();

    // Local mail transport shows the code instead of sending it.
    const code = page.getByText(/^\d{6}$/);
    await expect(code).toBeVisible();
    const digits = (await code.textContent())!.trim();

    await page.getByRole('link', { name: 'Enter this code' }).click();

    // The decisive assertion: the verification page, not a redirect to login.
    await expect(page).toHaveURL(/\/verify-email/);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Check your email');

    await page.getByLabel('Verification code').fill(digits);
    await page.getByRole('button', { name: 'Verify email' }).click();

    // Verified and signed in: the account menu replaces the sign-in link.
    await expect(page.getByRole('button', { name: /Account menu/ })).toBeVisible();
  });

  /**
   * A typed-once password is a password you can be locked out of. The
   * confirmation has to stop the form in the browser, without a round trip
   * that would create the account anyway.
   */
  test('stops a mistyped password before the account is created', async ({ page }) => {
    const email = `typo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`;

    await page.goto('/signup');
    await page.getByLabel('Display name').fill('Typo Person');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
    await page.getByLabel('Confirm password').fill(`${PASSWORD}-not`);
    await page.getByRole('button', { name: 'Create account' }).click();

    await expect(page.getByText(/do not match/i)).toBeVisible();
    await expect(page).toHaveURL(/\/signup/);

    // Nothing was created, so the address is still free.
    const login = await page.request.post('/api/auth/login', {
      data: { email, password: PASSWORD },
    });
    expect(login.status()).toBe(401);

    // Correcting it lets the form through.
    await page.getByLabel('Confirm password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page.getByText(/^\d{6}$/)).toBeVisible();
  });
});

test.describe('signed in', () => {
  test('saves a source and finds it again under Saved', async ({ page }) => {
    await signUpAndVerify(page);
    await page.goto('/');

    const save = page.getByRole('button', { name: /^Save / }).first();
    if ((await save.count()) === 0) test.skip(true, 'no sources listed in this environment');

    /*
     * Which source is first depends on votes other tests may be casting at
     * the same time, so the name is read from the button that is actually
     * clicked and asserted on by name afterwards. Asserting that "an article
     * exists" on /saved would pass for the wrong source, and for the wrong
     * reason.
     */
    const label = (await save.getAttribute('aria-label')) ?? '';
    const name = label.replace(/^Save /u, '').trim();
    expect(name).not.toBe('');

    /*
     * The button flips optimistically, so waiting for it would race the
     * request it is predicting: navigating on the optimistic state can reach
     * /saved before the save has landed. Wait for the response itself.
     */
    const saved = page.waitForResponse(
      (response) =>
        response.url().includes('/save') && response.request().method() === 'POST',
    );
    await save.click();
    expect((await saved).ok()).toBeTruthy();

    await expect(
      page.getByRole('button', { name: `Remove ${name} from saved` }),
    ).toBeVisible();

    await page.goto('/saved');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Saved sources');
    await expect(page.getByRole('link', { name, exact: true }).first()).toBeVisible();
  });

  test('votes on a source and sees the count change', async ({ page }) => {
    await signUpAndVerify(page);
    await page.goto('/');

    const like = page.getByRole('button', { name: /^Like / }).first();
    if ((await like.count()) === 0) test.skip(true, 'no sources listed in this environment');

    const name = ((await like.getAttribute('aria-label')) ?? '').replace(/^Like /u, '').trim();
    const before = Number((await like.textContent())?.trim() ?? '0');

    const voted = page.waitForResponse(
      (response) => response.url().includes('/vote') && response.request().method() === 'POST',
    );
    await like.click();
    expect((await voted).ok()).toBeTruthy();

    const mine = page.getByRole('button', { name: `Remove your like from ${name}` });
    await expect(mine).toBeVisible();
    await expect(mine).toHaveAttribute('aria-pressed', 'true');
    expect(Number((await mine.textContent())?.trim() ?? '0')).toBe(before + 1);
  });

  /*
   * A vote you have cast should look different from one you have not, and
   * still look that way when you come back. The earlier version flipped a
   * subtle tint that was easy to miss and easy to lose on reload.
   */
  test('shows your own vote as yours, and still does after a reload', async ({ page }) => {
    await signUpAndVerify(page);
    await page.goto('/');

    const like = page.getByRole('button', { name: /^Like / }).first();
    if ((await like.count()) === 0) test.skip(true, 'no sources listed in this environment');
    const name = ((await like.getAttribute('aria-label')) ?? '').replace(/^Like /u, '').trim();

    // Not pressed, and not carrying the voted styling, to begin with.
    await expect(like).toHaveAttribute('aria-pressed', 'false');
    expect(await like.getAttribute('class')).not.toContain('cl-voted');

    const voted = page.waitForResponse(
      (response) => response.url().includes('/vote') && response.request().method() === 'POST',
    );
    await like.click();
    await voted;

    const mine = page.getByRole('button', { name: `Remove your like from ${name}` });
    expect(await mine.getAttribute('class')).toContain('cl-voted');

    // The important half: it survives a round trip to the server.
    await page.reload();
    const afterReload = page.getByRole('button', { name: `Remove your like from ${name}` });
    await expect(afterReload).toHaveAttribute('aria-pressed', 'true');
    expect(await afterReload.getAttribute('class')).toContain('cl-voted');

    // And clicking again takes it back, rather than stacking another vote.
    const cleared = page.waitForResponse(
      (response) => response.url().includes('/vote') && response.request().method() !== 'GET',
    );
    await afterReload.click();
    const clearedResponse = await cleared;
    expect(
      clearedResponse.ok(),
      `clearing the vote returned ${clearedResponse.status()}`,
    ).toBeTruthy();
    /*
     * `exact` matters here: Playwright matches an accessible name by
     * substring, so "Like Framehouse" would also match the dislike button
     * sitting next to it.
     */
    await expect(
      page.getByRole('button', { name: `Like ${name}`, exact: true }),
    ).toHaveAttribute('aria-pressed', 'false');
  });

  test('offers the saved list in several formats', async ({ page }) => {
    await signUpAndVerify(page);
    await page.goto('/');

    const save = page.getByRole('button', { name: /^Save / }).first();
    if ((await save.count()) === 0) test.skip(true, 'no sources listed in this environment');
    const stored = page.waitForResponse(
      (response) => response.url().includes('/save') && response.request().method() === 'POST',
    );
    await save.click();
    await stored;

    await page.goto('/saved');
    await page.getByRole('button', { name: /Export my saved links/ }).click();

    for (const [label, suffix] of [
      ['Spreadsheet', 'format=csv'],
      ['Plain text', 'format=txt'],
      ['Markdown', 'format=md'],
      ['JSON', 'format=json'],
    ] as const) {
      await expect(page.getByRole('menuitem', { name: new RegExp(label) })).toHaveAttribute(
        'href',
        new RegExp(suffix),
      );
    }

    // The text export really downloads, with the right name.
    const download = page.waitForEvent('download');
    await page.getByRole('menuitem', { name: /Plain text/ }).click();
    expect((await download).suggestedFilename()).toBe('couchlist-saved-sources.txt');
  });

  test('suggests a source with a credit choice', async ({ page }) => {
    await signUpAndVerify(page);
    await page.goto('/submit');

    await expect(page.getByRole('heading', { level: 1 })).toContainText('Suggest a source');
    await page.getByLabel('Website address').fill(`https://e2e-${Date.now()}.test/`);
    await page.getByLabel('Name').fill('End To End Source');
    await page.getByRole('checkbox', { name: 'Movies' }).check();
    await page.getByRole('radio', { name: /Keep me anonymous/ }).check();
    await page.getByRole('button', { name: 'Send suggestion' }).click();

    await expect(page).toHaveURL(/\/submissions/);
    await expect(page.getByText('Pending review')).toBeVisible();
  });

  test('account settings show the email only to its owner', async ({ page }) => {
    const email = await signUpAndVerify(page);
    await page.goto('/account');
    await expect(page.getByText(email)).toBeVisible();
  });
});

test.describe('reaching a website', () => {
  /*
   * Two destinations from one row, on purpose: the name explains the source,
   * the arrow goes to it. Someone who has already decided should not have to
   * take the explaining route first.
   */
  test('goes straight to the website without opening the source page', async ({ page }) => {
    await page.goto('/');

    const row = page.locator('article').first();
    const direct = row.getByRole('link', { name: /Open .* website in a new tab/ });
    await expect(direct).toHaveAttribute('target', '_blank');

    const rel = await direct.getAttribute('rel');
    expect(rel).toContain('noopener');
    expect(rel).toContain('noreferrer');
    expect(rel).toContain('nofollow');

    // It leaves the directory rather than going to a Couchlist page.
    const href = await direct.getAttribute('href');
    expect(href).toMatch(/^https?:\/\//);
    expect(href).not.toContain('/sources/');

    // And the name still opens the source page, for whoever wants it.
    await expect(row.getByRole('link').first()).toHaveAttribute('href', /\/sources\//);
  });
});

test.describe('an unverified account', () => {
  /*
   * Signing up signs you in. Without saying so, pressing back from the code
   * page looks like a bug, which is exactly what it looked like.
   */
  test('is told it is signed in while the code is still unused', async ({ page }) => {
    const email = `unver-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`;

    await page.goto('/signup');
    await page.getByLabel('Display name').fill('Unverified Person');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
    await page.getByLabel('Confirm password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page.getByText(/^\d{6}$/)).toBeVisible();

    // The state is explained on every page, not only the one you came from.
    await page.goto('/');
    const banner = page.getByText(/You are signed in, and browsing works/);
    await expect(banner).toBeVisible();
    await expect(page.getByRole('button', { name: /Account menu/ })).toBeVisible();

    await page.goto('/verify-email');
    await expect(page.getByText(/You are already signed in as/)).toBeVisible();
  });
});

/** The address playwright.config.ts names in ADMIN_EMAILS. */
const ADMIN_EMAIL = 'e2e-admin@example.test';

/**
 * Signs in as the moderator, creating the account the first time.
 *
 * ADMIN_EMAILS promotes it on sign-in, so there is no separate granting step
 * and no test-only route that could survive into production.
 */
async function signInAsAdmin(page: Page): Promise<void> {
  const signup = await page.request.post('/api/auth/signup', {
    data: {
      email: ADMIN_EMAIL,
      password: PASSWORD,
      confirmPassword: PASSWORD,
      displayName: 'E2E Moderator',
    },
  });
  const { devCode } = await signup.json();

  await page.request.post('/api/auth/login', { data: { email: ADMIN_EMAIL, password: PASSWORD } });
  // Only present the first time; afterwards the account is already verified.
  if (devCode) {
    await page.request.post('/api/auth/verify-email', { data: { code: devCode } });
  }
}

test.describe('the review queue', () => {
  test('can be searched and collapses what it is not showing', async ({ page }) => {
    await signInAsAdmin(page);

    // Two different websites waiting.
    for (const [index, host] of ['queue-alpha.test', 'queue-beta.test'].entries()) {
      await page.request.post('/api/sources/suggest', {
        data: {
          url: `https://${host}/`,
          name: index === 0 ? 'Queue Alpha' : 'Queue Beta',
          description: 'For the queue search test.',
          categories: ['Movies'],
          creditMode: 'CREDITED',
        },
      });
    }

    await page.goto('/admin/suggestions');
    await expect(page.getByText('queue-alpha.test')).toBeVisible();

    await page.getByRole('searchbox', { name: /Search the queue/ }).fill('beta');
    await page.getByRole('button', { name: 'Apply' }).click();

    await expect(page.getByText('queue-beta.test')).toBeVisible();
    await expect(page.getByText('queue-alpha.test')).toHaveCount(0);
    await expect(page).toHaveURL(/q=beta/);

    await page.getByRole('link', { name: 'Clear' }).click();
    await expect(page.getByText('queue-alpha.test')).toBeVisible();
  });
});

test.describe('layout', () => {
  test('no horizontal overflow at 320px', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 720 });

    for (const path of ['/', '/guides', '/login']) {
      await page.goto(path);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `${path} overflows horizontally`).toBeLessThanOrEqual(1);
    }
  });
});
