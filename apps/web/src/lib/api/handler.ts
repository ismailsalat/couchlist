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

/**
 * Route context.
 *
 * Next passes dynamic segments as a promise. Awaiting it here once means no
 * route has to know that, and `params` arrives as a plain object.
 */
export interface RouteContext<P extends Record<string, string> = Record<string, never>> {
  requestId: string;
  params: P;
}

type NextRouteContext<P> = { params?: Promise<P> | P } | undefined;

async function resolveParams<P extends Record<string, string>>(
  routeContext: NextRouteContext<P>,
): Promise<P> {
  const params = routeContext?.params;
  if (!params) return {} as P;
  return params instanceof Promise ? await params : params;
}

/** Methods that may not change anything, so they need no origin check. */
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * The largest request body any route will read.
 *
 * Nothing this app accepts is big. The largest legitimate body is a
 * suggestion carrying a 256 KB icon, which base64 inflates by about a third,
 * so 2 MB leaves generous room and still refuses anything absurd.
 *
 * This is the general form of a problem that otherwise has to be solved once
 * per parser: a validator given a hundred-megabyte array will happily walk
 * it, and the memory is gone before any rule about array length is reached.
 * Capping the body means the parser is never handed the payload at all.
 */
export const MAX_REQUEST_BODY_BYTES = 2 * 1024 * 1024;

/**
 * Refuses a body that is too large, before anything parses it.
 *
 * `Content-Length` is a claim, not a fact, so it is used only as an early
 * exit. The stream is counted as it arrives, which is what actually enforces
 * the cap for a chunked request that declares no length at all.
 */
function withBodyLimit(request: Request): Request {
  if (SAFE_METHODS.has(request.method.toUpperCase())) return request;

  const declared = Number(request.headers.get('content-length') ?? '');
  if (Number.isFinite(declared) && declared > MAX_REQUEST_BODY_BYTES) {
    throw AppError.payloadTooLarge(MAX_REQUEST_BODY_BYTES);
  }

  if (!request.body) return request;

  let seen = 0;
  const counted = request.body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        seen += chunk.byteLength;
        if (seen > MAX_REQUEST_BODY_BYTES) {
          controller.error(AppError.payloadTooLarge(MAX_REQUEST_BODY_BYTES));
          return;
        }
        controller.enqueue(chunk);
      },
    }),
  );

  return new Request(request.url, {
    method: request.method,
    headers: request.headers,
    body: counted,
    // Required by undici whenever a stream is used as a body.
    duplex: 'half',
  } as RequestInit & { duplex: 'half' });
}

/**
 * Cross-site request forgery.
 *
 * The session is a cookie, so a browser attaches it to any request it makes to
 * this origin, including one a different site caused. SameSite=Lax already
 * stops the classic cross-site form post, but it is one flag in one place:
 * it varies between browsers, it does not separate one subdomain from another,
 * and a session is not something to protect with a single mechanism.
 *
 * So every state-changing request that carries an `Origin` must carry this
 * origin. Browsers always send `Origin` on POST, PUT, PATCH and DELETE, which
 * is precisely the case this defends against.
 *
 * A request with no `Origin` at all is not from a browser form or script, and
 * therefore has no ambient cookie to borrow — command-line clients and server
 * callers land here, and are allowed through on their own credentials.
 */
function assertSameOrigin(request: Request): void {
  if (SAFE_METHODS.has(request.method.toUpperCase())) return;

  const origin = request.headers.get('origin');
  if (!origin) return;

  const allowed = new Set<string>();
  try {
    allowed.add(new URL(config().APP_BASE_URL).origin);
  } catch {
    // A misconfigured base URL must not become an open door.
  }
  // The host the request actually arrived on, which covers a preview
  // deployment or a local port without needing to be configured.
  const forwardedHost = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
  const forwardedProto = request.headers.get('x-forwarded-proto') ?? 'https';
  if (forwardedHost) {
    allowed.add(`${forwardedProto}://${forwardedHost}`);
    allowed.add(`http://${forwardedHost}`);
  }

  let candidate: string;
  try {
    candidate = new URL(origin).origin;
  } catch {
    throw AppError.forbidden({ reason: 'bad_origin' });
  }

  if (!allowed.has(candidate)) {
    logger.warn('cross_origin_request_rejected', { method: request.method });
    throw AppError.forbidden({ reason: 'cross_origin' });
  }
}

export function apiRoute<T, P extends Record<string, string> = Record<string, never>>(
  handler: (request: Request, context: RouteContext<P>) => Promise<T>,
): (request: Request, routeContext?: NextRouteContext<P>) => Promise<NextResponse> {
  return async (request: Request, routeContext?: NextRouteContext<P>) => {
    const requestId = newRequestId();
    try {
      assertSameOrigin(request);
      const params = await resolveParams<P>(routeContext);
      const result = await handler(withBodyLimit(request), { requestId, params });
      /*
       * Any Response passes straight through, not just a NextResponse: the
       * saved-sources export returns a plain Response carrying CSV, and
       * wrapping that in NextResponse.json would serialise the response
       * object itself.
       */
      if (result instanceof Response) return result as unknown as NextResponse;
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
