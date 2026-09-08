import { PermissionFlagsBits, type ChatInputCommandInteraction } from 'discord.js';

/**
 * Who may configure Couchlist in a server.
 *
 * Deliberately narrow: the server owner, anyone with Manage Guild, or a
 * configured bot owner. Couchlist never asks for Administrator.
 */
export function canManageGuild(
  interaction: ChatInputCommandInteraction,
  botOwnerIds: string[],
): boolean {
  if (botOwnerIds.includes(interaction.user.id)) return true;
  if (!interaction.guild) return false;
  if (interaction.guild.ownerId === interaction.user.id) return true;

  return interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) ?? false;
}

export function isBotOwner(userId: string, botOwnerIds: string[]): boolean {
  return botOwnerIds.includes(userId);
}
