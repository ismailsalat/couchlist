import { z } from 'zod';

/**
 * Environment parsing and startup validation.
 *
 * Two rules drive the design:
 *  1. Production refuses to start on an unsafe configuration rather than
 *     booting into a broken or insecure state.
 *  2. Every problem is reported at once, so an operator fixes one deploy
 *     instead of three.
 */

const csvIds = z
  .string()
  .default('')
  .transform((value) =>
    value
      .split(',')
      .map((part) => part.trim())
      .filter((part) => /^\d{5,25}$/.test(part)),
  );

const boolish = (fallback: boolean) =>
  z
    .string()
    .optional()
    .transform((value) => {
      if (value === undefined || value.trim() === '') return fallback;
      return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
    });

const intWithDefault = (fallback: number) =>
  z
    .string()
    .optional()
    .transform((value) => {
      const parsed = Number.parseInt(value ?? '', 10);
      return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
    });

export const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  ENVIRONMENT: z.enum(['development', 'test', 'staging', 'production']).default('development'),

  APP_BASE_URL: z.string().default('http://localhost:3000'),
  DATABASE_URL: z.string().default(''),

  DISCORD_CLIENT_ID: z.string().default(''),
  DISCORD_CLIENT_SECRET: z.string().default(''),
  DISCORD_BOT_TOKEN: z.string().default(''),
  BOT_OWNER_IDS: csvIds,

  // /about bot card. Every visible value can be changed without editing code.
  COUCHLIST_ABOUT_NAME: z.string().default('Couchlist'),
  COUCHLIST_ABOUT_VERSION: z.string().default('12.3.0'),
  COUCHLIST_ABOUT_DESCRIPTION: z.string().default('Track what your friends watch, share sources, and find something to watch together.'),
  COUCHLIST_ABOUT_WEBSITE_URL: z.string().default(''),
  COUCHLIST_ABOUT_SERVER_URL: z.string().default('https://discord.gg/qvGnUFn3VW'),
  COUCHLIST_ABOUT_SERVER_NAME: z.string().default('Couchlist Community'),
  COUCHLIST_ABOUT_CREATOR_NAME: z.string().default('Ismail'),
  COUCHLIST_ABOUT_CREATOR_URL: z.string().default(''),
  COUCHLIST_ABOUT_FOOTER: z.string().default('Good shows. Better company.'),

  AUTH_SECRET: z.string().default(''),

  ANILIST_API_URL: z.string().default('https://graphql.anilist.co'),
  JIKAN_API_BASE_URL: z.string().default('https://api.jikan.moe/v4'),
  KITSU_API_BASE_URL: z.string().default('https://kitsu.io/api/edge'),
  TMDB_API_KEY: z.string().default(''),
  TMDB_API_BASE_URL: z.string().default('https://api.themoviedb.org/3'),

  TEST_MODE: boolish(false),
  TEST_GUILD_IDS: csvIds,
  TEST_USER_IDS: csvIds,

  ALLOW_DEV_LOGIN: boolish(false),

  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  LOG_JSON: boolish(false),

  RATE_LIMIT_SEARCH_PER_MINUTE: intWithDefault(30),
  RATE_LIMIT_MUTATIONS_PER_MINUTE: intWithDefault(30),
  RATE_LIMIT_BOT_COMMANDS_PER_MINUTE: intWithDefault(20),

  MEDIA_CACHE_TTL_HOURS: intWithDefault(24),
  PROVIDER_TIMEOUT_MS: intWithDefault(8000),
});

export type RawEnvironment = z.infer<typeof environmentSchema>;

export interface CouchlistConfig extends RawEnvironment {
  isProduction: boolean;
  isDevelopment: boolean;
  isTest: boolean;
}

/** Which service is booting. Each needs a different set of secrets. */
export type ServiceName = 'web' | 'bot';

export function parseEnvironment(source: NodeJS.ProcessEnv = process.env): CouchlistConfig {
  const parsed = environmentSchema.parse(source);
  const environment = parsed.ENVIRONMENT;
  return {
    ...parsed,
    isProduction: environment === 'production',
    isDevelopment: environment === 'development',
    isTest: environment === 'test' || parsed.NODE_ENV === 'test',
  };
}

/**
 * Returns every configuration problem, most severe first.
 *
 * Callers decide whether to warn or exit; `assertConfigValid` does the latter.
 */
export function validateConfig(config: CouchlistConfig, service: ServiceName): string[] {
  const problems: string[] = [];

  if (!config.DATABASE_URL.trim()) {
    problems.push('DATABASE_URL is not set.');
  } else if (config.isProduction && /^file:|sqlite/i.test(config.DATABASE_URL)) {
    problems.push(
      'DATABASE_URL points at SQLite but ENVIRONMENT=production. Use PostgreSQL in production.',
    );
  } else if (!/^postgres(ql)?:\/\//i.test(config.DATABASE_URL)) {
    problems.push('DATABASE_URL must be a postgresql:// connection string.');
  }

  if (!isValidUrl(config.APP_BASE_URL)) {
    problems.push(`APP_BASE_URL is not a valid URL: ${config.APP_BASE_URL}`);
  } else if (config.isProduction && config.APP_BASE_URL.startsWith('http://')) {
    problems.push('APP_BASE_URL must use https:// in production.');
  }

  if (service === 'web') {
    if (!config.DISCORD_CLIENT_ID.trim()) problems.push('DISCORD_CLIENT_ID is not set.');
    if (!config.DISCORD_CLIENT_SECRET.trim()) problems.push('DISCORD_CLIENT_SECRET is not set.');
    if (!config.AUTH_SECRET.trim()) {
      problems.push('AUTH_SECRET is not set. Generate one with: openssl rand -base64 32');
    } else if (config.isProduction && config.AUTH_SECRET.length < 32) {
      problems.push('AUTH_SECRET must be at least 32 characters in production.');
    }
  }

  if (service === 'bot' && !config.DISCORD_BOT_TOKEN.trim()) {
    problems.push('DISCORD_BOT_TOKEN is not set.');
  }

  for (const [name, value] of [
    ['COUCHLIST_ABOUT_WEBSITE_URL', config.COUCHLIST_ABOUT_WEBSITE_URL],
    ['COUCHLIST_ABOUT_SERVER_URL', config.COUCHLIST_ABOUT_SERVER_URL],
    ['COUCHLIST_ABOUT_CREATOR_URL', config.COUCHLIST_ABOUT_CREATOR_URL],
  ] as const) {
    if (value.trim() && !isValidUrl(value)) {
      problems.push(`${name} is not a valid http(s) URL: ${value}`);
    }
  }

  // The dev login bypasses Discord entirely. It must never exist in production.
  if (config.ALLOW_DEV_LOGIN && (config.isProduction || config.ENVIRONMENT === 'staging')) {
    problems.push(
      'ALLOW_DEV_LOGIN=true is not permitted when ENVIRONMENT is production or staging.',
    );
  }

  if (config.TEST_MODE) {
    if (config.TEST_USER_IDS.length === 0) {
      problems.push('TEST_MODE=true but TEST_USER_IDS is empty. Nobody could sign in.');
    }
    if (service === 'bot' && config.TEST_GUILD_IDS.length === 0) {
      problems.push('TEST_MODE=true but TEST_GUILD_IDS is empty. The bot would ignore every server.');
    }
  }

  if (!config.TMDB_API_KEY.trim()) {
    problems.push('TMDB_API_KEY is not set. Movie and TV search will not work.');
  }

  return problems;
}

function isValidUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/** Prints readable problems and exits non-zero. Used at service startup. */
export function assertConfigValid(config: CouchlistConfig, service: ServiceName): void {
  const problems = validateConfig(config, service);
  if (problems.length === 0) return;

  const lines = [
    '',
    `Couchlist ${service} cannot start. Fix the following:`,
    '',
    ...problems.map((problem) => `  - ${problem}`),
    '',
    'See .env.example for the full list of settings.',
    '',
  ];
  process.stderr.write(lines.join('\n'));
  process.exit(1);
}

/** Configuration safe to log or return from /api/health. */
export function safeConfigSummary(config: CouchlistConfig): Record<string, unknown> {
  return {
    environment: config.ENVIRONMENT,
    nodeEnv: config.NODE_ENV,
    appBaseUrl: config.APP_BASE_URL,
    testMode: config.TEST_MODE,
    testGuilds: config.TEST_GUILD_IDS.length,
    testUsers: config.TEST_USER_IDS.length,
    devLogin: config.ALLOW_DEV_LOGIN,
    logLevel: config.LOG_LEVEL,
    database: config.DATABASE_URL ? redactDatabaseUrl(config.DATABASE_URL) : 'not set',
  };
}

/** Strips credentials so a connection string can appear in a log line. */
export function redactDatabaseUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//***@${parsed.host}${parsed.pathname}`;
  } catch {
    return 'invalid-url';
  }
}
