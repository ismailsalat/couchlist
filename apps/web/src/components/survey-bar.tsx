'use client';

import { useState } from 'react';
import { X } from 'lucide-react';

/**
 * One question, once, and then never again.
 *
 * The rules this follows are the ones that separate a survey from an advert:
 * it is shown to people who already have an account and have used the site
 * for a day, to a slice of them rather than all, it can be dismissed in one
 * press, and dismissing counts as a final answer. It never blocks anything,
 * never covers the page, and never comes back.
 *
 * The second question is optional and deliberately asked rather than
 * detected. Working out whether somebody runs an ad blocker means probing
 * their browser with bait, which is what ad-walls do; asking is both honest
 * and more accurate.
 */
export function SurveyBar() {
  const [stage, setStage] = useState<'ease' | 'blocker' | 'done'>('ease');
  const [ease, setEase] = useState<number | null>(null);
  const [gone, setGone] = useState(false);

  if (gone) return null;

  async function send(body: unknown) {
    try {
      await fetch('/api/survey', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch {
      // A survey that fails loudly is worse than one that fails quietly.
    }
  }

  function dismiss() {
    setGone(true);
    void send({ dismiss: true });
  }

  function answerEase(score: number) {
    setEase(score);
    setStage('blocker');
  }

  function answerBlocker(usesAdBlocker: boolean | null) {
    setStage('done');
    void send({ ease, usesAdBlocker });
    window.setTimeout(() => setGone(true), 2600);
  }

  return (
    <aside
      aria-label="Quick question"
      className="mx-3.5 mb-3 rounded-card border border-line bg-surface p-3.5 sm:mx-6"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {stage === 'ease' ? (
            <>
              <p className="m-0 text-sm font-semibold text-text">
                How easy was it to find something to watch or read?
              </p>
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {[1, 2, 3, 4, 5].map((score) => (
                  <button
                    key={score}
                    type="button"
                    onClick={() => answerEase(score)}
                    className="cl-touch h-10 w-10 rounded-pill border-2 border-line bg-bg text-sm font-bold text-text hover:border-accent hover:bg-accent-soft hover:text-accent"
                  >
                    {score}
                  </button>
                ))}
                <span className="self-center pl-1 text-xs text-muted">
                  1 is hard, 5 is easy
                </span>
              </div>
            </>
          ) : null}

          {stage === 'blocker' ? (
            <>
              <p className="m-0 text-sm font-semibold text-text">
                Thanks. One more, if you like: do you use an ad blocker?
              </p>
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                <SurveyChoice label="Yes" onClick={() => answerBlocker(true)} />
                <SurveyChoice label="No" onClick={() => answerBlocker(false)} />
                <SurveyChoice label="Rather not say" onClick={() => answerBlocker(null)} />
              </div>
            </>
          ) : null}

          {stage === 'done' ? (
            <p className="m-0 text-sm text-muted">
              Thanks &mdash; that is the whole survey. You will not be asked again.
            </p>
          ) : null}
        </div>

        {stage === 'done' ? null : (
          <button
            type="button"
            onClick={dismiss}
            aria-label="No thanks, and do not ask again"
            className="cl-touch shrink-0 rounded-pill border border-line bg-bg p-2 text-muted hover:bg-hover hover:text-text"
          >
            <X aria-hidden="true" className="h-4 w-4" />
          </button>
        )}
      </div>
    </aside>
  );
}

function SurveyChoice({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="cl-touch rounded-pill border-2 border-line bg-bg px-3.5 py-2 text-sm font-semibold text-text hover:border-accent hover:bg-accent-soft hover:text-accent"
    >
      {label}
    </button>
  );
}
