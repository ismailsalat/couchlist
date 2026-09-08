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

  if (error instanceof ZodError) {
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

function firstZodMessage(error: ZodError): string {
  const issue = error.issues[0];
  if (!issue) return ERROR_MESSAGES.CL_VALIDATION_FAILED;
  // Zod's default messages are readable; custom ones are written for users.
  return issue.message;
}

export { logger };
