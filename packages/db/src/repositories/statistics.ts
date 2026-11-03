import { sql } from 'drizzle-orm';
import type { Database } from '../client.js';

/**
 * The numbers on the public statistics page.
 *
 * Every figure here is a count of rows that already exist. Nothing about a
 * person is read, nothing is joined to an account, and no new observation is
 * made to produce any of it. The one exception is the visit total, which is a
 * single integer on a listing and belongs to the listing rather than to
 * anyone who pressed it.
 *
 * One method, one round trip, because a page of fifteen separate counts is a
 * page that takes fifteen queries to render.
 */

export interface DirectoryStatistics {
  sources: number;
  hiddenSources: number;
  byCategory: Array<{ category: string; count: number }>;
  accounts: number;
  contributors: number;
  votes: number;
  saves: number;
  guides: number;
  addedByMonth: Array<{ month: string; count: number }>;
  mostVisited: Array<{ id: string; name: string; domain: string; visits: number }>;
  health: { ok: number; failing: number; neverChecked: number };
  survey: {
    answers: number;
    averageEase: number | null;
    easeCounts: Array<{ ease: number; count: number }>;
    adBlockerYes: number;
    adBlockerAnswers: number;
  };
}

export class StatisticsRepository {
  constructor(private readonly db: Database) {}

  async directory(): Promise<DirectoryStatistics> {
    const { rows } = await this.db.execute(sql`
      with live as (
        select * from watch_sources where is_enabled and deleted_at is null
      )
      select
        (select count(*)::int from live) as sources,
        (select count(*)::int from watch_sources where not is_enabled and deleted_at is null)
          as hidden_sources,
        (select count(*)::int from live where supports_anime) as anime,
        (select count(*)::int from live where supports_movies) as movies,
        (select count(*)::int from live where supports_tv) as tv,
        (select count(*)::int from live where supports_manga) as manga,
        (select count(*)::int from live where supports_manhwa) as manhwa,
        (select count(*)::int from live where supports_comics) as comics,
        (select count(*)::int from users where deleted_at is null and email is not null)
          as accounts,
        (select count(distinct user_id)::int from source_contributions where user_id is not null)
          as contributors,
        (select count(*)::int from source_votes) as votes,
        (select count(*)::int from source_bookmarks) as saves,
        (select count(*)::int from guides where is_published) as guides,
        (select count(*)::int from live where health_failures = 0 and last_health_check_at is not null)
          as health_ok,
        (select count(*)::int from live where health_failures > 0) as health_failing,
        (select count(*)::int from live where last_health_check_at is null) as health_unchecked,
        (select count(*)::int from survey_responses) as survey_answers,
        (select round(avg(ease)::numeric, 2) from survey_responses) as survey_average,
        (select count(*)::int from survey_responses where uses_ad_blocker) as ad_blocker_yes,
        (select count(*)::int from survey_responses where uses_ad_blocker is not null)
          as ad_blocker_answers
    `);

    const totals = rows[0] as Record<string, number | string | null>;
    const number = (key: string): number => Number(totals[key] ?? 0);

    const [months, visited, ease] = await Promise.all([
      this.db.execute(sql`
        select to_char(date_trunc('month', created_at), 'YYYY-MM') as month,
               count(*)::int as count
        from watch_sources
        where deleted_at is null and created_at > now() - interval '12 months'
        group by 1
        order by 1
      `),
      this.db.execute(sql`
        select id, name, domain, visit_count::int as visits
        from watch_sources
        where is_enabled and deleted_at is null and visit_count > 0
        order by visit_count desc, lower(name)
        limit 10
      `),
      this.db.execute(sql`
        select ease, count(*)::int as count from survey_responses group by 1 order by 1
      `),
    ]);

    return {
      sources: number('sources'),
      hiddenSources: number('hidden_sources'),
      byCategory: [
        { category: 'Anime', count: number('anime') },
        { category: 'Movies', count: number('movies') },
        { category: 'TV', count: number('tv') },
        { category: 'Manga', count: number('manga') },
        { category: 'Manhwa', count: number('manhwa') },
        { category: 'Comics', count: number('comics') },
      ],
      accounts: number('accounts'),
      contributors: number('contributors'),
      votes: number('votes'),
      saves: number('saves'),
      guides: number('guides'),
      addedByMonth: months.rows as Array<{ month: string; count: number }>,
      mostVisited: visited.rows as Array<{
        id: string;
        name: string;
        domain: string;
        visits: number;
      }>,
      health: {
        ok: number('health_ok'),
        failing: number('health_failing'),
        neverChecked: number('health_unchecked'),
      },
      survey: {
        answers: number('survey_answers'),
        averageEase: totals.survey_average === null ? null : Number(totals.survey_average),
        easeCounts: ease.rows as Array<{ ease: number; count: number }>,
        adBlockerYes: number('ad_blocker_yes'),
        adBlockerAnswers: number('ad_blocker_answers'),
      },
    };
  }
}
