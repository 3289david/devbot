# DevBot — 개발자 뉴스 봇 (Discord · Components V2)

뉴스를 전달하는 봇이 아니라, **개발자가 다음에 무엇을 해야 하는지** 알려 주는 봇.
모든 메시지는 Discord **Components V2**(Container · Section · Separator · Thumbnail)로 렌더링돼요.

```
🛡️ Security Alerts · GitHub Security Advisory · 3분 전
🚨 새로운 라이브러리 취약점이 공개되었습니다
🔴 긴급 · 🔥 실제 공격 확인 · 🧩 코드 변경: 필요 없음 · ⏱️ 업데이트: 지금 바로
• 요약 3줄
🎯 영향 대상 · 💡 영향 · ⚠️ 위험 · ✅ 권장 조치
📦 pkg (npm) `< 4.17.21` → 수정 버전 `4.17.21`   ← 구조화 데이터, AI가 만든 값이 아님
   npm install pkg@4.17.21                        ← 생태계별 업데이트 명령어 자동 생성
[🔗 원문 보기] [🤖 AI에게 질문] [💾 저장] [🔔 구독]
```

## 빠른 시작

```bash
npm install
cp .env.example .env     # DISCORD_TOKEN, DISCORD_CLIENT_ID 입력 (AI_API_KEY, GITHUB_TOKEN 권장)
npm run preview          # Components V2 카드 구조/글자수 검증 (Discord 없이)
npm run poll:dry         # 실제 소스를 수집해 가짜 서버로 라우팅 (Discord 없이)
npm start
```

- **초대**: scope `bot` + `applications.commands`, 권한 `채널 보기 · 메시지 보내기 · 공개 스레드 만들기`. 특권 인텐트는 필요 없어요.
- 개발 중에는 `.env`에 `DEV_GUILD_ID`를 넣으면 슬래시 명령어가 즉시 등록돼요(전역 등록은 최대 1시간).
- AI는 OpenAI 호환 `/chat/completions` 엔드포인트를 써요(`AI_BASE_URL`, `AI_API_KEY`, 모델은 `AI_ANALYSIS_MODEL`·`AI_ASK_MODEL`). `AI_API_KEY`가 없어도 동작해요(규칙 기반 요약). 있으면 번역·3줄 요약·영향 분석·AI 질문이 켜져요.
- 처음 수집할 때는 기존 글을 조용히 "읽음" 처리해서 서버가 도배되지 않아요.

## 명령어

| 대상 | 명령어 | 설명 |
|---|---|---|
| 모두 | `/settings` | 구독·키워드·내 스택·DM·브리핑·언어를 한 패널에서 (셀렉트/버튼/모달) |
| | `/subscribe` `/unsubscribe` | 카테고리·기술 구독 (자동완성) |
| | `/keywords add·remove·mute·unmute·list·clear` | 키워드 관리, 뮤트 지원 |
| | `/digest now·schedule` | 맞춤 브리핑 즉시 보기 / DM 정기 브리핑(시각·요일·시간대) |
| | `/news latest·search·card` | 최근 소식, 검색, 전체 카드 |
| | `/radar [language] [analyze]` | GitHub 프로젝트 레이더 (별 증가 속도, 라이선스, 설치법) |
| | `/saved` · `/ask` · `/help` | 저장함 · 자유 질문 · 도움말 |
| 관리자 | `/setup channel` | 카테고리별 채널 지정 |
| | `/setup toggle · priority · role · ping-priority` | 카테고리 on/off, 최소 우선순위, 긴급 역할 핑 |
| | `/setup digest-schedule` | 서버 브리핑 시각·요일·시간대·항목 수 |
| | `/setup style · language · color · threads · ai-buttons` | 카드 스타일(rich/compact), 언어, 색상, 스레드, AI 버튼 |
| | `/setup ecosystems · trending-min-stars` | 보안 생태계 필터(npm, pip …), 트렌딩 기준 |
| | `/setup source-add-rss · source-add-repo · source-toggle · source-remove · sources` | 소스 추가·끄기 |
| | `/setup view · preview · status · reset` | 설정 보기, 예시 카드 미리보기, 상태 점검, 초기화 |

## 동작 방식

1. **수집** — GitHub 릴리스(React, Next.js, TypeScript, Node, Vite, Deno, Bun, Anthropic/OpenAI SDK 등), RSS(OpenAI, Hugging Face, DeepMind, GitHub Changelog, Vercel, Node 보안), GitHub Security Advisories(+악성 패키지), CISA KEV, GitHub Trending. ETag 캐시·백오프 적용.
2. **중복 제거** — ID + 제목 유사도(Jaccard)로 여러 소스의 같은 소식을 하나로 합치고 "함께 보도"로 표시.
3. **분석** — AI(OpenAI 호환 API, 기본 `https://monken.cloud/v1`)가 번역 · 3줄 요약 · 영향 대상 · 위험 · 권장 조치 · 코드 변경 여부 · 긴급도를 JSON으로 생성. 보안 항목의 영향/수정 버전과 업데이트 명령어는 AI가 아니라 **원본 구조화 데이터**로 만들어요.
4. **전달** — 서버 채널(카테고리·우선순위·생태계 필터, 긴급 시 역할 핑, 선택적 스레드) + 구독자 DM(키워드/카테고리/뮤트/최소 우선순위).
5. **브리핑** — 서버/개인별 데일리, 주간(기본 토요일)은 일간을 대체. 재시작해도 중복 발송 없음.
6. **질문** — 카드의 `AI에게 질문` → "내 프로젝트에 영향?" / "이전 버전과 차이?" / "사용 예제" / 직접 질문. `/settings`에 등록한 스택 기준으로 답하고, 사용자당 일일 한도(`ASK_DAILY_LIMIT`)가 있어요.

데이터는 `data/devbot.json`에 저장돼요(원자적 쓰기). 소식은 21일, 저장한 소식은 계속 보관.
