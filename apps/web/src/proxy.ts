import { NextResponse, type NextRequest } from 'next/server';

/**
 * Response headers and the signed-out redirect.
 *
 * The important header is caching: a page under an authenticated route can
 * contain somebody's saved sources or private notes, so it must never be
 * stored by a shared CDN. Public directory and guide pages are cacheable and
 * are deliberately left alone.
 */

/** Routes whose responses are specific to one account. */
const PRIVATE_PREFIXES = [
  '/saved',
  '/account',
  '/submissions',
  '/submit',
  '/collections',
  '/admin',
  '/verify-email',
  '/api/auth',
  '/api/account',
  '/api/admin',
  '/api/saved',
  '/api/collections',
  '/api/contributions',
];

/**
 * Pages that require a session, matched exactly.
 *
 * Exactly, not by prefix: `/collections` is the owner's management page and
 * needs a session, but `/collections/<owner>/<slug>` is how a public
 * collection is shared and must open for a signed-out visitor. The page
 * itself decides whether that particular collection is visible.
 *
 * Redirecting here, before rendering starts, keeps the redirect a real 307.
 * Once streaming has begun Next falls back to a slow meta-refresh instead.
 *
 * This only checks that a cookie exists. Whether it is valid, and whether the
 * account may see the page, is decided server-side in the page itself — that
 * remains the actual control, and this is only a courtesy.
 */
const PRIVATE_PAGES = ['/saved', '/account', '/submissions', '/submit', '/collections'];

const SESSION_COOKIE = 'couchlist_session';

/** Routes whose response body is a file a stranger uploaded. */
const SERVES_UPLOADED_BYTES =
  /^\/api\/(?:sources\/[^/]+\/icon|admin\/candidates\/[^/]+\/icon|users\/[^/]+\/avatar)$/u;

export function proxy(request: NextRequest): NextResponse {
  const path = request.nextUrl.pathname;

  if (PRIVATE_PAGES.includes(path) && !request.cookies.has(SESSION_COOKIE)) {
    // Carry where they were going, so signing in resumes it.
    const login = new URL('/login', request.url);
    login.searchParams.set('next', `${path}${request.nextUrl.search}`);
    const redirect = NextResponse.redirect(login, 307);
    redirect.headers.set('Cache-Control', 'private, no-store');
    return redirect;
  }

  const response = NextResponse.next();

  if (PRIVATE_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))) {
    response.headers.set('Cache-Control', 'private, no-store, max-age=0, must-revalidate');
    // Next sets its own Vary, so append rather than replace it.
    const existing = response.headers.get('Vary');
    response.headers.set('Vary', existing ? `${existing}, Cookie` : 'Cookie');
  }

  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('X-Frame-Options', 'DENY');
  /*
   * Routes that serve bytes somebody uploaded set their own, far stricter
   * policy: no script, no fetching, sandboxed. Overwriting it with the
   * app-wide policy here would quietly relax exactly the responses that need
   * the most care, so they are left alone.
   */
  if (!SERVES_UPLOADED_BYTES.test(path)) {
    response.headers.set('Content-Security-Policy', contentSecurityPolicy());
  }
  // Nothing here needs a camera, a microphone or a location.
  response.headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
  );

  /*
   * Only over a real HTTPS connection: sending this on plain http during
   * local development would pin localhost to HTTPS in the developer's browser
   * and leave it that way after they stop working on it.
   */
  if (request.nextUrl.protocol === 'https:' || request.headers.get('x-forwarded-proto') === 'https') {
    response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }

  return response;
}

/**
 * The content security policy.
 *
 * `frame-ancestors 'none'` is the one that matters most here: without it, a
 * page on another site can put Couchlist in an invisible frame and collect a
 * signed-in person's clicks on things like "delete account". X-Frame-Options
 * says the same for older browsers, but this is the rule that is still read.
 *
 * `form-action 'self'` stops a submit being retargeted at another site, and
 * `base-uri 'none'` stops an injected <base> moving every relative URL on the
 * page somewhere else.
 *
 * Scripts: `'unsafe-inline'` is here because Next's hydration payload is an
 * inline script, and the alternative is a per-request nonce threaded through
 * the whole render. That is a real weakening and it is written down rather
 * than glossed over: the defence against injected script in this app is that
 * React escapes everything it renders, there is no dangerouslySetInnerHTML
 * anywhere in it, and uploaded files are served from routes that set their
 * own sandboxed policy. `object-src 'none'` closes the plugin route, which
 * `'unsafe-inline'` would otherwise leave open.
 */
function contentSecurityPolicy(): string {
  const scriptSources = ["'self'", "'unsafe-inline'"];
  // Turbopack's dev client evaluates code it fetches; production never does.
  if (process.env.NODE_ENV !== 'production') scriptSources.push("'unsafe-eval'");

  return [
    "default-src 'self'",
    `script-src ${scriptSources.join(' ')}`,
    "style-src 'self' 'unsafe-inline'",
    // data: and blob: are for an icon the reader has only just chosen, before
    // it has been uploaded anywhere.
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    // The app talks only to itself; ws: is the dev server's hot reload.
    process.env.NODE_ENV === 'production'
      ? "connect-src 'self'"
      : "connect-src 'self' ws: wss:",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "frame-src 'none'",
    'upgrade-insecure-requests',
  ].join('; ');
}

export const config = {
  // Everything except Next's own static output.
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
