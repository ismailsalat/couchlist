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

    await page.getByText('Only have the name, not the file?').click();
    await page.getByLabel('Filename').fill('Episode.01.1080p.mp4.exe');

    const result = page.getByRole('status');
    await expect(result).toBeVisible();
    await expect(result).toContainText('Pretends to be .mp4');
  });

  test('stays calm about an ordinary download', async ({ page }) => {
    await page.goto('/tools/download-check');

    await page.getByText('Only have the name, not the file?').click();
    await page.getByLabel('Filename').fill('Show.S01E04.1080p.WEB-DL.mkv');

    await expect(page.getByRole('status')).toContainText('Nothing wrong with the name');
  });
});

test.describe('coming soon', () => {
  test('a tool that is not built says so and offers the way back', async ({ page }) => {
    await page.goto('/tools/video');

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
    // One missed check is its own figure: calling that "not answering" would
    // tell visitors a working site is broken on the strength of one request.
    await expect(page.getByText('missed one check', { exact: true })).toBeVisible();
    await expect(page.getByText('domains on our blocklists', { exact: true })).toBeVisible();
  });
});

test.describe('subtitle fixer', () => {
  test('shifts timing and offers the fixed file', async ({ page }) => {
    await page.goto('/tools/subtitles');

    // A real .srt, handed over the way a person would hand one over.
    await page.setInputFiles('input[type="file"]', {
      name: 'episode.srt',
      mimeType: 'text/plain',
      buffer: Buffer.from(
        '1\n00:00:20,000 --> 00:00:24,400\nSubtitles by someone\n\n' +
          '2\n00:00:24,600 --> 00:00:27,800\nGood morning.\n',
      ),
    });

    const result = page.getByRole('status');
    await expect(result).toBeVisible({ timeout: 10_000 });

    // The advert line goes, the dialogue stays.
    await expect(result).toContainText('1 lines ready');
    await expect(result).toContainText('1 removed');
    await expect(result).toContainText('Good morning.');

    // Nudging the slider moves the first line.
    await expect(result).toContainText('00:00:24,600');
    await page.getByRole('button', { name: '+1s' }).click();
    await expect(result).toContainText('00:00:25,600');
  });

  test('says so when the file has nothing readable in it', async ({ page }) => {
    await page.goto('/tools/subtitles');
    await page.setInputFiles('input[type="file"]', {
      name: 'notes.srt',
      mimeType: 'text/plain',
      buffer: Buffer.from('this is not a subtitle file at all'),
    });

    await expect(page.getByRole('status')).toContainText('Nothing readable');
  });
});

test.describe('manga reader', () => {
  const PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  );

  test('imports loose images and opens them for reading', async ({ page }) => {
    await page.goto('/tools/comics');

    await page.setInputFiles('input[type="file"]', [
      { name: 'page10.png', mimeType: 'image/png', buffer: PNG },
      { name: 'page2.png', mimeType: 'image/png', buffer: PNG },
      { name: 'page1.png', mimeType: 'image/png', buffer: PNG },
    ]);

    // One chapter, three pages, sorted the way a person expects.
    await expect(page.getByText('3 pages')).toBeVisible({ timeout: 10_000 });

    await page.getByRole('button', { name: /3 pages/ }).click();
    await expect(page.getByRole('button', { name: '← Chapters' })).toBeVisible();
    await expect(page.getByText('/ 3')).toBeVisible();
    // All three pages actually decoded and rendered.
    await expect(page.locator('main img')).toHaveCount(3);
  });

  test('switches to page mode and reads right to left', async ({ page }) => {
    await page.goto('/tools/comics');

    await page.setInputFiles('input[type="file"]', [
      { name: '001.png', mimeType: 'image/png', buffer: PNG },
      { name: '002.png', mimeType: 'image/png', buffer: PNG },
    ]);
    await expect(page.getByText('2 pages')).toBeVisible({ timeout: 10_000 });
    await page.getByRole('button', { name: /2 pages/ }).click();

    await page.getByRole('button', { name: 'Pages', exact: true }).click();
    await expect(page.getByRole('button', { name: 'R→L' })).toBeVisible();
    await page.getByRole('button', { name: 'R→L' }).click();
    await expect(page.getByRole('button', { name: 'Previous page' })).toBeVisible();
  });

  test('says which files it could not use rather than dropping them', async ({ page }) => {
    await page.goto('/tools/comics');
    await page.setInputFiles('input[type="file"]', {
      name: 'notes.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('not an image'),
    });

    await expect(page.getByText('Not an image or an archive')).toBeVisible({ timeout: 10_000 });
  });
});

test.describe('download check', () => {
  test('hashes locally and never offers a way to send the file', async ({ page }) => {
    const sent: string[] = [];
    await page.route('**/api/tools/file-check', async (route) => {
      sent.push(route.request().postData() ?? '');
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          sha256: 'a'.repeat(64),
          verdict: 'NOT_KNOWN',
          title: 'No threats detected',
          body: 'Nobody has reported this exact file as malware.',
          signals: [{ source: 'MalwareBazaar', status: 'unknown', detail: 'Not in their database' }],
        }),
      });
    });

    await page.goto('/tools/download-check');
    await page.setInputFiles('input[type="file"]', {
      name: 'installer.exe',
      mimeType: 'application/octet-stream',
      buffer: Buffer.from('MZ fake executable body'),
    });

    await expect(page.getByRole('status')).toContainText('No threats detected', { timeout: 10_000 });

    // The request carries a hash and nothing else.
    expect(sent).toHaveLength(1);
    const body = JSON.parse(sent[0]!);
    expect(Object.keys(body)).toEqual(['sha256']);
    expect(body.sha256).toMatch(/^[a-f0-9]{64}$/);
  });

  test('still catches a disguise the databases have never seen', async ({ page }) => {
    await page.route('**/api/tools/file-check', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          sha256: 'b'.repeat(64),
          verdict: 'NOT_KNOWN',
          title: 'No threats detected',
          body: 'Nobody has reported this exact file.',
          signals: [],
        }),
      }),
    );

    await page.goto('/tools/download-check');
    await page.setInputFiles('input[type="file"]', {
      name: 'Episode.01.1080p.mp4.exe',
      mimeType: 'application/octet-stream',
      buffer: Buffer.from('anything'),
    });

    const result = page.getByRole('status');
    await expect(result).toBeVisible({ timeout: 10_000 });
    // Unknown to the databases, but the name alone is damning.
    await expect(result).toContainText('Pretends to be .mp4');
  });
});

/**
 * The reader may show images from other sites; nothing else may.
 *
 * This is worth a test because the failure is invisible from the code: every
 * page of a pasted chapter came back refused by our *own* `img-src` header,
 * which in the console reads exactly like the source blocking us. It sent
 * the hunt in the wrong direction twice.
 */
test.describe('image policy', () => {
  test('lets the reader load remote pages, and no other page', async ({ request }) => {
    const reader = await request.get('/tools/read-manga');
    const policy = reader.headers()['content-security-policy'] ?? '';
    expect(policy).toMatch(/img-src[^;]*https:/u);

    const elsewhere = await request.get('/guides');
    const strict = elsewhere.headers()['content-security-policy'] ?? '';
    expect(strict).toMatch(/img-src/u);
    // Widened for the reader only: everywhere else stays shut.
    expect(strict).not.toMatch(/img-src[^;]*https:/u);

    // Scripts stay locked down even on the reader.
    expect(policy).not.toMatch(/script-src[^;]*https:/u);
  });

  test('keeps the old reader address working', async ({ request }) => {
    const moved = await request.get('/tools/comics', { maxRedirects: 0 });
    expect(moved.status()).toBe(308);
    expect(moved.headers()['location']).toContain('/tools/read-manga');
  });
});
