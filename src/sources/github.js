import { config } from '../config.js';
import { db } from '../db.js';
import { fetchText, semverBump, stripMarkdownNoise, clip } from '../util.js';

const API = 'https://api.github.com';

export function ghHeaders(extra = {}) {
  return {
    accept: 'application/vnd.github+json',
    'x-github-api-version': '2022-11-28',
    ...(config.githubToken ? { authorization: `Bearer ${config.githubToken}` } : {}),
    ...extra,
  };
}

/** GET with ETag caching — a 304 doesn't count against GitHub's rate limit. */
const etags = new Map();
export async function ghGet(url, { raw = false } = {}) {
  const cached = etags.get(url);
  const res = await fetch(url, {
    headers: ghHeaders({
      'user-agent': 'devbot/1.0',
      ...(raw ? { accept: 'application/vnd.github.raw+json' } : {}),
      ...(cached ? { 'if-none-match': cached.etag } : {}),
    }),
    signal: AbortSignal.timeout(20000),
  });
  if (res.status === 304 && cached) return { notModified: true, body: cached.body };
  if (!res.ok) {
    const remaining = res.headers.get('x-ratelimit-remaining');
    throw new Error(`${res.status} ${res.statusText}${remaining === '0' ? ' (rate limited — set GITHUB_TOKEN)' : ''} ← ${url}`);
  }
  const body = await res.text();
  const etag = res.headers.get('etag');
  if (etag) etags.set(url, { etag, body });
  return { notModified: false, body };
}

export const BREAKING_RE =
  /breaking[ -]change|\bBREAKING\b|backwards?[ -]incompatible|\bdeprecat|\bremoved?\b.*\b(api|support)\b|drop(s|ped)? support|end[ -]of[ -]life|\bEOL\b|migration guide|sunset/i;

/** Latest stable releases for a repo. */
export async function fetchReleases(repo, category, name) {
  const { body } = await ghGet(`${API}/repos/${repo}/releases?per_page=6`);
  const list = JSON.parse(body).filter((r) => !r.draft && !r.prerelease);
  return list.slice(0, 3).map((r, i) => {
    const prev = list[i + 1]?.tag_name;
    const bump = semverBump(r.tag_name, prev);
    const notes = stripMarkdownNoise(r.body ?? '');
    const breaking = bump === 'major' || BREAKING_RE.test(notes);
    const label = r.name && r.name !== r.tag_name ? ` — ${clip(r.name, 80)}` : '';
    return {
      id: `gh:${repo}:${r.tag_name}`,
      sourceId: `gh:${repo}`,
      sourceName: name ?? repo,
      category,
      title: `${repo.split('/')[1]} ${r.tag_name}${label}`,
      url: r.html_url,
      body: clip(notes, 4500),
      ts: Date.parse(r.published_at ?? r.created_at),
      meta: { repo, tag: r.tag_name, prevTag: prev ?? null, bump, avatar: r.author?.avatar_url ?? null },
      hints: { priority: bump === 'major' ? 'high' : breaking ? 'high' : 'normal', breaking },
    };
  });
}

/** Newly created, fast-rising repositories. */
export async function fetchTrending(minStars = 100) {
  const since = new Date(Date.now() - 10 * 86_400_000).toISOString().slice(0, 10);
  const q = encodeURIComponent(`created:>${since} stars:>${minStars}`);
  const { body } = await ghGet(`${API}/search/repositories?q=${q}&sort=stars&order=desc&per_page=20`);
  const repos = JSON.parse(body).items ?? [];
  const now = Date.now();

  return repos
    .filter((r) => !r.fork && !r.archived)
    .map((r) => {
      const ageDays = Math.max(0.5, (now - Date.parse(r.created_at)) / 86_400_000);
      const perDay = Math.round(r.stargazers_count / ageDays);
      const snap = db.data.stars[r.full_name];
      const gained = snap ? r.stargazers_count - snap.stars : null;
      db.data.stars[r.full_name] = { stars: r.stargazers_count, ts: now };
      return {
        id: `trend:${r.full_name}`,
        sourceId: 'trend:github',
        sourceName: 'GitHub Trending',
        category: 'trending',
        title: `${r.full_name} — ${clip(r.description ?? 'New repository', 100)}`,
        url: r.html_url,
        body: clip(r.description ?? '', 400),
        ts: now,
        meta: {
          repo: r.full_name,
          stars: r.stargazers_count,
          starsPerDay: perDay,
          starsGained: gained,
          language: r.language,
          license: r.license?.spdx_id && r.license.spdx_id !== 'NOASSERTION' ? r.license.spdx_id : null,
          topics: (r.topics ?? []).slice(0, 6),
          avatar: r.owner?.avatar_url ?? null,
          createdAt: r.created_at,
          forks: r.forks_count,
        },
        hints: { priority: perDay >= 600 ? 'high' : 'normal', breaking: false },
      };
    });
}

/** README excerpt used for analysis (install steps, purpose). */
export async function fetchReadme(repo) {
  try {
    const { body } = await ghGet(`${API}/repos/${repo}/readme`, { raw: true });
    return clip(stripMarkdownNoise(body), 4500);
  } catch {
    return '';
  }
}

export { fetchText };
