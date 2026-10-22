/** Sample items for /setup preview — clearly labelled as examples, never stored or posted. */
const now = () => Date.now();

const base = { ts: now(), alsoBy: [], posted: {} };

export function sampleCards(lang = 'ko') {
  const ko = lang === 'ko';
  return [
    {
      item: {
        ...base, id: 'sample-sec', category: 'security', sourceId: 'sample', sourceName: ko ? '공식 보안 공지' : 'Official advisory',
        title: 'Remote code execution in example-lib', url: 'https://example.com/advisory', priority: 'critical', breaking: false,
        meta: { cve: 'CVE-0000-0000', severity: 'critical', cvss: 9.8, exploited: true, packages: [{ eco: 'npm', name: 'example-lib', range: '< 4.17.21', patched: '4.17.21' }] },
      },
      a: {
        title: ko ? '새로운 라이브러리 취약점이 공개되었습니다' : 'A new library vulnerability was disclosed',
        summary: ko
          ? ['example-lib 4.17.21 미만에서 원격 코드 실행이 가능해요.', '실제 공격 시도가 확인되었어요.', '4.17.21에서 수정되었습니다.']
          : ['Remote code execution in example-lib < 4.17.21.', 'Exploitation attempts have been observed.', 'Fixed in 4.17.21.'],
        who: ko ? 'example-lib 4.17.21 미만을 사용하는 프로젝트' : 'Projects on example-lib < 4.17.21',
        impact: ko ? '신뢰할 수 없는 입력을 처리하는 서버가 공격에 노출될 수 있어요.' : 'Servers handling untrusted input can be compromised.',
        risk: ko ? '원격 공격 가능성 — 인터넷에 노출된 서비스는 우선 확인' : 'Remote exploitation — prioritise internet-facing services',
        action: ko ? '영향 버전 확인 후 수정 버전으로 업데이트' : 'Check your version, then upgrade to the fixed release',
        code_change: 'none', urgency: 'now', priority: 'critical', breaking: false, tags: ['npm', 'example-lib'], ai: true,
      },
    },
    {
      item: {
        ...base, id: 'sample-dev', category: 'dev', sourceId: 'sample', sourceName: 'Example Framework',
        title: 'Example Framework v5.0.0', url: 'https://example.com/release', priority: 'high', breaking: true,
        meta: { repo: 'example/framework', tag: 'v5.0.0', prevTag: 'v4.9.2', bump: 'major' },
      },
      a: {
        title: ko ? 'Example Framework 5.0 출시 — 마이그레이션 필요' : 'Example Framework 5.0 — migration required',
        summary: ko
          ? ['기본 번들러가 교체되고 Node 18 지원이 종료돼요.', '`legacyRouter` 옵션이 제거되었습니다.', '공식 codemod가 제공돼요.']
          : ['The default bundler changed and Node 18 support ended.', 'The `legacyRouter` option was removed.', 'An official codemod is available.'],
        who: ko ? 'Node 18 또는 legacyRouter를 쓰는 프로젝트' : 'Projects on Node 18 or using legacyRouter',
        impact: ko ? '업그레이드 시 빌드 설정과 라우팅 코드를 손봐야 해요.' : 'Upgrading requires build config and routing changes.',
        risk: null,
        action: ko ? 'codemod 실행 후 테스트 → 스테이징에서 먼저 업그레이드' : 'Run the codemod, test, then upgrade staging first',
        code_change: 'required', urgency: 'soon', priority: 'high', breaking: true, tags: ['framework'], ai: true,
      },
    },
    {
      item: {
        ...base, id: 'sample-trend', category: 'trending', sourceId: 'sample', sourceName: 'GitHub Trending',
        title: 'octo/awesome-tool', url: 'https://github.com/octocat/Hello-World', priority: 'normal', breaking: false,
        meta: { repo: 'octo/awesome-tool', stars: 12840, starsPerDay: 1830, language: 'TypeScript', license: 'MIT', topics: ['cli', 'devtools', 'ai'], avatar: 'https://avatars.githubusercontent.com/u/583231?v=4' },
      },
      a: {
        title: 'octo/awesome-tool',
        summary: ko ? ['터미널에서 코드베이스를 질의하는 CLI예요.', '출시 일주일 만에 별 1만 개를 넘겼어요.'] : ['A CLI to query your codebase from the terminal.', 'Passed 10k stars within a week.'],
        who: null, impact: ko ? '로컬 우선(local-first) 구조라 사내 코드에도 쓰기 좋아요.' : 'Local-first, suitable for private code.', risk: null, action: null,
        code_change: 'none', urgency: 'none', priority: 'normal', breaking: false, tags: ['cli'],
        purpose: ko ? '코드베이스를 자연어로 검색·질의하는 도구' : 'Search and query a codebase in natural language', install: 'npm install -g awesome-tool', ai: true,
      },
    },
  ].map((s) => ({ ...s, sample: true }));
}
