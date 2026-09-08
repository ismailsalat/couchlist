import { NextResponse, type NextRequest } from 'next/server';

/**
 * Response headers.
 *
 * The important one is caching: anything under an authenticated route can
 * contain another member's watch history, so it must never be stored by a
 * shared CDN. Public media metadata is cached inside the app's own database
 * instead, which is safe.
 */
const PRIVATE_PREFIXES = [
  '/home',
  '/profile',
  '/friends',
  '/server',
  '/compare',
  '/watch-together',
  '/search',
  '/api/me',
  '/api/guilds',
  '/api/friends',
  '/api/compare',
  '/api/watch-together',
  '/api/search',
  '/api/auth',
];

/** Pages that require a session. API routes answer 401 instead of redirecting. */
const PRIVATE_PAGES = ['/home', '/profile', '/friends', '/server', '/compare', '/watch-together', '/search'];

const SESSION_COOKIE = 'couchlist_session';

export function proxy(request: NextRequest): NextResponse {
  const path = request.nextUrl.pathname;
  const isPrivate = PRIVATE_PREFIXES.some((prefix) => path.startsWith(prefix));

  // Send signed-out visitors away with a real redirect before any rendering
  // starts. Without this, streaming has already begun by the time the page
  // calls redirect(), and Next falls back to a slow meta-refresh.
  //
  // This only checks that a cookie exists. Whether it is valid is decided
  // server-side in the page or route, which remains the actual control.
  if (
    PRIVATE_PAGES.some((prefix) => path.startsWith(prefix)) &&
    !request.cookies.has(SESSION_COOKIE)
  ) {
    const redirect = NextResponse.redirect(new URL('/', request.url), 307);
    redirect.headers.set('Cache-Control', 'private, no-store');
    return redirect;
  }

  const response = NextResponse.next();

  if (isPrivate) {
    response.headers.set('Cache-Control', 'private, no-store, max-age=0, must-revalidate');
    // Next sets its own Vary, so append rather than replace it.
    const existing = response.headers.get('Vary');
    response.headers.set('Vary', existing ? `${existing}, Cookie` : 'Cookie');
  }

  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('X-Frame-Options', 'DENY');

  return response;
}

export const config = {
  // Everything except Next's own static output.
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
