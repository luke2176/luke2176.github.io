// Vercel 서버리스 함수: /api/guestbook
//   GET  → 방명록 목록(최신순) 조회
//   POST → 방명록 작성 { name, message }
//
// service_role 키는 _supabase.js 를 통해 서버에서만 사용한다.

const { listGuestbook, insertGuestbook } = require('./_supabase');

const NAME_MAX = 20;
const MESSAGE_MAX = 140;

function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  // 같은 출처에서만 호출하는 전제. 조회 결과 캐시는 두지 않는다.
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(payload));
}

// 요청 본문을 JSON으로 읽는다. (Vercel이 파싱해 주면 그대로 사용)
async function readJsonBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string' && req.body.length) {
    try {
      return JSON.parse(req.body);
    } catch {
      return null;
    }
  }
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    return null;
  }
}

function validate(name, message) {
  if (typeof name !== 'string' || typeof message !== 'string') {
    return '이름과 메시지를 문자열로 보내주세요.';
  }
  const n = name.trim();
  const m = message.trim();
  if (n.length < 1 || n.length > NAME_MAX) {
    return '이름은 1~' + NAME_MAX + '자여야 합니다.';
  }
  if (m.length < 1 || m.length > MESSAGE_MAX) {
    return '메시지는 1~' + MESSAGE_MAX + '자여야 합니다.';
  }
  return null;
}

module.exports = async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const items = await listGuestbook();
      return sendJson(res, 200, { items });
    }

    if (req.method === 'POST') {
      const body = await readJsonBody(req);
      if (body === null) {
        return sendJson(res, 400, { error: '본문을 해석할 수 없습니다.' });
      }
      const name = body.name;
      const message = body.message;
      const invalid = validate(name, message);
      if (invalid) {
        return sendJson(res, 400, { error: invalid });
      }
      const row = await insertGuestbook(name.trim(), message.trim());
      return sendJson(res, 201, { item: row });
    }

    res.setHeader('Allow', 'GET, POST');
    return sendJson(res, 405, { error: '허용되지 않은 메서드입니다.' });
  } catch (err) {
    // 내부 오류 메시지는 서버 로그로만. 클라이언트에는 일반화된 메시지.
    console.error('[api/guestbook]', err);
    return sendJson(res, 500, { error: '서버 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.' });
  }
};
