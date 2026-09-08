import { SlashCommandBuilder } from 'discord.js';
import { calculateTasteMatch, type RatedEntry } from '@couchlist/shared';
import { baseEmbed, errorEmbed, linkRow } from '../lib/embeds.js';
import type { BotCommand } from './types.js';

/** /compare - taste match with a Couchlist friend (server connection not required). */
export const compareCommand: BotCommand = {
  guildOnly: false,
  data: new SlashCommandBuilder()
    .setName('compare')
    .setDescription('Compare your taste with someone else.')
    .addUserOption((option) =>
      option.setName('user').setDescription('Who to compare with.').setRequired(true),
    ),

  async execute(interaction, context) {
    const target = interaction.options.getUser('user', true);
    await interaction.deferReply({ ephemeral: true });

    if (target.id === interaction.user.id) {
      await interaction.editReply({ embeds: [errorEmbed('Pick somebody else to compare with.')] });
      return;
    }

    const [me, them] = await Promise.all([
      context.users.findByDiscordId(interaction.user.id),
      context.users.findByDiscordId(target.id),
    ]);

    if (!me || !them) {
      await interaction.editReply({
        embeds: [errorEmbed('You both need a Couchlist account before comparing.')],
        components: [linkRow('Open Couchlist', context.config.APP_BASE_URL)],
      });
      return;
    }

    // Direct Couchlist friends are the core social relationship. A shared
    // connected server is an optional community perk and also grants profile
    // visibility, matching the website's authorization rules.
    const [directFriend, shared] = await Promise.all([
      context.friends.areFriends(me.id, them.id),
      context.guilds.sharedGuildIds(me.id, them.id),
    ]);
    if ((!directFriend && shared.length === 0) || them.profileVisibility === 'PRIVATE') {
      await interaction.editReply({
        embeds: [errorEmbed("You can't compare with that person right now.")],
      });
      return;
    }

    const [mine, theirs] = await Promise.all([
      context.entries.listForUser(me.id),
      context.entries.listForUser(them.id),
    ]);

    const toRated = (rows: typeof mine, showRatings: boolean): RatedEntry[] =>
      rows.map((row) => ({
        provider: row.provider,
        providerMediaId: row.providerMediaId,
        mediaType: row.mediaType,
        title: row.title,
        rating: showRatings ? row.rating : null,
        completed: row.status === 'COMPLETED',
      }));

    const result = calculateTasteMatch(toRated(mine, true), toRated(theirs, them.showRatings));

    const names = `${me.globalName ?? me.username} + ${them.globalName ?? them.username}`;

    const embed =
      result.status === 'ok'
        ? baseEmbed()
            .setTitle(names)
            .setDescription(
              `**${result.matchPercent}% Taste Match**\n${result.sharedTitles} shared titles`,
            )
        : baseEmbed()
            .setTitle(names)
            .setDescription('Watch a few more titles before we can calculate your taste match.');

    await interaction.editReply({
      embeds: [embed],
      components: [
        linkRow('View Comparison', `${context.config.APP_BASE_URL}/compare/${them.id}`),
      ],
    });
  },
};
