import { ERROR_CODES, ERROR_MESSAGES, ERROR_STATUS, type ErrorCode } from './codes.js';

/**
 * The only error type routes are expected to throw.
 *
 * `cause` and `context` stay server-side for logs. `userMessage` is the only
 * part that ever reaches a browser.
 */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly userMessage: string;
  readonly context: Record<string, unknown>;
  readonly expected: boolean;

  constructor(
    code: ErrorCode,
    options: {
      message?: string;
      userMessage?: string;
      context?: Record<string, unknown>;
      cause?: unknown;
      expected?: boolean;
    } = {},
  ) {
    super(options.message ?? code, { cause: options.cause });
    this.name = 'AppError';
    this.code = code;
    this.status = ERROR_STATUS[code];
    this.userMessage = options.userMessage ?? ERROR_MESSAGES[code];
    this.context = options.context ?? {};
    this.expected = options.expected ?? true;
  }

  static unauthorized(context?: Record<string, unknown>): AppError {
    return new AppError(ERROR_CODES.CL_UNAUTHORIZED, { context });
  }

  static forbidden(context?: Record<string, unknown>): AppError {
    return new AppError(ERROR_CODES.CL_FORBIDDEN, { context });
  }

  static forbiddenGuild(guildId: string): AppError {
    return new AppError(ERROR_CODES.CL_FORBIDDEN_GUILD, { context: { guildId } });
  }

  static notFound(what: string): AppError {
    return new AppError(ERROR_CODES.CL_NOT_FOUND, { context: { what } });
  }

  /**
   * A string argument becomes the message the user reads; anything else is
   * kept as server-side context with the generic wording shown instead.
   */
  static validation(details?: unknown): AppError {
    return new AppError(ERROR_CODES.CL_VALIDATION_FAILED, {
      ...(typeof details === 'string' ? { userMessage: details } : {}),
      context: { details },
    });
  }

  static rateLimited(retryAfterSeconds: number): AppError {
    return new AppError(ERROR_CODES.CL_RATE_LIMITED, { context: { retryAfterSeconds } });
  }

  /** True for anything unexpected, which is what gets a stack trace logged. */
  static isUnexpected(error: unknown): boolean {
    return !(error instanceof AppError) || !error.expected;
  }
}

/** Short id shown to a user and attached to the matching log line. */
export function newRequestId(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let id = '';
  for (let i = 0; i < 8; i += 1) {
    id += alphabet[Math.floor(Math.random() * alphabet.length)] ?? 'X';
  }
  return `req_${id}`;
}
