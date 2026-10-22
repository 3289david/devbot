import { CATEGORIES, PRIORITY } from '../constants.js';
import { fixCommand } from '../sources/advisories.js';
import { clip, discordTime } from '../util.js';
import { button, container, linkButton, payload, row, sep, text, section } from './kit.js';
import { S } from './strings.js';

const code = (s, lang = '') => '```' + lang + '\n' + String(s).replace(/`{3,}/g, "'''") + '\n```';
const tick = (s) => '`' + String(s).replace(/`/g, "'") + '`';

export function accentFor(item, a, colors = {}) {
  if (item.category === 'security' && a.priority === 'critical') return 0xdc2626;
  return colors[item.category] ?? CATEGORIES[item.category]?.color ?? 0x64748b;
}

function chips(item, a, t) {
  const m = item.meta ?? {};
  const out = [`${PRIORITY[a.priority].emoji} **${PRIORITY[a.priority][t === S('en') ? 'en' : 'ko']}**`];
  if (m.exploited) out.push(`🔥 ${t.exploited}`);
  if (m.malware) out.push(`☠️ ${t.malware}`);
  if (item.breaking) out.push(`💥 ${t.breaking}`);
  if (['security', 'dev', 'ai', 'breaking'].includes(item.category)) {
    const code = a.ai ? a.code_change : item.category === 'security' || item.breaking ? 'maybe' : null;
    if (code) out.push(`🧩 ${t.codeChange}: **${{ none: t.codeNone, maybe: t.codeMaybe, required: t.codeRequired }[code]}**`);
    if (item.category === 'security' || a.urgency !== 'none') {
      const urg = { none: t.urgNone, soon: t.urgSoon, now: t.urgNow }[a.urgency];
      out.push(`⏱️ ${t.urgency}: **${urg}**`);
    }
  }
  return out.join('  ·  ');
}

function packageBlock(item, t) {
  const pk = item.meta?.packages ?? [];
  if (!pk.length) return '';
  const lines = pk.slice(0, 3).map((p) => {
    const fixed = p.patched ? `**${tick(p.patched)}**` : `**${t.unknown}**`;
    return `📦 **${p.name}** (${p.eco}) ${p.range ? tick(clip(p.range, 40)) : ''} → ${t.patched} ${fixed}`;
  });
  const cmds = pk
    .map((p) => fixCommand(p.eco, p.name, p.patched))
    .filter(Boolean)
    .slice(0, 2);
  return lines.join('\n') + (cmds.length ? `\n${code(cmds.join('\n'), 'bash')}` : '');
}

function releaseBlock(item) {
  const m = item.meta ?? {};
  if (!m.tag || item.category === 'security') return '';
  const bump = m.bump ? ` · ${m.bump.toUpperCase()}` : '';
  return `🏷️ ${m.prevTag ? `${tick(m.prevTag)} → ` : ''}**${tick(m.tag)}**${bump}`;
}

function trendingBlock(item, a, t, lang) {
  const m = item.meta ?? {};
  if (item.category !== 'trending') return '';
  const stats = [
    `⭐ **${(m.stars ?? 0).toLocaleString()}**${m.starsPerDay ? ` (~${m.starsPerDay.toLocaleString()}${t.perDay})` : ''}`,
    m.language ? `💻 ${m.language}` : null,
    `📄 ${m.license ?? t.noLicense}`,
  ].filter(Boolean).join('  ·  ');
  const parts = [stats];
  if (m.topics?.length) parts.push(m.topics.map((x) => `\`${x}\``).join(' '));
  if (a.purpose) parts.push(`**🎯 ${t.purpose}** · ${a.purpose}`);
  if (a.install) parts.push(`**⚙️ ${t.install}**\n${code(a.install, 'bash')}`);
  return parts.join('\n');
}

function fieldLines(item, a, t) {
  const lines = [];
  if (a.who) lines.push(`**🎯 ${t.who}** · ${a.who}`);
  if (a.impact) lines.push(`**💡 ${t.impact}** · ${a.impact}`);
  if (a.risk) lines.push(`**⚠️ ${t.risk}** · ${a.risk}`);
  if (a.action) lines.push(`**✅ ${t.action}** · ${a.action}`);
  return lines.join('\n');
}

export function actionRow(item, { lang, askButtons = true, saved = false, dm = false } = {}) {
  const t = S(lang);
  const btns = [linkButton(item.url, t.open, '🔗')];
  if (askButtons) btns.push(button(`n:ask:${item.id}`, t.ask, { style: 'primary', emoji: '🤖' }));
  btns.push(button(`n:save:${item.id}`, saved ? t.saved : t.save, { emoji: saved ? '✅' : '💾' }));
  if (!dm) btns.push(button(`n:sub:${item.id}`, t.follow, { emoji: '🔔' }));
  return row(...btns);
}

/**
 * The news card. `a` is the (translated) analysis for `lang`.
 * opts: { lang, style, colors, rolePing, saved, sample, dm, askButtons }
 */
export function buildNewsCard(item, a, opts = {}) {
  const { lang = 'ko', style = 'rich', colors, rolePing, saved, sample, dm, askButtons } = opts;
  const t = S(lang);
  const cat = CATEGORIES[item.category];
  const c = container({ color: accentFor(item, a, colors) });

  const header = `-# ${cat.emoji} ${cat.name[lang]}  ·  ${item.sourceName}  ·  ${discordTime(item.ts)}`;
  const siren = item.category === 'security' && a.priority === 'critical' ? '🚨 ' : '';
  const titleBlock = [header, `## ${siren}${clip(a.title, 120)}`, chips(item, a, t)];
  if (item.category === 'security' && a.priority === 'critical') {
    titleBlock.splice(1, 0, `**${lang === 'ko' ? '긴급 보안 업데이트' : 'Urgent security update'}**`);
  }

  const avatar = item.meta?.avatar && item.category === 'trending' ? item.meta.avatar : null;
  if (avatar) c.addSectionComponents(section([titleBlock.join('\n')], avatar));
  else c.addTextDisplayComponents(text(titleBlock.join('\n')));

  if (style === 'compact') {
    const line = a.summary[0] ? `• ${a.summary[0]}` : '';
    const act = a.action ? `\n**✅ ${t.action}** · ${a.action}` : a.impact ? `\n**💡 ${t.impact}** · ${a.impact}` : '';
    c.addTextDisplayComponents(text(line + act));
  } else {
    if (a.summary.length) c.addTextDisplayComponents(text(a.summary.map((s) => `• ${s}`).join('\n')));
    c.addSeparatorComponents(sep());
    const body = [fieldLines(item, a, t), packageBlock(item, t), releaseBlock(item), trendingBlock(item, a, t, lang)]
      .filter(Boolean)
      .join('\n');
    if (body) c.addTextDisplayComponents(text(body));

    const foot = [`🔗 **${t.source}** · [${item.sourceName}](${item.url})`];
    if (item.alsoBy?.length) foot.push(`-# ${t.alsoBy}: ${item.alsoBy.slice(0, 3).map((x) => x.sourceName).join(', ')}`);
    if (!a.ai) foot.push(`-# ${lang === 'ko' ? '자동 요약 (AI 분석 꺼짐)' : 'auto summary (AI analysis off)'}`);
    c.addTextDisplayComponents(text(foot.join('\n')));
  }

  if (sample) c.addTextDisplayComponents(text(`-# ${t.sample}`));
  c.addSeparatorComponents(sep());
  c.addActionRowComponents(actionRow(item, { lang, askButtons, saved, dm }));

  const components = [];
  if (rolePing) components.push(text(`<@&${rolePing}>`));
  components.push(c);
  return payload(components, { extra: rolePing ? { allowedMentions: { roles: [rolePing] } } : {} });
}

/** Radar / list row: compact Section with a link-button accessory. */
export function radarSection(item, a, lang) {
  const t = S(lang);
  const m = item.meta;
  const line1 = `**[${clip(m.repo, 60)}](${item.url})**  ⭐ ${m.stars.toLocaleString()} (~${m.starsPerDay}${t.perDay})`;
  const line2 = [m.language ? `💻 ${m.language}` : null, `📄 ${m.license ?? t.noLicense}`].filter(Boolean).join('  ·  ');
  const line3 = clip(a?.purpose ?? a?.summary?.[0] ?? item.body ?? '', 130);
  return section([`${line1}\n${line2}\n${line3}`.trim()], linkButton(item.url, 'GitHub'));
}
