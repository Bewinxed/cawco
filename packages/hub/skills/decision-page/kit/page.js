// The decision page's own wiring, on CawCo's bridge (window.cawco, injected
// into every page CawCo previews). Picks and their marks are the bridge's:
// a click on a [data-option] inside a [data-cawco-choice] goes to the hub,
// and the page shows what the hub kept. This file adds the progress, each
// card's state line, notes, mockup motion and the send.
(() => {
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* Mockups animate only while on screen (CONTRACT.md). */
  const live = document.querySelectorAll(".mk");
  if (!reduce && "IntersectionObserver" in window) {
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const on = entry.isIntersecting;
          if (entry.target.classList.contains("is-live") !== on) {
            entry.target.classList.toggle("is-live", on);
            entry.target.dispatchEvent(
              new CustomEvent(on ? "mk:live" : "mk:idle")
            );
          }
        }
      },
      { threshold: 0.2 }
    );
    for (const el of live) {
      io.observe(el);
    }
  }

  /* Each option's keycap, its digit in its card (DESIGN.md, option chips). */
  for (const group of document.querySelectorAll("[data-cawco-choice]")) {
    for (const [n, option] of [...group.querySelectorAll("[data-option]")].entries()) {
      const label = option.querySelector("b") ?? option;
      if (!label.querySelector(".dp-kc")) {
        const cap = document.createElement("span");
        cap.className = "dp-kc";
        cap.setAttribute("aria-hidden", "true");
        cap.textContent = String(n + 1);
        label.prepend(cap);
      }
    }
  }

  const choices = [...document.querySelectorAll("[data-cawco-choice]")].filter(
    (el) => el.querySelector("[data-option]") || el.hasAttribute("data-option")
  );
  const ids = [...new Set(choices.map((el) => el.dataset.cawcoChoice))];
  for (const el of document.querySelectorAll("[data-dp-total]")) {
    el.textContent = String(ids.length);
  }

  const bridge = window.cawco;
  if (!bridge) {
    for (const el of document.querySelectorAll("[data-dp-offline]")) {
      el.hidden = false;
    }
    for (const el of document.querySelectorAll(
      "[data-option], [data-dp-send], [data-dp-note]"
    )) {
      el.disabled = true;
    }
    return;
  }

  const send = document.querySelector("[data-dp-send]");
  const sentLine = document.querySelector("[data-dp-sent]");
  let picks = {};

  const stateLine = (n) => {
    if (n === 0) {
      return "Not picked";
    }
    return n > 1 ? `${n} picked` : "Picked";
  };

  function render() {
    const picked = ids.filter((id) => (picks[id]?.options ?? []).length > 0);
    const count = picked.length;
    for (const id of ids) {
      const state = document.querySelector(
        `[data-dp-state="${CSS.escape(id)}"]`
      );
      const n = picks[id]?.options.length ?? 0;
      state?.classList.toggle("on", n > 0);
      if (state) {
        state.textContent = stateLine(n);
      }
    }
    for (const el of document.querySelectorAll("[data-dp-count]")) {
      el.textContent = String(count);
    }
    for (const el of document.querySelectorAll("[data-dp-fill]")) {
      el.style.width = `${ids.length ? (100 * count) / ids.length : 0}%`;
    }
    for (const note of document.querySelectorAll("[data-dp-note]")) {
      if (document.activeElement !== note) {
        note.value = picks[note.dataset.dpNote]?.note ?? "";
      }
    }
  }

  bridge.on("picks", (next) => {
    picks = next;
    render();
  });

  /* Notes go to the hub a moment after typing stops. */
  const timers = {};
  for (const note of document.querySelectorAll("[data-dp-note]")) {
    note.addEventListener("input", () => {
      const id = note.dataset.dpNote;
      clearTimeout(timers[id]);
      timers[id] = setTimeout(() => {
        if ((picks[id]?.note ?? "") !== note.value) {
          bridge.note(id, note.value);
        }
      }, 700);
    });
  }

  send?.addEventListener("click", async () => {
    send.disabled = true;
    try {
      await bridge.send();
      if (sentLine) {
        sentLine.textContent = "Sent. Change anything and send again.";
      }
    } finally {
      send.disabled = false;
    }
  });
  render();
})();
