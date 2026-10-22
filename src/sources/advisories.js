import { fetchJson, clip, stripMarkdownNoise } from '../util.js';
import { ghGet } from './github.js';

const SEV_PRIORITY = { critical: 'critical', high: 'high', medium: 'normal', low: 'low' };

/** Deterministic, ecosystem-aware fix command (never AI-generated). */
export function fixCommand(eco, name, version) {
  if (!version) return null;
  switch (eco) {
    case 'npm': return `npm install ${name}@${version}`;
    case 'pip': return `pip install -U "${name}>=${version}"`;
    case 'go': return `go get ${name}@v${version.replace(/^v/, '')}`;
    case 'rubygems': return `bundle update ${name}   # >= ${version}`;
    case 'nuget': return `dotnet add package ${name} --version ${version}`;
    case 'composer': return `composer require ${name}:^${version}`;
    case 'rust': return `cargo update -p ${name}   # >= ${version}`;
    case 'maven': return `# ${name} → ${version} 이상으로 pom.xml/build.gradle 수정`;
    case 'actions': return `uses: ${name}@v${version}`;
    default: return null;
  }
}

function toItem(a) {
  const packages = (a.vulnerabilities ?? [])
    .filter((v) => v.package)
    .slice(0, 6)
    .map((v) => ({
      eco: v.package.ecosystem,
      name: v.package.name,
      range: v.vulnerable_version_range ?? null,
      patched: v.first_patched_version ?? null,
    }));
  const malware = a.type === 'malware';
  return {
    id: `ghsa:${a.ghsa_id}`,
    sourceId: 'adv:github',
    sourceName: malware ? 'GitHub Malware Advisory' : 'GitHub Security Advisory',
    category: 'security',
    title: clip(a.summary, 160),
    url: a.html_url,
    body: clip(stripMarkdownNoise(a.description ?? ''), 3500),
    ts: Date.parse(a.published_at),
    meta: {
      ghsa: a.ghsa_id,
      cve: a.cve_id ?? null,
      severity: a.severity,
      cvss: a.cvss?.score ?? null,
      cwes: (a.cwes ?? []).map((c) => c.cwe_id).slice(0, 3),
      packages,
      malware,
    },
    hints: { priority: malware ? 'high' : (SEV_PRIORITY[a.severity] ?? 'normal'), breaking: false },
  };
}

export async function fetchAdvisories() {
  const queries = [
    'type=reviewed&severity=critical',
    'type=reviewed&severity=high',
    'type=malware',
  ];
  const out = [];
  for (const q of queries) {
    const { body } = await ghGet(`https://api.github.com/advisories?${q}&per_page=15&sort=published&direction=desc`);
    out.push(...JSON.parse(body).map(toItem));
  }
  return out;
}

/** CISA Known Exploited Vulnerabilities — "being exploited in the wild". */
export async function fetchKev() {
  const data = await fetchJson('https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json', { timeout: 30000 });
  const cutoff = Date.now() - 10 * 86_400_000;
  return (data.vulnerabilities ?? [])
    .filter((v) => Date.parse(v.dateAdded) >= cutoff)
    .map((v) => ({
      id: `kev:${v.cveID}`,
      sourceId: 'kev:cisa',
      sourceName: 'CISA KEV',
      category: 'security',
      title: `${v.cveID} — ${v.vendorProject} ${v.product}: ${clip(v.vulnerabilityName, 100)}`,
      url: `https://nvd.nist.gov/vuln/detail/${v.cveID}`,
      body: clip(`${v.shortDescription}\nRequired action: ${v.requiredAction}\nDue: ${v.dueDate}`, 1500),
      ts: Date.parse(v.dateAdded) + 12 * 3600_000,
      meta: {
        cve: v.cveID,
        severity: 'critical',
        exploited: true,
        vendor: v.vendorProject,
        product: v.product,
        due: v.dueDate,
        ransomware: v.knownRansomwareCampaignUse === 'Known',
        packages: [],
      },
      hints: { priority: 'critical', breaking: false },
    }));
}
