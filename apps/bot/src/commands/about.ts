import { SlashCommandBuilder } from 'discord.js';
import { baseEmbed, linkButtonRow } from '../lib/embeds.js';
import type { BotCommand } from './types.js';

const DEFAULT_DESCRIPTION = 'Track what your friends watch, share sources, and find something to watch together.';

/** /about - a configurable, shareable Couchlist info card. */
export const aboutCommand: BotCommand = {
  guildOnly: false,
  data: new SlashCommandBuilder()
    .setName('about')
    .setDescription('About Couchlist, its website, version, and community server.'),

  async execute(interaction, context) {
    const config = context.config;
    const website = safeHttpUrl(config.COUCHLIST_ABOUT_WEBSITE_URL) ?? safeHttpUrl(config.APP_BASE_URL);
    const serverUrl = safeHttpUrl(config.COUCHLIST_ABOUT_SERVER_URL);
    const creatorUrl = safeHttpUrl(config.COUCHLIST_ABOUT_CREATOR_URL);
    const creatorName = clean(config.COUCHLIST_ABOUT_CREATOR_NAME, 'Couchlist team');
    const creator = creatorUrl ? `[${creatorName}](${creatorUrl})` : creatorName;
    const serverName = clean(config.COUCHLIST_ABOUT_SERVER_NAME, 'Couchlist Community');
    const version = clean(config.COUCHLIST_ABOUT_VERSION, 'unknown');
    const name = clean(config.COUCHLIST_ABOUT_NAME, 'Couchlist');
    const description = clean(config.COUCHLIST_ABOUT_DESCRIPTION, DEFAULT_DESCRIPTION);
    const footer = clean(config.COUCHLIST_ABOUT_FOOTER, 'Good shows. Better company.');

    const embed = baseEmbed()
      .setTitle(`🍿 ${name}`)
      .setDescription(description)
      .addFields(
        { name: 'Website', value: website ? `[${website.replace(/^https?:\/\//, '')}](${website})` : 'Not configured', inline: true },
        { name: 'Version', value: `\`v${version}\``, inline: true },
        { name: 'Made by', value: creator, inline: true },
        { name: 'Community', value: serverUrl ? `[${serverName}](${serverUrl})` : 'Not configured', inline: true },
        { name: 'Source directory', value: website ? `[Browse sources](${website}/sources)` : 'Not configured', inline: true },
        { name: 'Start here', value: '`/couchlist` · `/profile` · `/watch` · `/compare` · `/pick`', inline: false },
      )
      .setFooter({ text: footer })
      .setTimestamp();

    const botAvatar = interaction.client.user?.displayAvatarURL({ size: 256 });
    if (botAvatar) embed.setThumbnail(botAvatar);

    const links = [
      ...(website ? [{ label: 'Open Couchlist', url: website }, { label: 'Browse Sources', url: `${website}/sources` }] : []),
      ...(serverUrl ? [{ label: 'Join Community', url: serverUrl }] : []),
    ];

    try {
      await interaction.reply({
        embeds: [embed],
        ...(links.length ? { components: [linkButtonRow(links)] } : {}),
      });
    } catch (error) {
      // Link buttons and embeds are nice-to-have. If Discord rejects any rich
      // payload detail, /about must still work instead of surfacing an error ID.
      context.log.warn('about_rich_reply_failed', {
        name: (error as Error)?.name,
        message: (error as Error)?.message,
      });

      const fallback = [
        `🍿 **${name}**`,
        description,
        `Version: v${version}`,
        `Made by: ${creatorName}`,
        website ? `Website: ${website}` : null,
        serverUrl ? `Community: ${serverUrl}` : null,
      ].filter((line): line is string => Boolean(line)).join('\n');

      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({ content: fallback, embeds: [], components: [] });
      } else {
        await interaction.reply({ content: fallback });
      }
    }
  },
};

function clean(value: string, fallback: string): string {
  const trimmed = value.trim();
  return trimmed || fallback;
}

function safeHttpUrl(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return parsed.toString().replace(/\/$/, '');
  } catch {
    return null;
  }
}
