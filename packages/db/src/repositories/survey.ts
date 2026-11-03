import { and, eq, isNull } from 'drizzle-orm';
import { surveyResponses, users } from '../schema.js';
import type { Database } from '../client.js';

/**
 * The one-question survey.
 *
 * One row per person, replaced if they answer again, so this table cannot be
 * read as a record of somebody changing their mind over time. Answering and
 * dismissing both close it for good: being asked twice is the thing that
 * makes a survey feel like an advert.
 */
export class SurveyRepository {
  constructor(private readonly db: Database) {}

  /**
   * Whether to ask this person.
   *
   * A slice rather than everybody, because the number of answers needed to
   * see a pattern is small and the cost of asking is spent on every person
   * who sees it. The slice is decided by the account id, so the same person
   * gets the same answer every time rather than a fresh roll per page.
   */
  async shouldAsk(userId: string, sharePercent: number): Promise<boolean> {
    const rows = await this.db
      .select({ closedAt: users.surveyClosedAt, createdAt: users.createdAt })
      .from(users)
      .where(and(eq(users.id, userId), isNull(users.deletedAt)))
      .limit(1);

    const row = rows[0];
    if (!row || row.closedAt) return false;

    // Not on the first day: being asked how easy something was before having
    // used it produces an answer about nothing.
    if (Date.now() - row.createdAt.getTime() < 24 * 60 * 60 * 1000) return false;

    return bucketOf(userId) < sharePercent;
  }

  async answer(userId: string, input: { ease: number; usesAdBlocker: boolean | null }): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx
        .insert(surveyResponses)
        .values({ userId, ease: input.ease, usesAdBlocker: input.usesAdBlocker })
        .onConflictDoUpdate({
          target: surveyResponses.userId,
          set: { ease: input.ease, usesAdBlocker: input.usesAdBlocker, createdAt: new Date() },
        });
      await tx.update(users).set({ surveyClosedAt: new Date() }).where(eq(users.id, userId));
    });
  }

  /** Dismissed without answering. Same effect: never asked again. */
  async close(userId: string): Promise<void> {
    await this.db
      .update(users)
      .set({ surveyClosedAt: new Date() })
      .where(eq(users.id, userId));
  }
}

/**
 * A stable number from 0 to 99 for an account id.
 *
 * Deterministic so a person is either in the slice or not, permanently, and
 * does not get asked the moment they reload.
 */
function bucketOf(userId: string): number {
  let hash = 0;
  for (let index = 0; index < userId.length; index += 1) {
    hash = (hash * 31 + userId.charCodeAt(index)) % 100_000;
  }
  return hash % 100;
}

/** Exported for the test that proves the slice is stable and roughly even. */
export const surveyBucketOf = bucketOf;
