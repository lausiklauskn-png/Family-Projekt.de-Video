/* Ladeschau — läuft, solange das Video lädt, und hört im selben Augenblick auf.
   Hintergrund: ein Mycel aus 15 Knoten (je geprüftem Teil leuchtet einer),
   darunter acht Bilder aus dem Film, je einmal. Im Vorschau-Fenster der Karte:
   jede App genau einmal, zwei echte Aufnahmen. Musik: der Titel aus dem Werbefilm in Schleife, Start mit dem Tipp.
   Art „bilder“ (start(fenster, "bilder")): nur Hintergrundbilder und Mycel, ohne App-Szenen und ohne Musik.
   Art „film“ (start(fenster, "film", filmAdresse)): erst der Vorschaufilm (stumm), dann die App-Szenen
   in Schleife, bis alle Teile geprüft sind; erst dann das Finale. Icons und Clips werden vorab geladen,
   eine Szene, deren Bild noch nicht bereit ist, wird übersprungen statt schwarz gezeigt.
   API: Ladeschau.start(fensterElement[, art[, film]]) · .teil(n, N) · .pause() · .ende() */
(function () {
  "use strict";
  var B = window.LADESCHAU_BASIS || "ls/";
  var RUHIG = matchMedia("(prefers-reduced-motion: reduce)").matches;

  var APPS = [
    ["rezeptbuch", "Mein Rezeptbuch", "Die KI erkennt ein Rezept vom Foto.", "#ffb547"],
    ["clip:rezeptbuch", "Mein Rezeptbuch", "Echt aufgenommen: Rezept ansehen, Zutaten, Schritte.", "#ffb547"],
    ["mixarium", "Mein Mixarium", "Das KI-Labor erfindet Rezepte nach deinem Geschmack.", "#ff6fae"],
    ["clip:mixarium", "Mein Mixarium", "Echt aufgenommen: vom Drink zur Bowl.", "#ff6fae"],
    ["bookledger-neu", "BookLedgerPro", "Beleg abfotografieren, die Texterkennung trägt die Zahlen ein.", "#5fe0b3"],
    ["wfpdf", "Workfloh PDF", "Behördenformular übersetzen, ausfüllen und zurück ins Original.", "#ff5a4f"],
    ["sende", "Sende-Prüfer", "Zeigt, was die KI sieht, bevor du etwas abschickst.", "#4fd1e8"],
    ["pruefer", "Auslieferungsprüfer", "Prüf es selbst: was in einer Datei steckt.", "#7aa2ff"],
    ["kimseek", "Kimseek", "Vergleicht den Sinn statt der Buchstaben.", "#c79bff"],
    ["kimboard", "Kimboard", "Die Pinnwand, sortiert nach Bedeutung.", "#9be15d"],
    ["privatbrain", "Private Brain", "Liest nur, schlägt vor, bewegt nichts.", "#ff9c6b"],
    ["mycel", "Mycel-Karte", "Macht das Netz der Apps sichtbar.", "#f2d16b"],
    ["kimbell", "Kim-Bell", "Ein Knopf verbindet die Apps, ganz ohne Server.", "#6be0ff"],
    ["point", "PWA Toolpoint", "Die Messwerte stehen offen da, auch die schlechten.", "#f2b544"],
    ["kimtool", "SB·KIMTool·Point", "Die Werkzeugkiste des Protokolls.", "#8fd3ff"],
    ["kimhubco", "Kim Hub Company", "Eine Werkstatt-Schicht, im eigenen Browser.", "#ffd36b"],
    ["tomy", "Tomys Hub", "Du gestaltest, wir drucken.", "#ff7ad9"],
    ["psbeauty", "Perfect Skin Beauty", "Studio und Kurse in Hamburg.", "#f7c6b2"]
  ];
  var BILDER = ["bg-mycel-gold", "bg-wald", "bg-netz", "bg-buch", "bg-kosmos-erde", "bg-tisch-weich", "bg-pilze", "bg-wirbel"];
  var T_INTRO = 5.2, T_APP = 4.4, T_CLIP = 5.4;

  var CSS = `
html.ls-an:root{--bg:#070b10;--bg2:#101921;--karte:rgba(16,24,32,.9);--linie:rgba(255,255,255,.12);--text:#eef4f6;--leise:#a9bcc6;--akzent:#5ad3cf;--akzent2:#a78bfa;--akzent3:#7c9cff;--petrol:#1b7f87;--glanz:#8fe4ea;--auf-akzent:#04161b;--warn:#f3b54a;--fehler:#ff8f7a;--ok-grund:rgba(90,211,207,.12);--kopf-grund:rgba(10,16,22,.82);--glow:0 0 22px rgba(90,211,207,.24),0 0 52px rgba(167,139,250,.14);--schatten:0 14px 36px rgba(0,0,0,.42),0 4px 10px rgba(0,0,0,.26);--holo-text:linear-gradient(100deg,#8fe4ea,#a9f4e6,#cfe0ff,#e6d4ff,#a9f4e6,#8fe4ea);--holo-rand:conic-gradient(from var(--rot),#5ad3cf,#7c9cff,#a78bfa,#8fe4ea,#1b7f87,#5ad3cf);color-scheme:dark}
html.ls-an body{background:#05080c}
html.ls-an .blatt{position:relative;z-index:1}
html.ls-an .einstieg{text-shadow:0 1px 3px #000,0 2px 18px #000c}
#ls-buehne{position:fixed;inset:0;z-index:0;pointer-events:none;overflow:hidden;opacity:0;transition:opacity 1.2s ease;background:#05080c}
#ls-buehne.da{opacity:1}
#ls-buehne.weg{opacity:0;transition:opacity .9s ease}
.ls-bild{position:absolute;inset:0;background-size:cover;background-position:center;opacity:0;transition:opacity 2.4s ease;visibility:hidden}
.ls-bild.an,.ls-bild.weg{visibility:visible;will-change:transform,opacity}
.ls-bild.an{opacity:.82}
.ls-bild.kb{animation:lsKen 24s linear forwards}
@keyframes lsKen{from{transform:scale(1.02)}to{transform:scale(1.08)}}
#ls-3d{position:absolute;inset:0;width:100%;height:100%;mix-blend-mode:screen}
.ls-vignette{position:absolute;inset:0;background:radial-gradient(120% 90% at 50% 40%,transparent 50%,#05080c99 100%),linear-gradient(180deg,#05080c66,transparent 25%,transparent 75%,#05080c80)}
.ls-korn{position:absolute;inset:0;opacity:.035;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")}
.vorschau.ls-fenster{position:relative;container-type:inline-size;background:#04070a}
.vorschau.ls-fenster>img{opacity:0;transition:opacity .5s}
.vorschau.ls-fenster[data-ls-art="bilder"]>img{opacity:1}
.vorschau>img{transition:opacity .9s}
.ls-kino{position:absolute;inset:0;overflow:hidden;color:#fff;font-family:"Bricolage Grotesque","Segoe UI",system-ui,sans-serif;perspective:900px;opacity:0;transition:opacity .6s}
.ls-kino.da{opacity:1}.ls-kino.weg{opacity:0;transition:opacity .9s}
.ls-kino::before{content:"";position:absolute;inset:0;background:radial-gradient(80% 110% at 22% 50%,var(--ak,#5fe0b3)33,transparent 60%),radial-gradient(70% 90% at 90% 110%,#1d3d6b66,transparent 70%),#04070a;transition:background 1s}
.ls-szene{position:absolute;inset:0;z-index:1;box-sizing:border-box;display:grid;grid-template-columns:auto minmax(0,1fr);align-items:center;gap:4cqw;padding:3.5cqw 6cqw;overflow:hidden}
.ls-szene.zentriert{grid-template-columns:1fr;text-align:center;justify-items:center}
.ls-ico{width:22cqw;aspect-ratio:1;border-radius:22%;box-shadow:0 2cqw 6cqw #000a,0 0 0 1px #ffffff22,0 0 8cqw var(--ak);transform-style:preserve-3d}
.ls-name{font-weight:700;font-size:clamp(20px,7.4cqw,64px);line-height:1;letter-spacing:-.01em;margin:0}
.ls-name .b{display:inline-block;white-space:pre}
.ls-zeile{font-family:"Atkinson Hyperlegible","Segoe UI",system-ui,sans-serif;font-size:clamp(13px,3.2cqw,26px);line-height:1.3;margin:1.6cqw 0 0;color:#e8f0f3;max-width:30ch;text-wrap:balance}
.ls-marke{font-family:"JetBrains Mono",ui-monospace,monospace;font-size:clamp(9px,1.7cqw,13px);letter-spacing:.18em;text-transform:uppercase;color:var(--ak);margin:0 0 1.4cqw}
.ls-linie{height:2px;width:0;background:linear-gradient(90deg,var(--ak),transparent);margin-top:2cqw}
.ls-telefon{height:42cqw;width:auto;max-height:100%;aspect-ratio:9/18.5;border-radius:4.2cqw;padding:.9cqw;background:linear-gradient(145deg,#2c3440,#0d1116);box-shadow:0 3cqw 8cqw #000c,0 0 0 1px #ffffff26,0 0 9cqw var(--ak);justify-self:center;transform-style:preserve-3d}
.ls-telefon video{width:100%;height:100%;object-fit:cover;border-radius:3.4cqw;display:block;background:#000}
.ls-szene.clip{grid-template-columns:auto 1fr;height:100%}
.ls-szene.clip .ls-name{font-size:clamp(17px,5.2cqw,46px)}
.ls-szene.clip .ls-zeile{font-size:clamp(12px,2.5cqw,20px)}
.ls-app{grid-template-columns:1fr;justify-items:center;align-content:center;text-align:center;gap:2.2cqw;padding:4cqw 6cqw}
.ls-app .ls-emb{position:relative;width:18cqw;aspect-ratio:1;max-width:100%}
.ls-app .ls-glow{position:absolute;inset:-26%;border-radius:50%;background:radial-gradient(circle,var(--ak) 0,transparent 66%);opacity:.55;mix-blend-mode:screen}
.ls-app .ls-ico{position:absolute;inset:0;width:100%;height:100%;box-shadow:0 1.4cqw 4cqw #000b,0 0 0 1px #ffffff26}
.ls-app .ls-name{font-size:clamp(16px,4.4cqw,38px);font-weight:600;color:#eef2f8}
.ls-app .ls-zeile{font-size:clamp(11px,2.3cqw,19px);margin:0;max-width:40ch;color:#d6e2e8}
.ls-app .ls-marke{margin:0}
.ls-bub{position:absolute;left:50%;top:50%;border-radius:50%;pointer-events:none;background:radial-gradient(circle at 32% 28%,rgba(255,255,255,.9) 0,rgba(255,255,255,.15) 18%,rgba(110,231,211,.08) 50%,rgba(167,139,250,.35) 92%,rgba(255,255,255,.5) 100%);mix-blend-mode:screen;opacity:0}
.ls-intro .ls-name{font-size:clamp(12px,7.4cqw,92px);max-width:100%}
.ls-intro .punkte{display:flex;gap:2.4cqw;justify-content:center;flex-wrap:wrap;margin-top:2.4cqw;font-family:"JetBrains Mono",ui-monospace,monospace;font-size:clamp(6px,2.1cqw,17px);letter-spacing:.06em;color:#cfe;text-transform:uppercase}
.ls-intro .punkte span{padding:.6cqw 1.6cqw;border:1px solid #ffffff33;border-radius:99px;background:#ffffff0d}
.ls-zaehler{position:absolute;right:2.4cqw;bottom:2cqw;font-family:"JetBrains Mono",ui-monospace,monospace;font-size:clamp(9px,1.6cqw,12px);color:#ffffffaa;letter-spacing:.1em;font-variant-numeric:tabular-nums}
#ls-musik{position:fixed;z-index:5;right:calc(16px + env(safe-area-inset-right,0px));bottom:calc(16px + env(safe-area-inset-bottom,0px));font:600 14px/1 "Atkinson Hyperlegible",system-ui,sans-serif;min-height:44px;padding:0 16px;border-radius:99px;border:1px solid #ffffff40;background:#0b1118cc;color:#eef4f6;-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);display:flex;align-items:center;gap:10px;cursor:pointer;transition:opacity .6s}
#ls-musik .eq{display:flex;gap:2px;align-items:flex-end;height:14px}
#ls-musik .eq i{display:block;width:3px;background:#5fe0b3;border-radius:1px;height:30%}
#ls-musik[aria-pressed="true"] .eq i{animation:lsEq .7s ease-in-out infinite alternate}
#ls-musik .eq i:nth-child(2){animation-delay:-.25s}#ls-musik .eq i:nth-child(3){animation-delay:-.5s}
@keyframes lsEq{from{height:20%}to{height:100%}}
#ls-musik.weg{opacity:0;pointer-events:none}
#ls-musik:focus-visible{outline:3px solid #f2b544;outline-offset:3px}
.ls-film{position:absolute;inset:0;z-index:1;background:#04070a}
.ls-film video{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block}
.ls-film .ls-marke{position:absolute;left:2.4cqw;top:2cqw;margin:0;padding:.5cqw 1.4cqw;border-radius:99px;background:#04070acc}
.ls-scan{position:absolute;z-index:2;pointer-events:none;opacity:0;background:linear-gradient(90deg,transparent,var(--ak,#5fe0b3),#fff,var(--ak,#5fe0b3),transparent);box-shadow:0 0 18px var(--ak,#5fe0b3);mix-blend-mode:screen}
.ls-scan.quer{left:0;right:0;height:3px;top:0}
.ls-scan.hoch{top:0;bottom:0;width:3px;left:0;background:linear-gradient(180deg,transparent,var(--ak,#5fe0b3),#fff,var(--ak,#5fe0b3),transparent)}
#ls-buehne.ls-film-art .ls-bild.an{opacity:.82}
@keyframes lsZoomRein{from{transform:scale(1.02)}to{transform:scale(1.12)}}
@keyframes lsZoomRaus{from{transform:scale(1.12)}to{transform:scale(1.02)}}
@keyframes lsSchwenkL{from{transform:scale(1.1) translateX(3%)}to{transform:scale(1.1) translateX(-3%)}}
@keyframes lsSchwenkR{from{transform:scale(1.1) translateX(-3%)}to{transform:scale(1.1) translateX(3%)}}
@keyframes lsDreh{from{transform:scale(1.12) rotate(-1.2deg)}to{transform:scale(1.12) rotate(1.2deg)}}
@keyframes lsHeben{from{transform:scale(1.1) translateY(2.5%)}to{transform:scale(1.1) translateY(-2.5%)}}
@media (prefers-reduced-motion:reduce){.ls-bild.kb,.ls-korn,#ls-musik .eq i{animation:none!important}}
`;

  // ---------- Hilfen ----------
  function el(tag, cls, kinder) { var e = document.createElement(tag); if (cls) e.className = cls; (kinder || []).forEach(function (k) { e.appendChild(typeof k === "string" ? document.createTextNode(k) : k); }); return e; }
  function ani(e, frames, o) { if (RUHIG) { frames = [{ opacity: 0 }, { opacity: 1 }]; o = Object.assign({}, o, { duration: 400 }); } return e.animate(frames, Object.assign({ fill: "both", easing: "cubic-bezier(.2,.8,.2,1)" }, o)); }
  function buchstaben(text) { var h = el("h3", "ls-name"); text.split(/(\s+)/).forEach(function (w) { if (!w) return; var s = el("span", "b", [w]); h.appendChild(s); }); return h; }
  var store = { get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} } };

  // ---------- Zustand ----------
  var S = null;

  function aufbauen(fenster) {
    if (!document.getElementById("ls-css")) { var st = el("style"); st.id = "ls-css"; st.textContent = CSS; document.head.appendChild(st); }
    var buehne = el("div"); buehne.id = "ls-buehne"; buehne.setAttribute("aria-hidden", "true");
    var bilder = BILDER.map(function (n) { var d = el("div", "ls-bild"); d.style.backgroundImage = "url(" + B + n + ".jpg)"; buehne.appendChild(d);
      // vorab entschlüsseln, sonst geschieht es beim Überblenden mitten im Laden (Ruckeln)
      var im = new Image(); im.src = B + n + ".jpg"; if (im.decode) im.decode().catch(function () {}); d._vorab = im; return d; });
    var cv = el("canvas"); cv.id = "ls-3d"; buehne.appendChild(cv);
    buehne.appendChild(el("div", "ls-vignette")); if (!RUHIG) buehne.appendChild(el("div", "ls-korn"));
    document.body.insertBefore(buehne, document.body.firstChild);

    var musik = document.getElementById("ls-musik");
    if (!musik) {
      musik = el("button"); musik.id = "ls-musik"; musik.type = "button";
      var eq = el("span", "eq", [el("i"), el("i"), el("i")]); var t = el("span", "t");
      musik.appendChild(eq); musik.appendChild(t); document.body.appendChild(musik);
      musik.addEventListener("click", function () { if (S) { S.ton.schalten(); musikText(); } });
    }
    musik.classList.remove("weg");

    var kino = el("div", "ls-kino"); kino.setAttribute("aria-hidden", "true");
    var zaehler = el("div", "ls-zaehler"); kino.appendChild(zaehler);
    fenster.classList.add("ls-fenster"); fenster.appendChild(kino);
    document.documentElement.classList.add("ls-an");
    requestAnimationFrame(function () { buehne.classList.add("da"); kino.classList.add("da"); });
    return { buehne: buehne, bilder: bilder, cv: cv, musik: musik, kino: kino, zaehler: zaehler, fenster: fenster };
  }

  // ---------- Szenen im Fenster ----------
  function szeneIntro(kino) {
    var sz = el("div", "ls-szene zentriert ls-intro");
    sz.appendChild(el("p", "ls-marke", ["Werbefilm lädt · gleich da"]));
    var n = buchstaben("family-projekt.de"); sz.appendChild(n);
    var p = el("div", "punkte", [el("span", "", ["Kostenlos"]), el("span", "", ["Ohne Konto"]), el("span", "", ["Offline nutzbar"])]);
    sz.appendChild(p); kino.style.setProperty("--ak", "#5fe0b3"); kino.insertBefore(sz, kino.lastChild);
    ani(n, [{ opacity: 0, transform: "translateY(30%) scale(.92)", filter: "blur(12px)" }, { opacity: 1, transform: "none", filter: "blur(0)" }], { duration: 1100 });
    Array.prototype.forEach.call(p.children, function (c, i) { ani(c, [{ opacity: 0, transform: "translateY(40%)" }, { opacity: 1, transform: "none" }], { duration: 600, delay: 800 + i * 220 }); });
    return sz;
  }
  function szeneApp(kino, a, idx) {
    kino.style.setProperty("--ak", a[3]);
    var clip = a[0].indexOf("clip:") === 0, sz;
    if (clip) {
      sz = el("div", "ls-szene clip");
      var tel = el("div", "ls-telefon"), v = el("video");
      v.muted = true; v.playsInline = true; v.setAttribute("playsinline", ""); v.loop = true; v.preload = "auto"; v.src = B + "clip-" + a[0].slice(5) + ".mp4";
      tel.appendChild(v); sz.appendChild(tel);
      var tx = el("div", "", [el("p", "ls-marke", ["Aus der App"]), buchstaben(a[1]), el("p", "ls-zeile", [a[2]]), el("div", "ls-linie")]);
      sz.appendChild(tx);
      kino.insertBefore(sz, kino.lastChild);
      v.play().catch(function () {});
      ani(tel, [{ opacity: 0, transform: "translateX(-8%) rotateY(28deg) rotateZ(-4deg) scale(.9)" }, { opacity: 1, transform: "rotateY(-8deg) rotateZ(0)" }], { duration: 1000 });
      if (!RUHIG) tel.animate([{ transform: "rotateY(-8deg)" }, { transform: "rotateY(6deg) translateY(-2%)" }], { duration: T_CLIP * 1000, delay: 1000, fill: "forwards", easing: "ease-in-out" });
      eintreten(tx, idx);
    } else {
      sz = el("div", "ls-szene ls-app");
      var emb = el("div", "ls-emb"), glow = el("div", "ls-glow");
      var ico = el("img", "ls-ico"); ico.src = B + a[0] + ".webp"; ico.alt = ""; ico.width = 192; ico.height = 192;
      emb.appendChild(glow); emb.appendChild(ico); sz.appendChild(emb);
      var marke = el("p", "ls-marke", ["App · family-projekt.de"]), name = el("h3", "ls-name", [a[1]]), zeile = el("p", "ls-zeile", [a[2]]);
      sz.appendChild(marke); sz.appendChild(name); sz.appendChild(zeile);
      kino.insertBefore(sz, kino.lastChild);
      // wie im Werbefilm: Leuchten wächst, Symbol blendet weich ein, Beschriftung steigt nach
      ani(glow, [{ opacity: 0, transform: "scale(.3)" }, { opacity: .55, transform: "scale(1)" }], { duration: 600, easing: "cubic-bezier(.25,.8,.3,1)" });
      ani(ico, [{ opacity: 0, transform: "scale(.96)" }, { opacity: 1, transform: "scale(1)" }], { duration: 380, delay: 120, easing: "ease-out" });
      ani(marke, [{ opacity: 0, letterSpacing: ".5em" }, { opacity: 1, letterSpacing: ".18em" }], { duration: 500, delay: 260 });
      ani(name, [{ opacity: 0, transform: "translateY(40%)" }, { opacity: 1, transform: "none" }], { duration: 420, delay: 340 });
      ani(zeile, [{ opacity: 0, transform: "translateY(30%)" }, { opacity: 1, transform: "none" }], { duration: 480, delay: 520 });
      if (!RUHIG) {
        ico.animate([{ transform: "scale(1)" }, { transform: "scale(1.035)" }], { duration: T_APP * 1000, delay: 500, fill: "forwards", easing: "ease-in-out" });
        glow.animate([{ opacity: .55 }, { opacity: .3 }, { opacity: .55 }], { duration: 2400, delay: 600, iterations: Infinity, easing: "ease-in-out" });
        blasen(sz, emb, a[0].length + idx);
      }
    }
    return sz;
  }
  // Bläschen aus der Mitte des Symbols: platzen heraus, steigen auf, verblassen (wie Szene E im Werbefilm)
  function blasen(sz, emb, saat) {
    var w = sz.clientWidth || 600, r = emb.getBoundingClientRect(), q = sz.getBoundingClientRect();
    var cx = r.left - q.left + r.width / 2, cy = r.top - q.top + r.height / 2;
    var x = saat * 9301 + 49297; function rnd() { x = (x * 9301 + 49297) % 233280; return x / 233280; }
    for (var i = 0; i < 16; i++) {
      var g = w * (.012 + rnd() * .03), b = el("div", "ls-bub");
      b.style.width = b.style.height = g + "px"; b.style.left = (cx - g / 2) + "px"; b.style.top = (cy - g / 2) + "px";
      sz.appendChild(b);
      var wink = rnd() * Math.PI * 2, weit = w * (.12 + rnd() * .2), dx = Math.cos(wink) * weit, dy = Math.sin(wink) * weit * .7, auf = w * (.06 + rnd() * .08);
      b.animate([
        { opacity: 0, transform: "translate(0,0) scale(.2)" },
        { opacity: .95, transform: "translate(" + dx + "px," + dy + "px) scale(1)", offset: .35 },
        { opacity: 0, transform: "translate(" + (dx * 1.08) + "px," + (dy - auf) + "px) scale(1.06)" }
      ], { duration: 2600 + rnd() * 900, delay: 80 + rnd() * 260, fill: "both", easing: "cubic-bezier(.16,1,.3,1)" });
    }
  }
  function eintreten(tx, idx) {
    var marke = tx.children[0], name = tx.children[1], zeile = tx.children[2], linie = tx.children[3];
    ani(marke, [{ opacity: 0, letterSpacing: ".6em" }, { opacity: 1, letterSpacing: ".18em" }], { duration: 700, delay: 150 });
    var bs = name.querySelectorAll(".b"), stil = idx % 3;
    Array.prototype.forEach.call(bs, function (b, i) {
      var f = stil === 0 ? [{ opacity: 0, transform: "translateY(70%) rotateX(-80deg)" }, { opacity: 1, transform: "none" }]
            : stil === 1 ? [{ opacity: 0, transform: "translateX(-30%) skewX(-18deg)", filter: "blur(8px)" }, { opacity: 1, transform: "none", filter: "blur(0)" }]
            : [{ opacity: 0, transform: "scale(.4)" }, { opacity: 1, transform: "scale(1)" }];
      ani(b, f, { duration: 650, delay: 250 + i * 110, easing: "cubic-bezier(.2,1.3,.3,1)" });
    });
    ani(zeile, [{ opacity: 0, transform: "translateY(25%)", clipPath: "inset(0 100% 0 0)" }, { opacity: 1, transform: "none", clipPath: "inset(0 0 0 0)" }], { duration: 900, delay: 650 });
    ani(linie, [{ width: "0" }, { width: "60%" }], { duration: 1200, delay: 900 });
  }
  function szeneFinale(kino) {
    var sz = el("div", "ls-szene zentriert ls-intro");
    sz.appendChild(el("p", "ls-marke", ["Alle Apps an einem Ort"]));
    var n = buchstaben("Gleich ist dein Film da."); sz.appendChild(n);
    sz.appendChild(el("p", "ls-zeile", ["Bis dahin: family-projekt.de, Apps, die bei dir bleiben."]));
    kino.style.setProperty("--ak", "#5fe0b3"); kino.insertBefore(sz, kino.lastChild);
    eintreten({ children: [sz.children[0], n, sz.children[2], el("div")] }, 1);
    return sz;
  }
  function wegmit(sz) {
    if (!sz) return;
    sz.style.zIndex = "0"; sz.style.pointerEvents = "none";
    if (sz.classList.contains("ls-app") && !RUHIG) { var ic = sz.querySelector(".ls-emb"); if (ic) ic.animate([{ transform: "scale(1)" }, { transform: "scale(1.04)" }], { duration: 300, fill: "forwards" }); }
    var a = RUHIG ? sz.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 350, fill: "forwards" })
                  : sz.animate([{ opacity: 1, transform: "none", filter: "blur(0)" }, { opacity: 0, transform: "translateX(-5%) scale(.97)", filter: "blur(6px)", offset: .7 }, { opacity: 0, transform: "translateX(-6%) scale(.96)", filter: "blur(8px)" }], { duration: 320, fill: "forwards", easing: "ease-in" });
    a.onfinish = function () { sz.remove(); };
  }

  // ---------- Musik: der Titel aus dem Werbefilm (67,5 s), in Schleife, bis das Laden endet ----------
  function Ton() {
    var AC = window.AudioContext || window.webkitAudioContext, ctx = null, gain = null, ana = null, buf = null, au = null;
    var an = store.get("ladeschau_musik") !== "aus", gestoppt = false, LAUT = .7;
    function init() {
      if (au) return true;
      au = new Audio(B + "musik.mp3"); au.preload = "auto"; au.loop = true;
      if (AC) {
        try {
          ctx = new AC(); var src = ctx.createMediaElementSource(au);
          gain = ctx.createGain(); gain.gain.value = 0;
          ana = ctx.createAnalyser(); ana.fftSize = 256; buf = new Uint8Array(ana.frequencyBinCount);
          src.connect(gain); gain.connect(ana); ana.connect(ctx.destination);
        } catch (e) { ctx = null; gain = null; ana = null; }
      }
      if (!gain) au.volume = 0;
      return true;
    }
    function rampe(ziel, sek) {
      if (gain) { var t = ctx.currentTime; gain.gain.cancelScheduledValues(t); gain.gain.setValueAtTime(gain.gain.value, t); gain.gain.linearRampToValueAtTime(ziel, t + sek); return; }
      if (!au) return; var von = au.volume, t0 = performance.now();
      (function schritt() { var p = Math.min(1, (performance.now() - t0) / (sek * 1000)); au.volume = Math.max(0, Math.min(1, von + (ziel - von) * p)); if (p < 1) setTimeout(schritt, 40); })();
    }
    return {
      start: function () {
        init(); gestoppt = false;
        if (ctx && ctx.state === "suspended") ctx.resume();
        if (an) { var p = au.play(); if (p && p.catch) p.catch(function () {}); }
        this.lautst();
      },
      lautst: function () { if (!au) return; rampe(an && !gestoppt ? LAUT : 0, an ? 1.2 : .3); if (an && !gestoppt && au.paused && !au.ended) { var p = au.play(); if (p && p.catch) p.catch(function () {}); } },
      fortschritt: function () {},
      schalten: function () { an = !an; store.set("ladeschau_musik", an ? "an" : "aus"); if (an) this.start(); else this.lautst(); return an; },
      istAn: function () { return an; },
      halt: function (sanft) { gestoppt = true; if (!au) return; rampe(0, sanft ? 1.2 : .3); var a = au; setTimeout(function () { if (gestoppt) a.pause(); }, sanft ? 1300 : 350); },
      puls: function () {
        if (!ana || !au || au.paused) return 0;
        ana.getByteFrequencyData(buf); var s = 0; for (var i = 1; i < 8; i++) s += buf[i];
        return Math.min(1, Math.max(0, (s / 7 - 90) / 120));
      },
      schliessen: function () { var c = ctx, a = au; setTimeout(function () { try { a.pause(); a.removeAttribute("src"); a.load(); } catch (e) {} au = null; if (c) { ctx = null; try { c.close(); } catch (e) {} } }, 1500); }
    };
  }

  // ---------- 3D-Mycel ----------
  function Mycel(cv) {
    var THREE = window.THREE; if (!THREE) return null;
    var r; try { r = new THREE.WebGLRenderer({ canvas: cv, alpha: true, antialias: true }); } catch (e) { return null; }
    r.setPixelRatio(Math.min(devicePixelRatio || 1, 1.25));
    var sc = new THREE.Scene(), cam = new THREE.PerspectiveCamera(55, 1, .1, 200); cam.position.set(0, 0, 17);
    var gruppe = new THREE.Group(); sc.add(gruppe);
    var tc = document.createElement("canvas"); tc.width = tc.height = 64; var g = tc.getContext("2d");
    var rg = g.createRadialGradient(32, 32, 0, 32, 32, 32); rg.addColorStop(0, "rgba(255,255,255,1)"); rg.addColorStop(.25, "rgba(255,255,255,.6)"); rg.addColorStop(1, "rgba(255,255,255,0)"); g.fillStyle = rg; g.fillRect(0, 0, 64, 64);
    var tex = new THREE.CanvasTexture(tc);
    // Staub
    var nS = 900, pos = new Float32Array(nS * 3); for (var i = 0; i < nS; i++) { var rr = 6 + Math.random() * 26, th = Math.random() * 6.283, ph = Math.acos(Math.random() * 2 - 1); pos[i * 3] = rr * Math.sin(ph) * Math.cos(th); pos[i * 3 + 1] = rr * Math.sin(ph) * Math.sin(th) * .6; pos[i * 3 + 2] = rr * Math.cos(ph); }
    var sg = new THREE.BufferGeometry(); sg.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    var staub = new THREE.Points(sg, new THREE.PointsMaterial({ size: .16, map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: 0x8fe8d0, opacity: .55 })); sc.add(staub);
    // 15 Knoten auf einer Spirale
    var K = [], farben = [0x5fe0b3, 0xf2b544, 0x7aa2ff, 0xff6fae, 0xc79bff];
    for (var k = 0; k < 15; k++) {
      var y = 1 - (k / 14) * 2, rad = Math.sqrt(1 - y * y), a = k * 2.39996;
      var p = new THREE.Vector3(Math.cos(a) * rad * 6.2, y * 4.6, Math.sin(a) * rad * 6.2);
      var sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: farben[k % 5], transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: .22 }));
      sp.position.copy(p); sp.scale.setScalar(.7); gruppe.add(sp);
      K.push({ p: p, sp: sp, an: 0, t: 0, farbe: farben[k % 5] });
    }
    // Hyphen: wachsen zum nächsten leuchtenden Knoten, mit Zwischenpunkten
    var faeden = [];
    function faden(a, b, farbe) {
      var mitte = a.clone().add(b).multiplyScalar(.5).add(new THREE.Vector3((Math.random() - .5) * 3, (Math.random() - .5) * 3, (Math.random() - .5) * 3));
      var kurve = new THREE.QuadraticBezierCurve3(a, mitte, b), pts = kurve.getPoints(48);
      var geo = new THREE.BufferGeometry().setFromPoints(pts); geo.setDrawRange(0, 0);
      var ln = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: farbe, transparent: true, opacity: .7, blending: THREE.AdditiveBlending }));
      gruppe.add(ln); faeden.push({ ln: ln, t: 0, n: pts.length, kurve: kurve, funke: null });
      var f = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); f.scale.setScalar(.6); gruppe.add(f); faeden[faeden.length - 1].funke = f;
    }
    var maus = { x: 0, y: 0 }; function zeiger(e) { maus.x = e.clientX / innerWidth - .5; maus.y = e.clientY / innerHeight - .5; }
    addEventListener("pointermove", zeiger, { passive: true });
    function groesse() { var w = innerWidth, h = innerHeight; r.setSize(w, h, false); cam.aspect = w / h; cam.position.z = w < 600 ? 22 : 17; cam.updateProjectionMatrix(); }
    groesse(); addEventListener("resize", groesse);
    var zuletzt = performance.now(), winkel = 0;
    return {
      zuendet: function (n) {
        for (var i = 0; i < Math.min(n, 15); i++) {
          if (K[i].an) continue; K[i].an = 1; K[i].t = 0;
          var nah = null, best = 1e9; for (var j = 0; j < i; j++) { var d = K[i].p.distanceTo(K[j].p); if (d < best) { best = d; nah = K[j]; } }
          if (nah) faden(nah.p, K[i].p, K[i].farbe);
          if (i > 3 && Math.random() < .6) { var z = K[Math.floor(Math.random() * i)]; if (z !== nah) faden(z.p, K[i].p, K[i].farbe); }
        }
      },
      bild: function (puls, ende) {
        var jetzt = performance.now(), dt = Math.min(.05, (jetzt - zuletzt) / 1000); zuletzt = jetzt;
        if (!RUHIG) winkel += dt * .09;
        gruppe.rotation.y = winkel + maus.x * .5; gruppe.rotation.x = Math.sin(winkel * .7) * .18 + maus.y * .3;
        staub.rotation.y = -winkel * .4;
        K.forEach(function (k) {
          if (k.an) { k.t = Math.min(1, k.t + dt * 1.5); var s = .7 + k.t * 1.6 + puls * .9; k.sp.scale.setScalar(s); k.sp.material.opacity = .45 + k.t * .45 + puls * .1; }
          else { k.sp.material.opacity = .18 + puls * .08; }
        });
        faeden.forEach(function (f) {
          if (f.t < 1) { f.t = Math.min(1, f.t + dt * (RUHIG ? 4 : .9)); f.ln.geometry.setDrawRange(0, Math.ceil(f.n * f.t)); f.funke.position.copy(f.kurve.getPoint(f.t)); f.funke.material.opacity = 1 - f.t * .2; }
          else if (f.funke.visible) { f.funke.material.opacity -= dt * 1.5; if (f.funke.material.opacity <= 0) f.funke.visible = false; }
          f.ln.material.opacity = .45 + puls * .3;
        });
        r.render(sc, cam);
      },
      weg: function () { removeEventListener("pointermove", zeiger); removeEventListener("resize", groesse); try { r.dispose(); } catch (e) {} }
    };
  }
  function ladeThree() {
    return new Promise(function (ok) {
      if (window.THREE) return ok();
      var s = document.createElement("script"); s.src = "https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js";
      s.onload = function () { ok(); }; s.onerror = function () { ok(); }; document.head.appendChild(s);
    });
  }

  // ---------- Vorschaufilm: vorab laden, Film-Szene, Aufdeck-Arten, wechselnde Hintergründe ----------
  // Scanner (Klaus 2026-10-02): höchstens EINER je Hintergrundbild, abwechselnd ↓ oder ←;
  // jede weitere Szene auf demselben Bild wird nur überblendet
  var SCAN_ARTEN = ["runter", "links"];
  var BEWEGUNG = ["lsZoomRein", "lsSchwenkL", "lsZoomRaus", "lsDreh", "lsSchwenkR", "lsHeben"];
  var UEBERGANG = ["blende", "wisch", "kreis"];
  var T_BILD = 7.5;

  function vorabLaden() {
    var ico = {}, clip = {};
    APPS.forEach(function (a) {
      if (a[0].indexOf("clip:") === 0) {
        var name = a[0].slice(5); if (clip[name]) return;
        var v = document.createElement("video");
        v.muted = true; v.playsInline = true; v.setAttribute("playsinline", ""); v.loop = true; v.preload = "auto";
        v.src = B + "clip-" + name + ".mp4"; try { v.load(); } catch (e) {}
        clip[name] = v;
      } else if (!ico[a[0]]) {
        var im = el("img", "ls-ico"); im.alt = ""; im.width = 192; im.height = 192; im.decoding = "sync"; im.src = B + a[0] + ".webp";
        im._bereit = false; var fertig = function () { im._bereit = !!im.naturalWidth; };
        if (im.decode) im.decode().then(fertig, function () {}); else im.onload = fertig;
        ico[a[0]] = im;
      }
    });
    return { ico: ico, clip: clip };
  }
  // bereit = Bild entschlüsselt bzw. erstes Videobild da; sonst wird die Szene übersprungen
  function bereit(a) {
    if (!S || !S.vorab) return false;
    if (a[0].indexOf("clip:") === 0) { var v = S.vorab.clip[a[0].slice(5)]; return !!v && v.readyState >= 2; }
    var im = S.vorab.ico[a[0]]; return !!im && im._bereit;
  }
  function szeneFilm(kino, adresse, poster) {
    var sz = el("div", "ls-film"), v = el("video");
    v.muted = true; v.playsInline = true; v.setAttribute("playsinline", ""); v.preload = "auto";
    if (poster) v.poster = poster;
    v.src = adresse;
    sz.appendChild(v); sz.appendChild(el("p", "ls-marke", ["Vorschaufilm · stumm"]));
    kino.style.setProperty("--ak", "#5fe0b3"); kino.insertBefore(sz, kino.lastChild);
    var meins = S;
    v.addEventListener("playing", function () { if (meins.filmLage === "laedt") meins.filmLage = "laeuft"; });
    v.addEventListener("ended", function () { meins.filmLage = "fertig"; });
    v.addEventListener("error", function () { meins.filmLage = "fehler"; });
    var p = v.play(); if (p && p.catch) p.catch(function () {});
    S.filmVideo = v;
    return sz;
  }
  // App-Szene im Film-Modus: dieselbe Gestalt, aber mit vorab geladenem Symbol bzw. Clip
  function szeneAppVorab(kino, a, idx, art) {
    kino.style.setProperty("--ak", a[3]);
    var clip = a[0].indexOf("clip:") === 0, sz;
    if (clip) {
      sz = el("div", "ls-szene clip");
      var tel = el("div", "ls-telefon"), v = S.vorab.clip[a[0].slice(5)];
      try { v.currentTime = 0; } catch (e) {}
      tel.appendChild(v); sz.appendChild(tel);
      var tx = el("div", "", [el("p", "ls-marke", ["Aus der App"]), buchstaben(a[1]), el("p", "ls-zeile", [a[2]]), el("div", "ls-linie")]);
      sz.appendChild(tx); kino.insertBefore(sz, kino.lastChild);
      var p = v.play(); if (p && p.catch) p.catch(function () {});
      eintreten(tx, idx);
    } else {
      sz = el("div", "ls-szene ls-app");
      var emb = el("div", "ls-emb"), glow = el("div", "ls-glow"), ico = S.vorab.ico[a[0]];
      ico.getAnimations().forEach(function (x) { x.cancel(); });
      emb.appendChild(glow); emb.appendChild(ico); sz.appendChild(emb);
      var marke = el("p", "ls-marke", ["App · family-projekt.de"]), name = el("h3", "ls-name", [a[1]]), zeile = el("p", "ls-zeile", [a[2]]);
      sz.appendChild(marke); sz.appendChild(name); sz.appendChild(zeile);
      kino.insertBefore(sz, kino.lastChild);
      ani(glow, [{ opacity: 0, transform: "scale(.3)" }, { opacity: .55, transform: "scale(1)" }], { duration: 600 });
      ani(marke, [{ opacity: 0, letterSpacing: ".5em" }, { opacity: 1, letterSpacing: ".18em" }], { duration: 500, delay: 260 });
      ani(name, [{ opacity: 0, transform: "translateY(40%)" }, { opacity: 1, transform: "none" }], { duration: 420, delay: 340 });
      ani(zeile, [{ opacity: 0, transform: "translateY(30%)" }, { opacity: 1, transform: "none" }], { duration: 480, delay: 520 });
      if (!RUHIG) blasen(sz, emb, a[0].length + idx);
    }
    aufdecken(kino, sz, art);
    return sz;
  }
  // Aufdecken: mit Scanner-Linie (↓ oder ←) oder nur Überblenden
  function aufdecken(kino, sz, art) {
    var D = RUHIG ? 400 : 900, von, bis = "inset(0 0 0 0)", scan = null, bahn = null;
    if (RUHIG || art === "blende") { sz.animate([{ opacity: 0 }, { opacity: 1 }], { duration: D, fill: "both", easing: "ease-out" }); return; }
    if (art === "runter") { von = "inset(0 0 100% 0)"; scan = "quer"; bahn = [{ top: "0%" }, { top: "100%" }]; }
    else { von = "inset(0 0 0 100%)"; scan = "hoch"; bahn = [{ left: "100%" }, { left: "0%" }]; }
    sz.animate([{ clipPath: von }, { clipPath: bis }], { duration: D, fill: "both", easing: "cubic-bezier(.45,0,.2,1)" });
    var s = el("div", "ls-scan " + scan); kino.insertBefore(s, kino.lastChild);
    if (S) S.scans.push({ bild: S.bildZaehler, art: art });
    var an = s.animate(bahn.map(function (x) { return Object.assign({ opacity: 1 }, x); }), { duration: D, easing: "cubic-bezier(.45,0,.2,1)" });
    an.onfinish = function () { s.remove(); };
  }
  // Hintergrund im Film-Modus: Schleife über alle Bilder, wechselnde Bewegung und wechselnder Übergang
  function filmBild(nr) {
    var d = S.d.bilder, neu = d[nr % d.length], alt = S.bildNr >= 0 ? d[S.bildNr] : null;
    var bew = BEWEGUNG[nr % BEWEGUNG.length], ueb = UEBERGANG[nr % UEBERGANG.length];
    if (alt && alt !== neu) { alt.classList.add("weg"); alt.classList.remove("an"); (function (a) { setTimeout(function () { if (!a.classList.contains("an")) { a.classList.remove("weg"); a.style.animation = ""; } }, 2600); })(alt); }
    neu.style.animation = RUHIG ? "" : bew + " " + (T_BILD + 3) + "s ease-in-out forwards";
    neu.classList.add("an"); S.bildNr = nr % d.length; S.bildArt = bew + "/" + ueb;
    if (!RUHIG && ueb !== "blende") {
      var von = ueb === "wisch" ? "inset(0 100% 0 0)" : "circle(0% at 50% 50%)", bis = ueb === "wisch" ? "inset(0 0 0 0)" : "circle(75% at 50% 50%)";
      neu.animate([{ clipPath: von }, { clipPath: bis }], { duration: 2400, easing: "ease-in-out" });
    }
  }
  function filmTakt() {
    var t = S.zeit;
    // Hintergrund wiederholt sich, solange geladen wird
    var b = Math.floor(t / T_BILD);
    if (b !== S.bildZaehler) { S.bildZaehler = b; filmBild(b); }
    if (S.alle) {
      if (!S.finaleDa) { if (S.filmVideo) { try { S.filmVideo.pause(); } catch (e) {} } wegmit(S.szene); S.szene = szeneFinale(S.d.kino); S.szeneNr = APPS.length; S.finaleDa = true; }
      return;
    }
    if (S.szeneNr === -3) {
      // Film: weiter, wenn er endet, scheitert oder nach 12 s noch nicht läuft
      var stockt = S.filmLage === "laedt" && t - S.szeneAb > 12;
      if (S.filmLage === "fertig" || S.filmLage === "fehler" || stockt) { if (stockt) S.filmLage = "fehler"; naechsteApp(t); }
      return;
    }
    if (t >= S.bis) naechsteApp(t);
  }
  function naechsteApp(t) {
    for (var versuch = 0; versuch < APPS.length; versuch++) {
      S.appZeiger++;
      var i = S.appZeiger % APPS.length;
      if (i === 0 && S.appZeiger > 0) S.runde++;
      var a = APPS[i];
      if (!bereit(a)) { S.uebersprungen++; continue; }
      var art = "blende";
      if (S.scanBild !== S.bildZaehler) { S.scanBild = S.bildZaehler; art = SCAN_ARTEN[S.aufdeckZaehler++ % SCAN_ARTEN.length]; }
      wegmit(S.szene); S.szeneNr = i; S.aufdeck = art;
      S.szene = szeneAppVorab(S.d.kino, a, i, art);
      S.bis = t + (a[0].indexOf("clip:") === 0 ? T_CLIP : T_APP);
      return;
    }
    S.bis = t + 0.5;   // noch nichts bereit: kurz warten, das Bild bleibt stehen
  }

  // ---------- Ablauf ----------
  function musikText() { if (!S) return; var an = S.ton.istAn(); S.d.musik.setAttribute("aria-pressed", an ? "true" : "false"); S.d.musik.querySelector(".t").textContent = an ? "Musik aus" : "Musik an"; S.d.musik.setAttribute("aria-label", an ? "Musik ausschalten" : "Musik einschalten"); }

  // Zeitpunkt, an dem das Finale beginnt (Intro + alle Apps)
  function finaleZeit() { var f = T_INTRO; APPS.forEach(function (a) { f += a[0].indexOf("clip:") === 0 ? T_CLIP : T_APP; }); return f; }

  function takt() {
    if (!S || S.zu) return;
    var jetzt = performance.now();
    if (!S.pausiert) S.zeit += (jetzt - S.letzt) / 1000 * S.tempo; S.letzt = jetzt;
    var t = S.zeit;
    if (S.film) { filmTakt(); if (S.mycel) S.mycel.bild(S.pausiert ? 0 : S.ton.puls()); S.raf = requestAnimationFrame(takt); return; }
    // Szene im Fenster
    var soll = -1, acc = T_INTRO;
    if (t >= T_INTRO) { soll = APPS.length; for (var i = 0; i < APPS.length; i++) { var d = APPS[i][0].indexOf("clip:") === 0 ? T_CLIP : T_APP; if (t < acc + d) { soll = i; break; } acc += d; } }
    if (!S.nurBilder && soll !== S.szeneNr) {
      wegmit(S.szene); S.szeneNr = soll;
      S.szene = soll === -1 ? szeneIntro(S.d.kino) : soll === APPS.length ? szeneFinale(S.d.kino) : szeneApp(S.d.kino, APPS[soll], soll);
    }
    // Bild im Hintergrund, jedes genau einmal, das letzte bleibt
    var b = Math.min(BILDER.length - 1, Math.floor(t / S.finale * BILDER.length));
    if (b !== S.bildNr) { if (S.bildNr >= 0) { var alt = S.d.bilder[S.bildNr]; alt.classList.add("weg"); alt.classList.remove("an"); setTimeout(function () { if (!alt.classList.contains("an")) alt.classList.remove("weg", "kb"); }, 2600); } S.bildNr = b; var bb = S.d.bilder[b]; bb.classList.add("an"); if (!RUHIG) bb.classList.add("kb"); }
    if (S.mycel) S.mycel.bild(S.pausiert ? 0 : S.ton.puls());
    S.raf = requestAnimationFrame(takt);
  }

  window.Ladeschau = {
    start: function (fenster, art, film) {
      var nurBilder = art === "bilder", mitFilm = art === "film" && typeof film === "string" && /^videos\/[a-z0-9-]+\/vorschau\.mp4$/.test(film);
      if (S && !S.zu && S.d.fenster === fenster) { S.pausiert = false; S.letzt = performance.now(); if (!S.nurBilder) { S.ton.start(); musikText(); } if (S.filmVideo && S.filmLage !== "fertig" && S.filmLage !== "fehler") { var pp = S.filmVideo.play(); if (pp && pp.catch) pp.catch(function () {}); } return; }
      if (S) this.ende(true);
      var d = aufbauen(fenster);
      S = { nurBilder: nurBilder, d: d, ton: Ton(), zeit: 0, letzt: performance.now(), szene: null, szeneNr: -2, bildNr: -1, mycel: null, n: 0, N: 15, pausiert: false, zu: false, tempo: 1, finale: finaleZeit(), t0: performance.now(), zeitTeil: [] };
      if (art === "film") {
        S.film = true; S.vorab = vorabLaden(); S.runde = 0; S.appZeiger = -1; S.aufdeckZaehler = 0; S.uebersprungen = 0; S.scanBild = -2; S.scans = [];
        S.bildZaehler = -1; S.alle = false; S.finaleDa = false; S.bis = 0; S.szeneAb = 0;
        d.buehne.classList.add("ls-film-art"); d.fenster.setAttribute("data-ls-art", "film"); S.ton.start(); musikText();
        var bild = fenster.querySelector("img");
        if (mitFilm) { S.filmLage = "laedt"; S.szeneNr = -3; S.szene = szeneFilm(d.kino, film, bild ? bild.src : ""); }
        else { S.filmLage = "fehler"; S.szeneNr = -3; }
      } else if (nurBilder) { d.musik.classList.add("weg"); d.fenster.setAttribute("data-ls-art", "bilder"); }
      else { d.fenster.setAttribute("data-ls-art", "werbung"); S.ton.start(); musikText(); }
      var meins = S;
      ladeThree().then(function () { if (meins.zu) return; meins.mycel = Mycel(d.cv); if (meins.mycel) meins.mycel.zuendet(Math.round(meins.n / meins.N * 15)); });
      try { var top = fenster.getBoundingClientRect().top; if (top < 0 || top > innerHeight * .5) fenster.scrollIntoView({ behavior: RUHIG ? "auto" : "smooth", block: "start" }); } catch (e) {}
      S.raf = requestAnimationFrame(takt);
    },
    teil: function (n, N) {
      if (!S || S.zu) return; S.n = n; S.N = N || 15;
      var p = n / S.N; S.ton.fortschritt(p);
      if (S.film) { S.alle = n >= S.N; }
      // Tempo an die echte Ladezeit anpassen: das Finale soll mit dem letzten Teil beginnen
      var jetzt = performance.now(), vergangen = (jetzt - S.t0) / 1000;
      if (S.film) {} else if (n > 0 && n < S.N && vergangen > 0.5) {
        var rest = (S.N - n) * (vergangen / n);
        var ziel = S.finale + 1 - S.zeit;
        S.tempo = Math.max(0.7, Math.min(3.2, ziel / Math.max(rest, 0.5)));
      } else if (n >= S.N) S.tempo = 1;
      S.d.zaehler.textContent = String(n).padStart(2, "0") + " / " + S.N;
      if (S.mycel) S.mycel.zuendet(Math.round(p * 15));
    },
    pause: function () { if (!S || S.zu) return; S.pausiert = true; if (!S.nurBilder) S.ton.halt(false); if (S.filmVideo) { try { S.filmVideo.pause(); } catch (e) {} } },
    ende: function (sofort, _nachFinale) {
      if (!S || S.zu) return;
      // Film-Modus: nach dem letzten Teil das Finale noch zeigen, dann erst schließen
      if (S.film && S.alle && !sofort && !_nachFinale) {
        if (!S.finaleDa) filmTakt();
        var meins = S, self = this; if (meins.endeGeplant) return; meins.endeGeplant = true;
        setTimeout(function () { if (S === meins) self.ende(false, true); }, RUHIG ? 1200 : 2800);
        return;
      }
      var s = S; s.zu = true; S = null;
      if (s.vorab) Object.keys(s.vorab.clip).forEach(function (k) { try { s.vorab.clip[k].pause(); } catch (e) {} });
      if (s.filmVideo) { try { s.filmVideo.pause(); } catch (e) {} }
      cancelAnimationFrame(s.raf); s.ton.halt(true); s.ton.schliessen();
      s.d.buehne.classList.add("weg"); s.d.kino.classList.add("weg"); s.d.musik.classList.add("weg");
      s.d.fenster.classList.remove("ls-fenster"); s.d.fenster.removeAttribute("data-ls-art");
      document.documentElement.classList.remove("ls-an");
      setTimeout(function () { if (s.mycel) s.mycel.weg(); s.d.buehne.remove(); s.d.kino.remove(); if (!S) s.d.musik.remove(); }, sofort ? 0 : 1000);
    },
    _zeit: function (t) { if (S) { S.zeit = t; S.letzt = performance.now(); } },
    _zustand: function () {
      if (!S) return null;
      var z = { zeit: S.zeit, szene: S.szeneNr, bild: S.bildNr, n: S.n, mycel: !!S.mycel, musik: S.ton.istAn(), puls: +S.ton.puls().toFixed(2) };
      if (S.film) {
        var ic = Object.keys(S.vorab.ico), cl = Object.keys(S.vorab.clip);
        z.art = "film"; z.film = S.filmLage; z.finale = !!S.finaleDa; z.runde = S.runde; z.aufdeck = S.aufdeck || null; z.scans = S.scans.slice();
        z.bildArt = S.bildArt || null; z.bilderGezeigt = S.bildZaehler + 1; z.uebersprungen = S.uebersprungen;
        z.vorab = { icons: ic.length, iconsBereit: ic.filter(function (k) { return S.vorab.ico[k]._bereit; }).length,
                    clips: cl.length, clipsBereit: cl.filter(function (k) { return S.vorab.clip[k].readyState >= 2; }).length };
        z.filmZeit = S.filmVideo ? +S.filmVideo.currentTime.toFixed(2) : null;
      }
      return z;
    }
  };
})();
