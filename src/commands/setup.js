import { ChannelType, InteractionContextType, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { CATEGORIES, ECOSYSTEMS, TIMEZONES, WEEKDAYS } from '../constants.js';
import { db } from '../db.js';
import { aiEnabled } from '../ai.js';
import { sampleCards } from '../samples.js';
import { guildSourceList } from '../sources/index.js';
import { fetchFeed } from '../sources/rss.js';
import { fetchReleases } from '../sources/github.js';
import { buildNewsCard } from '../ui/news.js';
import { setupOverview, sourcesPanel } from '../ui/panels.js';
import { notice, payload, container, text, sep } from '../ui/kit.js';
import { sendGuildDigest } from '../digests.js';
import { isValidTimeZone, sha } from '../util.js';
import { catChoices, channelCatChoices, prioChoices, say, sayEdit, splitList } from './_shared.js';
import { PRIORITY } from '../constants.js';

const textChannels = [ChannelType.GuildText, ChannelType.GuildAnnouncement];
const cat = (sc, { digest = false, name = 'category', desc = '카테고리' } = {}) =>
  sc.addStringOption((o) => o.setName(name).setDescription(desc).setRequired(true).addChoices(...(digest ? channelCatChoices() : catChoices())));

const data = new SlashCommandBuilder()
  .setName('setup')
  .setDescription('서버의 뉴스 채널·브리핑·소스를 설정해요 (관리자)')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .setContexts(InteractionContextType.Guild)
  .addSubcommand((sc) =>
    cat(sc, { digest: true, desc: '뉴스 종류' })
      .setName('channel').setDescription('카테고리별 뉴스 채널을 지정해요')
      .addChannelOption((o) => o.setName('channel').setDescription('뉴스를 올릴 채널').addChannelTypes(...textChannels).setRequired(true)))
  .addSubcommand((sc) =>
    cat(sc).setName('toggle').setDescription('카테고리를 켜거나 꺼요')
      .addBooleanOption((o) => o.setName('enabled').setDescription('켜짐 여부').setRequired(true)))
  .addSubcommand((sc) =>
    cat(sc).setName('role').setDescription('긴급 소식에 핑할 역할을 지정해요 (비우면 해제)')
      .addRoleOption((o) => o.setName('role').setDescription('핑할 역할')))
  .addSubcommand((sc) =>
    cat(sc).setName('priority').setDescription('카테고리별 최소 우선순위 (이보다 낮은 소식은 채널에 안 올라가요)')
      .addStringOption((o) => o.setName('min').setDescription('최소 우선순위').setRequired(true).addChoices(...prioChoices())))
  .addSubcommand((sc) =>
    sc.setName('ping-priority').setDescription('역할 핑을 보낼 최소 우선순위')
      .addStringOption((o) => o.setName('min').setDescription('최소 우선순위').setRequired(true).addChoices(...prioChoices())))
  .addSubcommand((sc) =>
    sc.setName('language').setDescription('뉴스 카드 언어')
      .addStringOption((o) => o.setName('lang').setDescription('언어').setRequired(true).addChoices({ name: '한국어', value: 'ko' }, { name: 'English', value: 'en' })))
  .addSubcommand((sc) =>
    sc.setName('style').setDescription('카드 스타일')
      .addStringOption((o) => o.setName('style').setDescription('스타일').setRequired(true).addChoices({ name: '풍부한 카드 (요약·영향·조치 전부)', value: 'rich' }, { name: '컴팩트 (핵심만)', value: 'compact' })))
  .addSubcommand((sc) =>
    cat(sc).setName('color').setDescription('카테고리 카드의 강조 색상')
      .addStringOption((o) => o.setName('hex').setDescription('#RRGGBB 또는 reset').setRequired(true)))
  .addSubcommand((sc) =>
    sc.setName('threads').setDescription('높은 우선순위 소식에 토론 스레드 자동 생성')
      .addBooleanOption((o) => o.setName('enabled').setDescription('켜짐 여부').setRequired(true)))
  .addSubcommand((sc) =>
    sc.setName('ai-buttons').setDescription('카드의 "AI에게 질문" 버튼 표시')
      .addBooleanOption((o) => o.setName('enabled').setDescription('켜짐 여부').setRequired(true)))
  .addSubcommand((sc) =>
    sc.setName('ecosystems').setDescription('보안 알림을 받을 패키지 생태계 (예: npm, pip / all)')
      .addStringOption((o) => o.setName('list').setDescription(`쉼표로 구분: ${ECOSYSTEMS.join(', ')} · all = 전체`).setRequired(true)))
  .addSubcommand((sc) =>
    sc.setName('trending-min-stars').setDescription('GitHub 트렌딩 최소 별 개수')
      .addIntegerOption((o) => o.setName('stars').setDescription('최소 별').setMinValue(10).setMaxValue(50000).setRequired(true)))
  .addSubcommand((sc) =>
    sc.setName('digest-schedule').setDescription('데일리·위클리 브리핑 일정')
      .addIntegerOption((o) => o.setName('hour').setDescription('보낼 시각 (0-23)').setMinValue(0).setMaxValue(23))
      .addStringOption((o) => o.setName('weekday').setDescription('위클리 요일').addChoices(...WEEKDAYS.map((w) => ({ name: w.name, value: String(w.value) }))))
      .addStringOption((o) => o.setName('timezone').setDescription('시간대 (예: Asia/Seoul)').setAutocomplete(true))
      .addBooleanOption((o) => o.setName('daily').setDescription('데일리 브리핑'))
      .addBooleanOption((o) => o.setName('weekly').setDescription('위클리 브리핑'))
      .addIntegerOption((o) => o.setName('max-items').setDescription('섹션당 최대 항목').setMinValue(3).setMaxValue(15)))
  .addSubcommand((sc) =>
    sc.setName('source-add-rss').setDescription('RSS/Atom 피드를 이 서버 전용 소스로 추가')
      .addStringOption((o) => o.setName('name').setDescription('표시 이름').setRequired(true).setMaxLength(40))
      .addStringOption((o) => o.setName('url').setDescription('피드 URL').setRequired(true))
      .addStringOption((o) => o.setName('category').setDescription('카테고리').setRequired(true).addChoices(...catChoices(['ai', 'dev', 'security']))))
  .addSubcommand((sc) =>
    sc.setName('source-add-repo').setDescription('GitHub 저장소의 릴리스를 추적 (owner/name)')
      .addStringOption((o) => o.setName('repo').setDescription('예: vercel/next.js').setRequired(true))
      .addStringOption((o) => o.setName('category').setDescription('카테고리').setRequired(true).addChoices(...catChoices(['ai', 'dev', 'security']))))
  .addSubcommand((sc) =>
    sc.setName('source-remove').setDescription('추가했던 커스텀 소스를 삭제')
      .addStringOption((o) => o.setName('source').setDescription('소스').setRequired(true).setAutocomplete(true)))
  .addSubcommand((sc) =>
    sc.setName('source-toggle').setDescription('기본 소스를 이 서버에서 끄거나 켜요')
      .addStringOption((o) => o.setName('source').setDescription('소스').setRequired(true).setAutocomplete(true))
      .addBooleanOption((o) => o.setName('enabled').setDescription('켜짐 여부').setRequired(true)))
  .addSubcommand((sc) => sc.setName('sources').setDescription('사용 중인 소스 목록'))
  .addSubcommand((sc) => sc.setName('view').setDescription('현재 설정 전체 보기'))
  .addSubcommand((sc) => sc.setName('preview').setDescription('현재 스타일로 예시 카드 미리보기'))
  .addSubcommand((sc) => sc.setName('status').setDescription('봇 상태 · 소스 상태 점검'))
  .addSubcommand((sc) =>
    sc.setName('reset').setDescription('이 서버의 모든 설정을 초기화')
      .addBooleanOption((o) => o.setName('confirm').setDescription('true로 설정해야 실행돼요').setRequired(true)));

function permWarnings(guild, channel) {
  const need = [['ViewChannel', '채널 보기'], ['SendMessages', '메시지 보내기'], ['CreatePublicThreads', '스레드 만들기(선택)']];
  const perms = channel.permissionsFor(guild.members.me);
  return need.filter(([f]) => f !== 'CreatePublicThreads' && !perms?.has(PermissionFlagsBits[f])).map(([, label]) => label);
}

export async function sendPreview(interaction, g) {
  for (const s of sampleCards(g.language)) {
    const card = buildNewsCard(s.item, s.a, { lang: g.language, style: g.style, colors: g.colors, sample: true, askButtons: g.askButtons, rolePing: null });
    card.flags |= MessageFlags.Ephemeral;
    if (!interaction.replied && !interaction.deferred) await interaction.reply(card);
    else await interaction.followUp(card);
  }
}

async function execute(interaction) {
  const g = db.guild(interaction.guildId);
  const sub = interaction.options.getSubcommand();
  const o = interaction.options;
  const done = (msg) => { db.save(); return say(interaction, msg); };

  switch (sub) {
    case 'channel': {
      const k = o.getString('category');
      const ch = o.getChannel('channel');
      g.channels[k] = ch.id;
      const warn = permWarnings(interaction.guild, ch);
      return done(`${CATEGORIES[k].emoji} **${CATEGORIES[k].name.ko}** → ${ch}${warn.length ? `\n⚠️ 봇에게 필요한 권한이 없어요: ${warn.join(', ')}` : ''}`);
    }
    case 'toggle': {
      const k = o.getString('category');
      if (k === 'digest') return say(interaction, '브리핑은 `/setup digest-schedule` 로 켜고 꺼 주세요.');
      g.enabled[k] = o.getBoolean('enabled');
      return done(`${CATEGORIES[k].emoji} **${CATEGORIES[k].name.ko}** ${g.enabled[k] ? '🟢 켬' : '⚫ 끔'}`);
    }
    case 'role': {
      const k = o.getString('category');
      const role = o.getRole('role');
      g.roles[k] = role?.id ?? null;
      return done(role ? `${CATEGORIES[k].emoji} 긴급 소식은 ${role} 를 핑해요 (기준: ${PRIORITY[g.pingMinPriority].ko} 이상 · \`/setup ping-priority\`).` : `${CATEGORIES[k].emoji} 역할 핑을 해제했어요.`);
    }
    case 'priority': {
      const k = o.getString('category');
      g.minPriority[k] = o.getString('min');
      return done(`${CATEGORIES[k].emoji} 최소 우선순위 → ${PRIORITY[g.minPriority[k]].emoji} **${PRIORITY[g.minPriority[k]].ko}**`);
    }
    case 'ping-priority':
      g.pingMinPriority = o.getString('min');
      return done(`🚨 역할 핑 기준 → ${PRIORITY[g.pingMinPriority].emoji} **${PRIORITY[g.pingMinPriority].ko}** 이상`);
    case 'language':
      g.language = o.getString('lang');
      return done(`🌐 카드 언어 → **${g.language === 'ko' ? '한국어' : 'English'}**`);
    case 'style':
      g.style = o.getString('style');
      return done(`🎨 스타일 → **${g.style === 'rich' ? '풍부한 카드' : '컴팩트'}** (\`/setup preview\` 로 확인)`);
    case 'color': {
      const k = o.getString('category');
      const hex = o.getString('hex').trim();
      if (hex.toLowerCase() === 'reset') {
        delete g.colors[k];
        return done(`🎨 ${CATEGORIES[k].name.ko} 색상을 기본값으로 되돌렸어요.`);
      }
      const m = hex.match(/^#?([0-9a-f]{6})$/i);
      if (!m) return say(interaction, '`#RRGGBB` 형식이거나 `reset` 이어야 해요. 예: `#7c5cff`');
      g.colors[k] = parseInt(m[1], 16);
      return done(`🎨 ${CATEGORIES[k].name.ko} 강조 색상 → \`#${m[1].toLowerCase()}\``);
    }
    case 'threads':
      g.threads = o.getBoolean('enabled');
      return done(`🧵 스레드 자동 생성 ${g.threads ? '🟢 켬 (높은 우선순위 이상)' : '⚫ 끔'}`);
    case 'ai-buttons':
      g.askButtons = o.getBoolean('enabled');
      return done(`🤖 "AI에게 질문" 버튼 ${g.askButtons ? '🟢 표시' : '⚫ 숨김'}`);
    case 'ecosystems': {
      const raw = splitList(o.getString('list'));
      if (raw.includes('all')) {
        g.ecosystems = [];
        return done('📦 모든 생태계의 보안 알림을 받아요.');
      }
      const bad = raw.filter((e) => !ECOSYSTEMS.includes(e));
      if (bad.length) return say(interaction, `알 수 없는 생태계: ${bad.join(', ')}\n사용 가능: ${ECOSYSTEMS.join(', ')}`);
      g.ecosystems = [...new Set(raw)];
      return done(`📦 보안 알림 생태계 → ${g.ecosystems.map((e) => `\`${e}\``).join(' ')}`);
    }
    case 'trending-min-stars':
      g.trendingMinStars = o.getInteger('stars');
      return done(`⭐ 트렌딩 최소 별 → **${g.trendingMinStars.toLocaleString()}**`);
    case 'digest-schedule': {
      const tz = o.getString('timezone');
      if (tz && !isValidTimeZone(tz)) return say(interaction, `알 수 없는 시간대예요: \`${tz}\` (예: Asia/Seoul)`);
      const hour = o.getInteger('hour'); const wd = o.getString('weekday');
      const daily = o.getBoolean('daily'); const weekly = o.getBoolean('weekly'); const mx = o.getInteger('max-items');
      if ([tz, hour, wd, daily, weekly, mx].every((v) => v === null)) return say(interaction, '바꿀 옵션을 하나 이상 지정해 주세요.');
      if (tz) g.digest.tz = tz;
      if (hour !== null) g.digest.hour = hour;
      if (wd !== null) g.digest.weekday = Number(wd);
      if (daily !== null) g.digest.daily = daily;
      if (weekly !== null) g.digest.weekly = weekly;
      if (mx !== null) g.digest.maxItems = mx;
      const warn = g.channels.digest ? '' : '\n⚠️ 브리핑 채널이 아직 없어요 → `/setup channel category:Daily Digest`';
      return done(`📰 브리핑: 매일 **${String(g.digest.hour).padStart(2, '0')}:00** (${g.digest.tz}) · 일간 ${g.digest.daily ? '🟢' : '⚫'} · 주간(${WEEKDAYS[g.digest.weekday].name}) ${g.digest.weekly ? '🟢' : '⚫'}${warn}`);
    }
    case 'source-add-rss': {
      if (g.sources.rss.length >= 10) return say(interaction, '커스텀 RSS는 서버당 10개까지예요.');
      const url = o.getString('url').trim();
      if (!/^https?:\/\//i.test(url)) return say(interaction, 'URL은 http(s)로 시작해야 해요.');
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const feed = { id: `custom:rss:${sha(url)}`, name: o.getString('name'), url, category: o.getString('category') };
      if (g.sources.rss.some((f) => f.url === url)) return sayEdit(interaction, '이미 추가된 피드예요.');
      try {
        const items = await fetchFeed(feed);
        if (!items.length) throw new Error('항목이 없어요');
      } catch (e) {
        return sayEdit(interaction, `❌ 피드를 읽지 못했어요: ${e.message}`);
      }
      g.sources.rss.push(feed);
      db.save();
      return sayEdit(interaction, `✅ **${feed.name}** 추가! 다음 수집부터 ${CATEGORIES[feed.category].emoji} ${CATEGORIES[feed.category].name.ko} 채널로 올라가요.`);
    }
    case 'source-add-repo': {
      if (g.sources.repos.length >= 15) return say(interaction, '커스텀 저장소는 서버당 15개까지예요.');
      const repo = o.getString('repo').trim().replace(/^https?:\/\/github\.com\//i, '').replace(/\/$/, '');
      if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) return say(interaction, '`owner/name` 형식이어야 해요. 예: `vercel/next.js`');
      if (g.sources.repos.some((r) => r.repo.toLowerCase() === repo.toLowerCase())) return say(interaction, '이미 추가된 저장소예요.');
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const category = o.getString('category');
      try {
        await fetchReleases(repo, category, repo);
      } catch (e) {
        return sayEdit(interaction, `❌ 저장소를 확인하지 못했어요: ${e.message}`);
      }
      g.sources.repos.push({ id: `custom:gh:${repo}`, repo, category });
      db.save();
      return sayEdit(interaction, `✅ **${repo}** 릴리스를 추적해요 → ${CATEGORIES[category].emoji} ${CATEGORIES[category].name.ko}`);
    }
    case 'source-remove': {
      const id = o.getString('source');
      const before = g.sources.rss.length + g.sources.repos.length;
      g.sources.rss = g.sources.rss.filter((f) => f.id !== id);
      g.sources.repos = g.sources.repos.filter((r) => r.id !== id);
      if (before === g.sources.rss.length + g.sources.repos.length) return say(interaction, '삭제할 커스텀 소스를 찾지 못했어요. 기본 소스는 `source-toggle` 로 꺼 주세요.');
      return done('🗑️ 소스를 삭제했어요.');
    }
    case 'source-toggle': {
      const id = o.getString('source');
      if (!guildSourceList(interaction.guildId).some((s) => s.id === id && !s.custom)) return say(interaction, '기본 소스만 켜고 끌 수 있어요.');
      const on = o.getBoolean('enabled');
      g.sources.disabled = on ? g.sources.disabled.filter((x) => x !== id) : [...new Set([...g.sources.disabled, id])];
      return done(`📡 \`${id}\` ${on ? '🟢 켬' : '⚫ 끔'}`);
    }
    case 'sources':
      return interaction.reply(sourcesPanel(interaction.guildId));
    case 'view':
      return interaction.reply(setupOverview(g, interaction.guild.name));
    case 'preview':
      return sendPreview(interaction, g);
    case 'status': {
      const states = Object.entries(db.data.sources);
      const bad = states.filter(([, s]) => s.fails > 0);
      const last = Math.max(0, ...states.map(([, s]) => s.lastOk));
      const c = container({ color: 0x14b8a6 }).addTextDisplayComponents(
        text([
          '## 🩺 DevBot 상태',
          `**AI 분석** ${aiEnabled ? '🟢 사용 중' : '⚫ 꺼짐 — 규칙 기반 요약으로 동작해요'}`,
          `**수집 소스** ${states.length}개 · 마지막 성공 ${last ? `<t:${Math.floor(last / 1000)}:R>` : '—'}`,
          `**저장된 소식** ${Object.keys(db.data.items).length}건 · **사용자** ${Object.keys(db.data.users).length}명`,
          bad.length ? `\n**⚠️ 문제 있는 소스**\n${bad.slice(0, 8).map(([id, s]) => `• \`${id}\` ×${s.fails} — ${String(s.lastError).slice(0, 80)}`).join('\n')}` : '**소스 상태** 🟢 모두 정상',
        ].join('\n')),
      );
      return interaction.reply(payload([c], { ephemeral: true }));
    }
    case 'reset':
      if (!o.getBoolean('confirm')) return say(interaction, '취소했어요. 초기화하려면 `confirm: true` 로 실행하세요.');
      db.resetGuild(interaction.guildId);
      return say(interaction, '♻️ 서버 설정을 초기화했어요.');
  }
}

async function autocomplete(interaction) {
  const f = interaction.options.getFocused(true);
  const q = String(f.value).toLowerCase();
  if (f.name === 'timezone') {
    return interaction.respond(TIMEZONES.filter((z) => z.toLowerCase().includes(q)).slice(0, 25).map((z) => ({ name: z, value: z })));
  }
  if (f.name === 'source') {
    const sub = interaction.options.getSubcommand();
    const list = guildSourceList(interaction.guildId).filter((s) => (sub === 'source-remove' ? s.custom : !s.custom));
    return interaction.respond(
      list.filter((s) => s.name.toLowerCase().includes(q) || s.id.toLowerCase().includes(q))
        .slice(0, 25)
        .map((s) => ({ name: `${s.enabled ? '🟢' : '⚫'} ${s.name}`.slice(0, 100), value: s.id.slice(0, 100) })),
    );
  }
}

export default { data, execute, autocomplete };
