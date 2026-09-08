import { SlashCommandBuilder } from 'discord.js';
import { baseEmbed, linkRow } from '../lib/embeds.js';
import type { BotCommand } from './types.js';

/** /couchlist - the front door. */
export const couchlistCommand: BotCommand = {
  guildOnly: false,
  data: new SlashCommandBuilder()
    .setName('couchlist')
    .setDescription('Open Couchlist.'),

  async execute(interaction, context) {
    const embed = baseEmbed()
      .setTitle('Couchlist')
      .setDescription('Track what your friends watch.');

    await interaction.reply({
      embeds: [embed],
      components: [linkRow('Open Couchlist', context.config.APP_BASE_URL)],
      ephemeral: true,
    });
  },
};
