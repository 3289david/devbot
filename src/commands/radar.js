import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import { db } from '../db.js';
import { fetchTrending, fetchReadme } from '../sources/github.js';
import { ensureAnalysis } from '../pipeline.js';
import { radarPanel } from '../ui/panels.js';
import { sha } from '../util.js';

let cache = { at: 0, items: [] };
export const resetRadarCache = () => { cache = { at: 0, items: [] }; };

/** Trending repos, cached 30 min to stay inside GitHub's rate limits. */
export async function radarItems() {
  if (Date.now() - cache.at < 30 * 60_000 && cache.items.length) return cache.items;
  const raw = await fetchTrending(60);
  cache = { at: Date.now(), items: raw.map((r) => ({ ...r, id: sha(r.id), rawId: r.id, priority: r.hints.priority, breaking: false })) };
  return cache.items;
}

export async function radarView(userId, { lang, language, analyse = false } = {}) {
  const u = db.user(userId);
  lang ??= u.language;
  let items = await radarItems();
  if (language) items = items.filter((i) => i.meta.language?.toLowerCase() === language.toLowerCase());
  items = [...items].sort((a, b) => b.meta.starsPerDay - a.meta.starsPerDay).slice(0, 7);

  const out = [];
  for (const raw of items) {
    const item = db.item(raw.id) ?? raw;
    let analysis = item.analysis?.[lang] ?? null;
    if (analyse && !analysis) {
      item.readme = await fetchReadme(item.meta.repo);
      analysis = await ensureAnalysis(item, lang);
    }
    out.push({ item, analysis });
  }
  return radarPanel(out, lang, `${language ?? (lang === 'ko' ? '모든 언어' : 'All languages')} · ${lang === 'ko' ? '최근 10일 내 생성된 저장소 · 하루 별 증가 순' : 'created in the last 10 days · stars/day'}`);
}

export default {
  data: new SlashCommandBuilder()
    .setName('radar')
    .setDescription('GitHub 프로젝트 레이더 — 지금 뜨는 신규 저장소')
    .addStringOption((o) => o.setName('language').setDescription('프로그래밍 언어로 필터 (예: TypeScript)').setMaxLength(30))
    .addBooleanOption((o) => o.setName('analyze').setDescription('AI로 용도·설치법 요약 (조금 느려요)')),
  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
      const lang = interaction.guildId ? db.guild(interaction.guildId).language : undefined;
      const view = await radarView(interaction.user.id, {
        lang, language: interaction.options.getString('language') ?? undefined, analyse: interaction.options.getBoolean('analyze') ?? false,
      });
      return interaction.editReply(view);
    } catch (e) {
      return interaction.editReply({ content: `레이더를 불러오지 못했어요: ${e.message}` });
    }
  },
};
