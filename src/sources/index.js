import { db } from '../db.js';
import { config } from '../config.js';
import { fetchReleases, fetchTrending } from './github.js';
import { fetchAdvisories, fetchKev } from './advisories.js';
import { fetchFeed } from './rss.js';

const H = 3600_000;

const RELEASES = {
  ai: [
    ['anthropics/claude-code', 'Claude Code'],
    ['anthropics/anthropic-sdk-typescript', 'Anthropic SDK (TS)'],
    ['anthropics/anthropic-sdk-python', 'Anthropic SDK (Python)'],
    ['openai/openai-node', 'OpenAI SDK (Node)'],
    ['openai/openai-python', 'OpenAI SDK (Python)'],
    ['huggingface/transformers', 'Transformers'],
    ['ollama/ollama', 'Ollama'],
  ],
  dev: [
    ['facebook/react', 'React'], ['vercel/next.js', 'Next.js'], ['microsoft/TypeScript', 'TypeScript'],
    ['nodejs/node', 'Node.js'], ['vitejs/vite', 'Vite'], ['denoland/deno', 'Deno'], ['oven-sh/bun', 'Bun'],
    ['sveltejs/svelte', 'Svelte'], ['vuejs/core', 'Vue'], ['angular/angular', 'Angular'],
    ['tailwindlabs/tailwindcss', 'Tailwind CSS'], ['prisma/prisma', 'Prisma'], ['remix-run/react-router', 'React Router'],
    ['nestjs/nest', 'NestJS'], ['rust-lang/rust', 'Rust'], ['astral-sh/uv', 'uv'], ['biomejs/biome', 'Biome'],
    ['vitest-dev/vitest', 'Vitest'], ['facebook/react-native', 'React Native'], ['expo/expo', 'Expo'],
  ],
};

const FEEDS = [
  { id: 'rss:openai', name: 'OpenAI', url: 'https://openai.com/news/rss.xml', category: 'ai' },
  { id: 'rss:huggingface', name: 'Hugging Face Blog', url: 'https://huggingface.co/blog/feed.xml', category: 'ai' },
  { id: 'rss:deepmind', name: 'Google DeepMind', url: 'https://deepmind.google/blog/rss.xml', category: 'ai' },
  { id: 'rss:github-changelog', name: 'GitHub Changelog', url: 'https://github.blog/changelog/feed/', category: 'dev' },
  { id: 'rss:vercel', name: 'Vercel Changelog', url: 'https://vercel.com/atom', category: 'dev' },
  { id: 'rss:node-security', name: 'Node.js Security', url: 'https://nodejs.org/en/feed/vulnerability.xml', category: 'security' },
];

/** Built-in sources, visible in /setup sources so admins can toggle them. */
export const DEFAULT_SOURCES = [
  ...Object.entries(RELEASES).flatMap(([category, list]) =>
    list.map(([repo, name]) => ({
      id: `gh:${repo}`, name, category, kind: 'release',
      run: () => fetchReleases(repo, category, name),
    })),
  ),
  ...FEEDS.map((f) => ({ ...f, kind: 'rss', run: () => fetchFeed(f) })),
  { id: 'adv:github', name: 'GitHub Security Advisories', category: 'security', kind: 'advisory', run: fetchAdvisories },
  { id: 'kev:cisa', name: 'CISA KEV (actively exploited)', category: 'security', kind: 'advisory', run: fetchKev },
  {
    id: 'trend:github', name: 'GitHub Trending', category: 'trending', kind: 'trending', everyMs: config.trendingHours * H,
    run: () => fetchTrending(Math.min(...Object.values(db.data.guilds).map((g) => g.trendingMinStars ?? 150), 150)),
  },
];

export const sourceById = (id) => DEFAULT_SOURCES.find((s) => s.id === id);

/** Re-key items so a guild's custom source never collides with a default one. */
const scoped = async (guildId, sourceId, promise) =>
  (await promise).map((i) => ({ ...i, id: `${guildId}:${i.id}`, sourceId }));

/** Default jobs plus every guild's custom feeds/repos (deduped by id). */
export function listJobs() {
  const jobs = new Map(DEFAULT_SOURCES.map((s) => [s.id, s]));
  for (const [guildId, g] of Object.entries(db.data.guilds)) {
    for (const f of g.sources?.rss ?? []) {
      jobs.set(`${guildId}:${f.id}`, {
        id: f.id, name: f.name, category: f.category, kind: 'rss', guildId,
        run: () => scoped(guildId, f.id, fetchFeed(f)),
      });
    }
    for (const r of g.sources?.repos ?? []) {
      jobs.set(`${guildId}:${r.id}`, {
        id: r.id, name: r.repo, category: r.category, kind: 'release', guildId,
        run: () => scoped(guildId, r.id, fetchReleases(r.repo, r.category, r.repo)),
      });
    }
  }
  return [...jobs.values()];
}

/** All source ids a guild can see (for autocomplete and toggles). */
export function guildSourceList(guildId) {
  const g = db.guild(guildId);
  return [
    ...DEFAULT_SOURCES.map((s) => ({ id: s.id, name: s.name, category: s.category, custom: false, enabled: !g.sources.disabled.includes(s.id) })),
    ...g.sources.rss.map((f) => ({ id: f.id, name: f.name, category: f.category, custom: true, enabled: true })),
    ...g.sources.repos.map((r) => ({ id: r.id, name: r.repo, category: r.category, custom: true, enabled: true })),
  ];
}
