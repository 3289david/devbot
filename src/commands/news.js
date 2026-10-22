import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import { db } from '../db.js';
import { matchKeyword } from '../matching.js';
import { ensureAnalysis } from '../pipeline.js';
import { buildDigest } from '../ui/digest.js';
import { buildNewsCard } from '../ui/news.js';
import { prioRank } from '../constants.js';
import { catChoices, say } from './_shared.js';

const guildLang = (i) => (i.guildId ? db.guild(i.guildId).language : db.user(i.user.id).language);

export default {
  data: new SlashCommandBuilder()
    .setName('news')
    .setDescription('최근 소식 보기')
    .addSubcommand((sc) =>
      sc.setName('latest').setDescription('카테고리별 최신 소식')
        .addStringOption((o) => o.setName('category').setDescription('카테고리').addChoices(...catChoices()))
        .addStringOption((o) => o.setName('min').setDescription('최소 우선순위').addChoices(
          { name: '🟠 높은 우선순위 이상', value: 'high' }, { name: '🔵 보통 이상', value: 'normal' }, { name: '⚪ 전부', value: 'low' })))
    .addSubcommand((sc) =>
      sc.setName('search').setDescription('저장된 소식에서 검색')
        .addStringOption((o) => o.setName('query').setDescription('검색어').setRequired(true)))
    .addSubcommand((sc) =>
      sc.setName('card').setDescription('가장 최근 소식 1건을 전체 카드로 보기')
        .addStringOption((o) => o.setName('category').setDescription('카테고리').addChoices(...catChoices()))),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const lang = guildLang(interaction);
    const cat = interaction.options.getString('category');
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    if (sub === 'card') {
      const [item] = db.recentItems(7 * 86_400_000, (i) => !i.guildId && (!cat || i.category === cat)).sort((a, b) => b.ts - a.ts);
      if (!item) return interaction.editReply({ content: '표시할 소식이 아직 없어요.' });
      const a = await ensureAnalysis(item, lang);
      const u = db.user(interaction.user.id);
      return interaction.editReply(buildNewsCard(item, a, { lang, style: 'rich', dm: true, saved: u.saved.includes(item.id), askButtons: true }));
    }

    let items;
    let heading;
    if (sub === 'search') {
      const q = interaction.options.getString('query').trim().toLowerCase();
      items = db.recentItems(21 * 86_400_000, (i) => !i.guildId && matchKeyword([i.title, i.analysis?.[lang]?.title, ...(i.tags ?? []), i.body?.slice(0, 300)].filter(Boolean).join(' ').toLowerCase(), q));
      heading = `🔎 “${q}”`;
    } else {
      const min = interaction.options.getString('min') ?? 'normal';
      items = db.recentItems(3 * 86_400_000, (i) => !i.guildId && (!cat || i.category === cat) && prioRank(i.priority) >= prioRank(min));
      heading = lang === 'ko' ? '최신 소식' : 'Latest';
    }
    return interaction.editReply(buildDigest(items, { lang, kind: 'daily', heading, ephemeral: true, limit: 6 }));
  },
};
