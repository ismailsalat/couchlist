import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage, Points, Section } from '@/components/legal-page';
import { optionalUser } from '@/lib/api/guards';
import { savedCountFor } from '@/lib/directory/page-data';
import { siteContact } from '@/lib/site';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Privacy',
  description:
    'Exactly what Couchlist stores, what it does not store, and how to take your account away.',
  alternates: { canonical: '/privacy' },
};

/**
 * Privacy.
 *
 * Written as a list of facts about this codebase rather than as a policy. If
 * a claim here stops being true, the code changed and this page is wrong, so
 * it is deliberately specific enough to be checkable.
 */
export default async function PrivacyPage() {
  const user = await optionalUser();
  const savedCount = await savedCountFor(user);
  const { email } = siteContact();

  return (
    <LegalPage
      title="Privacy"
      intro="What is stored, what is not, and how to get rid of all of it."
      user={user}
      savedCount={savedCount}
    >
      <Section title="If you never make an account">
        <p className="m-0">
          Nothing about you is stored. Browsing, searching, filtering, opening a listing and
          following a link to another site all work signed out, and none of it is recorded against
          you. The &ldquo;recently viewed&rdquo; row is kept in your own browser&rsquo;s storage
          and never sent anywhere; clearing your browser data erases it.
        </p>
      </Section>

      <Section title="If you do make an account">
        <p className="m-0">Then these are stored, because the features need them:</p>
        <Points
          items={[
            'Your email address, so you can sign in and recover the account.',
            'Your password, hashed. The original is never stored and cannot be recovered from the hash.',
            'A display name, and a profile picture if you upload one.',
            'Your votes, your saved sources and any private note you add to one.',
            'Sources and corrections you submit, and reports you file.',
            'Sign-in sessions, as a cookie holding a random token — not your details.',
          ]}
        />
        <p className="m-0">
          Your email address is shown to nobody but you. Contributions are credited under your
          display name, or anonymously if you choose that when you submit.
        </p>
      </Section>

      <Section title="What is never collected">
        <Points
          items={[
            'No analytics, of any kind. There is no Google Analytics, no Plausible, no PostHog, no tracking pixel and no third-party script on any page.',
            'No advertising, and therefore no advertising profile.',
            'No browsing history on the server. Which listings you open is not recorded against your account.',
            'No location, no contacts, no device fingerprinting.',
            'Nothing is sold, rented or shared with data brokers. There is no business model here to sell it for.',
          ]}
        />
      </Section>

      <Section title="Cookies">
        <p className="m-0">
          Two, both strictly necessary, neither used for tracking: one holds your sign-in session,
          and one records that an account has not confirmed its email address yet. There are no
          advertising or analytics cookies, which is why there is no cookie banner &mdash; there
          is nothing to ask you to consent to.
        </p>
      </Section>

      <Section title="Who else sees anything">
        <Points
          items={[
            <>
              <strong>The email provider.</strong> Verification and password-reset emails are sent
              through a third-party service, which necessarily sees your address and the message.
            </>,
            <>
              <strong>The host.</strong> The server and database are run on a hosting provider,
              which holds the data on our behalf and keeps ordinary server logs.
            </>,
            <>
              <strong>Nobody else.</strong> Site icons and profile pictures are stored by us and
              served from this domain rather than hot-linked, so the sites we list are not told
              who is reading about them.
            </>,
          ]}
        />
      </Section>

      <Section title="Taking it all back">
        <p className="m-0">
          Account settings has a delete button. It removes the account and its personal data, and
          signing in afterwards does not work. Contributions already published stay listed, with
          the credit detached &mdash; otherwise deleting an account would quietly delete other
          people&rsquo;s listings. If you would rather the credit go too, say so and it will.
        </p>
        <p className="m-0">
          Questions, corrections, or a request for a copy of what is held about you:{' '}
          <a href={`mailto:${email}`} className="text-accent">
            {email}
          </a>
          .
        </p>
      </Section>

      <Section title="Children">
        <p className="m-0">
          Couchlist is not aimed at children and accounts are not intended for under-13s. See the{' '}
          <Link href="/terms" className="text-accent">
            terms
          </Link>
          .
        </p>
      </Section>
    </LegalPage>
  );
}
