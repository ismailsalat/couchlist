/**
 * Every failure Couchlist can show a user has a code here.
 *
 * The code is what goes in logs and support conversations; the message is what
 * the user reads. Nothing else in the app writes a user-facing error string, so
 * a stack trace or raw database error can't accidentally reach the UI.
 */
export const ERROR_CODES = {
  CL_UNAUTHORIZED: 'CL_UNAUTHORIZED',
  CL_FORBIDDEN: 'CL_FORBIDDEN',
  CL_FORBIDDEN_GUILD: 'CL_FORBIDDEN_GUILD',
  CL_NOT_IN_TEST_ALLOWLIST: 'CL_NOT_IN_TEST_ALLOWLIST',
  CL_NOT_FOUND: 'CL_NOT_FOUND',
  CL_VALIDATION_FAILED: 'CL_VALIDATION_FAILED',
  CL_DUPLICATE_LIST_ENTRY: 'CL_DUPLICATE_LIST_ENTRY',
  CL_RATE_LIMITED: 'CL_RATE_LIMITED',
  CL_MEDIA_PROVIDER_TIMEOUT: 'CL_MEDIA_PROVIDER_TIMEOUT',
  CL_MEDIA_PROVIDER_ERROR: 'CL_MEDIA_PROVIDER_ERROR',
  CL_DATABASE_UNAVAILABLE: 'CL_DATABASE_UNAVAILABLE',
  CL_NOT_ENOUGH_DATA: 'CL_NOT_ENOUGH_DATA',
  CL_INTERNAL: 'CL_INTERNAL',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

/** Safe, human wording for each code. Never contains internal detail. */
export const ERROR_MESSAGES: Record<ErrorCode, string> = {
  CL_UNAUTHORIZED: 'You need to sign in with Discord to do that.',
  CL_FORBIDDEN: "You don't have access to this.",
  CL_FORBIDDEN_GUILD: "You're not a member of that server on Couchlist.",
  CL_NOT_IN_TEST_ALLOWLIST: 'Couchlist is currently in private testing.',
  CL_NOT_FOUND: "We couldn't find that.",
  CL_VALIDATION_FAILED: "That didn't look right. Check the details and try again.",
  CL_DUPLICATE_LIST_ENTRY: 'That title is already on your list.',
  CL_RATE_LIMITED: "You're doing that a bit too quickly. Try again in a moment.",
  CL_MEDIA_PROVIDER_TIMEOUT: "We couldn't load this title right now. Try again shortly.",
  CL_MEDIA_PROVIDER_ERROR: "We couldn't load this title right now. Try again shortly.",
  CL_DATABASE_UNAVAILABLE:
    'Something went wrong while saving. Your previous data is safe. Try again.',
  CL_NOT_ENOUGH_DATA: 'Watch a few more titles before we can calculate your taste match.',
  CL_INTERNAL: 'Something went wrong. Your previous data is safe. Try again.',
};

/** HTTP status for each code, so routes don't each invent one. */
export const ERROR_STATUS: Record<ErrorCode, number> = {
  CL_UNAUTHORIZED: 401,
  CL_FORBIDDEN: 403,
  CL_FORBIDDEN_GUILD: 403,
  CL_NOT_IN_TEST_ALLOWLIST: 403,
  CL_NOT_FOUND: 404,
  CL_VALIDATION_FAILED: 400,
  CL_DUPLICATE_LIST_ENTRY: 409,
  CL_RATE_LIMITED: 429,
  CL_MEDIA_PROVIDER_TIMEOUT: 504,
  CL_MEDIA_PROVIDER_ERROR: 502,
  CL_DATABASE_UNAVAILABLE: 503,
  CL_NOT_ENOUGH_DATA: 200,
  CL_INTERNAL: 500,
};
