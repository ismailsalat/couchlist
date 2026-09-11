/** Small reminder shown anywhere Couchlist sends people to an external source. */
export function SourceSafetyNote() {
  return (
    <aside className="source-safety-note" aria-label="External link safety">
      <span className="source-safety-icon" aria-hidden="true">!</span>
      <p>
        <strong>External links:</strong> use an ad blocker, avoid downloads or sign-ins on unfamiliar sites, and report anything suspicious. A VPN can help with privacy, but it does not make a site safe.
      </p>
    </aside>
  );
}
