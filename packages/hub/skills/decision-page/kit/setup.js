// A project's setup page (setup.html, the project-setup skill): the stage
// strip the person shapes directly. Each stage's name, kind and look (its
// glyph and colour, stage-glyphs.js), its order, and stages added or
// removed go to the hub under "stages" on every change (cawco.set), as the
// board will draw them once the page is sent; a reload, or a revision of
// the page, draws the strip from what the hub kept. The hooks Caw drafted
// (runs, until, after, by) ride each stage as data and are kept with it.
// `data-shape` on the strip names what it started from (a template, or
// "own"), stored under "shape" once.
(() => {
  const strip = document.querySelector("[data-su-strip]");
  const blank = document.querySelector("template[data-su-stage]");
  const picker = document.querySelector("[data-su-picker]");
  const look = window.cawcoStageLook;
  const bridge = window.cawco;
  if (!(strip && blank && look)) {
    return;
  }
  const HOOKS = ["runs", "until", "after", "by"];

  /** A stage's mark: its glyph in its colour, or the dotted ring while it has none. */
  const paint = (li) => {
    const mark = li.querySelector(".su-look");
    const { icon } = li.dataset;
    const glyph = icon ? look.glyphs[icon] : null;
    mark.innerHTML = glyph
      ? `<svg viewBox="0 0 24 24" aria-hidden="true">${glyph.body}</svg>`
      : '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="2 3"/></svg>';
    if (li.dataset.color) {
      mark.dataset.color = li.dataset.color;
    } else {
      delete mark.dataset.color;
    }
    const name = li.querySelector("input").value || "this stage";
    const words = [
      glyph?.name,
      li.dataset.color ? look.colors[li.dataset.color] : null,
    ]
      .filter(Boolean)
      .join(", ");
    mark.setAttribute(
      "aria-label",
      words ? `Look of ${name}: ${words}` : `Give ${name} a look`
    );
  };

  /** One stage's tile, from a stored stage. */
  const tile = (stage) => {
    const li = blank.content.firstElementChild.cloneNode(true);
    li.querySelector("input").value = stage.name ?? "";
    const kind = li.querySelector("select");
    kind.value = stage.kind ?? "todo";
    li.dataset.kind = kind.value;
    for (const key of ["icon", "color", ...HOOKS]) {
      if (stage[key]) {
        li.dataset[key] = stage[key];
      }
    }
    if (stage.hook) {
      const hook = document.createElement("span");
      hook.className = "su-hook";
      hook.textContent = stage.hook;
      li.querySelector(".su-acts").before(hook);
    }
    paint(li);
    return li;
  };

  const stages = () => [...strip.querySelectorAll(".su-stage")];
  const read = () =>
    stages().map((li) => {
      const stage = {
        name: li.querySelector("input").value.trim(),
        kind: li.querySelector("select").value,
      };
      for (const key of ["icon", "color", ...HOOKS]) {
        if (li.dataset[key]) {
          stage[key] = li.dataset[key];
        }
      }
      const hook = li.querySelector(".su-hook")?.textContent;
      if (hook) {
        stage.hook = hook;
      }
      return stage;
    });
  /** Each stage's ids and Move labels, by where it stands now. */
  const relabel = () => {
    for (const [at, li] of stages().entries()) {
      const name = li.querySelector("input").value || `Stage ${at + 1}`;
      li.querySelector("input").setAttribute(
        "aria-label",
        `Stage ${at + 1} name`
      );
      li.querySelector("select").setAttribute("aria-label", `Kind of ${name}`);
      const earlier = li.querySelector("[data-su-move='-1']");
      const later = li.querySelector("[data-su-move='1']");
      earlier.hidden = at === 0;
      later.hidden = at === stages().length - 1;
      earlier.setAttribute("aria-label", `Move ${name} earlier`);
      later.setAttribute("aria-label", `Move ${name} later`);
      li.querySelector("[data-su-remove]").setAttribute(
        "aria-label",
        `Remove ${name}`
      );
      paint(li);
    }
  };
  let timer;
  const keep = (now = false) => {
    relabel();
    clearTimeout(timer);
    const send = () => bridge?.set("stages", read());
    if (now) {
      send();
    } else {
      timer = setTimeout(send, 400);
    }
  };

  // The strip as drawn, or as the hub kept it.
  for (const li of stages()) {
    paint(li);
  }
  relabel();
  const { shape } = strip.dataset;
  bridge?.on("picks", (picks) => {
    const kept = picks.stages?.value;
    if (
      Array.isArray(kept) &&
      !strip.contains(document.activeElement) &&
      JSON.stringify(kept) !== JSON.stringify(read())
    ) {
      for (const li of stages()) {
        li.remove();
      }
      const add = strip.querySelector("[data-su-add]").closest("li");
      for (const stage of kept) {
        strip.insertBefore(tile(stage), add);
      }
      relabel();
    }
    if (shape && picks.shape?.value === undefined) {
      bridge.set("shape", shape);
    }
  });

  strip.addEventListener("input", () => keep());
  strip.addEventListener("change", (event) => {
    const select = event.target.closest("select");
    if (select) {
      select.closest(".su-stage").dataset.kind = select.value;
    }
    keep(true);
  });
  strip.addEventListener("click", (event) => {
    const li = event.target.closest(".su-stage");
    if (event.target.closest("[data-su-remove]") && li) {
      (li.nextElementSibling?.querySelector("input, button") ?? null)?.focus();
      li.remove();
      keep(true);
      return;
    }
    const move = event.target.closest("[data-su-move]");
    if (move && li) {
      const to =
        Number(move.dataset.suMove) < 0
          ? li.previousElementSibling
          : li.nextElementSibling?.nextElementSibling;
      strip.insertBefore(li, to ?? strip.querySelector("li:last-child"));
      move.focus();
      keep(true);
      return;
    }
    if (event.target.closest("[data-su-add]")) {
      const fresh = tile({ name: "", kind: "active" });
      strip.insertBefore(fresh, event.target.closest("li"));
      fresh.querySelector("input").focus();
      keep(true);
      return;
    }
    const mark = event.target.closest(".su-look");
    if (mark && li && picker) {
      open(li, mark);
    }
  });

  // The look's picker: the platform's popover, beside the mark pressed.
  let editing = null;
  const open = (li, mark) => {
    editing = li;
    const box = mark.getBoundingClientRect();
    picker.style.setProperty("--su-x", `${Math.max(8, box.left)}px`);
    picker.style.setProperty("--su-y", `${box.bottom + 8}px`);
    for (const button of picker.querySelectorAll("[data-su-icon]")) {
      button.setAttribute(
        "aria-pressed",
        String(button.dataset.suIcon === (li.dataset.icon ?? ""))
      );
    }
    for (const button of picker.querySelectorAll("[data-su-color]")) {
      button.setAttribute(
        "aria-pressed",
        String(button.dataset.suColor === (li.dataset.color ?? ""))
      );
    }
    picker.showPopover();
    picker.querySelector("[aria-pressed='true']")?.focus();
  };
  if (picker) {
    const glyphs = picker.querySelector("[data-su-glyphs]");
    for (const [word, glyph] of Object.entries(look.glyphs)) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "su-glyph";
      button.dataset.suIcon = word;
      button.setAttribute("aria-label", glyph.name);
      button.title = glyph.name;
      button.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${glyph.body}</svg>`;
      glyphs.append(button);
    }
    const swatches = picker.querySelector("[data-su-colors]");
    for (const [color, name] of [
      ["", "No colour"],
      ...Object.entries(look.colors),
    ]) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "su-swatch";
      button.dataset.suColor = color;
      if (color) {
        button.dataset.color = color;
      }
      button.setAttribute("aria-label", name);
      button.title = name;
      swatches.append(button);
    }
    /** The look picked in the picker, onto the stage it was opened for. */
    const choose = (icon, color) => {
      if (icon) {
        editing.dataset.icon = icon.dataset.suIcon;
      } else if (color.dataset.suColor) {
        editing.dataset.color = color.dataset.suColor;
      } else {
        delete editing.dataset.color;
      }
      const pressed = icon ?? color;
      for (const button of picker.querySelectorAll(
        icon ? "[data-su-icon]" : "[data-su-color]"
      )) {
        button.setAttribute("aria-pressed", String(button === pressed));
      }
      keep(true);
    };
    picker.addEventListener("click", (event) => {
      const icon = event.target.closest("[data-su-icon]");
      const color = event.target.closest("[data-su-color]");
      if (editing && (icon || color)) {
        choose(icon, color);
      }
    });
    picker.addEventListener("toggle", (event) => {
      if (event.newState === "closed" && editing) {
        editing.querySelector(".su-look").focus();
        editing = null;
      }
    });
  }
})();
