#!/usr/bin/env node
/* Probe im echten Browser: Laden, Prüfsummen, Fehler und Weiterladen, Offline,
 * ⟳, Installieren, Bewegung.
 *
 *   node tests/browser.mjs
 *
 * Drei Ausgänge, nicht zwei:
 *   ✓ grün             die Zusicherung hält
 *   ✗ ROT              sie hält nicht — nur das zählt als Befund (Rückgabe 1)
 *   ⊘ nicht lauffähig  Browser oder ffmpeg fehlen — ungeprüft, nicht grün (Rückgabe 2)
 *
 * Zwei Bäume:
 *   1 · der ECHTE Baum: das echte Video, alle Teile, die heruntergeladene Datei
 *       wird gegen die Prüfsumme aus videos.json gerechnet.
 *   2 · eine Wegwerf-Kopie mit Testvideos aus ffmpeg. Dort stellt der Server
 *       Störungen (kaputter Teil, 404, zu kurz, langsam, ganz aus), damit die
 *       Fehlerwege wirklich gefahren werden statt nur gelesen.
 *
 * Gewartet wird auf Bedingungen, nicht auf die Uhr. Wo eine Frist steht, ist sie
 * die Obergrenze eines Wartens auf eine Bedingung. */
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { createReadStream, cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import http from "node:http";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const WURZEL = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const NODE = process.execPath;
let gruen = 0, rot = 0, stumm = 0;
function ok(name, bedingung, mehr) {
  if (bedingung) { gruen++; console.log("  ✓ " + name); }
  else { rot++; console.log("  ✗ ROT: " + name + (mehr !== undefined ? "  → " + mehr : "")); }
}
function nichtLauffaehig(name, grund) { stumm++; console.log("  ⊘ nicht lauffähig: " + name + " — " + grund); }
function kopf(t) { console.log("\n" + t); }
function schluss() {
  console.log(`\n${gruen} grün · ${rot} ROT · ${stumm} nicht lauffähig`);
  process.exitCode = rot ? 1 : stumm ? 2 : 0;
}
const sha = (b) => createHash("sha256").update(b).digest("hex");
function shaDatei(pfad) {
  return new Promise((ja, nein) => {
    const h = createHash("sha256");
    createReadStream(pfad).on("data", (d) => h.update(d)).on("end", () => ja(h.digest("hex"))).on("error", nein);
  });
}

/* ── Playwright finden: erst neben der Probe, dann die global installierte Fassung ── */
function holePlaywright() {
  const wege = [
    () => createRequire(import.meta.url)("playwright-core"),
    () => createRequire(import.meta.url)("playwright"),
    () => createRequire("/opt/node22/lib/node_modules/")("playwright"),
    () => createRequire("/opt/node22/lib/node_modules/")("playwright-core")
  ];
  for (const w of wege) { try { const m = w(); if (m && m.chromium) return m; } catch (_e) {} }
  return null;
}
async function starteBrowser(pw) {
  try { return await pw.chromium.launch(); } catch (e1) {
    const kandidaten = ["/opt/pw-browsers/chromium-1194/chrome-linux/chrome", "/opt/pw-browsers/chromium/chrome-linux/chrome"];
    for (const k of kandidaten) {
      if (!existsSync(k)) continue;
      try { return await pw.chromium.launch({ executablePath: k }); } catch (_e) {}
    }
    throw e1;
  }
}

/* ── ein kleiner Server, der Störungen stellen kann ──
 *   stoerung: Pfad → { art: "kaputt" | "404" | "kurz" | "warte", mal: n | Infinity, ms }
 *   aus:      jede Anfrage wird abgerissen (wie ein Netz, das weg ist) */
const TYPEN = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".webmanifest": "application/manifest+json", ".png": "image/png",
  ".jpg": "image/jpeg", ".bin": "application/octet-stream", ".mp4": "video/mp4", ".svg": "image/svg+xml"
};
function starteServer(root) {
  const log = [];
  const stoerung = new Map();
  const zustand = { aus: false };
  const server = http.createServer(async (req, res) => {
    if (zustand.aus) { req.socket.destroy(); return; }
    const url = new URL(req.url, "http://probe");
    log.push(url.pathname + url.search);
    let pfad;
    try { pfad = decodeURIComponent(url.pathname); } catch (_e) { res.writeHead(400); res.end(); return; }
    if (pfad.endsWith("/")) pfad += "index.html";
    const datei = resolve(root, "." + pfad);
    if (datei !== root && !datei.startsWith(root + sep)) { res.writeHead(403); res.end(); return; }
    if (!existsSync(datei) || !statSync(datei).isFile()) { res.writeHead(404); res.end("nicht da"); return; }
    let body = readFileSync(datei);
    const s = stoerung.get(url.pathname);
    if (s && s.mal > 0) {
      s.mal--;
      if (s.art === "404") { res.writeHead(404); res.end("gestellt"); return; }
      if (s.art === "kaputt") { body = Buffer.from(body); for (let i = 0; i < Math.min(64, body.length); i++) body[i] ^= 0xff; }
      if (s.art === "kurz") body = body.subarray(0, body.length - 1);
      if (s.art === "warte") await new Promise((r) => setTimeout(r, s.ms || 1500));
    }
    res.writeHead(200, { "Content-Type": TYPEN[extname(datei)] || "application/octet-stream", "Content-Length": body.length });
    res.end(body);
  });
  return new Promise((ja) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      ja({
        url: `http://127.0.0.1:${port}/`, log, stoerung, zustand,
        anzahl: (p) => log.filter((l) => l.split("?")[0] === p).length,
        close: () => new Promise((r) => { server.closeAllConnections?.(); server.close(() => r()); })
      });
    });
  });
}

/* ── Hilfen für die Seite ── */
async function oeffne(ctx, url) {
  const p = await ctx.newPage();
  const fehler = [];
  p.on("pageerror", (e) => fehler.push(String(e)));
  await p.goto(url, { waitUntil: "load" });
  await p.waitForFunction(() => window.__videos && (window.__videos.bereit || document.getElementById("liste-meldung").getAttribute("data-art") === "fehler"), null, { timeout: 30000 });
  p.__fehler = fehler;
  return p;
}
const karteSel = (id) => `article.video[data-id="${id}"]`;
async function karteLage(p, id) {
  return p.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const k = window.__videos.karten.find((x) => x.el === el);
    const f = (n) => el.querySelector(`[data-feld="${n}"]`);
    return {
      lage: el.getAttribute("data-lage"),
      stand: f("stand").textContent,
      meldung: f("meldung").textContent,
      meldungArt: f("meldung").getAttribute("data-art"),
      ladenText: el.querySelector('[data-knopf="laden"]').textContent,
      ladenAus: el.querySelector('[data-knopf="laden"]').disabled,
      speichernAus: el.querySelector('[data-knopf="speichern"]').disabled,
      streifen: [...el.querySelectorAll(".streifen .feld")].map((s) => s.getAttribute("data-lage")),
      holZaehler: k ? k.holZaehler.slice() : null,
      hatBlob: k ? !!k.blob : null
    };
  }, karteSel(id));
}
async function warteLage(p, id, lagen, frist) {
  await p.waitForFunction(([sel, l]) => {
    const el = document.querySelector(sel);
    return el && l.includes(el.getAttribute("data-lage"));
  }, [karteSel(id), lagen], { timeout: frist || 60000 });
}
const klick = (p, id, knopf) => p.click(`${karteSel(id)} [data-knopf="${knopf}"]`);

/* Zeilen eines Feldes, so wie man sie sieht: verschiedene Oberkanten der Textkästen */
async function sichtbareZeilen(p) {
  return p.evaluate(() => [...document.querySelectorAll(".klappe dd")].map((dd) => {
    const r = document.createRange(); r.selectNodeContents(dd);
    const tops = [];
    for (const x of r.getClientRects()) {
      if (x.width < 0.5) continue;
      if (!tops.some((t) => Math.abs(t - x.top) < 3)) tops.push(x.top);
    }
    return { feld: dd.getAttribute("data-feld"), text: dd.textContent, zeilen: tops.length, soll: dd.textContent.split("\n").length };
  }));
}
async function querlauf(p) {
  return p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

/* ══════════════════════════════════════════════════════════════════════ */
const pw = holePlaywright();
if (!pw) {
  nichtLauffaehig("Browser-Probe", "playwright ist nicht installiert");
  schluss(); process.exit();
}
let browser;
try { browser = await starteBrowser(pw); } catch (e) {
  nichtLauffaehig("Browser-Probe", "Chromium startet nicht: " + String(e.message || e).split("\n")[0]);
  schluss(); process.exit();
}

const aufraeumen = [];
try {
  /* ════ 1 · der echte Baum ════ */
  kopf("1 · der echte Baum: das echte Video, Teil für Teil");
  const liste = JSON.parse(readFileSync(join(WURZEL, "videos.json"), "utf8"));
  const echt = liste.videos[0];
  const srv = await starteServer(WURZEL);
  aufraeumen.push(() => srv.close());
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
  aufraeumen.push(() => ctx.close());
  const p = await oeffne(ctx, srv.url);
  const nKarten = await p.$$eval("article.video", (a) => a.length);
  ok(`so viele Karten wie Videos in der Liste (${liste.videos.length})`, nKarten === liste.videos.length, nKarten);
  const nTeile = await p.$$eval(`${karteSel(echt.id)} .streifen .feld`, (a) => a.length);
  ok(`der Streifen hat ${echt.teile.length} Felder`, nTeile === echt.teile.length, nTeile);

  await p.$eval(`${karteSel(echt.id)} .vorschau`, (el) => el.scrollIntoView());
  let bildDa = false;
  try {
    await p.waitForFunction((sel) => { const i = document.querySelector(sel + " .vorschau img"); return i && i.complete && i.naturalWidth > 0; }, karteSel(echt.id), { timeout: 15000 });
    bildDa = true;
  } catch (_e) {}
  ok("das Vorschaubild lädt (naturalWidth > 0)", bildDa);

  for (const breite of [1280, 360]) {
    await p.setViewportSize({ width: breite, height: 900 });
    await p.waitForTimeout(50); /* ein Bild zum Umbrechen; gemessen wird danach, nicht geraten */
    const z = await sichtbareZeilen(p);
    const falsch = z.filter((x) => x.zeilen !== x.soll);
    ok(`bei ${breite} px: jedes Feld der Daten hat so viele Zeilen wie Angaben (keine Angabe bricht mittendrin um)`,
      z.length === 5 * liste.videos.length && falsch.length === 0, JSON.stringify(falsch.length ? falsch : z));
    const q = await querlauf(p);
    ok(`bei ${breite} px: kein waagerechtes Rollen`, q <= 0, q + " px");
  }
  await p.setViewportSize({ width: 1280, height: 900 });

  await klick(p, echt.id, "laden");
  await warteLage(p, echt.id, ["fertig", "fehler"], 180000);
  const l1 = await karteLage(p, echt.id);
  ok("echtes Video: alle Teile geprüft (fertig)", l1.lage === "fertig", JSON.stringify({ lage: l1.lage, meldung: l1.meldung }));
  ok("echtes Video: jedes Feld des Streifens ist „ok“", l1.streifen.length === echt.teile.length && l1.streifen.every((s) => s === "ok"), JSON.stringify(l1.streifen));
  ok(`echtes Video: Stand nennt ${echt.teile.length} von ${echt.teile.length}`, l1.stand.startsWith(`${echt.teile.length} von ${echt.teile.length} Teilen geprüft`), l1.stand);
  ok("echtes Video: Meldung ist eine gute", l1.meldungArt === "gut", l1.meldungArt);
  const mehrfach = echt.teile.map((_, i) => srv.anzahl(`/videos/${echt.id}/teil-${String(i).padStart(2, "0")}.bin`)).filter((n) => n !== 1);
  ok("echtes Video: jeder Teil wurde genau einmal vom Server geholt", mehrfach.length === 0, JSON.stringify(mehrfach));

  const [dl] = await Promise.all([p.waitForEvent("download", { timeout: 60000 }), klick(p, echt.id, "speichern")]);
  ok("Download heißt wie in der Liste", dl.suggestedFilename() === echt.dateiname, dl.suggestedFilename());
  const dlPfad = await dl.path();
  const dlGroesse = statSync(dlPfad).size;
  ok(`Download ist ${echt.groesse} Bytes groß`, dlGroesse === echt.groesse, dlGroesse);
  const dlSha = await shaDatei(dlPfad);
  ok("Download hat die SHA-256 der ganzen Datei aus der Liste", dlSha === echt.sha256, dlSha);
  const letzt = await p.evaluate(() => window.__videos.letzterDownload);
  ok("die Seite vermerkt, was sie gespeichert hat", letzt && letzt.id === echt.id && letzt.name === echt.dateiname && letzt.groesse === echt.groesse, JSON.stringify(letzt));
  /* Klaus 2026-10-02: „dreimal gespeichert, weil es nicht angezeigt wurde" — ein zweiter Tipp gleich danach lädt nicht noch einmal */
  let zweiter = 0; const zaehle = () => { zweiter++; }; p.on("download", zaehle);
  await klick(p, echt.id, "speichern"); await p.waitForTimeout(1500); p.off("download", zaehle);
  const dop = { n: await p.evaluate(() => window.__videos.doppelGesperrt || 0), m: (await karteLage(p, echt.id)).meldung };
  ok("zweiter Tipp auf Speichern gleich danach: kein zweiter Download, aber eine Meldung", zweiter === 0 && dop.n === 1 && /Schon gespeichert/.test(dop.m), `Downloads ${zweiter} · gesperrt ${dop.n} · ${dop.m.slice(0, 60)}`);
  ok("keine Skriptfehler im echten Baum", p.__fehler.length === 0, p.__fehler.join(" | "));
  await ctx.close(); aufraeumen.pop();
  await srv.close(); aufraeumen.pop();

  /* ════ 2 · die Wegwerf-Kopie ════ */
  kopf("2 · eine Wegwerf-Kopie mit Testvideos und gestellten Störungen");
  const hatFfmpeg = spawnSync("ffmpeg", ["-version"]).status === 0 && spawnSync("ffprobe", ["-version"]).status === 0;
  if (!hatFfmpeg) {
    nichtLauffaehig("Fehlerwege, Offline, ⟳, Installieren, Bewegung", "ffmpeg/ffprobe fehlen — ohne Testvideo misst dieser Teil nichts");
  } else {
    const tmp = mkdtempSync(join(tmpdir(), "fp-videos-browser-"));
    aufraeumen.push(() => rmSync(tmp, { recursive: true, force: true }));
    const kopie = join(tmp, "depot");
    for (const n of ["index.html", "sw.js", "manifest.webmanifest", ".nojekyll", "assets", "icons", "tools"]) {
      if (existsSync(join(WURZEL, n))) cpSync(join(WURZEL, n), join(kopie, n), { recursive: true });
    }
    writeFileSync(join(kopie, "videos.json"), JSON.stringify({ fassung: 1, videos: [] }, null, 2) + "\n");
    const film = join(tmp, "film.mp4");
    execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "testsrc2=size=320x240:rate=25", "-f", "lavfi",
      "-i", "sine=frequency=440:sample_rate=44100", "-t", "2", "-c:v", "libx264", "-b:v", "2M", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", film]);
    const filmSha = sha(readFileSync(film));
    const tool = join(kopie, "tools/video-aufnehmen.mjs");
    const lauf = (args, env) => spawnSync(NODE, [tool, ...args], { encoding: "utf8", env: env || process.env, cwd: tmp });
    for (const id of ["probe-c", "probe-b", "probe-a"]) {
      const r = lauf([film, "--id", id, "--titel", "Probe " + id.slice(-1).toUpperCase(), "--teil", "20000"]);
      ok(`Werkzeug nimmt ${id} auf`, r.status === 0, r.stderr);
    }
    const XSS = '<img src=x onerror="window.__xss=1"> Ohne Messung';
    const rOhne = lauf([film, "--id", "probe-ohne", "--titel", XSS, "--teil", "20000"], { ...process.env, PATH: dirname(NODE) });
    ok("Werkzeug nimmt probe-ohne ohne ffprobe auf", rOhne.status === 0, rOhne.stderr);
    const lj = JSON.parse(readFileSync(join(kopie, "videos.json"), "utf8"));
    lj.videos.push({ id: "kaputt-eintrag", titel: "Unvollständig", teile: [], groesse: 0, sha256: "x", dateiname: "x.mp4" });
    writeFileSync(join(kopie, "videos.json"), JSON.stringify(lj, null, 2) + "\n");
    const va = lj.videos.find((v) => v.id === "probe-a");
    const N = va.teile.length;
    ok(`Testvideo zerfällt in mehr als 4 Teile (${N})`, N > 4);
    const teil = (id, i) => `/videos/${id}/teil-${String(i).padStart(2, "0")}.bin`;

    const s2 = await starteServer(kopie);
    aufraeumen.push(() => s2.close());
    const c2 = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
    aufraeumen.push(() => c2.close());
    const q = await oeffne(c2, s2.url);
    let mitWorker = false;
    try { await q.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 15000 }); mitWorker = true; } catch (_e) {}
    ok("der Service-Worker übernimmt die Seite, bevor geladen wird (sonst misst „nie im Vorrat“ nichts)", mitWorker);

    kopf("2a · Liste: unvollständiger Eintrag, fremder Titel");
    ok("4 Karten — der unvollständige Eintrag fehlt", (await q.$$eval("article.video", (a) => a.length)) === 4);
    const lm = await q.evaluate(() => ({ t: document.getElementById("liste-meldung").textContent, a: document.getElementById("liste-meldung").getAttribute("data-art") }));
    ok("die Liste sagt, dass ein Eintrag nicht gezeigt wird", lm.a === "warn" && /1 Eintrag\/Einträge in der Liste sind unvollständig/.test(lm.t), JSON.stringify(lm));
    const h2 = await q.$eval(`${karteSel("probe-ohne")} h2`, (el) => ({ text: el.textContent, img: el.querySelectorAll("img").length }));
    ok("ein Titel mit Markup steht als Text da", h2.text.includes("<img") && h2.img === 0, JSON.stringify(h2));
    ok("… und sein Skript lief nicht", (await q.evaluate(() => window.__xss)) === undefined);

    kopf("2b · Probe A: ein Teil kommt immer kaputt an — dann weiterladen");
    s2.stoerung.set(teil("probe-a", 2), { art: "kaputt", mal: Infinity });
    await klick(q, "probe-a", "laden");
    await warteLage(q, "probe-a", ["fehler", "fertig"]);
    let a1 = await karteLage(q, "probe-a");
    ok("A: Lage „fehler“", a1.lage === "fehler", a1.lage);
    ok("A: Meldung nennt „Prüfsumme stimmt nicht“", a1.meldungArt === "fehler" && /Teil 3 kam nicht richtig an \(Prüfsumme stimmt nicht\)/.test(a1.meldung), a1.meldung);
    ok("A: Knopf heißt „Weiter laden“ und ist an", a1.ladenText === "Weiter laden" && !a1.ladenAus, JSON.stringify([a1.ladenText, a1.ladenAus]));
    ok("A: Teil 3 wurde dreimal versucht", a1.holZaehler[2] === 3, JSON.stringify(a1.holZaehler));
    ok("A: der Server sah Teil 1 und 2 je einmal, Teil 3 dreimal, Teil 4 nie",
      s2.anzahl(teil("probe-a", 0)) === 1 && s2.anzahl(teil("probe-a", 1)) === 1 && s2.anzahl(teil("probe-a", 2)) === 3 && s2.anzahl(teil("probe-a", 3)) === 0,
      [0, 1, 2, 3].map((i) => s2.anzahl(teil("probe-a", i))).join(","));
    ok("A: Streifen zeigt ok, ok, fehler", a1.streifen[0] === "ok" && a1.streifen[1] === "ok" && a1.streifen[2] === "fehler" && a1.streifen[3] === null, JSON.stringify(a1.streifen));
    ok(`A: Stand „2 von ${N} Teilen geprüft“`, a1.stand === `2 von ${N} Teilen geprüft`, a1.stand);
    ok("A: Speichern bleibt aus", a1.speichernAus);

    s2.stoerung.delete(teil("probe-a", 2));
    await klick(q, "probe-a", "laden");
    await warteLage(q, "probe-a", ["fertig", "fehler"]);
    a1 = await karteLage(q, "probe-a");
    ok("A: nach „Weiter laden“ fertig", a1.lage === "fertig", JSON.stringify({ lage: a1.lage, meldung: a1.meldung }));
    ok("A: Teil 1 und 2 wurden NICHT noch einmal geholt", s2.anzahl(teil("probe-a", 0)) === 1 && s2.anzahl(teil("probe-a", 1)) === 1,
      [0, 1].map((i) => s2.anzahl(teil("probe-a", i))).join(","));
    ok("A: Teil 3 im vierten Versuch", a1.holZaehler[2] === 4 && s2.anzahl(teil("probe-a", 2)) === 4, JSON.stringify(a1.holZaehler));
    /* Nur speichern, wenn wirklich fertig: sonst wartete die Probe 30 s auf einen
       Download, der nie kommt, und stolperte — alles dahinter (Vorrat, offline,
       ⟳) bliebe ungemessen (Gegenprobe VORRAT, 2026-10-02). */
    if (a1.lage === "fertig") {
      const [dA] = await Promise.all([q.waitForEvent("download", { timeout: 30000 }), klick(q, "probe-a", "speichern")]);
      ok("A: die gespeicherte Datei ist das Testvideo, Byte für Byte", (await shaDatei(await dA.path())) === filmSha);
      ok("A: Dateiname aus der Liste", dA.suggestedFilename() === va.dateiname, dA.suggestedFilename());
    } else {
      ok("A: die gespeicherte Datei ist das Testvideo, Byte für Byte", false, "nicht gespeichert — Lage " + a1.lage);
      ok("A: Dateiname aus der Liste", false, "nicht gespeichert — Lage " + a1.lage);
    }

    kopf("2c · Probe B: ein Teil einmal kaputt, einer langsam — die anderen warten");
    s2.stoerung.set(teil("probe-b", 1), { art: "kaputt", mal: 1 });
    s2.stoerung.set(teil("probe-b", 3), { art: "warte", mal: 1, ms: 1500 });
    await klick(q, "probe-b", "laden");
    await q.waitForFunction((sel) => {
      const f = document.querySelectorAll(sel + " .streifen .feld");
      return f[3] && f[3].getAttribute("data-lage") === "laedt";
    }, karteSel("probe-b"), { timeout: 30000 });
    const waehrend = await q.evaluate(() => [...document.querySelectorAll("article.video")].map((el) => ({ id: el.getAttribute("data-id"), aus: el.querySelector('[data-knopf="laden"]').disabled })));
    ok("B lädt: alle anderen Laden-Knöpfe sind aus", waehrend.filter((x) => x.id !== "probe-b").every((x) => x.aus), JSON.stringify(waehrend));
    const aFrei = await karteLage(q, "probe-a");
    ok("B lädt: A ist freigegeben (kein Blob, Speichern aus, Warnung)",
      aFrei.lage === null && !aFrei.hatBlob && aFrei.speichernAus && aFrei.meldungArt === "warn" && /^Freigegeben/.test(aFrei.meldung) && aFrei.ladenText === "Schlicht laden",
      JSON.stringify(aFrei));
    ok("B lädt: A's Streifen ist wieder leer", aFrei.streifen.every((s) => s === null), JSON.stringify(aFrei.streifen));
    await warteLage(q, "probe-b", ["fertig", "fehler"]);
    const b1 = await karteLage(q, "probe-b");
    ok("B: fertig, obwohl Teil 2 einmal kaputt kam", b1.lage === "fertig", JSON.stringify({ lage: b1.lage, meldung: b1.meldung }));
    ok("B: Teil 2 im zweiten Versuch", b1.holZaehler[1] === 2, JSON.stringify(b1.holZaehler));
    const danach = await q.evaluate(() => [...document.querySelectorAll("article.video")].map((el) => ({ id: el.getAttribute("data-id"), aus: el.querySelector('[data-knopf="laden"]').disabled })));
    ok("B fertig: die anderen Laden-Knöpfe sind wieder an", danach.filter((x) => x.id !== "probe-b").every((x) => !x.aus), JSON.stringify(danach));

    kopf("2d · Probe C: der erste Teil fehlt auf dem Server");
    s2.stoerung.set(teil("probe-c", 0), { art: "404", mal: Infinity });
    await klick(q, "probe-c", "laden");
    await warteLage(q, "probe-c", ["fehler", "fertig"]);
    const c1 = await karteLage(q, "probe-c");
    ok("C: Meldung nennt „Antwort 404“", c1.lage === "fehler" && /\(Antwort 404\)/.test(c1.meldung), c1.meldung);
    ok("C: dreimal versucht", c1.holZaehler[0] === 3, JSON.stringify(c1.holZaehler));
    ok(`C: Stand „0 von ${N} Teilen geprüft“`, c1.stand === `0 von ${N} Teilen geprüft`, c1.stand);
    s2.stoerung.delete(teil("probe-c", 0));

    kopf("2e · probe-ohne: gemessen wurde nichts, und ein Teil ist zu kurz");
    s2.stoerung.set(teil("probe-ohne", 0), { art: "kurz", mal: Infinity });
    const leer = await q.$eval(karteSel("probe-ohne"), (el) => {
      const f = (n) => el.querySelector(`[data-feld="${n}"]`);
      return {
        felder: ["bild", "laenge", "video", "ton"].map((n) => ({ n, t: f(n).textContent, leer: f(n).hasAttribute("data-leer") })),
        datei: f("datei").textContent,
        vorschau: f("vorschau").textContent, bilder: f("vorschau").querySelectorAll("img").length
      };
    });
    ok("ohne Messung: Bild, Länge, Video, Ton sagen „nicht gemessen“", leer.felder.every((x) => x.t === "nicht gemessen" && x.leer), JSON.stringify(leer.felder));
    ok("ohne Messung: die Größe steht trotzdem da (sie ist gezählt, nicht gemessen)", /MB$/.test(leer.datei), leer.datei);
    ok("ohne Messung: „kein Vorschaubild“, und kein <img>", leer.vorschau === "kein Vorschaubild" && leer.bilder === 0, JSON.stringify(leer));
    await klick(q, "probe-ohne", "laden");
    await warteLage(q, "probe-ohne", ["fehler", "fertig"]);
    const o1 = await karteLage(q, "probe-ohne");
    ok("zu kurzer Teil: Meldung nennt „falsche Größe“", o1.lage === "fehler" && /\(falsche Größe: \d+ statt \d+ Bytes\)/.test(o1.meldung), o1.meldung);
    s2.stoerung.delete(teil("probe-ohne", 0));
    ok("keine Skriptfehler in der Wegwerf-Kopie", q.__fehler.length === 0, q.__fehler.join(" | "));

    kopf("2e2 · drei Lade-Wege: schlicht, mit Hintergrundbildern, mit Werbeschau — derselbe Inhalt");
    {
      const w = await oeffne(c2, s2.url);
      const knopfLage = await w.$eval(karteSel("probe-b"), (el) => ["laden", "laden-bilder", "laden-schau"].map((n) => {
        const b = el.querySelector(`[data-knopf="${n}"]`);
        return b ? { n, da: !b.hidden && b.getClientRects().length > 0, aus: b.disabled, text: b.textContent } : { n, da: false };
      }));
      ok("drei Lade-Knöpfe stehen an jeder Karte", knopfLage.every((k) => k.da && !k.aus), JSON.stringify(knopfLage));
      for (const [id, knopf, art] of [["probe-b", "laden-bilder", "bilder"], ["probe-c", "laden-schau", "werbung"]]) {
        s2.stoerung.set(teil(id, 1), { art: "warte", mal: 1, ms: 1500 });
        await klick(w, id, knopf);
        let artWaehrend = null;
        try {
          await w.waitForFunction((sel) => { const v = document.querySelector(sel + ' [data-feld="vorschau"]'); return v && v.getAttribute("data-ls-art"); }, karteSel(id), { timeout: 15000 });
          artWaehrend = await w.$eval(`${karteSel(id)} [data-feld="vorschau"]`, (v) => v.getAttribute("data-ls-art"));
        } catch (_e) {}
        ok(`${knopf}: während des Ladens läuft die Schau „${art}“`, artWaehrend === art, String(artWaehrend));
        if (art === "bilder") {
          const sicht = await w.$eval(`${karteSel(id)} [data-feld="vorschau"]`, (v) => {
            const img = v.querySelector(":scope > img"); const m = document.getElementById("ls-musik");
            return { img: img ? getComputedStyle(img).opacity : null, musik: !!m && (m.classList.contains("weg") || m.getClientRects().length === 0) };
          });
          ok("Hintergrundbilder: das Vorschaubild bleibt sichtbar, keine Musik", sicht.img === "1" && sicht.musik, JSON.stringify(sicht));
          // Klaus 2026-10-02 „milchig“: im HELLEN Gerätethema griffen die dunklen
          // Schau-Farben nicht (stil.css ist dort spezifischer) — helle Karten und
          // dunkle Schrift lagen über dem Bild. Diese Seite läuft im hellen Thema.
          const farben = await w.evaluate((sel) => {
            const hell = (c) => { const m = c.match(/[\d.]+/g).map(Number); return (0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2]) / 255; };
            const h1 = getComputedStyle(document.querySelector("h1")).color;
            const karte = getComputedStyle(document.querySelector(sel)).backgroundColor;
            return { thema: matchMedia("(prefers-color-scheme: light)").matches ? "hell" : "dunkel", h1: hell(h1), karte: hell(karte), h1c: h1, kartec: karte };
          }, karteSel(id));
          ok("Hintergrundbilder im hellen Gerätethema: Überschrift hell, Karte dunkel", farben.thema === "hell" && farben.h1 > 0.7 && farben.karte < 0.2, JSON.stringify(farben));
        }
        await warteLage(w, id, ["fertig", "fehler"], 60000);
        const l = await karteLage(w, id);
        ok(`${knopf}: fertig, alle Teile geprüft`, l.lage === "fertig", JSON.stringify({ lage: l.lage, meldung: l.meldung }));
        const nachher = await w.$eval(`${karteSel(id)} [data-feld="vorschau"]`, (v) => v.getAttribute("data-ls-art"));
        ok(`${knopf}: die Schau endet mit dem Laden`, nachher === null, String(nachher));
        const [d] = await Promise.all([w.waitForEvent("download", { timeout: 30000 }), klick(w, id, "speichern")]);
        const dSha = await shaDatei(await d.path());
        ok(`${knopf}: der Download ist Byte für Byte dasselbe Video`, dSha === filmSha, dSha);
        s2.stoerung.delete(teil(id, 1));
      }
      ok("keine Skriptfehler bei den Lade-Wegen", w.__fehler.length === 0, w.__fehler.join(" | "));
      await w.close();
    }

    kopf("2f · der Vorrat des Service-Workers");
    const swQuelle = readFileSync(join(kopie, "sw.js"), "utf8");
    const version = (swQuelle.match(/CACHE_VERSION\s*=\s*"([^"]+)"/) || [])[1];
    const schale = JSON.parse((swQuelle.match(/SCHALE\s*=\s*(\[[\s\S]*?\]);/) || [])[1] || "[]");
    ok("CACHE_VERSION und SCHALE aus sw.js gelesen", !!version && schale.length > 3, version);
    const imVorrat = await q.evaluate(async (v) => (await (await caches.open(v)).keys()).map((r) => r.url), version);
    const fehlt = schale.filter((s) => !imVorrat.includes(new URL(s, s2.url).href));
    ok("jede Datei der Schale liegt im Vorrat", fehlt.length === 0, JSON.stringify(fehlt));
    const zuviel = imVorrat.filter((u) => /\/videos\/|videos\.json/.test(u));
    ok("kein Teil und keine Liste im Vorrat — auch nach vier Ladeläufen", zuviel.length === 0, JSON.stringify(zuviel));
    const fremdeVorraete = await q.evaluate(async () => (await caches.keys()));
    ok("nur der eigene Vorrat ist angelegt", fremdeVorraete.every((n) => n === version), JSON.stringify(fremdeVorraete));

    kopf("2g · offline: die Seite öffnet sich, die Liste sagt, dass sie nicht kam");
    s2.zustand.aus = true;
    let offenOffline = false;
    try { await q.reload({ waitUntil: "load", timeout: 15000 }); offenOffline = true; } catch (e) { offenOffline = String(e.message).split("\n")[0]; }
    ok("offline: die Seite lädt aus dem Vorrat", offenOffline === true, offenOffline);
    if (offenOffline === true) {
      try { await q.waitForFunction(() => document.getElementById("liste-meldung").getAttribute("data-art") === "fehler", null, { timeout: 15000 }); } catch (_e) {}
      const off = await q.evaluate(() => ({
        h1: document.querySelector("h1") && document.querySelector("h1").textContent,
        art: document.getElementById("liste-meldung").getAttribute("data-art"),
        t: document.getElementById("liste-meldung").textContent,
        stil: getComputedStyle(document.body).backgroundColor
      }));
      ok("offline: Überschrift steht da, Stil ist geladen", /Große Videos/.test(off.h1 || "") && off.stil !== "rgba(0, 0, 0, 0)", JSON.stringify(off));
      ok("offline: die Liste sagt „kam nicht an“", off.art === "fehler" && /kam nicht an/.test(off.t), JSON.stringify(off));
    }
    s2.zustand.aus = false;

    kopf("2h · ⟳ leert nur den eigenen Vorrat und lädt mit neuer Adresse");
    await q.goto(s2.url, { waitUntil: "load" });
    await q.waitForFunction(() => window.__videos && window.__videos.bereit, null, { timeout: 30000 });
    await q.evaluate(async () => { await caches.open("fp-videos-alt"); await caches.open("fremd-app-v1"); });
    const vorher = s2.log.length;
    await Promise.all([q.waitForURL((u) => true, { waitUntil: "load", timeout: 30000 }).catch(() => {}), q.waitForEvent("framenavigated", { timeout: 30000 }), q.click("#neuladen")]);
    await q.waitForFunction(() => window.__videos && window.__videos.bereit, null, { timeout: 30000 });
    const nach = await q.evaluate(async () => ({ namen: await caches.keys(), such: location.search }));
    ok("⟳: der alte eigene Vorrat ist weg", !nach.namen.includes("fp-videos-alt"), JSON.stringify(nach.namen));
    ok("⟳: der Vorrat einer fremden App bleibt", nach.namen.includes("fremd-app-v1"), JSON.stringify(nach.namen));
    ok("⟳: geladen wurde mit ?frisch=…", s2.log.slice(vorher).some((l) => /[?&]frisch=\d+/.test(l)), JSON.stringify(s2.log.slice(vorher, vorher + 5)));
    ok("⟳: und die Adresse ist danach wieder sauber", nach.such === "", nach.such);
    await c2.close(); aufraeumen.splice(aufraeumen.indexOf(c2), 1);

    /* ════ 3 · Installieren ════ */
    kopf("3 · Installieren: drei Lagen");
    const c3 = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    aufraeumen.push(() => c3.close());
    const r3 = await oeffne(c3, s2.url);
    const i0 = await r3.$eval("#installieren", (b) => ({ lage: b.getAttribute("data-lage"), hidden: b.hidden }));
    ok("ohne Angebot des Browsers: „nicht-angeboten“, sichtbar", i0.lage === "nicht-angeboten" && !i0.hidden, JSON.stringify(i0));
    await r3.click("#installieren");
    const m0 = await r3.$eval("#install-meldung-text", (t) => t.textContent);
    ok("ein Tipp sagt, wie es von Hand geht", m0.startsWith("Der Browser bietet die Installation gerade nicht an."), m0.slice(0, 60));
    await r3.click("#install-meldung button");
    ok("✕ schließt den Hinweis", await r3.$eval("#install-meldung", (m) => m.hidden));

    for (const [wahl, erwartet] of [["accepted", "Installiert."], ["dismissed", "Nicht installiert — abgebrochen."]]) {
      const ev = await r3.evaluate((w) => {
        window.__prompt = 0;
        const e = new Event("beforeinstallprompt", { cancelable: true });
        e.prompt = () => { window.__prompt++; };
        e.userChoice = Promise.resolve({ outcome: w });
        window.dispatchEvent(e);
        const b = document.getElementById("installieren");
        return { abgefangen: e.defaultPrevented, lage: b.getAttribute("data-lage"), title: b.title };
      }, wahl);
      ok(`Angebot (${wahl}): abgefangen, „angeboten“, Titel „Als App installieren“`, ev.abgefangen && ev.lage === "angeboten" && ev.title === "Als App installieren", JSON.stringify(ev));
      await r3.click("#installieren");
      await r3.waitForFunction((e) => { const t = document.getElementById("install-meldung-text"); return t && t.textContent.startsWith(e) && !document.getElementById("install-meldung").hidden; }, erwartet, { timeout: 5000 }).catch(() => {});
      const nachher = await r3.evaluate(() => ({ prompt: window.__prompt, t: document.getElementById("install-meldung-text").textContent, lage: document.getElementById("installieren").getAttribute("data-lage") }));
      ok(`Angebot (${wahl}): prompt() lief, Meldung „${erwartet}“, danach wieder „nicht-angeboten“`,
        nachher.prompt === 1 && nachher.t.startsWith(erwartet) && nachher.lage === "nicht-angeboten", JSON.stringify(nachher));
    }
    ok("keine Skriptfehler beim Installieren", r3.__fehler.length === 0, r3.__fehler.join(" | "));
    await c3.close(); aufraeumen.pop();

    const c4 = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    aufraeumen.push(() => c4.close());
    await c4.addInitScript(() => {
      const alt = window.matchMedia.bind(window);
      window.matchMedia = (q) => (/display-mode:\s*standalone/.test(q)
        ? { matches: true, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }
        : alt(q));
    });
    const r4 = await oeffne(c4, s2.url);
    const i4 = await r4.$eval("#installieren", (b) => ({ lage: b.getAttribute("data-lage"), hidden: b.hidden, sichtbar: b.getClientRects().length > 0 }));
    ok("als App geöffnet: Knopf verborgen, Lage „app“", i4.lage === "app" && i4.hidden && !i4.sichtbar, JSON.stringify(i4));
    await c4.close(); aufraeumen.pop();

    /* ════ 4 · Bewegung ════ */
    kopf("4 · Bewegung: Atmen, Auftauchen, Neigen — und Ruhe, wenn gewünscht");
    const c5 = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: "dark" });
    aufraeumen.push(() => c5.close());
    const r5 = await oeffne(c5, s2.url);
    const anim = await r5.evaluate(() => ({
      marke: getComputedStyle(document.querySelector(".marke-link img")).animationName,
      karte: getComputedStyle(document.querySelector("article.video")).animationName,
      bg: getComputedStyle(document.documentElement).getPropertyValue("--bg").trim()
    }));
    ok("die Marke atmet", anim.marke === "atmen", anim.marke);
    ok("die Karten tauchen auf", anim.karte === "auftauchen", anim.karte);
    ok("dunkel: --bg ist #0a1016", anim.bg === "#0a1016", anim.bg);

    const lsel = `${karteSel("probe-a")} [data-knopf="laden"]`;
    await r5.$eval(lsel, (b) => b.scrollIntoView({ block: "center" }));
    /* Erst messen, wenn die Karten fertig aufgetaucht sind: während „auftauchen“
       steht der Knopf noch bis zu 16 px tiefer, und ein Punkt aus dieser Lage
       liegt später neben ihm (so war die erste Fassung dieser Probe rot). */
    await r5.waitForFunction(() => document.getAnimations().every((a) =>
      a.playState !== "running" || (a.effect && a.effect.getTiming().iterations === Infinity)), null, { timeout: 15000 });
    const box = await r5.$eval(lsel, (b) => { const r = b.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
    await r5.mouse.move(2, 2);
    await r5.mouse.move(box.x + box.w * 0.2, box.y + box.h * 0.2, { steps: 4 });
    const n1 = await r5.$eval(lsel, (b) => ({ rx: parseFloat(b.style.getPropertyValue("--rx")), ry: parseFloat(b.style.getPropertyValue("--ry")), tf: getComputedStyle(b).transform }));
    ok("Zeiger oben links: der Knopf kippt nach oben (rx > 0) und nach links (ry < 0)", n1.rx > 0 && n1.ry < 0, JSON.stringify(n1));
    ok("… und das Bild folgt der Neigung (transform ist nicht „none“)", n1.tf && n1.tf !== "none", n1.tf);
    await r5.mouse.move(box.x + box.w * 0.8, box.y + box.h * 0.8, { steps: 4 });
    const n2 = await r5.$eval(lsel, (b) => ({ rx: parseFloat(b.style.getPropertyValue("--rx")), ry: parseFloat(b.style.getPropertyValue("--ry")) }));
    ok("Zeiger unten rechts: umgekehrt (rx < 0, ry > 0)", n2.rx < 0 && n2.ry > 0, JSON.stringify(n2));
    /* Die Kante: geneigt rückt die abgewandte Seite einige Pixel nach innen.
       Der Zeiger steht dann über dem Rand dahinter — er gehört trotzdem weiter
       zum Knopf, sonst springt die Neigung bei jeder Bewegung an und aus. */
    /* Nach jeder Bewegung wird gewartet, bis die Neigung ausgelaufen ist
       (transform .14s): erst dann liegt die Kante wirklich innen. Ohne das
       Warten hing das Ergebnis an der Last der Maschine — in einer Kopie
       stand der Knopf mitten im Übergang noch unter dem Zeiger, und die
       Vorbedingung fiel statt des Wächters (Gegenprobe KANTE, 2026-10-02). */
    const ruhe = () => r5.waitForFunction((sel) => document.querySelector(sel).getAnimations()
      .every((a) => a.playState !== "running"), lsel, { timeout: 5000 });
    const kante = [];
    let unterKante = "";
    for (const [i, dx] of [0, -0.6, 0.4, -0.3].entries()) {
      await r5.mouse.move(box.x + box.w * 0.99 + dx, box.y + box.h * 0.5, { steps: 2 });
      await ruhe();
      kante.push(await r5.$eval(lsel, (b) => parseFloat(b.style.getPropertyValue("--ry")) || 0));
      if (i === 0) unterKante = await r5.evaluate((pt) => { const e = document.elementFromPoint(pt.x, pt.y); return e ? e.tagName : ""; },
        { x: box.x + box.w * 0.99, y: box.y + box.h * 0.5 });
    }
    ok("Vorbedingung: am rechten Rand liegt der geneigte Knopf wirklich NICHT mehr unter dem Zeiger", unterKante !== "BUTTON", unterKante);
    ok("am rechten Rand bleibt die Neigung bei jeder kleinen Bewegung stehen (kein Flackern)", kante.every((v) => v > 8), JSON.stringify(kante));
    await r5.mouse.move(box.x + box.w + 3, box.y + box.h * 0.5, { steps: 2 });
    const nAus = await r5.$eval(lsel, (b) => b.style.getPropertyValue("--ry"));
    ok("drei Pixel neben der flachen Lage: der Knopf liegt wieder flach", nAus === "", nAus);
    await r5.mouse.move(box.x + box.w * 0.5, box.y + box.h * 0.2, { steps: 2 });
    /* Gemessen wird beim ERSTEN scroll-Ereignis, nicht nach einer Frist: nach
       dem Rollen schickt der Browser von sich aus eine Zeigerbewegung, und die
       legt den Knopf ebenfalls flach — wer später misst, misst die, nicht den
       Riegel. Unser Zuhörer hängt nach dem der Seite, er sieht ihr Ergebnis.
       (Die erste Fassung wartete 150 ms und war in einer Kopie einmal rot.) */
    const vorRoll = await r5.evaluate((sel) => {
      const b = document.querySelector(sel);
      window.__rollMess = null;
      addEventListener("scroll", () => { if (window.__rollMess === null) window.__rollMess = { rx: b.style.getPropertyValue("--rx") }; },
        { capture: true, passive: true });
      return b.style.getPropertyValue("--rx");
    }, lsel);
    ok("Vorbedingung: vor dem Rollen ist der Knopf geneigt", vorRoll !== "", vorRoll);
    await r5.mouse.wheel(0, 120);
    const roll = await r5.waitForFunction(() => window.__rollMess, null, { timeout: 5000 }).then((h) => h.jsonValue()).catch(() => null);
    ok("Vorbedingung: die Seite ist wirklich gerollt", roll !== null);
    ok("die Seite rollt unter dem Zeiger weg: der Knopf liegt wieder flach", roll !== null && roll.rx === "", JSON.stringify(roll));
    await r5.$eval(lsel, (b) => b.scrollIntoView({ block: "center" }));
    await r5.mouse.move(box.x + box.w * 0.2, box.y + box.h * 0.2, { steps: 2 });
    await r5.mouse.move(2, 2, { steps: 4 });
    const n3 = await r5.$eval(lsel, (b) => b.style.getPropertyValue("--rx"));
    ok("Zeiger weg: der Knopf liegt wieder flach", n3 === "", n3);
    const ssel = `${karteSel("probe-a")} [data-knopf="speichern"]`;
    const sbox = await r5.$eval(ssel, (b) => { const r = b.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height, aus: b.disabled }; });
    await r5.mouse.move(sbox.x + sbox.w * 0.2, sbox.y + sbox.h * 0.2, { steps: 4 });
    const n4 = await r5.$eval(ssel, (b) => b.style.getPropertyValue("--rx"));
    ok("ein ausgeschalteter Knopf kippt nicht", sbox.aus && n4 === "", JSON.stringify({ aus: sbox.aus, rx: n4 }));
    await c5.close(); aufraeumen.pop();

    const c6 = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: "reduce", colorScheme: "light" });
    aufraeumen.push(() => c6.close());
    const r6 = await oeffne(c6, s2.url);
    const ruhig = await r6.evaluate(() => ({
      marke: getComputedStyle(document.querySelector(".marke-link img")).animationName,
      karte: getComputedStyle(document.querySelector("article.video")).animationName,
      bg: getComputedStyle(document.documentElement).getPropertyValue("--bg").trim()
    }));
    ok("weniger Bewegung: nichts atmet, nichts taucht auf", ruhig.marke === "none" && ruhig.karte === "none", JSON.stringify(ruhig));
    ok("hell: --bg ist #eef3f4", ruhig.bg === "#eef3f4", ruhig.bg);
    await r6.$eval(lsel, (b) => b.scrollIntoView({ block: "center" }));
    const box6 = await r6.$eval(lsel, (b) => { const r = b.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
    await r6.mouse.move(2, 2);
    await r6.mouse.move(box6.x + box6.w * 0.2, box6.y + box6.h * 0.2, { steps: 4 });
    const n6 = await r6.$eval(lsel, (b) => ({ rx: b.style.getPropertyValue("--rx"), tf: getComputedStyle(b).transform }));
    ok("weniger Bewegung: der Knopf kippt nicht", n6.rx === "" && (n6.tf === "none" || /^matrix\(1, 0, 0, 1, 0, 0\)$/.test(n6.tf)), JSON.stringify(n6));
    await c6.close(); aufraeumen.pop();

    await s2.close(); aufraeumen.splice(aufraeumen.indexOf(s2), 1);
  }
} catch (e) {
  rot++;
  console.log("  ✗ ROT: die Probe ist unterwegs gestolpert  → " + String(e && e.stack || e).split("\n").slice(0, 4).join(" | "));
} finally {
  for (const f of aufraeumen.reverse()) { try { await f(); } catch (_e) {} }
  try { await browser.close(); } catch (_e) {}
}
schluss();
