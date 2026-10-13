// CFP Calendar service worker: uygulamayı ana ekrana kurulabilir yapar ve çevrim dışıyken kabuğu açar.
// GÜVENLİK: Yalnızca bu sitenin kendi statik dosyaları önbelleğe alınır. Supabase, Google ve diğer alan adlarına
// giden istekler (kişisel veri, oturum, takvim) hiçbir zaman önbelleğe alınmaz; tarayıcı normal şekilde ağa gider.

const CACHE = 'cfp-shell-v1';
const SHELL = new URL('./', self.location).href; // .../cfp-calendar/

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // başka alan adları: dokunma

  // Sayfa açılışı: önce ağ (güncel sürüm), ağ yoksa son kaydedilen kabuk
  if (req.mode === 'navigate') {
    const isShell = url.pathname.endsWith('/') || url.pathname.endsWith('/index.html');
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (isShell && res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(SHELL, copy));
          }
          return res;
        })
        .catch(() => caches.match(SHELL)),
    );
    return;
  }

  // Derleme çıktıları (adında içerik özeti var, hiç değişmez): önce önbellek
  if (url.pathname.includes('/assets/')) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(CACHE).then((c) => c.put(req, copy));
            }
            return res;
          }),
      ),
    );
  }
});
