import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { TOOLS, toolBySlug } from '@couchlist/shared';
import { SiteHeader } from '@/components/site-header';
import { ComingSoon } from '@/components/tools/coming-soon';
import { SiteChecker } from '@/components/tools/site-checker';
import { AdBlockerCheck } from '@/components/tools/ad-blocker-check';
import { DownloadCheck } from '@/components/tools/download-check';
import { SubtitleFixer } from '@/components/tools/subtitle-fixer';
import { MangaReader } from '@/components/tools/manga-reader';
import { StatusBoard } from '@/components/tools/status-board';
import { liveStatus } from '@/lib/tools/status';
import { optionalUser } from '@/lib/api/guards';
import { savedCountFor } from '@/lib/directory/page-data';
import { repos } from '@/lib/db';

export const dynamic = 'force-dynamic';

/** One page per tool, so each can be linked, shared and bookmarked. */
export function generateStaticParams() {
  return TOOLS.map((tool) => ({ slug: tool.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const tool = toolBySlug((await params).slug);
  if (!tool) return { title: 'Tool not found' };
  return {
    title: tool.name,
    description: tool.blurb,
    alternates: { canonical: `/tools/${tool.slug}` },
  };
}

export default async function ToolPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const tool = toolBySlug(slug);
  if (!tool) notFound();

  const user = await optionalUser();
  const savedCount = await savedCountFor(user);

  if (tool.state === 'COMING_SOON') {
    return (
      <>
        <SiteHeader user={user} savedCount={savedCount} active="guides" />
        <ComingSoon heading="Coming soon" blurb={tool.plan ?? `${tool.name} is not built yet.`} />
      </>
    );
  }

  return (
    <>
      <SiteHeader user={user} savedCount={savedCount} active="guides" />
      <main className={`mx-auto w-full px-4 pb-16 pt-6 ${tool.slug === 'comics' ? 'max-w-5xl' : 'max-w-3xl'}`}>
        <Link
          href="/guides"
          className="text-[13px] font-semibold text-muted underline underline-offset-[3px] hover:text-text"
        >
          ← All tools and guides
        </Link>

        <div className="mt-4">
          <ToolBody slug={tool.slug} />
        </div>

        {tool.runsInBrowser ? (
          <p className="mt-5 text-[12.5px] text-muted/80">
            This one runs entirely in your browser. Nothing you drop here is uploaded to Couchlist.
          </p>
        ) : null}
      </main>
    </>
  );
}

async function ToolBody({ slug }: { slug: string }) {
  switch (slug) {
    case 'site-safety':
      return <SiteChecker />;
    case 'ad-blocker':
      return <AdBlockerCheck />;
    case 'download-check':
      return <DownloadCheck />;
    case 'subtitles':
      return <SubtitleFixer />;
    case 'comics':
      return <MangaReader />;
    case 'status':
      return <StatusBoard status={await liveStatus(repos())} />;
    default:
      return null;
  }
}
