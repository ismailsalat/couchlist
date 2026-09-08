import { SlashCommandBuilder } from 'discord.js';
import { AniListClient, TmdbClient, mediaPath } from '@couchlist/shared';
import { baseEmbed, errorEmbed, linkRow } from '../lib/embeds.js';
import type { BotCommand } from './types.js';

/**
 * /watch - look up a title and show how this server rates it.
 *
 * Statistics cover only members of the server the command was run in.
 */
export const watchCommand: BotCommand = {
  guildOnly: true,
  data: new SlashCommandBuilder()
    .setName('watch')
    .setDescription('Look up a title and see what this server thinks.')
    .addStringOption((option) =>
      option.setName('query').setDescription('Title to search for.').setRequired(true).setMaxLength(120),
    ),

  async execute(interaction, context) {
    const query = interaction.options.getString('query', true);
    await interaction.deferReply({ ephemeral: true });

    const anilist = new AniListClient({
      apiUrl: context.config.ANILIST_API_URL,
      timeoutMs: context.config.PROVIDER_TIMEOUT_MS,
    });
    const tmdb = new TmdbClient({
      apiKey: context.config.TMDB_API_KEY,
      baseUrl: context.config.TMDB_API_BASE_URL,
      timeoutMs: context.config.PROVIDER_TIMEOUT_MS,
    });

    // A provider being down should degrade the answer, not fail the command.
    const [animeResult, tmdbResult] = await Promise.allSettled([
      anilist.search(query, 3),
      tmdb.search(query, 3),
    ]);

    const results = [
      ...(animeResult.status === 'fulfilled' ? animeResult.value : []),
      ...(tmdbResult.status === 'fulfilled' ? tmdbResult.value : []),
    ];

    const top = results[0];
    if (!top) {
      const bothFailed = animeResult.status === 'rejected' && tmdbResult.status === 'rejected';
      await interaction.editReply({
        embeds: [
          errorEmbed(
            bothFailed
              ? "We couldn't search right now. Try again shortly."
              : `No results for “${query}”.`,
          ),
        ],
      });
      return;
    }

    const guild = interaction.guildId
      ? await context.guilds.findByDiscordId(interaction.guildId)
      : undefined;

    let description = '';
    if (guild) {
      const members = await context.guilds.membersOf(guild.id);
      const memberIds = members
        .filter((member) => member.profileVisibility !== 'PRIVATE')
        .map((member) => member.id);

      const stats = await context.entries.statsForMedia(memberIds, {
        provider: top.provider,
        providerMediaId: top.providerMediaId,
        mediaType: top.mediaType,
      });

      description =
        `${stats.completed} member${stats.completed === 1 ? '' : 's'} watched\n` +
        (stats.averageRating !== null
          ? `Average: ${stats.averageRating.toFixed(1)} / 10`
          : 'No ratings yet');
    }

    const embed = baseEmbed().setTitle(top.title).setDescription(description || 'Not tracked here yet.');
    if (top.posterUrl) embed.setThumbnail(top.posterUrl);

    await interaction.editReply({
      embeds: [embed],
      components: [linkRow('View on Couchlist', `${context.config.APP_BASE_URL}${mediaPath(top)}`)],
    });
  },
};
