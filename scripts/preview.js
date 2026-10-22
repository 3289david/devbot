// Renders sample cards through discord.js builders (which validate Components V2 structure)
// and prints their size. Run: npm run preview
import { sampleCards } from '../src/samples.js';
import { buildNewsCard } from '../src/ui/news.js';
import { buildDigest } from '../src/ui/digest.js';
import { settingsPanel, setupOverview, helpPanel, askPanel, answerCard, savedPanel, radarPanel } from '../src/ui/panels.js';
import { db } from '../src/db.js';

const count = (c) => 1 + (c.components?.reduce((n, x) => n + count(x), 0) ?? 0) + (c.accessory ? 1 : 0);
const textLen = (c) => (c.content?.length ?? 0) + (c.components?.reduce((n, x) => n + textLen(x), 0) ?? 0) + (c.accessory?.type === 2 ? 0 : 0);

function check(name, p) {
  const json = p.components.map((c) => c.toJSON());
  const total = json.reduce((n, c) => n + count(c), 0);
  const chars = json.reduce((n, c) => n + textLen(c), 0);
  const ok = total <= 40 && chars <= 4000;
  console.log(`${ok ? 'OK ' : 'BAD'} ${name.padEnd(28)} components=${String(total).padStart(2)}  chars=${chars}`);
  if (!ok) process.exitCode = 1;
  return json;
}

for (const lang of ['ko', 'en']) {
  for (const style of ['rich', 'compact']) {
    for (const { item, a } of sampleCards(lang)) {
      check(`card ${item.category} ${lang}/${style}`, buildNewsCard(item, a, { lang, style, sample: true, rolePing: item.category === 'security' ? '123456789012345678' : null }));
    }
  }
}

const items = sampleCards('ko').map(({ item, a }) => ({ ...item, analysis: { ko: a } }));
check('digest daily', buildDigest(items, { kind: 'daily', lead: '샘플 리드 문장입니다.' }));
check('digest weekly', buildDigest([...items, ...items.map((i) => ({ ...i, id: i.id + 'x' }))], { kind: 'weekly' }));
check('digest empty', buildDigest([], { kind: 'daily' }));

const u = db.user('preview');
u.categories = ['ai', 'security'];
u.keywords = ['nextjs', 'react', 'go'];
u.muted = ['crypto'];
u.stack = 'Next.js 14, React 18, Node 20, Postgres';
check('settings main', settingsPanel(u));
check('settings delkw', settingsPanel(u, 'delkw'));
check('setup overview', setupOverview(db.guild('preview'), 'My Server'));
check('help', helpPanel());
const first = sampleCards('ko')[0];
check('ask panel', askPanel(first.item, first.a, u, 'ko'));
check('answer card', answerCard(first.item, first.a, '내 프로젝트에 영향 있어?', '답변 예시\n```js\nconsole.log(1)\n```', 'ko'));
check('saved', savedPanel(items.map((i) => ({ ...i })), 'ko'));
check('radar', radarPanel([{ item: sampleCards('ko')[2].item, analysis: sampleCards('ko')[2].a }], 'ko', 'TypeScript · 7일'));

delete db.data.users.preview;
delete db.data.guilds.preview;
process.exit(process.exitCode ?? 0);
