import { XMLParser } from 'fast-xml-parser';
import { fetchText, stripHtml, clip, sha } from '../util.js';

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', textNodeName: '#text', processEntities: true });

const arr = (x) => (x === undefined ? [] : Array.isArray(x) ? x : [x]);
const text = (x) => (x && typeof x === 'object' ? (x['#text'] ?? '') : (x ?? ''));

function atomLink(links) {
  const list = arr(links);
  const alt = list.find((l) => !l['@_rel'] || l['@_rel'] === 'alternate') ?? list[0];
  return alt?.['@_href'] ?? text(alt);
}

/** Parses RSS 2.0 and Atom into raw news items. */
export async function fetchFeed({ id, name, url, category }) {
  const xml = await fetchText(url, { headers: { accept: 'application/rss+xml, application/atom+xml, text/xml, */*' } });
  const doc = parser.parse(xml);
  const entries = doc.rss ? arr(doc.rss.channel?.item) : arr(doc.feed?.entry);

  return entries.slice(0, 10).map((e) => {
    const link = doc.rss ? text(e.link) : atomLink(e.link);
    const body = stripHtml(text(e['content:encoded']) || text(e.content) || text(e.description) || text(e.summary));
    const date = Date.parse(text(e.pubDate) || text(e.published) || text(e.updated) || text(e['dc:date'])) || Date.now();
    const title = stripHtml(text(e.title));
    return {
      id: `rss:${id}:${sha(text(e.guid) || text(e.id) || link || title)}`,
      sourceId: id,
      sourceName: name,
      category,
      title: clip(title, 180),
      url: link,
      body: clip(body, 4000),
      ts: date,
      meta: { feed: url },
      hints: { priority: 'normal', breaking: false },
    };
  }).filter((i) => i.title && i.url);
}
