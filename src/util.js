import { createHash } from 'node:crypto';

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const clip = (s, n) => {
  s = String(s ?? '').trim();
  return s.length > n ? s.slice(0, Math.max(0, n - 1)).trimEnd() + '…' : s;
};

export const sha = (s) => createHash('sha1').update(String(s)).digest('hex').slice(0, 10);

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };

export function stripHtml(html) {
  return String(html ?? '')
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, e) => {
      if (ENTITIES[e]) return ENTITIES[e];
      if (e[0] === '#') {
        const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(code) ? String.fromCodePoint(code) : m;
      }
      return m;
    })
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Markdown from GitHub release notes → lighter plain-ish text for prompts. */
export function stripMarkdownNoise(md) {
  return String(md ?? '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/https?:\/\/github\.com\/[^\s)]+\/(pull|issues)\/(\d+)/g, '#$2')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const STOP = new Set(['the', 'and', 'for', 'with', 'new', 'now', 'release', 'released', 'announcing', 'introducing', 'version']);
export const titleTokens = (title) =>
  new Set(
    String(title)
      .toLowerCase()
      .split(/[^a-z0-9가-힣.+#]+/)
      .filter((w) => w.length >= 3 && !STOP.has(w)),
  );

export function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

export async function fetchText(url, { headers = {}, timeout = 15000 } = {}) {
  const res = await fetch(url, {
    headers: { 'user-agent': 'devbot/1.0 (+discord developer news bot)', ...headers },
    signal: AbortSignal.timeout(timeout),
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} ← ${url}`);
  return res.text();
}

export async function fetchJson(url, opts) {
  return JSON.parse(await fetchText(url, { ...opts, headers: { accept: 'application/json', ...opts?.headers } }));
}

/** 'v1.2.3' → [1,2,3] or null */
export function parseSemver(tag) {
  const m = String(tag ?? '').match(/(\d+)\.(\d+)(?:\.(\d+))?/);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3] ?? 0)] : null;
}

export function semverBump(tag, prev) {
  const a = parseSemver(tag);
  const b = parseSemver(prev);
  if (!a || !b) return null;
  if (a[0] !== b[0]) return a[0] > b[0] ? 'major' : null;
  if (a[1] !== b[1]) return 'minor';
  return 'patch';
}

export const unix = (ts) => Math.floor(ts / 1000);
export const discordTime = (ts, style = 'R') => `<t:${unix(ts)}:${style}>`;

export function localParts(date, timeZone) {
  let parts;
  try {
    parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      hourCycle: 'h23',
      weekday: 'short',
    }).formatToParts(date);
  } catch {
    return localParts(date, 'Asia/Seoul');
  }
  const get = (t) => parts.find((p) => p.type === t)?.value;
  const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday'));
  return { date: `${get('year')}-${get('month')}-${get('day')}`, hour: Number(get('hour')) % 24, weekday: wd };
}

export const isValidTimeZone = (tz) => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
};

export const chunk = (arr, n) => {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
};

export async function pool(items, limit, fn) {
  const results = [];
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
  return results;
}
