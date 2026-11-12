# 기능 후보와 이번에 고른 기능: 역할로 보기

이 문서는 방명록 다음으로 추가할 기능 후보를 비교하고, 이번에 구현한 "역할로 보기"의 명세와 확인 방법을 기록한다.
판단 기준은 페이지의 가치 문장이다: 팀프로젝트를 함께할 사람이 나의 역량을 쉽게 파악할 수 있어야 한다.

## 1. 후보 비교

| 후보 | 방문자가 얻는 것 | 필요한 작업 | 위험·비용 | 판단 |
|---|---|---|---|---|
| 역할로 보기 (필요한 역할을 고르면 근거 경력·프로젝트를 모아 보여 줌) | "우리 팀에 필요한 역할을 맡을 수 있나"를 한곳에서 확인 | `index.html` 데이터에 역할 표시 + 화면 코드 | 서버·DB 변경 없음, 개인정보 없음 | **이번에 구현** |
| 협업 제안 폼 (비공개로 프로젝트·필요 역할·연락처 전송) | 공개 방명록 대신 1:1 제안 | 새 테이블, 서버 함수, 관리자만 읽는 화면 또는 알림 | 연락처(개인정보) 저장, 스팸, 열람 권한 설계 필요 | 다음 후보. 저장 범위·알림 방식을 먼저 정해야 함 |
| 방명록에 "함께하고 싶은 역할" 태그 | 방문자 관심 역할을 모아 볼 수 있음 | DB 열 추가(마이그레이션), API·화면 수정 | 운영 DB 변경, 미커밋 방명록 작업과 충돌 | 방명록 강화 작업이 배포된 뒤 검토 |
| 인쇄·PDF 저장용 스타일 | 이력서처럼 한 장으로 저장·공유 | `@media print` CSS | 낮음 | 작은 후속 작업으로 적합 |
| 링크 미리보기(OG 메타태그) | 메신저에 링크를 보낼 때 이름·역할이 보임 | 메타태그 | 낮음. PR #1이 옛 주소 기준이라 다시 맞춰야 함 | PR #1 정리와 함께 진행 |
| 방문자 수 표시 | 노출 정도 확인 | 카운터 저장소 | 역량 파악과 관련 적음 | 제외 |

## 2. 역할로 보기 명세

### 화면
- 위치: `#about`(01 팀에서 맡을 수 있는 역할) 설명 문장 아래, 네 개 역할 카드 위.
- 버튼 4개: 문제 발견 / 기획·설계 / 데이터·AI 검증 / 개발·배포 (`PILLARS` 제목 그대로).
- 하나를 고르면
  - 해당 역할 카드는 강조, 나머지 카드는 흐리게 표시(이미 화면에 나타난 카드만).
  - 아래 상자에 "○○의 근거: 경력 N건 · 프로젝트 M건 · 교육·세미나 K건"(0건 묶음은 생략)과 근거 목록(구분 · 제목 · 기간)을 보여 준다.
    교육 과정·세미나(`cat: 'edu'`)는 프로젝트와 구분해 "교육·세미나"로 표시한다.
  - 화면 낭독기에는 요약 문장만 알린다(별도 `aria-live` 영역). 목록 전체를 다시 읽지 않는다.
  - 목록 항목을 누르면 해당 경력·프로젝트 위치로 이동하고 잠시 테두리로 표시한다. 프로젝트 필터에 가려진 항목이면 필터를 "전체"로 되돌린다.
- 같은 버튼을 다시 누르면 선택이 풀린다.
- 주소 공유: `?role=discover|plan|validate|build` 를 붙이면 그 역할을 고른 상태로 열린다.
  예: `https://luke2176-homepage.vercel.app/?role=validate#about`. 선택을 바꾸면 주소도 함께 바뀐다(새 기록은 남기지 않음). 잘못된 값은 무시하고 주소에서 지운다.

### 데이터
- `PILLARS` 각 항목에 `id`(discover / plan / validate / build).
- `EXPERIENCE`, `FEATURED`, `OTHERS` 각 항목에 `roles` 배열. 비워 두면 어떤 역할에도 나오지 않는다.
- 연결 기준(역할 카드의 근거 문구와 맞춤):
  - PM·팀 리더·서비스 기획 → `plan`
  - UX 리서치·벤치마킹 → `discover`
  - 데이터 분석·DB 모델링·연구 → `validate`
  - 개발·구축·데이터 엔지니어링 → `build`
- 사실과 다르면 데이터의 `roles`만 고치면 된다.

### 범위 밖
- 서버·DB 변경 없음. 방문자의 선택은 저장하지 않는다.

## 3. 확인 방법
1. `npm run validate` 통과.
2. 버튼을 누르면 카드 강조와 근거 목록이 바뀌고, 다시 누르면 원래대로 돌아오는지.
3. 목록 항목을 누르면 해당 위치로 이동하는지. 프로젝트 필터를 "개발"로 둔 채 기획 항목을 눌러도 보이는지.
4. `?role=plan` 으로 열면 기획·설계가 선택된 상태인지. 잘못된 값(`?role=xyz`)이면 아무것도 선택되지 않고 주소에서 지워지는지.
5. 좁은 화면(모바일)과 다크 모드에서 버튼과 목록이 깨지지 않는지.

## 4. 2차 기능 (2026-11-05)

리서치(포트폴리오 가이드·사례 모음)를 바탕으로 고른 top 3를 구현이 쉬운 순서로 추가했다.

1. **06 지금 & 협업 방식** (PR #11): 지금 하는 일, 작업 도구, 연락 방법, 마지막 업데이트. `NOW` 데이터. 합류 가능 여부·답장 시간은 비워 둠(빈 값은 표시 안 함).
2. **대표 프로젝트 자세히 보기** (PR #12): `FEATURED[].detail`(문제/내가 한 일/과정/결과/자료). 페이지에 이미 있는 수상·논문만 연결했고 나머지는 비워 둠.
3. **07 AI에게 물어보기** (`api/ask.js`):
   - 근거: `index.html`의 데이터 블록(`const PROFILE` ~ 닫는 `// =====`)을 서버가 읽어 시스템 지시에 넣는다. 사진(base64)은 뺀다.
   - 모델: `gemini-3.1-flash-lite`, 붐비면(429/5xx/시간 초과) `gemini-3.5-flash-lite`로 한 번 더. `GEMINI_MODEL`로 바꿀 수 있다.
   - 제한: 방문자(IP를 서버 비밀키로 HMAC 해시)별 시간당 10회, 사이트 전체 하루(한국 시간) 200회. Supabase `public.ask_usage` + `public.ask_take()`(service_role만 실행). 질문 내용·IP 원문은 저장하지 않는다.
   - 입력: `{ question }` 1~300자, 제어문자 금지, JSON만, 같은 출처만. 답은 화면에 textContent로만 넣는다.
   - Preview 배포에는 키가 없어 502가 난다(Production만 등록).
   - 근거 데이터에서 편집용 주석(`// ...`)과 base64 이미지는 뺀다. 블록에 `const NOW`가 없거나 40,000자를 넘으면 오류로 멈추며, `npm run validate`가 같은 검사를 한다.
   - 시간: Supabase 확인 3초, 모델 1회 12초, 두 모델 합계 22초(함수 최대 30초). IPv6는 /64 단위로 센다.
   - 키·데이터가 준비되지 않았으면 횟수를 쓰기 전에 멈춘다. 횟수 제한 설정이 없으면 막는다(로컬 시험만 `ASK_NO_LIMIT=1`).

### Supabase SQL (적용됨, 마이그레이션 `ask_usage_rate_limit`)

```sql
create table if not exists public.ask_usage (
  bucket text primary key,
  count integer not null default 0,
  updated_at timestamptz not null default now()
);
create index if not exists ask_usage_updated_at_idx on public.ask_usage (updated_at);
alter table public.ask_usage enable row level security;
revoke all on table public.ask_usage from anon, authenticated;

-- 반환: 'ok' | 'ip' (방문자 한도 초과) | 'day' (사이트 하루 한도 초과)
create or replace function public.ask_take(
  p_ip_bucket text, p_day_bucket text, p_ip_limit integer, p_day_limit integer
) returns text language plpgsql security invoker set search_path = public as $$
declare v_ip integer; v_day integer;
begin
  insert into public.ask_usage as u (bucket, count) values (p_ip_bucket, 1)
    on conflict (bucket) do update set count = u.count + 1, updated_at = now()
    returning u.count into v_ip;
  if v_ip > p_ip_limit then return 'ip'; end if;
  insert into public.ask_usage as u (bucket, count) values (p_day_bucket, 1)
    on conflict (bucket) do update set count = u.count + 1, updated_at = now()
    returning u.count into v_day;
  if v_day = 1 then
    delete from public.ask_usage where updated_at < now() - interval '2 days';
  end if;
  if v_day > p_day_limit then return 'day'; end if;
  return 'ok';
end; $$;

revoke all on function public.ask_take(text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.ask_take(text, text, integer, integer) to service_role;
```
