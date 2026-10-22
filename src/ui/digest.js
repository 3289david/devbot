import { CATEGORIES, PRIORITY, prioRank } from '../constants.js';
import { clip, discordTime } from '../util.js';
import { button, container, payload, row, sep, text } from './kit.js';
import { S } from './strings.js';

const ORDER = ['security', 'breaking', 'ai', 'dev', 'trending'];
const CAPS = { daily: { security: 5, breaking: 4, ai: 4, dev: 5, trending: 3 }, weekly: { security: 8, breaking: 6, ai: 6, dev: 8, trending: 5 } };

const byImportance = (a, b) => prioRank(b.priority) - prioRank(a.priority) || b.ts - a.ts;

function line(item, lang) {
  const a = item.analysis?.[lang];
  const title = clip(a?.title ?? item.title, 78);
  const why = a?.action ?? a?.impact ?? a?.summary?.[0] ?? '';
  const flag = item.meta?.exploited ? '🔥' : item.breaking ? '💥' : '';
  return `${PRIORITY[item.priority]?.emoji ?? '🔵'} ${flag}[${title}](${item.url})${why ? `\n  -# ${clip(why, 95)}` : ''}`;
}

/** Group items into digest sections; `breaking` items live in their own section. */
export function groupItems(items) {
  const groups = Object.fromEntries(ORDER.map((c) => [c, []]));
  for (const it of [...items].sort(byImportance)) {
    const key = it.breaking && it.category !== 'security' ? 'breaking' : it.category;
    (groups[key] ?? groups.dev).push(it);
  }
  return groups;
}

/**
 * kind: 'daily' | 'weekly'. `heading` overrides the title (e.g. a personalised one).
 * Returns a V2 payload (never empty — shows a friendly placeholder).
 */
export function buildDigest(items, { lang = 'ko', kind = 'daily', heading, lead, sinceTs, ephemeral = false, limit } = {}) {
  const t = S(lang);
  const caps = limit ? Object.fromEntries(ORDER.map((c) => [c, limit])) : CAPS[kind];
  const groups = groupItems(items);
  const c = container({ color: CATEGORIES.digest.color });

  const title = heading ?? (kind === 'weekly' ? t.weekly : t.daily);
  const counts = ORDER.filter((k) => groups[k].length).map((k) => `${CATEGORIES[k].emoji} ${groups[k].length}`).join('  ');
  const head = [`-# 📰 ${CATEGORIES.digest.name[lang]}${sinceTs ? `  ·  ${discordTime(sinceTs, 'D')}` : ''}`, `## ${title}`];
  if (counts) head.push(counts);
  if (lead) head.push(`> ${clip(lead, 300)}`);
  c.addTextDisplayComponents(text(head.join('\n')));

  let budget = 3300 - head.join('\n').length;
  let any = false;
  for (const key of ORDER) {
    const list = groups[key];
    if (!list.length || budget < 200) continue;
    const cap = caps[key] ?? 4;
    const titleLabel = {
      security: `🛡️ ${t.secTop}`,
      breaking: `💥 ${t.breakingSec}`,
      ai: `🤖 ${CATEGORIES.ai.name[lang]}`,
      dev: `🛠️ ${kind === 'weekly' ? t.releases : CATEGORIES.dev.name[lang]}`,
      trending: `📡 ${kind === 'weekly' ? t.trendingSec : CATEGORIES.trending.name[lang]}`,
    }[key];

    const lines = [];
    let used = titleLabel.length + 6;
    for (const it of list.slice(0, cap)) {
      const l = line(it, lang);
      if (used + l.length > budget) break;
      lines.push(l);
      used += l.length + 1;
    }
    if (!lines.length) continue;
    const rest = list.length - lines.length;
    if (rest > 0) lines.push(`-# ${t.more.replace('{n}', rest)}`);

    c.addSeparatorComponents(sep());
    c.addTextDisplayComponents(text(`**${titleLabel}**\n${lines.join('\n')}`));
    budget -= used;
    any = true;
  }

  if (!any) {
    c.addSeparatorComponents(sep());
    c.addTextDisplayComponents(text(t.empty));
  }

  c.addSeparatorComponents(sep());
  c.addActionRowComponents(
    row(
      button('d:mine', lang === 'ko' ? '내 맞춤 브리핑' : 'My briefing', { style: 'primary', emoji: '🎯' }),
      button('d:radar', lang === 'ko' ? 'GitHub 레이더' : 'GitHub radar', { emoji: '📡' }),
      button('d:weekly', lang === 'ko' ? '이번 주 요약' : 'Week in review', { emoji: '🗓️' }),
    ),
  );
  return payload([c], { ephemeral });
}
