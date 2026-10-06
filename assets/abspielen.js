/* Videos · family-projekt.de — Abspielen.
 *
 * Klaus 2026-10-05: „dass wir das dann laufen lassen können, mit einer Zeit, wie
 * jedes Video auch mit Stoppen, mit Weitermachen, mit Weiter vor, Weiter zurück.
 * Während des Abspielens soll das Video laden und wenn die Zeit nicht reicht,
 * soll es kurz vorladen."
 *
 * Das Video selbst kommt aus dem Service-Worker (sw.js): videos/<id>/abspielen.mp4
 * gibt es nicht als Datei, der Worker setzt es Teil für Teil aus den geprüften
 * Stücken zusammen. Diese Seite wartet deshalb, bis der Worker die Seite steuert,
 * und sagt es, wenn er das nicht tut. Texte nur über textContent.
 *
 * Dieselbe Datei läuft auf family-projekt.de (byte-1:1 kopiert). Was dort anders
 * ist, steht als Marke am <html>, nie im Code:
 *   data-video-quelle  wo videos.json und die Teile liegen (Vorgabe: hier)
 *   data-video-weg     die Abspiel-Adresse, {id} wird ersetzt
 *   data-video-sw      der Worker, der sie bedient (Vorgabe: sw.js)
 *   data-video-laden   wohin „Herunterladen" führt, {id} wird ersetzt */
(function () {
  "use strict";
  const KENNUNG = /^[a-z0-9][a-z0-9-]{1,59}$/;
  const $ = (s) => document.getElementById(s);
  const meldung = $("ab-meldung"), spieler = $("spieler"), vid = $("ab-video");
  const zeit = $("ab-zeit"), uhr = $("ab-uhr"), vorrat = $("ab-vorrat"), warte = $("ab-warte");
  const spielen = $("ab-spielen"), stopp = $("ab-stopp"), zur = $("ab-zurueck"), vor = $("ab-vor");
  const ton = $("ab-ton"), voll = $("ab-voll"), laden = $("ab-laden");

  const M = document.documentElement.dataset;
  const QUELLE = M.videoQuelle || "";
  const WEG = M.videoWeg || "videos/{id}/abspielen.mp4";
  const SW = M.videoSw || "sw.js";
  const LADEN = M.videoLaden || "index.html?laden={id}#video-{id}";
  const mit = (vorlage, id) => vorlage.split("{id}").join(encodeURIComponent(id));

  function melde(text, art) {
    meldung.textContent = text;
    if (art) meldung.dataset.art = art; else delete meldung.dataset.art;
  }
  function mmss(s) {
    if (!isFinite(s) || s < 0) s = 0;
    const m = Math.floor(s / 60), r = Math.floor(s % 60);
    return m + ":" + String(r).padStart(2, "0");
  }
  function vorgeladenBis() {
    const b = vid.buffered, t = vid.currentTime;
    for (let i = 0; i < b.length; i++) if (b.start(i) <= t + 0.25 && t <= b.end(i)) return b.end(i);
    return t;
  }
  let ziehen = false;
  function zeichne() {
    const d = isFinite(vid.duration) ? vid.duration : 0;
    zeit.max = String(d);
    if (!ziehen) zeit.value = String(vid.currentTime);
    uhr.textContent = mmss(vid.currentTime) + " / " + mmss(d);
    vorrat.textContent = "vorgeladen bis " + mmss(vorgeladenBis());
    spielen.textContent = vid.paused ? (vid.currentTime > 0 && !vid.ended ? "▶ Weiter" : "▶ Abspielen") : "⏸ Pause";
    spielen.setAttribute("aria-pressed", vid.paused ? "false" : "true");
    ton.textContent = vid.muted ? "🔇 Ton aus" : "🔊 Ton an";
  }
  function springe(s) {
    const d = isFinite(vid.duration) ? vid.duration : 0;
    vid.currentTime = Math.max(0, Math.min(d || 0, s));
    zeichne();
  }

  spielen.addEventListener("click", () => {
    if (vid.paused || vid.ended) { const p = vid.play(); if (p && p.catch) p.catch((e) => melde("Abspielen ging nicht: " + (e && e.message || e), "fehler")); }
    else vid.pause();
  });
  stopp.addEventListener("click", () => { vid.pause(); springe(0); });
  zur.addEventListener("click", () => springe(vid.currentTime - 10));
  vor.addEventListener("click", () => springe(vid.currentTime + 10));
  ton.addEventListener("click", () => { vid.muted = !vid.muted; zeichne(); });
  voll.addEventListener("click", () => {
    const z = vid.parentElement;
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else if (z.requestFullscreen) z.requestFullscreen().catch(() => {});
  });
  zeit.addEventListener("input", () => { ziehen = true; uhr.textContent = mmss(Number(zeit.value)) + " / " + mmss(vid.duration); });
  zeit.addEventListener("change", () => { ziehen = false; springe(Number(zeit.value)); });
  vid.addEventListener("click", () => spielen.click());

  ["timeupdate", "progress", "durationchange", "loadedmetadata", "play", "pause", "ended", "seeked", "volumechange"]
    .forEach((n) => vid.addEventListener(n, zeichne));
  vid.addEventListener("waiting", () => { warte.hidden = false; melde("Lädt kurz vor …"); });
  ["playing", "canplay", "seeked"].forEach((n) => vid.addEventListener(n, () => {
    if (!vid.seeking) { warte.hidden = true; if (meldung.dataset.art !== "fehler") melde(vid.paused ? "Bereit." : "Läuft — es lädt beim Abspielen weiter."); }
  }));
  vid.addEventListener("error", () => {
    warte.hidden = true;
    /* Eine Warnung davor (falsche Kennung) bleibt stehen, statt überschrieben zu werden. */
    const davor = meldung.dataset.art === "warn" ? meldung.textContent + " " : "";
    melde(davor + "Das Video lässt sich hier nicht abspielen. Herunterladen geht trotzdem: „Herunterladen“ antippen.", "fehler");
  });
  document.addEventListener("keydown", (e) => {
    if (spieler.hidden || /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test((e.target && e.target.tagName) || "")) return;
    if (e.key === " ") { e.preventDefault(); spielen.click(); }
    else if (e.key === "ArrowLeft") springe(vid.currentTime - 10);
    else if (e.key === "ArrowRight") springe(vid.currentTime + 10);
  });

  function gesteuert() {
    if (navigator.serviceWorker.controller) return Promise.resolve(true);
    return new Promise((ok) => {
      const t = setTimeout(() => ok(false), 15000);
      navigator.serviceWorker.addEventListener("controllerchange", () => { clearTimeout(t); ok(true); }, { once: true });
    });
  }

  async function start() {
    if (!("serviceWorker" in navigator)) {
      melde("Dieser Browser kann das Video hier nicht abspielen (kein Service-Worker). Herunterladen geht über die Startseite.", "warn");
      return;
    }
    let liste;
    try {
      const r = await fetch(QUELLE + "videos.json", { cache: "no-store" });
      if (!r.ok) throw new Error("Antwort " + r.status);
      liste = await r.json();
    } catch (e) {
      melde("Die Liste der Videos ist nicht erreichbar: " + (e && e.message || e), "fehler");
      return;
    }
    const videos = (liste && Array.isArray(liste.videos) ? liste.videos : []).filter((v) => v && KENNUNG.test(v.id || ""));
    const gefragt = new URLSearchParams(location.search).get("id");
    const v = videos.filter((x) => x.id === gefragt)[0] || videos[0];
    if (!v) { melde("Es ist kein Video eingetragen.", "warn"); return; }
    if (gefragt && v.id !== gefragt) melde("Das gefragte Video gibt es nicht — gezeigt wird „" + (v.titel || v.id) + "“.", "warn");
    if (v.titel) { $("ab-titel").textContent = v.titel; document.title = v.titel + " · family-projekt.de"; }
    if (v.beschreibung) $("ab-beschreibung").textContent = v.beschreibung;
    laden.href = mit(LADEN, v.id);
    if (v.vorschau && /^[a-z0-9./_-]+$/i.test(v.vorschau)) vid.poster = QUELLE + v.vorschau;

    try { await navigator.serviceWorker.register(SW); } catch (e) { /* unten benannt */ }
    if (!(await gesteuert())) {
      melde("Der Hintergrund-Helfer der Seite ist noch nicht bereit. Einmal neu laden (⟳), dann geht es. Herunterladen geht schon jetzt.", "warn");
      spieler.hidden = false;
      [spielen, stopp, zur, vor].forEach((b) => { b.disabled = true; });
      return;
    }
    vid.src = mit(WEG, v.id);
    spieler.hidden = false;
    if (!meldung.dataset.art) melde("Bereit. Es lädt beim Abspielen, Teil für Teil, jeder mit Prüfsumme.");
    zeichne();
  }
  window.__abspielen = { vid, springe };
  start();
})();
