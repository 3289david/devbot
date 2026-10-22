import { prioRank } from './constants.js';

const norm = (s) => String(s).toLowerCase().replace(/[.\-_\s/]/g, '');

function haystack(item, lang) {
  const a = item.analysis?.[lang] ?? item.analysis?.ko ?? item.analysis?.en ?? {};
  const pk = (item.meta?.packages ?? []).map((p) => p.name).join(' ');
  return [item.title, a.title, (a.tags ?? []).join(' '), item.meta?.repo, pk, item.meta?.vendor, item.meta?.product, (item.meta?.topics ?? []).join(' '), a.summary?.[0]]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

/** Short keywords ("go", "ai") need word boundaries; longer ones match loosely ("nextjs" ≈ "Next.js"). */
export function matchKeyword(hay, kw) {
  const k = kw.toLowerCase();
  if (k.length <= 3) return new RegExp(`(^|[^a-z0-9])${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9]|$)`).test(hay);
  return hay.includes(k) || norm(hay).includes(norm(k));
}

export function keywordHits(item, keywords, lang = 'ko') {
  const hay = haystack(item, lang);
  return keywords.filter((k) => matchKeyword(hay, k));
}

/** Should this user be notified about this item? Returns a reason or null. */
export function userMatch(user, item) {
  if (!user.dm) return null;
  const hay = haystack(item, user.language);
  if (user.muted.some((m) => matchKeyword(hay, m))) return null;

  const hits = user.keywords.filter((k) => matchKeyword(hay, k));
  if (hits.length) return { reason: 'keyword', hits };

  if (user.categories.includes(item.category) || (item.breaking && user.categories.includes('breaking'))) {
    if (prioRank(item.priority) >= prioRank(user.minPriority)) return { reason: 'category', hits: [] };
  }
  return null;
}

/** For digests: does the item belong in this user's personalised briefing? */
export function inUserScope(user, item) {
  const hay = haystack(item, user.language);
  if (user.muted.some((m) => matchKeyword(hay, m))) return false;
  if (!user.categories.length && !user.keywords.length) return prioRank(item.priority) >= prioRank('high');
  if (user.keywords.some((k) => matchKeyword(hay, k))) return true;
  return user.categories.includes(item.category) || (item.breaking && user.categories.includes('breaking'));
}
