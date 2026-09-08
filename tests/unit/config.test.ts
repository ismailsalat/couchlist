import { describe, expect, it } from 'vitest';
import {
  isGuildAllowed,
  isUserAllowed,
  notificationsAllowed,
  parseEnvironment,
  redactDatabaseUrl,
  safeConfigSummary,
  testModeStatus,
  validateConfig,
} from '@couchlist/shared';

const base = {
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/couchlist',
  APP_BASE_URL: 'http://localhost:3000',
  DISCORD_CLIENT_ID: 'client',
  DISCORD_CLIENT_SECRET: 'secret',
  DISCORD_BOT_TOKEN: 'token',
  AUTH_SECRET: 'a'.repeat(32),
  TMDB_API_KEY: 'tmdb',
};

function config(overrides: Record<string, string> = {}) {
  return parseEnvironment({ ...base, ...overrides } as NodeJS.ProcessEnv);
}

describe('environment parsing', () => {
  it('parses comma separated ids', () => {
    expect(config({ BOT_OWNER_IDS: '123456789012345678, 987654321098765432' }).BOT_OWNER_IDS)
      .toEqual(['123456789012345678', '987654321098765432']);
  });

  it('ignores malformed ids rather than throwing', () => {
    expect(config({ TEST_USER_IDS: 'abc,,123456789012345678' }).TEST_USER_IDS).toEqual([
      '123456789012345678',
    ]);
  });

  it('treats an empty id list as empty', () => {
    expect(config({ BOT_OWNER_IDS: '' }).BOT_OWNER_IDS).toEqual([]);
  });

  it('parses booleans loosely', () => {
    expect(config({ TEST_MODE: 'true' }).TEST_MODE).toBe(true);
    expect(config({ TEST_MODE: 'yes' }).TEST_MODE).toBe(true);
    expect(config({ TEST_MODE: 'false' }).TEST_MODE).toBe(false);
    expect(config({ TEST_MODE: '' }).TEST_MODE).toBe(false);
  });

  it('falls back to defaults for invalid numbers', () => {
    expect(config({ RATE_LIMIT_SEARCH_PER_MINUTE: 'lots' }).RATE_LIMIT_SEARCH_PER_MINUTE).toBe(30);
  });
});

describe('startup validation', () => {
  it('accepts a complete configuration', () => {
    expect(validateConfig(config(), 'web')).toEqual([]);
    expect(validateConfig(config(), 'bot')).toEqual([]);
  });

  it('requires a database url', () => {
    expect(validateConfig(config({ DATABASE_URL: '' }), 'web')).toContainEqual(
      expect.stringContaining('DATABASE_URL'),
    );
  });

  it('refuses SQLite in production', () => {
    const problems = validateConfig(
      config({ ENVIRONMENT: 'production', DATABASE_URL: 'file:./dev.db', APP_BASE_URL: 'https://x.com' }),
      'web',
    );
    expect(problems.some((problem) => problem.includes('SQLite'))).toBe(true);
  });

  it('refuses ALLOW_DEV_LOGIN in production', () => {
    const problems = validateConfig(
      config({ ENVIRONMENT: 'production', ALLOW_DEV_LOGIN: 'true', APP_BASE_URL: 'https://x.com' }),
      'web',
    );
    expect(problems.some((problem) => problem.includes('ALLOW_DEV_LOGIN'))).toBe(true);
  });

  it('refuses ALLOW_DEV_LOGIN in staging too', () => {
    const problems = validateConfig(
      config({ ENVIRONMENT: 'staging', ALLOW_DEV_LOGIN: 'true', APP_BASE_URL: 'https://x.com' }),
      'web',
    );
    expect(problems.some((problem) => problem.includes('ALLOW_DEV_LOGIN'))).toBe(true);
  });

  it('allows ALLOW_DEV_LOGIN in development', () => {
    const problems = validateConfig(config({ ALLOW_DEV_LOGIN: 'true' }), 'web');
    expect(problems.some((problem) => problem.includes('ALLOW_DEV_LOGIN'))).toBe(false);
  });

  it('requires https in production', () => {
    const problems = validateConfig(
      config({ ENVIRONMENT: 'production', DATABASE_URL: 'postgresql://u:p@h:5432/d' }),
      'web',
    );
    expect(problems.some((problem) => problem.includes('https'))).toBe(true);
  });

  it('requires OAuth credentials for the web service only', () => {
    const stripped = config({ DISCORD_CLIENT_SECRET: '' });
    expect(validateConfig(stripped, 'web').some((p) => p.includes('DISCORD_CLIENT_SECRET'))).toBe(true);
    expect(validateConfig(stripped, 'bot').some((p) => p.includes('DISCORD_CLIENT_SECRET'))).toBe(false);
  });

  it('requires a bot token for the bot service only', () => {
    const stripped = config({ DISCORD_BOT_TOKEN: '' });
    expect(validateConfig(stripped, 'bot').some((p) => p.includes('DISCORD_BOT_TOKEN'))).toBe(true);
    expect(validateConfig(stripped, 'web').some((p) => p.includes('DISCORD_BOT_TOKEN'))).toBe(false);
  });

  it('refuses TEST_MODE with no testers', () => {
    const problems = validateConfig(config({ TEST_MODE: 'true' }), 'web');
    expect(problems.some((problem) => problem.includes('TEST_USER_IDS'))).toBe(true);
  });

  it('refuses TEST_MODE with no guilds for the bot', () => {
    const problems = validateConfig(
      config({ TEST_MODE: 'true', TEST_USER_IDS: '123456789012345678' }),
      'bot',
    );
    expect(problems.some((problem) => problem.includes('TEST_GUILD_IDS'))).toBe(true);
  });

  it('requires a strong auth secret in production', () => {
    const problems = validateConfig(
      config({
        ENVIRONMENT: 'production',
        APP_BASE_URL: 'https://x.com',
        DATABASE_URL: 'postgresql://u:p@h:5432/d',
        AUTH_SECRET: 'short',
      }),
      'web',
    );
    expect(problems.some((problem) => problem.includes('AUTH_SECRET'))).toBe(true);
  });
});

describe('test mode allowlists', () => {
  const testing = config({
    TEST_MODE: 'true',
    TEST_USER_IDS: '111111111111111111,222222222222222222',
    TEST_GUILD_IDS: '333333333333333333',
  });

  it('allows only listed users', () => {
    expect(isUserAllowed(testing, '111111111111111111')).toBe(true);
    expect(isUserAllowed(testing, '222222222222222222')).toBe(true);
    expect(isUserAllowed(testing, '999999999999999999')).toBe(false);
  });

  it('allows only listed guilds', () => {
    expect(isGuildAllowed(testing, '333333333333333333')).toBe(true);
    expect(isGuildAllowed(testing, '444444444444444444')).toBe(false);
  });

  it('allows everyone when test mode is off', () => {
    const open = config();
    expect(isUserAllowed(open, '999999999999999999')).toBe(true);
    expect(isGuildAllowed(open, '999999999999999999')).toBe(true);
  });

  it('ignores stale allowlist ids when TEST_MODE is explicitly off', () => {
    const open = config({
      TEST_MODE: 'false',
      TEST_USER_IDS: '111111111111111111',
      TEST_GUILD_IDS: '333333333333333333',
    });

    expect(isUserAllowed(open, '999999999999999999')).toBe(true);
    expect(isGuildAllowed(open, '999999999999999999')).toBe(true);
  });

  it('disables notifications while testing', () => {
    expect(notificationsAllowed(testing)).toBe(false);
    expect(notificationsAllowed(config())).toBe(true);
  });

  it('reports allowlist sizes', () => {
    expect(testModeStatus(testing)).toEqual({
      enabled: true,
      allowedUsers: 2,
      allowedGuilds: 1,
    });
  });
});

describe('secret redaction', () => {
  it('strips credentials from a database url', () => {
    expect(redactDatabaseUrl('postgresql://user:hunter2@host:5432/couchlist')).not.toContain(
      'hunter2',
    );
  });

  it('never includes secrets in the config summary', () => {
    const summary = JSON.stringify(safeConfigSummary(config()));
    expect(summary).not.toContain('secret');
    expect(summary).not.toContain('token');
    expect(summary).not.toContain('pass');
  });
});
