import { SlashCommandBuilder } from 'discord.js';
import { db } from '../db.js';
import { normKeyword, say, splitList } from './_shared.js';
import { techAutocomplete } from './subscribe.js';

const MAX = 50;
const kw = (name, desc) => (sc) =>
  sc.setName(name).setDescription(desc).addStringOption((o) => o.setName('keyword').setDescription('키워드 (쉼표로 여러 개)').setRequired(true).setAutocomplete(true));

export default {
  data: new SlashCommandBuilder()
    .setName('keywords')
    .setDescription('관심 키워드를 관리해요 — 매칭되는 소식은 DM으로 와요')
    .addSubcommand(kw('add', '키워드 추가'))
    .addSubcommand(kw('remove', '키워드 삭제'))
    .addSubcommand(kw('mute', '이 키워드가 들어간 소식은 받지 않아요'))
    .addSubcommand(kw('unmute', '뮤트 해제'))
    .addSubcommand((sc) => sc.setName('list').setDescription('내 키워드 보기'))
    .addSubcommand((sc) => sc.setName('clear').setDescription('모든 키워드 삭제')),

  async execute(interaction) {
    const u = db.user(interaction.user.id);
    const sub = interaction.options.getSubcommand();
    const list = splitList(interaction.options.getString('keyword'));

    switch (sub) {
      case 'add': {
        const added = [];
        for (const k of list) {
          if (u.keywords.length >= MAX) break;
          if (!u.keywords.includes(k)) { u.keywords.push(k); added.push(k); }
          u.muted = u.muted.filter((m) => m !== k);
        }
        u.dm = true;
        db.save();
        return say(interaction, added.length ? `🔑 추가: ${added.map((k) => `\`${k}\``).join(' ')}\n-# 총 ${u.keywords.length}/${MAX}` : '추가할 새 키워드가 없어요.');
      }
      case 'remove':
        u.keywords = u.keywords.filter((k) => !list.includes(k));
        db.save();
        return say(interaction, `🗑️ 삭제했어요. 남은 키워드: ${u.keywords.map((k) => `\`${k}\``).join(' ') || '없음'}`);
      case 'mute':
        for (const k of list) if (!u.muted.includes(k)) u.muted.push(k);
        u.muted = u.muted.slice(0, MAX);
        db.save();
        return say(interaction, `🔇 뮤트: ${u.muted.map((k) => `\`${k}\``).join(' ')}`);
      case 'unmute':
        u.muted = u.muted.filter((k) => !list.includes(k));
        db.save();
        return say(interaction, `🔊 뮤트 해제. 현재 뮤트: ${u.muted.map((k) => `\`${k}\``).join(' ') || '없음'}`);
      case 'list':
        return say(interaction, [
          `🔑 **키워드** ${u.keywords.map((k) => `\`${k}\``).join(' ') || '_없음_'}`,
          `🔇 **뮤트** ${u.muted.map((k) => `\`${k}\``).join(' ') || '_없음_'}`,
          '-# `/keywords add` 로 추가 · `/settings` 에서 한눈에 관리',
        ].join('\n'));
      case 'clear':
        u.keywords = [];
        db.save();
        return say(interaction, '🧹 키워드를 모두 삭제했어요.');
    }
  },

  autocomplete(interaction) {
    const sub = interaction.options.getSubcommand();
    const u = db.user(interaction.user.id);
    const pool = sub === 'remove' ? u.keywords : sub === 'unmute' ? u.muted : undefined;
    return techAutocomplete(interaction, pool);
  },
};
