import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

/**
 * Embed styling.
 *
 * The bot is a bridge to the website, so nearly every embed ends in a link
 * button. Colours match the site's accent.
 */
export const COUCHLIST_BLUE = 0x5b7cfa;
export const COUCHLIST_GREY = 0x1d2630;

export function baseEmbed(): EmbedBuilder {
  return new EmbedBuilder().setColor(COUCHLIST_BLUE);
}

export function linkRow(label: string, url: string): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setLabel(label).setStyle(ButtonStyle.Link).setURL(url),
  );
}

export function errorEmbed(message: string): EmbedBuilder {
  return new EmbedBuilder().setColor(COUCHLIST_GREY).setDescription(message);
}
