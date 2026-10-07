// DialKit inside a decision page (Projects spec §5.7): its values go to
// CawCo's store with cawco.set("dials", …) instead of the clipboard, and a
// reload or a revised page starts from the values the hub kept.
//
//   const card = cawcoDials("Card", { radius: [24, 0, 64], accent: "#e65d46" });
//   card.subscribe((v) => { el.style.borderRadius = `${v.radius}px`; });
//
// Every panel lives under the one "dials" key, by panel name:
// { Card: { radius: 32, … }, Hero: { … } }. DialKit is the vendored vanilla
// build (vendor/dialkit, MIT), which build.py inlines with this file when the
// page keeps the DIALS placeholder.
(() => {
  /** One DialKit root holds every panel on the page. */
  let rooted = false;
  let stored;
  const panels = {};
  const kept = {};
  let timer;

  function save() {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const next = JSON.stringify(kept);
      if (next !== JSON.stringify(stored ?? {})) {
        window.cawco.set("dials", kept);
      }
    }, 400);
  }

  window.cawcoDials = (name, config, options) => {
    if (!window.cawco) {
      throw new Error(
        "cawcoDials needs CawCo's bridge: open the page with show_preview."
      );
    }
    if (!rooted) {
      window.DialKit.createDialRoot({ position: "bottom-right" });
      rooted = true;
    }
    const kit = window.DialKit.createDialKit(name, config, options);
    panels[name] = { kit, restored: false };
    window.cawco.on("picks", (picks) => {
      stored = picks.dials?.value ?? null;
      const panel = panels[name];
      if (panel.restored) {
        return;
      }
      panel.restored = true;
      // Panels this page no longer has keep their stored values.
      Object.assign(kept, stored, kept);
      const values = stored?.[name];
      if (values) {
        kit.setValues(values);
      }
      // subscribe answers at once with the values as they stand; only the
      // person's changes after that go to the store.
      let opened = false;
      kit.subscribe((current) => {
        kept[name] = current;
        if (opened) {
          save();
        }
        opened = true;
      });
    });
    return kit;
  };
})();
