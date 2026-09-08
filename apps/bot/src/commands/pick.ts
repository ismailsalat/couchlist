import { SlashCommandBuilder } from 'discord.js';
import { baseEmbed, linkRow } from '../lib/embeds.js';
import type { BotCommand } from './types.js';

/** /pick - sends people to Watch Together on the site. */
export const pickCommand: BotCommand = {
  guildOnly: false,
  data: new SlashCommandBuilder()
    .setName('pick')
    .setDescription('Find something to watch together.'),

  async execute(interaction, context) {
    const embed = baseEmbed().setDescription('Looking for something to watch?');

    await interaction.reply({
      embeds: [embed],
      components: [
        linkRow('Find Something Together', `${context.config.APP_BASE_URL}/watch-together`),
      ],
      ephemeral: true,
    });
  },
};
