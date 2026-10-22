// End-to-end dry run with a fake Discord client: fetches real sources, analyses (AI if key set),
// routes to a fake guild and prints what would be posted. Nothing touches Discord. Run: npm run poll:dry
import { db } from '../src/db.js';
import { listJobs } from '../src/sources/index.js';
import { pollOnce } from '../src/pipeline.js';
import { guildDigestPayload, userDigestPayload } from '../src/digests.js';

const sent = [];
const channel = (name) => ({
  id: name, isSendable: () => true,
  send: async (p) => { sent.push({ name, json: p.components.map((c) => c.toJSON()) }); return { id: `m${sent.length}`, startThread: async () => {} }; },
});
const channels = { ai: channel('ai'), dev: channel('dev'), trending: channel('trending'), security: channel('security'), breaking: channel('breaking') };
const client = {
  guilds: { cache: new Map([['G1', { id: 'G1' }]]) },
  channels: { fetch: async (id) => channels[id] },
  users: { fetch: async () => ({ send: async (p) => { sent.push({ name: 'DM', json: p.components.map((c) => c.toJSON()) }); } }) },
};

const g = db.guild('G1');
for (const k of Object.keys(channels)) g.channels[k] = k;
g.minPriority.security = 'critical';
const u = db.user('U1');
u.keywords = ['react', 'openai']; u.categories = ['security']; u.minPriority = 'critical';

for (const j of listJobs()) db.sourceState(j.id).seeded = true; // pretend we've run before
await pollOnce(client);

const flat = (c) => [c.content, ...(c.components ?? []).map(flat), c.accessory ? flat(c.accessory) : ''].filter(Boolean).join(' | ');
console.log(`\n=== ${sent.length} messages ===`);
for (const m of sent.slice(0, 8)) console.log(`[#${m.name}]`, flat({ components: m.json }).slice(0, 350).replace(/\n/g, ' ⏎ '), '\n');

const d = await guildDigestPayload('G1', 'daily');
const w = await userDigestPayload('U1', 'weekly');
d.components.forEach((c) => c.toJSON()); w.components.forEach((c) => c.toJSON());
console.log('digests build OK; stored items:', Object.keys(db.data.items).length);
process.exit(0);
