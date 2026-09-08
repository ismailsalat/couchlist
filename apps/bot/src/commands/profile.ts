import { SlashCommandBuilder } from 'discord.js';
import { baseEmbed, errorEmbed, linkRow } from '../lib/embeds.js';
import type { BotCommand } from './types.js';

/** /profile - your Couchlist counts, with a link to the full profile. */
export const profileCommand: BotCommand = {
  guildOnly: false,
  data: new SlashCommandBuilder()
    .setName('profile')
    .setDescription('Show your Couchlist profile.'),

  async execute(interaction, context) {
    const user = await context.users.findByDiscordId(interaction.user.id);

    if (!user) {
      await interaction.reply({
        embeds: [errorEmbed('You have not signed in to Couchlist yet.')],
        components: [linkRow('Get started', context.config.APP_BASE_URL)],
        ephemeral: true,
      });
      return;
    }

    const counts = await context.entries.countsByStatus(user.id);

    const embed = baseEmbed()
      .setTitle(user.globalName ?? user.username)
      .addFields(
        { name: 'Watching', value: String(counts.WATCHING), inline: true },
        { name: 'Completed', value: String(counts.COMPLETED), inline: true },
        { name: 'Plan to Watch', value: String(counts.PLAN_TO_WATCH), inline: true },
      );

    await interaction.reply({
      embeds: [embed],
      components: [
        linkRow('View Full Profile', `${context.config.APP_BASE_URL}/profile/${user.id}`),
      ],
      ephemeral: true,
    });
  },
};
