import { expect, test } from '@playwright/test';

/**
 * The tools, in a real browser.
 *
 * These cover the parts that only exist once JavaScript runs: the checker
 * round trip, the browser-side download inspection, and the coming-soon
 * screen that stands in for tools that are not built yet.
 */

test.describe('tools and guides hub', () => {
  test('puts the tools above the guides and tags each one', async ({ page }) => {
    await page.goto('/guides');

    const tools = page.getByRole('heading', { name: 'Tools', exact: true });
    const guides = page.getByRole('heading', { name: 'Guides', exact: true });
    await expect(tools).toBeVisible();
    await expect(guides).toBeVisible();

    // Tools must come first in the document, not merely exist.
    const order = await page.evaluate(() => {
      const headings = [...document.querySelectorAll('h2')].map((node) => node.textContent?.trim());
      return { tools: headings.indexOf('Tools'), guides: headings.indexOf('Guides') };
    });
    expect(order.tools).toBeGreaterThanOrEqual(0);
    expect(order.tools).toBeLessThan(order.guides);

    // Every tile says what kind it is and whether it works yet.
    await expect(page.getByText('Coming soon').first()).toBeVisible();
    await expect(page.getByText('Ready').first()).toBeVisible();
  });

  test('guide rows carry their topic tag', async ({ page }) => {
    await page.goto('/guides?topic=ad-blocking');
    const row = page.locator('details').first();
    await expect(row).toBeVisible();
    await expect(row.getByText('Ad blocking').first()).toBeVisible();
  });
});

test.describe('site safety checker', () => {
  test('never calls an unknown domain safe', async ({ page }) => {
    await page.goto('/tools/site-safety');

    await page.getByLabel('Site address').fill('nobody-has-listed-this.example');
    await page.getByRole('button', { name: 'Check' }).click();

    const result = page.getByRole('status');
    await expect(result).toBeVisible({ timeout: 15_000 });
    await expect(result).toContainText('Not listed');
    await expect(result).toContainText('not the same as it being safe');
  });

  test('names each source of evidence separately', async ({ page }) => {
    await page.goto('/tools/site-safety');

    await page.getByLabel('Site address').fill('example.com');
    await page.getByRole('button', { name: 'Check' }).click();

    const result = page.getByRole('status');
    await expect(result).toBeVisible({ timeout: 15_000 });
    // Unconfigured providers are reported as unavailable, never as clean.
    await expect(result).toContainText('Google Safe Browsing');
  });

  test('rejects an address that is not one', async ({ page }) => {
    await page.goto('/tools/site-safety');

    await page.getByLabel('Site address').fill('not a domain at all');
    await page.getByRole('button', { name: 'Check' }).click();

    // Next renders its own aria-live route announcer, so scope to the form's.
    const alert = page.locator('p[role="alert"]');
    await expect(alert).toBeVisible({ timeout: 15_000 });
    // The real reason, not the generic fallback.
    await expect(alert).toContainText('does not look like a web address');
  });
});

test.describe('download safety check', () => {
  test('flags a video name that is really an executable', async ({ page }) => {
    await page.goto('/tools/download-check');

    await page.getByLabel('Filename').fill('Episode.01.1080p.mp4.exe');

    const result = page.getByRole('status');
    await expect(result).toBeVisible();
    await expect(result).toContainText('Do not open this');
  });

  test('stays calm about an ordinary download', async ({ page }) => {
    await page.goto('/tools/download-check');

    await page.getByLabel('Filename').fill('Show.S01E04.1080p.WEB-DL.mkv');

    await expect(page.getByRole('status')).toContainText('Looks like what it says');
  });
});

test.describe('coming soon', () => {
  test('a tool that is not built says so and offers the way back', async ({ page }) => {
    await page.goto('/tools/subtitles');

    await expect(page.getByRole('heading', { name: 'Coming soon' })).toBeVisible();
    await expect(page.getByRole('img', { name: 'Roadworks cone' })).toBeVisible();

    await page.getByRole('link', { name: 'Back to tools' }).click();
    await expect(page).toHaveURL(/\/guides$/);
  });

  test('an unknown tool is a 404, not a coming-soon screen', async ({ page }) => {
    const response = await page.goto('/tools/not-a-real-tool');
    expect(response?.status()).toBe(404);
  });
});

test.describe('live status', () => {
  test('counts unchecked separately from working', async ({ page }) => {
    await page.goto('/tools/status');

    // The figure labels, not the per-row detail text, which repeats the words.
    await expect(page.getByText('not checked yet', { exact: true })).toBeVisible();
    await expect(page.getByText('not answering', { exact: true })).toBeVisible();
    await expect(page.getByText('answering', { exact: true })).toBeVisible();
    await expect(page.getByText('domains on our blocklists', { exact: true })).toBeVisible();
  });
});
