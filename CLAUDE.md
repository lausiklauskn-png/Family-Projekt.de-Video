# Family-Projekt.de · Videos — Sitzungs-Anker

Eine installierbare Seite (PWA) zum Herunterladen großer Videos. Kein
Build-Schritt, kein Server außer GitHub Pages. Gebaut am 2026-10-02 (Klaus:
*„die Downloadseite soll Standard werden bei uns für große Videos und soll auch
über eine App erreichbar sein. Also klick, klick und schwupps“*).

Adresse: https://lausiklauskn-png.github.io/Family-Projekt.de-Video/

## Wie es gebaut ist

| | |
|---|---|
| `videos.json` | die Liste; das Werkzeug schreibt sie, nie von Hand |
| `videos/<kennung>/teil-NN.bin` | das Video in Teilen zu 14 000 000 Bytes, je mit Größe und SHA-256 in der Liste |
| `assets/laden.js` | Liste zeichnen, Teile holen und prüfen, Speichern, Installieren, ⟳, Neigung |
| `assets/stil.css` | Farben aus family-projekt.de (Minze) und Sende-Prüfer (Petrol), Knöpfe nach family-project, flacher |
| `sw.js` | Offline-Schale: nur die Schale im Vorrat, **nie** `videos/` oder `videos.json` |
| `tools/video-aufnehmen.mjs` | aufnehmen · `--ersetzen` · `--entfernen` · `--liste` |

**Ein Video aufnehmen:**

```bash
node tools/video-aufnehmen.mjs <datei.mp4> --id <kennung> --titel "<Titel>" [--beschreibung "…"] [--dateiname <name.mp4>] [--vorschau-bei <s>]
node tools/video-aufnehmen.mjs <datei.mp4> --id werbevideo-60s --titel "…" --ersetzen
```

Messwerte (Bild, Länge, fps, Ton) kommen aus `ffprobe`. Fehlt es, steht `null`
da und die Seite sagt „nicht gemessen“ — nie eine geratene Zahl.

## Was hier leicht kaputtgeht

- **Cache-Bump:** wer eine Datei aus `SCHALE` in `sw.js` ändert, erhöht
  `CACHE_VERSION` (`fp-videos-vN`) **und** die `?v=` in `index.html` und in
  `SCHALE` — wortgleich, sonst holt der Worker eine andere Adresse als die Seite.
  Die Smoke-Probe misst das.
- **⟳ räumt nur Vorräte mit `fp-videos-`.** github.io ist eine geteilte Adresse;
  ein Muster, das alles trifft, nähme den Geschwister-Apps ihren Vorrat.
- **Texte aus `videos.json` gehen nie über `innerHTML`** — immer `textContent`.
- **Grenzen:** ganze Seite ≤ 1 GB (Pages), jede Datei < 50 MB, ein Video ≤ 100
  Teile. Das Werkzeug prüft alles **vor** dem Schreiben.
- **Entfernen macht das Depot nicht kleiner** — die Historie behält jedes Video.
  Ein ersetztes Video wächst das Depot um seine volle Größe.
- **Pushen in Etappen:** ein Push mit 190 MB riss im Behälter ab. Je Push etwa
  fünf Teile, mit ausdrücklicher Refspec.
- **Das Depot ist öffentlich.** Nichts hineinlegen, was nicht jeder laden darf.

## ⚠ Die Neigung flackerte an der Kante — und `getBoundingClientRect` war schuld

Die Knöpfe kippen dem Mauszeiger nach (bis 9°, das Vorschaubild 4°; nicht am
Finger, nicht bei „weniger Bewegung“, nicht ausgeschaltet). `getBoundingClientRect()`
liefert das **geneigte** Bild: die abgewandte Kante rückt einige Pixel nach innen.
Wer danach misst, verliert den Knopf am Rand unter dem Zeiger, die Neigung springt
zurück, der Knopf ist wieder da — ein Flackern genau an der Kante.

Gemessen wird deshalb die **flache** Lage aus dem Layout (`flach()`: offsetLeft
und Co. kennen keine transform), und ein Zeiger über dem freigegebenen Rand gehört
weiter zum Knopf, solange er in dessen flacher Lage steht. Die Probe misst beide
Richtungen: am Rand bleibt die Neigung stehen, drei Pixel daneben liegt der Knopf flach.

⚠ **Und zwei Fassungen der Probe maßen den falschen Augenblick:** die erste las
die Lage des Knopfs, während die Karten noch auftauchten (bis 16 px tiefer); eine
spätere wartete nach dem Rollen 150 ms und war in einer Kopie einmal rot. Gemessen
wird jetzt nach dem Ende aller endlichen Animationen, und beim **ersten**
scroll-Ereignis — danach schickt der Browser selbst eine Zeigerbewegung, und die
legte den Knopf ebenfalls flach.

⚠ **Und die Kante selbst hing an der Last der Maschine.** Die Neigung läuft
`transform .14s` aus; mitten im Übergang lag der Knopf in der Wegwerf-Kopie noch
unter dem Zeiger, und die Gegenprobe KANTE fiel an der **Vorbedingung** statt am
Wächter („aus falschem Grund“). Nach jeder Bewegung wartet die Probe jetzt, bis
die Animationen des Knopfs stehen — eine Bedingung, keine Frist.

⚠ **Eine Probe, die auf etwas wartet, das nicht kommt, misst danach nichts.**
Im Fall VORRAT kam „Weiter laden“ nicht zu „fertig“, die Probe wartete 30 s auf
einen Download und stolperte — Vorrat, offline und ⟳ blieben ungemessen.
Gespeichert wird jetzt nur, wenn die Karte wirklich fertig ist; sonst zwei rote
Zeilen mit Grund, und die Probe läuft weiter.

## Prüfen

```bash
node tests/smoke.mjs        # ohne Browser
node tests/browser.mjs      # echter Browser (playwright-core + Chromium)
node tests/gegenprobe.mjs   # in einer Wegwerf-Kopie; NUR_ANKER=1 · NUR_FALL="KANTE:"
```

Fehlt der Browser, meldet die Browser-Probe „nicht lauffähig“ mit Rückgabe 2.
Die Gegenprobe prüft je Fall, ob die rote Zeile den Namen **ihrer** Zusicherung
trägt; „gefangen“ allein reicht nicht.

⚠ **Benannte Grenze:** die Neigung am **Finger** (keine) ist nicht gemessen —
`pointerType` lässt sich im Headless-Browser nicht auf „touch“ stellen, ohne die
Touch-Ereignisse selbst zu stellen. Ebenso nicht gemessen: Laden und Speichern am
Tablet und echte github.io-Auslieferung (aus dem Behälter gesperrt, 403).

## Netzweit

Freibrief · frisch von `origin/main` · Ton · kein PII · Ehrlichkeit:
[Sage-Protokol/docs/NETZWEIT.md](https://github.com/lausiklauskn-png/Sage-Protokol/blob/main/docs/NETZWEIT.md)
