import 'server-only';
import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import {
  AppError,
  ERROR_CODES,
  ERROR_MESSAGES,
  createLogger,
  newRequestId,
} from '@couchlist/shared';
import { config } from '../config';

/**
 * Route wrapper.
 *
 * Every API route goes through this so that:
 *  - no raw exception, stack trace or database driver message reaches a client
 *  - every failure has a code and a request id that matches a log line
 *  - validation failures come back as a readable message, not a Zod dump
 */
const logger = createLogger({ service: 'web' });

export interface ApiErrorBody {
  error: { code: string; message: string; requestId: string };
}

export function errorResponse(error: unknown, requestId = newRequestId()): NextResponse {
  const level = config().LOG_LEVEL;
  const log = createLogger({ service: 'web', level, json: config().LOG_JSON });

  if (isZodError(error)) {
    log.warn('validation_failed', { requestId, issues: error.issues.length });
    return NextResponse.json<ApiErrorBody>(
      {
        error: {
          code: ERROR_CODES.CL_VALIDATION_FAILED,
          message: firstZodMessage(error),
          requestId,
        },
      },
      { status: 400 },
    );
  }

  if (error instanceof AppError) {
    log.warn('request_failed', {
      requestId,
      code: error.code,
      context: error.context,
    });
    return NextResponse.json<ApiErrorBody>(
      { error: { code: error.code, message: error.userMessage, requestId } },
      { status: error.status },
    );
  }

  // Unexpected: log everything server-side, tell the user almost nothing.
  log.error('unhandled_error', {
    requestId,
    name: (error as Error)?.name,
    message: (error as Error)?.message,
    stack: (error as Error)?.stack,
  });

  return NextResponse.json<ApiErrorBody>(
    {
      error: {
        code: ERROR_CODES.CL_INTERNAL,
        message: ERROR_MESSAGES.CL_INTERNAL,
        requestId,
      },
    },
    { status: 500 },
  );
}

export function apiRoute<T>(
  handler: (request: Request, context: { requestId: string }) => Promise<T>,
): (request: Request, routeContext?: unknown) => Promise<NextResponse> {
  return async (request: Request, routeContext?: unknown) => {
    const requestId = newRequestId();
    try {
      const result = await handler(
        request,
        { requestId, ...(routeContext as object) } as { requestId: string },
      );
      if (result instanceof NextResponse) return result;
      return NextResponse.json(result);
    } catch (error) {
      return errorResponse(error, requestId);
    }
  };
}

type ZodIssueLike = { message?: unknown };
type ZodErrorLike = { name?: unknown; issues: ZodIssueLike[] };

/**
 * Next can bundle a workspace package and the web app into separate module
 * graphs. In that case a ZodError thrown by @couchlist/shared may come from a
 * different Zod constructor than the one imported by the web bundle, making a
 * plain `instanceof ZodError` check fail even though the error is valid.
 *
 * Keep the normal instanceof fast path, then use Zod's stable public shape as
 * a cross-bundle fallback. This prevents client validation mistakes from being
 * misreported as HTTP 500 errors.
 */
function isZodError(error: unknown): error is ZodErrorLike {
  if (error instanceof ZodError) return true;
  if (!error || typeof error !== 'object') return false;

  const candidate = error as { name?: unknown; issues?: unknown };
  return candidate.name === 'ZodError' && Array.isArray(candidate.issues);
}

function firstZodMessage(error: ZodErrorLike): string {
  const issue = error.issues[0];
  if (!issue || typeof issue.message !== 'string' || issue.message.length === 0) {
    return ERROR_MESSAGES.CL_VALIDATION_FAILED;
  }
  // Zod's default messages are readable; custom ones are written for users.
  return issue.message;
}

export { logger };
