/// <reference lib="dom" />

import { solarGlyphs } from "./glyphs" with { type: "macro" };
/**
 * The icon at a stroke's end and its radial menu (DESIGN.md, Artifact
 * panel, canvas and ink: "The icon at the stroke's end"), drawn in the
 * overlay's shadow root on the house tokens (the decision-page kit's
 * `tokens.css`, the one generated file every page we serve shares).
 *
 * When the pen lifts, a 24px raised circle with the pen glyph arrives at the
 * stroke's last point as a floating tag does (rising 8px, from 0.96, over
 * `--dur-panel`) and leaves the same way (`--dur-exit`) two breaths later or
 * when the next stroke starts. A press on it that moves opens the menu: four
 * 90° sectors round the icon, outer radius 56px, in the panel material with
 * the control edge, each with its glyph and, outside the ring, its word.
 * The sector under the pointer takes `surface-fill` and its word
 * `selected-ink`; releasing on a sector picks it, releasing within 20px of
 * the centre picks nothing. A tap opens the same menu and a second tap
 * picks. The menu opens over `--dur-pop` on ease-out and closes over
 * `--dur-exit`; with reduced motion the icon fades and the menu appears and
 * goes. A pen never works the icon or the menu (a stroke that starts on
 * them is a stroke): they answer a finger, a mouse and the keyboard.
 */
import type { GlyphName } from "./glyphs";
import { hostTokens } from "./tokens" with { type: "macro" };

const GLYPHS = solarGlyphs();
const TOKENS = hostTokens();

export type Pick = "annotate" | "comment" | "illustrate" | "erase";

/** The sectors, clockwise from the top: what each picks, its glyph, its word. */
const SECTORS: { pick: Pick; glyph: GlyphName; word: string }[] = [
  { pick: "annotate", glyph: "pin", word: "Annotate" },
  { pick: "comment", glyph: "comment", word: "Comment" },
  { pick: "illustrate", glyph: "gallery", word: "Illustrate" },
  { pick: "erase", glyph: "eraser", word: "Erase" },
];

/** DESIGN.md's numbers. */
const ICON = 24;
const OUTER = 56;
/** The ring's inner edge: the icon's own edge and a step of the ladder past it. */
const INNER = 16;
/** A release this close to the centre picks nothing. */
const DEAD = 20;
/** How far a press moves before it is a drag. Our call, under the dead zone. */
const SLOP = 4;
/** Where a sector's glyph stands, between the ring's edges. */
const GLYPH_R = (INNER + OUTER) / 2;
/** Where a sector's word stands: outside the ring, a step of the ladder past it. */
const WORD_R = OUTER + 18;

const svg = (body: string, size = 16) =>
  `<svg aria-hidden="true" viewBox="0 0 24 24" width="${size}" height="${size}">${body}</svg>`;

const point = (r: number, deg: number) => {
  const a = (deg * Math.PI) / 180;
  return [r * Math.cos(a), r * Math.sin(a)] as const;
};

/** An annular sector from `from` to `to` degrees (0 is right, clockwise). */
const sectorPath = (from: number, to: number) => {
  const [ox0, oy0] = point(OUTER, from);
  const [ox1, oy1] = point(OUTER, to);
  const [ix1, iy1] = point(INNER, to);
  const [ix0, iy0] = point(INNER, from);
  const f = (n: number) => n.toFixed(2);
  return `M ${f(ox0)} ${f(oy0)} A ${OUTER} ${OUTER} 0 0 1 ${f(ox1)} ${f(oy1)} L ${f(ix1)} ${f(iy1)} A ${INNER} ${INNER} 0 0 0 ${f(ix0)} ${f(iy0)} Z`;
};

/** Each sector's centre angle: Annotate up, then clockwise. */
const centreOf = (index: number) => -90 + index * 90;

const CHROME = `
  .ink-icon {
    position: fixed; z-index: 2; box-sizing: border-box;
    inline-size: ${ICON}px; block-size: ${ICON}px; margin: 0; padding: 0;
    translate: -50% -50%;
    display: grid; place-items: center;
    border: 1px solid var(--border-control); border-radius: 50%;
    background: var(--surface-raised); color: var(--ink-strong);
    box-shadow: var(--shadow-tile); cursor: pointer; pointer-events: auto;
    touch-action: none;
  }
  .ink-icon:focus-visible { outline: var(--focus-ring-width) solid var(--focus-ring); outline-offset: 2px; }
  .ink-icon::after { content: ""; position: absolute; inset: -10px; }
  .ink-menu {
    position: fixed; z-index: 1; inline-size: ${OUTER * 2}px; block-size: ${OUTER * 2}px;
    translate: -50% -50%; pointer-events: auto; touch-action: none;
  }
  .ink-ring {
    position: absolute; inset: 0; border-radius: 50%;
    -webkit-backdrop-filter: blur(var(--material-blur)) saturate(var(--material-saturate));
    backdrop-filter: blur(var(--material-blur)) saturate(var(--material-saturate));
    -webkit-mask: radial-gradient(circle, transparent ${INNER}px, #000 ${INNER + 0.5}px);
    mask: radial-gradient(circle, transparent ${INNER}px, #000 ${INNER + 0.5}px);
  }
  @media (prefers-reduced-transparency: reduce) { .ink-ring { display: none; } }
  .ink-menu > svg { position: absolute; inset: 0; overflow: visible; }
  .ink-sector {
    fill: var(--material-panel); stroke: var(--border-control); stroke-width: 1;
    transition: fill var(--dur-control) var(--ease-out);
  }
  @media (prefers-reduced-transparency: reduce) { .ink-sector { fill: var(--surface-raised); } }
  .ink-sector[data-hot] { fill: var(--surface-fill); }
  .ink-glyph { color: var(--ink-strong); pointer-events: none; }
  .ink-word {
    position: absolute; translate: -50% -50%; margin: 0; padding: 2px 6px;
    border: 0; border-radius: var(--radius-xs); background: none;
    color: var(--ink-muted); font: var(--type-label); white-space: nowrap;
    cursor: pointer; transition: color var(--dur-control) var(--ease-out);
  }
  .ink-word[data-hot] { color: var(--selected-ink); }
  .ink-word:focus-visible { outline: var(--focus-ring-width) solid var(--focus-ring); outline-offset: 0; }
  .ink-said {
    position: fixed; z-index: 2; translate: -50% 12px; max-inline-size: 280px;
    color: var(--ink-muted); font: var(--type-meta); pointer-events: none;
  }
`;

const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

export interface InkChrome {
  /** The icon leaves (the next stroke starts). */
  hideIcon: () => void;
  /** A duration token in ms. */
  ms: (name: string) => number;
  /** One sentence in meta ink over the ink at `x`, `y`, gone after two breaths. */
  say: (message: string, x: number, y: number) => void;
  /** The icon at `x`, `y` (the viewport's px) for the group just drawn; picks come back through `onPick`. */
  showIcon: (x: number, y: number, onPick: (pick: Pick) => void) => void;
  /** A token's value as the page computes it (a colour, a font, a length). */
  token: (
    name: string,
    property?:
      | "color"
      | "font"
      | "transition-duration"
      | "transition-timing-function"
  ) => string;
}

/** The icon, the menu and the overlay's tokens, in the overlay's shadow root. */
export function inkChrome(shadow: ShadowRoot): InkChrome {
  const sheet = document.createElement("style");
  sheet.textContent = `${TOKENS}\n${CHROME}`;
  shadow.prepend(sheet);
  const probe = document.createElement("span");
  probe.style.cssText = "position:fixed;visibility:hidden;pointer-events:none";
  shadow.append(probe);

  const token: InkChrome["token"] = (name, property = "color") => {
    probe.style.setProperty(property, `var(${name})`);
    const value = getComputedStyle(probe).getPropertyValue(property);
    probe.style.removeProperty(property);
    return value;
  };
  const ms = (name: string) => {
    const value = token(name, "transition-duration");
    return value.endsWith("ms")
      ? Number.parseFloat(value)
      : Number.parseFloat(value) * 1000;
  };
  /** `--ease-out`, the curve every entrance and exit here runs on. */
  const easeOut = () => token("--ease-out", "transition-timing-function");

  let icon: HTMLButtonElement | null = null;
  let menu: HTMLDivElement | null = null;
  let leave: ReturnType<typeof setTimeout> | undefined;
  let picked: ((pick: Pick) => void) | null = null;

  const dropIcon = (now = false) => {
    clearTimeout(leave);
    const going = icon;
    icon = null;
    if (!going) {
      return;
    }
    if (now) {
      going.remove();
      return;
    }
    const run = going.animate(
      reduced()
        ? [{ opacity: 1 }, { opacity: 0 }]
        : [
            { opacity: 1, translate: "-50% -50%", scale: "1" },
            { opacity: 0, translate: "-50% calc(-50% + 8px)", scale: "0.96" },
          ],
      { duration: ms("--dur-exit"), easing: easeOut(), fill: "forwards" }
    );
    run.id = "ink-icon";
    run.finished.then(
      () => going.remove(),
      () => going.remove()
    );
  };

  const closeMenu = (refocus = false) => {
    const going = menu;
    menu = null;
    if (!going) {
      return;
    }
    if (refocus) {
      icon?.focus();
    }
    if (reduced()) {
      going.remove();
    } else {
      const run = going.animate(
        [
          { opacity: 1, scale: "1" },
          { opacity: 0, scale: "0.5" },
        ],
        { duration: ms("--dur-exit"), easing: easeOut(), fill: "forwards" }
      );
      run.id = "ink-menu";
      run.finished.then(
        () => going.remove(),
        () => going.remove()
      );
    }
    if (icon) {
      // Back to the icon's own clock: it leaves two breaths after the menu does.
      clearTimeout(leave);
      leave = setTimeout(() => dropIcon(), 2 * ms("--breath"));
    }
  };

  const pick = (choice: Pick) => {
    const handed = picked;
    closeMenu();
    dropIcon();
    handed?.(choice);
  };

  /** The sector a point (viewport px) lies in, or null within the dead zone. */
  const sectorAt = (x: number, y: number): number | null => {
    if (!menu) {
      return null;
    }
    const box = menu.getBoundingClientRect();
    const dx = x - (box.left + box.width / 2);
    const dy = y - (box.top + box.height / 2);
    if (Math.hypot(dx, dy) <= DEAD) {
      return null;
    }
    const deg = (Math.atan2(dy, dx) * 180) / Math.PI;
    return (((Math.round((deg + 90) / 90) % 4) + 4) % 4) as number;
  };

  const heat = (index: number | null) => {
    for (const el of menu?.querySelectorAll("[data-index]") ?? []) {
      el.toggleAttribute(
        "data-hot",
        Number((el as HTMLElement).dataset.index) === index
      );
    }
  };

  const openMenu = (focusFirst = false) => {
    if (!icon || menu) {
      return;
    }
    clearTimeout(leave);
    const at = icon.getBoundingClientRect();
    const built = document.createElement("div");
    built.className = "ink-menu";
    built.setAttribute("role", "menu");
    built.setAttribute("aria-label", "Stroke options");
    built.style.left = `${at.left + at.width / 2}px`;
    built.style.top = `${at.top + at.height / 2}px`;
    const ring = document.createElement("div");
    ring.className = "ink-ring";
    const paths = SECTORS.map((sector, index) => {
      const from = centreOf(index) - 45;
      const to = centreOf(index) + 45;
      const [gx, gy] = point(GLYPH_R, centreOf(index));
      return `<path class="ink-sector" data-index="${index}" data-pick="${sector.pick}" data-from="${from}" data-to="${to}" data-inner="${INNER}" data-outer="${OUTER}" d="${sectorPath(from, to)}"/><g class="ink-glyph" transform="translate(${(gx - 8).toFixed(2)} ${(gy - 8).toFixed(2)})">${svg(GLYPHS[sector.glyph])}</g>`;
    }).join("");
    built.innerHTML = `<svg aria-hidden="true" viewBox="${-OUTER} ${-OUTER} ${OUTER * 2} ${OUTER * 2}">${paths}</svg>`;
    built.prepend(ring);
    SECTORS.forEach((sector, index) => {
      const [wx, wy] = point(WORD_R, centreOf(index));
      const word = document.createElement("button");
      word.type = "button";
      word.className = "ink-word";
      word.setAttribute("role", "menuitem");
      word.dataset.index = String(index);
      word.dataset.pick = sector.pick;
      word.tabIndex = -1;
      word.textContent = sector.word;
      word.style.left = `${OUTER + wx}px`;
      word.style.top = `${OUTER + wy}px`;
      built.append(word);
    });
    built.addEventListener("keydown", (event) => {
      const words = [...built.querySelectorAll<HTMLButtonElement>(".ink-word")];
      const focused = words.indexOf(shadow.activeElement as HTMLButtonElement);
      if (event.key === "ArrowDown" || event.key === "ArrowRight") {
        event.preventDefault();
        words[(focused + 1) % words.length]?.focus();
      } else if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
        event.preventDefault();
        words[(focused + words.length - 1) % words.length]?.focus();
      } else if (event.key === "Escape") {
        event.preventDefault();
        closeMenu(true);
      } else if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        const choice = (shadow.activeElement as HTMLElement | null)?.dataset
          .pick as Pick | undefined;
        if (choice) {
          pick(choice);
        }
      }
    });
    // A tap, once the menu stands open: on a sector it picks; anywhere else it closes.
    built.addEventListener("pointerup", (event) => {
      if (event.pointerType === "pen" || dragging) {
        return;
      }
      const index = sectorAt(event.clientX, event.clientY);
      if (index === null) {
        closeMenu();
      } else {
        pick(SECTORS[index].pick);
      }
    });
    built.addEventListener("pointermove", (event) => {
      if (event.pointerType !== "pen") {
        heat(sectorAt(event.clientX, event.clientY));
      }
    });
    menu = built;
    shadow.append(built);
    if (!reduced()) {
      const run = built.animate(
        [
          { opacity: 0, scale: "0.5" },
          { opacity: 1, scale: "1" },
        ],
        { duration: ms("--dur-pop"), easing: easeOut() }
      );
      run.id = "ink-menu";
    }
    if (focusFirst) {
      built.querySelector<HTMLButtonElement>(".ink-word")?.focus();
    }
  };

  /** A press on the icon that has moved: the menu runs under the pointer until it lifts. */
  let dragging = false;

  const showIcon: InkChrome["showIcon"] = (x, y, onPick) => {
    closeMenu();
    dropIcon(true);
    picked = onPick;
    const made = document.createElement("button");
    made.type = "button";
    made.className = "ink-icon";
    made.setAttribute("aria-label", "Stroke options");
    made.setAttribute("aria-haspopup", "menu");
    made.innerHTML = svg(GLYPHS.pen);
    made.style.left = `${x}px`;
    made.style.top = `${y}px`;
    let press: { id: number; x: number; y: number } | null = null;
    made.addEventListener("pointerdown", (event) => {
      if (event.pointerType === "pen") {
        return;
      }
      event.preventDefault();
      made.setPointerCapture(event.pointerId);
      press = { id: event.pointerId, x: event.clientX, y: event.clientY };
      dragging = false;
    });
    made.addEventListener("pointermove", (event) => {
      if (press?.id !== event.pointerId) {
        return;
      }
      if (
        !dragging &&
        Math.hypot(event.clientX - press.x, event.clientY - press.y) > SLOP
      ) {
        dragging = true;
        openMenu();
      }
      if (dragging) {
        heat(sectorAt(event.clientX, event.clientY));
      }
    });
    /** A drag lets go: on a sector it picks; within the dead zone, or cancelled, it closes. */
    const dropped = (event: PointerEvent) => {
      const index =
        event.type === "pointerup"
          ? sectorAt(event.clientX, event.clientY)
          : null;
      if (index === null) {
        closeMenu();
      } else {
        pick(SECTORS[index].pick);
      }
    };
    const lift = (event: PointerEvent) => {
      if (press?.id !== event.pointerId) {
        return;
      }
      press = null;
      if (dragging) {
        dragging = false;
        dropped(event);
      } else if (event.type === "pointerup" && menu) {
        closeMenu();
      } else if (event.type === "pointerup") {
        // A tap: the menu opens and waits for the second tap.
        openMenu();
      }
    };
    made.addEventListener("pointerup", lift);
    made.addEventListener("pointercancel", lift);
    made.addEventListener("keydown", (event) => {
      if (
        event.key === "Enter" ||
        event.key === " " ||
        event.key === "ArrowDown"
      ) {
        event.preventDefault();
        openMenu(true);
      }
    });
    icon = made;
    shadow.append(made);
    const run = made.animate(
      reduced()
        ? [{ opacity: 0 }, { opacity: 1 }]
        : [
            { opacity: 0, translate: "-50% calc(-50% + 8px)", scale: "0.96" },
            { opacity: 1, translate: "-50% -50%", scale: "1" },
          ],
      { duration: ms("--dur-panel"), easing: easeOut() }
    );
    run.id = "ink-icon";
    leave = setTimeout(() => dropIcon(), 2 * ms("--breath"));
  };

  const say: InkChrome["say"] = (message, x, y) => {
    const line = document.createElement("p");
    line.className = "ink-said";
    line.setAttribute("role", "status");
    line.textContent = message;
    line.style.left = `${x}px`;
    line.style.top = `${y}px`;
    shadow.append(line);
    setTimeout(() => line.remove(), 2 * ms("--breath"));
  };

  return {
    token,
    ms,
    showIcon,
    hideIcon: () => {
      closeMenu();
      dropIcon();
    },
    say,
  };
}
