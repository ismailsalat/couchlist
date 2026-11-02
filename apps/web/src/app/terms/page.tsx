import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage, Points, Section } from '@/components/legal-page';
import { optionalUser } from '@/lib/api/guards';
import { savedCountFor } from '@/lib/directory/page-data';
import { siteContact } from '@/lib/site';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Terms',
  description:
    'The terms for using Couchlist, including what it is responsible for and how to ask for something to be removed.',
  alternates: { canonical: '/terms' },
};

/**
 * Terms of use.
 *
 * Plain language on purpose. The removal section is the one that matters
 * most for a directory: a rights holder who cannot find an address writes to
 * the host or the registrar instead, and that conversation goes worse.
 */
export default async function TermsPage() {
  const user = await optionalUser();
  const savedCount = await savedCountFor(user);
  const { email, operator } = siteContact();

  return (
    <LegalPage
      title="Terms of use"
      intro="The short version: it is a list of links, it is run by one person, and you are responsible for where you go."
      user={user}
      savedCount={savedCount}
    >
      <Section title="What this is">
        <p className="m-0">
          Couchlist is a directory of third-party websites, operated by {operator}. Using the site
          means accepting these terms. If you do not accept them, do not use it.
        </p>
      </Section>

      <Section title="Third-party sites">
        <p className="m-0">
          Every listing points at a website we do not own, run or control. We do not host, store,
          stream, proxy, embed or modify any of their content. We cannot vouch for what they
          contain, whether they are lawful where you are, or what they will do to your device.
        </p>
        <p className="m-0">
          Following a link is your decision and your responsibility, and so is complying with the
          law where you live. Listings and votes are information about what exists, not advice to
          use it.
        </p>
      </Section>

      <Section title="Your account">
        <Points
          items={[
            'You need a working email address, and you must be at least 13 years old.',
            'Keep your password to yourself; you are responsible for what happens under your account.',
            'One account per person. Do not make extra accounts to vote more than once.',
          ]}
        />
      </Section>

      <Section title="What you may not do">
        <Points
          items={[
            'Submit malware, phishing pages, scams or anything designed to harm whoever clicks it.',
            'Submit sexual content involving minors, or anything else illegal to distribute. This gets an immediate ban and, where required, a report.',
            'Harass anyone, or use the notes, names and submission fields to abuse people.',
            'Attack the service: scraping at volume, automated submissions, probing for holes in order to exploit them, or trying to reach other people’s accounts.',
            'Misrepresent a site to game the ranking, or vote with accounts you made for that purpose.',
          ]}
        />
        <p className="m-0">
          Accounts that do these things get suspended, and their contributions get removed.
        </p>
      </Section>

      <Section title="What you submit">
        <p className="m-0">
          You keep whatever rights you have in a description, note or icon you submit. By
          submitting it you give permission to publish it on Couchlist, to edit it for clarity and
          accuracy, and to keep it published if you later delete your account &mdash; otherwise one
          person leaving would blank out listings other people maintain.
        </p>
        <p className="m-0">
          Only submit an icon or description you are allowed to submit. If you ask, your credit can
          be removed or anonymised.
        </p>
      </Section>

      <Section title="Getting something removed">
        <p className="m-0">
          If you are a rights holder, or the owner of a site that should not be listed, write to{' '}
          <a href={`mailto:${email}`} className="text-accent">
            {email}
          </a>{' '}
          with the exact listing URL on this site and what the problem is. Requests are read by a
          person, and a listing can be removed quickly &mdash; there is nothing to un-host, because
          nothing is hosted here.
        </p>
        <p className="m-0">
          Anyone can also report a listing from its own page without writing an email, and that
          queue is checked.
        </p>
      </Section>

      <Section title="No warranty, and the limits of what we owe you">
        <p className="m-0">
          Couchlist is provided as it is, free, with no guarantee that it is accurate, available,
          or that any listed site works or is safe. To the extent the law allows, {operator} is not
          liable for loss or damage arising from using this site or any site it links to. Nothing
          here removes a right you have that cannot lawfully be removed, and these terms are
          governed by the law of the place where the operator lives.
        </p>
      </Section>

      <Section title="Changes, and getting in touch">
        <p className="m-0">
          These terms can change; material changes will be noted on this page. For anything at all,
          including a complaint about how a moderation decision was made, write to{' '}
          <a href={`mailto:${email}`} className="text-accent">
            {email}
          </a>
          . See also the{' '}
          <Link href="/privacy" className="text-accent">
            privacy page
          </Link>{' '}
          and{' '}
          <Link href="/about" className="text-accent">
            about
          </Link>
          .
        </p>
      </Section>
    </LegalPage>
  );
}
