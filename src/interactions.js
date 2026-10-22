import { ActionRowBuilder, MessageFlags, ModalBuilder, PermissionFlagsBits, TextInputBuilder, TextInputStyle } from 'discord.js';
import { CATEGORIES } from './constants.js';
import { db } from './db.js';
import { log } from './log.js';
import { ask } from './ai.js';
import { answerPanel, presetQuestion } from './askflow.js';
import { ensureAnalysis } from './pipeline.js';
import { sendGuildDigest, userDigestPayload } from './digests.js';
import { radarView, resetRadarCache } from './commands/radar.js';
import { savedView } from './commands/saved.js';
import { sendPreview } from './commands/setup.js';
import { normKeyword, splitList } from './commands/_shared.js';
import { askPanel, settingsPanel, sourcesPanel } from './ui/panels.js';
import { container, notice, payload, row, select, sep, text } from './ui/kit.js';
import { clip } from './util.js';

const EPH = MessageFlags.Ephemeral;
const reply = (i, content) => i.reply({ content, flags: EPH, allowedMentions: { parse: [] } });
const MAX_KEYWORDS = 50;

const modal = (id, title, inputs) =>
  new ModalBuilder().setCustomId(id).setTitle(title).addComponents(
    ...inputs.map((inp) =>
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId(inp.id).setLabel(inp.label).setStyle(inp.long ? TextInputStyle.Paragraph : TextInputStyle.Short)
          .setRequired(inp.required ?? true).setMaxLength(inp.max ?? 200).setPlaceholder(inp.placeholder ?? '').setValue(inp.value ?? ''),
      ),
    ),
  );

const userLang = (userId) => db.user(userId).language;

/* ───────────────────────── news card buttons (n:) ───────────────────────── */

async function loadItem(i, id) {
  const item = db.item(id);
  if (!item) {
    const payloadMsg = { content: '이 소식은 보관 기간이 지나 더 이상 질문할 수 없어요. (21일 보관)', flags: EPH };
    if (i.deferred || i.replied) await i.editReply({ content: payloadMsg.content }); else await i.reply(payloadMsg);
  }
  return item;
}

async function runItemQuestion(i, item, question) {
  const lang = userLang(i.user.id);
  const u = db.user(i.user.id);
  const a = await ensureAnalysis(item, lang);
  const out = await answerPanel({
    userId: i.user.id, question, item, a,
    run: () => ask({ item, analysis: a, question, stack: u.stack, lang }),
  });
  return i.editReply(out);
}

async function handleNews(i, [, action, ...rest]) {
  if (action === 'ask') {
    await i.deferReply({ flags: EPH });
    const item = await loadItem(i, rest[0]);
    if (!item) return;
    const lang = userLang(i.user.id);
    const a = await ensureAnalysis(item, lang);
    return i.editReply(askPanel(item, a, db.user(i.user.id), lang));
  }

  if (action === 'q') {
    const [preset, id] = rest;
    if (preset === 'custom') {
      return i.showModal(modal(`n:modal:${id}`, '이 소식에 대해 질문하기', [
        { id: 'q', label: '질문', long: true, max: 500, placeholder: '예: Next.js 14 앱 라우터를 쓰는데 업데이트가 필요한가요?' },
      ]));
    }
    await i.deferReply({ flags: EPH });
    const item = await loadItem(i, id);
    if (!item) return;
    const q = presetQuestion(preset, userLang(i.user.id));
    return runItemQuestion(i, item, q);
  }

  if (action === 'save' || action === 'unsave') {
    const id = rest[0];
    const u = db.user(i.user.id);
    const has = u.saved.includes(id);
    if (action === 'unsave') {
      u.saved = u.saved.filter((x) => x !== id);
      db.save();
      return i.update(savedView(i.user.id));
    }
    if (has) u.saved = u.saved.filter((x) => x !== id);
    else {
      if (!db.item(id)) return reply(i, '보관 기간이 지난 소식이에요.');
      u.saved = [...u.saved, id].slice(-50);
    }
    db.save();
    return reply(i, has ? '🗑️ 저장을 취소했어요.' : '💾 저장했어요! `/saved` 에서 다시 볼 수 있어요. (최대 50개)');
  }

  if (action === 'sub') {
    const item = db.item(rest[0]);
    if (!item) return reply(i, '보관 기간이 지난 소식이에요.');
    const u = db.user(i.user.id);
    const options = [
      { label: `${CATEGORIES[item.category].name.ko} 카테고리`, value: `c:${item.category}`, emoji: CATEGORIES[item.category].emoji, default: u.categories.includes(item.category) },
      ...(item.tags ?? []).slice(0, 5).map((t) => ({ label: t, value: `k:${t}`, description: '키워드로 구독', emoji: '🔑', default: u.keywords.includes(t) })),
    ];
    const c = container({ color: 0x6366f1 })
      .addTextDisplayComponents(text('## 🔔 무엇을 구독할까요?\n-# 선택한 항목은 DM으로 알려 드려요. 이미 구독 중인 항목은 체크되어 있어요.'))
      .addSeparatorComponents(sep())
      .addActionRowComponents(row(select({ id: 'n:subsel', placeholder: '구독할 항목 선택', options, min: 1, max: options.length })));
    return i.reply(payload([c], { ephemeral: true }));
  }
  return undefined;
}

async function handleNewsSelect(i, parts) {
  if (parts[1] !== 'subsel') return;
  const u = db.user(i.user.id);
  const added = [];
  for (const v of i.values) {
    const [kind, val] = [v.slice(0, 1), v.slice(2)];
    if (kind === 'c' && !u.categories.includes(val)) { u.categories.push(val); added.push(`${CATEGORIES[val].emoji} ${CATEGORIES[val].name.ko}`); }
    if (kind === 'k' && !u.keywords.includes(val) && u.keywords.length < MAX_KEYWORDS) { u.keywords.push(val); added.push(`🔑 ${val}`); }
  }
  u.dm = true;
  db.save();
  return i.update(notice('🔔 구독 완료', added.length ? added.join('\n') : '이미 모두 구독 중이에요.', { color: 0x22c55e }));
}

async function handleNewsModal(i, parts) {
  if (parts[1] !== 'modal') return;
  await i.deferReply({ flags: EPH });
  const item = await loadItem(i, parts[2]);
  if (!item) return;
  return runItemQuestion(i, item, i.fields.getTextInputValue('q'));
}

/* ───────────────────────── settings panel (s:) ───────────────────────── */

async function handleSettings(i, parts) {
  const u = db.user(i.user.id);
  const [, action, arg] = parts;
  const refresh = (mode) => i.update(settingsPanel(u, mode));

  if (action === 'cats') { u.categories = [...i.values]; db.save(); return refresh(); }
  if (action === 'minp') { u.minPriority = i.values[0]; db.save(); return refresh(); }
  if (action === 'back') return refresh();

  if (action === 'tog') {
    if (arg === 'dm') u.dm = !u.dm;
    if (arg === 'daily') u.digest.daily = !u.digest.daily;
    if (arg === 'weekly') u.digest.weekly = !u.digest.weekly;
    if (arg === 'lang') u.language = u.language === 'ko' ? 'en' : 'ko';
    db.save();
    return refresh();
  }

  if (action === 'kw') {
    if (arg === 'add') {
      return i.showModal(modal('s:modal:kw', '키워드 추가', [
        { id: 'kw', label: '키워드 (쉼표로 여러 개)', placeholder: 'nextjs, react, openai', max: 200 },
        { id: 'mute', label: '뮤트할 키워드 (선택)', placeholder: 'crypto, nft', max: 200, required: false },
      ]));
    }
    if (arg === 'del') return refresh('delkw');
  }

  if (action === 'kwdel') {
    for (const v of i.values) {
      const val = v.slice(2);
      if (v.startsWith('k:')) u.keywords = u.keywords.filter((k) => k !== val);
      else u.muted = u.muted.filter((k) => k !== val);
    }
    db.save();
    return refresh(u.keywords.length || u.muted.length ? 'delkw' : 'main');
  }

  if (action === 'stack') {
    return i.showModal(modal('s:modal:stack', '내 기술 스택', [
      { id: 'stack', label: '사용 중인 기술과 버전', long: true, max: 400, required: false, value: u.stack, placeholder: 'Next.js 14.2 (app router), React 18, Node 20, Postgres 16, Docker' },
    ]));
  }
  return undefined;
}

async function handleSettingsModal(i, parts) {
  const u = db.user(i.user.id);
  if (parts[2] === 'kw') {
    for (const k of splitList(i.fields.getTextInputValue('kw'))) {
      if (u.keywords.length < MAX_KEYWORDS && !u.keywords.includes(k)) u.keywords.push(k);
      u.muted = u.muted.filter((m) => m !== k);
    }
    for (const k of splitList(i.fields.getTextInputValue('mute'))) if (!u.muted.includes(k)) u.muted.push(k);
    u.keywords = u.keywords.map(normKeyword);
    u.dm = true;
  }
  if (parts[2] === 'stack') u.stack = clip(i.fields.getTextInputValue('stack'), 400);
  db.save();
  return i.update(settingsPanel(u));
}

/* ───────────────────────── digest buttons (d:) and admin (a:) ───────────────────────── */

async function handleDigest(i, parts) {
  const [, action, arg] = parts;
  if (action === 'mine' || action === 'weekly') {
    await i.deferReply({ flags: EPH });
    return i.editReply(await userDigestPayload(i.user.id, action === 'weekly' ? 'weekly' : 'daily', { ephemeral: true }));
  }
  if (action === 'radar') {
    if (arg) {
      await i.deferUpdate();
      if (arg === 'refresh') resetRadarCache();
      return i.editReply(await radarView(i.user.id, { analyse: arg === 'ko' }));
    }
    await i.deferReply({ flags: EPH });
    return i.editReply(await radarView(i.user.id));
  }
  return undefined;
}

async function handleAdmin(i, parts) {
  if (!i.inGuild() || !i.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) return reply(i, '서버 관리 권한이 필요해요.');
  const g = db.guild(i.guildId);
  if (parts[1] === 'preview') return sendPreview(i, g);
  if (parts[1] === 'sources') return i.reply(sourcesPanel(i.guildId));
  if (parts[1] === 'digestnow') {
    if (!g.channels.digest) return reply(i, '브리핑 채널이 없어요. `/setup channel category:Daily Digest`');
    await i.deferReply({ flags: EPH });
    await sendGuildDigest(i.client, i.guildId, 'daily');
    return i.editReply({ content: `📰 <#${g.channels.digest}> 에 브리핑을 보냈어요.` });
  }
  return undefined;
}

/* ───────────────────────── entry ───────────────────────── */

export async function routeComponent(i) {
  const parts = i.customId.split(':');
  try {
    switch (parts[0]) {
      case 'n':
        if (i.isModalSubmit()) return await handleNewsModal(i, parts);
        if (i.isStringSelectMenu()) return await handleNewsSelect(i, parts);
        return await handleNews(i, parts);
      case 's':
        if (i.isModalSubmit()) return await handleSettingsModal(i, parts);
        return await handleSettings(i, parts);
      case 'd':
        return await handleDigest(i, parts);
      case 'a':
        return await handleAdmin(i, parts);
      default:
        return undefined;
    }
  } catch (e) {
    log.error(`component ${i.customId} failed:`, e);
    const msg = { content: '앗, 처리 중 오류가 났어요. 잠시 뒤 다시 시도해 주세요.', flags: EPH };
    if (i.deferred || i.replied) await i.followUp(msg).catch(() => {});
    else await i.reply(msg).catch(() => {});
  }
}

export { reply };
