// 로컬 확인용 서버. 배포되지 않는다(.vercelignore 에서 제외).
//   - /               → index.html
//   - /assets/...     → 이미지 등 정적 파일 (assets 폴더 안만)
//   - /api/guestbook  → 배포되는 서버 함수(api/guestbook.js)를 그대로 실행
//   - /api/ask        → 배포되는 서버 함수(api/ask.js)를 그대로 실행
//
// 실행: npm run dev   (프로젝트 루트의 .env 에 SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GEMINI_API_KEY 필요)
// 주의: .env 가 실제 Supabase 프로젝트를 가리키면, 로컬에서 쓴 글도 실제 DB에 저장되고
//       AI 질문도 실제 횟수 제한(ask_usage)에 기록된다.

const http = require('http');
const fs = require('fs');
const path = require('path');
const guestbook = require('../api/guestbook.js');
const ask = require('../api/ask.js');

const PORT = Number(process.env.PORT) || 3000;
const ROOT = path.join(__dirname, '..');
const ASSETS = path.join(ROOT, 'assets');
const TYPES = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
};

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.warn('[dev] SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 없습니다. 방명록·AI 질문 API는 500을 돌려줍니다.');
}
if (!process.env.GEMINI_API_KEY) {
  console.warn('[dev] GEMINI_API_KEY 가 없습니다. AI 질문 API는 500을 돌려줍니다.');
}

const server = http.createServer((req, res) => {
  const { pathname } = new URL(req.url, 'http://localhost');

  if (pathname === '/api/guestbook') return guestbook(req, res);
  if (pathname === '/api/ask') return ask(req, res);
  if (pathname === '/' || pathname === '/index.html') {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.end(fs.readFileSync(path.join(ROOT, 'index.html')));
  }
  if (pathname.startsWith('/assets/')) {
    // assets 폴더 밖으로 나가는 경로(../ 등)는 막는다.
    const file = path.join(ROOT, decodeURIComponent(pathname));
    if (file.startsWith(ASSETS + path.sep) && fs.existsSync(file) && fs.statSync(file).isFile()) {
      res.setHeader('Content-Type', TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream');
      return res.end(fs.readFileSync(file));
    }
  }
  res.statusCode = 404;
  res.end('Not found');
});

// 내 컴퓨터에서만 접속 가능하게 묶는다.
server.listen(PORT, '127.0.0.1', () => {
  console.log('[dev] http://localhost:' + PORT + '  (종료: Ctrl+C)');
});
