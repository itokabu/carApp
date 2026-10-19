// 画面のファイルとデータはネット優先（最新を取りに行き、オフライン時はキャッシュ）、
// 写真はキャッシュ優先で表示を速くする
const SHELL = 'shell-v5';
const PHOTOS = 'photos-v1';
const MAX_PHOTOS = 400;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(['./', 'index.html', 'style.css', 'app.js', 'icon.svg'])));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => ![SHELL, PHOTOS].includes(k)).map((k) => caches.delete(k)))));
  self.clients.claim();
});

async function networkFirst(req) {
  const cache = await caches.open(SHELL);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch {
    return (await cache.match(req, { ignoreSearch: true })) ?? Response.error();
  }
}

async function cacheFirst(req) {
  const cache = await caches.open(PHOTOS);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) {
    cache.put(req, res.clone());
    const keys = await cache.keys();
    for (const k of keys.slice(0, Math.max(0, keys.length - MAX_PHOTOS))) cache.delete(k);
  }
  return res;
}

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (url.hostname === 'upload.wikimedia.org') e.respondWith(cacheFirst(e.request));
  // 画面のファイルと、別の場所（GitHub Pages）に置いた車のデータ
  else if (url.origin === location.origin || url.hostname.endsWith('.github.io')) e.respondWith(networkFirst(e.request));
});
