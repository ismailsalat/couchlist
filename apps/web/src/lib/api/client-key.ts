import 'server-only';

/**
 * A rate-limit key for an unauthenticated request.
 *
 * Signed-in traffic is keyed by account id. For signup, sign-in and password
 * reset there is no account yet, so the forwarded client address is used
 * instead. It is only ever a rate-limit bucket: nothing is authorized on it,
 * and it is not stored.
 */
export function clientKey(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  const first = forwarded?.split(',')[0]?.trim();
  return first || request.headers.get('x-real-ip')?.trim() || 'unknown-client';
}
