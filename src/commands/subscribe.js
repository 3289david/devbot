import { SlashCommandBuilder } from 'discord.js';
import { CATEGORIES, TECHS } from '../constants.js';
import { db } from '../db.js';
import { catChoices, normKeyword, say } from './_shared.js';

const MAX_KEYWORDS = 50;

export const techAutocomplete = (interaction, pool = TECHS) => {
  const q = normKeyword(interaction.options.getFocused());
  const list = pool.filter((t) => t.includes(q)).slice(0, 25);
  if (q && !list.includes(q)) list.unshift(q);
  return interaction.respond(list.slice(0, 25).map((t) => ({ name: t, value: t })));
};

const subscribe = {
  data: new SlashCommandBuilder()
    .setName('subscribe')
    .setDescription('관심 카테고리·기술을 구독하고 DM으로 받아요')
    .addStringOption((o) => o.setName('category').setDescription('카테고리 구독').addChoices(...catChoices()))
    .addStringOption((o) => o.setName('tech').setDescription('관심 기술 (예: nextjs, react, openai)').setAutocomplete(true).setMaxLength(40)),
  async execute(interaction) {
    const u = db.user(interaction.user.id);
    const cat = interaction.options.getString('category');
    const tech = normKeyword(interaction.options.getString('tech'));
    if (!cat && !tech) return say(interaction, '`category` 또는 `tech` 중 하나는 골라 주세요. 한꺼번에 관리하려면 `/settings` 를 써 보세요.');

    const lines = [];
    if (cat) {
      if (!u.categories.includes(cat)) u.categories.push(cat);
      lines.push(`${CATEGORIES[cat].emoji} **${CATEGORIES[cat].name.ko}** 구독 완료`);
    }
    if (tech) {
      if (u.keywords.length >= MAX_KEYWORDS && !u.keywords.includes(tech)) return say(interaction, `키워드는 최대 ${MAX_KEYWORDS}개예요.`);
      if (!u.keywords.includes(tech)) u.keywords.push(tech);
      u.muted = u.muted.filter((m) => m !== tech);
      lines.push(`🔑 \`${tech}\` 관련 소식이 나오면 DM으로 알려 드릴게요`);
    }
    u.dm = true;
    db.save();
    lines.push(`-# 최소 우선순위 ${u.minPriority} · \`/settings\` 에서 조정`);
    return say(interaction, lines.join('\n'));
  },
  autocomplete: (i) => techAutocomplete(i),
};

const unsubscribe = {
  data: new SlashCommandBuilder()
    .setName('unsubscribe')
    .setDescription('구독을 해제해요')
    .addStringOption((o) => o.setName('category').setDescription('카테고리 해제').addChoices(...catChoices()))
    .addStringOption((o) => o.setName('tech').setDescription('기술/키워드 해제').setAutocomplete(true)),
  async execute(interaction) {
    const u = db.user(interaction.user.id);
    const cat = interaction.options.getString('category');
    const tech = normKeyword(interaction.options.getString('tech'));
    if (!cat && !tech) return say(interaction, '`category` 또는 `tech` 를 골라 주세요.');
    const lines = [];
    if (cat) {
      u.categories = u.categories.filter((c) => c !== cat);
      lines.push(`${CATEGORIES[cat].emoji} ${CATEGORIES[cat].name.ko} 구독을 해제했어요.`);
    }
    if (tech) {
      u.keywords = u.keywords.filter((k) => k !== tech);
      lines.push(`🔑 \`${tech}\` 키워드를 삭제했어요.`);
    }
    db.save();
    return say(interaction, lines.join('\n'));
  },
  autocomplete: (i) => techAutocomplete(i, db.user(i.user.id).keywords),
};

export default [subscribe, unsubscribe];
