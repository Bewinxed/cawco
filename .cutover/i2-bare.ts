/**
 * One class at ac7b79de8 against what it became, on bare elements: T's
 * classes on T's build (T's src/app.css), the converted classes (with the
 * element's literal custom properties) on this tree's build, each its own
 * Chromium page. Every standard computed property of the element, its
 * `::before`/`::after`/`::placeholder` and an `<svg>` and a `<span>` child is
 * compared, at rest and in every state T's class's variants name: the
 * pseudo-class forced (on the parent for a `group-` one), the breakpoint
 * either side of its line, dark, the attribute set. i2-codemod.ts proves
 * its pairs through this.
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { type Browser, chromium, type Page } from "playwright-core";
import { T_DIR } from "./i2-tree";
import { parts } from "./i2-vocab";

const app = resolve(import.meta.dir, "../apps/dashboard");
const tApp = join(T_DIR, "apps/dashboard");
const viteRequire = createRequire(
  join(app, "node_modules/@tailwindcss/vite/package.json")
);
const tailwind = await import(
  pathToFileURL(viteRequire.resolve("@tailwindcss/node")).href
);
const SPACE = /\s+/;
const ATTR_VARIANT =
  /^(aria|data)-(?:\[([\w-]+)(?:=["']?([^\]"']*)["']?)?\]|([\w-]+))$/;
const WIDTHS: Record<string, number[]> = {
  sm: [500, 700],
  phone: [500, 700],
  "max-sm": [500, 700],
  "max-phone": [500, 700],
  md: [700, 900],
  "min-[48rem]": [700, 900],
  lg: [900, 1100],
  "min-[64rem]": [900, 1100],
};
const PSEUDO = new Set([
  "hover",
  "focus",
  "focus-visible",
  "focus-within",
  "active",
]);

export interface Pair {
  /** T's class (or classes) on the element. */
  from: string;
  label: string;
  /** Literal custom properties the converted element sets. */
  style?: string;
  /** The converted class (or classes). */
  to: string;
}

interface Probe {
  attrs: [string, string][];
  dark: boolean;
  name: string;
  parentAttrs: [string, string][];
  parentPseudo: string[];
  pseudo: string[];
  width: number;
}

/** The attribute an `aria-*`/`data-*` variant tests, and the value that holds it. */
function attrOf(v: string): [string, string] | null {
  const m = ATTR_VARIANT.exec(v.split("/")[0]);
  if (!m) {
    return null;
  }
  return [`${m[1]}-${m[2] ?? m[4]}`, m[3] ?? (m[1] === "aria" ? "true" : "")];
}

/** What holds a variant other than a breakpoint, as a change to the rest probe. */
function heldBy(v: string): Partial<Probe> | null {
  if (v === "dark") {
    return { dark: true };
  }
  if (PSEUDO.has(v)) {
    return { pseudo: [v] };
  }
  if (v === "disabled") {
    return { attrs: [["disabled", ""]] };
  }
  const attr = attrOf(v);
  if (attr) {
    return { attrs: [attr] };
  }
  if (!v.startsWith("group-")) {
    return null;
  }
  const groupAttr = attrOf(v.slice(6));
  if (groupAttr) {
    return { parentAttrs: [groupAttr] };
  }
  const [groupPseudo] = v.slice(6).split("/");
  return PSEUDO.has(groupPseudo) ? { parentPseudo: [groupPseudo] } : null;
}

/** The states a variant names, and the one that holds it. */
function statesOf(
  v: string
): { each: Partial<Probe>[]; held: Partial<Probe> } | null {
  const widths = WIDTHS[v];
  if (widths) {
    return {
      each: widths.map((w) => ({ name: `${v} at ${w}`, width: w })),
      held: { width: v.startsWith("max") ? widths[0] : widths[1] },
    };
  }
  const held = heldBy(v);
  return held && { each: [{ ...held, name: v }], held };
}

function probes(classes: string): Probe[] {
  const base: Probe = {
    attrs: [],
    dark: false,
    name: "rest",
    parentAttrs: [],
    parentPseudo: [],
    pseudo: [],
    width: 1280,
  };
  const all: Probe = {
    ...base,
    attrs: [],
    name: "all its states",
    parentAttrs: [],
    parentPseudo: [],
    pseudo: [],
  };
  const out: Probe[] = [base];
  const variants = new Set(
    classes.split(SPACE).flatMap((c) => parts(c).variants)
  );
  for (const v of variants) {
    const states = statesOf(v);
    if (!states) {
      continue;
    }
    out.push(...states.each.map((s) => ({ ...base, ...s })));
    const { held } = states;
    all.width = held.width ?? all.width;
    all.dark ||= held.dark ?? false;
    all.attrs.push(...(held.attrs ?? []));
    all.parentAttrs.push(...(held.parentAttrs ?? []));
    all.pseudo.push(...(held.pseudo ?? []));
    all.parentPseudo.push(...(held.parentPseudo ?? []));
  }
  if (out.length > 2) {
    out.push(all);
  }
  return out;
}

const compilers = {
  now: await tailwind.compile(readFileSync(join(app, "src/app.css"), "utf8"), {
    base: join(app, "src"),
    onDependency: () => undefined,
  }),
  t: await tailwind.compile(readFileSync(join(tApp, "src/app.css"), "utf8"), {
    base: join(tApp, "src"),
    onDependency: () => undefined,
  }),
};

async function page(
  browser: Browser,
  side: "t" | "now",
  classes: string,
  style: string,
  shape: string
): Promise<Page> {
  const variants = classes.split(SPACE).flatMap((c) => parts(c).variants);
  const groups = variants
    .filter((v) => v.startsWith("group-"))
    .map((v) => (v.includes("/") ? `group/${v.split("/").at(-1)}` : "group"));
  const tag = variants.includes("disabled") ? "button" : "div";
  const element =
    shape === "input"
      ? `<input data-check class="${classes}" style="${style}" placeholder="x">`
      : `<${tag} data-check class="${classes}" style="${style}"><svg data-child="svg"></svg><span data-child="span">x</span></${tag}>`;
  const p = await browser.newPage();
  await p.setContent(
    `<!doctype html><html><head><style>${compilers[side].build([...classes.split(SPACE), ...groups])}</style></head><body><div data-parent class="${["group", ...groups].join(" ")}">${element}</div></body></html>`,
    { waitUntil: "domcontentloaded" }
  );
  return p;
}

async function read(p: Page, probe: Probe): Promise<Record<string, string>> {
  await p.setViewportSize({ width: probe.width, height: 800 });
  await p.evaluate((pr) => {
    document.documentElement.classList.toggle("dark", pr.dark);
    const el = document.querySelector("[data-check]") as HTMLElement;
    const parent = document.querySelector("[data-parent]") as HTMLElement;
    for (const [n, v] of pr.attrs) {
      el.setAttribute(n, v);
    }
    for (const [n, v] of pr.parentAttrs) {
      parent.setAttribute(n, v);
    }
  }, probe);
  const cdp = await p.context().newCDPSession(p);
  await cdp.send("DOM.enable");
  await cdp.send("CSS.enable");
  const { root: doc } = await cdp.send("DOM.getDocument", { depth: -1 });
  await Promise.all(
    (
      [
        ["[data-check]", probe.pseudo],
        ["[data-parent]", probe.parentPseudo],
      ] as const
    ).map(async ([selector, pseudo]) => {
      const { nodeId } = await cdp.send("DOM.querySelector", {
        nodeId: doc.nodeId,
        selector,
      });
      if (!nodeId) {
        throw new Error(`${selector} did not parse where it is written`);
      }
      await cdp.send("CSS.forcePseudoState", {
        forcedPseudoClasses: [...pseudo],
        nodeId,
      });
    })
  );
  return p.evaluate(() => {
    // A transition ends at its value; an animation holds its first frame on
    // both pages.
    for (const a of document.getAnimations()) {
      if (a instanceof CSSTransition) {
        a.finish();
      } else {
        a.pause();
        a.currentTime = 0;
      }
    }
    const out: Record<string, string> = {};
    const take = (key: string, style: CSSStyleDeclaration) => {
      for (const name of style) {
        if (!name.startsWith("--")) {
          out[`${key} ${name}`] = style.getPropertyValue(name);
        }
      }
    };
    const el = document.querySelector("[data-check]") as Element;
    take("element", getComputedStyle(el));
    for (const pseudo of ["::before", "::after", "::placeholder"]) {
      take(pseudo, getComputedStyle(el, pseudo));
    }
    for (const child of el.querySelectorAll("[data-child]")) {
      take(
        `child ${(child as HTMLElement).dataset.child}`,
        getComputedStyle(child)
      );
    }
    return out;
  });
}

/** Every pair on bare elements: the states compared, and each difference. */
export async function compareBare(
  pairs: Pair[]
): Promise<{ differ: string[]; states: number }> {
  const browser = await chromium.launch();
  const differ: string[] = [];
  let states = 0;
  for (const pair of pairs) {
    const shape = pair.from.split(SPACE).some((c) => c.includes("placeholder"))
      ? "input"
      : "div";
    // biome-ignore lint/performance/noAwaitInLoops: one pair's pages at a time
    const [t, now] = await Promise.all([
      page(browser, "t", pair.from, "", shape),
      page(browser, "now", pair.to, pair.style ?? "", shape),
    ]);
    for (const probe of probes(pair.from)) {
      states += 1;
      // biome-ignore lint/performance/noAwaitInLoops: a probe's state is set and read before the next
      const [a, b] = await Promise.all([read(t, probe), read(now, probe)]);
      const diffs = Object.keys(a).filter((k) => a[k] !== b[k]);
      if (diffs.length) {
        differ.push(
          `DIFFER ${pair.label} [${probe.name}]: ${diffs.map((k) => `${k} ${a[k]} → ${b[k]}`).join("; ")}`
        );
      }
    }
    await Promise.all([t.close(), now.close()]);
  }
  await browser.close();
  return { differ, states };
}
