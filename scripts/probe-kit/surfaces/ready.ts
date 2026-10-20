/**
 * Every catalogue state's ready assertion (catalogue.ts `Ready`), held once
 * the page stands and before anything is read or captured: what only that
 * state draws stands visible in the viewport, what it could be mistaken for
 * stands nowhere, and the page draws the pass's theme (`<html>`'s `dark`
 * class, and `--surface-raised` resolving to that scheme's colour, not the
 * other's). A state that does not hold fails with its name and what was
 * found instead, so no capture shows the wrong screen under a state's name.
 *
 * `outline` is what a failed one leaves for reading: every element a
 * state could be told by (a role, an accessible name, a `data-*`
 * attribute), visible, in document order.
 */
import type { Page } from "playwright-core";
import type { Theme } from "../kit";
import type { Ready } from "./catalogue";

/** What `held` found: the assertion's read, and whether it is the expected state. */
export interface ReadyRead {
  ok: boolean;
  /** One line: the element found and its words, the path, the theme; or what stood instead. */
  read: string;
}

/** `Ready` as it crosses into the page (a RegExp does not). */
interface Asked {
  not?: string;
  path?: { flags: string; source: string };
  says?: { flags: string; source: string };
  shows: string;
  theme: Theme;
}

/** In the page: the assertion held against what stands now. Self-contained. */
function held(asked: Asked): ReadyRead {
  const visible = (el: Element) => {
    const r = el.getBoundingClientRect();
    return (
      r.width > 0 &&
      r.height > 0 &&
      r.bottom > 0 &&
      r.right > 0 &&
      r.top < innerHeight &&
      r.left < innerWidth &&
      el.checkVisibility({ opacityProperty: true, visibilityProperty: true })
    );
  };
  // What it shows in words: rendered text, not a script's or a hidden part's.
  const words = (el: Element) =>
    ((el instanceof HTMLElement ? el.innerText : el.textContent) ?? "")
      .replace(/\s+/g, " ")
      .trim();
  const said = (el: Element) => {
    const r = el.getBoundingClientRect();
    const attrs = [
      "role",
      "data-slot",
      "data-state",
      "aria-expanded",
      "aria-selected",
      "aria-pressed",
      "aria-label",
    ]
      .map((a) => [a, el.getAttribute(a)] as const)
      .filter(([, v]) => v !== null)
      .map(([a, v]) => `${a}=${JSON.stringify(v)}`)
      .join(" ");
    const text = words(el);
    return `<${el.localName}${attrs ? ` ${attrs}` : ""}> ${Math.round(r.width)}x${Math.round(r.height)} "${text.length > 60 ? `${text.slice(0, 60)}…` : text}"`;
  };
  const says = asked.says
    ? new RegExp(asked.says.source, asked.says.flags)
    : null;
  const all = [...document.querySelectorAll(asked.shows)];
  const shown = all.filter(visible);
  const match = shown.find((el) => !says || says.test(words(el)));
  const fails: string[] = [];
  if (!match) {
    fails.push(
      shown.length > 0
        ? `${asked.shows} stands (${shown.length}), none saying ${says}: ${said(shown[0] as Element)}`
        : `nothing visible matches ${asked.shows} (${all.length} in the document)`
    );
  }
  const wrong = asked.not
    ? [...document.querySelectorAll(asked.not)].filter(visible)
    : [];
  if (wrong.length > 0) {
    fails.push(`${asked.not} stands: ${said(wrong[0] as Element)}`);
  }
  const path = asked.path
    ? new RegExp(asked.path.source, asked.path.flags)
    : null;
  if (path && !path.test(location.pathname + location.search)) {
    fails.push(
      `the page is at ${location.pathname}${location.search}, not ${path}`
    );
  }
  // The theme: the root's class, and the token's colour as each scheme
  // resolves it (`light-dark()` on the root's color-scheme).
  const root = document.documentElement;
  const dark = root.classList.contains("dark");
  const tone = (scheme: string | null) => {
    const probe = document.createElement("div");
    probe.style.cssText = `position:fixed;visibility:hidden;background-color:var(--surface-raised);${scheme ? `color-scheme:${scheme};` : ""}`;
    root.append(probe);
    const colour = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return colour;
  };
  const drawn = tone(null);
  const meant = tone(asked.theme);
  const other = tone(asked.theme === "dark" ? "light" : "dark");
  const themeRead = `${dark ? "dark" : "light"} --surface-raised ${drawn}`;
  if (dark !== (asked.theme === "dark") || drawn !== meant || drawn === other) {
    fails.push(`the page draws ${themeRead}, not ${asked.theme} (${meant})`);
  }
  const found = match ? said(match) : "";
  // The pointer the page answers to (kit.ts pins a desk's mouse, a phone's finger).
  const media = (feature: string, values: string[]) =>
    values.find((v) => matchMedia(`(${feature}: ${v})`).matches) ?? "?";
  const pointer = `pointer ${media("pointer", ["fine", "coarse", "none"])} hover ${media("hover", ["hover", "none"])}`;
  return fails.length === 0
    ? {
        ok: true,
        read: `${found}${path ? ` at ${location.pathname}${location.search}` : ""} · ${themeRead} · ${pointer}`,
      }
    : { ok: false, read: fails.join("; ") };
}

/** `ready` held on `page` at `theme`: its read, ok or not. */
export function readyOf(
  page: Page,
  ready: Ready,
  theme: Theme
): Promise<ReadyRead> {
  const asked: Asked = {
    shows: ready.shows,
    theme,
    ...(ready.not ? { not: ready.not } : {}),
    ...(ready.says
      ? { says: { source: ready.says.source, flags: ready.says.flags } }
      : {}),
    ...(ready.path
      ? { path: { source: ready.path.source, flags: ready.path.flags } }
      : {}),
  };
  return page.evaluate(held, asked);
}

/**
 * In the page: every visible element a state can be told by, one line
 * each, indented by depth: its tag, role, accessible name, `data-*`
 * attributes and own words. Self-contained.
 */
export function outline(): string {
  /** What tells a state apart by its tag alone. */
  const LANDMARKS = new Set([
    "main",
    "aside",
    "nav",
    "header",
    "footer",
    "dialog",
    "section",
    "form",
    "h1",
    "h2",
    "h3",
    "button",
    "a",
    "input",
    "textarea",
    "iframe",
  ]);
  /** What draws nothing of its own. */
  const UNDRAWN = new Set([
    "script",
    "style",
    "link",
    "meta",
    "template",
    "noscript",
  ]);
  const lines: string[] = [];
  const visit = (el: Element, depth: number) => {
    const r = el.getBoundingClientRect();
    const shows =
      r.width > 0 &&
      r.height > 0 &&
      el.checkVisibility({ opacityProperty: true, visibilityProperty: true });
    const attrs = [...el.attributes]
      .filter(
        (a) =>
          a.name === "role" ||
          a.name === "id" ||
          a.name === "href" ||
          a.name.startsWith("aria-") ||
          (a.name.startsWith("data-") &&
            a.name !== "data-sveltekit-preload-data")
      )
      .map((a) => `${a.name}=${JSON.stringify(a.value.slice(0, 60))}`);
    const own = [...el.childNodes]
      .filter((n) => n.nodeType === Node.TEXT_NODE)
      .map((n) => n.textContent ?? "")
      .join("")
      .replace(/\s+/g, " ")
      .trim();
    const landmark = LANDMARKS.has(el.localName);
    if (shows && (attrs.length > 0 || landmark || own)) {
      lines.push(
        `${"  ".repeat(depth)}${el.localName}${attrs.length ? ` ${attrs.join(" ")}` : ""} ${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}x${Math.round(r.height)}${own ? ` "${own.slice(0, 50)}"` : ""}`
      );
    }
    for (const kid of el.children) {
      if (!UNDRAWN.has(kid.localName)) {
        visit(kid, shows ? depth + 1 : depth);
      }
    }
  };
  visit(document.body, 0);
  return lines.join("\n");
}
