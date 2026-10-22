import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { log } from './log.js';

const DAY = 86_400_000;

const GUILD_DEFAULTS = {
  channels: { ai: null, dev: null, trending: null, security: null, breaking: null, digest: null },
  enabled: { ai: true, dev: true, trending: true, security: true, breaking: true },
  roles: { ai: null, dev: null, trending: null, security: null, breaking: null },
  pingMinPriority: 'critical',
  minPriority: { ai: 'low', dev: 'low', trending: 'low', security: 'high', breaking: 'low' },
  colors: {},
  language: 'ko',
  style: 'rich', // rich | compact
  threads: false,
  askButtons: true,
  maxPerCycle: 10,
  ecosystems: [],
  trendingMinStars: 150,
  digest: { daily: true, weekly: true, hour: 9, weekday: 6, tz: 'Asia/Seoul', maxItems: 8 },
  sources: { disabled: [], rss: [], repos: [] },
};

const USER_DEFAULTS = {
  categories: [],
  keywords: [],
  muted: [],
  stack: '',
  dm: true,
  minPriority: 'high',
  language: 'ko',
  digest: { daily: false, weekly: false, hour: 9, weekday: 6, tz: 'Asia/Seoul' },
  saved: [],
  ask: { date: '', count: 0 },
  dmFailures: 0,
};

function fill(target, defaults) {
  for (const [k, v] of Object.entries(defaults)) {
    if (target[k] === undefined) target[k] = structuredClone(v);
    else if (v && typeof v === 'object' && !Array.isArray(v) && target[k] && typeof target[k] === 'object') fill(target[k], v);
  }
  return target;
}

class Store {
  constructor(dir) {
    this.dir = dir;
    this.file = path.join(dir, 'devbot.json');
    this.data = { guilds: {}, users: {}, items: {}, seen: {}, sources: {}, sent: {}, stars: {}, meta: {} };
    this.timer = null;
    this.load();
  }

  load() {
    fs.mkdirSync(this.dir, { recursive: true });
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      this.data = { ...this.data, ...raw };
    } catch (e) {
      if (e.code !== 'ENOENT') log.warn('db load failed, starting fresh:', e.message);
    }
  }

  /** Debounced atomic write. */
  save() {
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.flush();
    }, 1500);
    this.timer.unref?.();
  }

  flush() {
    try {
      const tmp = this.file + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(this.data));
      fs.renameSync(tmp, this.file);
    } catch (e) {
      log.error('db save failed:', e.message);
    }
  }

  guild(id) {
    const g = (this.data.guilds[id] ??= {});
    return fill(g, GUILD_DEFAULTS);
  }
  hasGuild(id) {
    return Boolean(this.data.guilds[id]);
  }
  resetGuild(id) {
    this.data.guilds[id] = {};
    this.save();
    return this.guild(id);
  }

  user(id) {
    const u = (this.data.users[id] ??= {});
    return fill(u, USER_DEFAULTS);
  }

  item(id) {
    return this.data.items[id] ?? null;
  }
  putItem(item) {
    this.data.items[item.id] = item;
    this.save();
  }
  recentItems(sinceMs, filter) {
    const cutoff = Date.now() - sinceMs;
    return Object.values(this.data.items).filter((i) => i.ts >= cutoff && (!filter || filter(i)));
  }

  isSeen(key) {
    return key in this.data.seen;
  }
  markSeen(key) {
    this.data.seen[key] = Date.now();
    this.save();
  }

  sourceState(id) {
    return (this.data.sources[id] ??= { seeded: false, lastRun: 0, lastOk: 0, fails: 0, lastError: null });
  }

  wasSent(key) {
    return key in this.data.sent;
  }
  markSent(key) {
    this.data.sent[key] = Date.now();
    this.save();
  }

  prune() {
    const now = Date.now();
    for (const [k, t] of Object.entries(this.data.seen)) if (now - t > 30 * DAY) delete this.data.seen[k];
    for (const [k, t] of Object.entries(this.data.sent)) if (now - t > 14 * DAY) delete this.data.sent[k];
    for (const [k, i] of Object.entries(this.data.items)) {
      if (now - i.ts > 21 * DAY && !this.isSaved(k)) delete this.data.items[k];
    }
    for (const [k, s] of Object.entries(this.data.stars)) if (now - s.ts > 30 * DAY) delete this.data.stars[k];
    this.save();
  }

  isSaved(itemId) {
    return Object.values(this.data.users).some((u) => u.saved?.includes(itemId));
  }
}

export const db = new Store(config.dataDir);

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    db.flush();
    process.exit(0);
  });
}
process.on('exit', () => db.flush());
