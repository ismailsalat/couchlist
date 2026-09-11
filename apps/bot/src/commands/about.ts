import { SlashCommandBuilder } from 'discord.js';
import { baseEmbed, linkButtonRow } from '../lib/embeds.js';
import type { BotCommand } from './types.js';

/** /about - a configurable, shareable Couchlist info card. */
export const aboutCommand: BotCommand = {
  guildOnly: false,
  data: new SlashCommandBuilder()
    .setName('about')
    .setDescription('About Couchlist, its website, version, and community server.'),

  async execute(interaction, context) {
    const config = context.config;
    const website = (config.COUCHLIST_ABOUT_WEBSITE_URL.trim() || config.APP_BASE_URL).replace(/\/$/, '');
    const serverUrl = config.COUCHLIST_ABOUT_SERVER_URL.trim();
    const creatorName = config.COUCHLIST_ABOUT_CREATOR_NAME.trim() || 'Couchlist team';
    const creatorUrl = config.COUCHLIST_ABOUT_CREATOR_URL.trim();
    const creator = creatorUrl ? `[${creatorName}](${creatorUrl})` : creatorName;
    const serverName = config.COUCHLIST_ABOUT_SERVER_NAME.trim() || 'Couchlist Community';
    const version = config.COUCHLIST_ABOUT_VERSION.trim() || 'unknown';
    const name = config.COUCHLIST_ABOUT_NAME.trim() || 'Couchlist';

    const embed = baseEmbed()
      .setTitle(`🍿 ${name}`)
      .setDescription(config.COUCHLIST_ABOUT_DESCRIPTION.trim())
      .addFields(
        { name: 'Website', value: `[${website.replace(/^https?:\/\//, '')}](${website})`, inline: true },
        { name: 'Version', value: `\`v${version}\``, inline: true },
        { name: 'Made by', value: creator, inline: true },
        { name: 'Community', value: serverUrl ? `[${serverName}](${serverUrl})` : 'Not configured', inline: true },
        { name: 'Source directory', value: `[Browse sources](${website}/sources)`, inline: true },
        { name: 'Start here', value: '`/couchlist` · `/profile` · `/watch` · `/compare` · `/pick`', inline: false },
      )
      .setFooter({ text: config.COUCHLIST_ABOUT_FOOTER.trim() || 'Couchlist' })
      .setTimestamp();

    const botAvatar = interaction.client.user?.displayAvatarURL({ size: 256 });
    if (botAvatar) embed.setThumbnail(botAvatar);

    const links = [
      { label: 'Open Couchlist', url: website },
      { label: 'Browse Sources', url: `${website}/sources` },
      ...(serverUrl ? [{ label: 'Join Community', url: serverUrl }] : []),
    ];

    await interaction.reply({
      embeds: [embed],
      components: [linkButtonRow(links)],
      ephemeral: false,
    });
  },
};
