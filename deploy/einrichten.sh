#!/usr/bin/env bash
# Video-Pool auf dem Hetzner-Cloud-Server einrichten (NICHT Termux, NICHT Webhosting).
# Liefert /srv/videos/<app>/ unter https://videos.family-projekt.de/<app>/ aus.
# Wiederholbar: was schon da ist, wird nicht noch einmal angelegt, und ein schon
# befüllter App-Ordner wird nie überschrieben.
# Vor jeder Änderung eine Sicherung; lehnt Caddy den Block ab, wird zurückgelegt,
# BEVOR neu geladen wird — die bestehenden Seiten bleiben also unberührt.
set -euo pipefail

KLON=/srv/fp-videos
POOL=/srv/videos
APP=family-projekt
MINDEST_FREI_KB=$((2 * 1024 * 1024))   # 2 GB, gewählt: Kopie des Pools + Luft für neue Videos

echo "== Platz auf /srv"
FREI_KB=$(df -Pk /srv | awk 'NR==2 {print $4}')
df -h /srv
if [ "$FREI_KB" -lt "$MINDEST_FREI_KB" ]; then
  echo "!! Nur $((FREI_KB / 1024)) MB frei, gebraucht werden mindestens $((MINDEST_FREI_KB / 1024)) MB. Nichts geändert."
  exit 1
fi

if [ ! -d "$KLON/.git" ]; then
  echo "!! $KLON ist kein Klon. Erst: git clone --depth 1 https://github.com/lausiklauskn-png/Family-Projekt.de-Video.git $KLON"
  exit 1
fi

# --- 1 · die Videos in den App-Ordner (nur wenn er noch leer ist) -------------
mkdir -p "$POOL/$APP"
if [ -f "$POOL/$APP/videos.json" ]; then
  echo "== $POOL/$APP/videos.json gibt es schon — nichts kopiert, nichts überschrieben"
else
  # cp, keine harten Verweise: git reset im Klon schreibt neue Dateien, der Pool soll davon unberührt bleiben
  cp -a "$KLON/videos" "$POOL/$APP/"
  cp -a "$KLON/videos.json" "$POOL/$APP/videos.json"
  echo "== Videos nach $POOL/$APP kopiert"
fi

echo "== Jeden Teil gegen videos.json prüfen (Größe und SHA-256)"
python3 - "$POOL/$APP" <<'PY'
import hashlib, json, os, sys
basis = sys.argv[1]
liste = json.load(open(os.path.join(basis, "videos.json"), encoding="utf-8"))
fehler = 0; teile = 0
for v in liste.get("videos", []):
    for i, t in enumerate(v.get("teile", [])):
        teile += 1
        p = os.path.join(basis, "videos", v["id"], "teil-%02d.bin" % i)
        if not os.path.isfile(p):
            print("!! fehlt:", p); fehler += 1; continue
        if os.path.getsize(p) != t["groesse"]:
            print("!! falsche Größe:", p); fehler += 1; continue
        h = hashlib.sha256()
        with open(p, "rb") as f:
            for b in iter(lambda: f.read(1 << 20), b""):
                h.update(b)
        if h.hexdigest() != t["sha256"]:
            print("!! falsche Prüfsumme:", p); fehler += 1
print("== %d Teile in %d Videos geprüft, %d Fehler" % (teile, len(liste.get("videos", [])), fehler))
sys.exit(1 if fehler or not teile else 0)
PY
chmod -R a+rX "$POOL"

# --- 2 · der Dienst und der Caddy-Block ---------------------------------------
cd /opt/relay
STEMPEL=$(date +%Y%m%d-%H%M%S)
cp docker-compose.yml "docker-compose.yml.bak-videopool-$STEMPEL"
cp Caddyfile "Caddyfile.bak-videopool-$STEMPEL"
echo "== Sicherungen: docker-compose.yml.bak-videopool-$STEMPEL, Caddyfile.bak-videopool-$STEMPEL"

if ! grep -q '^  video-pool:' docker-compose.yml; then
  # insert the service right before the top-level "volumes:" line
  awk -v blk="$KLON/deploy/compose-dienst.yml" '
    /^volumes:/ && !x { while ((getline l < blk) > 0) print l; x=1 } { print }' docker-compose.yml > docker-compose.yml.neu
  mv docker-compose.yml.neu docker-compose.yml
  echo "== Dienst video-pool in docker-compose.yml eingetragen"
else
  echo "== Dienst video-pool steht schon in docker-compose.yml"
fi
docker compose config -q || { cp "docker-compose.yml.bak-videopool-$STEMPEL" docker-compose.yml; echo "!! compose-Datei ungültig, zurückgelegt"; exit 1; }
# the awk insert silently does nothing if there is no top-level "volumes:" line — check the result, not the intent
if ! docker compose config --services | grep -qx video-pool; then
  cp "docker-compose.yml.bak-videopool-$STEMPEL" docker-compose.yml
  echo "!! Dienst video-pool ist nach dem Eintragen NICHT in der compose-Datei — zurückgelegt. Bitte Ausgabe von: grep -n '^[a-z]' docker-compose.yml"
  exit 1
fi

docker compose up -d video-pool
echo "== Container video-pool läuft"

if ! grep -q 'videos.family-projekt.de' Caddyfile; then
  cat "$KLON/deploy/Caddyfile.block" >> Caddyfile   # >> keeps the inode the container sees
  echo "== Caddy-Block angehängt"
fi
if ! docker exec caddy caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null 2>&1; then
  cat "Caddyfile.bak-videopool-$STEMPEL" > Caddyfile
  echo "!! Caddy lehnt die neue Fassung ab — alte Fassung zurückgelegt, nichts neu geladen."
  docker exec caddy caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile || true
  exit 1
fi
docker exec caddy caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
echo "== Caddy neu geladen"

# pull main every 5 minutes; restart only if something changed (only the config — the videos in $POOL stay)
ZEILE='*/5 * * * * cd /srv/fp-videos && git fetch -q --depth 1 origin main && [ "$(git rev-parse HEAD)" != "$(git rev-parse origin/main)" ] && git reset -q --hard origin/main && docker restart video-pool >/dev/null # video-pool auto-deploy'
( crontab -l 2>/dev/null | grep -v 'video-pool auto-deploy'; echo "$ZEILE" ) | crontab -
echo "== Auto-Update der Einstellungen alle 5 Minuten eingerichtet"

# --- 3 · von außen nachsehen ----------------------------------------------------
ADR="https://videos.family-projekt.de/$APP"
sleep 3
echo "== Liste:"
curl -sS -o /dev/null -w "   HTTP %{http_code}\n" "$ADR/videos.json" || true
ERSTES=$(python3 -c "import json;print(json.load(open('$POOL/$APP/videos.json'))['videos'][0]['id'])")
echo "== Teil mit Range (erwartet 206 und Access-Control-Allow-Origin):"
curl -sS -D - -o /dev/null -r 0-99 "$ADR/videos/$ERSTES/teil-00.bin" | grep -iE '^(HTTP|content-range|access-control-allow-origin)' || true
echo "== fertig."
