'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { SignalList, SignalRow, ToolResult, type Tone } from './result';

/**
 * Is your ad blocker working?
 *
 * Two independent probes, both entirely in the browser, because blockers
 * work in two different ways and a tool that tests only one of them gives
 * the wrong answer half the time:
 *
 *   element  a div wearing the class names every filter list hides. If the
 *            blocker applies cosmetic rules, the element collapses.
 *   request  a fetch for a path whose shape generic network rules match. If
 *            the blocker filters requests, it never completes.
 *
 * Couchlist carries no advertising, so nothing here is an attempt to detect
 * and nag. The result points at the guide for whichever browser you are in.
 */

type Probe = 'blocked' | 'allowed' | 'inconclusive';

interface Result {
  element: Probe;
  request: Probe;
}

/** The class names filter lists have hidden for twenty years. */
const BAIT_CLASSES = 'ad ads adsbox ad-banner advertisement pub_300x250 banner-ads sponsored-ad';

function detectBrowser(): { name: string; guide: string } {
  if (typeof navigator === 'undefined') return { name: 'your browser', guide: '/guides?topic=ad-blocking' };
  const agent = navigator.userAgent;

  if (/Firefox\//u.test(agent)) return { name: 'Firefox', guide: '/guides?topic=ad-blocking&q=firefox' };
  if (/Edg\//u.test(agent)) return { name: 'Edge', guide: '/guides?topic=ad-blocking&q=chrome' };
  if (/OPR\//u.test(agent)) return { name: 'Opera', guide: '/guides?topic=ad-blocking&q=chrome' };
  if (/Chrome\//u.test(agent) && !/Chromium/u.test(agent))
    return { name: 'Chrome', guide: '/guides?topic=ad-blocking&q=chrome' };
  if (/Safari\//u.test(agent)) return { name: 'Safari', guide: '/guides?topic=ad-blocking&q=safari' };
  return { name: 'your browser', guide: '/guides?topic=ad-blocking' };
}

async function probeElement(): Promise<Probe> {
  const bait = document.createElement('div');
  bait.className = BAIT_CLASSES;
  bait.setAttribute('aria-hidden', 'true');
  // Off-screen but laid out, so a collapsed height means the blocker did it
  // rather than our own styles.
  bait.style.cssText =
    'position:absolute;left:-9999px;top:-9999px;width:300px;height:250px;pointer-events:none;';
  document.body.appendChild(bait);

  // One frame, so the blocker's stylesheet has applied.
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

  const style = window.getComputedStyle(bait);
  const hidden =
    bait.offsetParent === null ||
    bait.offsetHeight === 0 ||
    bait.clientHeight === 0 ||
    style.display === 'none' ||
    style.visibility === 'hidden';

  bait.remove();
  return hidden ? 'blocked' : 'allowed';
}

async function probeRequest(): Promise<Probe> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4_000);
  try {
    // Served by our own app and deliberately named so that generic network
    // rules match it. It returns 204 and sets nothing.
    const response = await fetch(`/ads/ad-banner.js?t=${Date.now()}`, {
      cache: 'no-store',
      signal: controller.signal,
    });
    return response.ok || response.status === 204 ? 'allowed' : 'blocked';
  } catch {
    // A blocker refuses the request outright, which lands here. So does being
    // offline, which is why this is one of two probes rather than the answer.
    return 'blocked';
  } finally {
    clearTimeout(timer);
  }
}

export function AdBlockerCheck() {
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const browser = typeof window === 'undefined' ? null : detectBrowser();

  const run = useCallback(async () => {
    setBusy(true);
    try {
      const [element, request] = await Promise.all([probeElement(), probeRequest()]);
      setResult({ element, request });
    } catch {
      setResult({ element: 'inconclusive', request: 'inconclusive' });
    } finally {
      setBusy(false);
    }
  }, []);

  const blockedCount = result
    ? [result.element, result.request].filter((probe) => probe === 'blocked').length
    : 0;

  return (
    <div data-palette="green" className="rounded-2xl border border-line bg-surface p-5">
      <h2 className="m-0 text-[18px] font-bold">Ad blocker check</h2>
      <p className="mb-4 mt-1 max-w-[60ch] text-[13.5px] text-muted">
        Runs two tests in this browser and tells you what they found. Nothing is sent anywhere, and
        Couchlist carries no advertising — this is here because pop-ups and fake play buttons are the
        worst thing about the sites we list.
      </p>

      <button
        type="button"
        onClick={run}
        disabled={busy}
        className="cl-touch min-h-11 rounded-xl bg-selected px-6 text-[14.5px] font-bold text-selected-fg hover:bg-selected-hover disabled:opacity-50"
      >
        {busy ? 'Testing…' : result ? 'Test again' : 'Run the test'}
      </button>

      {result ? (
        <ToolResult
          tone={(blockedCount === 2 ? 'good' : blockedCount === 1 ? 'warn' : 'bad') as Tone}
          title={
            blockedCount === 2
              ? 'Your ad blocker is working'
              : blockedCount === 1
                ? 'Partly working'
                : 'Nothing is being blocked'
          }
          footer={
            <SignalList label="The two tests">
              <SignalRow
                tone={result.element === 'blocked' ? 'good' : 'bad'}
                name="Hidden elements"
                detail={result.element === 'blocked' ? 'Blocked' : 'Not blocked'}
              />
              <SignalRow
                tone={result.request === 'blocked' ? 'good' : 'bad'}
                name="Blocked requests"
                detail={result.request === 'blocked' ? 'Blocked' : 'Not blocked'}
              />
            </SignalList>
          }
        >
          <p className="m-0">
            {blockedCount === 2
              ? 'Both tests were blocked. You are about as protected as a blocker can make you.'
              : blockedCount === 1
                ? 'One test was blocked and one was not. Usually a blocker running in a limited mode, or filter lists that are out of date.'
                : 'This browser is showing whatever a site decides to serve. On the sites Couchlist lists, that is the difference between watching something and chasing fake play buttons.'}
          </p>
          {blockedCount < 2 && browser ? (
            <Link
              href={browser.guide}
              className="mt-2 inline-block text-[13.5px] font-semibold text-pal-text underline underline-offset-[3px]"
            >
              Set one up in {browser.name}
            </Link>
          ) : null}
        </ToolResult>
      ) : null}

    </div>
  );
}
