import type { CouchlistConfig } from './env.js';

/**
 * Private-testing allowlists.
 *
 * While `TEST_MODE=true` the app is usable only by the Discord accounts and
 * servers named in the environment. Nothing is hard-coded; removing an id from
 * the environment removes the access.
 */
export interface TestModeStatus {
  enabled: boolean;
  allowedUsers: number;
  allowedGuilds: number;
}

export function testModeStatus(config: CouchlistConfig): TestModeStatus {
  return {
    enabled: config.TEST_MODE,
    allowedUsers: config.TEST_USER_IDS.length,
    allowedGuilds: config.TEST_GUILD_IDS.length,
  };
}

/** May this Discord user sign in? Always true when test mode is off. */
export function isUserAllowed(config: CouchlistConfig, discordUserId: string): boolean {
  if (!config.TEST_MODE) return true;
  return config.TEST_USER_IDS.includes(discordUserId);
}

/** May this Discord server use Couchlist? Always true when test mode is off. */
export function isGuildAllowed(config: CouchlistConfig, discordGuildId: string): boolean {
  if (!config.TEST_MODE) return true;
  return config.TEST_GUILD_IDS.includes(discordGuildId);
}

/**
 * Automatic notifications are off by default and force-disabled in test mode,
 * so a private test server never gets spammed.
 */
export function notificationsAllowed(config: CouchlistConfig): boolean {
  return !config.TEST_MODE;
}

/** Destructive maintenance operations are refused while testing. */
export function destructiveOperationsAllowed(config: CouchlistConfig): boolean {
  return !config.TEST_MODE && config.isProduction;
}
