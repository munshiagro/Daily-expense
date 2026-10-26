const VERSION = "v5";
const SHELL_CACHE = `hisab-green-shell-${VERSION}`;
const RUNTIME_CACHE = `hisab-green-runtime-${VERSION}`;
const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-512-maskable.png",
  "./icons/apple-touch-icon.png",
  "./icons/favicon-32.png",
  "./favicon.ico"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      // একটি ফাইল (যেমন আইকন) না পেলেও ইনস্টল যেন ব্যর্থ না হয়
      .then(cache => Promise.allSettled(APP_SHELL.map(url => cache.add(url))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== SHELL_CACHE && k !== RUNTIME_CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// HTML: আগে নেটওয়ার্ক (সবসময় নতুন সংস্করণ), ধীর/অফলাইন হলে ক্যাশ
async function networkFirst(req) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const res = await Promise.race([
      fetch(req),
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 4000))
    ]);
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  } catch (err) {
    return (await cache.match(req, { ignoreSearch: true }))
      || (await cache.match("./index.html"))
      || (await cache.match("./"))
      || Response.error();
  }
}

// আইকন/ম্যানিফেস্ট: ক্যাশ থেকে দ্রুত দেখাবে, পেছনে আপডেট করবে
async function staleWhileRevalidate(req) {
  const cache = await caches.open(SHELL_CACHE);
  const cached = await cache.match(req);
  const fresh = fetch(req).then(res => {
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  }).catch(() => null);
  return cached || (await fresh) || Response.error();
}

// Firebase SDK (সংস্করণ নম্বরসহ URL): একবার ক্যাশ হলে অফলাইনেও লোড হবে
async function cacheFirst(req) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(req);
  if (cached) return cached;
  try {
    const res = await fetch(req);
    if (res && (res.ok || res.type === "opaque")) cache.put(req, res.clone());
    return res;
  } catch (err) {
    return Response.error();
  }
}

self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  if (url.origin === self.location.origin) {
    if (req.mode === "navigate") event.respondWith(networkFirst(req));
    else if (url.pathname.endsWith("/sw.js")) return;
    else event.respondWith(staleWhileRevalidate(req));
    return;
  }

  if (url.hostname === "www.gstatic.com" && url.pathname.startsWith("/firebasejs/")) {
    event.respondWith(cacheFirst(req));
  }
  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    event.respondWith(cacheFirst(req));
  }
  // Firestore/Auth API কল সরাসরি নেটওয়ার্কে যাবে
});
