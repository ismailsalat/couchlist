import { describe, expect, it, vi } from 'vitest';
import { updateListEntrySchema } from '@couchlist/shared';

vi.mock('server-only', () => ({}));

import { errorResponse } from '../../apps/web/src/lib/api/handler';

describe('API validation error handling', () => {
  it('returns 400 for a normal Zod validation error', async () => {
    const parsed = updateListEntrySchema.safeParse({ rating: 99 });
    expect(parsed.success).toBe(false);
    if (parsed.success) return;

    const response = errorResponse(parsed.error, 'req_validation');
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe('CL_VALIDATION_FAILED');
    expect(body.error.message).toMatch(/1 to 10/);
  });

  it('returns 400 for a Zod error coming from another bundle/realm', async () => {
    const parsed = updateListEntrySchema.safeParse({ progress: -5 });
    expect(parsed.success).toBe(false);
    if (parsed.success) return;

    // Deliberately strip the prototype so this is NOT instanceof the web
    // bundle's ZodError. Next production builds can create this exact boundary
    // between a workspace package and the app bundle.
    const crossBundleError = {
      name: 'ZodError',
      issues: parsed.error.issues.map((issue) => ({ message: issue.message })),
    };

    const response = errorResponse(crossBundleError, 'req_cross_bundle');
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe('CL_VALIDATION_FAILED');
    expect(body.error.message).toMatch(/greater than or equal to 0/i);
  });

});
