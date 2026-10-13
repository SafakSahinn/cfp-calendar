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

// --- Anlık bildirimler (Web Push) ---------------------------------------------------------------
// Sunucu yalnızca başlık, kısa metin ve site içi yol gönderir; kişisel veri taşımaz.
self.addEventListener('push', (event) => {
  let msg = { title: 'CFP Calendar', body: '', url: '#/mesajlar', tag: 'cfp' };
  try {
    msg = { ...msg, ...event.data.json() };
  } catch {
    // boş veya bozuk içerik: varsayılan mesaj
  }
  const url = typeof msg.url === 'string' && msg.url.startsWith('#/') ? msg.url : '#/mesajlar';
  event.waitUntil(
    self.registration.showNotification(String(msg.title).slice(0, 120), {
      body: String(msg.body).slice(0, 300),
      tag: String(msg.tag).slice(0, 80),
      icon: new URL('icon-192.png', SHELL).href,
      badge: new URL('icon-192.png', SHELL).href,
      data: { url: SHELL + url },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = event.notification.data?.url ?? SHELL;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      const open = wins.find((w) => w.url.startsWith(SHELL));
      if (open) {
        open.navigate(target).catch(() => {});
        return open.focus();
      }
      return self.clients.openWindow(target);
    }),
  );
});
