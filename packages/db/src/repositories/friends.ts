import { and, eq, inArray, or } from 'drizzle-orm';
import type { Database } from '../client.js';
import { friendships, users, type Friendship, type User } from '../schema.js';

export interface FriendRelationship {
  row: Friendship;
  other: User;
  direction: 'incoming' | 'outgoing';
}

/**
 * Couchlist friendships are explicit app-level relationships.
 *
 * Discord does not expose a normal user's actual friend list to this app, so
 * Couchlist never pretends it can import one. Two Couchlist users can connect
 * directly whether or not they share a Discord server.
 */
export class FriendRepository {
  constructor(private readonly db: Database) {}

  private pair(userOne: string, userTwo: string): [string, string] {
    return userOne < userTwo ? [userOne, userTwo] : [userTwo, userOne];
  }

  async relationship(userOne: string, userTwo: string): Promise<Friendship | undefined> {
    if (userOne === userTwo) return undefined;
    const [userAId, userBId] = this.pair(userOne, userTwo);
    const rows = await this.db
      .select()
      .from(friendships)
      .where(and(eq(friendships.userAId, userAId), eq(friendships.userBId, userBId)))
      .limit(1);
    return rows[0];
  }

  async areFriends(userOne: string, userTwo: string): Promise<boolean> {
    const row = await this.relationship(userOne, userTwo);
    return row?.status === 'ACCEPTED';
  }

  async request(requesterId: string, targetId: string): Promise<Friendship> {
    if (requesterId === targetId) throw new Error('cannot friend self');
    const [userAId, userBId] = this.pair(requesterId, targetId);
    const existing = await this.relationship(requesterId, targetId);
    if (existing) return existing;

    const rows = await this.db
      .insert(friendships)
      .values({
        userAId,
        userBId,
        requestedByUserId: requesterId,
        status: 'PENDING',
      })
      .onConflictDoNothing()
      .returning();

    return rows[0] ?? (await this.relationship(requesterId, targetId))!;
  }

  async accept(userId: string, otherUserId: string): Promise<boolean> {
    const [userAId, userBId] = this.pair(userId, otherUserId);
    const rows = await this.db
      .update(friendships)
      .set({ status: 'ACCEPTED', acceptedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(friendships.userAId, userAId),
          eq(friendships.userBId, userBId),
          eq(friendships.status, 'PENDING'),
          // Only the recipient can accept the request.
          or(
            and(eq(friendships.requestedByUserId, userAId), eq(friendships.userBId, userId)),
            and(eq(friendships.requestedByUserId, userBId), eq(friendships.userAId, userId)),
          ),
        ),
      )
      .returning({ id: friendships.id });
    return rows.length > 0;
  }

  async remove(userId: string, otherUserId: string): Promise<boolean> {
    const [userAId, userBId] = this.pair(userId, otherUserId);
    const rows = await this.db
      .delete(friendships)
      .where(and(eq(friendships.userAId, userAId), eq(friendships.userBId, userBId)))
      .returning({ id: friendships.id });
    return rows.length > 0;
  }

  async acceptedFriendIds(userId: string): Promise<string[]> {
    const rows = await this.db
      .select({ userAId: friendships.userAId, userBId: friendships.userBId })
      .from(friendships)
      .where(
        and(
          eq(friendships.status, 'ACCEPTED'),
          or(eq(friendships.userAId, userId), eq(friendships.userBId, userId)),
        ),
      );
    return rows.map((row) => (row.userAId === userId ? row.userBId : row.userAId));
  }

  async acceptedFriends(userId: string): Promise<User[]> {
    const ids = await this.acceptedFriendIds(userId);
    if (ids.length === 0) return [];
    return this.db.select().from(users).where(inArray(users.id, ids));
  }

  async pendingFor(userId: string): Promise<FriendRelationship[]> {
    const rows = await this.db
      .select()
      .from(friendships)
      .where(
        and(
          eq(friendships.status, 'PENDING'),
          or(eq(friendships.userAId, userId), eq(friendships.userBId, userId)),
        ),
      );

    if (rows.length === 0) return [];
    const otherIds = rows.map((row) => (row.userAId === userId ? row.userBId : row.userAId));
    const people = await this.db.select().from(users).where(inArray(users.id, otherIds));
    const byId = new Map(people.map((person) => [person.id, person]));

    return rows.flatMap((row) => {
      const otherId = row.userAId === userId ? row.userBId : row.userAId;
      const other = byId.get(otherId);
      if (!other) return [];
      return [
        {
          row,
          other,
          direction:
            row.requestedByUserId === userId ? ('outgoing' as const) : ('incoming' as const),
        },
      ];
    });
  }
}
