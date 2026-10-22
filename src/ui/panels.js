import { CATEGORIES, CHANNEL_CATEGORIES, NEWS_CATEGORIES, PRIORITIES, PRIORITY, WEEKDAYS } from '../constants.js';
import { clip } from '../util.js';
import { DEFAULT_SOURCES, guildSourceList } from '../sources/index.js';
import { aiEnabled } from '../ai.js';
import { button, container, linkButton, notice, payload, row, section, select, sep, text } from './kit.js';
import { radarSection } from './news.js';
import { S } from './strings.js';

const onoff = (b) => (b ? '🟢 켜짐' : '⚫ 꺼짐');
const hh = (h) => `${String(h).padStart(2, '0')}:00`;

/* ───────────────────────── /settings (personal) ───────────────────────── */

export function settingsPanel(u, mode = 'main') {
  const c = container({ color: 0x6366f1 });
  const cats = u.categories.length
    ? u.categories.map((k) => `${CATEGORIES[k].emoji} ${CATEGORIES[k].name.ko}`).join(', ')
    : '_아직 없음 — 아래에서 골라 보세요_';
  const kws = u.keywords.length ? u.keywords.map((k) => `\`${k}\``).join(' ') : '_없음_';
  const muted = u.muted.length ? u.muted.map((k) => `~~${k}~~`).join(' ') : null;

  c.addTextDisplayComponents(
    text(
      [
        '## ⚙️ 내 설정',
        '-# 개인 알림과 브리핑은 DM으로 전달돼요. 서버 채널 설정은 관리자의 `/setup`에서 해요.',
        '',
        `**📚 구독 카테고리** · ${cats}`,
        `**🔑 키워드** · ${kws}${muted ? `\n**🔇 뮤트** · ${muted}` : ''}`,
        `**🧰 내 스택** · ${u.stack ? clip(u.stack, 200) : '_미등록 — AI가 "내 프로젝트에 영향?"을 판단할 때 사용해요_'}`,
        '',
        `**🔔 DM 알림** ${onoff(u.dm)}  ·  최소 우선순위 ${PRIORITY[u.minPriority].emoji} **${PRIORITY[u.minPriority].ko}**`,
        `**📰 브리핑** 일간 ${onoff(u.digest.daily)} · 주간 ${onoff(u.digest.weekly)} · ${hh(u.digest.hour)} (${u.digest.tz})`,
        `**🌐 언어** ${u.language === 'ko' ? '한국어' : 'English'}`,
      ].join('\n'),
    ),
  );
  c.addSeparatorComponents(sep());

  if (mode === 'delkw') {
    if (u.keywords.length || u.muted.length) {
      const options = [
        ...u.keywords.map((k) => ({ label: k, value: `k:${k}`, description: '구독 키워드', emoji: '🔑' })),
        ...u.muted.map((k) => ({ label: k, value: `m:${k}`, description: '뮤트 키워드', emoji: '🔇' })),
      ];
      c.addActionRowComponents(row(select({ id: 's:kwdel', placeholder: '삭제할 키워드를 고르세요', options, min: 1, max: options.length })));
    }
    c.addActionRowComponents(row(button('s:back', '돌아가기', { emoji: '↩️' })));
    return payload([c], { ephemeral: true });
  }

  c.addActionRowComponents(
    row(
      select({
        id: 's:cats',
        placeholder: '구독할 카테고리 선택',
        options: NEWS_CATEGORIES.map((k) => ({
          label: CATEGORIES[k].name.ko, value: k, description: CATEGORIES[k].desc.ko, emoji: CATEGORIES[k].emoji, default: u.categories.includes(k),
        })),
        min: 0,
        max: NEWS_CATEGORIES.length,
      }),
    ),
  );
  c.addActionRowComponents(
    row(
      select({
        id: 's:minp',
        placeholder: 'DM 최소 우선순위',
        options: PRIORITIES.map((p) => ({ label: PRIORITY[p].ko, value: p, emoji: PRIORITY[p].emoji, default: u.minPriority === p })),
      }),
    ),
  );
  c.addActionRowComponents(
    row(
      button('s:tog:dm', `DM ${u.dm ? 'ON' : 'OFF'}`, { style: u.dm ? 'success' : 'secondary', emoji: '🔔' }),
      button('s:tog:daily', `일간 ${u.digest.daily ? 'ON' : 'OFF'}`, { style: u.digest.daily ? 'success' : 'secondary', emoji: '☀️' }),
      button('s:tog:weekly', `주간 ${u.digest.weekly ? 'ON' : 'OFF'}`, { style: u.digest.weekly ? 'success' : 'secondary', emoji: '🗓️' }),
      button('s:tog:lang', u.language === 'ko' ? '한국어' : 'English', { emoji: '🌐' }),
    ),
  );
  c.addActionRowComponents(
    row(
      button('s:kw:add', '키워드 추가', { style: 'primary', emoji: '➕' }),
      button('s:kw:del', '키워드 삭제', { emoji: '🗑️', disabled: !u.keywords.length && !u.muted.length }),
      button('s:stack', '내 스택 편집', { emoji: '🧰' }),
    ),
  );
  return payload([c], { ephemeral: true });
}

/* ───────────────────────── "AI에게 질문" panels ───────────────────────── */

export function askPanel(item, a, u, lang) {
  const t = S(lang);
  const c = container({ color: 0x7c5cff });
  c.addTextDisplayComponents(
    text(
      [
        `## 🤖 ${t.askTitle}`,
        `**${clip(a.title, 100)}**`,
        u.stack ? `-# 🧰 ${clip(u.stack, 120)}` : `-# ${t.stackHint}`,
      ].join('\n'),
    ),
  );
  c.addSeparatorComponents(sep());
  c.addActionRowComponents(
    row(
      button(`n:q:impact:${item.id}`, t.askImpact, { style: 'primary', emoji: '🎯' }),
      button(`n:q:diff:${item.id}`, t.askDiff, { emoji: '🔀' }),
      button(`n:q:example:${item.id}`, t.askExample, { emoji: '🧪' }),
      button(`n:q:custom:${item.id}`, t.askCustom, { emoji: '✍️' }),
    ),
  );
  return payload([c], { ephemeral: true });
}

export function answerCard(item, a, question, answer, lang) {
  const t = S(lang);
  const c = container({ color: 0x7c5cff });
  c.addTextDisplayComponents(text(`-# 🤖 AI${a ? ` · ${clip(a.title, 70)}` : ''}
**Q.** ${clip(question, 200)}`));
  c.addSeparatorComponents(sep());
  c.addTextDisplayComponents(text(clip(answer, 3000)));
  c.addTextDisplayComponents(text(`-# ${t.askDisclaimer}`));
  if (item) {
    c.addSeparatorComponents(sep());
    c.addActionRowComponents(
      row(
        linkButton(item.url, t.open, '🔗'),
        button(`n:ask:${item.id}`, lang === 'ko' ? '다른 질문' : 'Another question', { emoji: '🔁' }),
        button(`n:save:${item.id}`, t.save, { emoji: '💾' }),
      ),
    );
  }
  return payload([c], { ephemeral: true });
}

/* ───────────────────────── list views ───────────────────────── */

export function savedPanel(items, lang) {
  const c = container({ color: 0x0ea5e9 });
  c.addTextDisplayComponents(text(`## 💾 ${lang === 'ko' ? '저장한 소식' : 'Saved'}\n-# ${items.length}`));
  if (!items.length) {
    c.addTextDisplayComponents(text(lang === 'ko' ? '아직 저장한 소식이 없어요. 뉴스 카드의 **저장** 버튼을 눌러 보세요.' : 'Nothing saved yet.'));
  }
  for (const it of items.slice(0, 8)) {
    const a = it.analysis?.[lang];
    c.addSeparatorComponents(sep(false, false));
    c.addSectionComponents(
      section(
        [`${PRIORITY[it.priority]?.emoji ?? '🔵'} **[${clip(a?.title ?? it.title, 80)}](${it.url})**\n-# ${CATEGORIES[it.category].emoji} ${it.sourceName}`],
        button(`n:unsave:${it.id}`, lang === 'ko' ? '삭제' : 'Remove', { emoji: '🗑️', style: 'danger' }),
      ),
    );
  }
  return payload([c], { ephemeral: true });
}

export function radarPanel(items, lang, filterLabel) {
  const t = S(lang);
  const c = container({ color: CATEGORIES.trending.color });
  c.addTextDisplayComponents(
    text(`## 📡 GitHub ${lang === 'ko' ? '프로젝트 레이더' : 'project radar'}\n-# ${filterLabel}`),
  );
  if (!items.length) c.addTextDisplayComponents(text(t.empty));
  for (const { item, analysis } of items.slice(0, 7)) {
    c.addSeparatorComponents(sep(false, false));
    c.addSectionComponents(radarSection(item, analysis, lang));
  }
  c.addSeparatorComponents(sep());
  c.addActionRowComponents(
    row(button('d:radar:ko', lang === 'ko' ? '한국어 요약 보기' : 'Show analysis', { emoji: '🔎' }), button('d:radar:refresh', lang === 'ko' ? '새로고침' : 'Refresh', { emoji: '🔄' })),
  );
  return payload([c], { ephemeral: true });
}

/* ───────────────────────── admin: /setup view ───────────────────────── */

export function setupOverview(g, guildName) {
  const c = container({ color: 0x14b8a6 });
  const rows = CHANNEL_CATEGORIES.map((k) => {
    const ch = g.channels[k] ? `<#${g.channels[k]}>` : '_미설정_';
    if (k === 'digest') {
      return `${CATEGORIES[k].emoji} **${CATEGORIES[k].name.ko}** → ${ch}  ·  ${hh(g.digest.hour)} ${g.digest.tz}  ·  일간 ${onoff(g.digest.daily)} · 주간(${WEEKDAYS[g.digest.weekday].name}) ${onoff(g.digest.weekly)}`;
    }
    const role = g.roles[k] ? ` · 핑 <@&${g.roles[k]}>` : '';
    return `${CATEGORIES[k].emoji} **${CATEGORIES[k].name.ko}** ${g.enabled[k] ? '' : '⛔ '}→ ${ch}  ·  최소 ${PRIORITY[g.minPriority[k]].emoji}${role}`;
  });
  const custom = g.sources.rss.length + g.sources.repos.length;
  c.addTextDisplayComponents(
    text(
      [
        `## 🛠️ ${clip(guildName, 60)} 설정`,
        `-# 모든 값은 \`/setup\` 하위 명령어로 바꿀 수 있어요.`,
        '',
        ...rows,
        '',
        `**🌐 언어** ${g.language === 'ko' ? '한국어' : 'English'}  ·  **🎨 스타일** ${g.style === 'rich' ? '풍부한 카드' : '컴팩트'}  ·  **🧵 스레드** ${onoff(g.threads)}`,
        `**🚨 역할 핑 기준** ${PRIORITY[g.pingMinPriority].emoji} ${PRIORITY[g.pingMinPriority].ko} 이상  ·  **🤖 AI 버튼** ${onoff(g.askButtons)}`,
        `**📦 보안 생태계** ${g.ecosystems.length ? g.ecosystems.map((e) => `\`${e}\``).join(' ') : '전체'}  ·  **⭐ 트렌딩 최소 별** ${g.trendingMinStars}`,
        `**📡 소스** 기본 ${DEFAULT_SOURCES.length}개 중 ${g.sources.disabled.length}개 끔  ·  커스텀 ${custom}개`,
        `**🧠 AI 분석** ${aiEnabled ? '🟢 사용 중' : '⚫ 꺼짐 (AI_API_KEY 필요)'}`,
      ].join('\n'),
    ),
  );
  c.addSeparatorComponents(sep());
  c.addActionRowComponents(
    row(
      button('a:preview', '카드 미리보기', { style: 'primary', emoji: '👀' }),
      button('a:sources', '소스 목록', { emoji: '📡' }),
      button('a:digestnow', '지금 브리핑 보내기', { emoji: '📰' }),
    ),
  );
  return payload([c], { ephemeral: true });
}

export function sourcesPanel(guildId) {
  const list = guildSourceList(guildId);
  const c = container({ color: 0x14b8a6 });
  const lines = list.map((s) => `${s.enabled ? '🟢' : '⚫'} ${CATEGORIES[s.category].emoji} ${s.name}${s.custom ? ' ✨' : ''} \`${clip(s.id, 40)}\``);
  const parts = [];
  let cur = '';
  for (const l of lines) {
    if ((cur + l).length > 3400) break;
    cur += l + '\n';
  }
  parts.push(cur);
  c.addTextDisplayComponents(text(`## 📡 소스 목록\n-# ✨ = 이 서버에서 추가한 소스 · \`/setup source-toggle\` 로 끄고 켤 수 있어요\n${parts.join('')}`));
  return payload([c], { ephemeral: true });
}

/* ───────────────────────── /help ───────────────────────── */

export function helpPanel() {
  const c = container({ color: 0x6366f1 });
  c.addTextDisplayComponents(
    text(
      [
        '## 📖 DevBot 사용법',
        '뉴스를 전달하는 봇이 아니라, **개발자가 다음에 무엇을 해야 하는지** 알려 주는 봇이에요.',
        '',
        '**🙋 모두**',
        '`/settings` 내 설정 패널 · `/subscribe` `/unsubscribe` 카테고리·기술 구독',
        '`/keywords` 키워드 관리 · `/digest` 맞춤 브리핑 · `/news` 최신·검색',
        '`/radar` GitHub 프로젝트 레이더 · `/saved` 저장한 소식 · `/ask` 자유 질문',
        '',
        '**🛡️ 관리자 (`서버 관리` 권한)**',
        '`/setup channel` 채널 지정 · `/setup role` 긴급 핑 · `/setup priority` 최소 우선순위',
        '`/setup digest-schedule` 브리핑 시간 · `/setup style` `language` `color` `threads`',
        '`/setup source-add-rss` `source-add-repo` `source-toggle` 소스 관리 · `/setup view` 전체 보기',
        '',
        '**💬 뉴스 카드 버튼** — 원문 보기 · AI에게 질문(내 프로젝트에 영향? / 이전과 차이 / 예제) · 저장 · 구독',
      ].join('\n'),
    ),
  );
  return payload([c], { ephemeral: true });
}

export { notice };
