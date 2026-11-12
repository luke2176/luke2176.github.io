// Vercel 서버리스 함수: /api/guestbook
//   GET  ?limit=20&before=<id> → 방명록 한 페이지(최신순). 응답 { items, hasMore, total? }
//   POST { name, message }     → 방명록 작성. 응답 201 { item }, 횟수 초과 시 429
//
// Supabase 비밀키는 _supabase.js 를 통해 서버에서만 사용한다.
// 비밀키는 RLS를 우회하므로, 입력 검사와 허용 범위 제한은 모두 이 파일(서버)이 책임진다.
// 스팸 방지: 작성은 방문자(IP 해시)별 시간당 IP_PER_HOUR 개, 사이트 전체 하루(한국 시간) SITE_PER_DAY 개까지.
//   _ratelimit.js(Supabase ask_take, 구간 이름 'gb:')로 센다. 입력 검사를 통과한 요청만 센다.

const { listGuestbook, insertGuestbook } = require('./_supabase');
const ratelimit = require('./_ratelimit');

const IP_PER_HOUR = 5;
const SITE_PER_DAY = 100;
const NAME_MAX = 20;
const MESSAGE_MAX = 140;
const PAGE_DEFAULT = 20;
const PAGE_MAX = 50;
const BODY_MAX_BYTES = 10 * 1024;
const ALLOWED_FIELDS = ['name', 'message'];

// 이름: 제어문자(줄바꿈 포함) 금지. 메시지: 줄바꿈(\n)·탭만 허용, 나머지 제어문자 금지.
// 제어문자 중 \u0000 은 Postgres text 에 저장할 수 없다.
const NAME_FORBIDDEN = /[\u0000-\u001F\u007F]/;
const MESSAGE_FORBIDDEN = /[\u0000-\u0008\u000B-\u001F\u007F]/;

// DB의 char_length 와 같은 기준(유니코드 글자 수)으로 센다. 이모지도 1글자.
const charLength = (s) => Array.from(s).length;

function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  // 같은 출처에서만 호출하는 전제. 조회 결과 캐시는 두지 않는다.
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(payload));
}

// 요청 본문을 JSON으로 읽는다. (Vercel이 파싱해 주면 그대로 사용)
// 반환: 파싱된 값, 해석 불가면 null, 너무 크면 undefined
async function readJsonBody(req) {
  let parsed;
  try {
    // Vercel 런타임은 JSON 본문을 이 속성 접근 시점에 파싱하며, 형식이 잘못되면 예외를 던진다.
    parsed = req.body;
  } catch {
    return null;
  }
  if (parsed && typeof parsed === 'object') return parsed;
  if (typeof parsed === 'string' && parsed.length) {
    if (Buffer.byteLength(parsed) > BODY_MAX_BYTES) return undefined;
    try {
      return JSON.parse(parsed);
    } catch {
      return null;
    }
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > BODY_MAX_BYTES) return undefined;
    chunks.push(chunk);
  }
  if (!chunks.length) return null;
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    return null;
  }
}

// 입력 검사. 문제가 있으면 오류 문구를, 없으면 null 을 돌려준다.
function validate(body) {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return '요청 본문은 { name, message } 형태의 JSON이어야 합니다.';
  }
  const unknown = Object.keys(body).filter((k) => !ALLOWED_FIELDS.includes(k));
  if (unknown.length) {
    return '허용하지 않는 항목이 있습니다: ' + unknown.join(', ');
  }
  const { name, message } = body;
  if (typeof name !== 'string' || typeof message !== 'string') {
    return '이름과 메시지를 문자열로 보내주세요.';
  }
  const n = name.trim();
  const m = message.trim();
  if (charLength(n) < 1 || charLength(n) > NAME_MAX) {
    return '이름은 1~' + NAME_MAX + '자여야 합니다.';
  }
  if (charLength(m) < 1 || charLength(m) > MESSAGE_MAX) {
    return '메시지는 1~' + MESSAGE_MAX + '자여야 합니다.';
  }
  if (NAME_FORBIDDEN.test(n)) {
    return '이름에 사용할 수 없는 문자가 있습니다.';
  }
  if (MESSAGE_FORBIDDEN.test(m)) {
    return '메시지에 사용할 수 없는 문자가 있습니다.';
  }
  return null;
}

// 조회 파라미터 검사. 숫자 형태가 아니면 거부한다. (DB 필터에 임의 문자열이 들어가지 않게)
function parseListQuery(req) {
  const url = new URL(req.url || '/', 'http://localhost');
  const limitRaw = url.searchParams.get('limit');
  const beforeRaw = url.searchParams.get('before');

  let limit = PAGE_DEFAULT;
  if (limitRaw !== null) {
    if (!/^\d{1,3}$/.test(limitRaw)) return { error: 'limit 은 숫자여야 합니다.' };
    limit = Number(limitRaw);
    if (limit < 1 || limit > PAGE_MAX) {
      return { error: 'limit 은 1~' + PAGE_MAX + ' 사이여야 합니다.' };
    }
  }

  let before = null;
  if (beforeRaw !== null) {
    if (!/^\d{1,15}$/.test(beforeRaw) || Number(beforeRaw) < 1) {
      return { error: 'before 는 양의 정수여야 합니다.' };
    }
    before = Number(beforeRaw);
  }
  return { limit, before };
}

module.exports = async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const q = parseListQuery(req);
      if (q.error) return sendJson(res, 400, { error: q.error });
      const page = await listGuestbook({ limit: q.limit, before: q.before });
      const payload = { items: page.items, hasMore: page.hasMore };
      if (q.before === null) payload.total = page.total;
      return sendJson(res, 200, payload);
    }

    if (req.method === 'POST') {
      const type = String(req.headers['content-type'] || '').toLowerCase();
      if (!type.startsWith('application/json')) {
        return sendJson(res, 415, { error: 'Content-Type 은 application/json 이어야 합니다.' });
      }
      const body = await readJsonBody(req);
      if (body === undefined) {
        return sendJson(res, 413, { error: '요청이 너무 큽니다.' });
      }
      const invalid = validate(body);
      if (invalid) {
        return sendJson(res, 400, { error: invalid });
      }
      // 횟수 제한. 확인에 실패하면(설정 없음·Supabase 오류) 저장하지 않고 500 으로 막는다.
      if (!ratelimit.configured()) throw new Error('횟수 제한 설정(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)이 없습니다.');
      const r = await ratelimit.take(ratelimit.clientIp(req), { prefix: 'gb', ipLimit: IP_PER_HOUR, dayLimit: SITE_PER_DAY });
      if (r === 'ip') {
        res.setHeader('Retry-After', String(ratelimit.secondsToNextHour()));
        return sendJson(res, 429, { error: '글은 한 시간에 ' + IP_PER_HOUR + '개까지 남길 수 있어요. 잠시 후 다시 시도해 주세요.' });
      }
      if (r === 'day') {
        return sendJson(res, 429, { error: '오늘은 방명록 글이 많아 잠시 막아 두었어요. 내일 다시 남겨 주세요.' });
      }
      // 클라이언트가 보낸 id, created_at 등은 쓰지 않는다. 검사를 통과한 두 항목만 저장한다.
      const row = await insertGuestbook(body.name.trim(), body.message.trim());
      return sendJson(res, 201, {
        item: { id: row.id, name: row.name, message: row.message, created_at: row.created_at },
      });
    }

    res.setHeader('Allow', 'GET, POST');
    return sendJson(res, 405, { error: '허용되지 않은 메서드입니다.' });
  } catch (err) {
    // 내부 오류 메시지는 서버 로그로만. 클라이언트에는 일반화된 메시지.
    console.error('[api/guestbook]', err);
    return sendJson(res, 500, { error: '서버 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.' });
  }
};
