/* APGENCO Coal Report — service worker.
   The app page is always fetched from the network first, so an updated
   dashboard reaches every device on the next refresh. The cached copy is
   only a fallback for when the device is offline.
   Report data (GitHub API, workbooks, index.json) is never cached. */
const SHELL = 'coal-shell-v3';
const FILES = ['./', './index.html', './manifest.json',
               './icon-192.png', './icon-512.png', './apple-touch-icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(SHELL)
      .then(c => Promise.all(FILES.map(f => c.add(f).catch(() => null))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== SHELL).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

/* the page can ask for an immediate update */
self.addEventListener('message', e => {
  if (e.data === 'skipWaiting') self.skipWaiting();
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  /* never touch report data or API calls */
  if (/api\.github\.com|raw\.githubusercontent\.com|\.xlsx$|index\.json$/i.test(url.href)) return;
  if (url.origin !== location.origin) return;

  const isPage = req.mode === 'navigate' ||
                 /\.html?$/i.test(url.pathname) ||
                 url.pathname.endsWith('/');

  if (isPage) {
    /* network first — the newest dashboard always wins */
    e.respondWith(
      fetch(req, { cache: 'no-store' })
        .then(res => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(SHELL).then(c => c.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match(req).then(hit => hit || caches.match('./index.html')))
    );
    return;
  }

  /* icons and the manifest: cache first, refresh quietly */
  e.respondWith(
    caches.match(req).then(hit => {
      const net = fetch(req).then(res => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(SHELL).then(c => c.put(req, copy));
        }
        return res;
      }).catch(() => hit);
      return hit || net;
    })
  );
});
