/* Videos · family-projekt.de — der Spieler für einen fremden Bildrahmen.
 *
 * Klaus 2026-10-06: „Das Video soll auf family-projekt.de laufen, im
 * Vorschaufenster der Startseite. Ein kleines Feld zum Vergrößern schaltet auf
 * Vollbild, mit Ladebalken … Der Knopf zeigt ▶, solange es nicht läuft, und ⏸,
 * solange es läuft. Im Fenster starten ist gut, weil man dann weiter scrollen
 * kann. Kommt man zurück, läuft das Video dort weiter." Und dazu: „Das
 * Bedienfeld … sollte mit in dem Container sein" · „nicht automatisch starten,
 * sondern erst auf Klick. Und es soll gestreamt werden. Herunterladen soll man
 * auch angeboten bekommen. Verschiedene Qualitäten. Und es soll auch wieder
 * gestoppt werden können. Vollkommene Bedienung wie beim Videoplayer." ·
 * „Und Vollbildmodus soll auch möglich sein."
 *
 * abspielen.js sucht feste IDs und gehört zu einer eigenen Seite. Dieser Spieler
 * baut sich IN einen vorhandenen Behälter: jedes Element mit [data-video-rahmen].
 * Diese Datei wird nach family-project BYTE-1:1 kopiert (dort per SHA-256
 * gepinnt) — nur hier ändern, dann dort neu kopieren und den Pin nachziehen.
 *
 * Was je Seite anders ist, steht als Marke am Behälter, nie im Code:
 *   data-video-id         die Kennung, die zuerst gestreamt wird (Pflicht)
 *   data-video-fassungen  weitere Qualitäten: "kennung:Name kennung:Name" (Vorgabe: nur data-video-id)
 *   data-video-titel      Name des Videos für Vorlese-Programme (steht NICHT sichtbar in der Leiste)
 *   data-video-weg        die Abspiel-Adresse, {id} wird ersetzt (Vorgabe videos/{id}/abspielen.mp4)
 *   data-video-sw         der Worker, der sie bedient (Vorgabe sw.js)
 *   data-video-quelle     wo videos.json liegt — nur für die Größen im Menü, erst beim Öffnen gefragt
 *   data-video-laden      wohin „Herunterladen" führt, {id} wird ersetzt (ohne: kein Herunterladen)
 *   data-video-merken     der localStorage-Schlüssel für die Stelle (Vorgabe fp_video_stelle_<id>)
 *   data-video-ausweich   wohin es geht, wenn es hier nicht abspielt, {id} wird ersetzt
 *
 * Vor dem ersten Tipp lädt der Spieler NICHTS: kein <video> mit Quelle, kein
 * Abruf. Das Bild im Behälter bleibt das Vorschaubild, und die Leiste liegt
 * darüber (position:absolute) — sie schiebt nichts, der Platz steht vorher fest.
 * ⏹ Stopp nimmt dem Video die Quelle: jedes Laden hört auf, das Bild steht wieder da.
 *
 * Schlanke Leiste (Klaus 2026-10-06): in Ruhe nur ▶ und ⛶, Qualität und
 * Herunterladen hinter ⋯. Während es läuft, tritt die Leiste nach 2,5 s zurück;
 * ein Tipp holt sie wieder und zählt dabei NICHT als Tipp auf den Rahmen. Sie
 * bleibt stehen, solange es angehalten ist, lädt oder das Menü offen ist. Die
 * Qualität („720p") steht 2 s nach Start oder Wechsel oben links, dann nicht mehr.
 * Texte nur über textContent. */
(function () {
  "use strict";
  var KENNUNG = /^[a-z0-9][a-z0-9-]{1,59}$/;
  var TEXT = {
    de: {
      gruppe: "Video", spielen: "Abspielen", weiter: "Weiter abspielen", pause: "Anhalten", stopp: "Stoppen",
      zurueck: "10 Sekunden zurück", vor: "10 Sekunden vor", tonAn: "Ton ausschalten", tonAus: "Ton einschalten",
      voll: "Vollbild", vollAus: "Vollbild verlassen", stelle: "Stelle im Video", weiterBei: "weiter bei ",
      warte: "lädt kurz vor …", vorbereiten: "Das Video wird vorbereitet …",
      keinSw: "Dieser Browser kann das Video hier nicht abspielen.",
      swNicht: "Der Hintergrund-Helfer der Seite ist noch nicht bereit. Einmal neu laden, dann geht es.",
      fehler: "Das Video lässt sich hier nicht abspielen.", ausweich: "Auf der Video-Seite ansehen",
      geladen: "geladen bis ", mehr: "Qualität, Ton und Herunterladen", zeigen: "Bedienung zeigen", schliessen: "Schließen",
      qualitaet: "Qualität", springen: "Springen", ton: "Ton", herunterladen: "Herunterladen", tonAnWort: "an", tonAusWort: "aus",
      ladenHinweis: "öffnet die Video-Seite; dort wird jeder Teil geprüft und als eine Datei gespeichert"
    },
    en: {
      gruppe: "Video", spielen: "Play", weiter: "Resume", pause: "Pause", stopp: "Stop",
      zurueck: "Back 10 seconds", vor: "Forward 10 seconds", tonAn: "Mute", tonAus: "Unmute",
      voll: "Full screen", vollAus: "Exit full screen", stelle: "Position in the video", weiterBei: "resume at ",
      warte: "loading ahead …", vorbereiten: "Preparing the video …",
      keinSw: "This browser cannot play the video here.",
      swNicht: "The page's background helper is not ready yet. Reload once, then it works.",
      fehler: "The video cannot be played here.", ausweich: "Watch on the video page",
      geladen: "loaded to ", mehr: "Quality, sound and download", zeigen: "Show controls", schliessen: "Close",
      qualitaet: "Quality", springen: "Skip", ton: "Sound", herunterladen: "Download", tonAnWort: "on", tonAusWort: "off",
      ladenHinweis: "opens the video page; every part is checked there and saved as one file"
    }
  };
  function t() { return TEXT[/^en/i.test(document.documentElement.lang || "") ? "en" : "de"]; }
  function mmss(s) {
    if (!isFinite(s) || s < 0) s = 0;
    var m = Math.floor(s / 60), r = Math.floor(s % 60);
    return m + ":" + (r < 10 ? "0" : "") + r;
  }
  function mb(n) {
    if (!(n > 0)) return "";
    var z = String(n >= 1e8 ? Math.round(n / 1e6) : Math.round(n / 1e5) / 10);
    return (/^en/i.test(document.documentElement.lang || "") ? z : z.replace(".", ",")) + " MB";
  }
  function mit(vorlage, id) { return vorlage.split("{id}").join(encodeURIComponent(id)); }
  function el(tag, klasse, eltern) {
    var e = document.createElement(tag);
    if (klasse) e.className = klasse;
    if (eltern) eltern.appendChild(e);
    return e;
  }
  function knopf(klasse, eltern) { var b = el("button", klasse, eltern); b.type = "button"; return b; }
  /* Die Symbole sind gezeichnet, nicht Schriftzeichen: ⏸ und ⛶ fehlen manchen
     Schriften (im Testbrowser ein leerer Knopf), und als Emoji sähe ⏸ dem
     orangen Knopf oben in der Kopfleiste zum Verwechseln ähnlich — der hält den
     Hintergrund an, nicht das Video. */
  var SYMBOL = {
    spielen: ["f", "M8 5v14l11-7z"],
    pause: ["f", "M6 5h4v14H6zM14 5h4v14h-4z"],
    stopp: ["f", "M6 6h12v12H6z"],
    voll: ["s", "M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"],
    vollAus: ["s", "M9 4v5H4M20 9h-5V4M15 20v-5h5M4 15h5v5"]
  };
  function symbol(b, name) {
    if (b.getAttribute("data-symbol") === name) return;
    var NS = "http://www.w3.org/2000/svg", d = SYMBOL[name];
    while (b.firstChild) b.removeChild(b.firstChild);
    var svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", "0 0 24 24"); svg.setAttribute("width", "18"); svg.setAttribute("height", "18");
    svg.setAttribute("aria-hidden", "true"); svg.setAttribute("focusable", "false");
    var pfad = document.createElementNS(NS, "path");
    pfad.setAttribute("d", d[1]);
    if (d[0] === "f") pfad.setAttribute("fill", "currentColor");
    else { pfad.setAttribute("fill", "none"); pfad.setAttribute("stroke", "currentColor"); pfad.setAttribute("stroke-width", "2.2"); pfad.setAttribute("stroke-linecap", "round"); pfad.setAttribute("stroke-linejoin", "round"); }
    svg.appendChild(pfad); b.appendChild(svg);
    b.setAttribute("data-symbol", name);
  }

  var STIL =
    ".vr-rahmen{position:relative}" +
    ".vr-schicht{position:absolute;inset:0;z-index:5;background:#000}" +
    ".vr-schicht[hidden],.vr-menue[hidden],.vr-meldung[hidden],.vr-warte[hidden]{display:none}" +
    ".vr-video{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;background:#000;display:block}" +
    ".vr-warte{position:absolute;left:50%;top:40%;transform:translate(-50%,-50%);margin:0;padding:4px 10px;border-radius:999px;" +
      "background:rgba(0,0,0,.6);color:#fff;font:600 12px/1.3 system-ui,sans-serif;pointer-events:none}" +
    ".vr-leiste{position:absolute;left:6px;right:6px;bottom:6px;z-index:6;display:flex;align-items:center;gap:3px;" +
      "padding:2px;border-radius:999px;background:transparent;box-shadow:none;color:#fff;font:600 12px/1 system-ui,sans-serif;transition:opacity .25s}" +
    ".vr-rahmen[data-vr-leise] .vr-leiste{opacity:0;pointer-events:none}" +
    ".vr-rahmen button{flex:0 0 auto;min-width:30px;height:30px;padding:0 7px;border:0;border-radius:999px;cursor:pointer;" +
      "background:rgba(255,255,255,.12);color:#fff;font:600 12px/30px system-ui,sans-serif;white-space:nowrap}" +
    ".vr-rahmen .vr-mehr{font-size:16px;letter-spacing:.5px}" +
    ".vr-qual{position:absolute;left:8px;top:8px;z-index:6;margin:0;padding:3px 8px;border-radius:999px;background:rgba(6,10,16,.7);" +
      "color:#fff;font:600 11px/1.2 system-ui,sans-serif;pointer-events:none;transition:opacity .25s}" +
    ".vr-qual[hidden]{display:none}" +
    ".vr-rahmen button:hover{background:rgba(255,255,255,.22)}" +
    ".vr-rahmen button svg{display:block;margin:auto}" +
    ".vr-rahmen button:focus-visible,.vr-zeit:focus-visible,.vr-menue a:focus-visible{outline:2px solid var(--vr-akzent,#5eead4);outline-offset:1px}" +
    ".vr-rahmen .vr-spielen,.vr-rahmen .vr-spielen:hover{background:var(--vr-akzent,#5eead4);color:#04121a}" +
    ".vr-rahmen .vr-spielen:hover{filter:brightness(1.12)}" +
    ".vr-titel{flex:1 1 auto;min-width:0;padding:0 4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}" +
    ".vr-zeit{flex:1 1 auto;min-width:36px;height:4px;margin:0 4px;-webkit-appearance:none;appearance:none;border-radius:2px;cursor:pointer;" +
      "background:rgba(255,255,255,.18)}" +
    ".vr-zeit::-webkit-slider-thumb{-webkit-appearance:none;width:12px;height:12px;border-radius:50%;background:#fff;border:0}" +
    ".vr-zeit::-moz-range-thumb{width:12px;height:12px;border-radius:50%;background:#fff;border:0}" +
    ".vr-uhr{flex:0 0 auto;padding:0 3px;text-shadow:0 0 3px #000,0 1px 2px #000;font-variant-numeric:tabular-nums;white-space:nowrap}" +
    ".vr-rahmen[data-vr-zustand=ruhe] .vr-zeit,.vr-rahmen[data-vr-zustand=ruhe] .vr-uhr," +
    ".vr-rahmen[data-vr-zustand=ruhe] .vr-zurueck,.vr-rahmen[data-vr-zustand=ruhe] .vr-vor," +
    ".vr-rahmen[data-vr-zustand=ruhe] .vr-stopp,.vr-rahmen[data-vr-zustand=ruhe] .vr-ton,.vr-rahmen[data-vr-zustand=ruhe] .vr-mehr{display:none}" +
    ".vr-rahmen:not([data-vr-zustand=ruhe]) .vr-titel{display:none}" +
    ".vr-rahmen[data-vr-schmal] .vr-zurueck,.vr-rahmen[data-vr-schmal] .vr-vor,.vr-rahmen[data-vr-schmal] .vr-ton{display:none}" +
    ".vr-menue{position:absolute;inset:0;z-index:8;overflow:auto;padding:4px 8px 4px 10px;background:rgba(6,10,16,.93);color:#fff;" +
      "font:500 12px/1.3 system-ui,sans-serif}" +
    ".vr-menue .vr-zu{position:absolute;top:6px;right:6px}" +
    ".vr-zeile{display:flex;flex-wrap:wrap;align-items:center;gap:3px 5px;margin:0 0 3px}" +
    ".vr-zeile b{min-width:5.2em}" +
    ".vr-menue button{height:30px;line-height:30px;font-size:12px;padding:0 7px}" +
    ".vr-menue .vr-zu{top:4px;right:4px;height:32px;line-height:32px}" +
    ".vr-menue .vr-zu+.vr-zeile{margin-right:40px}" +
    ".vr-rahmen[data-vr-schmal] .vr-zeile b{min-width:0}" +
    ".vr-rahmen[data-vr-eng] .vr-groesse,.vr-rahmen[data-vr-schmal] .vr-zeile .vr-wort,.vr-rahmen[data-vr-schmal] .vr-menue small{display:none}" +
    ".vr-menue button[aria-pressed=true]{background:var(--vr-akzent,#5eead4);color:#04121a}" +
    ".vr-menue a{display:inline-block;padding:0 7px;border-radius:999px;background:rgba(255,255,255,.12);color:#fff;text-decoration:none;" +
      "font:600 12px/30px system-ui,sans-serif;white-space:nowrap}" +
    ".vr-menue a:hover{background:rgba(255,255,255,.22)}" +
    ".vr-menue small{display:block;opacity:.75}" +
    ".vr-meldung{position:absolute;left:8px;right:8px;bottom:48px;z-index:7;margin:0;padding:6px 10px;border-radius:10px;" +
      "background:rgba(6,10,16,.9);color:#fff;font:500 12px/1.35 system-ui,sans-serif}" +
    ".vr-meldung a{color:var(--vr-akzent,#5eead4)}" +
    ".vr-rahmen:fullscreen{background:#000}" +
    ".vr-rahmen:fullscreen .vr-leiste{left:16px;right:16px;bottom:16px}" +
    /* Solange das Video steht oder läuft, nimmt der Rahmen SEINE Form an (Klaus
       2026-10-06: „rechts und links große breite Balken"). In Ruhe gilt wieder die
       Form des Bildes. Höchstens 85 % der Fensterhöhe, dann schmaler statt höher. */
    ".vr-rahmen:not([data-vr-zustand=ruhe]){aspect-ratio:var(--vr-format,1.7778)!important;" +
      "max-width:calc(85vh * var(--vr-format,1.7778));margin-left:auto;margin-right:auto}" +
    ".vr-rahmen:fullscreen:not([data-vr-zustand=ruhe]){aspect-ratio:auto!important;max-width:none}" +
    /* Punkte im Kreis: es lädt noch, die Leitung ist nicht weg. */
    ".vr-punkte{display:inline-block;position:relative;width:14px;height:14px;margin-right:7px;vertical-align:-3px;" +
      "animation:vr-kreis .9s steps(8) infinite}" +
    ".vr-punkte i{position:absolute;left:5.5px;top:0;width:3px;height:3px;border-radius:50%;background:currentColor;transform-origin:1.5px 7px}" +
    "@keyframes vr-kreis{to{transform:rotate(360deg)}}" +
    "@media (prefers-reduced-motion:reduce){.vr-punkte{animation:none}.vr-leiste,.vr-qual{transition:none}}";

  function punkte(eltern) {
    var p = el("span", "vr-punkte", eltern);
    p.setAttribute("aria-hidden", "true");
    for (var k = 0; k < 8; k++) {
      var i = el("i", "", p);
      i.style.transform = "rotate(" + (k * 45) + "deg)";
      i.style.opacity = String(((k + 1) / 8).toFixed(3));
    }
    return p;
  }

  function stil() {
    if (document.getElementById("vr-stil")) return;
    var s = el("style");
    s.id = "vr-stil";
    s.textContent = STIL;
    (document.head || document.documentElement).appendChild(s);
  }

  function gesteuert(swAdresse) {
    if (!("serviceWorker" in navigator)) return Promise.resolve(false);
    if (navigator.serviceWorker.controller) return Promise.resolve(true);
    navigator.serviceWorker.register(swAdresse).catch(function () {});
    return new Promise(function (ok) {
      var z = setTimeout(function () { ok(!!navigator.serviceWorker.controller); }, 10000);
      navigator.serviceWorker.addEventListener("controllerchange", function () { clearTimeout(z); ok(true); }, { once: true });
    });
  }

  function vollbildElement() { return document.fullscreenElement || document.webkitFullscreenElement || null; }

  function fassungenLesen(roh, erste) {
    var liste = [];
    (roh || "").split(/\s+/).forEach(function (s) {
      var i = s.indexOf(":"), id = i > 0 ? s.slice(0, i) : s, name = i > 0 ? s.slice(i + 1) : s;
      if (KENNUNG.test(id) && !liste.some(function (f) { return f.id === id; })) liste.push({ id: id, name: name || id });
    });
    if (!liste.some(function (f) { return f.id === erste; })) liste.unshift({ id: erste, name: erste });
    return liste;
  }

  function baue(rahmen) {
    var id = rahmen.getAttribute("data-video-id") || "";
    if (!KENNUNG.test(id) || rahmen.__vr) return null;
    var M = {
      titel: rahmen.getAttribute("data-video-titel") || "",
      weg: rahmen.getAttribute("data-video-weg") || "videos/{id}/abspielen.mp4",
      sw: rahmen.getAttribute("data-video-sw") || "sw.js",
      quelle: rahmen.getAttribute("data-video-quelle") || "",
      laden: rahmen.getAttribute("data-video-laden") || "",
      merken: rahmen.getAttribute("data-video-merken") || ("fp_video_stelle_" + id),
      ausweich: rahmen.getAttribute("data-video-ausweich") || ""
    };
    var fassungen = fassungenLesen(rahmen.getAttribute("data-video-fassungen"), id);
    var aktiv = id;
    stil();
    rahmen.classList.add("vr-rahmen");
    rahmen.setAttribute("data-vr-zustand", "ruhe");

    var schicht = el("div", "vr-schicht", rahmen); schicht.hidden = true;
    var vid = el("video", "vr-video", schicht);
    vid.setAttribute("playsinline", ""); vid.setAttribute("preload", "none");
    var warte = el("p", "vr-warte", schicht); warte.hidden = true;
    punkte(warte);
    var warteText = el("span", "vr-warte-text", warte);
    var qual = el("p", "vr-qual", rahmen); qual.hidden = true;
    var meldung = el("p", "vr-meldung", rahmen); meldung.hidden = true;
    meldung.setAttribute("role", "status"); meldung.setAttribute("aria-live", "polite");

    var leiste = el("div", "vr-leiste", rahmen);
    leiste.setAttribute("role", "group");
    var spielen = knopf("vr-spielen", leiste);
    var stopp = knopf("vr-stopp", leiste);
    var zur = knopf("vr-zurueck", leiste);
    var titel = el("span", "vr-titel", leiste);
    var zeit = el("input", "vr-zeit", leiste);
    zeit.type = "range"; zeit.min = "0"; zeit.max = "0"; zeit.step = "0.1"; zeit.value = "0";
    var uhr = el("span", "vr-uhr", leiste);
    var vor = knopf("vr-vor", leiste);
    var ton = knopf("vr-ton", leiste);
    var mehr = knopf("vr-mehr", leiste);
    var voll = knopf("vr-voll", leiste);
    symbol(stopp, "stopp"); zur.textContent = "−10"; vor.textContent = "+10";
    mehr.setAttribute("aria-haspopup", "true"); mehr.setAttribute("aria-expanded", "false");

    /* Das Menü füllt den Rahmen: am Handy ist er nur gut 110 px hoch, und der
       Behälter darf überlaufen wegschneiden — ein Aufklapp-Menü darüber wäre halb weg. */
    var menue = el("div", "vr-menue", rahmen); menue.hidden = true;
    menue.setAttribute("role", "dialog");
    var zu = knopf("vr-zu", menue); zu.textContent = "✕";
    /* Drei Zeilen, damit es in den Rahmen am Handy passt (gut 110 px hoch):
       Qualität · Springen und Ton · Herunterladen. */
    var zQual = el("div", "vr-zeile", menue), zSpring = el("div", "vr-zeile", menue), zTon = zSpring, zLaden = el("div", "vr-zeile", menue);
    var groessen = null;

    var zustand = "ruhe", ziehen = false, gestartet = null, zuletztGemerkt = 0;
    var leiseUhr = null, qualUhr = null, qualGezeigt = false;
    var LEISE_MS = 2500, QUAL_MS = 2000;

    /* Die Leiste tritt nur zurück, solange es läuft, nichts lädt und das Menü zu ist. */
    function leiseErlaubt() { return zustand === "laeuft" && !vid.paused && warte.hidden && menue.hidden && !ziehen; }
    function wach() {
      rahmen.removeAttribute("data-vr-leise");
      clearTimeout(leiseUhr); leiseUhr = null;
      if (leiseErlaubt()) leiseUhr = setTimeout(function () { leiseUhr = null; if (leiseErlaubt()) rahmen.setAttribute("data-vr-leise", ""); }, LEISE_MS);
    }
    function zeigeQualitaet() {
      clearTimeout(qualUhr);
      if (fassungen.length < 2) { qual.hidden = true; return; }
      qual.textContent = nameVon(aktiv); qual.hidden = false;
      qualUhr = setTimeout(function () { qual.hidden = true; }, QUAL_MS);
    }

    function gemerkt() {
      try {
        var o = JSON.parse(localStorage.getItem(M.merken) || "null");
        return o && o.id === id && isFinite(o.t) && o.t > 0 ? o.t : 0;
      } catch (e) { return 0; }
    }
    function merke() {
      try {
        if (vid.ended) { localStorage.removeItem(M.merken); return; }
        if (!(vid.currentTime > 0)) return;
        localStorage.setItem(M.merken, JSON.stringify({ id: id, t: Math.round(vid.currentTime * 10) / 10 }));
        zuletztGemerkt = Date.now();
      } catch (e) { /* ohne Speicher geht es auch, nur ohne Merken */ }
    }
    function vergiss() { try { localStorage.removeItem(M.merken); } catch (e) {} }

    function vorgeladenBis() {
      var b = vid.buffered, jetzt = vid.currentTime;
      for (var i = 0; i < b.length; i++) if (b.start(i) <= jetzt + 0.25 && jetzt <= b.end(i)) return b.end(i);
      return jetzt;
    }
    function nameVon(fid) { var f = fassungen.filter(function (x) { return x.id === fid; })[0]; return f ? f.name : fid; }

    function zeichneMenue() {
      var T = t();
      zu.setAttribute("aria-label", T.schliessen); zu.title = T.schliessen;
      menue.setAttribute("aria-label", T.mehr);
      [zQual, zSpring, zLaden].forEach(function (z) { while (z.firstChild) z.removeChild(z.firstChild); });
      if (fassungen.length > 1) {
        el("b", "vr-wort", zQual).textContent = T.qualitaet;
        fassungen.forEach(function (f) {
          var b = knopf("vr-fassung", zQual);
          b.textContent = f.name;
          b.setAttribute("data-fassung", f.id);
          b.setAttribute("aria-pressed", f.id === aktiv ? "true" : "false");
          b.addEventListener("click", function () { wechsle(f.id); });
        });
      } else zQual.hidden = true;
      /* ±10 s auch hier: am schmalen Handy passen sie nicht in die Leiste —
         auch im Vollbild nicht, solange es hochkant steht. */
      el("b", "vr-wort", zSpring).textContent = zustand === "ruhe" ? T.ton : T.springen;
      if (zustand !== "ruhe") [[-10, "−10 s", T.zurueck], [10, "+10 s", T.vor]].forEach(function (x) {
        var b = knopf("vr-spring", zSpring);
        b.textContent = x[1]; b.setAttribute("aria-label", x[2]); b.setAttribute("data-sprung", String(x[0]));
        b.addEventListener("click", function () { springe(vid.currentTime + x[0]); });
      });
      var tb = knopf("vr-ton-menue", zTon);
      tb.textContent = (vid.muted ? "🔇 " + T.tonAusWort : "🔊 " + T.tonAnWort);
      tb.setAttribute("aria-pressed", vid.muted ? "false" : "true");
      tb.addEventListener("click", function () { vid.muted = !vid.muted; zeichne(); zeichneMenue(); });
      if (M.laden) {
        var lb = el("b", "", zLaden);
        lb.appendChild(document.createTextNode("⬇"));
        el("span", "vr-wort", lb).textContent = " " + T.herunterladen;
        fassungen.forEach(function (f) {
          var a = el("a", "vr-laden", zLaden);
          a.href = mit(M.laden, f.id); a.target = "_blank"; a.rel = "noopener"; a.title = T.ladenHinweis;
          a.setAttribute("data-fassung", f.id);
          var g = groessen && groessen[f.id];
          a.textContent = f.name;
          if (g) {
            el("span", "vr-groesse", a).textContent = " · " + mb(g);
            a.setAttribute("aria-label", T.herunterladen + " " + f.name + ", " + mb(g));
            a.title = mb(g) + " — " + T.ladenHinweis;
          }
        });
        el("small", "", zLaden).textContent = T.ladenHinweis;
      } else zLaden.hidden = true;
    }
    function oeffneMenue(an) {
      menue.hidden = !an;
      mehr.setAttribute("aria-expanded", an ? "true" : "false");
      wach();
      if (!an) return;
      zeichneMenue();
      (menue.querySelector("button[aria-pressed=true]") || zu).focus();
      /* Die Größen stehen in videos.json der Video-Seite. Erst jetzt gefragt, nie
         beim Seitenaufbau; kommt nichts, steht der Name ohne Größe da. */
      if (!groessen && M.quelle && M.laden) {
        groessen = {};
        fetch(M.quelle + "videos.json", { cache: "no-store" }).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
          (d && Array.isArray(d.videos) ? d.videos : []).forEach(function (v) { if (v && KENNUNG.test(v.id || "") && v.groesse > 0) groessen[v.id] = v.groesse; });
          if (!menue.hidden) zeichneMenue();
        }).catch(function () {});
      }
    }

    function zeichne() {
      var T = t();
      var d = isFinite(vid.duration) ? vid.duration : 0;
      var laeuft = zustand !== "ruhe" && !vid.paused && !vid.ended;
      leiste.setAttribute("aria-label", M.titel || T.gruppe);
      symbol(spielen, laeuft ? "pause" : "spielen");
      var stelle = zustand === "ruhe" ? gemerkt() : vid.currentTime;
      spielen.setAttribute("aria-label", laeuft ? T.pause : (stelle > 0 && !vid.ended ? T.weiter : T.spielen));
      spielen.setAttribute("aria-pressed", laeuft ? "true" : "false");
      spielen.title = spielen.getAttribute("aria-label");
      stopp.setAttribute("aria-label", T.stopp); stopp.title = T.stopp;
      zur.setAttribute("aria-label", T.zurueck); zur.title = T.zurueck;
      vor.setAttribute("aria-label", T.vor); vor.title = T.vor;
      ton.textContent = vid.muted ? "🔇" : "🔊";
      ton.setAttribute("aria-label", vid.muted ? T.tonAus : T.tonAn); ton.title = ton.getAttribute("aria-label");
      mehr.textContent = "⋯";
      mehr.setAttribute("aria-label", T.mehr); mehr.title = T.mehr;
      var istVoll = vollbildElement() === rahmen;
      symbol(voll, istVoll ? "vollAus" : "voll");
      voll.setAttribute("aria-label", istVoll ? T.vollAus : T.voll); voll.title = voll.getAttribute("aria-label");
      zeit.setAttribute("aria-label", T.stelle);
      titel.textContent = stelle > 0 ? T.weiterBei + mmss(stelle) : "";
      warteText.textContent = T.warte;
      zeit.max = String(d);
      if (!ziehen) zeit.value = String(vid.currentTime);
      /* Der Ladebalken: gespielt in der Akzentfarbe, geladen heller, Rest dunkel. */
      var gesp = d ? Math.min(100, vid.currentTime / d * 100) : 0;
      var gel = d ? Math.min(100, vorgeladenBis() / d * 100) : 0;
      zeit.style.background = "linear-gradient(90deg,var(--vr-akzent,#5eead4) 0," +
        "var(--vr-akzent,#5eead4) " + gesp.toFixed(2) + "%,rgba(255,255,255,.55) " + gesp.toFixed(2) + "%," +
        "rgba(255,255,255,.55) " + gel.toFixed(2) + "%,rgba(255,255,255,.18) " + gel.toFixed(2) + "%)";
      zeit.setAttribute("aria-valuetext", mmss(vid.currentTime) + " / " + mmss(d) + " · " + T.geladen + mmss(vorgeladenBis()));
      uhr.textContent = rahmen.hasAttribute("data-vr-schmal") ? mmss(vid.currentTime) : mmss(vid.currentTime) + " / " + mmss(d);
    }

    function melde(text, mitAusweich, mitPunkten) {
      while (meldung.firstChild) meldung.removeChild(meldung.firstChild);
      if (!text) { meldung.hidden = true; return; }
      if (mitPunkten) punkte(meldung);
      meldung.appendChild(document.createTextNode(text));
      if (mitAusweich && M.ausweich) {
        meldung.appendChild(document.createTextNode(" "));
        var a = el("a", "", meldung);
        a.href = mit(M.ausweich, aktiv); a.rel = "noopener"; a.target = "_blank";
        a.textContent = t().ausweich;
      }
      meldung.hidden = false;
    }

    function setzeZustand(z) { zustand = z; rahmen.setAttribute("data-vr-zustand", z); zeichne(); wach(); }
    function quelle(fid, ab, weiterSpielen) {
      if (ab > 0) {
        vid.addEventListener("loadedmetadata", function () {
          if (isFinite(vid.duration) && ab < vid.duration - 1) vid.currentTime = ab;
        }, { once: true });
      }
      vid.preload = "auto";
      vid.src = mit(M.weg, fid);
      if (weiterSpielen) spieleJetzt();
    }

    /* Der erste Tipp: erst jetzt bekommt das Video seine Quelle. */
    function starte() {
      if (gestartet) return gestartet;
      setzeZustand("bereit");
      schicht.hidden = false;
      /* Der Rahmen ist eben höher geworden — die Leiste bleibt im Blick. */
      try { rahmen.scrollIntoView({ block: "nearest" }); } catch (e) {}
      melde(t().vorbereiten, false, true);
      gestartet = gesteuert(M.sw).then(function (ja) {
        if (!ja) {
          melde("serviceWorker" in navigator ? t().swNicht : t().keinSw, true);
          gestartet = null; schicht.hidden = true; setzeZustand("ruhe");
          return false;
        }
        if (zustand === "ruhe") return false;   /* inzwischen gestoppt */
        quelle(aktiv, gemerkt(), false);
        melde("");
        return true;
      });
      return gestartet;
    }
    function spieleJetzt() {
      /* Bis das erste Bild kommt, drehen sich die Punkte. */
      if (vid.readyState < 3) warte.hidden = false;
      var p = vid.play();
      if (p && p.catch) p.catch(function (e) { if (e && e.name !== "AbortError") melde(t().fehler + " (" + (e.message || e.name) + ")", true); });
    }
    function abspielen() { return starte().then(function (ja) { if (ja) spieleJetzt(); }); }
    function stoppe() {
      /* Stopp heißt: anhalten, an den Anfang, und JEDES Laden hört auf. Ohne
         removeAttribute + load() hielte der Browser die Verbindung offen und
         holte weiter vor. Danach steht das Bild wieder da. */
      vergiss();
      vid.pause();
      vid.removeAttribute("src");
      try { vid.load(); } catch (e) {}
      gestartet = null; warte.hidden = true; schicht.hidden = true; qualGezeigt = false;
      clearTimeout(qualUhr); qual.hidden = true;
      melde("");
      if (vollbildElement() === rahmen) (document.exitFullscreen || document.webkitExitFullscreen || function () {}).call(document);
      setzeZustand("ruhe");
    }
    function wechsle(fid) {
      if (fid === aktiv) return;
      aktiv = fid;
      if (zustand !== "ruhe" && vid.getAttribute("src")) {
        var lief = !vid.paused && !vid.ended, ab = vid.currentTime;
        quelle(fid, ab, lief);
        zeigeQualitaet();
      }
      zeichne(); zeichneMenue();
    }
    function springe(s) {
      if (zustand === "ruhe") return;
      var d = isFinite(vid.duration) ? vid.duration : 0;
      vid.currentTime = Math.max(0, Math.min(d || 0, s));
      zeichne();
    }
    function vollbild() {
      if (vollbildElement() === rahmen) {
        (document.exitFullscreen || document.webkitExitFullscreen || function () {}).call(document);
        return;
      }
      var an = rahmen.requestFullscreen || rahmen.webkitRequestFullscreen;
      if (an) {
        var p = an.call(rahmen);
        if (p && p.then) p.then(function () {
          try { if (screen.orientation && screen.orientation.lock) screen.orientation.lock("landscape").catch(function () {}); } catch (e) {}
        }).catch(function () {});
      } else if (vid.webkitEnterFullscreen) {
        /* iPhone kennt kein Vollbild für Behälter, nur für das Video selbst. */
        starte().then(function (ja) { if (ja) { try { vid.webkitEnterFullscreen(); } catch (e) {} } });
      }
      if (zustand === "ruhe" || vid.paused) abspielen();
    }

    /* Jeder Tipp in Leiste, Menü und Video bleibt hier: der Behälter darf eigene
       Klick-Zähler haben (family-projekt.de: fünfmal tippen wechselt das Bild). */
    [leiste, schicht, meldung, menue].forEach(function (x) { x.addEventListener("click", function (e) { e.stopPropagation(); }); });
    spielen.addEventListener("click", function () {
      if (zustand === "ruhe" || vid.paused || vid.ended) abspielen(); else vid.pause();
    });
    stopp.addEventListener("click", stoppe);
    zur.addEventListener("click", function () { springe(vid.currentTime - 10); });
    vor.addEventListener("click", function () { springe(vid.currentTime + 10); });
    ton.addEventListener("click", function () { vid.muted = !vid.muted; zeichne(); });
    mehr.addEventListener("click", function () { oeffneMenue(menue.hidden); });
    zu.addEventListener("click", function () { oeffneMenue(false); mehr.focus(); });
    menue.addEventListener("keydown", function (e) { if (e.key === "Escape") { e.stopPropagation(); oeffneMenue(false); mehr.focus(); } });
    voll.addEventListener("click", vollbild);
    /* Ist die Leiste zurückgetreten, holt der Tipp sie nur zurück — er hält nichts an.
       Ein Tipp aufs Video zählt auch nicht zum Fünffach-Tipp der Seite aufs Bild. */
    vid.addEventListener("click", function (e) {
      e.stopPropagation();
      if (rahmen.hasAttribute("data-vr-leise")) { wach(); return; }
      spielen.click();
    });
    schicht.addEventListener("click", function () { if (rahmen.hasAttribute("data-vr-leise")) wach(); });
    rahmen.addEventListener("pointermove", function (e) { if (e.pointerType === "mouse" && zustand === "laeuft") wach(); });
    leiste.addEventListener("focusin", wach);
    leiste.addEventListener("click", wach);
    zeit.addEventListener("input", function () { ziehen = true; uhr.textContent = mmss(Number(zeit.value)); });
    zeit.addEventListener("change", function () { ziehen = false; springe(Number(zeit.value)); wach(); });

    ["timeupdate", "progress", "durationchange", "loadedmetadata", "seeked", "volumechange"].forEach(function (n) {
      vid.addEventListener(n, zeichne);
    });
    vid.addEventListener("play", function () { setzeZustand("laeuft"); });
    vid.addEventListener("pause", function () { merke(); if (zustand !== "ruhe") setzeZustand("pause"); });
    /* Fertig gesehen: zurück in die Grundansicht (Klaus 2026-10-06) — Bild, kein
       Laden, keine gemerkte Stelle, Vollbild zu. */
    vid.addEventListener("ended", function () { if (zustand !== "ruhe") stoppe(); });
    vid.addEventListener("loadedmetadata", function () {
      if (vid.videoWidth && vid.videoHeight) rahmen.style.setProperty("--vr-format", (vid.videoWidth / vid.videoHeight).toFixed(4));
    });
    vid.addEventListener("timeupdate", function () { if (zustand !== "ruhe" && Date.now() - zuletztGemerkt > 2000) merke(); });
    vid.addEventListener("waiting", function () { warte.hidden = false; wach(); });
    vid.addEventListener("playing", function () { if (!qualGezeigt) { qualGezeigt = true; zeigeQualitaet(); } });
    ["playing", "canplay", "seeked", "pause"].forEach(function (n) {
      vid.addEventListener(n, function () { if (!vid.seeking) { warte.hidden = true; wach(); } });
    });
    vid.addEventListener("error", function () {
      if (!vid.getAttribute("src")) return;
      warte.hidden = true;
      melde(t().fehler, true);
    });
    ["fullscreenchange", "webkitfullscreenchange"].forEach(function (n) { document.addEventListener(n, zeichne); });
    addEventListener("pagehide", function () { if (zustand !== "ruhe") merke(); });
    try { new MutationObserver(function () { zeichne(); if (!menue.hidden) zeichneMenue(); }).observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] }); } catch (e) {}
    function messe() {
      var b = rahmen.clientWidth;
      if (b && b < 460) rahmen.setAttribute("data-vr-schmal", ""); else rahmen.removeAttribute("data-vr-schmal");
      /* unter 330 px passen drei Downloads mit Größe nicht in eine Zeile: die Größe steht dann im title */
      if (b && b < 330) rahmen.setAttribute("data-vr-eng", ""); else rahmen.removeAttribute("data-vr-eng");
      zeichne();
    }
    messe();
    if (window.ResizeObserver) { try { new ResizeObserver(messe).observe(rahmen); } catch (e) {} }

    var ich = {
      rahmen: rahmen, vid: vid, id: id,
      zustand: function () { return zustand; },
      aktiv: function () { return aktiv; },
      springe: springe, abspielen: abspielen, stoppe: stoppe, wechsle: wechsle, gemerkt: gemerkt,
      leise: function () { return rahmen.hasAttribute("data-vr-leise"); }, zeigen: wach
    };
    rahmen.__vr = ich;
    return ich;
  }

  function alle() {
    var liste = [];
    Array.prototype.forEach.call(document.querySelectorAll("[data-video-rahmen]"), function (r) {
      var s = baue(r) || r.__vr;
      if (s) liste.push(s);
    });
    window.__rahmenSpieler = liste;
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", alle); else alle();
})();
