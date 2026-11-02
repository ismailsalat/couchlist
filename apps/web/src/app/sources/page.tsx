import { permanentRedirect } from 'next/navigation';

/**
 * The directory used to live at /sources.
 *
 * It is now the home page, so the old URL keeps working and sends people and
 * crawlers to the replacement rather than returning a 404. Individual source
 * pages live beneath this path at /sources/[id].
 */
export default function SourcesIndexRedirect() {
  permanentRedirect('/');
}
