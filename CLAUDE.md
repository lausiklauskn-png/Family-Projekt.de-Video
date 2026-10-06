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

## ⬇ Drei Lade-Wege, derselbe Inhalt (Klaus 2026-10-02) — seit dem Abend vier, siehe unten

Klaus: *„verschiedene Möglichkeiten des Herunterladens … mit verschiedenen
Hintergründen … aber jeweils immer die gleichen Videos“*. Jede Karte trägt:

| Knopf | was während des Ladens zu sehen ist |
|---|---|
| **Schlicht laden** (`laden`) | nur der Fortschritt — wie bisher |
| **Laden mit Hintergrundbildern** (`laden-bilder`) | Hintergrundbilder und Mycel, keine App-Szenen, **keine Musik**; das Vorschaubild bleibt sichtbar |
| **Laden mit Werbeschau** (`laden-schau`) | die Werbeschau mit App-Szenen und Musik (Knopf „Musik aus“) |

- **Geladen und geprüft wird in allen drei Wegen genau dasselbe** — die Teile,
  ihre SHA-256, die ganze Datei. Die Schau ist nur Begleitung (`k.schau`), sie
  pausiert bei einem Fehler, läuft bei „Weiter laden“ weiter und endet bei „fertig“.
  Die Browser-Probe lädt in beiden Schau-Wegen und vergleicht den Download Byte für Byte.
- `assets/ladeschau.js` + `assets/ls/` (Bilder, Clips, `musik.mp3` = die Spur des
  Werbevideos) stammen aus der Ladeschau-Vorschau vom selben Tag, **Fassung 3**
  (die Fassung 2 schnitt Texte am Fensterrand ab und ist nicht übernommen).
  Der Ordner kommt aus `window.LADESCHAU_BASIS` (laden.js setzt `assets/ls/`).
- **Erst auf Tipp geladen**, nicht im Installations-Vorrat. **three.js r128 kommt
  von cdnjs** — erst nach dem Tipp auf einen Schau-Knopf; offline oder gesperrt
  fällt das Mycel weg, geladen wird trotzdem (eine Warnung sagt es).
- ⚠ **Nicht gemessen:** die Schau am Tablet (Ruckeln, Akku), und ob drei Knöpfe
  neben „Speichern“ am Handy gut zu treffen sind. Klaus entscheidet nach dem
  Sichttest, welche Wege bleiben.
- Proben: `smoke` § D2 · `browser` § 2e2 · Gegenprobe `BILDER:`, `SCHAUENDE:`, `BASIS:`.

### Klaus' Sichttest am Tablet (2026-10-02)

*„es ruckelt an den Rändern rechts, links, oben"* (etwa ab Teil 7) · *„die
Hintergrundbilder … sehr milchig"* · *„ich habe sogar eins, zwei, dreimal gespeichert,
weil es nicht angezeigt wurde"*. Geändert:

| | vorher | jetzt |
|---|---|---|
| Fenster über der Schau | im hellen Gerätethema **galten die dunklen Schau-Farben gar nicht** (`stil.css` `:root:not([data-theme=dark])` schlug `html.ls-an`), dazu falsche Token-Namen und zwei tote Selektoren (`.fassung`, `.blatt>header` gibt es nicht) — helle Karten, blasse Schrift über den Bildern | `html.ls-an:root` mit den Tokens aus `stil.css`: Karten 90 % dunkel in **beiden** Themen, Überschrift mit Schatten, **kein** Weichzeichner (nur der kleine Musik-Knopf trägt einen) |
| Hintergrund | `inset:-6%`, Zoom 1,04→1,16 **mit** Seitwärtsschub, alle 8 Bilder mit `will-change` | `inset:0`, Zoom 1,02→1,08 ohne Schub, 24 s; Ebene nur für das sichtbare und das ausblendende Bild; Bilder vorab entschlüsselt |
| Bilder | 1280×720, Deckkraft 0,55, Sättigungsfilter | **1920×1080** aus `family-project/werbevideo/assets/bg/`, Deckkraft 0,82, Vignette schwächer |
| Korn | lief (0,6 s Schritte) | steht still, halb so stark |
| Mycel | Pixeldichte bis 1,5 | bis 1,25 |
| Speichern | jeder Tipp ein neuer Download | ein zweiter Tipp binnen 15 s lädt nicht noch einmal und sagt, dass die Datei ein paar Sekunden braucht |

⚠ **Die Ursache des Ruckelns ist nicht gemessen** — headless gibt es kein Tablet.
Weggenommen ist, was am meisten kostet (Weichzeichner über bewegtem Grund, acht
übergroße Ebenen, laufendes Korn). Ob es reicht, sagt erst Klaus' nächster Sichttest.
`ls/` wiegt jetzt 4,7 MB statt 2,7 MB (wird erst auf Tipp geladen).
„Googlen" ist nicht untersucht: die Seite lädt nichts von Google (nur three.js von cdnjs).
⚠ **Das „Milchige" war vor allem ein Farbfehler, kein Bildfehler** — gefunden an einem
Bildschirmfoto im hellen Thema, nicht durch Nachdenken. Die Browser-Probe läuft mit
hellem Gerätethema (Playwrights Vorgabe) und misst jetzt Überschrift (hell) und Karte
(dunkel). Der Weichzeichner-Wächter suchte nur an `.fassung` und war blind (Gegenprobe);
er prüft jetzt jede Regel der Ladeschau.
Proben: `smoke` (Ladeschau-Zeilen) · `browser` (zweiter Tipp, Farben im hellen Thema) · Gegenprobe `RUCKELN:` (4), `FARBEN:` (1), `SPEICHERN:` (1).

## 🎬 Der vierte Weg: Laden mit Vorschaufilm (Klaus 2026-10-02)

Knopf **„Laden mit Vorschaufilm"** (`laden-film`, Art `film`). Hintergrundbilder und
Werbeschau bleiben unverändert. Geladen und geprüft wird wie in den anderen drei Wegen.

| | |
|---|---|
| Ablauf | erst der Vorschaufilm (stumm), dann die App-Szenen in Schleife, bis alle Teile geprüft sind; **erst dann** das Finale |
| vorab | alle Symbole und Clips werden beim Start geladen und entschlüsselt (`_zustand().vorab`) — kein schwarzer Handyrahmen, kein spätes Icon; eine Szene, deren Bild nicht bereit ist, wird übersprungen und gezählt |
| Abwechslung | Scanner (Klaus 2026-10-02: „nicht pro Bild zwei, dreimal“): **höchstens einer je Hintergrundbild**, abwechselnd von oben nach unten und von rechts nach links (`SCAN_ARTEN`); jede weitere Szene auf demselben Bild wird nur überblendet. Hintergründe reihum, je mit wechselnder Bewegung und Überblendung (blende · wisch · kreis) |
| Finale | `ende()` wartet im Film-Modus 2,8 s (bei „weniger Bewegung" 1,2 s), damit das Finale sichtbar bleibt |
| Film fehlt / lädt nicht | nach 12 s „laedt" gilt er als `fehler`, es geht mit den App-Szenen weiter — geladen wird trotzdem |

- **Das Werkzeug legt `videos/<kennung>/vorschau.mp4` an** (960×540, H.264, ohne Ton,
  ≤ 14 MB, Bitrate aus der Länge) und trägt `vorschauFilm {pfad, groesse, sha256}` in
  `videos.json` ein. Für ein vorhandenes Video: `node tools/video-aufnehmen.mjs --film-nachtragen <kennung>`.
- **Der Knopf steht nur da, wenn die Liste einen gültigen Film nennt** (`filmGueltig` in
  `laden.js`: Pfad genau `videos/<id>/vorschau.mp4`, Größe 1…14 000 000, SHA-256 aus 64 Hex).
  `ladeschau.js` prüft den Pfad beim Start noch einmal. Der Film steht **nicht** im Vorrat.
- Cache: `fp-videos-v7`, `laden.js?v=7`, `ladeschau.js?v=4`. Proben zum Scanner: `smoke` (zwei Richtungen) · `browser` (je Bild höchstens einer, Richtung wechselt) · Gegenprobe `SCANNER:` (3 Fälle).

⚠ **DER TEST-BROWSER SPIELT KEIN H.264 — gemessen: `canPlayType("avc1")` ist leer.** In der
ersten Fassung der Probe landete der echte Film deshalb immer in `fehler`, und der Film-Weg war
**ungemessen**, obwohl alles grün war (die Probe ließ „laedt" als ersten Zustand gelten). Seitdem
liegt für probe-a ein **VP9-Stellvertreter** an derselben Adresse; gemessen werden `laeuft`,
`fertig` und die App-Szenen danach. Aus demselben Grund laufen die zwei Clips der App-Szenen
(H.264) in der Probe nie (`clipsBereit: 0`) — die Szenen fallen dort auf die Symbole zurück.

⚠ **Nicht gemessen:** Film und Clips am Tablet (Chrome auf Android spielt H.264), Ruckeln,
Akku; echte github.io-Auslieferung.

Proben: `smoke` (`filmGueltig` an gestellten Einträgen, beide Richtungen) · `browser` § 2e2
(vier Knöpfe, Film läuft und endet, Finale nie vor dem letzten Teil, Download Byte für Byte) ·
Gegenprobe `FILM:` (6 Fälle). Gemessen 2026-10-02: `browser` 117 grün · 0 ROT, `smoke` grün, Gegenprobe in einer Wegwerf-Kopie **6 gefangen · 0 blind · 0 aus falschem Grund · 0 tote Anker**.

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

## ▶ Abspielen, während es lädt (Klaus 2026-10-05)

Klaus: *„Das Werbevideo soll wie ein normales Video laufen … Stopp und Zurück
sollen jedes Laden unterbrechen, was geladen ist, bleibt."*

- `abspielen.html` + `assets/abspielen.js`: Zeit, ▶/⏸, ±10 s, Stopp, Ton, Vollbild,
  Vorratsanzeige. Marken `data-video-quelle`, `data-video-weg`, `data-video-sw`, `data-video-laden`.
- `assets/abspielen-kern.js` (`self.FPAbspielKern.antwort(req, id, basis)`) läuft im
  Service-Worker (`importScripts`, Route `videos/<id>/abspielen.mp4`): Range → 206 bis zum
  Ende des Teils, nächster Teil vorgeholt; ohne Range 200 als Strom; 416/404/503/502.
  Jeder Teil 3 Versuche, Größe und SHA-256 geprüft, höchstens 3 Teile im Speicher, nie im Cache.
- Stopp und Zurück unterbrechen jedes Laden (auch `?laden=`); geprüfte Teile bleiben.
- Dieselben zwei Dateien sollen **byte-1:1** nach family-project (Plan:
  `Kimhub/docs/sessions/BRIEF_werbevideo-family-project.md`) — hier pflegen, dort kopieren.
- Gegenproben `ABSPIEL:` 8 gefangen · `STOPP:` 5 gefangen, 0 blind. Der Testbrowser hat
  kein H.264, die Probe nimmt einen VP9-Stellvertreter. ⚠ Am Tablet und mit dem echten
  MP4 nicht gemessen.

## 🖼 Der Rahmen-Spieler für family-projekt.de (Klaus 2026-10-06)

Klaus: *„Das Video soll auf family-projekt.de laufen, im Vorschaufenster der
Startseite … nicht automatisch starten, sondern erst auf Klick … gestreamt …
Herunterladen … verschiedene Qualitäten … wieder gestoppt … Vollbildmodus."*

`assets/abspielen-rahmen.js` baut sich **in einen fremden Behälter**
(`[data-video-rahmen]`), statt feste IDs zu suchen wie `abspielen.js`. Er wird
**byte-1:1** nach `family-project/assets/` kopiert und dort per SHA-256 gepinnt
(`tests/smoke_werbevideo.mjs`) — **hier ändern, dort neu kopieren, Pin nachziehen.**

| | |
|---|---|
| vor dem Tipp | **lädt nichts**: `preload="none"`, keine Quelle, das Bild des Behälters bleibt Vorschaubild; die Leiste liegt `position:absolute` darüber |
| Leiste | ▶/⏸ · ⏹ · −10 · Ladebalken (gespielt / geladen) · Zeit · +10 · 🔊 · Qualität ⬇ · Vollbild; Symbole als SVG, nicht als Schriftzeichen |
| ⏹ Stopp | nimmt die Quelle weg (`removeAttribute("src")` + `load()`): jedes Laden hört auf, das Bild steht wieder da, die gemerkte Stelle ist vergessen |
| Menü | füllt den Behälter (am Handy ~110 px hoch): Qualität · ±10 s und Ton · ⬇ je Qualität mit Größe aus `videos.json` (erst beim Öffnen gefragt) |
| Merken | die Stelle in `localStorage` (Marke `data-video-merken`); nach dem Neuladen „weiter bei …", **kein** Selbststart |
| schmal | unter 460 px wandern ±10 s und Ton ins Menü, unter 330 px die Größen in den `title` |

Marken am Behälter: `data-video-id` (Pflicht) · `-fassungen` (`kennung:Name …`) ·
`-titel` · `-weg` · `-sw` · `-quelle` · `-laden` · `-merken` · `-ausweich`.

**Die Qualitäten sind eigene Einträge:** `werbevideo-67s-720p` (27,3 MB) und
`werbevideo-67s-480p` (9,9 MB), mit ffmpeg aus den geprüften Teilen von
`werbevideo-67s` gerechnet (H.264, `+faststart`), aufgenommen mit dem neuen
Schalter **`--ohne-film`** (eine kleinere Fassung braucht keinen eigenen
11-MB-Vorschaufilm). Gestreamt wird zuerst 720p — das Original hat 23 Mbit/s.

⚠ **Das Werkzeug stellt das zuletzt aufgenommene nach oben.** Auf der Liste stehen
jetzt 480p und 720p **vor** dem Original, und `abspielen.html` ohne `?id=` zeigt
das erste — also 480p. Benannt, nicht geändert: `videos.json` schreibt das Werkzeug,
nie die Hand.

Proben: `smoke` (Rahmen-Spieler ohne Browser, `--ohne-film`). Die Wirkung misst
`family-project/tests/smoke_werbevideo.mjs` im echten Browser mit VP9-Stellvertreter.

## Netzweit

Freibrief · frisch von `origin/main` · Ton · kein PII · Ehrlichkeit:
[Sage-Protokol/docs/NETZWEIT.md](https://github.com/lausiklauskn-png/Sage-Protokol/blob/main/docs/NETZWEIT.md)
