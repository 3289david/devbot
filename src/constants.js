export const CATEGORIES = {
  ai: { emoji: '🤖', color: 0x7c5cff, name: { ko: 'AI & LLM', en: 'AI & LLM' }, desc: { ko: '모델 출시, 벤치마크, API 업데이트', en: 'Model launches, benchmarks, API updates' } },
  dev: { emoji: '🛠️', color: 0x3b82f6, name: { ko: 'Dev Updates', en: 'Dev Updates' }, desc: { ko: '언어·라이브러리·프레임워크 릴리스', en: 'Language, library and framework releases' } },
  trending: { emoji: '📡', color: 0x22c55e, name: { ko: 'GitHub Trending', en: 'GitHub Trending' }, desc: { ko: '신규 오픈소스, 인기 저장소', en: 'New and popular open source' } },
  security: { emoji: '🛡️', color: 0xef4444, name: { ko: 'Security Alerts', en: 'Security Alerts' }, desc: { ko: 'CVE, 취약점, 패치, 악성 패키지', en: 'CVEs, vulnerabilities, patches, malicious packages' } },
  breaking: { emoji: '💥', color: 0xf59e0b, name: { ko: 'Breaking Changes', en: 'Breaking Changes' }, desc: { ko: '지원 종료, 호환성 파괴, 마이그레이션', en: 'Deprecations, incompatibilities, migrations' } },
  digest: { emoji: '📰', color: 0x64748b, name: { ko: 'Daily Digest', en: 'Daily Digest' }, desc: { ko: '하루·한 주의 주요 뉴스 요약', en: 'Daily and weekly briefings' } },
};

/** Categories a news item can belong to (digest is a channel only). */
export const NEWS_CATEGORIES = ['ai', 'dev', 'trending', 'security', 'breaking'];
export const CHANNEL_CATEGORIES = [...NEWS_CATEGORIES, 'digest'];

export const PRIORITIES = ['low', 'normal', 'high', 'critical'];
export const PRIORITY = {
  low: { emoji: '⚪', rank: 0, ko: '낮음', en: 'Low' },
  normal: { emoji: '🔵', rank: 1, ko: '보통', en: 'Normal' },
  high: { emoji: '🟠', rank: 2, ko: '높은 우선순위', en: 'High priority' },
  critical: { emoji: '🔴', rank: 3, ko: '긴급', en: 'Critical' },
};
export const prioRank = (p) => PRIORITY[p]?.rank ?? 1;

export const WEEKDAYS = [
  { name: '일요일', value: 0 }, { name: '월요일', value: 1 }, { name: '화요일', value: 2 },
  { name: '수요일', value: 3 }, { name: '목요일', value: 4 }, { name: '금요일', value: 5 }, { name: '토요일', value: 6 },
];

/** Popular techs surfaced in /subscribe and /keywords autocomplete. */
export const TECHS = [
  'react', 'nextjs', 'typescript', 'javascript', 'nodejs', 'deno', 'bun', 'vue', 'svelte', 'angular', 'vite', 'tailwind',
  'python', 'django', 'fastapi', 'rust', 'go', 'java', 'spring', 'kotlin', 'swift', 'flutter', 'react-native',
  'docker', 'kubernetes', 'terraform', 'aws', 'vercel', 'cloudflare', 'postgres', 'mysql', 'redis', 'prisma', 'supabase',
  'openai', 'claude', 'gemini', 'llm', 'rag', 'langchain', 'ollama', 'transformers', 'pytorch', 'mcp',
  'npm', 'pip', 'log4j', 'openssl', 'nginx', 'linux', 'github-actions',
];

export const ECOSYSTEMS = ['npm', 'pip', 'go', 'maven', 'rubygems', 'nuget', 'composer', 'rust', 'actions', 'pub', 'swift', 'erlang'];

export const TIMEZONES = [
  'Asia/Seoul', 'Asia/Tokyo', 'Asia/Shanghai', 'Asia/Singapore', 'Asia/Kolkata', 'UTC', 'Europe/London', 'Europe/Berlin',
  'Europe/Paris', 'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'Australia/Sydney',
];
