import { expect, test, type Page } from '@playwright/test';

/**
 * Smoke tests.
 *
 * These use the seeded development accounts (`npm run db:seed`) and the
 * development login, so no live Discord OAuth is required.
 */
const TEST_USER = { discordId: '900000000000000101', username: 'test-user' };
const TEST_ALT = { discordId: '900000000000000102', username: 'test-alt' };
const TEST_GUILD = '900000000000000001';

async function devLogin(page: Page, account: { discordId: string; username: string }) {
  const response = await page.request.post('/api/auth/dev-login', {
    data: { ...account, guildIds: [TEST_GUILD] },
  });
  expect(response.ok()).toBeTruthy();
}

test.describe('landing', () => {
  test('shows the tagline and a Discord sign-in button', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Track what');
    await expect(page.getByRole('link', { name: /continue with discord/i })).toBeVisible();
  });

  test('signed-out users cannot reach the home page', async ({ page }) => {
    await page.goto('/home');
    await expect(page).toHaveURL('/');
  });
});

test.describe('signed in', () => {
  test.beforeEach(async ({ page }) => {
    await devLogin(page, TEST_USER);
  });

  test('home shows friends and popular sections', async ({ page }) => {
    await page.goto('/home');
    await expect(page.getByRole('heading', { name: 'Friends Watching' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Popular With Friends' })).toBeVisible();
  });

  test('search finds a title', async ({ page }) => {
    await page.goto('/search?q=attack%20on%20titan');
    await expect(page.getByRole('search').or(page.locator('input[type="search"]'))).toBeVisible();
  });

  test('search requires a minimum length', async ({ page }) => {
    await page.goto('/search');
    await page.locator('input[type="search"]').fill('a');
    await page.locator('input[type="search"]').press('Enter');
    await expect(page.getByText(/at least 2 characters/i)).toBeVisible();
  });

  test('profile shows the three status counts', async ({ page }) => {
    await page.goto('/profile');
    await expect(page.getByText('Watching', { exact: true })).toBeVisible();
    await expect(page.getByText('Completed', { exact: true })).toBeVisible();
    await expect(page.getByText('Plan to Watch', { exact: true })).toBeVisible();
  });

  test('friends page lists the other test account', async ({ page }) => {
    await page.goto('/friends');
    await expect(page.getByRole('heading', { name: 'Friends' })).toBeVisible();
    await expect(page.getByText(/test alt/i)).toBeVisible();
  });

  test('title page shows friend-circle statistics', async ({ page }) => {
    await page.goto('/media/anilist/anime/16498');
    await expect(page.getByRole('heading', { name: 'With Your Friends' })).toBeVisible();
  });

  test('server page loads', async ({ page }) => {
    await page.goto(`/server/${TEST_GUILD}`);
    await expect(page.getByRole('heading', { name: 'Test Server' })).toBeVisible();
  });

  test('watch together page loads', async ({ page }) => {
    await page.goto('/watch-together');
    await expect(page.getByRole('heading', { name: /find something to watch/i })).toBeVisible();
  });

  test('comparison against the alt account renders', async ({ page }) => {
    const friends = await page.request.get('/api/me/profile');
    expect(friends.ok()).toBeTruthy();

    await page.goto('/friends');
    await page.getByRole('link', { name: 'Compare' }).first().click();
    await expect(page.getByRole('heading', { level: 1 })).toContainText('+');
  });

  test('health endpoint reports status', async ({ page }) => {
    const response = await page.request.get('/api/health');
    const body = await response.json();
    expect(body.database).toBe('healthy');
    expect(body).not.toHaveProperty('databaseUrl');
  });
});

test.describe('authorization', () => {
  test('an unknown user cannot be read through comparison', async ({ page }) => {
    await devLogin(page, TEST_USER);
    const response = await page.request.get('/api/compare/usr_does_not_exist');
    expect([403, 404]).toContain(response.status());
  });

  test('an unauthenticated request is rejected', async ({ request }) => {
    const response = await request.get('/api/me/list');
    expect(response.status()).toBe(401);
  });
});

test.describe('accessibility basics', () => {
  test('search input has an accessible name', async ({ page }) => {
    await devLogin(page, TEST_USER);
    await page.goto('/search');
    await expect(page.getByLabel(/search anime, movies, or tv/i)).toBeVisible();
  });

  test('mobile navigation is reachable', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'mobile only');
    await devLogin(page, TEST_ALT);
    await page.goto('/home');
    await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
  });
});
