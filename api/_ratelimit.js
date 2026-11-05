// 서버 전용 모듈: AI 질문하기(/api/ask) 요청 횟수 제한.
// Supabase 의 public.ask_take() 함수로 "방문자별 시간당 횟수"와 "사이트 전체 하루 횟수"를 한 번에 센다.
// 질문 내용과 IP 원문은 저장하지 않는다. IP 는 서버 비밀키로 HMAC 해시한 앞부분만 쓴다.

const crypto = require('crypto');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const RPC_TIMEOUT_MS = 3000;

// (_supabase.js 와 같은 환경변수·헤더 규칙. 방명록 모듈과 독립적으로 바꿀 수 있게 따로 둔다.)

function configured() {
  return Boolean(SUPABASE_URL && SERVICE_ROLE_KEY);
}

// 키 형식에 따라 헤더를 나눈다(_supabase.js 와 같은 규칙).
function headers() {
  const h = { apikey: SERVICE_ROLE_KEY, 'Content-Type': 'application/json' };
  if (SERVICE_ROLE_KEY.startsWith('eyJ')) h.Authorization = 'Bearer ' + SERVICE_ROLE_KEY;
  return h;
}

// IPv6 는 한 사용자가 /64 대역 안에서 주소를 바꿀 수 있으므로 앞 4묶음(/64)만 쓴다.
function ipKey(ip) {
  let s = String(ip || 'unknown').trim().toLowerCase();
  if (s.startsWith('::ffff:')) s = s.slice(7); // IPv4 를 IPv6 형식으로 적은 경우
  if (!s.includes(':')) return s;
  const [head, tail = ''] = s.split('::');
  const h = head ? head.split(':') : [];
  const t = tail ? tail.split(':') : [];
  const full = s.includes('::') ? [...h, ...Array(Math.max(0, 8 - h.length - t.length)).fill('0'), ...t] : h;
  return full.slice(0, 4).map((x) => x.replace(/^0+(?=.)/, '')).join(':') + '::/64';
}

// 시간 구간 이름. 하루 기준은 한국 시간.
function buckets(ip, now = new Date()) {
  const hash = crypto.createHmac('sha256', SERVICE_ROLE_KEY).update(ipKey(ip)).digest('base64url').slice(0, 22);
  const utcHour = now.toISOString().slice(0, 13).replace(/\D/g, '');            // 2026110503
  const kstDay = new Date(now.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10).replace(/\D/g, ''); // 20261105
  return { ip: 'ask:ip:' + hash + ':' + utcHour, day: 'ask:day:' + kstDay };
}

// 반환: 'ok' | 'ip' | 'day'. 실패하면 예외.
async function take(ip, { ipLimit, dayLimit }) {
  const b = buckets(ip);
  const res = await fetch(SUPABASE_URL.replace(/\/+$/, '') + '/rest/v1/rpc/ask_take', {
    method: 'POST',
    headers: headers(),
    signal: AbortSignal.timeout(RPC_TIMEOUT_MS),
    body: JSON.stringify({ p_ip_bucket: b.ip, p_day_bucket: b.day, p_ip_limit: ipLimit, p_day_limit: dayLimit }),
  });
  if (!res.ok) {
    throw new Error('횟수 확인 실패 (' + res.status + '): ' + (await res.text()));
  }
  const out = await res.json();
  if (out !== 'ok' && out !== 'ip' && out !== 'day') {
    throw new Error('횟수 확인 응답 형식이 올바르지 않습니다.');
  }
  return out;
}

module.exports = { configured, take, ipKey };
