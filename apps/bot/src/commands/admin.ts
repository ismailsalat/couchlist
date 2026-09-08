import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { checkDatabaseHealth } from '@couchlist/db';
import { testModeStatus } from '@couchlist/shared';
import { baseEmbed, errorEmbed, linkRow } from '../lib/embeds.js';
import { canManageGuild } from '../lib/permissions.js';
import type { BotCommand } from './types.js';

/**
 * /admin - setup and status.
 *
 * Both subcommands re-check permissions at execution time. Discord's own
 * default_member_permissions is a convenience, not the security boundary.
 */
export const adminCommand: BotCommand = {
  guildOnly: true,
  data: new SlashCommandBuilder()
    .setName('admin')
    .setDescription('Configure Couchlist for this server.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) =>
      sub.setName('setup').setDescription('Connect Couchlist to this server.'),
    )
    .addSubcommand((sub) =>
      sub.setName('status').setDescription('Check the Couchlist integration.'),
    ),

  async execute(interaction, context) {
    if (!canManageGuild(interaction, context.config.BOT_OWNER_IDS)) {
      await interaction.reply({
        embeds: [errorEmbed('You need Manage Server to configure Couchlist.')],
        ephemeral: true,
      });
      return;
    }

    const subcommand = interaction.options.getSubcommand(true);
    if (subcommand === 'setup') return runSetup(interaction, context);
    return runStatus(interaction, context);
  },
};

const runSetup: BotCommand['execute'] = async (interaction, context) => {
  if (!interaction.guild) return;
  await interaction.deferReply({ ephemeral: true });

  const guild = await context.guilds.upsert({
    discordId: interaction.guild.id,
    name: interaction.guild.name,
    iconUrl: interaction.guild.iconURL() ?? null,
  });

  await context.guilds.setBotConnected(interaction.guild.id, true);
  await context.guilds.ensureSettings(guild.id);

  // If testers signed into Couchlist before /admin setup was run, their
  // accounts already exist but they have no active guild membership yet.
  // Repair those known accounts now instead of forcing everyone to log out
  // and back in. This only checks existing Couchlist accounts; it never
  // creates an account for a Discord member who has not signed in.
  const repaired = await repairKnownMembers(interaction, context, guild.id);

  const actor = await context.users.findByDiscordId(interaction.user.id);
  await context.audit.record({
    actorId: actor?.id ?? null,
    guildId: guild.id,
    action: 'guild.setup',
    // Metadata is filtered by the repository; ids and names only.
    metadata: { guildName: interaction.guild.name },
  });

  context.log.info('guild_setup', { guildId: interaction.guild.id });

  const embed = baseEmbed()
    .setTitle('Couchlist is connected')
    .setDescription(
      'Community perks are now unlocked for this server: member watch activity, server favorites, ratings, and want-to-watch overlap. Personal Couchlist friends still work without a server.\n\n' +
        (repaired > 0
          ? `Linked ${repaired} existing Couchlist account${repaired === 1 ? '' : 's'} to this server.`
          : 'Sign in on the website to link your account.'),
    );

  await interaction.editReply({
    embeds: [embed],
    components: [linkRow('Open Couchlist', context.config.APP_BASE_URL)],
  });
};

const runStatus: BotCommand['execute'] = async (interaction, context) => {
  if (!interaction.guild) return;
  await interaction.deferReply({ ephemeral: true });

  const database = await checkDatabaseHealth(context.db);
  const guild = await context.guilds.findByDiscordId(interaction.guild.id);

  // /admin status doubles as a safe repair pass for known testers. This makes
  // private testing resilient when setup/login happened in the opposite order.
  if (guild?.botConnected) {
    await repairKnownMembers(interaction, context, guild.id);
  }

  const members = guild?.botConnected ? await context.guilds.membersOf(guild.id) : [];
  const test = testModeStatus(context.config);

  const uptimeMinutes = Math.floor((Date.now() - context.startedAt.getTime()) / 60_000);

  const embed = baseEmbed()
    .setTitle('Couchlist status')
    .addFields(
      { name: 'Website', value: context.config.APP_BASE_URL, inline: false },
      { name: 'Database', value: database.ok ? 'Healthy' : 'Unreachable', inline: true },
      {
        name: 'Server connected',
        value: guild?.botConnected ? 'Yes' : 'No — run /admin setup',
        inline: true,
      },
      { name: 'Couchlist users', value: String(members.length), inline: true },
      { name: 'Test mode', value: test.enabled ? 'On' : 'Off', inline: true },
      ...(test.enabled
        ? [{ name: 'Allowed testers', value: String(test.allowedUsers), inline: true }]
        : []),
      { name: 'Uptime', value: `${uptimeMinutes} min`, inline: true },
    );

  await interaction.editReply({ embeds: [embed] });
};


/**
 * Link existing Couchlist accounts that are actually members of this Discord
 * server. In test mode we only inspect TEST_USER_IDS. Outside test mode we
 * repair the administrator running the command; normal users are synced by
 * Discord OAuth at login.
 */
async function repairKnownMembers(
  interaction: Parameters<BotCommand['execute']>[0],
  context: Parameters<BotCommand['execute']>[1],
  internalGuildId: string,
): Promise<number> {
  if (!interaction.guild) return 0;

  const candidates = [...new Set(
    context.config.TEST_MODE ? context.config.TEST_USER_IDS : [interaction.user.id],
  )];

  let linked = 0;
  for (const discordId of candidates) {
    const account = await context.users.findByDiscordId(discordId);
    if (!account) continue;

    let isMember = discordId === interaction.user.id;

    // The live discord.js Guild has a MemberManager. The guard keeps unit
    // tests and any unusual partial interaction from crashing. Fetching one
    // known user by id uses Discord's REST member endpoint and does not require
    // enabling the privileged Guild Members gateway intent.
    if (!isMember) {
      const members = (interaction.guild as typeof interaction.guild & {
        members?: { fetch?: (id: string) => Promise<unknown> };
      }).members;

      if (members?.fetch) {
        try {
          await members.fetch(discordId);
          isMember = true;
        } catch {
          isMember = false;
        }
      }
    }

    if (!isMember) continue;
    await context.guilds.setMembership(account.id, internalGuildId, true);
    linked += 1;
  }

  if (linked > 0) {
    context.log.info('guild_membership_repaired', {
      guildId: interaction.guild.id,
      linked,
    });
  }

  return linked;
}
