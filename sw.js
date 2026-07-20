// キャッシュ名：デプロイのたびに更新する（app versionと合わせる）
const CACHE = 'study-tracker-v16';

// インストール直後に即アクティブ化
self.addEventListener('install', () => self.skipWaiting());

// 古いキャッシュを削除してから全クライアントを掌握
self.addEventListener('activate', e =>
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  )
);

self.addEventListener('fetch', e => {
  if (!e.request.url.startsWith(self.location.origin)) return;

  // ナビゲーション（index.html）は常にネットワーク優先・キャッシュしない
  // → デプロイ後すぐに最新版が反映される
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request).catch(() => caches.match(e.request))
    );
    return;
  }

  // その他のリソース（manifest.json等）はネットワーク優先でキャッシュ
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
