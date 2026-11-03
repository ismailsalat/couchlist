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
    // Scoped to the header: the site-information footer links to Guides too,
    // which is fine for a reader and ambiguous for an unscoped locator.
    const mainNav = page.getByRole('navigation', { name: 'Main navigation' });
    await expect(mainNav).toBeVisible();
    await expect(mainNav.getByRole('link', { name: 'Discover' })).toBeVisible();
    await expect(mainNav.getByRole('link', { name: 'Guides' })).toBeVisible();
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

  /*
   * The complaint that prompted this: you sign up, land on the code page,
   * press back, and the site behaves as though it let you in. It had not —
   * voting and contributing were refused server-side — but nothing said so.
   * Now the hold is real, so back goes back to the code page.
   */
  test('cannot wander off the verification page until the code is used', async ({ page }) => {
    const email = `held-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`;

    await page.goto('/signup');
    await page.getByLabel('Display name').fill('Held Person');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
    await page.getByLabel('Confirm password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Create account' }).click();

    const code = page.getByText(/^\d{6}$/);
    await expect(code).toBeVisible();
    const digits = (await code.textContent())!.trim();

    await page.getByRole('link', { name: 'Enter this code' }).click();
    await expect(page).toHaveURL(/\/verify-email/);

    // The back button, which is what was reported.
    await page.goBack();
    await expect(page).toHaveURL(/\/verify-email/);

    // And typing a URL directly, which is the same thing without the history.
    await page.goto('/saved');
    await expect(page).toHaveURL(/\/verify-email/);
    await page.goto('/');
    await expect(page).toHaveURL(/\/verify-email/);

    // Using the code lifts the hold, and the site opens up.
    await page.getByLabel('Verification code').fill(digits);
    await page.getByRole('button', { name: 'Verify email' }).click();
    await expect(page.getByRole('button', { name: /Account menu/ })).toBeVisible();

    await page.goto('/');
    await expect(page).toHaveURL(/\/$|\/\?/);
    await expect(page.getByRole('button', { name: /Account menu/ })).toBeVisible();
  });

  /** Being held somewhere must never mean being stuck there. */
  test('offers a way out of the hold without using the code', async ({ page }) => {
    const email = `stuck-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`;

    await page.goto('/signup');
    await page.getByLabel('Display name').fill('Stuck Person');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
    await page.getByLabel('Confirm password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page.getByText(/^\d{6}$/)).toBeVisible();

    await page.goto('/verify-email');
    await page.getByRole('button', { name: /Use a different address/ }).click();

    // Signed out, and free to move again.
    await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible();
    await page.goto('/guides');
    await expect(page).toHaveURL(/\/guides/);
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

test.describe('finding a way to contribute', () => {
  /*
   * Suggesting a source used to live only in the footer, under a long list.
   * That is the one place a reader who has just failed to find what they
   * wanted will not look, which is exactly the moment they would want it.
   */
  test('offers suggesting a source without scrolling to the footer', async ({ page }) => {
    await page.goto('/');

    const suggest = page.getByRole('link', { name: /Suggest/ }).first();
    await expect(suggest).toBeVisible();
    await expect(suggest).toHaveAttribute('href', '/submit');

    // Above the fold, which is the whole point.
    const box = (await suggest.boundingBox())!;
    const viewport = page.viewportSize()!;
    expect(box.y).toBeLessThan(viewport.height);

    await suggest.click();
    await expect(page).toHaveURL(/\/submit|\/login/);
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
  /*
   * The row is a grid so the description can drop under the name on a phone
   * and sit beside it on a desktop. If it ever goes back to squeezing both
   * onto one line, descriptions become three words wide again.
   */
  test('gives the description the full row width on a phone', async ({ page }) => {
    await page.setViewportSize({ width: 393, height: 852 });
    await page.goto('/');

    const described = page
      .locator('article')
      .filter({ has: page.locator('p.cl-desc-clamp') })
      .first();
    if ((await described.count()) === 0) test.skip(true, 'no described sources listed');

    const description = described.locator('p.cl-desc-clamp').first();
    const name = described.getByRole('link').first();

    const descBox = (await description.boundingBox())!;
    const nameBox = (await name.boundingBox())!;

    // Wider than the name column, which is the whole point of the change.
    expect(descBox.width).toBeGreaterThan(nameBox.width);
    // And below it, not beside it.
    expect(descBox.y).toBeGreaterThan(nameBox.y);
  });


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

test.describe('saying a link is dead', () => {
  /*
   * The whole point of the one-click report is that it is one click. If this
   * ever grows a form, a confirm or a page change, it has stopped being the
   * thing that gets a dead link reported.
   */
  test('takes one click and says so', async ({ page }) => {
    await signUpAndVerify(page);

    await page.goto('/');
    await page.locator('article').first().getByRole('link').first().click();
    await expect(page).toHaveURL(/\/sources\//);

    const button = page.getByRole('button', { name: 'Link looks dead' });
    await expect(button).toBeVisible();

    const reported = page.waitForResponse(
      (response) =>
        response.url().includes('/api/sources/report') && response.request().method() === 'POST',
    );
    await button.click();
    expect((await reported).status()).toBe(200);

    await expect(page.getByText('a moderator will check it')).toBeVisible();
    // Nothing public changed: the listing is still a listing.
    await expect(page.getByRole('link', { name: /Visit website/ })).toBeVisible();
  });

  test('asks a signed-out reader to sign in instead of swallowing the click', async ({ page }) => {
    await page.goto('/');
    await page.locator('article').first().getByRole('link').first().click();

    const link = page.getByRole('link', { name: 'Link looks dead' });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute('href', /\/login\?next=/);
  });
});

test.describe('the attention queue', () => {
  test('leads the admin tabs and explains itself when empty', async ({ page }) => {
    await signInAsAdmin(page);
    await page.goto('/admin/attention');

    await expect(page.getByRole('link', { name: /Needs attention/ })).toBeVisible();
    // Either state is correct; what matters is that the page renders and says
    // plainly that nothing has been hidden behind the moderator's back.
    const empty = page.getByText('Nothing needs a decision.');
    const listed = page.getByText('Nothing has been hidden or changed');
    await expect(empty.or(listed).first()).toBeVisible();
  });
});

test.describe('showing who runs this', () => {
  /*
   * The information links are what tells a person — and a reputation
   * scanner — that this is a real site with somebody behind it. They have to
   * survive on the page people actually land on from a search result, and on
   * the sign-in page, which is the one that looks most like phishing without
   * them.
   */
  test('reaches about, privacy and terms from the footer of a listing', async ({ page }) => {
    await page.goto('/');
    await page.locator('article').first().getByRole('link').first().click();
    await expect(page).toHaveURL(/\/sources\//);

    const footer = page.getByRole('navigation', { name: 'Site information' });
    await expect(footer).toBeVisible();

    await footer.getByRole('link', { name: 'Privacy' }).click();
    await expect(page).toHaveURL(/\/privacy/);
    await expect(page.getByRole('heading', { name: 'Privacy', level: 1 })).toBeVisible();

    await page.getByRole('navigation', { name: 'Site information' })
      .getByRole('link', { name: 'Terms' })
      .click();
    await expect(page).toHaveURL(/\/terms/);
    await expect(page.getByRole('heading', { name: 'Terms of use', level: 1 })).toBeVisible();
  });

  test('says who runs it and how to write to them, on the sign-in page', async ({ page }) => {
    await page.goto('/login');

    const footer = page.getByRole('navigation', { name: 'Site information' });
    await expect(footer.getByRole('link', { name: 'About' })).toBeVisible();
    await expect(footer.getByRole('link', { name: /@/ })).toBeVisible();
    await expect(page.getByText(/does not host, stream or proxy/)).toBeVisible();
  });
});

test.describe('the statistics page', () => {
  test('is public, and says where its numbers come from', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('navigation', { name: 'Site information' })
      .getByRole('link', { name: 'Statistics' })
      .click();

    await expect(page).toHaveURL(/\/stats/);
    await expect(page.getByRole('heading', { name: 'Statistics', level: 1 })).toBeVisible();
    await expect(page.getByText('count of things the site already holds')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'What the directory covers' })).toBeVisible();
  });
});

test.describe('admin bulk import', () => {
  test('checks a file before writing, then imports it hidden', async ({ page }) => {
    await signInAsAdmin(page);
    await page.goto('/admin/import');

    const file = JSON.stringify([
      { domain: 'e2e-import-one.test', name: 'E2E Import One', categories: ['Movies'] },
      { domain: 'nope', name: 'Broken Row' },
    ]);

    await page.getByRole('textbox', { name: /paste it here/i }).fill(file);
    await page.getByRole('button', { name: /Check it first/ }).click();

    await expect(page.getByRole('heading', { name: 'What this would do' })).toBeVisible();
    await expect(page.getByText('Rejected rows')).toBeVisible();

    await page.getByRole('button', { name: /^Import/ }).click();
    await expect(page.getByRole('heading', { name: 'Imported' })).toBeVisible();
    await expect(page.getByText(/hidden until you publish/)).toBeVisible();

    // Hidden means hidden: not on Discover.
    await page.goto('/');
    await expect(page.getByText('e2e-import-one.test')).toHaveCount(0);

    // And obvious in the admin list, in a colour you can actually see.
    await page.goto('/admin/sources?q=e2e-import-one');
    await expect(page.getByText('Hidden').first()).toBeVisible();
  });
});

test.describe('editing a source', () => {
  test('makes it obvious which row is open', async ({ page }) => {
    await signInAsAdmin(page);
    await page.goto('/admin/sources');

    const row = page.locator('div.border-b').filter({ has: page.getByRole('button', { name: 'Edit' }) }).first();
    await row.getByRole('button', { name: 'Edit' }).click();

    // The name of what is being edited stays on screen while the form scrolls.
    await expect(page.getByText(/^Editing /)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Close' }).first()).toBeVisible();
  });
});
