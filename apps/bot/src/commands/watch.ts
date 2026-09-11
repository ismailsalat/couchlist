import { SlashCommandBuilder } from 'discord.js';
import {
  AniListClient,
  JikanClient,
  KitsuClient,
  TmdbClient,
  dedupeCrossCatalogSearch,
  mediaPath,
  normalizeDomain,
} from '@couchlist/shared';
import { baseEmbed, errorEmbed, linkRow } from '../lib/embeds.js';
import type { BotCommand } from './types.js';

/**
 * /watch title — look up a title and show server taste.
 * /watch suggest — share a source with this server or send it to Couchlist review.
 */
export const watchCommand: BotCommand = {
  guildOnly: true,
  data: new SlashCommandBuilder()
    .setName('watch')
    .setDescription('Look up a title or share a watch source.')
    .addSubcommand((sub) =>
      sub
        .setName('title')
        .setDescription('Look up a title and see what this server thinks.')
        .addStringOption((option) =>
          option.setName('query').setDescription('Title to search for.').setRequired(true).setMaxLength(120),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('suggest')
        .setDescription('Share a place to watch with this server or Couchlist.')
        .addStringOption((option) =>
          option.setName('url').setDescription('Website URL.').setRequired(true).setMaxLength(2048),
        )
        .addStringOption((option) =>
          option.setName('scope').setDescription('Where should it go?').setRequired(true)
            .addChoices(
              { name: 'Share with this server', value: 'server' },
              { name: 'Suggest to Couchlist', value: 'couchlist' },
            ),
        )
        .addStringOption((option) => option.setName('name').setDescription('Source name (optional).').setMaxLength(120))
        .addStringOption((option) => option.setName('title').setDescription('Title this is for (optional).').setMaxLength(180))
        .addStringOption((option) => option.setName('supports').setDescription('What does it support?').addChoices(
          { name: 'Anime', value: 'anime' },
          { name: 'Movies', value: 'movies' },
          { name: 'TV', value: 'tv' },
          { name: 'Anime + Movies + TV', value: 'all' },
          { name: 'Not sure', value: 'unknown' },
        ))
        .addStringOption((option) => option.setName('comment').setDescription('Short note (optional).').setMaxLength(300)),
    ),

  async execute(interaction, context) {
    const subcommand = interaction.options.getSubcommand(false) || 'title';
    if (subcommand === 'suggest') {
      await handleSuggestion(interaction, context);
      return;
    }

    const query = interaction.options.getString('query', true);
    await interaction.deferReply({ ephemeral: true });

    const animeTimeout = Math.min(context.config.PROVIDER_TIMEOUT_MS, 3500);
    const anilist = new AniListClient({ apiUrl: context.config.ANILIST_API_URL, timeoutMs: animeTimeout });
    const jikan = new JikanClient({ baseUrl: context.config.JIKAN_API_BASE_URL, timeoutMs: animeTimeout });
    const kitsu = new KitsuClient({ baseUrl: context.config.KITSU_API_BASE_URL, timeoutMs: animeTimeout });
    const tmdb = new TmdbClient({ apiKey: context.config.TMDB_API_KEY, baseUrl: context.config.TMDB_API_BASE_URL, timeoutMs: context.config.PROVIDER_TIMEOUT_MS });

    const animeSearch = async () => {
      for (const provider of [anilist, jikan, kitsu]) {
        try {
          const matches = await provider.search(query, 3);
          if (matches.length > 0) return matches;
        } catch {
          // One Anime API must not break /watch.
        }
      }
      return [];
    };

    const [animeResult, tmdbResult] = await Promise.allSettled([animeSearch(), tmdb.search(query, 3)]);
    const results = dedupeCrossCatalogSearch([
      ...(animeResult.status === 'fulfilled' ? animeResult.value : []),
      ...(tmdbResult.status === 'fulfilled' ? tmdbResult.value : []),
    ]);
    const top = results[0];
    if (!top) {
      await interaction.editReply({ embeds: [errorEmbed(`No results for “${query}”.`)] });
      return;
    }

    const guild = interaction.guildId ? await context.guilds.findByDiscordId(interaction.guildId) : undefined;
    let description = '';
    if (guild) {
      const members = await context.guilds.membersOf(guild.id);
      const memberIds = members.filter((member) => member.profileVisibility !== 'PRIVATE').map((member) => member.id);
      const stats = await context.entries.statsForMedia(memberIds, { provider: top.provider, providerMediaId: top.providerMediaId, mediaType: top.mediaType }, top.canonicalMediaKey);
      description = `${stats.completed} member${stats.completed === 1 ? '' : 's'} watched\n` + (stats.averageRating !== null ? `Average: ${stats.averageRating.toFixed(1)} / 10` : 'No ratings yet');
    }

    const embed = baseEmbed().setTitle(top.title).setDescription(description || 'Not tracked here yet.');
    if (top.posterUrl) embed.setThumbnail(top.posterUrl);
    await interaction.editReply({ embeds: [embed], components: [linkRow('View on Couchlist', `${context.config.APP_BASE_URL}${mediaPath(top)}`)] });
  },
};

async function handleSuggestion(interaction: Parameters<BotCommand['execute']>[0], context: Parameters<BotCommand['execute']>[1]) {
  await interaction.deferReply({ ephemeral: true });
  const url = interaction.options.getString('url', true);
  const scope = interaction.options.getString('scope', true);
  const domain = normalizeDomain(url);
  if (!domain) {
    await interaction.editReply({ embeds: [errorEmbed('Enter a valid public http(s) website URL.')] });
    return;
  }
  const name = interaction.options.getString('name')?.trim() || domain;
  const mediaTitle = interaction.options.getString('title')?.trim() || null;
  const supports = interaction.options.getString('supports') ?? 'unknown';
  const comment = interaction.options.getString('comment')?.trim() || null;
  const supportsAnime = supports === 'anime' || supports === 'all';
  const supportsMovies = supports === 'movies' || supports === 'all';
  const supportsTv = supports === 'tv' || supports === 'all';

  const user = await context.users.findByDiscordId(interaction.user.id);
  if (!user) {
    await interaction.editReply({ embeds: [errorEmbed(`Sign in to Couchlist first: ${context.config.APP_BASE_URL}`)] });
    return;
  }
  const guild = interaction.guildId ? await context.guilds.findByDiscordId(interaction.guildId) : undefined;
  if (!guild) {
    await interaction.editReply({ embeds: [errorEmbed('This server is not connected to Couchlist yet.')] });
    return;
  }

  if (scope === 'server') {
    await context.watchSources.shareWithServer({ guildId: guild.id, userId: user.id, homepageUrl: url, suggestedName: name, comment, mediaTitle, supportsAnime, supportsMovies, supportsTv });
    await interaction.editReply({ embeds: [baseEmbed().setTitle('Shared with this server').setDescription(`${name} is now in this server’s Sources tab.`)], components: [linkRow('Open server sources', `${context.config.APP_BASE_URL}/server/${guild.discordId}`)] });
    return;
  }

  const candidate = await context.watchSources.recordCandidate({ homepageUrl: url, suggestedName: name, origin: 'COMMUNITY', submittedByUserId: user.id, guildId: guild.id, supportsAnime, supportsMovies, supportsTv, comment, mediaTitle });
  await interaction.editReply({ embeds: [baseEmbed().setTitle('Suggestion sent').setDescription(candidate ? `${name} was sent to Couchlist for review.` : 'That source is already known to Couchlist.')] });
}
