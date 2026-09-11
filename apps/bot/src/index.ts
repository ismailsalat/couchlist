import { Client, Events, GatewayIntentBits, REST, Routes } from 'discord.js';
import {
  assertConfigValid,
  createLogger,
  parseEnvironment,
  safeConfigSummary,
  testModeStatus,
} from '@couchlist/shared';
import {
  AuditRepository,
  EntryRepository,
  FriendRepository,
  GuildRepository,
  UserRepository,
  WatchSourceRepository,
  closeDatabase,
  getDatabase,
} from '@couchlist/db';
import { commandPayload } from './commands/index.js';
import { handleCommand } from './handler.js';
import type { BotContext } from './lib/context.js';
import { loadProjectEnv } from './load-env.js';

/**
 * Bot entry point.
 *
 * Intents are the minimum needed to receive slash commands: no message
 * content, no member list, no presence. Couchlist never reads messages.
 */
async function main(): Promise<void> {
  loadProjectEnv();
  const config = parseEnvironment();
  assertConfigValid(config, 'bot');

  const log = createLogger({
    service: 'bot',
    level: config.LOG_LEVEL,
    json: config.LOG_JSON,
  });

  const test = testModeStatus(config);
  log.info('BOT_START', { ...safeConfigSummary(config), ...test });
  if (test.enabled) {
    log.warn('test_mode_active', {
      guilds: test.allowedGuilds,
      users: test.allowedUsers,
    });
  }

  const db = getDatabase(config.DATABASE_URL);
  const context: BotContext = {
    config,
    log,
    db,
    users: new UserRepository(db),
    guilds: new GuildRepository(db),
    entries: new EntryRepository(db),
    friends: new FriendRepository(db),
    audit: new AuditRepository(db),
    watchSources: new WatchSourceRepository(db),
    startedAt: new Date(),
  };

  const client = new Client({ intents: [GatewayIntentBits.Guilds] });

  client.once(Events.ClientReady, async (ready) => {
    log.info('bot_ready', { user: ready.user.tag, guilds: ready.guilds.cache.size });
    await registerCommands(config.DISCORD_BOT_TOKEN, ready.user.id, log);
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    await handleCommand(interaction, context);
  });

  // A guild removing the bot disables server features but never touches lists.
  client.on(Events.GuildDelete, async (guild) => {
    await context.guilds.setBotConnected(guild.id, false).catch(() => undefined);
    log.info('guild_removed', { guildId: guild.id });
  });

  client.on(Events.GuildCreate, async (guild) => {
    log.info('guild_joined', { guildId: guild.id, name: guild.name });
  });

  client.on(Events.Error, (error) => {
    log.error('client_error', { message: error.message });
  });

  const shutdown = async (signal: string): Promise<void> => {
    log.info('BOT_STOP', { signal });
    try {
      await client.destroy();
      await closeDatabase();
    } finally {
      process.exit(0);
    }
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  await client.login(config.DISCORD_BOT_TOKEN);
}

/** Registers slash commands globally. Safe to run on every boot. */
async function registerCommands(
  token: string,
  applicationId: string,
  log: ReturnType<typeof createLogger>,
): Promise<void> {
  try {
    const rest = new REST({ version: '10' }).setToken(token);
    await rest.put(Routes.applicationCommands(applicationId), { body: commandPayload() });
    log.info('commands_registered', { count: commandPayload().length });
  } catch (error) {
    log.error('command_registration_failed', { message: (error as Error)?.message });
  }
}

void main();
