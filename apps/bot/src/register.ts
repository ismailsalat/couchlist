import { REST, Routes } from 'discord.js';
import { assertConfigValid, createLogger, parseEnvironment } from '@couchlist/shared';
import { commandPayload } from './commands/index.js';
import { loadProjectEnv } from './load-env.js';

/**
 * Standalone command registration.
 *
 * The bot also registers on startup; this exists for re-registering without a
 * redeploy. Pass a guild id to register instantly in one server instead of
 * waiting for global propagation.
 */
async function main(): Promise<void> {
  loadProjectEnv();
  const config = parseEnvironment();
  assertConfigValid(config, 'bot');

  const log = createLogger({ service: 'bot', level: config.LOG_LEVEL, json: config.LOG_JSON });
  const applicationId = process.env.DISCORD_CLIENT_ID ?? config.DISCORD_CLIENT_ID;

  if (!applicationId) {
    process.stderr.write('\nDISCORD_CLIENT_ID is required to register commands.\n\n');
    process.exit(1);
  }

  const guildId = process.argv[2];
  const rest = new REST({ version: '10' }).setToken(config.DISCORD_BOT_TOKEN);

  const route = guildId
    ? Routes.applicationGuildCommands(applicationId, guildId)
    : Routes.applicationCommands(applicationId);

  await rest.put(route, { body: commandPayload() });
  log.info('commands_registered', { scope: guildId ?? 'global', count: commandPayload().length });
}

void main();
