#!/usr/bin/env node
/* Ein Video in die Download-App aufnehmen, ersetzen oder entfernen.
 *
 *   node tools/video-aufnehmen.mjs <datei.mp4> --id <kennung> --titel "<Titel>"
 *        [--beschreibung "<ein, zwei Sätze>"] [--dateiname <name.mp4>]
 *        [--vorschau <bild.jpg> | --vorschau-bei <sekunden>] [--ersetzen]
 *   node tools/video-aufnehmen.mjs --entfernen <kennung>
 *   node tools/video-aufnehmen.mjs --film-nachtragen <kennung>
 *   node tools/video-aufnehmen.mjs --liste
 *
 * Was es tut:
 *   · zerlegt die Datei in Teile zu je 14 000 000 Bytes (videos/<kennung>/teil-NN.bin)
 *   · rechnet je Teil UND für die ganze Datei die SHA-256-Prüfsumme
 *   · liest Bild, Länge, Bildrate, Video- und Tonart mit ffprobe (fehlt ffprobe,
 *     steht „nicht gemessen“ da — nie eine geratene Zahl)
 *   · legt ein Vorschaubild ab (eigenes Bild, oder ein Standbild per ffmpeg)
 *   · legt einen Vorschaufilm ab (videos/<kennung>/vorschau.mp4: 960×540, ohne
 *     Ton, höchstens 14 MB) — für „Laden mit Vorschaufilm“. Ohne ffmpeg null,
 *     und der Knopf bleibt auf der Seite verborgen.
 *   · --film-nachtragen setzt die Teile eines vorhandenen Videos wieder
 *     zusammen (Prüfsumme gegen die Liste), legt NUR den Vorschaufilm neu an
 *     und lässt alles andere am Eintrag stehen.
 *   · trägt das Video in videos.json ein, das neueste zuerst
 *
 * Grenzen, die es selbst prüft (GitHub Pages):
 *   · eine Seite darf höchstens 1 GB groß sein → über 1 000 000 000 Bytes bricht es ab
 *   · ab 900 000 000 Bytes warnt es
 *   · keine Datei über 50 MB (GitHub warnt ab 50 MB, lehnt ab 100 MB ab)
 *
 * Ein Video, das es schon gibt, wird nur mit --ersetzen überschrieben. Ein
 * entferntes Video verschwindet von der Seite, bleibt aber in der Git-Historie
 * (das Depot wird davon nicht kleiner). */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  closeSync, copyFileSync, existsSync, mkdirSync, openSync, readFileSync, readSync,
  readdirSync, rmSync, statSync, writeFileSync
} from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const TEIL_BYTES = 14000000;
export const SEITE_MAX = 1000000000;
export const SEITE_WARNUNG = 900000000;
export const DATEI_MAX = 50000000;
export const FILM_MAX = 14000000;
export const FILM_BREITE = 960;
export const FILM_HOEHE = 540;
export const KENNUNG = /^[a-z0-9][a-z0-9-]{1,59}$/;

const WURZEL = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const LISTE = join(WURZEL, "videos.json");

function fehler(text, code = 1) {
  console.error("✗ " + text);
  process.exit(code);
}

function argumente(argv) {
  const a = { frei: [] };
  for (let i = 0; i < argv.length; i++) {
    const s = argv[i];
    if (!s.startsWith("--")) { a.frei.push(s); continue; }
    const name = s.slice(2);
    if (name === "ersetzen" || name === "liste") { a[name] = true; continue; }
    const wert = argv[i + 1];
    /* Ein Schalter ohne Wert ist ein Fehler, kein stiller Rückfall auf die Vorgabe. */
    if (wert === undefined || wert.startsWith("--") || wert === "") fehler(`--${name} braucht einen Wert`, 2);
    a[name] = wert; i++;
  }
  return a;
}

export function listeLesen(datei = LISTE) {
  if (!existsSync(datei)) return { fassung: 1, videos: [] };
  const d = JSON.parse(readFileSync(datei, "utf8"));
  if (!d || !Array.isArray(d.videos)) throw new Error("videos.json hat keine Liste „videos“");
  return d;
}

function listeSchreiben(d, datei = LISTE) {
  d.videos.sort((x, y) => String(y.aufgenommen).localeCompare(String(x.aufgenommen)));
  writeFileSync(datei, JSON.stringify(d, null, 2) + "\n");
}

/* Alle Bytes, die die Seite ausliefert. Pages veröffentlicht das ganze Depot,
   also zählen tests/ und tools/ mit; nur .git und node_modules (nie committet) nicht. */
export function seitenGroesse(wurzel = WURZEL) {
  let summe = 0;
  const weg = new Set([".git", "node_modules"]);
  (function lauf(ordner) {
    for (const e of readdirSync(ordner, { withFileTypes: true })) {
      if (weg.has(e.name) && ordner === wurzel) continue;
      const p = join(ordner, e.name);
      if (e.isDirectory()) lauf(p);
      else if (e.isFile()) summe += statSync(p).size;
    }
  })(wurzel);
  return summe;
}

function messen(datei) {
  try {
    const roh = execFileSync("ffprobe", ["-v", "error", "-show_streams", "-show_format", "-of", "json", datei], { encoding: "utf8" });
    const j = JSON.parse(roh);
    const v = (j.streams || []).find((s) => s.codec_type === "video");
    const t = (j.streams || []).find((s) => s.codec_type === "audio");
    const bruch = (s) => { const [z, n] = String(s || "0/1").split("/").map(Number); return n ? z / n : null; };
    const codec = (c) => ({ h264: "H.264", hevc: "H.265", vp9: "VP9", av1: "AV1", aac: "AAC", opus: "Opus", mp3: "MP3" }[c] || (c ? c.toUpperCase() : null));
    return {
      breite: v ? v.width : null,
      hoehe: v ? v.height : null,
      dauer: j.format && j.format.duration ? Math.round(Number(j.format.duration) * 1000) / 1000 : null,
      fps: v ? Math.round(bruch(v.r_frame_rate) * 100) / 100 : null,
      video: v ? codec(v.codec_name) : null,
      videoBitrate: v && v.bit_rate ? Number(v.bit_rate) : null,
      ton: t ? codec(t.codec_name) : null,
      tonHz: t && t.sample_rate ? Number(t.sample_rate) : null,
      tonKanaele: t ? t.channels : null
    };
  } catch (e) {
    console.warn("⚠ ffprobe fehlt oder kann die Datei nicht lesen — Bilddaten stehen als „nicht gemessen“ da.");
    return { breite: null, hoehe: null, dauer: null, fps: null, video: null, videoBitrate: null, ton: null, tonHz: null, tonKanaele: null };
  }
}

function zerlegen(datei, zielOrdner, teilBytes) {
  const groesse = statSync(datei).size;
  const ganz = createHash("sha256");
  const teile = [];
  const fd = openSync(datei, "r");
  try {
    let pos = 0, n = 0;
    while (pos < groesse) {
      const laenge = Math.min(teilBytes, groesse - pos);
      const buf = Buffer.alloc(laenge);
      let gelesen = 0;
      while (gelesen < laenge) gelesen += readSync(fd, buf, gelesen, laenge - gelesen, pos + gelesen);
      ganz.update(buf);
      const name = "teil-" + String(n).padStart(2, "0") + ".bin";
      writeFileSync(join(zielOrdner, name), buf);
      teile.push({ groesse: laenge, sha256: createHash("sha256").update(buf).digest("hex") });
      pos += laenge; n++;
    }
  } finally { closeSync(fd); }
  return { groesse, sha256: ganz.digest("hex"), teile };
}

function vorschauAnlegen(datei, zielOrdner, a, dauer) {
  const ziel = join(zielOrdner, "vorschau.jpg");
  if (a.vorschau) {
    if (!existsSync(a.vorschau)) fehler("Vorschaubild nicht gefunden: " + a.vorschau);
    if (statSync(a.vorschau).size > 2000000) fehler("Vorschaubild über 2 MB — bitte kleiner (1280 px breit genügt)");
    copyFileSync(a.vorschau, ziel);
    return true;
  }
  const bei = a["vorschau-bei"] !== undefined ? Number(a["vorschau-bei"]) : (dauer ? Math.min(dauer * 0.4, dauer - 0.1) : 1);
  if (!Number.isFinite(bei) || bei < 0) fehler("--vorschau-bei braucht eine Zahl in Sekunden");
  try {
    execFileSync("ffmpeg", ["-v", "error", "-y", "-ss", String(bei), "-i", datei, "-frames:v", "1",
      "-vf", "scale='min(1280,iw)':-2", "-q:v", "4", ziel], { stdio: ["ignore", "ignore", "pipe"] });
    return existsSync(ziel);
  } catch (e) {
    console.warn("⚠ ffmpeg fehlt — kein Vorschaubild. Mit --vorschau <bild.jpg> eins mitgeben.");
    return false;
  }
}

/* Der Vorschaufilm: dasselbe Video, klein und stumm, für das Fenster der Ladeschau.
   Die Bitrate wird aus der Länge gerechnet, damit er unter FILM_MAX bleibt; ist er
   trotzdem zu groß, wird mit halber Bitrate neu gerechnet. Ohne ffmpeg: null. */
function filmAnlegen(datei, zielOrdner, dauer) {
  const ziel = join(zielOrdner, "vorschau.mp4");
  const sek = dauer && dauer > 0 ? dauer : 60;
  let kbit = Math.min(1600, Math.floor(FILM_MAX * 0.85 * 8 / sek / 1000));
  for (let versuch = 0; versuch < 4; versuch++) {
    try {
      execFileSync("ffmpeg", ["-v", "error", "-y", "-i", datei, "-an", "-map_metadata", "-1",
        "-vf", `scale=${FILM_BREITE}:${FILM_HOEHE}:force_original_aspect_ratio=decrease,pad=${FILM_BREITE}:${FILM_HOEHE}:(ow-iw)/2:(oh-ih)/2,setsar=1`,
        "-c:v", "libx264", "-preset", "slow", "-profile:v", "main", "-pix_fmt", "yuv420p",
        "-b:v", kbit + "k", "-maxrate", Math.floor(kbit * 1.5) + "k", "-bufsize", kbit * 2 + "k",
        "-movflags", "+faststart", ziel], { stdio: ["ignore", "ignore", "pipe"] });
    } catch (e) {
      if (existsSync(ziel)) rmSync(ziel);
      console.warn("⚠ ffmpeg fehlt oder scheiterte — kein Vorschaufilm. Der Knopf „Laden mit Vorschaufilm“ bleibt verborgen.");
      return null;
    }
    const groesse = statSync(ziel).size;
    if (groesse > 0 && groesse <= FILM_MAX) {
      return { groesse, sha256: createHash("sha256").update(readFileSync(ziel)).digest("hex") };
    }
    kbit = Math.floor(kbit / 2);
  }
  rmSync(ziel);
  console.warn("⚠ der Vorschaufilm blieb über 14 MB — keiner angelegt.");
  return null;
}

function filmEintrag(id, f) {
  return f ? { pfad: `videos/${id}/vorschau.mp4`, groesse: f.groesse, sha256: f.sha256 } : null;
}

/* Für ein Video, das schon da ist: Teile zusammensetzen, Prüfsumme gegen die
   Liste, nur den Vorschaufilm neu anlegen. Der Rest des Eintrags bleibt stehen. */
function filmNachtragen(id, wurzel = WURZEL) {
  if (!KENNUNG.test(id)) fehler("ungültige Kennung: " + id, 2);
  const d = listeLesen(join(wurzel, "videos.json"));
  const v = d.videos.find((x) => x.id === id);
  if (!v) fehler("kein Video mit der Kennung " + id);
  const ordner = join(wurzel, "videos", id);
  const ganz = join(ordner, ".ganz-" + process.pid + ".mp4");
  const h = createHash("sha256");
  try {
    const teile = v.teile.map((t, i) => {
      const b = readFileSync(join(ordner, "teil-" + String(i).padStart(2, "0") + ".bin"));
      if (b.length !== t.groesse || createHash("sha256").update(b).digest("hex") !== t.sha256) fehler(`Teil ${i + 1} stimmt nicht mit der Liste überein`);
      h.update(b);
      return b;
    });
    if (h.digest("hex") !== v.sha256) fehler("das zusammengesetzte Video stimmt nicht mit der Liste überein");
    writeFileSync(ganz, Buffer.concat(teile));
    const f = filmAnlegen(ganz, ordner, v.dauer);
    v.vorschauFilm = filmEintrag(id, f);
    listeSchreiben(d, join(wurzel, "videos.json"));
    console.log(f ? `✓ ${id}: Vorschaufilm ${(f.groesse / 1e6).toFixed(1)} MB` : `⚠ ${id}: kein Vorschaufilm`);
  } finally { if (existsSync(ganz)) rmSync(ganz); }
}

function entfernen(id, wurzel = WURZEL) {
  if (!KENNUNG.test(id)) fehler("ungültige Kennung: " + id, 2);
  const d = listeLesen(join(wurzel, "videos.json"));
  const vorher = d.videos.length;
  d.videos = d.videos.filter((v) => v.id !== id);
  const ordner = join(wurzel, "videos", id);
  if (d.videos.length === vorher && !existsSync(ordner)) fehler("kein Video mit der Kennung " + id);
  if (existsSync(ordner)) rmSync(ordner, { recursive: true });
  listeSchreiben(d, join(wurzel, "videos.json"));
  console.log("✓ entfernt: " + id + " — von der Seite weg, in der Git-Historie bleibt es.");
}

function aufnehmen(a) {
  const quelle = a.frei[0];
  if (!quelle) fehler("Welche Datei? node tools/video-aufnehmen.mjs <datei.mp4> --id … --titel …", 2);
  if (!existsSync(quelle)) fehler("Datei nicht gefunden: " + quelle);
  const id = a.id;
  if (!id || !KENNUNG.test(id)) fehler("--id fehlt oder ist ungültig (klein, Ziffern, Bindestriche, z. B. werbevideo-60s)", 2);
  if (!a.titel) fehler("--titel fehlt", 2);
  const teilBytes = a.teil ? Number(a.teil) : TEIL_BYTES;
  if (!Number.isInteger(teilBytes) || teilBytes < 1000 || teilBytes > DATEI_MAX) fehler("--teil muss zwischen 1000 und 50 000 000 Bytes liegen", 2);

  const d = listeLesen();
  const alt = d.videos.find((v) => v.id === id);
  const ordner = join(WURZEL, "videos", id);
  if ((alt || existsSync(ordner)) && !a.ersetzen) fehler(`ein Video „${id}“ gibt es schon — mit --ersetzen überschreiben`);

  const neuGroesse = statSync(quelle).size;
  /* VOR dem Schreiben prüfen: ein Abbruch mittendrin ließe halbe Teile liegen */
  if (Math.ceil(neuGroesse / teilBytes) > 100) fehler("mehr als 100 Teile — die Seite zählt zweistellig (teil-00 … teil-99). Größeres --teil wählen.");
  const altGroesse = existsSync(ordner) ? seitenGroesse(ordner) : 0;
  /* der Vorschaufilm zählt mit, höchstens FILM_MAX */
  const danach = seitenGroesse() - altGroesse + neuGroesse + FILM_MAX;
  if (danach > SEITE_MAX) {
    fehler(`danach wäre die Seite ${(danach / 1e6).toFixed(1)} MB groß — GitHub Pages erlaubt höchstens 1 000 MB. Erst ein Video entfernen (--entfernen).`);
  }

  if (existsSync(ordner)) rmSync(ordner, { recursive: true });
  mkdirSync(ordner, { recursive: true });
  const z = zerlegen(quelle, ordner, teilBytes);
  const m = messen(quelle);
  const mitVorschau = vorschauAnlegen(quelle, ordner, a, m.dauer);
  const film = filmAnlegen(quelle, ordner, m.dauer);

  const eintrag = {
    id,
    titel: a.titel,
    beschreibung: a.beschreibung || "",
    dateiname: a.dateiname || (id + ".mp4"),
    groesse: z.groesse,
    sha256: z.sha256,
    vorschau: mitVorschau ? `videos/${id}/vorschau.jpg` : null,
    vorschauFilm: filmEintrag(id, film),
    ...m,
    aufgenommen: new Date().toISOString(),
    teile: z.teile
  };
  d.videos = d.videos.filter((v) => v.id !== id);
  d.videos.push(eintrag);
  listeSchreiben(d);

  console.log(`✓ ${id}: ${z.teile.length} Teile · ${(z.groesse / 1e6).toFixed(1)} MB · sha256 ${z.sha256}`);
  const jetzt = seitenGroesse();
  console.log(`  Seite jetzt ${(jetzt / 1e6).toFixed(1)} MB von 1 000 MB` + (film ? ` · Vorschaufilm ${(film.groesse / 1e6).toFixed(1)} MB` : " · kein Vorschaufilm"));
  if (jetzt > SEITE_WARNUNG) console.warn("⚠ die Seite nähert sich der Grenze von 1 GB.");
  console.log("  Jetzt prüfen: node tests/smoke.mjs");
}

const istDirekt = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (istDirekt) {
  const a = argumente(process.argv.slice(2));
  if (a.liste) {
    for (const v of listeLesen().videos) console.log(`${v.id}  ${(v.groesse / 1e6).toFixed(1)} MB  ${v.titel}`);
    console.log(`Seite: ${(seitenGroesse() / 1e6).toFixed(1)} MB von 1 000 MB`);
  } else if (a.entfernen) entfernen(a.entfernen);
  else if (a["film-nachtragen"]) filmNachtragen(a["film-nachtragen"]);
  else aufnehmen(a);
}

export { entfernen, filmNachtragen, relative, basename };
