/**
 * The style snapshot's elements, each with the `.svelte` files that wrote it:
 * for `snapshot-triage.ts --files=<this file's output>`, which then names the
 * file behind every difference.
 *
 *   bun scripts/probe-kit/run.ts snapshot-attribution --surfaces=a,b --out=<file.json>
 *
 * It walks the same surfaces, states and passes as the style snapshot (the
 * hub tape; light passes only, since a theme changes no element), on the
 * dev server, where Svelte gives each element `__svelte_meta`: the file and
 * line that wrote it and the component instances above it. Every element is
 * keyed as the snapshot keys it (its DOM path from the state's root,
 * `tag:n` per step), so a difference's key finds its files.
 *
 * The dev server builds a page's modules on its first request, so a page
 * is read only once its client has started: the walk's own page is
 * reloaded, and read when its root carries `__svelte_meta` (a server-
 * rendered element has none until the client hydrates it). The state's act
 * runs again on the reloaded page. A state whose root never hydrates is
 * written with no files, and named in a NOTE.
 *
 * Output: `{ "<surface>": { "<state> · <pass>": { "<key>": ["<file>", …] } } }`,
 * the element's own file first, then each component instance's above it,
 * nearest first.
 */
import { writeFile } from "node:fs/promises";
import type { Page } from "playwright-core";
import { player, readTape } from "../hub-tape";
import type { Spec } from "../kit";
import { chosen, type State } from "../surfaces/catalogue";
import { PASSES, Servers, TAPE, walk } from "../surfaces/walk";

const flag = (name: string): string | undefined =>
  process.argv
    .find((arg) => arg.startsWith(`--${name}=`))
    ?.slice(name.length + 3);

/** How long a reloaded page has to hydrate its root. */
const HYDRATE_MS = 60_000;
/** How long the count of attributed elements must hold before a read. */
const STEADY_MS = 1000;

/**
 * Waits until the elements under `selector` that carry `__svelte_meta` are
 * more than none and their count has held for STEADY_MS. Under async Svelte
 * a page hydrates in parts (a boundary after its `await`), so one hydrated
 * element is no sign the rest are.
 */
function steady(page: Page, selector: string): Promise<boolean> {
  return page
    .waitForFunction(
      ({ within, steadyMs }) => {
        const roots = [...document.querySelectorAll(within)];
        let count = 0;
        for (const root of roots) {
          for (const el of [root, ...root.querySelectorAll("*")]) {
            if ((el as unknown as { __svelte_meta?: unknown }).__svelte_meta) {
              count += 1;
            }
          }
        }
        const held = window as unknown as {
          __attribution?: Record<string, { count: number; since: number }>;
        };
        held.__attribution ??= {};
        const last = held.__attribution[within];
        const now = performance.now();
        if (count === 0 || last?.count !== count) {
          held.__attribution[within] = { count, since: now };
          return false;
        }
        return now - last.since >= steadyMs;
      },
      { within: selector, steadyMs: STEADY_MS },
      { timeout: HYDRATE_MS, polling: 200 }
    )
    .then(() => true)
    .catch(() => false);
}

/**
 * The page reloaded and read once its client has started (the dev server
 * builds a page's modules on its first request, so the walk's own load can
 * still be the server's markup, which carries no `__svelte_meta`): the whole
 * page steady, then the state's act run again, then its root steady.
 */
async function hydrated(page: Page, state: State): Promise<boolean> {
  await page.reload({ waitUntil: "domcontentloaded" });
  if (!(await steady(page, "body"))) {
    return false;
  }
  if (state.act) {
    await state.act(page);
  }
  return steady(page, state.root);
}

/** Every element under the state's root (as the snapshot picks it), by key, with its files. */
function keysAndFiles(selector: string): Record<string, string[]> {
  const SKIP = new Set([
    "SCRIPT",
    "STYLE",
    "LINK",
    "META",
    "TEMPLATE",
    "NOSCRIPT",
    "TITLE",
    "BASE",
  ]);
  const all = [...document.querySelectorAll(selector)];
  const shown = all.filter((el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  });
  let root: Element | null = null;
  let most = -1;
  for (const el of shown.length > 0 ? shown : all) {
    const n = el.getElementsByTagName("*").length;
    if (n > most) {
      root = el;
      most = n;
    }
  }
  const out: Record<string, string[]> = {};
  if (!root) {
    return out;
  }
  interface Frame {
    file?: string;
    parent?: Frame | null;
  }
  const filesOf = (el: Element) => {
    const meta = (
      el as unknown as {
        __svelte_meta?: { loc?: { file?: string }; parent?: Frame | null };
      }
    ).__svelte_meta;
    const files: string[] = meta?.loc?.file ? [meta.loc.file] : [];
    for (let up = meta?.parent; up; up = up.parent) {
      if (up.file && files.at(-1) !== up.file) {
        files.push(up.file);
      }
    }
    return files;
  };
  const visit = (el: Element, key: string) => {
    out[key] = filesOf(el);
    const counts = new Map<string, number>();
    const kids = [
      ...el.children,
      ...(el.shadowRoot ? [...el.shadowRoot.children] : []),
    ];
    for (const kid of kids) {
      if (SKIP.has(kid.tagName)) {
        continue;
      }
      const tag = kid.tagName.toLowerCase();
      const n = (counts.get(tag) ?? 0) + 1;
      counts.set(tag, n);
      const inShadow = kid.parentNode instanceof ShadowRoot;
      visit(kid, `${key} > ${inShadow ? "#shadow>" : ""}${tag}:${n}`);
    }
  };
  visit(root, root.tagName.toLowerCase());
  return out;
}

const spec: Spec = {
  name: "snapshot-attribution",
  async run(kit) {
    const out = flag("out");
    if (!out) {
      kit.check("--out=<file.json> names where the attribution goes", false);
      return;
    }
    const surfaces = chosen(flag("surfaces"));
    const tape = await readTape(TAPE);
    const hub = player(tape);
    const servers = new Servers(kit, hub);
    const map: Record<string, Record<string, Record<string, string[]>>> = {};
    let elements = 0;
    let attributed = 0;
    try {
      await walk(
        kit,
        servers,
        tape,
        surfaces.map((s) => ({ ...s, serve: "dev" as const })),
        PASSES.filter((p) => p.theme === "light"),
        async ({ page, pass, state, surface }) => {
          if (!(await hydrated(page, state))) {
            kit.note(
              `${surface.name}/${state.name} · ${pass.name}: its root did not hydrate in ${HYDRATE_MS / 1000}s`
            );
          }
          const keys = await page.evaluate(keysAndFiles, state.root);
          const files = Object.values(keys);
          elements += files.length;
          attributed += files.filter((f) => f.length > 0).length;
          map[surface.name] ??= {};
          (map[surface.name] as Record<string, Record<string, string[]>>)[
            `${state.name} · ${pass.name}`
          ] = keys;
        },
        (what, why) => kit.note(`${what}: did not open (${why})`)
      );
    } finally {
      await servers.close();
      hub.stop();
    }
    await writeFile(out, JSON.stringify(map));
    kit.check(
      `${attributed} of ${elements} elements carry their files (${out})`,
      elements > 0
    );
  },
};
export default spec;
