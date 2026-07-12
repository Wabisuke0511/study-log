// キャッシュ名：index.html を更新するたびにここの番号を上げる
const CACHE = 'study-tracker-v1';

// インストール直後に即アクティブ化（待機しない）
self.addEventListener('install', () => self.skipWaiting());

// 古いキャッシュをまとめて削除してから、全クライアントを掌握する
self.addEventListener('activate', e =>
  e.waitUntil(
    caches.keys()
      .then(keys =>
        Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  )
);

// ネットワーク優先（同一オリジンのみ）：
//   外部API（Supabase等）は SW を素通りさせる
self.addEventListener('fetch', e => {
  if (!e.request.url.startsWith(self.location.origin)) return;
  e.respondWith(
    fetch(e.request)
      .then(res => {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
