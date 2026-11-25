const CACHE = 'c-mwwke6hk';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icon-180.png', './icon-192.png', './icon-512.png', './app.enc'];
// The dressed Pip the app draws for Pip's reminders (see pipFaceSave in the app). Kept across updates.
const FACE_CACHE = 'pip-face';
const FACE_KEY = '/__pip-face.png';

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k !== FACE_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (url.hostname === 'api.github.com' || url.hostname === 'raw.githubusercontent.com') return;
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res && res.status === 200 && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(e.request).then((hit) => hit || caches.match('./index.html')))
  );
});

// ---- Pip's daily reminder (Web Push from notes-relay) ----
// Payload: { title, body, outfit, url: './#pip' }. One notification at a time (tag pip-daily).
function pipFaceIcon() {
  return caches.open(FACE_CACHE)
    .then((c) => c.match(self.location.origin + FACE_KEY))
    .then((res) => (res ? res.arrayBuffer() : null))
    .then((buf) => {
      if (!buf) return null;
      const b = new Uint8Array(buf); let s = '';
      for (let i = 0; i < b.length; i += 8192) s += String.fromCharCode.apply(null, b.subarray(i, i + 8192));
      return 'data:image/png;base64,' + btoa(s);
    })
    .catch(() => null);
}
function pipPayload(data) {
  let d = {};
  try { d = data ? data.json() : {}; } catch (e) { try { d = { body: data.text() }; } catch (e2) { d = {}; } }
  return {
    title: String(d.title || 'Pip').slice(0, 60),
    body: String(d.body || 'Two quick cards with me?').slice(0, 240),
    url: typeof d.url === 'string' && d.url ? d.url : './#pip',
    outfit: String(d.outfit || '')
  };
}
self.addEventListener('push', (e) => {
  const p = pipPayload(e.data);
  e.waitUntil(pipFaceIcon().then((icon) => {
    const opts = { body: p.body, data: { url: p.url, body: p.body }, tag: 'pip-daily', renotify: true };
    if (icon) opts.icon = icon;   // no badge: the owner wants no badge counts or extra pings
    return self.registration.showNotification(p.title, opts);
  }));
});
// Open the app on the Pip tab with the notification's line in the hash (#pip=<line>), or hand the line
// to a window that is already open.
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const d = (e.notification && e.notification.data) || {};
  const base = new URL(d.url || './#pip', self.registration.scope);
  const line = String(d.body || '').slice(0, 220);
  base.hash = line ? 'pip=' + encodeURIComponent(line) : 'pip';
  const target = base.href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    const same = list.filter((c) => { try { return new URL(c.url).origin === base.origin; } catch (x) { return false; } });
    if (same.length) {
      const c = same[0];
      try { c.postMessage({ type: 'pip-open', line: line }); } catch (x) {}
      return c.focus ? c.focus() : c;
    }
    return self.clients.openWindow ? self.clients.openWindow(target) : null;
  }));
});
