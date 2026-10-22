import { config } from './config.js';
import { db } from './db.js';
import { log } from './log.js';
import { analyze } from './ai.js';
import { prioRank } from './constants.js';
import { listJobs } from './sources/index.js';
import { fetchReadme } from './sources/github.js';
import { buildNewsCard } from './ui/news.js';
import { userMatch } from './matching.js';
import { text } from './ui/kit.js';
import { jaccard, pool, sha, sleep, titleTokens } from './util.js';

const H = 3600_000;
let running = false;

/** Analysis in one language, cached on the stored item. */
export async function ensureAnalysis(item, lang) {
  item.analysis ??= {};
  if (item.analysis[lang]) return item.analysis[lang];
  const extra = item.category === 'trending' ? (item.readme ?? '') : '';
  const a = await analyze(item, lang, extra);
  item.analysis[lang] = a;
  db.putItem(item);
  return a;
}

function finalPriority(raw, a) {
  if (raw.category === 'security') return raw.hints.priority;
  return a?.priority ?? raw.hints.priority;
}

/** Cheap pre-check so we don't spend AI calls on stories nobody would receive. */
function anyInterest(client, item) {
  const cats = [item.category, ...(item.breaking ? ['breaking'] : [])];
  for (const guild of client.guilds.cache.values()) {
    if (!db.hasGuild(guild.id) || (item.guildId && item.guildId !== guild.id)) continue;
    const g = db.guild(guild.id);
    if (cats.some((c) => g.enabled[c] && g.channels[c])) return true;
  }
  return Object.values(db.data.users).some((u) => u.dm && (u.keywords?.length || u.categories?.some((c) => cats.includes(c))));
}

/** Which guild channels should get this item? */
export function routesFor(client, item) {
  const routes = [];
  for (const guild of client.guilds.cache.values()) {
    if (!db.hasGuild(guild.id)) continue;
    if (item.guildId && item.guildId !== guild.id) continue;
    const g = db.guild(guild.id);
    if (!item.guildId && g.sources.disabled.includes(item.sourceId)) continue;

    const targets = [item.category];
    if (item.breaking && item.category !== 'breaking') targets.push('breaking');

    const seenChannels = new Set();
    for (const cat of targets) {
      const channelId = g.channels[cat];
      if (!g.enabled[cat] || !channelId || seenChannels.has(channelId)) continue;
      if (prioRank(item.priority) < prioRank(g.minPriority[cat])) continue;
      if (cat === 'security' && g.ecosystems.length && item.meta?.packages?.length) {
        if (!item.meta.packages.some((p) => g.ecosystems.includes(p.eco))) continue;
      }
      if (item.category === 'trending' && (item.meta?.stars ?? 0) < g.trendingMinStars) continue;
      seenChannels.add(channelId);
      routes.push({ guildId: guild.id, channelId, cat });
    }
  }
  return routes;
}

async function postToGuild(client, item, route, counters) {
  const g = db.guild(route.guildId);
  if ((counters[route.guildId] ?? 0) >= g.maxPerCycle) return;
  const channel = await client.channels.fetch(route.channelId).catch(() => null);
  if (!channel?.isSendable?.()) return;

  const a = await ensureAnalysis(item, g.language);
  const role = g.roles[route.cat] ?? (route.cat === 'breaking' ? g.roles[item.category] : null);
  const ping = role && prioRank(item.priority) >= prioRank(g.pingMinPriority) ? role : null;

  const card = buildNewsCard(item, a, {
    lang: g.language, style: g.style, colors: g.colors, rolePing: ping, askButtons: g.askButtons,
  });
  try {
    const msg = await channel.send(card);
    counters[route.guildId] = (counters[route.guildId] ?? 0) + 1;
    item.posted ??= {};
    item.posted[`${route.guildId}:${route.cat}`] = { channelId: channel.id, messageId: msg.id };
    if (g.threads && prioRank(item.priority) >= prioRank('high') && msg.startThread) {
      await msg.startThread({ name: `💬 ${a.title}`.slice(0, 90), autoArchiveDuration: 1440 }).catch(() => {});
    }
  } catch (e) {
    log.warn(`post failed in ${route.guildId}/${route.channelId}: ${e.message}`);
  }
}

async function notifyUsers(client, item) {
  for (const [userId, u] of Object.entries(db.data.users)) {
    const hit = userMatch(db.user(userId), item);
    if (!hit) continue;
    try {
      const user = await client.users.fetch(userId);
      const a = await ensureAnalysis(item, u.language);
      const card = buildNewsCard(item, a, {
        lang: u.language, style: 'rich', dm: true, saved: u.saved.includes(item.id), askButtons: true,
      });
      if (hit.reason === 'keyword') {
        card.components.splice(0, 0, text(`-# 🔑 ${hit.hits.map((h) => `\`${h}\``).join(' ')}`));
      }
      await user.send(card);
      u.dmFailures = 0;
      await sleep(400);
    } catch (e) {
      u.dmFailures = (u.dmFailures ?? 0) + 1;
      if (u.dmFailures >= 3) {
        u.dm = false;
        log.warn(`disabled DMs for ${userId} (3 failures)`);
      }
    }
  }
  db.save();
}

/** Collapse near-duplicate stories reported by several sources. */
function dedupe(candidates) {
  const recent = db.recentItems(48 * H);
  const kept = [];
  const pool = recent.map((i) => ({ item: i, tokens: titleTokens(i.title) }));
  for (const raw of candidates) {
    if (raw.category === 'security' || raw.sourceId.startsWith('gh:')) {
      kept.push(raw);
      continue;
    }
    const tk = titleTokens(raw.title);
    const twin = pool.find((p) => p.item.sourceId !== raw.sourceId && jaccard(tk, p.tokens) >= 0.7);
    if (twin) {
      twin.item.alsoBy ??= [];
      if (!twin.item.alsoBy.some((x) => x.sourceId === raw.sourceId)) twin.item.alsoBy.push({ sourceId: raw.sourceId, sourceName: raw.sourceName, url: raw.url });
      db.markSeen(raw.id);
      continue;
    }
    pool.push({ item: raw, tokens: tk });
    kept.push(raw);
  }
  return kept;
}

export async function collect() {
  const jobs = listJobs();
  const now = Date.now();
  const maxAge = config.maxAgeHours * H;
  const fresh = [];

  await pool(jobs, 5, async (job) => {
    const st = db.sourceState(`${job.guildId ?? ''}${job.id}`);
    if (job.everyMs && now - st.lastRun < job.everyMs) return;
    if (st.fails >= 4 && now - st.lastRun < Math.min(6, st.fails) * H / 2) return; // backoff
    st.lastRun = now;
    try {
      const items = await job.run();
      st.fails = 0;
      st.lastOk = now;
      st.lastError = null;
      if (!st.seeded) {
        // First run of a source: remember what exists, post nothing (avoids a flood).
        for (const it of items) db.markSeen(it.id);
        st.seeded = true;
        return;
      }
      for (const it of items) {
        if (db.isSeen(it.id) || now - it.ts > maxAge) continue;
        if (job.guildId) it.guildId = job.guildId;
        fresh.push(it);
      }
    } catch (e) {
      st.fails++;
      st.lastError = e.message;
      log.warn(`source ${job.id} failed (${st.fails}): ${e.message}`);
    }
  });
  db.save();
  return fresh;
}

/** One full cycle: fetch → dedupe → analyse → post → DM. */
export async function pollOnce(client) {
  if (running) return;
  running = true;
  try {
    let fresh = await collect();
    if (!fresh.length) return;
    fresh = dedupe(fresh);
    fresh.sort((a, b) => prioRank(b.hints.priority) - prioRank(a.hints.priority) || b.ts - a.ts);

    const batch = fresh.slice(0, config.maxPerCycle);
    const counters = {};
    log.info(`${fresh.length} new items, processing ${batch.length}`);

    const langs = () => new Set(Object.values(db.data.guilds).map((g) => g.language ?? 'ko'));

    const toItem = (raw) => ({
      ...raw,
      id: sha(raw.id),
      rawId: raw.id,
      breaking: Boolean(raw.hints.breaking),
      priority: raw.hints.priority,
      firstSeen: Date.now(),
    });

    for (const raw of batch) {
      const item = toItem(raw);
      db.markSeen(raw.id);

      if (!anyInterest(client, item)) {
        db.putItem(item); // kept (unanalysed) so digests and /news can still list it
        continue;
      }
      if (item.category === 'trending') item.readme = await fetchReadme(item.meta.repo);

      const a = await ensureAnalysis(item, [...langs()][0] ?? 'ko');
      item.priority = finalPriority(raw, a);
      item.breaking = item.breaking || a.breaking;
      item.tags = a.tags;
      db.putItem(item);

      for (const route of routesFor(client, item)) await postToGuild(client, item, route, counters);
      db.putItem(item);
      await notifyUsers(client, item);
      await sleep(600);
    }
    for (const raw of fresh.slice(config.maxPerCycle)) {
      // Beyond the per-cycle cap: still recorded for digests, just not posted.
      db.markSeen(raw.id);
      db.putItem(toItem(raw));
    }
  } catch (e) {
    log.error('poll cycle failed:', e);
  } finally {
    running = false;
    db.save();
  }
}
