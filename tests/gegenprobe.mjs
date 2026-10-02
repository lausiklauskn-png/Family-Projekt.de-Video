#!/usr/bin/env node
/* Gegenprobe: baut absichtlich Fehler ein. Jeder muss eine Probe rot machen —
 * und zwar mit dem Namen SEINER Zusicherung in der roten Zeile.
 *
 *   node tests/gegenprobe.mjs                 alle Fälle (einige Minuten)
 *   NUR_ANKER=1 node tests/gegenprobe.mjs     nur prüfen, ob jeder Anker genau einmal trifft (Sekunden)
 *   NUR_FALL="KANTE:" node tests/gegenprobe.mjs
 *
 * Gefahren wird in einer WEGWERF-KOPIE des Depots, nie im echten Baum: ein
 * abgebrochener Lauf ließe sonst eine Sabotage liegen, und die sähe danach aus
 * wie ein Baufehler.
 *
 * Vier Ausgänge je Fall:
 *   gefangen            eine rote Zeile trägt den erwarteten Namen
 *   aus falschem Grund  rot, aber keine rote Zeile trägt ihn (die Sabotage traf etwas anderes)
 *   blind               alles grün — der Wächter sieht den Fehler nicht
 *   toter Anker         die Stelle steht nicht (genau einmal) in der Datei — der Fall misst nichts */
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const WURZEL = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const NODE = process.execPath;
const NUR_ANKER = !!process.env.NUR_ANKER;
const NUR_FALL = process.env.NUR_FALL || "";

/* Jeder Fall: Name, Datei, Ersetzungen [Anker, Ersatz], welche Probe(n), und
 * woran die rote Zeile zu erkennen ist. Zwei Riegel, die einander decken,
 * stehen in EINEM Fall — einer allein misst nichts. */
const FAELLE = [
  { name: "KANTE: die Lage wird wieder am GENEIGTEN Bild gemessen (getBoundingClientRect)",
    datei: "assets/laden.js",
    ersetze: [["var r = flach(el);", "var r = el.getBoundingClientRect();"],
              ["var f0 = flach(aktiv);", "var f0 = aktiv.getBoundingClientRect();"]],
    proben: ["browser"], erwartet: /kein Flackern/ },
  { name: "HALT: der Zeiger über dem freigegebenen Rand gehört nicht mehr zum Knopf",
    datei: "assets/laden.js",
    ersetze: [["if (!el && aktiv) {", "if (false) {"]],
    proben: ["browser"], erwartet: /kein Flackern/ },
  { name: "AUSSEN: der Rand-Riegel fragt nicht mehr, ob der Zeiger in der flachen Lage steht",
    datei: "assets/laden.js",
    ersetze: [["if (f0 && e.clientX >= f0.left && e.clientX <= f0.right && e.clientY >= f0.top && e.clientY <= f0.bottom) el = aktiv;", "if (f0) el = aktiv;"]],
    proben: ["browser"], erwartet: /drei Pixel neben der flachen Lage/ },
  { name: "ROLLEN: Rollen lässt die Neigung stehen",
    datei: "assets/laden.js",
    ersetze: [['addEventListener("scroll", loslassen, { passive: true, capture: true });', ""]],
    proben: ["browser"], erwartet: /rollt unter dem Zeiger weg/ },
  { name: "AUS: ein ausgeschalteter Knopf kippt mit",
    datei: "assets/laden.js",
    ersetze: [["if (!el || el.disabled) return;", "if (!el) return;"]],
    proben: ["browser"], erwartet: /ausgeschalteter Knopf kippt nicht/ },
  { name: "RUHIG: „weniger Bewegung“ wird nicht beachtet",
    datei: "assets/laden.js",
    ersetze: [["if (!ruhig) {", "if (true) {"]],
    proben: ["browser"], erwartet: /weniger Bewegung: der Knopf kippt nicht/ },
  { name: "SUMME: ein Teil mit falscher Prüfsumme wird angenommen",
    datei: "assets/laden.js",
    ersetze: [['if (summe !== t.sha256) throw new Error("Prüfsumme stimmt nicht");', ""]],
    proben: ["browser"], erwartet: /A: Lage „fehler“|Prüfsumme stimmt nicht/ },
  { name: "WEITER: „Weiter laden“ holt die schon geprüften Teile noch einmal",
    datei: "assets/laden.js",
    ersetze: [["if (k.puffer[i]) { geladen += v.teile[i].groesse; continue; }", ""]],
    proben: ["browser"], erwartet: /Teil 1 und 2 wurden NICHT noch einmal geholt/ },
  { name: "EINER: während ein Video lädt, bleiben die anderen Laden-Knöpfe an",
    datei: "assets/laden.js",
    ersetze: [["laeuft = k; alleKnoepfe(false);", "laeuft = k;"]],
    proben: ["browser"], erwartet: /alle anderen Laden-Knöpfe sind aus/ },
  { name: "TEXT: der Titel aus der Liste geht über innerHTML",
    datei: "assets/laden.js",
    ersetze: [["f.titel.textContent = v.titel;", "f.titel.innerHTML = v.titel;"]],
    proben: ["smoke", "browser"], erwartet: /nie über innerHTML|steht als Text da|Skript lief nicht/ },
  { name: "FREMD: ⟳ räumt auch die Vorräte fremder Apps weg",
    datei: "assets/laden.js",
    ersetze: [["var EIGEN = /^fp-videos-/;", "var EIGEN = /./;"]],
    proben: ["browser"], erwartet: /Vorrat einer fremden App bleibt/ },
  { name: "VORRAT: der Worker legt alles ab, auch Teile und Liste",
    datei: "sw.js",
    ersetze: [['if (rest.startsWith("videos/") || rest === "videos.json") return;', ""],
              ["if (!istSchale(url)) return;", ""],
              ["e.respondWith(caches.match(req).then((r) => r || fetch(req)));",
               "e.respondWith(caches.match(req).then((r) => r || fetch(req).then((a) => { const k = a.clone(); caches.open(CACHE_VERSION).then((c) => c.put(req, k)); return a; })));"]],
    proben: ["smoke", "browser"], erwartet: /kein Teil und keine Liste im Vorrat|legt nichts aus videos\/ und videos\.json ab/ },
  { name: "VERSION: die Seite holt laden.js?v=3, der Vorrat kennt ?v=2",
    datei: "sw.js",
    ersetze: [['"assets/laden.js?v=3",', '"assets/laden.js?v=2",']],
    proben: ["smoke"], erwartet: /wortgleich im Vorrat/ }
];

function zaehle(text, anker) { let n = 0, i = 0; while ((i = text.indexOf(anker, i)) !== -1) { n++; i += anker.length; } return n; }

const faelle = FAELLE.filter((f) => !NUR_FALL || f.name.startsWith(NUR_FALL));
if (!faelle.length) { console.log("Kein Fall passt zu NUR_FALL=" + NUR_FALL); process.exit(2); }

/* ── 1 · Anker: jeder muss genau einmal in seiner Datei stehen ── */
let tot = 0;
for (const f of faelle) {
  const text = readFileSync(join(WURZEL, f.datei), "utf8");
  for (const [anker] of f.ersetze) {
    const n = zaehle(text, anker);
    if (n !== 1) { tot++; console.log(`  ✗ TOTER ANKER (${n}×): ${f.name}\n      ${f.datei}: ${anker}`); }
  }
}
const anker = faelle.reduce((s, f) => s + f.ersetze.length, 0);
console.log(`${anker} Anker in ${faelle.length} Fällen geprüft, ${tot} tot`);
if (NUR_ANKER || tot) process.exit(tot ? 1 : 0);

/* ── 2 · Wegwerf-Kopie ── */
const tmp = mkdtempSync(join(tmpdir(), "fp-videos-gegenprobe-"));
const kopie = join(tmp, "depot");
cpSync(WURZEL, kopie, { recursive: true, filter: (q) => !q.includes(`${WURZEL}/.git`) && !q.includes("/node_modules") });

function fahre(probe) {
  const r = spawnSync(NODE, [join(kopie, "tests", probe + ".mjs")], { cwd: kopie, encoding: "utf8", timeout: 600000, maxBuffer: 64 << 20 });
  const aus = (r.stdout || "") + (r.stderr || "");
  return { code: r.status, aus, rot: aus.split("\n").filter((z) => z.includes("✗ ROT:")), stumm: /⊘ nicht lauffähig/.test(aus) };
}

try {
  /* Ausgangslage: ohne Eingriff muss alles grün sein, sonst misst kein Fall etwas */
  const proben = [...new Set(faelle.flatMap((f) => f.proben))];
  for (const p of proben) {
    const r = fahre(p);
    if (r.code !== 0) {
      console.log(`Ausgangslage: ${p} ist schon OHNE Eingriff nicht grün (Rückgabe ${r.code}) — abgebrochen.\n` + r.rot.join("\n"));
      process.exit(2);
    }
  }
  console.log("Ausgangslage grün: " + proben.join(", "));

  const zahl = { gefangen: 0, falsch: 0, blind: 0 };
  for (const f of faelle) {
    const pfad = join(kopie, f.datei);
    const alt = readFileSync(pfad, "utf8");
    let neu = alt;
    for (const [a, e] of f.ersetze) neu = neu.replace(a, () => e);
    if (neu === alt) { tot++; console.log(`  ✗ TOTER ANKER: ${f.name} — die Datei hat sich nicht geändert`); continue; }
    writeFileSync(pfad, neu);
    let rot = [], stumm = false;
    try {
      for (const p of f.proben) { const r = fahre(p); rot = rot.concat(r.rot); stumm = stumm || r.stumm; }
    } finally { writeFileSync(pfad, alt); }
    if (!rot.length) {
      zahl.blind++; console.log(`  ✗ BLIND: ${f.name}` + (stumm ? " (eine Probe war nicht lauffähig)" : ""));
    } else if (rot.some((z) => f.erwartet.test(z))) {
      zahl.gefangen++; console.log(`  ✓ gefangen: ${f.name}\n      ${rot.find((z) => f.erwartet.test(z)).trim()}` + (rot.length > 1 ? `  (+${rot.length - 1} weitere rote Zeile(n))` : ""));
    } else {
      zahl.falsch++; console.log(`  ✗ AUS FALSCHEM GRUND: ${f.name}\n      ` + rot.map((z) => z.trim()).join("\n      "));
    }
  }
  console.log(`\n${zahl.gefangen} gefangen · ${zahl.blind} blind · ${zahl.falsch} aus falschem Grund · ${tot} tote Anker`);
  process.exitCode = zahl.blind || zahl.falsch || tot ? 1 : 0;
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
