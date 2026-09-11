'use client';

import { useState } from 'react';

/**
 * Best-effort website icon.
 *
 * We intentionally do not draw a fake letter tile when a site has no usable
 * icon. A missing icon is less noisy than twenty nearly-identical fallbacks.
 */
export function SourceSiteIcon({ domain, size = 'md' }: { domain: string; name?: string; size?: 'sm' | 'md' }) {
  const candidates = [
    `https://${domain}/favicon.ico`,
    `https://${domain}/apple-touch-icon.png`,
    `https://${domain}/favicon.png`,
  ];
  const [candidateIndex, setCandidateIndex] = useState(0);
  const [hidden, setHidden] = useState(false);

  if (hidden) return null;

  const className = size === 'sm' ? 'source-site-icon source-site-icon-sm' : 'source-site-icon';
  return (
    <span className={className} aria-hidden="true">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={candidates[candidateIndex]}
        alt=""
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        onError={() => {
          if (candidateIndex < candidates.length - 1) setCandidateIndex((value) => value + 1);
          else setHidden(true);
        }}
      />
    </span>
  );
}
