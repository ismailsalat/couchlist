import type { ChatInputCommandInteraction } from 'discord.js';
import { isGuildAllowed, newRequestId } from '@couchlist/shared';
import { commandMap } from './commands/index.js';
import { allowCommand } from './lib/rate-limit.js';
import { errorEmbed } from './lib/embeds.js';
import type { BotContext } from './lib/context.js';

/**
 * Command dispatch.
 *
 * Kept separate from the Discord client so it can be tested with a fake
 * interaction, which is how the command surface is verified without a live
 * gateway connection.
 */
export async function handleCommand(
  interaction: ChatInputCommandInteraction,
  context: BotContext,
): Promise<void> {
  const command = commandMap.get(interaction.commandName);
  if (!command) return;

  // Test mode: the bot behaves as if it is not in any other server.
  if (interaction.guildId && !isGuildAllowed(context.config, interaction.guildId)) {
    await reply(interaction, 'Couchlist is currently in private testing.');
    return;
  }

  if (command.guildOnly && !interaction.guildId) {
    await reply(interaction, 'Use this command inside a server.');
    return;
  }

  if (!allowCommand(interaction.user.id, context.config.RATE_LIMIT_BOT_COMMANDS_PER_MINUTE)) {
    await reply(interaction, "You're using commands a bit too quickly. Try again in a moment.");
    return;
  }

  try {
    await command.execute(interaction, context);
  } catch (error) {
    const requestId = newRequestId();
    context.log.error('command_failed', {
      requestId,
      command: interaction.commandName,
      guildId: interaction.guildId,
      name: (error as Error)?.name,
      message: (error as Error)?.message,
      stack: (error as Error)?.stack,
    });

    await reply(
      interaction,
      `Something went wrong running that command.\nError ID: \`${requestId}\``,
    );
  }
}

/** Replies safely whichever state the interaction is in. */
async function reply(interaction: ChatInputCommandInteraction, message: string): Promise<void> {
  const payload = { embeds: [errorEmbed(message)], ephemeral: true } as const;
  try {
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({ embeds: payload.embeds });
    } else {
      await interaction.reply(payload);
    }
  } catch {
    // The interaction token expired; nothing more can be sent.
  }
}
