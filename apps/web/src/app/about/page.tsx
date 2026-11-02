import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage, Points, Section } from '@/components/legal-page';
import { optionalUser } from '@/lib/api/guards';
import { savedCountFor } from '@/lib/directory/page-data';
import { siteContact } from '@/lib/site';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'About',
  description:
    'What Couchlist is, what it deliberately is not, who runs it, and how to get in touch.',
  alternates: { canonical: '/about' },
};

/**
 * About.
 *
 * This page exists for two readers. The first is somebody deciding whether to
 * trust the site enough to make an account; the second is an automated
 * reputation system deciding the same thing. Both are answered by the same
 * thing: saying plainly who runs this, what it does, what it refuses to do,
 * and where to write. Vagueness reads as evasion to both of them.
 */
export default async function AboutPage() {
  const user = await optionalUser();
  const savedCount = await savedCountFor(user);
  const { email, operator } = siteContact();

  return (
    <LegalPage
      title="About Couchlist"
      intro="A community directory of places to watch and read, and guides for getting them working."
      user={user}
      savedCount={savedCount}
    >
      <Section title="What it is">
        <p className="m-0">
          Couchlist is a list of websites, kept by the people who use them. Anyone can browse it
          without an account. Members suggest sites, correct listings, vote on whether a site is
          actually any good, and flag the ones that have gone bad.
        </p>
        <p className="m-0">
          The ranking is a confidence-weighted score rather than a raw percentage, so a site with
          four votes does not sit above one with four hundred. Moderators can pin a handful of
          trusted picks and add short quality notes, and both are labelled as human choices
          rather than dressed up as algorithmic ones.
        </p>
      </Section>

      <Section title="What it is not">
        <Points
          items={[
            <>
              <strong>It hosts nothing.</strong> No video, no comics, no translated pages, no
              proxying, no embedding. Every link goes straight to the site it names, in a new tab.
              Couchlist is a page of addresses.
            </>,
            <>
              <strong>It is not an endorsement.</strong> A listing means somebody found a site and
              other people voted on it. Sites with heavy advertising are labelled, and sites we
              think you should avoid stay listed <em>with the warning attached</em>, because
              somebody who hears the name elsewhere is better served by a warning than by silence.
            </>,
            <>
              <strong>It does not follow you.</strong> No analytics, no advertising network, no
              third-party scripts, no tracking pixels. See the{' '}
              <Link href="/privacy" className="text-accent">
                privacy page
              </Link>{' '}
              for exactly what is stored.
            </>,
            <>
              <strong>It will never ask you for money or a card.</strong> There is no payment of
              any kind. If a page claiming to be Couchlist asks for either, it is not us — please
              tell us about it.
            </>,
          ]}
        />
      </Section>

      <Section title="How listings are kept honest">
        <Points
          items={[
            'Suggestions are reviewed by a moderator before anything is published.',
            'When several people suggest the same site, the submissions are grouped and everyone who sent it is credited.',
            'A weekly automated check visits each listed address once and records whether it answered. Three failures in a row put the listing in front of a moderator.',
            'Nothing is hidden or re-ranked automatically on the strength of that check alone. A bad afternoon on somebody else’s server is not a reason to delete a good listing.',
            'Anyone signed in can report a broken link in one click, or suggest a correction.',
          ]}
        />
      </Section>

      <Section title="Who runs it">
        <p className="m-0">
          Couchlist is run by {operator}. It is a personal project, not a company, and it carries
          no advertising.
        </p>
        <p className="m-0">
          Write to{' '}
          <a href={`mailto:${email}`} className="text-accent">
            {email}
          </a>{' '}
          about anything: a listing that is wrong, a site that should not be here, a security
          problem, or a removal request. Security reports are welcome and will not be met with
          lawyers &mdash; see{' '}
          <a href="/.well-known/security.txt" className="text-accent">
            security.txt
          </a>
          .
        </p>
      </Section>

      <Section title="Staying safe on the sites we list">
        <p className="m-0">
          These are third-party websites and we do not control them. Use an ad blocker, do not
          install anything a streaming site tells you to install, and do not reuse a password you
          care about. The{' '}
          <Link href="/guides" className="text-accent">
            guides
          </Link>{' '}
          cover the practical parts, starting with picking an ad blocker for your actual browser.
        </p>
      </Section>
    </LegalPage>
  );
}
