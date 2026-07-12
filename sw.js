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

// ネットワーク優先：
//   ① まずネットから取得 → 成功したらキャッシュを更新して返す
//   ② ネットが繋がらない（オフライン）ときだけキャッシュを返す
self.addEventListener('fetch', e =>
  e.respondWith(
    fetch(e.request)
      .then(res => {
        caches.open(CACHE).then(c => c.put(e.request, res.clone()));
        return res;
      })
      .catch(() => caches.match(e.request))
  )
);
