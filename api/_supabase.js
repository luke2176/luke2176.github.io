// 서버 전용 모듈. service_role 키를 사용하므로 절대 공개 폴더에 복사하거나
// 클라이언트 번들에 포함하지 않는다. Vercel 서버리스 함수에서만 import 한다.
//
// 외부 SDK 없이 Supabase REST(PostgREST) API를 직접 호출한다.

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function assertEnv() {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    throw new Error(
      'Supabase 환경변수가 없습니다. SUPABASE_URL 과 SUPABASE_SERVICE_ROLE_KEY 를 설정하세요.'
    );
  }
}

function restUrl(path) {
  return SUPABASE_URL.replace(/\/+$/, '') + '/rest/v1/' + path;
}

// 키 형식 두 가지를 모두 지원한다.
//  - 새 비밀키(sb_secret_...): JWT가 아니므로 apikey 헤더에만 넣는다.
//  - 레거시 service_role 키(JWT, eyJ...): apikey + Authorization Bearer 로 보낸다.
function baseHeaders() {
  const headers = {
    apikey: SERVICE_ROLE_KEY,
    'Content-Type': 'application/json',
  };
  if (SERVICE_ROLE_KEY.startsWith('eyJ')) {
    headers.Authorization = 'Bearer ' + SERVICE_ROLE_KEY;
  }
  return headers;
}

// 최신순으로 방명록을 한 페이지 가져온다. (누락 방지: 잘라내지 않고 페이지로 나눠 모두 읽을 수 있게 함)
//  - before: 이 id보다 작은(더 오래된) 글만. 마지막으로 받은 글의 id를 넘기면 다음 페이지.
//  - limit+1건을 요청해서 다음 페이지가 더 있는지(hasMore)를 정확히 판단한다.
//  - total: 첫 페이지(before 없음)일 때만 전체 글 수를 함께 받는다.
async function listGuestbook({ limit = 20, before = null } = {}) {
  assertEnv();
  const params = new URLSearchParams({
    select: 'id,name,message,created_at',
    order: 'id.desc',
    limit: String(limit + 1),
  });
  if (before !== null) params.set('id', 'lt.' + before);

  const headers = baseHeaders();
  if (before === null) headers.Prefer = 'count=exact';

  const res = await fetch(restUrl('guestbook') + '?' + params.toString(), { headers });
  if (!res.ok) {
    const body = await res.text();
    throw new Error('목록 조회 실패 (' + res.status + '): ' + body);
  }
  const rows = await res.json();
  if (!Array.isArray(rows)) {
    throw new Error('목록 응답 형식이 올바르지 않습니다.');
  }
  const m = /\/(\d+)$/.exec(res.headers.get('content-range') || '');
  return {
    items: rows.slice(0, limit),
    hasMore: rows.length > limit,
    total: m ? Number(m[1]) : null,
  };
}

// 방명록 항목 1건을 추가하고 생성된 행을 반환한다.
async function insertGuestbook(name, message) {
  assertEnv();
  const res = await fetch(restUrl('guestbook'), {
    method: 'POST',
    headers: { ...baseHeaders(), Prefer: 'return=representation' },
    body: JSON.stringify([{ name, message }]),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error('작성 실패 (' + res.status + '): ' + body);
  }
  const rows = await res.json();
  if (!Array.isArray(rows) || !rows[0]) {
    throw new Error('저장 응답에 생성된 행이 없습니다.');
  }
  return rows[0];
}

module.exports = { listGuestbook, insertGuestbook };
