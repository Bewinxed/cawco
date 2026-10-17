/**
 * `bun .cutover/i2-exact.ts [name filter]`: integration 2's exactness proof.
 * Each case in i2-cases.ts is an element (with the ancestors its states need)
 * written twice: as ac7b79de8 rendered it and as the converted tree does.
 * Each side is its own page in Chromium:
 * - T: T's Tailwind build (T's src/app.css, from `git archive ac7b79de8`)
 *   for exactly the classes on the page, then the case's components' own
 *   `<style>` as Svelte compiled it at T;
 * - now: this tree's build and its components' residual `<style>`, the same
 *   way.
 * A component's scoped class (`svelte-<hash>`, read from its compiled CSS)
 * goes where the case writes `{S0}`, `{S1}` … for its files in order.
 * Every state (viewport width, attributes, forced pseudo-classes through the
 * CDP's `CSS.forcePseudoState`, dark) is applied to both pages, and every
 * standard computed property of each `[data-check]` element (and its
 * `::before`/`::after` with `data-check-pseudo`) must be equal. Custom
 * properties are left out: the token sheets differ by the cutover's added
 * tokens, and what they feed is read through the standard properties. A
 * component's own @keyframes name is read without its scope hash, and the
 * compare's three equality rules hold (`equalised`). Before reading,
 * transitions are finished and animations held at their start. The T page
 * also loads the sheets components imported themselves at T (ns-theme.css,
 * workflows.css), as Vite did.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, symlinkSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { plugin } from "bun";
import { chromium, type Page } from "playwright-core";
import type { Case, State } from "./i2-cases";
import { T, T_DIR } from "./i2-tree";

const MODULE_SCRIPT = /<script lang="ts" module>([\s\S]*?)<\/script>/;
const SVELTE = /\.svelte$/;
const MAX_BUFFER = 64 * 1024 * 1024;
// A kit part's recipe is its module script; the cases call it, T's and now's.
plugin({
  name: "i2-exact",
  setup(build) {
    build.onLoad({ filter: SVELTE }, (args) => ({
      contents: readFileSync(args.path, "utf8").match(MODULE_SCRIPT)?.[1] ?? "",
      loader: "ts",
    }));
  },
});

const root = resolve(import.meta.dir, "..");
const app = join(root, "apps/dashboard");
const appRequire = createRequire(join(app, "package.json"));
const viteRequire = createRequire(
  join(app, "node_modules/@tailwindcss/vite/package.json")
);
const { compile: compileSvelte, preprocess } = await import(
  pathToFileURL(appRequire.resolve("svelte/compiler")).href
);
const { vitePreprocess } = await import(
  pathToFileURL(appRequire.resolve("@sveltejs/vite-plugin-svelte")).href
);
const tailwind = await import(
  pathToFileURL(viteRequire.resolve("@tailwindcss/node")).href
);

const SCOPE = /\.(svelte-[a-z0-9]+)/;
const SHEETS = [
  "src/lib/cawco/spawn/ns-theme.css",
  "src/lib/components/features/workflows/workflows.css",
];
const CLASS_ATTR = /class="([^"]*)"/g;
const SPACE = /\s+/;

/** ac7b79de8's apps/dashboard, with this tree's dependencies beside it. */
function tTree(): string {
  const dash = join(T_DIR, "apps/dashboard");
  if (!existsSync(join(dash, "src/app.css"))) {
    mkdirSync(T_DIR, { recursive: true });
    execFileSync(
      "sh",
      [
        "-c",
        `git -C "$0" archive ${T} apps/dashboard | tar -x -C "$1"`,
        root,
        T_DIR,
      ],
      { stdio: "inherit" }
    );
    symlinkSync(join(app, "node_modules"), join(dash, "node_modules"));
    symlinkSync(join(root, "node_modules"), join(T_DIR, "node_modules"));
  }
  return dash;
}

interface Built {
  css: string;
  scopes: string[];
}

/** A component's compiled `<style>` and its scope class, at T or now. */
async function componentCss(
  file: string,
  dash: string,
  source: string
): Promise<{ css: string; scope: string }> {
  const path = join(dash, file);
  const { code } = await preprocess(source, vitePreprocess(), {
    filename: path,
  });
  const { css } = compileSvelte(code, {
    filename: path,
    dev: true,
    css: "external",
    experimental: { async: true },
  });
  const text: string = css?.code ?? "";
  return { css: text, scope: text.match(SCOPE)?.[1] ?? "" };
}

async function side(
  dash: string,
  readSource: (file: string) => string,
  files: string[],
  html: string
): Promise<Built & { html: string }> {
  const parts = await Promise.all(
    files.map((f) => componentCss(f, dash, readSource(f)))
  );
  let body = html;
  parts.forEach((p, i) => {
    body = body.replaceAll(`{S${i}}`, p.scope);
  });
  const candidates = [
    ...new Set(
      [...body.matchAll(CLASS_ATTR)].flatMap((m) =>
        m[1].split(SPACE).filter(Boolean)
      )
    ),
  ];
  const compiler = await tailwind.compile(
    readFileSync(join(dash, "src/app.css"), "utf8"),
    { base: join(dash, "src"), onDependency: () => undefined }
  );
  // The sheets components imported themselves (at T, ns-theme.css and
  // workflows.css, before they joined app.css's graph), as Vite loads them.
  const imported = SHEETS.filter(
    (s) =>
      !readFileSync(join(dash, "src/app.css"), "utf8").includes(
        s.split("/").pop() ?? ""
      )
  )
    .map((s) => readFileSync(join(dash, s), "utf8"))
    .join("\n");
  return {
    css: `${compiler.build(candidates)}\n${imported}\n${parts.map((p) => p.css).join("\n")}`,
    scopes: parts.map((p) => p.scope),
    html: body,
  };
}

async function apply(page: Page, state: State): Promise<void> {
  await page.setViewportSize({ width: state.width ?? 1280, height: 800 });
  await page.emulateMedia({ reducedMotion: state.motion ?? "no-preference" });
  await page.evaluate(
    ({ attrs, dark }) => {
      document.documentElement.classList.toggle("dark", Boolean(dark));
      for (const a of attrs ?? []) {
        for (const el of document.querySelectorAll(a.sel)) {
          if (a.value === null) {
            el.removeAttribute(a.name);
          } else {
            el.setAttribute(a.name, a.value);
          }
        }
      }
    },
    { attrs: state.attrs, dark: state.dark }
  );
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("DOM.enable");
  await cdp.send("CSS.enable");
  const { root: doc } = await cdp.send("DOM.getDocument", { depth: -1 });
  await Promise.all(
    (state.force ?? []).map(async (f) => {
      const { nodeIds } = await cdp.send("DOM.querySelectorAll", {
        nodeId: doc.nodeId,
        selector: f.sel,
      });
      await Promise.all(
        nodeIds.map((nodeId) =>
          cdp.send("CSS.forcePseudoState", {
            nodeId,
            forcedPseudoClasses: f.pseudo,
          })
        )
      );
    })
  );
  // A state change starts transitions (a row's `transition-colors` across a
  // breakpoint): read their end. Animations are held at their start on both
  // pages, so a running one reads the same frame.
  await page.evaluate(() => {
    for (const a of document.getAnimations()) {
      if (a instanceof CSSTransition) {
        a.finish();
      } else {
        a.pause();
        a.currentTime = 0;
      }
    }
  });
}

/** A computed list split at its top-level commas. */
function splitTop(value: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let from = 0;
  for (let i = 0; i < value.length; i += 1) {
    const ch = value[i];
    if (ch === "(") {
      depth += 1;
    } else if (ch === ")") {
      depth -= 1;
    } else if (ch === "," && depth === 0) {
      out.push(value.slice(from, i).trim());
      from = i + 1;
    }
  }
  out.push(value.slice(from).trim());
  return out;
}

const BLANK_SHADOW = "rgba(0, 0, 0, 0) 0px 0px 0px 0px";
const TRANSITION_LISTS = [
  "transition-duration",
  "transition-delay",
  "transition-timing-function",
  "transition-behavior",
];
const ZERO_OFFSET = /(^|\s)0(px|%)(?=\s|$)/g;

/**
 * The style compare's three equality rules, as phase 2's compare applies
 * them: a box-shadow layer that is exactly transparent and zero draws
 * nothing; a transition longhand list is used repeated to
 * transition-property's length (CSS Transitions 1 §2); a zero
 * background-position offset is the same in any unit.
 */
function equalised(values: Record<string, string>): Record<string, string> {
  const out = { ...values };
  if (out["box-shadow"] !== undefined) {
    const layers = splitTop(out["box-shadow"]).filter(
      (l) => l !== BLANK_SHADOW
    );
    out["box-shadow"] = layers.length ? layers.join(", ") : "none";
  }
  const { length } = splitTop(out["transition-property"] ?? "");
  for (const name of TRANSITION_LISTS) {
    if (out[name] !== undefined) {
      const list = splitTop(out[name]);
      out[name] = Array.from({ length }, (_, i) => list[i % list.length]).join(
        ", "
      );
    }
  }
  for (const name of [
    "background-position",
    "background-position-x",
    "background-position-y",
  ]) {
    if (out[name] !== undefined) {
      out[name] = out[name].replace(ZERO_OFFSET, "$10");
    }
  }
  return out;
}

function read(page: Page): Promise<Record<string, Record<string, string>>> {
  return page.evaluate(() => {
    const out: Record<string, Record<string, string>> = {};
    const take = (key: string, style: CSSStyleDeclaration) => {
      const values: Record<string, string> = {};
      for (const name of style) {
        if (!name.startsWith("--")) {
          // A component's own @keyframes are named for its scope hash,
          // which differs with its stylesheet's text.
          values[name] = style
            .getPropertyValue(name)
            .replace(/svelte-[a-z0-9]+-/g, "svelte-*-");
        }
      }
      out[key] = values;
    };
    for (const el of document.querySelectorAll<HTMLElement>("[data-check]")) {
      const key = el.dataset.check ?? "";
      take(key, getComputedStyle(el));
      if (el.hasAttribute("data-check-pseudo")) {
        take(`${key}::before`, getComputedStyle(el, "::before"));
        take(`${key}::after`, getComputedStyle(el, "::after"));
      }
    }
    return out;
  });
}

const tDash = tTree();
const { CASES } = await import("./i2-cases");
const filter = process.argv[2] ?? "";
const cases = CASES.filter((c) => c.name.includes(filter));
const browser = await chromium.launch();
let states = 0;
let differ = 0;
// Cases and their states run one at a time: each state is applied to both
// pages, then both are read, before the next.
for (const c of cases as Case[]) {
  const files = c.files ?? [];
  // biome-ignore lint/performance/noAwaitInLoops: one case's pages at a time
  const built = await Promise.all([
    side(
      tDash,
      (f) =>
        execFileSync("git", ["-C", root, "show", `${T}:apps/dashboard/${f}`], {
          encoding: "utf8",
          maxBuffer: MAX_BUFFER,
        }),
      files,
      c.t
    ),
    side(app, (f) => readFileSync(join(app, f), "utf8"), files, c.now),
  ]);
  const pages: Page[] = await Promise.all(
    built.map(async (s) => {
      const page = await browser.newPage();
      await page.setContent(
        `<!doctype html><html><head><style>${s.css}</style></head><body>${s.html}</body></html>`,
        { waitUntil: "domcontentloaded" }
      );
      return page;
    })
  );
  for (const state of c.states ?? [{ name: "rest" }]) {
    // biome-ignore lint/performance/noAwaitInLoops: a state is applied and read before the next is applied
    await Promise.all(pages.map((page) => apply(page, state)));
    const [t, now] = (await Promise.all(pages.map(read))).map((values) =>
      Object.fromEntries(
        Object.entries(values).map(([k, v]) => [k, equalised(v)])
      )
    );
    for (const key of Object.keys(t)) {
      states += 1;
      const diffs = Object.keys(t[key]).filter(
        (p) => t[key][p] !== now[key]?.[p]
      );
      const shown = (c.show ?? [])
        .map((p) => `${p} ${now[key]?.[p]}`)
        .join("; ");
      if (diffs.length > 0 || !now[key]) {
        differ += 1;
        console.log(
          `DIFFER ${c.name} [${state.name}] ${key}: ${
            now[key]
              ? diffs
                  .map((p) => `${p} ${t[key][p]} → ${now[key][p]}`)
                  .join("; ")
              : "missing in the converted page"
          }`
        );
      } else {
        console.log(
          `same ${c.name} [${state.name}] ${key}: ${Object.keys(t[key]).length} properties${shown ? `; ${shown}` : ""}`
        );
      }
    }
  }
  await Promise.all(pages.map((p) => p.close()));
}
await browser.close();
console.log(
  `i2-exact: ${cases.length} cases, ${states} element states, ${differ} differ`
);
process.exit(differ ? 1 : 0);
