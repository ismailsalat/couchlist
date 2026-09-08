import type {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  SlashCommandOptionsOnlyBuilder,
  SlashCommandSubcommandsOnlyBuilder,
} from 'discord.js';
import type { BotContext } from '../lib/context.js';

export interface BotCommand {
  // discord.js narrows the builder type as options are added, so all three
  // shapes have to be accepted here.
  data:
    | SlashCommandBuilder
    | SlashCommandOptionsOnlyBuilder
    | SlashCommandSubcommandsOnlyBuilder;
  /** Guild-only commands are rejected in DMs before they run. */
  guildOnly: boolean;
  execute(interaction: ChatInputCommandInteraction, context: BotContext): Promise<void>;
}
