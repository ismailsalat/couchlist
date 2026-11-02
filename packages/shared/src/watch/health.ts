import { parseExternalUrl } from './url.js';

/**
 * Checking whether a listed address still works.
 *
 * The decisions live here, separate from the database and the network, so
 * they can be tested without either. The fetching itself is injected.
 *
 * Two rules matter more than the rest:
 *
 *  1. Every address is re-validated immediately before it is fetched, and so
 *     is every redirect it is sent through. The address passed the private-
 *     network checks when it was first submitted, but DNS can change under a
 *     name, and a redirect is somebody else choosing where our server goes
 *     next. Checking once at submission would make this job a confused
 *     deputy with a list of destinations an attacker supplied.
 *
 *  2. Failures are counted consecutively and reset on any success. One
 *     timeout is weather. Three in a row is a dead site.
 */

export const HEALTH_STATUSES = ['OK', 'MOVED', 'ERROR', 'UNREACHABLE', 'REFUSED'] as const;
export type HealthStatus = (typeof HEALTH_STATUSES)[number];

/** Consecutive failures before a source is put in front of a moderator. */
export const HEALTH_FAILURES_BEFORE_FLAG = 3;

/** How many redirects to follow before giving up and calling it moved. */
export const MAX_REDIRECTS = 4;

export interface HealthOutcome {
  status: HealthStatus;
  statusCode?: number;
  /** One line for a moderator. Never the response body. */
  detail?: string;
  /** Where it ended up, when that is somewhere else. */
  finalUrl?: string;
}

/** The subset of fetch this needs, so a test can supply its own. */
export type HealthFetch = (
  url: string,
  init: { redirect: 'manual'; signal: AbortSignal; method: string },
) => Promise<{ status: number; headers: { get(name: string): string | null } }>;

/**
 * Decides what a response means.
 *
 * A 403 or a 405 is not a dead site: plenty of hosts refuse an unusual
 * request from an unfamiliar client while serving browsers perfectly well.
 * Calling those failures would flag half the directory, so they count as
 * reachable with a note rather than as errors.
 */
export function interpretStatus(status: number): { status: HealthStatus; detail?: string } {
  if (status >= 200 && status < 300) return { status: 'OK' };
  if (status === 401 || status === 403 || status === 405 || status === 429) {
    return {
      status: 'OK',
      detail: `Answered ${status}: reachable, but it refuses an automated request. Check by hand.`,
    };
  }
  if (status >= 400 && status < 500) return { status: 'ERROR', detail: `Answered ${status}.` };
  if (status >= 500) return { status: 'ERROR', detail: `Answered ${status}, a server error.` };
  return { status: 'ERROR', detail: `Answered ${status}.` };
}

/**
 * A connection failure in words a moderator can act on.
 *
 * Node's fetch reports almost every network failure as the message "fetch
 * failed" and puts the real reason in `cause.code`. Showing "fetch failed" on
 * the review page tells a moderator nothing: a domain that no longer resolves
 * and a server that refuses connections need different decisions, and one of
 * them is usually "the site is gone".
 */
export function describeFetchError(error: unknown, timeoutMs: number): string {
  if ((error as Error)?.name === 'AbortError') {
    return `No answer within ${Math.round(timeoutMs / 1000)} seconds.`;
  }

  const code = (error as { cause?: { code?: string } })?.cause?.code;
  switch (code) {
    case 'ENOTFOUND':
      return 'The domain name no longer resolves.';
    case 'EAI_AGAIN':
      return 'The domain name could not be looked up this time.';
    case 'ECONNREFUSED':
      return 'The server refused the connection.';
    case 'ECONNRESET':
      return 'The server closed the connection.';
    case 'ETIMEDOUT':
      return 'The connection timed out.';
    case 'EHOSTUNREACH':
    case 'ENETUNREACH':
      return 'No route to the server.';
    case 'CERT_HAS_EXPIRED':
      return "The site's certificate has expired.";
    case 'DEPTH_ZERO_SELF_SIGNED_CERT':
    case 'SELF_SIGNED_CERT_IN_CHAIN':
    case 'UNABLE_TO_VERIFY_LEAF_SIGNATURE':
      return "The site's certificate could not be verified.";
    case 'ERR_TLS_CERT_ALTNAME_INVALID':
      return "The site's certificate is for a different domain.";
    default:
      break;
  }

  const message = (error as Error)?.message;
  // "fetch failed" is Node telling us nothing; say so plainly instead.
  if (!message || message === 'fetch failed') return 'Could not connect.';
  return message;
}

/** Same registrable name, ignoring a leading www. */
export function sameSite(a: string, b: string): boolean {
  const strip = (host: string) => host.replace(/^www\./iu, '').toLowerCase();
  return strip(a) === strip(b);
}

export async function checkSourceHealth(
  homepageUrl: string,
  doFetch: HealthFetch,
  options: { timeoutMs?: number } = {},
): Promise<HealthOutcome> {
  const timeoutMs = options.timeoutMs ?? 10_000;

  const start = parseExternalUrl(homepageUrl);
  if (!start) {
    // The stored address no longer passes the checks it passed on the way in.
    return {
      status: 'REFUSED',
      detail: 'This address no longer looks safe to request. It was not fetched.',
    };
  }

  let current = start;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let response: Awaited<ReturnType<HealthFetch>>;
    try {
      response = await doFetch(current.url.toString(), {
        // Never automatic: each hop is somebody else's choice of destination
        // and has to be checked before it is followed.
        redirect: 'manual',
        signal: controller.signal,
        method: hop === 0 ? 'HEAD' : 'GET',
      });
    } catch (error) {
      return {
        status: 'UNREACHABLE',
        detail: describeFetchError(error, timeoutMs).slice(0, 200),
      };
    } finally {
      clearTimeout(timer);
    }

    const isRedirect = response.status >= 300 && response.status < 400;
    if (!isRedirect) {
      const verdict = interpretStatus(response.status);
      return {
        status: verdict.status,
        statusCode: response.status,
        detail: verdict.detail,
        finalUrl: sameSite(current.domain, start.domain) ? undefined : current.url.toString(),
      };
    }

    const location = response.headers.get('location');
    if (!location) {
      return {
        status: 'ERROR',
        statusCode: response.status,
        detail: 'Redirected without saying where to.',
      };
    }

    let next: URL;
    try {
      next = new URL(location, current.url);
    } catch {
      return { status: 'ERROR', statusCode: response.status, detail: 'Redirected somewhere unreadable.' };
    }

    const checked = parseExternalUrl(next.toString());
    if (!checked) {
      /*
       * The redirect points somewhere this server must not go: a private
       * address, a different scheme, or a host that fails the same rules a
       * submission would. Refusing is the point.
       */
      return {
        status: 'REFUSED',
        statusCode: response.status,
        detail: 'Redirected to an address we will not request.',
      };
    }

    current = checked;
  }

  return {
    status: 'MOVED',
    detail: `Still redirecting after ${MAX_REDIRECTS} hops. Last seen at ${current.url.toString()}.`,
    finalUrl: current.url.toString(),
  };
}

/**
 * Whether an outcome counts against a source. A moved site is not broken.
 *
 * Takes the stored value, which may be null for a source nobody has checked.
 */
export function countsAsFailure(status: HealthStatus | string | null): boolean {
  return status === 'ERROR' || status === 'UNREACHABLE';
}

/** Whether a moderator should look at this. */
export function needsAttention(input: {
  healthFailures: number;
  healthStatus: string | null;
  openReports: number;
}): boolean {
  if (input.healthFailures >= HEALTH_FAILURES_BEFORE_FLAG) return true;
  if (input.healthStatus === 'MOVED' || input.healthStatus === 'REFUSED') return true;
  // Several people independently saying the same thing is its own signal.
  return input.openReports >= 3;
}

/**
 * What to tell a reader about the last check, if anything.
 *
 * Pure, and the clock is an argument, so the sentence is testable and the
 * view that renders it does not read a clock while rendering.
 *
 * It says only what is known. A source whose checks are failing does not get
 * a "broken" label here: the automated check is one signal, nobody has
 * looked yet, and a day of trouble on somebody else's server is not grounds
 * for telling every reader the site is gone.
 */
export function describeLastCheck(input: {
  at: Date | null;
  status: string | null;
  failures: number;
  now: Date;
}): string | null {
  if (!input.at) return null;

  const days = Math.floor((input.now.getTime() - input.at.getTime()) / 86_400_000);
  // A clock that disagrees, or a check older than a month, is not evidence of
  // upkeep, so neither is offered as any.
  if (days < 0 || days > 31) return null;

  const when = days === 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`;

  if (input.failures >= HEALTH_FAILURES_BEFORE_FLAG) {
    return `We could not reach this address when we last checked, ${when}. It may be temporary, and a moderator has been asked to look.`;
  }
  if (input.status === 'MOVED') {
    return `Checked ${when}. It now redirects somewhere else, and a moderator has been asked to look.`;
  }
  return `Link checked ${when}.`;
}
