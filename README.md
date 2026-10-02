# Family-Projekt.de · Videos

Eine kleine App zum Herunterladen großer Videos von family-projekt.de.
Sie läuft im Browser, lässt sich als App installieren und braucht keinen Server
außer GitHub Pages.

**Adresse:** https://lausiklauskn-png.github.io/Family-Projekt.de-Video/

## So lädt man ein Video herunter

1. Die Seite öffnen. Jedes Video hat eine Karte mit Vorschaubild, Länge, Bild und Größe.
2. **⬇ Laden** tippen. Die App holt das Video in Teilen; der Streifen darunter zeigt jeden Teil.
3. Ist alles da und geprüft, **💾 Speichern** tippen. Die Datei landet bei den Downloads.

Bricht die Leitung ab, heißt der Knopf **Weiter laden**. Die schon geprüften Teile
werden dann nicht noch einmal geholt.

## Als App installieren

Oben steht **⬇ Installieren**. Bietet der Browser das Installieren an, öffnet sich
sein Dialog. Bietet er es nicht an, sagt die Seite, wie es von Hand geht
(Menü ⋮ → „App installieren“ bzw. „Zum Startbildschirm“).
Läuft die Seite schon als App, ist der Knopf verborgen.

**⟳** lädt die Seite frisch (wirft nur den eigenen Vorrat weg, nie den fremder Apps).

## Warum in Teilen?

GitHub lehnt Dateien über 100 MB ab und warnt ab 50 MB. Ein Video wird deshalb in
Teile zu je **14 000 000 Bytes** zerlegt (`videos/<kennung>/teil-NN.bin`). Die App
holt die Teile einzeln, prüft bei jedem Größe und **SHA-256-Prüfsumme** und setzt
sie erst im Browser wieder zusammen. Die gespeicherte Datei ist Byte für Byte das
Original — die Probe misst das.

Ein Teil wird bis zu dreimal versucht. Stimmt er dann noch nicht, hält die App an
und sagt, welcher Teil warum nicht kam.

## Ein Video aufnehmen, ersetzen, entfernen

Gebraucht werden Node 22, `ffprobe` und `ffmpeg` (ohne sie geht es auch, dann steht
„nicht gemessen“ da statt einer geratenen Zahl).

```bash
node tools/video-aufnehmen.mjs <datei.mp4> --id <kennung> --titel "<Titel>" \
     [--beschreibung "<ein, zwei Sätze>"] [--dateiname <name.mp4>] \
     [--vorschau <bild.jpg> | --vorschau-bei <sekunden>]
node tools/video-aufnehmen.mjs <datei.mp4> --id <kennung> --titel "…" --ersetzen
node tools/video-aufnehmen.mjs --entfernen <kennung>
node tools/video-aufnehmen.mjs --liste
```

Das Werkzeug zerlegt, rechnet die Prüfsummen, misst Bild, Länge und Ton, legt ein
Vorschaubild ab und trägt das Video in `videos.json` ein (das neueste oben).
Ein Video, das es schon gibt, wird nur mit `--ersetzen` überschrieben.

## Grenzen

| | |
|---|---|
| ganze Seite | höchstens **1 GB** (GitHub Pages). Das Werkzeug warnt ab 900 MB und bricht über 1 GB ab |
| eine Datei | unter **50 MB** |
| ein Video | höchstens **100 Teile** (1,4 GB) |
| Speicher im Browser | das Video liegt beim Zusammensetzen ganz im Arbeitsspeicher; es wird immer nur **eines** gehalten |

⚠ **Entfernen macht das Depot nicht kleiner.** Ein gelöschtes Video verschwindet von
der Seite, bleibt aber in der Git-Historie. Jedes ersetzte Video wächst das Depot
um seine volle Größe.

⚠ **Das Depot ist öffentlich.** Alles, was hier liegt, kann jeder herunterladen.

## Prüfen

```bash
node tests/smoke.mjs        # ohne Browser: Liste, Vorrat, Manifest, Werkzeug
node tests/browser.mjs      # echter Browser: Laden, Fehler, Weiter laden, offline, Installieren, Neigung
node tests/gegenprobe.mjs   # baut Fehler ein — jeder muss in seiner Prüfzeile rot werden
```

Die Browser-Probe braucht `playwright-core` und Chromium. Fehlt eines, meldet sie
„nicht lauffähig“ (Rückgabe 2), nicht grün.

## Rechtliches

Impressum und Datenschutz: https://family-projekt.de/impressum.html
