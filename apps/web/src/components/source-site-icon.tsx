'use client';

import { useState } from 'react';

export function SourceSiteIcon({ domain, name, size = 'md' }: { domain: string; name: string; size?: 'sm' | 'md' }) {
  const [failed, setFailed] = useState(false);
  const initial = (name || domain).trim().slice(0, 1).toUpperCase() || '•';
  const className = size === 'sm' ? 'source-site-icon source-site-icon-sm' : 'source-site-icon';
  if (failed) return <span className={`${className} source-site-icon-fallback`} aria-hidden="true">{initial}</span>;
  return (
    <span className={className} aria-hidden="true">
      {/* Direct lazy favicon, no referrer. If the site has none, use a clean initial. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`https://${domain}/favicon.ico`} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
    </span>
  );
}
