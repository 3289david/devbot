import { config } from './config.js';
import { db } from './db.js';
import { ask, aiEnabled, PRESETS } from './ai.js';
import { answerCard } from './ui/panels.js';
import { notice } from './ui/kit.js';
import { S } from './ui/strings.js';

const lastAsk = new Map();
const COOLDOWN_MS = 6000;

/** Per-user cooldown + daily cap to keep AI cost predictable. */
export function checkQuota(userId) {
  if (!aiEnabled) return { ok: false, msg: S('ko').noAi };
  const u = db.user(userId);
  const today = new Date().toISOString().slice(0, 10);
  if (u.ask.date !== today) u.ask = { date: today, count: 0 };
  if (u.ask.count >= config.askDailyLimit) return { ok: false, msg: `오늘 질문 한도(${config.askDailyLimit}회)를 모두 썼어요. 내일 다시 만나요!` };
  const wait = COOLDOWN_MS - (Date.now() - (lastAsk.get(userId) ?? 0));
  if (wait > 0) return { ok: false, msg: `잠깐만요! ${Math.ceil(wait / 1000)}초 뒤에 다시 질문해 주세요.` };
  return { ok: true };
}

function consume(userId) {
  lastAsk.set(userId, Date.now());
  db.user(userId).ask.count++;
  db.save();
}

export const presetQuestion = (key, lang) => PRESETS[key]?.[lang] ?? PRESETS.impact[lang];

/**
 * Returns a ready-to-send payload (answer card or an error notice).
 * `run` performs the AI call; for item questions pass { item, a }.
 */
export async function answerPanel({ userId, question, item = null, a = null, general = false, run }) {
  const quota = checkQuota(userId);
  if (!quota.ok) return notice('🤖 잠시만요', quota.msg);
  consume(userId);
  const u = db.user(userId);
  try {
    const answer = await run();
    if (!answer) return notice('🤖 답변 실패', '모델이 답변을 만들지 못했어요. 잠시 뒤 다시 시도해 주세요.');
    return answerCard(general ? null : item, a, question, answer, u.language);
  } catch (e) {
    u.ask.count = Math.max(0, u.ask.count - 1);
    return notice('🤖 답변 실패', `AI 호출 중 오류가 났어요: ${String(e.message).slice(0, 150)}`);
  }
}

export { ask };
