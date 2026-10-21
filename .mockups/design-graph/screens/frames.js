(() => {
  const root = document.querySelector(".mk-dg-screens");
  if (!root) return;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const LOOP = 9000;

  // ---- What each frame plays: scenes on one loop clock, each an absolute state (so a seek to any moment
  // lands on that moment's state), and where the finger or pointer is. ----
  const NODE = (m, s) => '.node[data-machine="' + m + '"][data-state="' + s + '"] > b';
  const SCENES = {
    "phone-portrait": [
      { at: 0 },
      { at: 1200, dot: NODE("save", "saving"), press: true, hold: true },
      { at: 1580, dot: NODE("save", "saving"), press: true, hold: true, peek: ["save", "saving", 0] },
      { at: 3400, dot: NODE("save", "saving") },
      { at: 4600, dot: NODE("save", "created"), press: true, kept: ["save", "created", 0] },
      { at: 6600, dot: NODE("save", "failed"), press: true, kept: ["save", "failed", 0] },
      { at: 7800, dot: null },
    ],
    "phone-landscape": [
      { at: 0 },
      { at: 1200, dot: '#faces [data-face="move"]', press: true, face: "move" },
      { at: 2600, dot: '.bar[data-key="reveal"]', press: true, face: "move", pop: "reveal" },
      { at: 4800, dot: "#sheetHide", press: true, face: "move", open: false },
      { at: 6400, dot: "#show", press: true },
      { at: 7800, dot: null },
    ],
    "tablet-portrait": [
      { at: 0 },
      { at: 1000, dot: "#sheetTitle", press: true, hold: true },
      { at: 1300, dot: "#sheetTitle", press: true, hold: true, drag: ["peek", "full", 1300, 2100] },
      { at: 2100, dot: "#sheetTitle", stop: "full" },
      { at: 3200, dot: '#faces [data-face="move"]', press: true, stop: "full", face: "move" },
      { at: 4400, dot: "#play", press: true, face: "move", play: 4400, speed: 0.5 },
      { at: 6600, dot: '#faces [data-face="graph"]', press: true },
      { at: 7800, dot: null },
    ],
    "tablet-landscape": [
      { at: 0 },
      { at: 1000, dot: ".edge-pill-d", press: true, hold: true, lit: true },
      { at: 1300, dot: ".edge-pill-d", press: true, hold: true, lit: true, dock: [0, 180, 1300, 2300] },
      { at: 2300, dot: ".edge-pill-d", dock: [180, 180] },
      { at: 3600, dot: ".edge-pill-d", press: true, hold: true, lit: true, dock: [180, 180] },
      { at: 3900, dot: ".edge-pill-d", press: true, hold: true, lit: true, dock: [180, 0, 3900, 4900] },
      { at: 4900, dot: ".edge-pill-d" },
      { at: 6000, dot: "#play", press: true, play: 6000, speed: 0.5 },
      { at: 7800, dot: null },
    ],
    desk: [
      { at: 0 },
      { at: 900, dot: ".edge-pill-d", lit: true },
      { at: 1300, dot: ".edge-pill-d", press: true, hold: true, lit: true, dock: [0, 160, 1300, 2200] },
      { at: 2200, dot: ".edge-pill-d", dock: [160, 160] },
      { at: 3300, dot: NODE("save", "saving"), peek: ["save", "saving", 0], dock: [160, 160] },
      { at: 5000, dot: NODE("save", "created"), peek: ["save", "created", 0], dock: [160, 160] },
      { at: 6500, dot: ".edge-pill-d", press: true, hold: true, lit: true, dock: [160, 0, 6500, 7400] },
      { at: 7400, dot: null },
    ],
    wide: [
      { at: 0 },
      { at: 1100, dot: NODE("types", "loading"), peek: ["types", "loading", 0] },
      { at: 2800, dot: NODE("save", "saving"), peek: ["save", "saving", 0] },
      { at: 4400, dot: "#play", press: true, play: 4400, speed: 0.4 },
      { at: 7600, dot: null },
    ],
    "ultrawide-2560": [
      { at: 0 },
      { at: 1100, dot: '#tabs [data-tab="row"]', press: true, tab: "row" },
      { at: 2600, dot: NODE("runs", "running"), tab: "row", peek: ["runs", "running", 0] },
      { at: 4200, dot: "#play", press: true, tab: "row", play: 4200, speed: 0.5 },
      { at: 6400, dot: '#tabs [data-tab="form"]', press: true },
      { at: 7800, dot: null },
    ],
    "ultrawide-3440": [
      { at: 0 },
      { at: 1100, dot: NODE("save", "created"), peek: ["save", "created", 0] },
      { at: 2500, dot: NODE("save", "created"), press: true, kept: ["save", "created", 0] },
      { at: 4200, dot: NODE("save", "failed"), press: true, kept: ["save", "failed", 0] },
      { at: 5600, dot: "#play", press: true, play: 5600, speed: 0.4 },
      { at: 7800, dot: null },
    ],
  };
  const sceneAt = (list, t) => { let i = 0; for (let k = 0; k < list.length; k++) if (list[k].at <= t) i = k; return i; };

  // ---- In each frame, after the mockup's own script: puts the mockup in a scene's state (its own
  // functions: keep, setFace, setStop, setDockH, openPop, ...), idempotently, and reads it back. ----
  function driver() {
    const KEPT = { form: ["save", "failed", 0], row: ["runs", "failed", 0] };
    let h0 = null, dragging = false, dockSet = null;
    function apply(s, t) {
      const want = s.tab || "form";
      if (want !== tab) { tab = want; peek = null; time = null; stopPlay(); closePop(true); zoom = 1; render(true); }
      const k = s.kept || KEPT[tab], v = views[tab];
      if (v.last !== k[0] || v.cur[k[0]].state !== k[1] || v.cur[k[0]].vary !== k[2]) keep(k[0], k[1], k[2]);
      if (compact()) {
        if (layoutIs("sheet")) { const o = s.open !== false; if (toolsOpen() !== o) setOpen(o); }
        const f = s.face || "graph";
        if (face !== f) setFace(f);
        if (layoutIs("drawer")) {
          if (s.drag) { dragging = true; rootEl.dataset.drawerDrag = ""; const [a, b, t0, t1] = s.drag, x = clamp((t - t0) / (t1 - t0), 0, 1); setDrawerH(stopPx(a) + (stopPx(b) - stopPx(a)) * x); }
          else { const st = s.stop || "peek"; if (dragging || stop !== st) { dragging = false; delete rootEl.dataset.drawerDrag; setStop(st); } }
        }
      } else {
        const d = $("dock");
        if (h0 === null) h0 = d.offsetHeight;
        if (s.dock) { const [a, b, t0, t1] = s.dock, x = t1 ? clamp((t - t0) / (t1 - t0), 0, 1) : 1, h = Math.round(h0 + a + (b - a) * x); if (h !== dockSet) { dockSet = h; setDockH(h); } }
        else if (dockSet !== null) { dockSet = null; rootEl.style.removeProperty("--dock-h"); sizeDockRoom(); }
        if (!!s.lit !== !!d.dataset.resizing) { if (s.lit) d.dataset.resizing = "d"; else delete d.dataset.resizing; }
      }
      if (s.pop) { if (!pop || pop.key !== s.pop) { const km = keptMove(); km.e.sel = new Set([s.pop]); layoutDock(); openPop(s.pop, "pointer"); } }
      else if (pop) { const km = keptMove(); if (km) km.e.sel.clear(); closePop(true); if (tl) layoutDock(); }
      const pk = s.peek || null, now = peek ? [peek.machine, peek.state, peek.vary] : null;
      if (JSON.stringify(pk) !== JSON.stringify(now)) { peek = pk ? { machine: pk[0], state: pk[1], vary: pk[2] } : null; drawStage(); mark(); }
      const km = keptMove();
      if (s.play != null && km) {
        const len = playLengthOf(km.r), p = (t - s.play) * (s.speed || 1), nt = p < 0 ? 0 : p >= len ? null : p;
        if (nt !== time) { time = nt; drawStage(); updateTime(); }
      } else if (time !== null) { time = null; drawStage(); updateTime(); }
    }
    const center = (sel) => { const el = sel && document.querySelector(sel); if (!el) return null; const b = el.getBoundingClientRect(); return b.width || b.height ? [b.left + b.width / 2, b.top + b.height / 2] : null; };
    const read = () => ({ tab, kept: views[tab].last + ":" + views[tab].cur[views[tab].last].state, peek: peek && peek.machine + ":" + peek.state, washes: document.querySelectorAll(".wash").length, face, stop, drawerH: Math.round(drawerH), open: toolsOpen(), dockH: $("dock").offsetHeight, time: time === null ? null : Math.round(time), pop: pop && pop.key, popInline: !!pop && pop.inline, lit: !!$("dock").dataset.resizing, screen: rootEl.dataset.screen });
    window.__dg = { apply, center, read };
  }

  // ---- The frame's document: the house tokens and faces from this page, then the mockup itself ----
  const tpl = root.querySelector("template.ds-src").content;
  const part = (n) => tpl.querySelector('[data-part="' + n + '"]');
  const pageRules = [...document.styleSheets].flatMap((s) => { try { return [...s.cssRules]; } catch { return []; } });
  const theme = pageRules.filter((r) => (typeof CSSLayerBlockRule !== "undefined" && r instanceof CSSLayerBlockRule && r.name === "theme") || r instanceof CSSFontFaceRule).map((r) => r.cssText).join("\n");
  // The frame is a device of its class: its pointer is that device's (a finger, or a trackpad beside it).
  const inputPatch = (input) => "(() => { const q = { '(any-pointer: coarse)': " + (input !== "fine") + ", '(hover: hover)': " + (input !== "touch") + " }; const mm = matchMedia.bind(window); window.matchMedia = (m) => (m in q ? { matches: q[m], media: m, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} } : mm(m)); })();";
  const docOf = (input) => '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><style>' + theme + "</style><style>" + part("css").textContent + "</style><script>" + inputPatch(input) + "<\/script></head><body>" + part("body").innerHTML + "<script>" + part("js").textContent + "\n;(" + driver.toString() + ")();<\/script></body></html>";

  // ---- Each shot: its frame, its scale, its loop ----
  const shots = [...root.querySelectorAll(".ds-shot")].map((fig) => ({ fig, id: fig.dataset.loop, input: fig.dataset.input, w: +fig.dataset.w, h: +fig.dataset.h, frame: fig.querySelector("iframe"), dot: fig.querySelector(".ds-dot"), screen: fig.querySelector(".ds-screen"), anim: null, ready: false, last: -1, seen: false }));
  const fit = (s) => { s.fig.style.setProperty("--ds-s", String(s.screen.clientWidth / s.w)); };
  const ro = new ResizeObserver((es) => { for (const e of es) { const s = shots.find((x) => x.screen === e.target); if (s) fit(s); } });
  for (const s of shots) { ro.observe(s.screen); fit(s); }

  // The finger's path: where it is in each scene, read from the frame in the state before it lands.
  function dotFrames(s) {
    const list = SCENES[s.id], api = s.frame.contentWindow.__dg, kf = [];
    const at = (i) => list[i].at;
    let prev = null;
    for (let i = 0; i < list.length; i++) {
      const sc = list[i];
      api.apply(i ? list[i - 1] : sc, Math.max(0, at(i) - 1));
      const pos = api.center(sc.dot) || prev;
      if (!sc.dot || !pos) { kf.push({ t: at(i), p: prev, o: 0, k: 1 }); continue; }
      kf.push({ t: Math.max(i ? at(i - 1) + 60 : 0, at(i) - 520), p: prev || pos, o: prev ? 1 : 0, k: 1 });
      kf.push({ t: at(i) - 120, p: pos, o: 1, k: 1 });
      kf.push({ t: at(i), p: pos, o: 1, k: sc.press ? 0.8 : 1 });
      let end = pos;
      const span = sc.drag || sc.dock;
      if (span && span[3]) { api.apply(sc, span[3]); end = api.center(sc.dot) || pos; kf.push({ t: span[3], p: end, o: 1, k: 0.8 }); }
      if (sc.press && !sc.hold) kf.push({ t: at(i) + 180, p: end, o: 1, k: 1 });
      prev = end;
    }
    api.apply(list[0], 0);
    kf.sort((a, b) => a.t - b.t);
    const out = [], first = kf.find((k) => k.p);
    let p = first ? first.p : [0, 0];
    for (const k of kf) { if (k.p) p = k.p; out.push({ offset: Math.min(1, Math.max(0, k.t / LOOP)), translate: p[0] + "px " + p[1] + "px", opacity: k.o, scale: k.k }); }
    if (out[0].offset > 0) out.unshift({ ...out[0], offset: 0, opacity: 0 });
    out.push({ ...out[out.length - 1], offset: 1, opacity: 0 });
    return out;
  }
  function start(s) {
    s.anim = s.dot.animate(dotFrames(s), { duration: LOOP, iterations: Infinity, easing: "linear" });
    s.anim.pause();
    s.ready = true;
    sync();
  }
  // The loop's clock is the dot's animation: every frame reads its time and puts the mockup there, so a
  // pause or a seek (the DevTools Animation domain) holds or moves the whole frame with it.
  function tick() {
    for (const s of shots) {
      if (!s.ready) continue;
      const t = ((s.anim.currentTime || 0) % LOOP + LOOP) % LOOP, list = SCENES[s.id], i = sceneAt(list, t);
      s.frame.contentWindow.__dg.apply(list[i], t);
      s.last = i;
    }
    if (live) requestAnimationFrame(tick);
  }
  let live = false;
  const sync = () => { for (const s of shots) if (s.ready) { if (live && s.seen && !reduce) s.anim.play(); else s.anim.pause(); } };
  const io = new IntersectionObserver((es) => { for (const e of es) { const s = shots.find((x) => x.fig === e.target); if (s) s.seen = e.isIntersecting; } sync(); });
  for (const s of shots) io.observe(s.fig);
  const goLive = () => { if (live || reduce) return; live = true; sync(); requestAnimationFrame(tick); };
  root.addEventListener("mk:live", goLive);
  root.addEventListener("mk:idle", () => { live = false; sync(); });
  for (const s of shots) {
    s.frame.addEventListener("load", () => {
      const w = s.frame.contentWindow;
      // The mockup draws once its faces have loaded; the loop starts after that.
      w.document.fonts.ready.then(() => requestAnimationFrame(() => requestAnimationFrame(() => {
        start(s);
        // Still under reduced motion: each frame rests on its key scene, nothing moving.
        if (reduce) { const list = SCENES[s.id], k = list.find((x) => x.peek || x.face || x.pop || x.tab) || list[0]; w.__dg.apply(k, k.at); }
        else if (root.classList.contains("is-live")) goLive();
      })));
    }, { once: true });
    s.frame.srcdoc = docOf(s.input);
  }
})();
