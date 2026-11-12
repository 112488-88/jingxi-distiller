/* sw.js —— 离线缓存（只在 http(s) 下生效；file:// 双击打开不会注册）
 *
 * 策略：
 *   · 应用外壳：安装时预缓存，之后「缓存优先」，改了代码就改 CACHE 版本号
 *   · 页面导航：网络优先，断网回落到缓存
 *   · 跨域请求（api.deepseek.com）：完全不拦截，直连
 */
const CACHE = 'jxtl-v1';

const ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './parse.js',
  './tone.js',
  './prompts.js',
  './parsers/merged-forward.js',
  './manifest.webmanifest',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './assets/favicon-32.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== location.origin) return;   // API 请求直连，不缓存

  // 页面导航：网络优先
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((r) => {
          const copy = r.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          return r;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  // 静态资源：缓存优先
  e.respondWith(
    caches.match(req).then((hit) => {
      if (hit) return hit;
      return fetch(req).then((r) => {
        if (r && r.status === 200) {
          const copy = r.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        }
        return r;
      });
    })
  );
});
