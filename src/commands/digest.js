import { SlashCommandBuilder } from 'discord.js';
import { WEEKDAYS, TIMEZONES } from '../constants.js';
import { db } from '../db.js';
import { userDigestPayload } from '../digests.js';
import { isValidTimeZone } from '../util.js';
import { say } from './_shared.js';

export default {
  data: new SlashCommandBuilder()
    .setName('digest')
    .setDescription('내 맞춤 개발 브리핑')
    .addSubcommand((sc) =>
      sc.setName('now').setDescription('지금 내 브리핑 보기')
        .addStringOption((o) => o.setName('range').setDescription('범위').addChoices({ name: '오늘 (24시간)', value: 'daily' }, { name: '이번 주 (7일)', value: 'weekly' })))
    .addSubcommand((sc) =>
      sc.setName('schedule').setDescription('DM으로 받을 정기 브리핑 설정')
        .addBooleanOption((o) => o.setName('daily').setDescription('매일 브리핑'))
        .addBooleanOption((o) => o.setName('weekly').setDescription('주간 브리핑'))
        .addIntegerOption((o) => o.setName('hour').setDescription('받을 시각 (0-23)').setMinValue(0).setMaxValue(23))
        .addStringOption((o) => o.setName('weekday').setDescription('주간 브리핑 요일').addChoices(...WEEKDAYS.map((w) => ({ name: w.name, value: String(w.value) }))))
        .addStringOption((o) => o.setName('timezone').setDescription('시간대 (예: Asia/Seoul)').setAutocomplete(true))),

  async execute(interaction) {
    const u = db.user(interaction.user.id);
    if (interaction.options.getSubcommand() === 'now') {
      await interaction.deferReply({ flags: 64 });
      const kind = interaction.options.getString('range') ?? 'daily';
      return interaction.editReply(await userDigestPayload(interaction.user.id, kind, { ephemeral: true }));
    }

    const o = interaction.options;
    const tz = o.getString('timezone');
    if (tz && !isValidTimeZone(tz)) return say(interaction, `알 수 없는 시간대예요: \`${tz}\``);
    const [daily, weekly, hour, wd] = [o.getBoolean('daily'), o.getBoolean('weekly'), o.getInteger('hour'), o.getString('weekday')];
    if ([daily, weekly, hour, wd, tz].every((v) => v === null)) return say(interaction, '바꿀 옵션을 하나 이상 골라 주세요.');
    if (daily !== null) u.digest.daily = daily;
    if (weekly !== null) u.digest.weekly = weekly;
    if (hour !== null) u.digest.hour = hour;
    if (wd !== null) u.digest.weekday = Number(wd);
    if (tz) u.digest.tz = tz;
    db.save();
    const on = (b) => (b ? '🟢' : '⚫');
    return say(interaction, [
      `📰 일간 ${on(u.digest.daily)} · 주간(${WEEKDAYS[u.digest.weekday].name}) ${on(u.digest.weekly)} · **${String(u.digest.hour).padStart(2, '0')}:00** (${u.digest.tz})`,
      u.categories.length || u.keywords.length ? '' : '-# 구독한 카테고리·키워드가 없어서 높은 우선순위 소식만 보내 드려요. `/subscribe` 로 맞춰 보세요.',
      '-# DM을 받으려면 서버 개인정보 설정에서 "다이렉트 메시지"를 허용해 주세요.',
    ].filter(Boolean).join('\n'));
  },

  autocomplete(interaction) {
    const q = String(interaction.options.getFocused()).toLowerCase();
    return interaction.respond(TIMEZONES.filter((z) => z.toLowerCase().includes(q)).slice(0, 25).map((z) => ({ name: z, value: z })));
  },
};
