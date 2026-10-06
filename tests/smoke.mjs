#!/usr/bin/env node
/* Probe ohne Browser: Liste, Teile, Grenzen, Schale — und das Werkzeug in einer Wegwerf-Kopie.
 *
 *   node tests/smoke.mjs
 *
 * Drei Ausgänge, nicht zwei:
 *   ✓ grün        die Zusicherung hält
 *   ✗ ROT         sie hält nicht — nur das zählt als Befund (Rückgabe 1)
 *   ⊘ nicht lauffähig  ein Werkzeug fehlt (ffmpeg) — ungeprüft, nicht grün (Rückgabe 2)
 *
 * Die Prüfung der Liste nimmt die ECHTE Funktion gueltig() aus assets/laden.js,
 * nicht einen Nachbau: zwei Fassungen derselben Regel laufen auseinander. */
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import {
  cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync, truncateSync, openSync, closeSync
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const WURZEL = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const NODE = process.execPath;
let gruen = 0, rot = 0, stumm = 0;
function ok(name, bedingung, mehr) {
  if (bedingung) { gruen++; console.log("  ✓ " + name); }
  else { rot++; console.log("  ✗ ROT: " + name + (mehr !== undefined ? "  → " + mehr : "")); }
}
function nichtLauffaehig(name, grund) { stumm++; console.log("  ⊘ nicht lauffähig: " + name + " — " + grund); }
function kopf(t) { console.log("\n" + t); }
const sha = (b) => createHash("sha256").update(b).digest("hex");
const lesen = (p) => readFileSync(join(WURZEL, p), "utf8");

/* ── die echte gueltig() aus der Seite holen ── */
function seitenFunktion(quelle, name) {
  const start = quelle.indexOf("function " + name + "(");
  if (start < 0) return null;
  let tiefe = 0, i = quelle.indexOf("{", start);
  for (; i < quelle.length; i++) {
    if (quelle[i] === "{") tiefe++;
    else if (quelle[i] === "}" && --tiefe === 0) break;
  }
  return quelle.slice(start, i + 1);
}
const ladenQuelle = lesen("assets/laden.js");
const kennungZeile = (ladenQuelle.match(/var KENNUNG = (\/[^\n]+\/);/) || [])[1];
const gueltigText = seitenFunktion(ladenQuelle, "gueltig");
let gueltig = null;
try {
  gueltig = vm.runInNewContext("var KENNUNG = " + kennungZeile + ";\n" + gueltigText + "\ngueltig;");
} catch (e) { /* unten als ROT gemeldet */ }

kopf("A · die Prüfung der Liste in der Seite");
ok("gueltig() steht in assets/laden.js und lässt sich laden", typeof gueltig === "function");
const werkzeugQuelle = lesen("tools/video-aufnehmen.mjs");
const kennungWerkzeug = (werkzeugQuelle.match(/export const KENNUNG = (\/[^\n]+\/);/) || [])[1];
ok("Seite und Werkzeug prüfen die Kennung mit DERSELBEN Regel", kennungZeile && kennungZeile === kennungWerkzeug, kennungZeile + " ⟷ " + kennungWerkzeug);

const liste = JSON.parse(lesen("videos.json"));
const videos = Array.isArray(liste.videos) ? liste.videos : [];
ok("videos.json trägt eine Liste „videos“", Array.isArray(liste.videos));
ok("mindestens ein Video in der Liste (sonst misst der Rest nichts)", videos.length > 0, videos.length);

if (typeof gueltig === "function" && videos.length) {
  const muster = JSON.parse(JSON.stringify(videos[0]));
  const kaputt = (aendern) => { const v = JSON.parse(JSON.stringify(muster)); aendern(v); return v; };
  ok("das echte Muster ist gültig (sonst misst die Gegenrichtung nichts)", gueltig(muster));
  const faelle = [
    ["Kennung mit Großbuchstaben", (v) => { v.id = "Werbevideo"; }],
    ["Kennung mit Schrägstrich (Pfad!)", (v) => { v.id = "../geheim"; }],
    ["Titel fehlt", (v) => { delete v.titel; }],
    ["Teile fehlen", (v) => { v.teile = []; }],
    ["101 Teile", (v) => { v.teile = Array.from({ length: 101 }, () => ({ groesse: 1, sha256: "a".repeat(64) })); v.groesse = 101; }],
    ["ein Teil mit Größe 0", (v) => { v.teile[0].groesse = 0; }],
    ["ein Teil mit krummer Größe", (v) => { v.teile[0].groesse += 0.5; v.groesse += 0.5; }],
    ["Teil-Prüfsumme kein Hex", (v) => { v.teile[0].sha256 = "z".repeat(64); }],
    ["Summe der Teile ≠ Gesamtgröße", (v) => { v.groesse += 1; }],
    ["Gesamt-Prüfsumme fehlt", (v) => { delete v.sha256; }],
    ["Dateiname ohne .mp4", (v) => { v.dateiname = "video.exe"; }]
  ];
  for (const [name, f] of faelle) ok("abgewiesen: " + name, !gueltig(kaputt(f)));
}

kopf("B · jedes Video der Liste, Teil für Teil auf der Platte");
const ids = new Set();
let davor = null;
for (const v of videos) {
  ok(`${v.id}: gültig nach der Regel der Seite`, typeof gueltig === "function" && gueltig(v));
  ok(`${v.id}: Kennung kommt nur einmal vor`, !ids.has(v.id)); ids.add(v.id);
  if (davor !== null) ok(`${v.id}: die Liste steht neueste zuerst`, String(davor) >= String(v.aufgenommen), davor + " vor " + v.aufgenommen);
  davor = v.aufgenommen;
  const ordner = join(WURZEL, "videos", v.id);
  ok(`${v.id}: Ordner videos/${v.id}/ ist da`, existsSync(ordner));
  if (!existsSync(ordner)) continue;
  const ganz = createHash("sha256");
  let alleTeile = true, falsch = [];
  v.teile.forEach((t, i) => {
    const p = join(ordner, "teil-" + String(i).padStart(2, "0") + ".bin");
    if (!existsSync(p)) { alleTeile = false; falsch.push(i + " fehlt"); return; }
    const b = readFileSync(p);
    ganz.update(b);
    if (b.length !== t.groesse) falsch.push(i + " Größe " + b.length + "≠" + t.groesse);
    else if (sha(b) !== t.sha256) falsch.push(i + " Prüfsumme");
  });
  ok(`${v.id}: alle ${v.teile.length} Teile da, Größe und Prüfsumme stimmen`, alleTeile && !falsch.length, falsch.join(", "));
  ok(`${v.id}: die zusammengesetzten Teile ergeben die Gesamt-Prüfsumme`, alleTeile && ganz.digest("hex") === v.sha256);
  const erwartet = new Set(v.teile.map((_, i) => "teil-" + String(i).padStart(2, "0") + ".bin"));
  if (v.vorschau) erwartet.add("vorschau.jpg");
  if (v.vorschauFilm) erwartet.add("vorschau.mp4");
  const fremd = readdirSync(ordner).filter((n) => !erwartet.has(n));
  ok(`${v.id}: keine überzähligen Dateien im Ordner`, !fremd.length, fremd.join(", "));
  if (v.vorschau) {
    ok(`${v.id}: Vorschaubild liegt im eigenen Ordner`, v.vorschau === `videos/${v.id}/vorschau.jpg`, v.vorschau);
    const p = join(WURZEL, v.vorschau);
    const kopfBytes = existsSync(p) ? readFileSync(p).subarray(0, 3) : Buffer.alloc(0);
    ok(`${v.id}: Vorschaubild ist ein JPEG unter 2 MB`, kopfBytes.equals(Buffer.from([0xff, 0xd8, 0xff])) && statSync(p).size < 2e6);
  }
  if (v.vorschauFilm) {
    const vf = v.vorschauFilm, p = join(WURZEL, vf.pfad || "");
    ok(`${v.id}: Vorschaufilm liegt im eigenen Ordner`, vf.pfad === `videos/${v.id}/vorschau.mp4`, vf.pfad);
    const fb = existsSync(p) ? readFileSync(p) : Buffer.alloc(0);
    ok(`${v.id}: Vorschaufilm höchstens 14 MB, Größe stimmt`, fb.length > 0 && fb.length <= 14e6 && fb.length === vf.groesse, fb.length + " / " + vf.groesse);
    ok(`${v.id}: Vorschaufilm-Prüfsumme stimmt`, fb.length > 0 && sha(fb) === vf.sha256);
    ok(`${v.id}: Vorschaufilm ist ein MP4 (ftyp)`, fb.subarray(4, 8).toString("latin1") === "ftyp");
  }
}
const ordnerOhneEintrag = existsSync(join(WURZEL, "videos")) ? readdirSync(join(WURZEL, "videos")).filter((n) => !ids.has(n)) : [];
ok("kein Ordner unter videos/ ohne Eintrag in der Liste", !ordnerOhneEintrag.length, ordnerOhneEintrag.join(", "));

kopf("C · Grenzen von GitHub Pages");
const werkzeug = await import(join(WURZEL, "tools/video-aufnehmen.mjs"));
const gross = [];
(function lauf(o) {
  for (const e of readdirSync(o, { withFileTypes: true })) {
    if (o === WURZEL && (e.name === ".git" || e.name === "node_modules")) continue;
    const p = join(o, e.name);
    if (e.isDirectory()) lauf(p); else if (statSync(p).size > werkzeug.DATEI_MAX) gross.push(p.slice(WURZEL.length + 1));
  }
})(WURZEL);
ok("keine Datei über 50 MB (GitHub warnt ab 50, lehnt ab 100 ab)", !gross.length, gross.join(", "));
const seite = werkzeug.seitenGroesse();
ok(`die Seite ist höchstens 1 GB groß (${(seite / 1e6).toFixed(1)} MB)`, seite <= werkzeug.SEITE_MAX);
if (seite > werkzeug.SEITE_WARNUNG) console.log("  ⚠ die Seite nähert sich der Grenze von 1 GB.");

kopf("D · die Schale: Versionen, Vorrat, Symbole");
const html = lesen("index.html");
const sw = lesen("sw.js");
const manifest = JSON.parse(lesen("manifest.webmanifest"));
const schale = (sw.match(/const SCHALE = \[([\s\S]*?)\];/) || [])[1];
const schaleListe = schale ? [...schale.matchAll(/"([^"]+)"/g)].map((m) => m[1]) : [];
ok("sw.js trägt eine SCHALE-Liste", schaleListe.length > 3, schaleListe.length);
const imHtml = [...html.matchAll(/(?:href|src)="([^"#]+\?v=\d+)"/g)].map((m) => m[1]);
ok("index.html holt Stil, Skript und Symbole mit ?v=", imHtml.length >= 4, imHtml.join(" "));
const fehltImVorrat = imHtml.filter((u) => !schaleListe.includes(u));
ok("jede ?v=-Adresse der Seite steht wortgleich im Vorrat (sonst holt der Worker eine andere Datei)", !fehltImVorrat.length, fehltImVorrat.join(" "));
const fehltDatei = schaleListe.filter((u) => u !== "./" && !existsSync(join(WURZEL, u.split("?")[0])));
ok("jede Datei aus SCHALE liegt im Depot", !fehltDatei.length, fehltDatei.join(" "));
ok("CACHE_VERSION beginnt mit fp-videos- (⟳ räumt nur diese Vorräte)", /const CACHE_VERSION = "fp-videos-v\d+";/.test(sw));
ok("der Worker legt nichts aus videos/ und videos.json ab", /rest\.startsWith\("videos\/"\) \|\| rest === "videos\.json"\) return;/.test(sw));
ok("kein videos/-Eintrag im Installations-Vorrat", !schaleListe.some((u) => u.startsWith("videos")));
ok("Manifest: als eigene App (display standalone)", manifest.display === "standalone");
ok("Manifest: Start und Bereich sind diese Seite", manifest.start_url === "./" && manifest.scope === "./");
const icons = manifest.icons || [];
ok("Manifest: Symbole 192, 512 und maskable", ["192x192", "512x512"].every((s) => icons.some((i) => i.sizes === s)) && icons.some((i) => i.purpose === "maskable"));
const fehltIcon = icons.filter((i) => !existsSync(join(WURZEL, i.src.split("?")[0])));
ok("jedes Symbol aus dem Manifest liegt im Depot", !fehltIcon.length, fehltIcon.map((i) => i.src).join(" "));
const pngGroesse = (p) => { const b = readFileSync(join(WURZEL, p)); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };
const falscheMasse = icons.filter((i) => { const [w, h] = pngGroesse(i.src.split("?")[0]); return i.sizes !== w + "x" + h; });
ok("jedes Symbol hat die Größe, die das Manifest nennt", !falscheMasse.length, falscheMasse.map((i) => i.src).join(" "));
ok(".nojekyll liegt da (sonst lässt Pages Ordner mit _ weg)", existsSync(join(WURZEL, ".nojekyll")));
/* gemessen wird der CODE, nicht der Erklär-Kommentar, der das Wort nennt */
const ladenCode = ladenQuelle.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
ok("Texte aus der Liste gehen nie über innerHTML", !/innerHTML|outerHTML|insertAdjacentHTML/.test(ladenCode));

kopf("D2 · drei Lade-Wege und die Ladeschau");
const lsQuelle = existsSync(join(WURZEL, "assets/ladeschau.js")) ? readFileSync(join(WURZEL, "assets/ladeschau.js"), "utf8") : "";
const indexQ = readFileSync(join(WURZEL, "index.html"), "utf8");
ok("vier Lade-Knöpfe in der Vorlage (schlicht, Hintergrundbilder, Werbeschau, Vorschaufilm)", ["laden", "laden-bilder", "laden-schau", "laden-film"].every((n) => indexQ.includes(`data-knopf="${n}"`)));
ok("der Film-Knopf ist in der Vorlage verborgen (erscheint nur mit vorschauFilm)", /data-knopf="laden-film" hidden/.test(indexQ));
ok("laden.js prüft den Vorschaufilm (Pfad, Größe ≤ 14 MB, SHA) bevor der Knopf erscheint", /function filmGueltig/.test(ladenQuelle) && /filmKnopf\.hidden = !mitFilm/.test(ladenQuelle));
{
  const m = ladenQuelle.match(/function filmGueltig\(v\) \{[\s\S]*?\n  \}/);
  let fg = null; try { fg = m && new Function(m[0] + "; return filmGueltig;")(); } catch (_e) {}
  const H = "a".repeat(64), gut = { id: "x-1", vorschauFilm: { pfad: "videos/x-1/vorschau.mp4", groesse: 5, sha256: H } };
  const mit = (f) => ({ id: "x-1", vorschauFilm: Object.assign({}, gut.vorschauFilm, f) });
  ok("filmGueltig nimmt den eigenen Vorschaufilm an", !!fg && fg(gut) === true);
  ok("filmGueltig weist fremde Pfade, zu große Dateien und kaputte Prüfsummen ab", !!fg &&
    [mit({ pfad: "https://fremd.example/x.mp4" }), mit({ pfad: "videos/y-2/vorschau.mp4" }), mit({ pfad: "videos/x-1/../../x.mp4" }),
     mit({ groesse: 14000001 }), mit({ groesse: 0 }), mit({ sha256: "zz" }), { id: "x-1", vorschauFilm: null }].every((v) => fg(v) === false));
}
ok("Ladeschau kennt den Film-Modus und hält das Finale bis zum letzten Teil", /art === "film"/.test(lsQuelle) && /S\.alle = n >= S\.N/.test(lsQuelle));
ok("assets/ladeschau.js liegt da und nimmt den Ordner aus LADESCHAU_BASIS", /var B = window\.LADESCHAU_BASIS \|\| "ls\/";/.test(lsQuelle));
ok("laden.js holt die Schau aus assets/ls/", /LADESCHAU_BASIS = "assets\/ls\/"/.test(ladenQuelle));
const lsDateien = existsSync(join(WURZEL, "assets/ls")) ? readdirSync(join(WURZEL, "assets/ls")) : [];
ok("assets/ls/ trägt Hintergrundbilder und Musik", lsDateien.some((n) => /^bg-.*\.jpg$/.test(n)) && lsDateien.includes("musik.mp3"), lsDateien.length + " Dateien");
ok("keine .wav und keine Datei über 50 MB in assets/ls/", lsDateien.every((n) => !/\.wav$/i.test(n) && statSync(join(WURZEL, "assets/ls", n)).size < 50e6));
ok("Ladeschau und ls/ stehen NICHT im Installations-Vorrat (erst auf Tipp)", !schaleListe.some((u) => /ladeschau|assets\/ls\//.test(u)));
/* Klaus 2026-10-02: „ruckelt an den Rändern" · „Hintergrundbilder … milchig" */
// Gemessen wird jede Regel, nicht eine bestimmte: die erste Fassung suchte nur an
// `.fassung` — eine Klasse, die es auf der Seite gar nicht gibt (Gegenprobe RUCKELN, 2026-10-02).
const weich = (lsQuelle.match(/[^{}]*\{[^}]*backdrop-filter[^}]*\}/g) || []).map((r) => r.slice(0, r.indexOf("{")).trim());
ok("Ladeschau: kein Weichzeichner (backdrop-filter) über der laufenden Schau — nur der kleine Musik-Knopf", weich.every((sel) => sel === "#ls-musik"), JSON.stringify(weich));
ok("Ladeschau: Hintergrund ragt nicht über den Rand (inset:0) und schiebt nicht seitlich", /\.ls-bild\{position:absolute;inset:0;/.test(lsQuelle) && !/lsKen\{[^}]*translate/.test(lsQuelle));
ok("Ladeschau: das Korn steht still", !/\.ls-korn\{[^}]*animation/.test(lsQuelle));
ok("Ladeschau: nur sichtbare Bilder bekommen eine eigene Ebene", /\.ls-bild\{[^}]*visibility:hidden/.test(lsQuelle) && !/\.ls-bild\{[^}]*will-change/.test(lsQuelle));
function jpegBreite(datei) { const b = readFileSync(datei); for (let i = 2; i < b.length - 9; ) { if (b[i] !== 0xff) return 0; const m = b[i + 1], l = b.readUInt16BE(i + 2); if (m >= 0xc0 && m <= 0xc2) return b.readUInt16BE(i + 7); i += 2 + l; } return 0; }
const bgBreiten = (lsQuelle.match(/var BILDER = \[([^\]]*)\]/) || ["", ""])[1].split(",").map((x) => x.trim().replace(/"/g, "")).filter(Boolean).map((n) => [n, existsSync(join(WURZEL, "assets/ls", n + ".jpg")) ? jpegBreite(join(WURZEL, "assets/ls", n + ".jpg")) : 0]);
ok("Ladeschau: jedes Hintergrundbild ist mindestens 1920 px breit (scharf am Tablet)", bgBreiten.length === 8 && bgBreiten.every(([, w]) => w >= 1920), JSON.stringify(bgBreiten));
// Scanner (Klaus 2026-10-02): einer je Bild, nur ↓ oder ←, keine Kreis- oder Schräg-Scanner mehr
ok("Scanner: nur zwei Richtungen (von oben nach unten, von rechts nach links)", /var SCAN_ARTEN = \["runter", "links"\];/.test(lsQuelle));
ok("Scanner: kein Kreis- oder Schräg-Scanner mehr", !/ls-scan\.(ring|schraeg)|"kreis", "schraeg"/.test(lsQuelle));
ok("node --check assets/ladeschau.js", spawnSync(NODE, ["--check", join(WURZEL, "assets/ladeschau.js")]).status === 0);

kopf("D3 · Abspielen: Kern und Seite");
const kernQ = existsSync(join(WURZEL, "assets/abspielen-kern.js")) ? lesen("assets/abspielen-kern.js") : "";
const abQ = existsSync(join(WURZEL, "assets/abspielen.js")) ? lesen("assets/abspielen.js") : "";
const swQ = lesen("sw.js");
ok("der Abspiel-Kern liegt da und steht im Vorrat", kernQ.length > 0 && schaleListe.some((u) => /^assets\/abspielen-kern\.js\?v=\d+$/.test(u)));
ok("sw.js holt den Kern mit derselben ?v= wie der Vorrat", (() => { const m = /importScripts\("(assets\/abspielen-kern\.js\?v=\d+)"\)/.exec(swQ); return !!m && schaleListe.includes(m[1]); })());
ok("sw.js beantwortet die Abspiel-Adresse über den Kern", /self\.FPAbspielKern\.antwort\(req, abs\[1\]/.test(swQ));
ok("der Kern legt nichts in die Cache Storage", kernQ.length > 0 && !/caches\./.test(kernQ));
ok("der Kern antwortet mit no-store", /"Cache-Control": "no-store"/.test(kernQ));
ok("höchstens drei Teile im Arbeitsspeicher", /var TEIL_MAX = 3;/.test(kernQ) && /while \(teile\.size > TEIL_MAX\)/.test(kernQ));
ok("abspielen.js liest Quelle, Weg, Worker und Herunterladen aus Marken", ["videoQuelle", "videoWeg", "videoSw", "videoLaden"].every((n) => abQ.includes("M." + n)));
ok("abspielen.js setzt Texte nie über innerHTML", abQ.length > 0 && !/innerHTML/.test(abQ));
ok("abspielen.html lädt abspielen.js mit derselben ?v= wie der Vorrat", (() => { const h = existsSync(join(WURZEL, "abspielen.html")) ? lesen("abspielen.html") : ""; const m = /src="(assets\/abspielen\.js\?v=\d+)"/.exec(h); return !!m && schaleListe.includes(m[1]); })());
/* Der Spieler für einen fremden Rahmen (family-projekt.de, Startseite). Seine
   Wirkung misst family-project im echten Browser; hier steht, was ohne Browser geht. */
const raQ = existsSync(join(WURZEL, "assets/abspielen-rahmen.js")) ? lesen("assets/abspielen-rahmen.js") : "";
ok("abspielen-rahmen.js: node --check", raQ.length > 0 && spawnSync(NODE, ["--check", join(WURZEL, "assets/abspielen-rahmen.js")]).status === 0);
ok("abspielen-rahmen.js setzt Texte nie über innerHTML", raQ.length > 0 && !/innerHTML/.test(raQ));
ok("abspielen-rahmen.js lädt vor dem Tipp nichts: preload none, die Quelle erst in quelle()",
  /setAttribute\("preload", "none"\)/.test(raQ) && (raQ.match(/vid\.src = /g) || []).length === 1 && /function quelle\(/.test(raQ));
ok("abspielen-rahmen.js: Stopp nimmt die Quelle weg (jedes Laden hört auf)", /vid\.removeAttribute\("src"\);\s*try \{ vid\.load\(\); \}/.test(raQ));
ok("abspielen-rahmen.js liest alles Seitenabhängige aus Marken am Behälter",
  ["data-video-id", "data-video-fassungen", "data-video-weg", "data-video-sw", "data-video-quelle", "data-video-laden", "data-video-merken", "data-video-ausweich"].every((n) => raQ.includes('"' + n + '"')));
ok("node --check assets/abspielen-kern.js und assets/abspielen.js", ["assets/abspielen-kern.js", "assets/abspielen.js"].every((d) => spawnSync(NODE, ["--check", join(WURZEL, d)]).status === 0));

kopf("E · node --check");
const jsDateien = ["assets/laden.js", "sw.js", ...readdirSync(join(WURZEL, "tools")).filter((n) => /\.m?js$/.test(n)).map((n) => "tools/" + n),
  ...readdirSync(join(WURZEL, "tests")).filter((n) => /\.m?js$/.test(n)).map((n) => "tests/" + n)];
for (const d of jsDateien) {
  const r = spawnSync(NODE, ["--check", join(WURZEL, d)], { encoding: "utf8" });
  ok("node --check " + d, r.status === 0, (r.stderr || "").split("\n")[0]);
}

kopf("F · das Werkzeug, in einer Wegwerf-Kopie");
const hatFfmpeg = spawnSync("ffmpeg", ["-version"]).status === 0 && spawnSync("ffprobe", ["-version"]).status === 0;
if (!hatFfmpeg) {
  nichtLauffaehig("Werkzeug-Proben", "ffmpeg/ffprobe fehlen — ohne ein Testvideo misst dieser Abschnitt nichts");
} else {
  const tmp = mkdtempSync(join(tmpdir(), "fp-videos-probe-"));
  try {
    const kopie = join(tmp, "depot");
    cpSync(join(WURZEL, "tools"), join(kopie, "tools"), { recursive: true });
    writeFileSync(join(kopie, "videos.json"), JSON.stringify({ fassung: 1, videos: [] }, null, 2) + "\n");
    const tool = join(kopie, "tools/video-aufnehmen.mjs");
    const film = join(tmp, "film.mp4");
    execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "testsrc2=size=320x240:rate=25", "-f", "lavfi",
      "-i", "sine=frequency=440:sample_rate=44100", "-t", "2", "-c:v", "libx264", "-b:v", "2M", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", film]);
    const filmGroesse = statSync(film).size;
    /* ohne genug Bytes gibt es mit --teil 1000 keine 101 Teile — dann misst der Fall dazu nichts */
    ok(`Testvideo groß genug für den Fall „mehr als 100 Teile“ (${filmGroesse} Bytes)`, filmGroesse > 101 * 1000);
    const filmSha = sha(readFileSync(film));
    const lauf = (args, env) => spawnSync(NODE, [tool, ...args], { encoding: "utf8", env: env || process.env, cwd: tmp });
    const listeK = () => JSON.parse(readFileSync(join(kopie, "videos.json"), "utf8"));
    const teileIn = (id) => existsSync(join(kopie, "videos", id)) ? readdirSync(join(kopie, "videos", id)).filter((n) => /^teil-\d\d\.bin$/.test(n)) : [];

    const r1 = lauf([film, "--id", "probe-a", "--titel", "Probe A", "--teil", "20000"]);
    ok("aufnehmen: Rückgabe 0", r1.status === 0, r1.stderr);
    const a = listeK().videos.find((v) => v.id === "probe-a");
    ok("aufnehmen: Eintrag steht in videos.json", !!a);
    if (a) {
      ok("aufnehmen: der Eintrag besteht die Prüfung der Seite", typeof gueltig === "function" && gueltig(a));
      ok(`aufnehmen: in mehrere Teile zerlegt (${a.teile.length})`, a.teile.length === Math.ceil(filmGroesse / 20000) && a.teile.length > 1);
      ok("aufnehmen: Teile auf der Platte = Teile in der Liste", teileIn("probe-a").length === a.teile.length);
      ok("aufnehmen: Gesamtgröße und Prüfsumme = die Quelldatei", a.groesse === filmGroesse && a.sha256 === filmSha);
      ok("aufnehmen: gemessen statt geraten — 320 × 240, 25 fps, H.264, AAC 44,1 kHz",
        a.breite === 320 && a.hoehe === 240 && a.fps === 25 && a.video === "H.264" && a.ton === "AAC" && a.tonHz === 44100 && a.tonKanaele === 1,
        JSON.stringify({ b: a.breite, h: a.hoehe, fps: a.fps, v: a.video, t: a.ton, hz: a.tonHz, k: a.tonKanaele }));
      ok("aufnehmen: Länge gemessen (2 s)", Math.abs(a.dauer - 2) < 0.1, a.dauer);
      ok("aufnehmen: Vorschaubild abgelegt", a.vorschau === "videos/probe-a/vorschau.jpg" && existsSync(join(kopie, a.vorschau)));
      ok("aufnehmen: Dateiname folgt der Kennung, wenn keiner genannt ist", a.dateiname === "probe-a.mp4");
      const vf = a.vorschauFilm, vfp = vf ? join(kopie, vf.pfad) : "";
      ok("aufnehmen: Vorschaufilm abgelegt, Größe und SHA stimmen", !!vf && vf.pfad === "videos/probe-a/vorschau.mp4" && existsSync(vfp) &&
        statSync(vfp).size === vf.groesse && sha(readFileSync(vfp)) === vf.sha256, JSON.stringify(vf));
      if (vf && existsSync(vfp)) {
        const pr = spawnSync("ffprobe", ["-v", "error", "-show_entries", "stream=codec_type,width,height", "-of", "json", vfp], { encoding: "utf8" });
        const st = JSON.parse(pr.stdout || "{}").streams || [];
        ok("aufnehmen: Vorschaufilm ohne Ton, höchstens 960 × 540", st.length === 1 && st[0].codec_type === "video" && st[0].width <= 960 && st[0].height <= 540, JSON.stringify(st));
      }
      ok("aufnehmen: sagt am Ende, welche Probe zu fahren ist", /node tests\/smoke\.mjs/.test(r1.stdout));
    }

    const vorher = sha(readFileSync(join(kopie, "videos.json")));
    const r2 = lauf([film, "--id", "probe-a", "--titel", "Noch einmal", "--teil", "20000"]);
    ok("ohne --ersetzen wird nichts überschrieben (Rückgabe 1)", r2.status === 1 && /gibt es schon/.test(r2.stderr), r2.status + " " + r2.stderr);
    ok("… und die Liste ist unverändert", sha(readFileSync(join(kopie, "videos.json"))) === vorher);

    const r3 = lauf([film, "--id", "probe-a", "--titel", "Probe A neu", "--teil", "40000", "--ersetzen"]);
    const a2 = listeK().videos.find((v) => v.id === "probe-a");
    ok("mit --ersetzen: Rückgabe 0, neuer Titel", r3.status === 0 && a2 && a2.titel === "Probe A neu", r3.stderr);
    ok("mit --ersetzen: keine alten Teile bleiben liegen", a2 && teileIn("probe-a").length === a2.teile.length && a2.teile.length === Math.ceil(filmGroesse / 40000));
    ok("mit --ersetzen: die Kennung steht nur einmal in der Liste", listeK().videos.filter((v) => v.id === "probe-a").length === 1);
    ok("mit --ersetzen: Vorschaufilm neu erzeugt und eingetragen", a2 && a2.vorschauFilm && existsSync(join(kopie, a2.vorschauFilm.pfad)) && sha(readFileSync(join(kopie, a2.vorschauFilm.pfad))) === a2.vorschauFilm.sha256);

    const r4 = lauf([film, "--id", "probe-b", "--titel"]);
    ok("ein Schalter ohne Wert ist ein Fehler (Rückgabe 2), kein Rückfall", r4.status === 2 && /--titel braucht einen Wert/.test(r4.stderr), r4.status + " " + r4.stderr);
    const r4b = lauf([film, "--id", "probe-b", "--titel", ""]);
    ok("… auch ein LEERER Wert", r4b.status === 2, r4b.status);
    const r5 = lauf([film, "--id", "Probe B", "--titel", "x"]);
    ok("ungültige Kennung: Rückgabe 2", r5.status === 2, r5.status);
    const r6 = lauf([film, "--id", "probe-b", "--titel", "x", "--teil", "999"]);
    ok("--teil unter 1000: Rückgabe 2", r6.status === 2, r6.status);
    const r7 = lauf([film, "--id", "probe-b", "--titel", "x", "--teil", "1000"]);
    ok("mehr als 100 Teile: abgelehnt, BEVOR etwas geschrieben wird", r7.status === 1 && /100 Teile/.test(r7.stderr) && !existsSync(join(kopie, "videos", "probe-b")), r7.status + " " + r7.stderr);

    /* 1-GB-Grenze: eine dünne Datei zählt mit ihrer Größe, belegt aber keinen Platz */
    const ballast = join(kopie, "ballast.bin");
    closeSync(openSync(ballast, "w")); truncateSync(ballast, werkzeug.SEITE_MAX - 1000);
    const r8 = lauf([film, "--id", "probe-c", "--titel", "x", "--teil", "20000"]);
    ok("über 1 GB: abgelehnt, nichts geschrieben", r8.status === 1 && /1 000 MB/.test(r8.stderr) && !existsSync(join(kopie, "videos", "probe-c")), r8.status + " " + r8.stderr);
    rmSync(ballast);

    /* ohne ffprobe und ffmpeg: Lücken bleiben Lücken */
    const r9 = lauf([film, "--id", "probe-d", "--titel", "Ohne Messung", "--teil", "20000"], { ...process.env, PATH: dirname(NODE) });
    const d = listeK().videos.find((v) => v.id === "probe-d");
    ok("ohne ffprobe: aufgenommen, mit Warnung", r9.status === 0 && /ffprobe fehlt/.test(r9.stderr), r9.status + " " + r9.stderr);
    ok("ohne ffprobe: alle Messwerte null, keiner geraten",
      d && ["breite", "hoehe", "dauer", "fps", "video", "videoBitrate", "ton", "tonHz", "tonKanaele"].every((k) => d[k] === null));
    ok("ohne ffmpeg: kein Vorschaubild, und das steht als null da", d && d.vorschau === null && !existsSync(join(kopie, "videos/probe-d/vorschau.jpg")));
    ok("ohne ffmpeg: kein Vorschaufilm, und das steht als null da", d && d.vorschauFilm === null && !existsSync(join(kopie, "videos/probe-d/vorschau.mp4")));
    ok("ohne Messung trotzdem gültig für die Seite", d && typeof gueltig === "function" && gueltig(d));
    const reihe = listeK().videos.map((v) => v.id);
    ok("das zuletzt aufgenommene steht oben", reihe[0] === "probe-d", reihe.join(","));
    /* --ohne-film: eine kleinere Fassung braucht keinen eigenen Vorschaufilm */
    const r9b = lauf([film, "--id", "probe-e", "--titel", "Ohne Film", "--teil", "20000", "--ohne-film"]);
    const e9 = listeK().videos.find((v) => v.id === "probe-e");
    ok("--ohne-film: aufgenommen, vorschauFilm null und keine Datei", r9b.status === 0 && e9 && e9.vorschauFilm === null && !existsSync(join(kopie, "videos/probe-e/vorschau.mp4")), r9b.status + " " + r9b.stderr);

    const r10 = lauf(["--liste"]);
    ok("--liste nennt alle Videos und die Seitengröße", r10.status === 0 && /probe-a/.test(r10.stdout) && /probe-d/.test(r10.stdout) && /Seite:/.test(r10.stdout));
    const r11 = lauf(["--entfernen", "probe-a"]);
    ok("--entfernen: Ordner und Eintrag weg", r11.status === 0 && !existsSync(join(kopie, "videos/probe-a")) && !listeK().videos.some((v) => v.id === "probe-a"), r11.stderr);
    const r12 = lauf(["--entfernen", "gibt-es-nicht"]);
    ok("--entfernen einer unbekannten Kennung: Rückgabe 1", r12.status === 1, r12.status);
    const r13 = lauf(["--entfernen", "../videos"]);
    ok("--entfernen mit Pfad statt Kennung: Rückgabe 2, nichts gelöscht", r13.status === 2 && existsSync(join(kopie, "videos/probe-d")), r13.status);
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}

console.log(`\n${gruen} grün · ${rot} ROT · ${stumm} nicht lauffähig`);
process.exitCode = rot ? 1 : stumm ? 2 : 0;
