// @ts-nocheck: a plain browser script inlined into pages and copied into any
// project; a host that type-checks its JS types it at its seam (window.cawco*).
//
// DialKit inside a CawCo artifact (Projects spec §5.7): every panel and
// timeline of a DialKit store keeps its values in CawCo's store with
// cawco.set("dials", …) instead of the clipboard, and a reload or a revised
// page starts from the values the hub kept.
//
// With the vendored vanilla build (vendor/dialkit, MIT) as window.DialKit, a
// decision page's or a static preview's:
//
//   const card = cawcoDials("Card", { radius: [24, 0, 64], accent: "#e65d46" });
//   card.subscribe((v) => { el.style.borderRadius = `${v.radius}px`; });
//   const move = cawcoTimeline("Switch", { slide: { at: 0, duration: 0.4,
//     from: { x: 0 }, to: { x: 1 } } }, { autoplay: false });
//   move.subscribe((t) => { el.style.translate = `${t.slide.current.x * 40}px`; });
//
// With a bundled DialKit (a framework adapter such as dialkit/svelte, whose
// store is its own), the page keeps that store's panels instead:
//
//   import { DialStore } from "dialkit/store";
//   cawcoKeepDials(DialStore);
//
// Panels dock in the page's [data-cawco-dials] element and the timeline in
// its [data-cawco-timeline] element when it has them (design-explore's
// preview rail); a decision page's panel floats bottom-right.
//
// Every panel lives under the one "dials" key, by panel or timeline name,
// each its values by path: { Card: { radius: 32, … }, Switch: { … } }.
(() => {
  /** Each panel's values, by name, as the page holds them now. */
  const kept = {};
  /** The values the hub holds, once the picks have been heard. */
  let stored;
  let heard = false;
  let timer;
  const stores = new Set();
  /** Panel ids already kept, so a panel is restored once. */
  const watched = new Set();

  function save() {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const next = JSON.stringify(kept);
      if (next !== JSON.stringify(stored ?? {})) {
        window.cawco.set("dials", kept);
      }
    }, 400);
  }

  /** Restores each new panel from the hub's values, then keeps the person's changes. */
  function sync(store) {
    if (!heard) {
      return;
    }
    for (const panel of store.getPanels()) {
      if (watched.has(panel.id)) {
        continue;
      }
      watched.add(panel.id);
      const values = stored?.[panel.name];
      if (values) {
        store.updateValues(panel.id, values);
      }
      kept[panel.name] = { ...store.getValues(panel.id) };
      // Only the person's changes after the restore go to the hub.
      store.subscribe(panel.id, () => {
        kept[panel.name] = { ...store.getValues(panel.id) };
        save();
      });
    }
  }

  window.cawcoKeepDials = (store) => {
    if (!window.cawco) {
      throw new Error(
        "DialKit's values need CawCo's bridge: open the page with artifact_create."
      );
    }
    if (stores.has(store)) {
      return;
    }
    if (!stores.size) {
      window.cawco.on("picks", (picks) => {
        stored = picks.dials?.value ?? null;
        if (heard) {
          return;
        }
        heard = true;
        // Panels this page no longer has keep their stored values.
        Object.assign(kept, stored);
        for (const each of stores) {
          sync(each);
        }
      });
    }
    stores.add(store);
    store.subscribeGlobal(() => sync(store));
    sync(store);
  };

  /** The vanilla build's panel root and timeline dock, each made once. */
  let rooted = false;
  let docked = false;
  const kit = () => {
    if (!window.DialKit) {
      throw new Error(
        "cawcoDials needs DialKit: the page loads vendor/dialkit first."
      );
    }
    if (!rooted) {
      rooted = true;
      const dock = document.querySelector("[data-cawco-dials]");
      window.DialKit.createDialRoot(
        dock
          ? { mode: "inline", target: dock, theme: "dark" }
          : { position: "bottom-right" }
      );
      window.cawcoKeepDials(window.DialKit.DialStore);
    }
    return window.DialKit;
  };

  window.cawcoDials = (name, config, options) =>
    kit().createDialKit(name, config, options);

  window.cawcoTimeline = (name, config, options) => {
    const dialKit = kit();
    if (!docked) {
      docked = true;
      const dock = document.querySelector("[data-cawco-timeline]");
      dialKit.createDialTimelineRoot(
        dock ? { target: dock, theme: "dark" } : {}
      );
    }
    return dialKit.createDialTimeline(name, config, options);
  };
})();
