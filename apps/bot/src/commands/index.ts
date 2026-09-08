import { adminCommand } from './admin.js';
import { compareCommand } from './compare.js';
import { couchlistCommand } from './couchlist.js';
import { pickCommand } from './pick.js';
import { profileCommand } from './profile.js';
import { watchCommand } from './watch.js';
import type { BotCommand } from './types.js';

/** Every command the bot registers. Deliberately short. */
export const commands: BotCommand[] = [
  couchlistCommand,
  profileCommand,
  watchCommand,
  compareCommand,
  pickCommand,
  adminCommand,
];

export const commandMap = new Map<string, BotCommand>(
  commands.map((command) => [command.data.name, command]),
);

/** JSON payload sent to Discord when registering commands. */
export function commandPayload(): unknown[] {
  return commands.map((command) => command.data.toJSON());
}

export type { BotCommand };
