/* Videos · family-projekt.de — Liste, Laden, Prüfen, Speichern, Installieren.
 *
 * Die Liste steht in videos.json (gebaut von tools/video-aufnehmen.mjs, nie von
 * Hand). Jedes Video liegt in Teilen unter videos/<kennung>/teil-NN.bin; jeder
 * Teil wird nach dem Laden mit seiner Größe UND seiner SHA-256-Prüfsumme
 * verglichen. Erst wenn alle stimmen, wird zusammengesetzt und gespeichert.
 *
 * Alle Texte aus der Liste gehen über textContent, nie über innerHTML. */
(function () {
  "use strict";
  var KENNUNG = /^[a-z0-9][a-z0-9-]{1,59}$/;
  var EIGEN = /^fp-videos-/;            /* nur die eigenen Vorräte — github.io teilen sich viele Apps */
  var VERSUCHE = 3;

  var listeEl = document.getElementById("liste");
  var listeMeldung = document.getElementById("liste-meldung");
  var vorlage = document.getElementById("karte-vorlage");
  var karten = [];                       /* je Video: { v, el, felder, puffer, blob, holZaehler } */
  var laeuft = null;                     /* die Karte, die gerade lädt */

  /* Für die Proben: was zuletzt gespeichert wurde, und wie oft jeder Teil geholt wurde. */
  var probe = window.__videos = { letzterDownload: null, karten: karten };

  function zahl(n, stellen) {
    return n.toLocaleString("de-DE", { minimumFractionDigits: stellen, maximumFractionDigits: stellen });
  }
  function mb(bytes) { return zahl(bytes / 1e6, 1) + " MB"; }
  function hex(buf) {
    var b = new Uint8Array(buf), s = "";
    for (var i = 0; i < b.length; i++) s += b[i].toString(16).padStart(2, "0");
    return s;
  }
  function zwei(n) { return String(n).padStart(2, "0"); }
  function teilAdresse(v, i) { return "videos/" + v.id + "/teil-" + zwei(i) + ".bin"; }

  function setze(el, text) {
    /* null/undefined → „nicht gemessen“: eine Lücke wird benannt, nicht als 0 gezeigt */
    if (text === null || text === undefined || text === "") {
      el.textContent = "nicht gemessen"; el.setAttribute("data-leer", "");
    } else { el.textContent = text; el.removeAttribute("data-leer"); }
  }

  function bildText(v) { return v.breite && v.hoehe ? v.breite + " × " + v.hoehe : null; }
  function laengeText(v) {
    if (!v.dauer) return null;
    /* Zeilen statt „ · “: in der schmalen Spalte bricht sonst mitten in einer Angabe um */
    return zahl(v.dauer, 1) + " s" + (v.fps ? "\n" + zahl(v.fps, Number.isInteger(v.fps) ? 0 : 2) + " fps" : "");
  }
  function videoText(v) {
    if (!v.video) return null;
    return v.video + (v.videoBitrate ? "\n" + zahl(v.videoBitrate / 1e6, 1) + " Mbit/s" : "");
  }
  function tonText(v) {
    if (!v.ton) return null;
    var k = v.tonKanaele === 2 ? " · Stereo" : v.tonKanaele === 1 ? " · Mono" : v.tonKanaele ? " · " + v.tonKanaele + " Kanäle" : "";
    return v.ton + k + (v.tonHz ? "\n" + zahl(v.tonHz / 1000, Number.isInteger(v.tonHz / 1000) ? 0 : 1) + " kHz" : "");
  }

  function gueltig(v) {
    return v && typeof v === "object" && KENNUNG.test(String(v.id || "")) && typeof v.titel === "string" &&
      Array.isArray(v.teile) && v.teile.length > 0 && v.teile.length <= 100 &&
      v.teile.every(function (t) { return t && Number.isInteger(t.groesse) && t.groesse > 0 && /^[0-9a-f]{64}$/.test(String(t.sha256)); }) &&
      v.teile.reduce(function (s, t) { return s + t.groesse; }, 0) === v.groesse &&
      /^[0-9a-f]{64}$/.test(String(v.sha256)) && typeof v.dateiname === "string" && /\.mp4$/i.test(v.dateiname);
  }

  function melde(k, text, art) {
    k.felder.meldung.textContent = text;
    if (art) k.felder.meldung.setAttribute("data-art", art); else k.felder.meldung.removeAttribute("data-art");
  }

  function karteBauen(v) {
    var el = vorlage.content.firstElementChild.cloneNode(true);
    el.setAttribute("data-id", v.id);
    el.id = "video-" + v.id;
    var f = {};
    el.querySelectorAll("[data-feld]").forEach(function (n) { f[n.getAttribute("data-feld")] = n; });
    f.laden = el.querySelector('[data-knopf="laden"]');
    f.speichern = el.querySelector('[data-knopf="speichern"]');
    /* Drei Wege, derselbe Inhalt: schlicht · mit Hintergrundbildern · mit Werbeschau.
       Die Teile, die Prüfung und die gespeicherte Datei sind in allen drei gleich. */
    f.arten = [["laden-bilder", "bilder"], ["laden-schau", "werbung"]]
      .map(function (a) { return { knopf: el.querySelector('[data-knopf="' + a[0] + '"]'), art: a[1] }; })
      .filter(function (a) { return a.knopf; });

    f.titel.textContent = v.titel;
    f.beschreibung.textContent = v.beschreibung || "";
    if (v.vorschau) {
      var img = document.createElement("img");
      img.src = v.vorschau; img.alt = "Vorschaubild: " + v.titel; img.loading = "lazy"; img.decoding = "async";
      img.width = 1280; img.height = 720;
      f.vorschau.appendChild(img);
    } else f.vorschau.textContent = "kein Vorschaubild";
    setze(f.bild, bildText(v));
    setze(f.laenge, laengeText(v));
    setze(f.video, videoText(v));
    setze(f.ton, tonText(v));
    setze(f.datei, mb(v.groesse));
    f["teile-titel"].textContent = v.teile.length === 1 ? "1 Teil" : "Die " + v.teile.length + " Teile";
    f.dateiname.textContent = v.dateiname;
    f.bytes.textContent = v.groesse.toLocaleString("de-DE");
    f.sha256.textContent = v.sha256;

    var k = { v: v, el: el, felder: f, puffer: [], blob: null, holZaehler: v.teile.map(function () { return 0; }), streifen: [] };
    v.teile.forEach(function (t, i) {
      var feld = document.createElement("div");
      feld.className = "feld";
      feld.setAttribute("role", "listitem");
      feld.setAttribute("aria-label", "Teil " + (i + 1) + " von " + v.teile.length);
      feld.textContent = zwei(i + 1);
      feld.style.setProperty("--i", String(i));   /* für die Lichtwelle am Ende */
      f.streifen.appendChild(feld);
      k.streifen.push(feld);
    });
    melde(k, "Erst laden, dann speichern. Das Laden braucht je nach Verbindung ein paar Minuten (" + mb(v.groesse) + ").");
    f.laden.addEventListener("click", function () { laden(k, false); });
    f.arten.forEach(function (a) { a.knopf.addEventListener("click", function () { laden(k, a.art); }); });
    f.speichern.addEventListener("click", function () { speichern(k); });
    return k;
  }

  /* Es wird immer nur ein Video im Speicher gehalten. */
  function freigeben(k, grund) {
    if (!k.puffer.some(Boolean) && !k.blob) return;
    k.puffer = []; k.blob = null;
    k.streifen.forEach(function (s) { s.removeAttribute("data-lage"); });
    k.felder.stand.textContent = "noch nicht geladen";
    k.felder.laden.textContent = "Schlicht laden";
    k.felder.laden.className = "haupt"; k.felder.speichern.className = "zweit";
    artKnoepfe(k, { hidden: false, disabled: false });
    k.felder.speichern.disabled = true;
    k.el.removeAttribute("data-lage");
    melde(k, grund, "warn");
  }

  function artKnoepfe(k, was) {
    k.felder.arten.forEach(function (a) { for (var x in was) a.knopf[x] = was[x]; });
  }
  function alleKnoepfe(an) {
    karten.forEach(function (k) { if (k !== laeuft) { k.felder.laden.disabled = !an; artKnoepfe(k, { disabled: !an }); } });
  }

  async function holeTeil(k, i) {
    var t = k.v.teile[i];
    var letzter = null;
    for (var versuch = 1; versuch <= VERSUCHE; versuch++) {
      try {
        k.holZaehler[i]++;
        var antwort = await fetch(teilAdresse(k.v, i), { cache: "no-store" });
        if (!antwort.ok) throw new Error("Antwort " + antwort.status);
        var buf = await antwort.arrayBuffer();
        if (buf.byteLength !== t.groesse) throw new Error("falsche Größe: " + buf.byteLength + " statt " + t.groesse + " Bytes");
        var summe = hex(await crypto.subtle.digest("SHA-256", buf));
        if (summe !== t.sha256) throw new Error("Prüfsumme stimmt nicht");
        return buf;
      } catch (e) { letzter = e; }
    }
    throw letzter;
  }

  /* Die Werbeschau: dieselben Teile, dieselbe Prüfung — nur läuft im
     Vorschaufenster eine Schau, bis das Video da ist. Sie wird erst beim
     Tippen geholt; wer schlicht lädt, lädt nichts davon. */
  var schauLaedt = null;
  function holeSchau() {
    if (window.Ladeschau) return Promise.resolve(true);
    if (schauLaedt) return schauLaedt;
    window.LADESCHAU_BASIS = "assets/ls/";
    schauLaedt = new Promise(function (ok) {
      var s = document.createElement("script");
      s.src = "assets/ladeschau.js?v=2";
      s.onload = function () { ok(!!window.Ladeschau); };
      s.onerror = function () { schauLaedt = null; ok(false); };
      document.head.appendChild(s);
    });
    return schauLaedt;
  }
  function schau(k, was, a, b) {
    if (!k.schau || !window.Ladeschau) return;
    try { window.Ladeschau[was](a, b); } catch (e) {}
  }

  async function laden(k, mitSchau) {
    if (laeuft) return;
    if (mitSchau && !k.schau) {
      if (await holeSchau()) { k.schau = mitSchau; schau(k, "start", k.felder.vorschau, mitSchau); }
      else melde(k, "Die Schau ließ sich nicht laden. Das Video wird trotzdem geladen und geprüft.", "warn");
      if (laeuft) return;   /* während des Holens hat ein anderes Video begonnen */
    } else if (k.schau) schau(k, "start", k.felder.vorschau, k.schau);   /* „Weiter laden“: die Schau läuft weiter */
    if (!window.crypto || !crypto.subtle) {
      melde(k, "Dieser Browser kann hier nicht prüfen (kein crypto.subtle — die Seite muss über https geöffnet sein).", "fehler");
      return;
    }
    karten.forEach(function (andere) { if (andere !== k) freigeben(andere, "Freigegeben, weil ein anderes Video geladen wird. Es wird immer nur ein Video im Speicher gehalten."); });
    laeuft = k; alleKnoepfe(false);
    k.el.setAttribute("data-lage", "laedt");
    var f = k.felder, v = k.v, n = v.teile.length;
    f.laden.disabled = true; f.speichern.disabled = true; artKnoepfe(k, { disabled: true });
    k.blob = null;
    var geladen = 0;
    for (var i = 0; i < n; i++) {
      if (k.puffer[i]) { geladen += v.teile[i].groesse; continue; }
      k.streifen[i].setAttribute("data-lage", "laedt");
      f.stand.textContent = "Teil " + (i + 1) + " von " + n + " · " + mb(geladen) + " von " + mb(v.groesse);
      melde(k, "Lade Teil " + (i + 1) + " von " + n + " …");
      try {
        k.puffer[i] = await holeTeil(k, i);
      } catch (e) {
        k.streifen[i].setAttribute("data-lage", "fehler");
        schau(k, "pause");
        f.stand.textContent = k.puffer.filter(Boolean).length + " von " + n + " Teilen geprüft";
        melde(k, "Teil " + (i + 1) + " kam nicht richtig an (" + (e && e.message ? e.message : "unbekannter Fehler") +
          "). Tippe auf „Weiter laden“, dann geht es an dieser Stelle weiter — die schon geprüften Teile bleiben.", "fehler");
        f.laden.textContent = "Weiter laden";
        f.laden.disabled = false;
        artKnoepfe(k, { hidden: true });
        k.el.setAttribute("data-lage", "fehler");
        laeuft = null; alleKnoepfe(true);
        return;
      }
      geladen += v.teile[i].groesse;
      k.streifen[i].setAttribute("data-lage", "ok");
      schau(k, "teil", k.puffer.filter(Boolean).length, n);
    }
    var blob = new Blob(k.puffer, { type: "video/mp4" });
    k.puffer = [];
    laeuft = null; alleKnoepfe(true);
    schau(k, "ende"); k.schau = false;
    if (blob.size !== v.groesse) {
      k.streifen.forEach(function (s) { s.removeAttribute("data-lage"); });
      k.el.setAttribute("data-lage", "fehler");
      melde(k, "Zusammengesetzt sind " + blob.size + " Bytes statt " + v.groesse + ". Bitte noch einmal laden.", "fehler");
      f.laden.textContent = "Schlicht laden";
      f.laden.disabled = false;
      artKnoepfe(k, { hidden: false, disabled: false });
      return;
    }
    k.blob = blob;
    k.el.setAttribute("data-lage", "fertig");
    f.stand.textContent = n + " von " + n + " Teilen geprüft · " + mb(v.groesse);
    f.laden.textContent = "Geladen";
    f.laden.disabled = true;
    artKnoepfe(k, { hidden: true });
    f.laden.className = "zweit"; f.speichern.className = "haupt";
    f.speichern.disabled = false;
    melde(k, "Alle " + n + " Teile stimmen mit ihrer Prüfsumme überein. Tippe jetzt auf „Video speichern“.", "gut");
    f.speichern.focus();
  }

  function speichern(k) {
    if (!k.blob) return;
    /* Zweiter Tipp kurz danach: kein zweiter Download. Der Browser braucht für eine große
       Datei ein paar Sekunden, bis sie unter „Downloads“ erscheint (Klaus 2026-10-02). */
    var jetzt = Date.now();
    if (k.gespeichertUm && jetzt - k.gespeichertUm < 15000) {
      probe.doppelGesperrt = (probe.doppelGesperrt || 0) + 1;
      melde(k, "Schon gespeichert. Bei einer großen Datei dauert es ein paar Sekunden, bis sie unter „Downloads“ erscheint. " +
        "Kein zweiter Download — sonst liegt die Datei doppelt da.", "warn");
      return;
    }
    k.gespeichertUm = jetzt;
    var url = URL.createObjectURL(k.blob);
    var a = document.createElement("a");
    a.href = url; a.download = k.v.dateiname; a.rel = "noopener";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 120000);
    probe.letzterDownload = { id: k.v.id, name: k.v.dateiname, groesse: k.blob.size };
    melde(k, "Der Browser legt „" + k.v.dateiname + "“ (" + mb(k.blob.size) + ") jetzt ab — meist im Ordner „Downloads“. " +
      "Fragt er nach, bitte bestätigen. Bei einer großen Datei dauert es ein paar Sekunden, bis sie dort erscheint — bitte nicht noch einmal tippen.", "gut");
  }

  async function listeLaden() {
    var d;
    try {
      var antwort = await fetch("videos.json", { cache: "no-store" });
      if (!antwort.ok) throw new Error("Antwort " + antwort.status);
      d = await antwort.json();
    } catch (e) {
      listeMeldung.textContent = "Die Liste der Videos kam nicht an (" + (e && e.message ? e.message : "kein Netz") +
        "). Ohne Netz gibt es hier nichts zu laden — mit Verbindung oben auf ⟳ tippen.";
      listeMeldung.setAttribute("data-art", "fehler");
      return;
    }
    var videos = d && Array.isArray(d.videos) ? d.videos : [];
    var gute = videos.filter(gueltig);
    var schlecht = videos.length - gute.length;
    gute.forEach(function (v, i) {
      var k = karteBauen(v);
      k.el.style.setProperty("--i", String(i));    /* Karten erscheinen nacheinander */
      karten.push(k); listeEl.appendChild(k.el);
    });
    if (!gute.length) {
      listeMeldung.textContent = "Gerade liegt hier kein Video zum Herunterladen.";
      listeMeldung.setAttribute("data-art", "warn");
    } else {
      listeMeldung.textContent = (gute.length === 1 ? "1 Video" : gute.length + " Videos") + " zum Herunterladen, das neueste oben." +
        (schlecht ? " " + schlecht + " Eintrag/Einträge in der Liste sind unvollständig und werden nicht gezeigt." : "");
      if (schlecht) listeMeldung.setAttribute("data-art", "warn"); else listeMeldung.removeAttribute("data-art");
    }
    probe.bereit = true;
  }

  /* ── Installieren ── */
  var ereignis = null;
  function alsApp() {
    try {
      return matchMedia("(display-mode: standalone)").matches || matchMedia("(display-mode: window-controls-overlay)").matches ||
        matchMedia("(display-mode: minimal-ui)").matches || navigator.standalone === true;
    } catch (_e) { return false; }
  }
  function installMeldung(text) {
    var m = document.getElementById("install-meldung");
    if (!m) {
      m = document.createElement("div"); m.id = "install-meldung"; m.setAttribute("role", "status");
      var zu = document.createElement("button"); zu.type = "button"; zu.className = "rund"; zu.textContent = "✕";
      zu.setAttribute("aria-label", "Hinweis schließen");
      zu.addEventListener("click", function () { m.hidden = true; });
      var t = document.createElement("span"); t.id = "install-meldung-text";
      m.appendChild(zu); m.appendChild(t); document.body.appendChild(m);
    }
    document.getElementById("install-meldung-text").textContent = text;
    m.hidden = false;
  }
  function installKnopf() {
    var k = document.getElementById("installieren");
    if (!k) return;
    var app = alsApp();
    k.hidden = app;
    k.setAttribute("data-lage", app ? "app" : (ereignis ? "angeboten" : "nicht-angeboten"));
    k.title = ereignis ? "Als App installieren" : "Installieren — ein Tipp sagt, wie";
  }
  window.addEventListener("beforeinstallprompt", function (e) { e.preventDefault(); ereignis = e; installKnopf(); });
  window.addEventListener("appinstalled", function () { ereignis = null; installKnopf(); installMeldung("Installiert. Die App liegt jetzt auf dem Startbildschirm bzw. Desktop."); });
  document.getElementById("installieren").addEventListener("click", function () {
    if (alsApp()) return;
    if (ereignis) {
      var e = ereignis; ereignis = null;
      e.prompt();
      e.userChoice.then(function (w) {
        installMeldung(w && w.outcome === "accepted" ? "Installiert. Die App liegt jetzt auf dem Startbildschirm bzw. Desktop." : "Nicht installiert — abgebrochen.");
        installKnopf();
      }).catch(installKnopf);
      return;
    }
    installMeldung("Der Browser bietet die Installation gerade nicht an.\n\n" +
      "Am Computer (Chrome oder Edge): rechts in der Adresszeile das Symbol „App installieren“ (Bildschirm mit Pfeil), " +
      "oder ⋮ → „Streamen, speichern und teilen“ → „Seite als App installieren“.\n\n" +
      "Am Tablet/Handy (Chrome): ⋮ → „App installieren“ bzw. „Zum Startbildschirm hinzufügen“.\n\n" +
      "Am iPhone/iPad (Safari): Teilen → „Zum Home-Bildschirm“.\n\n" +
      "Liegt schon eine Verknüpfung mit Chrome-Zeichen auf dem Startbildschirm, hält Chrome die Seite für installiert: " +
      "Verknüpfung entfernen, Seite neu laden, dann noch einmal.");
  });
  try { matchMedia("(display-mode: standalone)").addEventListener("change", installKnopf); } catch (_e) {}
  installKnopf();

  /* ── Neu laden: eigenen Vorrat leeren, Worker abmelden, mit geänderter Adresse laden ── */
  async function neuLaden(k) {
    k.disabled = true; k.setAttribute("data-laedt", "");
    try {
      if (window.caches && caches.keys) {
        var namen = await caches.keys();
        await Promise.all(namen.filter(function (n) { return EIGEN.test(n); }).map(function (n) { return caches.delete(n); }));
      }
    } catch (_e) {}
    try {
      if (navigator.serviceWorker && navigator.serviceWorker.getRegistrations) {
        var hier = new URL("./", location.href).href;
        var regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.filter(function (r) { return r.scope === hier; }).map(function (r) { return r.unregister(); }));
      }
    } catch (_e) {}
    location.replace(location.pathname + "?frisch=" + Date.now() + location.hash);
  }
  document.getElementById("neuladen").addEventListener("click", function () { neuLaden(this); });
  try {
    if (/[?&]frisch=/.test(location.search) && history.replaceState) history.replaceState(null, "", location.pathname + location.hash);
  } catch (_e) {}

  /* ── Glas-Knöpfe: neigen sich zum Zeiger, der Schimmer läuft mit ──
     Übernommen aus family-projekt.de (wireHoloButtons): ein Zuhörer für die
     ganze Seite, der Knöpfe und Vorschaubilder findet, auch wenn sie erst
     später entstehen. Setzt nur Variablen — das Bild macht das CSS.
     Bei „weniger Bewegung“ und am Finger (ohne Schweben) bleibt alles flach. */
  var NEIGBAR = ".knoepfe button, .rund, .vorschau";
  var ruhig = false;
  try { ruhig = matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (_e) {}

  /* Die Lage des Knopfs OHNE Neigung, aus dem Layout gerechnet (offsetLeft &
     Co. kennen keine transform). getBoundingClientRect() liefert dagegen das
     GENEIGTE Bild: die abgewandte Kante rückt dort um einige Pixel nach innen.
     Wer danach misst, verliert den Knopf am Rand unter dem Zeiger, die Neigung
     springt zurück, der Knopf ist wieder da — ein Flackern genau an der Kante. */
  function flach(el) {
    var op = el.offsetParent;
    if (!op) return null;
    var o = op.getBoundingClientRect();
    var x = o.left + op.clientLeft + el.offsetLeft, y = o.top + op.clientTop + el.offsetTop;
    return { left: x, top: y, right: x + el.offsetWidth, bottom: y + el.offsetHeight, width: el.offsetWidth, height: el.offsetHeight };
  }
  function glatt(el) { ["--mx", "--my", "--rx", "--ry"].forEach(function (n) { el.style.removeProperty(n); }); }

  if (!ruhig) {
    var aktiv = null;   /* der Knopf, der gerade geneigt ist */
    function loslassen() { if (aktiv) { glatt(aktiv); aktiv = null; } }
    document.addEventListener("pointermove", function (e) {
      if (e.pointerType === "touch") return;
      var el = e.target && e.target.closest ? e.target.closest(NEIGBAR) : null;
      if (!el && aktiv) {
        /* Der Zeiger steht über dem Rand, den die Neigung freigegeben hat:
           er gehört weiter zum Knopf, solange er in dessen flacher Lage ist. */
        var f0 = flach(aktiv);
        if (f0 && e.clientX >= f0.left && e.clientX <= f0.right && e.clientY >= f0.top && e.clientY <= f0.bottom) el = aktiv;
      }
      if (el !== aktiv) loslassen();
      if (!el || el.disabled) return;
      var r = flach(el);
      if (!r || !r.width || !r.height) return;
      var px = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
      var py = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
      var max = el.classList.contains("vorschau") ? 4 : 9;   /* Grad; das große Bild nur sanft */
      el.style.setProperty("--mx", (px * 100).toFixed(1) + "%");
      el.style.setProperty("--my", (py * 100).toFixed(1) + "%");
      el.style.setProperty("--rx", ((0.5 - py) * 2 * max).toFixed(2) + "deg");
      el.style.setProperty("--ry", ((px - 0.5) * 2 * max).toFixed(2) + "deg");
      aktiv = el;
    }, { passive: true });
    /* Zeiger verlässt das Fenster, oder die Seite rollt unter ihm weg */
    document.addEventListener("pointerout", function (e) { if (!e.relatedTarget) loslassen(); }, { passive: true });
    addEventListener("scroll", loslassen, { passive: true, capture: true });
    addEventListener("blur", loslassen);
  }

  /* ── Offline-Schale ── */
  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    navigator.serviceWorker.register("sw.js").catch(function () {});
  }

  listeLaden();
})();
