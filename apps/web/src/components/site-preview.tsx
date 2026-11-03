/**
 * What the site looks like.
 *
 * The picture is either the share image the site publishes in its own HTML
 * for other people's pages to use, or one a moderator chose. It is never an
 * automated screenshot of somebody's page, and the caption says which it is,
 * so a reader is never shown another site's artwork as though Couchlist made
 * it.
 *
 * Served from Couchlist rather than hot-linked, so the listed site is not
 * told who is reading about it.
 */
export function SitePreview({
  sourceId,
  name,
  note,
  shouldAvoid,
}: {
  sourceId: string;
  name: string;
  note: string | null;
  /* A site we warn about does not get a flattering picture at the top. */
  shouldAvoid: boolean;
}) {
  if (shouldAvoid) return null;

  return (
    <figure className="m-0 mt-4 overflow-hidden rounded-card border border-line bg-bg">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`/api/sources/${sourceId}/preview`}
        alt={`How ${name} presents itself`}
        loading="lazy"
        decoding="async"
        /*
         * A fixed page-shaped window rather than however tall the picture
         * happens to be. Share images are 1200x630, screenshots 1280x800 and
         * uploads are anything at all; without a box of its own the listing
         * jumped around depending on which one it got.
         */
        className="block aspect-[16/9] w-full bg-active object-cover object-top"
      />
      <figcaption className="border-t border-line px-3 py-2 text-xs text-muted">
        {note ?? 'A picture of how this site presents itself.'} Couchlist does not host or
        control the site itself.
      </figcaption>
    </figure>
  );
}
