/* Videos · family-projekt.de — Service-Worker.
 *
 * Er hält NUR die Schale (Seite, Stil, Skript, Symbole), damit die App sich
 * öffnet, auch wenn das Netz gerade weg ist. Zwei Dinge fasst er nie an:
 *   · videos/ — die Teile sind zusammen hunderte MB groß. Sie gehen an ihm
 *     vorbei direkt ins Netz und landen in keinem Vorrat.
 *   · videos.json — immer frisch aus dem Netz (die Seite fragt mit no-store);
 *     eine eingefrorene Liste zeigte Videos, die es nicht mehr gibt.
 * Wer eine Datei aus SCHALE ändert, erhöht CACHE_VERSION (und die ?v= in der Seite). */
const CACHE_VERSION = "fp-videos-v3";
const SCHALE = [
  "./",
  "index.html",
  "assets/stil.css?v=2",
  "assets/laden.js?v=3",
  "manifest.webmanifest",
  "icons/icon-192.png?v=1",
  "icons/icon-512.png?v=1",
  "icons/maskable-512.png?v=1",
  "icons/apple-touch-icon.png?v=1",
  "icons/favicon-48.png?v=1"
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE_VERSION).then((c) => c.addAll(SCHALE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((namen) => Promise.all(namen.filter((n) => n.startsWith("fp-videos-") && n !== CACHE_VERSION).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

function istSchale(url) {
  const basis = new URL("./", self.registration.scope).href;
  if (!url.href.startsWith(basis)) return false;
  const pfad = url.href.slice(basis.length).split("#")[0];
  return SCHALE.includes(pfad) || pfad === "" || pfad.split("?")[0] === "index.html";
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  const basis = new URL("./", self.registration.scope);
  const rest = url.pathname.startsWith(basis.pathname) ? url.pathname.slice(basis.pathname.length) : null;
  if (rest === null) return;
  /* Videos und Liste: nie anfassen, nie ablegen. */
  if (rest.startsWith("videos/") || rest === "videos.json") return;
  if (req.mode === "navigate") {
    /* Seite: Netz zuerst, offline der Vorrat. */
    e.respondWith(fetch(req).catch(() => caches.match("index.html").then((r) => r || caches.match("./"))));
    return;
  }
  if (!istSchale(url)) return;
  e.respondWith(caches.match(req).then((r) => r || fetch(req)));
});
