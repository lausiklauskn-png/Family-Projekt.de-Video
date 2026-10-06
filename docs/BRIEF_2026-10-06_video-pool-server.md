# Brief · Video-Pool auf den Hetzner-Server (Nachfolgesitzung)

Stand: 2026-10-06, abends. Klaus: *„Ja, ich will den Umzug schon vorsorglich, weil ich
weiß, dass noch mehr Videos dazu kommen."* · *„Ich habe nicht vor, vollkommen auf den
Server umzuziehen, sondern nur die Videos … in den eigenen Ordnern."*

> ⚠ **NUR DIE VIDEOS ZIEHEN UM.** Auf den Server kommen `videos.json` und
> `videos/<id>/teil-NN.bin`, ein Ordner je App. **Die Apps selbst bleiben, wo sie
> sind**: diese Seite, family-projekt.de, die WorkFlohs, Workflow PDF — Schale,
> Service-Worker, Manifest, Skripte. Umgestellt wird in den Apps nur die
> **Adresse, von der sie die Videos holen**, mit github.io als Rückfall.
> Wer mehr auf den Server legt, hat den Auftrag falsch gelesen.

## Pflichtlektüre (in dieser Reihenfolge)

1. `Sage-Protokol/CLAUDE.md` und `docs/NETZWEIT.md`
2. `family-projekt.de-video/CLAUDE.md` (Pool-Format, Rahmen-Spieler, Grenzen von Pages)
3. dieser Brief
4. `deploy/` (alle vier Dateien) — **vorbereitet, ungeprüft**
5. `family-project/CLAUDE.md` § „Das Werbevideo läuft im Rahmen der Startseite"
   (Pins auf `abspielen-kern.js` und `abspielen-rahmen.js`)

Vor jeder Arbeit: `git fetch origin --quiet && git checkout -B <zweig> origin/main`.

## Stand

| | |
|---|---|
| Pool heute | GitHub Pages, `videos.json` + `videos/<id>/teil-NN.bin` (14 000 000 B je Teil), 4 Videos, 437 MB |
| Ziel | `https://videos.family-projekt.de/<app>/`, ein Ordner je App, erster Ordner `family-projekt` |
| Server | Hetzner-Cloud 167.233.204.72, Caddy im Docker unter `/opt/relay` |
| gebaut | `deploy/einrichten.sh` (bash -n grün), `deploy/caddy/Caddyfile`, `deploy/compose-dienst.yml`, `deploy/Caddyfile.block` |
| **nicht** gemessen | Caddyfile nicht validiert (kein Docker im Behälter) · Skript nie gelaufen · freier Platz auf dem Server unbekannt · DNS-Eintrag fehlt |

### Was `deploy/` tut (Entscheidungen, nicht neu verhandeln)

- Eigener Container `video-pool` (caddy:2-alpine) hinter dem Haupt-Caddy, Port 8080 nur intern.
- Klon unter `/srv/fp-videos`, Pool unter `/srv/videos/<app>/` — **kopiert**, keine harten Verweise
  (ein `git reset` im Klon soll den Pool nicht anfassen). Ein befüllter App-Ordner wird **nie** überschrieben.
- Der **Ordner** `/srv/fp-videos/deploy/caddy` wird eingehängt, nicht die Datei (Inode-Falle).
- CORS `*` nur GET/HEAD/OPTIONS, Range erlaubt, Content-Range/Length/Accept-Ranges sichtbar,
  **keine** Credentials · kein Verzeichnis-Listing · versteckte Dateien und `*.bak*` → 404 ·
  `videos.json` no-cache, Teile max-age=300.
- Haupt-Caddyfile: Sicherung → Block anhängen → **validieren** → erst dann neu laden; bei Fehler zurücklegen.
- Cron alle 5 min (`# video-pool auto-deploy`) holt den Klon nach — fasst den befüllten Pool nicht an.
- Schluss: `curl` auf einen Teil mit Range muss **206** und `Access-Control-Allow-Origin` liefern.

## Was geplant ist — Reihenfolge

1. **Proben, bevor irgendetwas auf den Server geht**
   - `tests/smoke.mjs` § G: liest `deploy/` als Text — Ordner statt Datei eingehängt · keine
     `Allow-Credentials` · kein `browse` · `validate` steht **vor** `reload` · Sicherung vor dem
     Anhängen · kein Überschreiben eines befüllten App-Ordners · `bash -n` grün.
   - Gegenprobe `DEPLOY:` (mindestens 4 Fälle: Datei statt Ordner, Credentials an, browse an,
     reload vor validate). Jede rote Zeile muss den Namen ihrer Zusicherung tragen.
   - `deploy/EINRICHTEN.md`: die Schritte für Klaus, **Einzelschritte**, jeweils mit „wo"
     (INWX · Termux · Server).
2. **DNS** (Klaus, bei INWX): A-Eintrag `videos` → `167.233.204.72`. Prüfen mit
   `getent hosts videos.family-projekt.de` (aus dem Behälter evtl. gesperrt — dann Klaus fragen).
3. **Einrichten** (Klaus, in Termux):
   ```bash
   ssh root@167.233.204.72 'git clone --depth 1 https://github.com/lausiklauskn-png/Family-Projekt.de-Video.git /srv/fp-videos && bash /srv/fp-videos/deploy/einrichten.sh'
   ```
   Die Ausgabe vollständig zurück in den Chat. Bricht es am Platz ab: nichts geändert, Zahl nennen.
4. **Umstellen der Apps — erst wenn 3. die 206 gemeldet hat**, mit github.io als Rückfall:
   - `assets/abspielen-kern.js` (Zeile ~40), `assets/abspielen-rahmen.js` (`M.quelle + "videos.json"`),
     `assets/laden.js` (`teilAdresse`, fetch), `family-project/sw.js` (`VIDEO_BASIS`).
   - Kern und Rahmen sind in family-project **byte-1:1 gepinnt**: hier ändern, dort kopieren,
     SHA-Pins in `family-project/tests/smoke_werbevideo.mjs` nachziehen, `CACHE_VERSION` und
     alle `?v=` erhöhen — in **beiden** Depots.
   - Rückfall messen: Server antwortet nicht → github.io lädt, und die Seite sagt das.
5. **Hochladen je App-Ordner** (offen, nicht entworfen): wie kommt ein neues Video von Klaus'
   Tablet in `/srv/videos/<app>/`? Vorschlag erst vorlegen, nicht bauen.

## Datenverträge (nicht brechen)

- `videos.json` = `{fassung:1, videos:[{id,titel,dateiname,groesse,sha256,vorschau,vorschauFilm,teile:[{groesse,sha256}]}]}`,
  geschrieben nur von `tools/video-aufnehmen.mjs`.
- Speicher- und Vorrat-Namen `fp-videos-*` unverändert.

## Akzeptanzkriterien

- `node tests/smoke.mjs` und `node tests/browser.mjs` grün, Gegenprobe `DEPLOY:` alle gefangen, 0 blind.
- Auf dem Server: Teil mit Range → 206 + ACAO; `videos.json` → 200; `/family-projekt/` ohne Datei → kein Listing.
- Nach der Umstellung: Rahmen-Spieler in family-projekt.de spielt vom Server; Rückfall gemessen.
- Klaus' Sichttest am Tablet (nicht ersetzbar).

## Offene Fragen an Klaus

- Soll der Pool auf GitHub Pages nach dem Umzug bleiben (Rückfall) oder später geleert werden?
- Wer lädt neue Videos hoch — nur Klaus, oder auch eine App selbst?
- Noch offen aus `Workflow-PDF` #101 (Erklärvideo): die 6 Fragen dort.

## Abschluss-Befehl (Pflicht am Ende der Folgesitzung)

1. `CLAUDE.md` hier fortschreiben; Forschungseintrag in `Kimhub/forschung/sitzungen.json`
   (`node tools/sitzung-eintragen.mjs`, Klone vertiefen, `node tools/forschung-bauen.mjs`,
   `node tests/alle.mjs forschung`) — Spanne **gemessen**, `ende` vor dem Commit.
2. Commit, Push mit Refspec, `git diff --stat origin/main origin/<zweig>`, Draft-PR, mergen, auf `main` nachsehen.
3. Abschlussbrief mit Stundennachweis im Chat; neuen Brief als Codeblock im Chat.
