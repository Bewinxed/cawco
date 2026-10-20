/**
 * The lanes' capture: catalogue entries by name, each at 1440 and 390,
 * light and dark, written for a reviewer to read from git.
 *
 *   bun scripts/probe-kit/surfaces/capture.ts --label=<label> <entry>…
 *   bun scripts/probe-kit/surfaces/capture.ts --label=<label> --all
 *   bun scripts/probe-kit/surfaces/capture.ts --label=<label> <entry>… --outline
 *   bun scripts/probe-kit/surfaces/capture.ts --label=<label> <entry>… --reach
 *
 * An entry is `<surface>-<state>` as the catalogue names them
 * (catalogue.ts: `config-memory-deleted`, `session-attach-menu`,
 * `bench-delegate-tray-rest`). Each is walked as the surfaces walk walks it
 * (walk.ts, on the hub tapes, the clock held at the recording's moment),
 * and its ready assertion (catalogue `Ready`, ready.ts) is held before its
 * picture is taken: what only that state draws standing visible, and the
 * pass's theme drawn. An entry that does not hold is not captured; the run
 * says so with its name and what stood instead, and exits 1.
 *
 * Written outside the tracked tree, so a lane's `git status` stays clean:
 * `$TMPDIR/captures/audit-<label>/` (the ignored `.probe/captures/` with no
 * TMPDIR). It holds `<entry>-<desk|phone>-<light|dark>.png` (the state's
 * root: the viewport for a page, the open layer's box for a menu, sheet or
 * card) and `MANIFEST.tsv` (entry, width, theme, file, the ready
 * assertion's read). A second run into the same label replaces the entries
 * it names and keeps the others.
 *
 * Captures never go on a lane branch: their PNGs would carry it past what
 * the iOS landing step takes. They go on `cawco-audit/<label>`, cut from
 * the lane's head, as `.cutover/audit-<label>/`:
 *
 *   git switch -c cawco-audit/<label>
 *   cp -r "$TMPDIR/captures/audit-<label>" .cutover/
 *   git add .cutover/audit-<label> && git commit && git switch -
 * An entry the catalogue gives no phone (`widths`) is captured
 * at 1440 alone. `--outline` also writes each capture's outline (every
 * element a state can be told by) beside the run's output, in
 * `$TMPDIR/probe-kit/capture/`; a state that fails writes its own always.
 * `--reach` writes each capture's reach there too (`<capture>.reach.tsv`,
 * reach.ts): every control's drawn box and how far a press past each edge
 * still lands on it, held to the 44 Touch Rule, and what spills sideways.
 */
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Page } from "playwright-core";
import { entrySlug, ROOT, Run, type Spec } from "../kit";
import { type State, SURFACES, type Surface } from "./catalogue";
import { reachOf } from "./reach";
import { outline } from "./ready";
import { PASSES, type Pass, walkTapes } from "./walk";

// Six surfaces walked at once (walk.ts `PROBE_SURFACES`), unless the run says otherwise.
process.env.PROBE_SURFACES ??= "6";
const args = process.argv.slice(2);
const label = args
  .find((arg) => arg.startsWith("--label="))
  ?.slice("--label=".length);
const all = args.includes("--all");
const outlines = args.includes("--outline");
const reaches = args.includes("--reach");
const named = args.filter((arg) => !arg.startsWith("--"));
/** A label as a folder's name takes it: lower case, digits and dashes. */
const LABEL = /^[a-z0-9][a-z0-9-]*$/;
/** A capture's file name, whose outline and reach are written beside its name. */
const PNG = /\.png$/;

if (!(label && LABEL.test(label)) || (!all && named.length === 0)) {
  console.log(
    "usage: bun scripts/probe-kit/surfaces/capture.ts --label=<label> (<entry>… | --all) [--outline] [--reach]\n  writes $TMPDIR/captures/audit-<label>/ (outside the tree); commit it as .cutover/audit-<label>/ on cawco-audit/<label>, never on the lane branch"
  );
  process.exit(2);
}

/** Every entry the catalogue holds, by its name. */
const ENTRIES = new Map<string, { state: State; surface: Surface }>(
  SURFACES.flatMap((surface) =>
    surface.states.map(
      (state) => [`${surface.name}-${state.name}`, { surface, state }] as const
    )
  )
);
const unknown = named.filter((name) => !ENTRIES.has(name));
if (unknown.length > 0) {
  console.log(
    `no such entry: ${unknown.join(", ")} (an entry is <surface>-<state>; the catalogue has ${[...ENTRIES.keys()].join(", ")})`
  );
  process.exit(2);
}
const wanted = new Set(all ? ENTRIES.keys() : named);
/** The surfaces walked, each with only the states named. */
const surfaces: Surface[] = SURFACES.map((surface) => ({
  ...surface,
  states: surface.states.filter((state) =>
    wanted.has(`${surface.name}-${state.name}`)
  ),
})).filter((surface) => surface.states.length > 0);

/** 1440 and 390, light and dark. */
const CAPTURED = PASSES.filter(
  (pass) => !pass.reduced && (pass.width === "desk" || pass.width === "phone")
);
const PIXELS: Record<Pass["width"], number> = {
  desk: 1440,
  tablet: 820,
  phone: 390,
};

const OUT = join(
  process.env.TMPDIR ?? join(ROOT, ".probe"),
  "captures",
  `audit-${label}`
);
const MANIFEST = join(OUT, "MANIFEST.tsv");
const HEAD = "entry\twidth\ttheme\tfile\tready";

/**
 * Each layer with `will-change` painted again where it stands: Chromium
 * keeps such a layer's raster from the frame of its entrance that first
 * painted it (a hanging card's `will-change: translate`, a vaul drawer's
 * transform), so one state gave two pictures. Its `will-change` dropped for
 * two of the browser's frames, then put back as it was. Runs in the page.
 */
async function reraster(): Promise<void> {
  const held = [...document.querySelectorAll<HTMLElement>("*")].filter(
    (el) => getComputedStyle(el).willChange !== "auto"
  );
  const before = held.map((el) => ({
    value: el.style.getPropertyValue("will-change"),
    priority: el.style.getPropertyPriority("will-change"),
  }));
  for (const el of held) {
    el.style.setProperty("will-change", "auto", "important");
  }
  await window.__ssReader?.frames(2);
  held.forEach((el, i) => {
    const was = before[i];
    if (was?.value) {
      el.style.setProperty("will-change", was.value, was.priority);
    } else {
      el.style.removeProperty("will-change");
    }
  });
  await window.__ssReader?.frames(2);
}

/** The state's root inside the viewport, whole css px; the viewport for a page. */
async function clipOf(page: Page, root: string) {
  if (root === "body") {
    return;
  }
  const vp = page.viewportSize() ?? { width: 0, height: 0 };
  const box = await page.evaluate(
    (r) => window.__ssReader?.root(r) ?? null,
    root
  );
  if (!box) {
    throw new Error(`its root ${root} stands nowhere`);
  }
  const x = Math.max(0, Math.floor(box.x));
  const y = Math.max(0, Math.floor(box.y));
  return {
    x,
    y,
    width: Math.max(1, Math.min(vp.width, Math.ceil(box.x + box.width)) - x),
    height: Math.max(1, Math.min(vp.height, Math.ceil(box.y + box.height)) - y),
  };
}

/** The manifest's lines this run writes, by entry, width and theme. */
const lines = new Map<string, string>();
let failures = 0;

const spec: Spec = {
  name: "capture",
  async run(kit) {
    await mkdir(OUT, { recursive: true });
    const writeOutline = async (page: Page, file: string) => {
      await writeFile(join(kit.out, file), await page.evaluate(outline));
    };
    const { misses } = await walkTapes(
      kit,
      surfaces,
      CAPTURED,
      async ({ page, pass, ready, state, surface }) => {
        const entry = `${surface.name}-${state.name}`;
        const file = `${entrySlug(`${entry} ${pass.width} ${pass.theme}`)}.png`;
        const clip = await clipOf(page, state.root);
        await page.evaluate(reraster);
        await page.screenshot({
          path: join(OUT, file),
          clip,
          animations: "allow",
          caret: "hide",
          ...(state.mask
            ? { mask: state.mask(page), maskColor: "#ff00ff" }
            : {}),
        });
        if (outlines) {
          await writeOutline(page, file.replace(PNG, ".outline.txt"));
        }
        if (reaches) {
          await writeFile(
            join(kit.out, file.replace(PNG, ".reach.tsv")),
            await page.evaluate(reachOf)
          );
        }
        lines.set(
          `${entry}\t${PIXELS[pass.width]}\t${pass.theme}`,
          `${entry}\t${PIXELS[pass.width]}\t${pass.theme}\t${file}\t${ready.read}`
        );
        kit.check(
          `${entry} ${PIXELS[pass.width]} ${pass.theme}: ${ready.read}`,
          true
        );
      },
      async (what, why, page) => {
        failures += 1;
        // `<surface>/<state> · <width> <theme>`
        const [at, passName] = what.split(" · ");
        const [width, theme] = (passName ?? "").split(" ");
        const entry = (at ?? "").replace("/", "-");
        const px = PIXELS[width as Pass["width"]];
        lines.set(
          `${entry}\t${px}\t${theme}`,
          `${entry}\t${px}\t${theme}\t-\tFAIL ${why.replaceAll("\t", " ")}`
        );
        const slug = entrySlug(`${entry} ${width} ${theme}`);
        // The capture an earlier run took under this name shows another state now.
        await rm(join(OUT, `${slug}.png`), { force: true });
        const wrote = await writeOutline(page, `${slug}.outline.txt`).then(
          () => `; its outline: ${join(kit.out, `${slug}.outline.txt`)}`,
          () => ""
        );
        kit.check(`${entry} ${px} ${theme}`, false, `${why}${wrote}`);
      }
    );
    if (misses.length > 0) {
      kit.note(
        `the tapes answered ${misses.length} request(s) with "not on the tape": ${misses.slice(0, 8).join("; ")}`
      );
    }
    // The label's manifest: what it held for entries this run did not name, then this run's.
    const kept = existsSync(MANIFEST)
      ? (await readFile(MANIFEST, "utf8"))
          .split("\n")
          .slice(1)
          .filter(Boolean)
          .filter((line) => !wanted.has(line.split("\t")[0] ?? ""))
      : [];
    const rows = [...kept, ...lines.values()].sort();
    await writeFile(MANIFEST, `${[HEAD, ...rows].join("\n")}\n`);
    kit.note(
      `${lines.size - failures} capture(s), ${failures} not ready, in ${OUT} (MANIFEST.tsv): commit it as .cutover/audit-${label}/ on cawco-audit/${label}, never on the lane branch`
    );
  },
};

const run = new Run();
try {
  await run.spec(spec, null);
} finally {
  await run.close();
}
if (run.failed.length > 0) {
  console.log(`FAILED:\n${run.failed.join("\n")}`);
}
console.log(
  run.failures === 0
    ? `ALL READY (${lines.size} captures)`
    : `${run.failures} FAILED (${lines.size} entries × passes)`
);
process.exit(run.failures === 0 ? 0 : 1);
