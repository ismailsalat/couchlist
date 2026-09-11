import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseEnvironment, createLogger } from '@couchlist/shared';
import type { Database } from '@couchlist/db';
import { commandPayload, commandMap } from '../../apps/bot/src/commands/index';
import { handleCommand } from '../../apps/bot/src/handler';
import { canManageGuild, isBotOwner } from '../../apps/bot/src/lib/permissions';
import { resetCommandLimits } from '../../apps/bot/src/lib/rate-limit';
import type { BotContext } from '../../apps/bot/src/lib/context';
import { nextDiscordId, repositories, resetTables, setupTestDatabase } from '../helpers/db';

/**
 * Bot command tests.
 *
 * Discord is not reachable from the sandbox, so interactions are fakes that
 * record what the command replied. The command code, permission checks and
 * database access are the real implementations.
 */
let db: Database;
let repos: ReturnType<typeof repositories>;

const OWNER_ID = '111111111111111111';
const MANAGE_GUILD_BIT = 1n << 5n;

beforeAll(async () => {
  db = await setupTestDatabase();
  repos = repositories(db);
});

beforeEach(async () => {
  await resetTables(db);
  resetCommandLimits();
});

function makeContext(overrides: Record<string, string> = {}): BotContext {
  const config = parseEnvironment({
    DATABASE_URL: 'postgresql://postgres@localhost:5432/couchlist_test',
    APP_BASE_URL: 'http://localhost:3000',
    DISCORD_BOT_TOKEN: 'token',
    BOT_OWNER_IDS: OWNER_ID,
    TMDB_API_KEY: 'key',
    ...overrides,
  } as NodeJS.ProcessEnv);

  return {
    config,
    log: createLogger({ service: 'bot-test', level: 'error' }),
    db,
    ...repos,
    startedAt: new Date(),
  } as BotContext;
}

interface FakeReply {
  embeds?: Array<{ data: { title?: string; description?: string } }>;
  components?: unknown[];
}

function fakeInteraction(options: {
  commandName: string;
  userId?: string;
  guildId?: string | null;
  subcommand?: string;
  stringOptions?: Record<string, string>;
  permissions?: bigint;
  guildOwnerId?: string;
  guildMemberIds?: string[];
}) {
  const replies: FakeReply[] = [];

  return {
    replies,
    commandName: options.commandName,
    guildId: options.guildId === null ? null : (options.guildId ?? '333333333333333333'),
    user: { id: options.userId ?? '222222222222222222' },
    client: { user: { displayAvatarURL: () => 'https://cdn.example.test/couchlist.png' } },
    deferred: false,
    replied: false,
    guild:
      options.guildId === null
        ? null
        : {
            id: options.guildId ?? '333333333333333333',
            name: 'Test Server',
            ownerId: options.guildOwnerId ?? '999999999999999999',
            iconURL: () => null,
            members: {
              fetch: async (id: string) => {
                if ((options.guildMemberIds ?? []).includes(id)) return { id };
                throw new Error('Unknown Member');
              },
            },
          },
    memberPermissions: {
      has: (flag: bigint) => ((options.permissions ?? 0n) & flag) === flag,
    },
    options: {
      getSubcommand: () => options.subcommand ?? '',
      getString: (name: string) => options.stringOptions?.[name] ?? null,
      getUser: () => null,
    },
    async reply(payload: FakeReply) {
      replies.push(payload);
      this.replied = true;
    },
    async deferReply() {
      this.deferred = true;
    },
    async editReply(payload: FakeReply) {
      replies.push(payload);
    },
  };
}

function text(reply: FakeReply | undefined): string {
  return JSON.stringify(reply?.embeds?.map((embed) => embed.data) ?? []);
}

describe('command registration', () => {
  it('registers exactly the documented commands', () => {
    const names = commandPayload().map((command) => (command as { name: string }).name);
    expect(names.sort()).toEqual(
      ['about', 'admin', 'compare', 'couchlist', 'pick', 'profile', 'watch'].sort(),
    );
  });

  it('produces a valid payload for every command', () => {
    for (const command of commandPayload() as Array<{ name: string; description: string }>) {
      expect(command.name).toMatch(/^[a-z]+$/);
      expect(command.description.length).toBeGreaterThan(0);
      expect(command.description.length).toBeLessThanOrEqual(100);
    }
  });

  it('keeps the command list small', () => {
    expect(commandPayload()).toHaveLength(7);
  });

  it('gates admin behind Manage Server rather than Administrator', () => {
    const admin = commandPayload().find(
      (command) => (command as { name: string }).name === 'admin',
    ) as { default_member_permissions?: string };

    expect(admin.default_member_permissions).toBe(String(MANAGE_GUILD_BIT));
  });

  it('exposes admin subcommands', () => {
    const admin = commandPayload().find(
      (command) => (command as { name: string }).name === 'admin',
    ) as { options?: Array<{ name: string }> };

    expect(admin.options?.map((option) => option.name).sort()).toEqual(['setup', 'status']);
  });
});

describe('test mode restrictions', () => {
  it('refuses commands in a server outside the allowlist', async () => {
    const context = makeContext({
      TEST_MODE: 'true',
      TEST_USER_IDS: OWNER_ID,
      TEST_GUILD_IDS: '444444444444444444',
    });

    const interaction = fakeInteraction({
      commandName: 'couchlist',
      guildId: '555555555555555555',
    });

    await handleCommand(interaction as never, context);
    expect(text(interaction.replies[0])).toContain('private testing');
  });

  it('allows commands in an allowlisted server', async () => {
    const context = makeContext({
      TEST_MODE: 'true',
      TEST_USER_IDS: OWNER_ID,
      TEST_GUILD_IDS: '444444444444444444',
    });

    const interaction = fakeInteraction({
      commandName: 'couchlist',
      guildId: '444444444444444444',
    });

    await handleCommand(interaction as never, context);
    expect(text(interaction.replies[0])).toContain('Couchlist');
    expect(text(interaction.replies[0])).not.toContain('private testing');
  });

  it('allows every server when test mode is off', async () => {
    const context = makeContext();
    const interaction = fakeInteraction({ commandName: 'couchlist', guildId: '777777777777777777' });

    await handleCommand(interaction as never, context);
    expect(text(interaction.replies[0])).not.toContain('private testing');
  });
});

describe('command guards', () => {
  it('refuses guild-only commands in DMs', async () => {
    const context = makeContext();
    const interaction = fakeInteraction({ commandName: 'watch', guildId: null });

    await handleCommand(interaction as never, context);
    expect(text(interaction.replies[0])).toContain('inside a server');
  });

  it('keeps /compare independent from server setup', () => {
    expect(commandMap.get('compare')?.guildOnly).toBe(false);
  });

  it('allows /couchlist in DMs', async () => {
    const context = makeContext();
    const interaction = fakeInteraction({ commandName: 'couchlist', guildId: null });

    await handleCommand(interaction as never, context);
    expect(text(interaction.replies[0])).toContain('Track what your friends watch');
  });

  it('shows the configurable /about card in DMs', async () => {
    const context = makeContext({
      COUCHLIST_ABOUT_VERSION: '99.1.0',
      COUCHLIST_ABOUT_SERVER_URL: 'https://discord.gg/example',
      COUCHLIST_ABOUT_CREATOR_NAME: 'Test Maker',
    });
    const interaction = fakeInteraction({ commandName: 'about', guildId: null });

    await handleCommand(interaction as never, context);
    const rendered = JSON.stringify(interaction.replies[0]);
    expect(rendered).toContain('Couchlist');
    expect(rendered).toContain('99.1.0');
    expect(rendered).toContain('Test Maker');
    expect(rendered).toContain('discord.gg/example');
  });

  it('rate limits a user hammering commands', async () => {
    const context = makeContext({ RATE_LIMIT_BOT_COMMANDS_PER_MINUTE: '3' });

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const allowed = fakeInteraction({ commandName: 'couchlist' });
      await handleCommand(allowed as never, context);
      expect(text(allowed.replies[0])).not.toContain('too quickly');
    }

    const blocked = fakeInteraction({ commandName: 'couchlist' });
    await handleCommand(blocked as never, context);
    expect(text(blocked.replies[0])).toContain('too quickly');
  });

  it('reports an error id when a command throws', async () => {
    const context = makeContext();
    const command = commandMap.get('profile');
    const original = command!.execute;
    command!.execute = vi.fn(async () => {
      throw new Error('boom');
    });

    const interaction = fakeInteraction({ commandName: 'profile' });
    await handleCommand(interaction as never, context);

    expect(text(interaction.replies[0])).toContain('req_');
    command!.execute = original;
  });
});

describe('admin permissions', () => {
  it('lets the server owner configure Couchlist', () => {
    const interaction = fakeInteraction({
      commandName: 'admin',
      userId: '888888888888888888',
      guildOwnerId: '888888888888888888',
    });
    expect(canManageGuild(interaction as never, [])).toBe(true);
  });

  it('lets a member with Manage Server configure Couchlist', () => {
    const interaction = fakeInteraction({ commandName: 'admin', permissions: MANAGE_GUILD_BIT });
    expect(canManageGuild(interaction as never, [])).toBe(true);
  });

  it('refuses a normal member', () => {
    const interaction = fakeInteraction({ commandName: 'admin', permissions: 0n });
    expect(canManageGuild(interaction as never, [])).toBe(false);
  });

  it('lets a configured bot owner through', () => {
    const interaction = fakeInteraction({ commandName: 'admin', userId: OWNER_ID });
    expect(canManageGuild(interaction as never, [OWNER_ID])).toBe(true);
    expect(isBotOwner(OWNER_ID, [OWNER_ID])).toBe(true);
    expect(isBotOwner('222222222222222222', [OWNER_ID])).toBe(false);
  });

  it('rejects /admin setup from a normal member', async () => {
    const context = makeContext();
    const interaction = fakeInteraction({
      commandName: 'admin',
      subcommand: 'setup',
      permissions: 0n,
    });

    await handleCommand(interaction as never, context);
    expect(text(interaction.replies[0])).toContain('Manage Server');
  });
});

describe('admin setup', () => {
  it('connects the server and writes an audit row', async () => {
    const context = makeContext();
    const guildId = nextDiscordId();

    const interaction = fakeInteraction({
      commandName: 'admin',
      subcommand: 'setup',
      guildId,
      permissions: MANAGE_GUILD_BIT,
    });

    await handleCommand(interaction as never, context);

    const guild = await repos.guilds.findByDiscordId(guildId);
    expect(guild?.botConnected).toBe(true);

    const logs = await repos.audit.listForGuild(guild!.id);
    expect(logs[0]?.action).toBe('guild.setup');
  });

  it('repairs existing tester memberships when setup happened after login', async () => {
    const firstDiscordId = nextDiscordId();
    const secondDiscordId = nextDiscordId();
    const guildId = nextDiscordId();

    const first = await repos.users.upsertFromDiscord({
      discordId: firstDiscordId,
      username: 'first-tester',
    });
    const second = await repos.users.upsertFromDiscord({
      discordId: secondDiscordId,
      username: 'second-tester',
    });

    const context = makeContext({
      TEST_MODE: 'true',
      TEST_USER_IDS: `${firstDiscordId},${secondDiscordId}`,
      TEST_GUILD_IDS: guildId,
    });

    const setup = fakeInteraction({
      commandName: 'admin',
      subcommand: 'setup',
      guildId,
      userId: firstDiscordId,
      permissions: MANAGE_GUILD_BIT,
      guildMemberIds: [firstDiscordId, secondDiscordId],
    });
    await handleCommand(setup as never, context);

    const guild = await repos.guilds.findByDiscordId(guildId);
    const members = await repos.guilds.membersOf(guild!.id);
    expect(members.map((member) => member.id).sort()).toEqual([first.id, second.id].sort());
  });

  it('reports status without leaking configuration', async () => {
    const context = makeContext();
    const guildId = nextDiscordId();

    const setup = fakeInteraction({
      commandName: 'admin',
      subcommand: 'setup',
      guildId,
      permissions: MANAGE_GUILD_BIT,
    });
    await handleCommand(setup as never, context);

    const status = fakeInteraction({
      commandName: 'admin',
      subcommand: 'status',
      guildId,
      permissions: MANAGE_GUILD_BIT,
    });
    await handleCommand(status as never, context);

    const body = text(status.replies[0]);
    expect(body).toContain('Healthy');
    expect(body).not.toContain('postgres');
    expect(body).not.toContain('token');
  });
});

describe('profile command', () => {
  it('prompts an unknown user to sign in', async () => {
    const context = makeContext();
    const interaction = fakeInteraction({ commandName: 'profile', userId: nextDiscordId() });

    await handleCommand(interaction as never, context);
    expect(text(interaction.replies[0])).toContain('not signed in');
  });

  it('shows counts for a known user', async () => {
    const context = makeContext();
    const discordId = nextDiscordId();
    const user = await repos.users.upsertFromDiscord({ discordId, username: 'tester' });

    await repos.entries.upsert({
      userId: user.id,
      provider: 'ANILIST',
      providerMediaId: '16498',
      mediaType: 'ANIME',
      status: 'COMPLETED',
      title: 'Attack on Titan',
    });

    const interaction = fakeInteraction({ commandName: 'profile', userId: discordId });
    await handleCommand(interaction as never, context);

    expect(text(interaction.replies[0])).toContain('tester');
  });
});
