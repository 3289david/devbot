import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ContainerBuilder, MessageFlags, SectionBuilder,
  SeparatorBuilder, SeparatorSpacingSize, StringSelectMenuBuilder, TextDisplayBuilder, ThumbnailBuilder,
} from 'discord.js';
import { clip } from '../util.js';

export const V2 = MessageFlags.IsComponentsV2;
export const EPHEMERAL = MessageFlags.Ephemeral;

/** Discord caps the combined text of one message at 4000 chars. */
export const TEXT_BUDGET = 3900;

export const text = (content) => new TextDisplayBuilder().setContent(clip(content, 3900));
export const sep = (big = false, divider = true) =>
  new SeparatorBuilder().setDivider(divider).setSpacing(big ? SeparatorSpacingSize.Large : SeparatorSpacingSize.Small);

export function button(id, label, { style = 'secondary', emoji, disabled = false } = {}) {
  const b = new ButtonBuilder()
    .setCustomId(id)
    .setLabel(clip(label, 80))
    .setStyle({ primary: ButtonStyle.Primary, secondary: ButtonStyle.Secondary, success: ButtonStyle.Success, danger: ButtonStyle.Danger }[style])
    .setDisabled(disabled);
  if (emoji) b.setEmoji(emoji);
  return b;
}

export function linkButton(url, label, emoji) {
  const b = new ButtonBuilder().setStyle(ButtonStyle.Link).setURL(url).setLabel(clip(label, 80));
  if (emoji) b.setEmoji(emoji);
  return b;
}

export const row = (...components) => new ActionRowBuilder().addComponents(...components);

export function select({ id, placeholder, options, min = 1, max = 1 }) {
  return new StringSelectMenuBuilder()
    .setCustomId(id)
    .setPlaceholder(clip(placeholder, 100))
    .setMinValues(min)
    .setMaxValues(Math.min(max, options.length || 1))
    .addOptions(
      options.slice(0, 25).map((o) => ({
        label: clip(o.label, 100),
        value: String(o.value).slice(0, 100),
        description: o.description ? clip(o.description, 100) : undefined,
        emoji: o.emoji,
        default: Boolean(o.default),
      })),
    );
}

/** Section: text on the left, a button or thumbnail accessory on the right. */
export function section(lines, accessory) {
  const s = new SectionBuilder().addTextDisplayComponents(...[].concat(lines).map(text));
  if (!accessory) return s;
  if (typeof accessory === 'string') return s.setThumbnailAccessory(new ThumbnailBuilder().setURL(accessory));
  return s.setButtonAccessory(accessory);
}

export function container({ color, spoiler = false } = {}) {
  const c = new ContainerBuilder().setSpoiler(spoiler);
  if (color !== undefined) c.setAccentColor(color);
  return c;
}

export const payload = (components, { ephemeral = false, extra = {} } = {}) => ({
  components,
  flags: V2 | (ephemeral ? EPHEMERAL : 0),
  allowedMentions: { parse: [] },
  ...extra,
});

/** Single-container "notice" card. */
export function notice(title, body, { color = 0x64748b, ephemeral = true, buttons } = {}) {
  const c = container({ color }).addTextDisplayComponents(text(`## ${title}\n${body}`));
  if (buttons?.length) c.addSeparatorComponents(sep()).addActionRowComponents(row(...buttons));
  return payload([c], { ephemeral });
}
