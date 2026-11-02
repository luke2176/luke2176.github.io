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

function baseHeaders() {
  return {
    apikey: SERVICE_ROLE_KEY,
    Authorization: 'Bearer ' + SERVICE_ROLE_KEY,
    'Content-Type': 'application/json',
  };
}

// 최신순으로 방명록 목록을 가져온다.
async function listGuestbook(limit = 100) {
  assertEnv();
  const url =
    restUrl('guestbook') +
    '?select=id,name,message,created_at&order=created_at.desc&limit=' +
    encodeURIComponent(String(limit));
  const res = await fetch(url, { headers: baseHeaders() });
  if (!res.ok) {
    const body = await res.text();
    throw new Error('목록 조회 실패 (' + res.status + '): ' + body);
  }
  return res.json();
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
  return rows[0];
}

module.exports = { listGuestbook, insertGuestbook };
