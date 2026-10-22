import { db } from './db.js';
import { log } from './log.js';
import { briefingLead } from './ai.js';
import { prioRank } from './constants.js';
import { inUserScope } from './matching.js';
import { buildDigest } from './ui/digest.js';
import { localParts, sleep } from './util.js';

const DAY = 86_400_000;
export const windowMs = (kind) => (kind === 'weekly' ? 7 * DAY : DAY);

export function guildItems(guildId, kind) {
  const g = db.guild(guildId);
  return db.recentItems(windowMs(kind), (i) => {
    if (i.guildId && i.guildId !== guildId) return false;
    if (!i.guildId && g.sources.disabled.includes(i.sourceId)) return false;
    const cat = i.category;
    if (!g.enabled[cat]) return false;
    if (prioRank(i.priority) < prioRank(g.minPriority[cat])) return false;
    if (cat === 'security' && g.ecosystems.length && i.meta?.packages?.length && !i.meta.packages.some((p) => g.ecosystems.includes(p.eco))) return false;
    if (cat === 'trending' && (i.meta?.stars ?? 0) < g.trendingMinStars) return false;
    return true;
  });
}

export function userItems(userId, kind) {
  const u = db.user(userId);
  return db.recentItems(windowMs(kind), (i) => !i.guildId && inUserScope(u, i));
}

export async function guildDigestPayload(guildId, kind) {
  const g = db.guild(guildId);
  const items = guildItems(guildId, kind);
  const lead = kind === 'weekly' ? await briefingLead(items, g.language, kind) : null;
  return buildDigest(items, { lang: g.language, kind, lead, sinceTs: Date.now(), limit: g.digest.maxItems });
}

export async function userDigestPayload(userId, kind, { ephemeral = false } = {}) {
  const u = db.user(userId);
  const items = userItems(userId, kind);
  const heading = u.language === 'ko' ? (kind === 'weekly' ? '내 주간 브리핑' : '내 맞춤 브리핑') : kind === 'weekly' ? 'My weekly briefing' : 'My briefing';
  const lead = kind === 'weekly' ? await briefingLead(items, u.language, kind) : null;
  return buildDigest(items, { lang: u.language, kind, heading, lead, sinceTs: Date.now(), ephemeral, limit: 6 });
}

export async function sendGuildDigest(client, guildId, kind) {
  const g = db.guild(guildId);
  if (!g.channels.digest) return false;
  const channel = await client.channels.fetch(g.channels.digest).catch(() => null);
  if (!channel?.isSendable?.()) return false;
  await channel.send(await guildDigestPayload(guildId, kind));
  return true;
}

async function sendUserDigest(client, userId, kind) {
  try {
    const user = await client.users.fetch(userId);
    await user.send(await userDigestPayload(userId, kind));
  } catch (e) {
    log.warn(`digest DM to ${userId} failed: ${e.message}`);
  }
}

/** Runs every minute; each (target, local date, kind) is sent at most once, even across restarts. */
export async function digestTick(client) {
  const now = new Date();

  for (const guild of client.guilds.cache.values()) {
    if (!db.hasGuild(guild.id)) continue;
    const g = db.guild(guild.id);
    if (!g.channels.digest) continue;
    const p = localParts(now, g.digest.tz);
    if (p.hour !== g.digest.hour) continue;

    const weekly = g.digest.weekly && p.weekday === g.digest.weekday;
    const kind = weekly ? 'weekly' : g.digest.daily ? 'daily' : null;
    if (!kind) continue;
    const key = `g:${guild.id}:${kind}:${p.date}`;
    if (db.wasSent(key)) continue;
    db.markSent(key);
    try {
      await sendGuildDigest(client, guild.id, kind);
    } catch (e) {
      log.warn(`guild digest failed ${guild.id}: ${e.message}`);
    }
  }

  for (const userId of Object.keys(db.data.users)) {
    const u = db.user(userId);
    if (!u.digest.daily && !u.digest.weekly) continue;
    const p = localParts(now, u.digest.tz);
    if (p.hour !== u.digest.hour) continue;
    const weekly = u.digest.weekly && p.weekday === u.digest.weekday;
    const kind = weekly ? 'weekly' : u.digest.daily ? 'daily' : null;
    if (!kind) continue;
    const key = `u:${userId}:${kind}:${p.date}`;
    if (db.wasSent(key)) continue;
    db.markSent(key);
    await sendUserDigest(client, userId, kind);
    await sleep(500);
  }
}
