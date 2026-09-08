import { redactDatabaseUrl } from '../config/env.js';

/**
 * Small structured logger.
 *
 * Deliberately dependency-free: it writes JSON in production and readable
 * lines in development, and it scrubs anything that looks like a secret before
 * writing. A logger that can leak a token is worse than no logger.
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

/** Keys whose values are never written, whatever they contain. */
const SECRET_KEYS = [
  'token',
  'secret',
  'password',
  'authorization',
  'cookie',
  'accesstoken',
  'refreshtoken',
  'apikey',
  'api_key',
  'clientsecret',
  'client_secret',
  'session',
];

export function scrub(value: unknown, depth = 0): unknown {
  if (depth > 6) return '[deep]';
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return value;
  if (typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((item) => scrub(item, depth + 1));

  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    const lowered = key.toLowerCase();
    if (SECRET_KEYS.some((secret) => lowered.includes(secret))) {
      output[key] = '***';
    } else if (lowered.includes('databaseurl') || lowered === 'database_url') {
      output[key] = typeof item === 'string' ? redactDatabaseUrl(item) : '***';
    } else {
      output[key] = scrub(item, depth + 1);
    }
  }
  return output;
}

export interface LoggerOptions {
  level: LogLevel;
  json: boolean;
  service: string;
}

export class Logger {
  constructor(
    private readonly options: LoggerOptions,
    private readonly bindings: Record<string, unknown> = {},
  ) {}

  child(bindings: Record<string, unknown>): Logger {
    return new Logger(this.options, { ...this.bindings, ...bindings });
  }

  debug(event: string, fields?: Record<string, unknown>): void {
    this.write('debug', event, fields);
  }

  info(event: string, fields?: Record<string, unknown>): void {
    this.write('info', event, fields);
  }

  warn(event: string, fields?: Record<string, unknown>): void {
    this.write('warn', event, fields);
  }

  error(event: string, fields?: Record<string, unknown>): void {
    this.write('error', event, fields);
  }

  private write(level: LogLevel, event: string, fields?: Record<string, unknown>): void {
    if (LEVEL_ORDER[level] < LEVEL_ORDER[this.options.level]) return;

    const payload = {
      level,
      time: new Date().toISOString(),
      service: this.options.service,
      event,
      ...(scrub({ ...this.bindings, ...fields }) as Record<string, unknown>),
    };

    const line = this.options.json
      ? JSON.stringify(payload)
      : formatHuman(level, this.options.service, event, payload);

    if (level === 'error' || level === 'warn') process.stderr.write(`${line}\n`);
    else process.stdout.write(`${line}\n`);
  }
}

function formatHuman(
  level: LogLevel,
  service: string,
  event: string,
  payload: Record<string, unknown>,
): string {
  const { level: _l, time, service: _s, event: _e, ...rest } = payload;
  const extras = Object.entries(rest)
    .map(([key, value]) => `${key}=${typeof value === 'object' ? JSON.stringify(value) : value}`)
    .join(' ');
  const stamp = typeof time === 'string' ? time.slice(11, 19) : '';
  return `${stamp} ${level.toUpperCase().padEnd(5)} [${service}] ${event}${extras ? ` ${extras}` : ''}`;
}

export function createLogger(options: Partial<LoggerOptions> = {}): Logger {
  return new Logger({
    level: options.level ?? 'info',
    json: options.json ?? false,
    service: options.service ?? 'couchlist',
  });
}
