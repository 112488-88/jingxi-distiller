/**
 * deploy/cloudflare-worker.js —— 把 DeepSeek Key 藏在服务端的代理（Cloudflare Workers）
 *
 * 用法：
 *   1. Cloudflare Dashboard → Workers & Pages → 新建 Worker，把本文件内容粘进去
 *   2. Settings → Variables 里加两个加密变量
 *        DEEPSEEK_KEY   = sk-xxxx
 *        ACCESS_TOKEN   = 随便一串口令（前端要带同样的值，防白嫖；不想管就留空）
 *   3. 部署后拿到 https://xxx.workers.dev，前端 config.js 里写
 *        apiUrl: 'https://xxx.workers.dev/v1/chat/completions',
 *        keyOptional: true
 *   4. 前端如果用了 ACCESS_TOKEN，需要在请求头带上，见下面注释
 *
 * 这个 Worker 只转发 /v1/chat/completions，别的路径一律 404。
 */

const UPSTREAM = 'https://api.deepseek.com';
const ALLOWED_PATHS = ['/v1/chat/completions', '/chat/completions'];

// 简单的内存限流（每个 isolate 独立，够挡住手滑连点；要严格限流请接 KV / Durable Object）
const hits = new Map();
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 20;

function rateLimited(ip) {
  const now = Date.now();
  const rec = hits.get(ip) || { start: now, n: 0 };
  if (now - rec.start > WINDOW_MS) {
    rec.start = now;
    rec.n = 0;
  }
  rec.n += 1;
  hits.set(ip, rec);
  return rec.n > MAX_PER_WINDOW;
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Access-Token',
  'Access-Control-Max-Age': '86400'
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }

    if (request.method !== 'POST' || !ALLOWED_PATHS.includes(url.pathname)) {
      return new Response(JSON.stringify({ error: { message: '只支持 POST /v1/chat/completions' } }), {
        status: 404,
        headers: { ...CORS, 'Content-Type': 'application/json' }
      });
    }

    // 口令校验（env.ACCESS_TOKEN 为空就跳过）
    if (env.ACCESS_TOKEN) {
      const token = request.headers.get('X-Access-Token') || '';
      if (token !== env.ACCESS_TOKEN) {
        return new Response(JSON.stringify({ error: { message: 'ACCESS_TOKEN 不对' } }), {
          status: 401,
          headers: { ...CORS, 'Content-Type': 'application/json' }
        });
      }
    }

    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    if (rateLimited(ip)) {
      return new Response(JSON.stringify({ error: { message: '请求太频繁，等一分钟' } }), {
        status: 429,
        headers: { ...CORS, 'Content-Type': 'application/json' }
      });
    }

    const body = await request.text();

    const upstream = await fetch(UPSTREAM + '/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + env.DEEPSEEK_KEY
      },
      body
    });

    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        ...CORS,
        'Content-Type': upstream.headers.get('Content-Type') || 'application/json'
      }
    });
  }
};

/* 前端要带口令的话，在 config.js 之外再加一行（或用浏览器控制台注入测试）：

   const _fetch = window.fetch;
   window.fetch = function (url, opts) {
     opts = opts || {};
     opts.headers = Object.assign({}, opts.headers, { 'X-Access-Token': '你的口令' });
     return _fetch(url, opts);
   };

   更干净的做法是把口令写进 deploy/config.js，再在 app.js 的 postChat 里加一行，
   或者干脆不用口令、只靠 Cloudflare 的 WAF 限流。
*/
