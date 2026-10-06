/* Videos · family-projekt.de — Service-Worker.
 *
 * Er hält NUR die Schale (Seite, Stil, Skript, Symbole), damit die App sich
 * öffnet, auch wenn das Netz gerade weg ist. Zwei Dinge fasst er nie an:
 *   · videos/ — die Teile sind zusammen hunderte MB groß. Sie gehen an ihm
 *     vorbei direkt ins Netz und landen in keinem Vorrat.
 *   · videos.json — immer frisch aus dem Netz (die Seite fragt mit no-store);
 *     eine eingefrorene Liste zeigte Videos, die es nicht mehr gibt.
 *
 * Eine Ausnahme, und sie legt ebenfalls nichts ab: videos/<kennung>/abspielen.mp4
 * gibt es nicht als Datei. Der Worker setzt es beim Abspielen aus den geprüften
 * Teilen zusammen (Klaus 2026-10-05: „während des Abspielens soll das Video
 * laden"). Er antwortet auf Range-Anfragen mit 206, holt je Anfrage nur den Teil,
 * in dem die Stelle liegt, prüft dessen SHA-256 und hält höchstens drei Teile im
 * Arbeitsspeicher — nie in der Cache Storage.
 * Wer eine Datei aus SCHALE ändert, erhöht CACHE_VERSION (und die ?v= in der Seite). */
const CACHE_VERSION = "fp-videos-v11";
const SCHALE = [
  "./",
  "index.html",
  "assets/stil.css?v=4",
  "assets/laden.js?v=8",
  "abspielen.html",
  "assets/abspielen.js?v=4",
  "assets/abspielen-kern.js?v=2",
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


/* ── Abspielen: das Zusammensetzen steht in assets/abspielen-kern.js (auch für family-projekt.de) ── */
importScripts("assets/abspielen-kern.js?v=2");
const ABSPIEL = /^videos\/([a-z0-9][a-z0-9-]{1,59})\/abspielen\.mp4$/;
const TEIL = /^videos\/([a-z0-9][a-z0-9-]{1,59})\/teil-(\d{2})\.bin$/;

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  const basis = new URL("./", self.registration.scope);
  const rest = url.pathname.startsWith(basis.pathname) ? url.pathname.slice(basis.pathname.length) : null;
  if (rest === null) return;
  const abs = ABSPIEL.exec(rest);
  if (abs) { e.respondWith(self.FPAbspielKern.antwort(req, abs[1], new URL("./", self.registration.scope).href)); return; }
  /* Ein Teil, den der Abspiel-Kern schon hält (oder gerade holt), kommt von dort —
     dieselben Bytes nicht zweimal übers Netz. Sonst wie bisher am Worker vorbei. */
  const tl = TEIL.exec(rest);
  if (tl) { const a = self.FPAbspielKern.ausVorrat(req, tl[1], Number(tl[2]), new URL("./", self.registration.scope).href); if (a) { e.respondWith(a); return; } }
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
