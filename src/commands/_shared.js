import { CATEGORIES, CHANNEL_CATEGORIES, NEWS_CATEGORIES, PRIORITIES, PRIORITY } from '../constants.js';
import { MessageFlags } from 'discord.js';

export const catChoices = (list = NEWS_CATEGORIES) =>
  list.map((k) => ({ name: `${CATEGORIES[k].emoji} ${CATEGORIES[k].name.ko}`, value: k }));

export const channelCatChoices = () => catChoices(CHANNEL_CATEGORIES);

export const prioChoices = () => PRIORITIES.map((p) => ({ name: `${PRIORITY[p].emoji} ${PRIORITY[p].ko}`, value: p }));

export const say = (interaction, content) =>
  interaction.reply({ content, flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });

export const sayEdit = (interaction, content) => interaction.editReply({ content, allowedMentions: { parse: [] } });

/** Normalise a user-typed keyword / tech name. */
export function normKeyword(s) {
  return String(s ?? '')
    .trim()
    .toLowerCase()
    .replace(/^["'`]+|["'`]+$/g, '')
    .replace(/\s+/g, ' ')
    .slice(0, 40);
}

export const splitList = (s) => String(s ?? '').split(/[,\n]/).map(normKeyword).filter(Boolean);
