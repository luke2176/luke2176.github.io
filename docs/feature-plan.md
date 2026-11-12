# 기능 계획: 방명록 (Guestbook)

이 문서는 홈페이지(`index.html`)에 추가하는 방명록 기능의 명세와 검사 방법을 기록한다.
확정 사항: 방명록 · 서버 함수 경유(Supabase service_role 숨김) · Vercel 배포 · GitHub Pages에서 Vercel로 이전.

## 1. 목표

방문자(함께 팀프로젝트를 할 사람)가 짧은 메시지를 남기고 그 목록을 볼 수 있게 한다.
퍼스널 브랜딩 소개 페이지의 "역량을 쉽게 파악하게 한다"는 목표에 맞춰, 방문 흔적과 소통 창구를 더한다.

## 2. 화면 구성

연락처 섹션(`#contact`) 아래에 새 섹션 `#guestbook` 을 둔다.

### 입력란
- 이름: 텍스트, 1~20자, 필수
- 메시지: 텍스트영역, 1~140자, 필수

### 버튼
- "남기기" (제출). 전송 중에는 비활성화 + "저장 중…" 표시.

### 결과
- 최신순 메시지 목록: 이름 · 메시지 · 작성일
- 상태 영역: 로딩 중 / 비어 있음 안내("첫 메시지를 남겨보세요") / 오류 메시지

## 3. 저장할 항목 (Supabase 테이블 `guestbook`)

| 컬럼 | 타입 | 설명 |
|------|------|------|
| `id` | `bigint` identity, PK | 자동 증가 |
| `name` | `text` | 작성자 이름 (서버에서 길이 검증) |
| `message` | `text` | 메시지 본문 (서버에서 길이 검증) |
| `created_at` | `timestamptz` default `now()` | 작성 시각 |

개인정보(IP·이메일 등)는 저장하지 않는다.

## 4. 아키텍처

- 프런트엔드(`index.html`)는 같은 출처의 서버 함수 `/api/guestbook` 만 호출한다.
- 서버 함수(`api/guestbook.js`)가 Supabase에 접속한다. Supabase `service_role` 키는
  서버 함수의 환경변수로만 읽고, 프런트엔드·저장소에는 절대 넣지 않는다.
- Vercel Node 런타임 서버리스 함수를 사용한다.

### API

- `GET /api/guestbook` → 최신순 목록 조회. 응답: `{ items: [{ id, name, message, created_at }] }`
- `POST /api/guestbook` → 작성. 요청 본문: `{ name, message }`. 응답: 생성된 행 1건.

## 5. 성공 / 실패 동작

### 성공
- 제출 성공: 입력란 초기화 → 방금 쓴 메시지를 목록 맨 위에 추가 → 짧은 안내.
- 조회 성공: 페이지 로드 시 목록을 불러와 최신순 표시.

### 실패
- 입력 검증 실패(빈 값/길이 초과): 전송 전 인라인 경고, 네트워크 전송 안 함.
- 네트워크/서버 오류: "잠시 후 다시 시도해 주세요" 표시, 입력 내용 유지(유실 방지).
- 조회 실패: 목록 자리에 "메시지를 불러오지 못했습니다" + 재시도 버튼.

## 6. 접근 제한

자유 입력(로그인 없음)이므로 다음을 둔다.

- 서버 함수에서 입력 검증: `name` 1~20자, `message` 1~140자, 공백만 입력 거부.
- DB(RLS) 레벨:
  - `select`: 허용(목록 공개).
  - `insert`: 길이 제약을 만족하는 경우만 허용.
  - `update` / `delete`: 익명 금지(정책 미부여).
- `service_role` 키는 서버 함수 환경변수로만 사용. 클라이언트·저장소에 노출하지 않는다.
- 버튼 연타 방지(전송 중 비활성). 캡차 등 고급 스팸 방지는 이번 최소 버전 범위 밖.
- (2026-11-12 추가) 작성 횟수 제한: 방문자(IP를 서버 비밀키로 HMAC 해시, IPv6는 /64)별 시간당 5개, 사이트 전체 하루(한국 시간) 100개. 넘으면 429와 안내 문구(방문자 한도는 `Retry-After`).
  - AI 질문의 Supabase `public.ask_take()`·`public.ask_usage`를 그대로 쓰고 구간 이름만 `gb:`로 나눈다(`api/_ratelimit.js`). DB 변경 없음. SQL은 `docs/feature-ideas.md` 참고.
  - 입력 검사를 통과한 요청만 센다. 횟수 확인이 실패하면 저장하지 않고 500(막는 쪽으로 실패).
  - 로컬 `npm run dev`가 실제 Supabase를 가리키면 로컬에서 쓴 글도 실제 한도에 들어간다.

### Supabase SQL (참고)

```sql
create table if not exists public.guestbook (
  id bigint generated always as identity primary key,
  name text not null check (char_length(name) between 1 and 20),
  message text not null check (char_length(message) between 1 and 140),
  created_at timestamptz not null default now()
);

alter table public.guestbook enable row level security;
```

(서버 함수는 `service_role` 키를 쓰므로 RLS를 우회한다. anon 직접 접근을 허용할 경우에만 아래 정책을 추가한다.)

## 7. 배포 (Vercel)

- 공개 출력에 포함: `index.html`, `game.html`, (사용 시) 이미지. 현재 프로필 사진은 `index.html`에 base64 인라인.
- 서버 함수: `api/guestbook.js`, `api/_supabase.js` — 정적 공개 폴더에 복사하지 않는다.
- 배포 제외(`.vercelignore`): `.git`, `.env*`, `.kiro`, 개인 기록, `node_modules`, 스크린샷/증명사진/PDF 등.
- 환경변수(대시보드 입력): `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.
- 기존 GitHub Pages 설정 파일은 삭제하지 않는다. Pages 비활성화는 저장소 설정에서 사용자가 직접 수행.

## 8. 검사 방법 (완료 확인)

1. 로컬에서 방명록 섹션이 보이고, 이름+메시지 입력 후 "남기기" → 목록에 즉시 나타나는지.
2. 새로고침 후에도 메시지가 남아 있는지(= Supabase 저장 확인).
3. 빈 값 / 140자 초과 시 경고가 뜨고 전송되지 않는지.
4. Supabase 대시보드 Table Editor에서 행이 생성됐는지.
5. 다른 기기/시크릿 창에서 같은 목록이 보이는지(공개 조회).
6. `npm run validate` 로 HTML 검증 통과.
7. 브라우저 콘솔/네트워크 탭에서 `service_role` 키가 노출되지 않는지(프런트는 `/api/guestbook`만 호출).
