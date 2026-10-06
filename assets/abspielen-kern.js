/* Videos · family-projekt.de — der Abspiel-Kern für einen Service-Worker.
 *
 * Klaus 2026-10-05: „das Video soll in family-projekt.de laufen." Deshalb steht
 * das Zusammensetzen nicht mehr in sw.js, sondern hier, und zwei Worker holen es
 * mit importScripts: der von FP-Videos und der von family-projekt.de. Diese
 * Datei wird nach family-project BYTE-1:1 kopiert (dort per SHA-256 gepinnt) —
 * nur hier ändern, dann dort neu kopieren und den Pin nachziehen.
 *
 * Eine Video-Datei gibt es nicht. antwort(req, id, basis) setzt sie aus den
 * geprüften Teilen unter <basis>videos/<id>/teil-NN.bin zusammen:
 *   · mit Range: 206, höchstens bis ans Ende des Teils, in dem die Stelle liegt;
 *     der nächste Teil wird schon geholt (Vorladen beim Abspielen)
 *   · ohne Range: 200, Teil für Teil durchgereicht
 *   · 416 außerhalb, 404 unbekanntes Video, 503 Liste fehlt, 502 Teil kaputt
 * Jeder Teil: bis zu drei Versuche, Größe und SHA-256 geprüft. Höchstens drei
 * Teile im Arbeitsspeicher, nie in der Cache Storage. */
(function (g) {
  "use strict";
  var TEIL_MAX = 3;
  var listen = new Map();   /* basis → {liste, um} */
  var teile = new Map();    /* "basis|id#i" → Promise<Uint8Array>, älteste zuerst */

  function hex(buf) { return Array.from(new Uint8Array(buf)).map(function (b) { return b.toString(16).padStart(2, "0"); }).join(""); }

  async function eintrag(basis, id) {
    var l = listen.get(basis);
    if (!l || Date.now() - l.um > 60000) {
      var r = await fetch(basis + "videos.json", { cache: "no-store" });
      if (!r.ok) throw new Error("Liste " + r.status);
      l = { liste: await r.json(), um: Date.now() };
      listen.set(basis, l);
    }
    var v = (l.liste && Array.isArray(l.liste.videos) ? l.liste.videos : []).filter(function (x) { return x && x.id === id; })[0];
    if (!v || !Array.isArray(v.teile) || !v.teile.length) return null;
    return v;
  }

  async function teilHolen(basis, v, i) {
    var t = v.teile[i];
    var adr = basis + "videos/" + v.id + "/teil-" + String(i).padStart(2, "0") + ".bin";
    var fehler = null;
    for (var versuch = 0; versuch < 3; versuch++) {
      try {
        var r = await fetch(adr, { cache: "no-store" });
        if (!r.ok) throw new Error("Teil " + (i + 1) + ": Antwort " + r.status);
        var b = new Uint8Array(await r.arrayBuffer());
        if (b.byteLength !== t.groesse) throw new Error("Teil " + (i + 1) + ": falsche Größe");
        if (hex(await crypto.subtle.digest("SHA-256", b)) !== t.sha256) throw new Error("Teil " + (i + 1) + ": Prüfsumme stimmt nicht");
        return b;
      } catch (e) { fehler = e; }
    }
    throw fehler;
  }

  function teil(basis, v, i) {
    var s = basis + "|" + v.id + "#" + i;
    if (teile.has(s)) { var alt = teile.get(s); teile.delete(s); teile.set(s, alt); return alt; }
    var p = teilHolen(basis, v, i);
    p.catch(function () { teile.delete(s); });
    teile.set(s, p);
    while (teile.size > TEIL_MAX) teile.delete(teile.keys().next().value);
    return p;
  }

  async function antwort(req, id, basis) {
    var v;
    try { v = await eintrag(basis, id); } catch (e) { return new Response("Liste nicht erreichbar", { status: 503 }); }
    if (!v) return new Response("Kein solches Video", { status: 404 });
    var gesamt = v.teile.reduce(function (s, t) { return s + t.groesse; }, 0);
    var typ = { "Content-Type": "video/mp4", "Accept-Ranges": "bytes", "Cache-Control": "no-store" };
    var bereich = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get("range") || "");
    if (!bereich) {
      var n = 0;
      var strom = new ReadableStream({
        pull: async function (c) {
          if (n >= v.teile.length) { c.close(); return; }
          try { if (n + 1 < v.teile.length) teil(basis, v, n + 1).catch(function () {}); c.enqueue(await teil(basis, v, n)); n++; } catch (e) { c.error(e); }
        }
      });
      return new Response(strom, { status: 200, headers: Object.assign({ "Content-Length": String(gesamt) }, typ) });
    }
    var von, bis;
    if (bereich[1] === "") { von = Math.max(0, gesamt - Number(bereich[2] || 0)); bis = gesamt - 1; }
    else { von = Number(bereich[1]); bis = bereich[2] === "" ? gesamt - 1 : Math.min(Number(bereich[2]), gesamt - 1); }
    if (!(von < gesamt) || bis < von) {
      return new Response(null, { status: 416, headers: Object.assign({ "Content-Range": "bytes */" + gesamt }, typ) });
    }
    var i = 0, anfang = 0;
    while (von >= anfang + v.teile[i].groesse) { anfang += v.teile[i].groesse; i++; }
    bis = Math.min(bis, anfang + v.teile[i].groesse - 1);   /* höchstens bis ans Teil-Ende */
    var b;
    try { b = await teil(basis, v, i); } catch (e) { return new Response(String(e && e.message || e), { status: 502 }); }
    if (i + 1 < v.teile.length) teil(basis, v, i + 1).catch(function () {});   /* den nächsten schon holen */
    var stueck = b.subarray(von - anfang, bis - anfang + 1);
    return new Response(stueck, {
      status: 206,
      headers: Object.assign({ "Content-Range": "bytes " + von + "-" + bis + "/" + gesamt, "Content-Length": String(stueck.byteLength) }, typ)
    });
  }

  g.FPAbspielKern = { antwort: antwort, TEIL_MAX: TEIL_MAX };
})(self);
