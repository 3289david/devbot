const num = (v, d) => (v !== undefined && v !== '' && !Number.isNaN(Number(v)) ? Number(v) : d);

export const config = {
  token: process.env.DISCORD_TOKEN,
  clientId: process.env.DISCORD_CLIENT_ID,
  devGuildId: process.env.DEV_GUILD_ID || null,

  aiApiKey: process.env.AI_API_KEY || null,
  aiBaseUrl: (process.env.AI_BASE_URL || 'https://monken.cloud/v1').replace(/\/+$/, ''),
  analysisModel: process.env.AI_ANALYSIS_MODEL || 'claude-haiku-5-5',
  askModel: process.env.AI_ASK_MODEL || 'claude-sonnet-5-5',
  askDailyLimit: num(process.env.ASK_DAILY_LIMIT, 30),

  githubToken: process.env.GITHUB_TOKEN || null,

  pollMinutes: num(process.env.POLL_MINUTES, 15),
  trendingHours: num(process.env.TRENDING_HOURS, 6),
  maxPerCycle: num(process.env.MAX_ITEMS_PER_CYCLE, 12),
  maxAgeHours: num(process.env.MAX_AGE_HOURS, 36),

  dataDir: process.env.DATA_DIR || './data',
};
