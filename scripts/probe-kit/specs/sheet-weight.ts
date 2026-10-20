/**
 * A sheet loads the piece it shows, not the app around it, and every sheet
 * and folder preview reports its weight (the owner: "i feel u keep loasomg
 * tbe entire website runtime in each preciew insyead of whay is needed").
 * Read from the engine and the stage's own answers, never from pixels.
 *
 * On the dashboard's stage (stage-host/host.ts, bundled and started in
 * apps/dashboard as the daemon starts it, minus the workspace boundary,
 * which no delegate's workspace can make), on scratch story files:
 *
 * 1. A story importing the fleet store reports its weight, and its
 *    `heaviest` names that import first. Held by a fixture the story mounts
 *    (the pairing sheet's NeedsStop holding CawPanel), `heaviest` names the
 *    fixture and its `via` the fleet store under it.
 * 2. `bun x biome lint` refuses that story with the rule's message
 *    (biome.jsonc's noRestrictedImports override).
 * 3. With the import cut, the same sheet weighs less than it did, and
 *    nothing it imports is the fleet store.
 * 4. A story whose component calls `goto` and reads `page`: the call logs
 *    `[cawco] goto on a sheet does nothing` and the frame stays on the
 *    sheet; it loaded the stage's `cawco:kit/` stubs and no module of
 *    SvelteKit's client runtime (`@sveltejs/kit/src/runtime/client`).
 * 4b. On the empty states' own states file (EmptyStarts.stories.ts), every
 *    two-word button label is one text node in one face, and the gap
 *    between its first two words' text boxes is the same across them.
 *
 * On a scratch fleet, through the session's own MCP tool:
 *
 * 5. `artifact_create(kind: "preview", dir)` answers the folder's `weight`:
 *    its files, bytes, js and wasm, as the folder holds them, and its start
 *    page's desk captures (none: it holds no picture).
 */
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildStageHost } from "../../../packages/agent/src/stage-host/build";
import type { SheetWeight } from "../../../packages/core/src/stage";
import { type Reply, type Seen, until } from "../../scratch-fleet";
import { type Kit, ROOT, type Spec } from "../kit";

const APP = join(ROOT, "apps/dashboard");
/** The scratch stories' folder, under `src/` (SvelteKit serves only that); gone when the spec ends. */
const SCRATCH = "src/lib/cawco/probe-sheet-weight";
/** The empty states' own states file, its buttons read in 4b. */
const EMPTY_STARTS = "src/lib/components/ui/empty/EmptyStarts.stories.ts";
/** Its two-word button labels the review read, and their siblings. */
const SPACED = [
  "Add machine",
  "Add server",
  "Ask Caw for this view",
  "Remove the filter",
  "Open Updates",
  "Ask Claude Code for a hook",
];
const FLEET_STORE = "#lib/cawco/client.svelte.js";
const KIT_CLIENT = "@sveltejs/kit/src/runtime/client";
const GOTO_SAID = "[cawco] goto on a sheet does nothing";
const LINT_SAID =
  "The fleet store is the live app; a sheet takes its state as fixtures in args.";

/** The story over the fleet store, and the same story with that import cut. */
const fleetStory = (
  store: boolean
) => `${store ? `import { isStale } from "${FLEET_STORE}";\n` : ""}import StatTile from "../StatTile.svelte";

export default {
  component: StatTile,
  args: { label: "Stale", value: ${store ? 'String(isStale({ status: "unknown" } as never))' : '"true"'} },
};

export const One = { args: {} };
`;

/** A fixture that holds the piece inside the live shell, as the pairing sheet's NeedsStop held CawPanel. */
const HOLDER = `<script lang="ts">
  import { isStale } from "${FLEET_STORE}";
  import StatTile from "../StatTile.svelte";
</script>

<StatTile label="Stale" value={String(isStale({ status: "unknown" } as never))} />
`;

const HOLDER_STORY = `import Holder from "./Holder.svelte";

export default { component: Holder, args: {} };

export const Held = { args: {} };
`;

const GOES = `<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/state";

  goto("/elsewhere");
  (window as unknown as { __page: string }).__page = page.url.pathname;
</script>

<p>goes</p>
`;

const GOES_STORY = `import Goes from "./Goes.svelte";

export default { component: Goes, args: {} };

export const Once = { args: {} };
`;

const said = (weight: SheetWeight | null) =>
  weight
    ? `${weight.modules} modules, ${weight.bytes} B (deps ${weight.deps.modules}, ${weight.deps.bytes} B); heaviest ${weight.heaviest.map((one) => `${one.specifier} ${one.modules}/${one.bytes} B via [${one.via.join(" → ")}]`).join(", ")}`
    : "no weight";

/** A port nothing holds now. */
const freePort = async (): Promise<number> => {
  const lease = Bun.serve({ port: 0, fetch: () => new Response(null) });
  const port = lease.port as number;
  await lease.stop(true);
  return port;
};

/** Checks 1–4, on the dashboard's stage. */
const stageChecks = async (kit: Kit) => {
  const dir = join(APP, SCRATCH);
  mkdirSync(dir, { recursive: true });
  const fleet = join(dir, "Fleet.stories.ts");
  writeFileSync(fleet, fleetStory(true));
  writeFileSync(join(dir, "Holder.svelte"), HOLDER);
  writeFileSync(join(dir, "Holder.stories.ts"), HOLDER_STORY);
  writeFileSync(join(dir, "Goes.svelte"), GOES);
  writeFileSync(join(dir, "Goes.stories.ts"), GOES_STORY);
  const host = join(APP, ".cawco/stage/host.mjs");
  mkdirSync(join(APP, ".cawco/stage"), { recursive: true });
  writeFileSync(host, await buildStageHost());
  const port = await freePort();
  const stage = spawn("bun", [host], {
    cwd: APP,
    env: {
      ...process.env,
      CAWCO_STAGE: "1",
      CAWCO_STAGE_PORT: String(port),
      CAWCO_STAGE_FRAMEWORK: "svelte",
      CAWCO_STAGE_KIT: "1",
      CAWCO_STAGE_TOOLCHAIN: "vite",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let words = "";
  stage.stdout.on("data", (chunk: Buffer) => {
    words += chunk.toString("utf8");
  });
  stage.stderr.on("data", (chunk: Buffer) => {
    words += chunk.toString("utf8");
  });
  try {
    await until(
      "the stage's ready",
      () => words,
      (text) => text.includes('"cawco":"ready"'),
      60_000
    );
    const base = `http://127.0.0.1:${port}`;
    const page = await kit.page("desk");
    const logged: string[] = [];
    page.on("console", (message) => logged.push(message.text()));
    /** What went wrong loading a sheet: its page's errors and refused modules. */
    const wrong: string[] = [];
    page.on("pageerror", (error) => wrong.push(`pageerror ${error.message}`));
    page.on("response", (response) => {
      if (response.status() >= 400) {
        wrong.push(`${response.status()} ${response.url()}`);
      }
    });
    /** Why a weight came back short: the page's errors, then the stage's last words. */
    const why = () =>
      ` [page: ${wrong.join(" | ") || "nothing"}; stage: ${words.slice(-600)}]`;
    /** The sheet of `file` loaded and mounted, then its weight from the stage. */
    const weighed = async (file: string): Promise<SheetWeight | null> => {
      await page.goto(
        `${base}/@cawco/canvas?file=${encodeURIComponent(`${SCRATCH}/${file}`)}`,
        { waitUntil: "load" }
      );
      // The canvas posts a report on every draw, its first before the
      // story's section has loaded: the weight is read once the report holds
      // this file's frames, each drawn (or unshown at this width), so the
      // story's modules are all in the stage's graph.
      await page.waitForFunction(
        (wanted) => {
          const sections =
            (
              window as unknown as {
                __cawcoCanvas?: {
                  report?: {
                    sections: { file: string; frames: { state: string }[] }[];
                  };
                };
              }
            ).__cawcoCanvas?.report?.sections ?? [];
          const section = sections.find((one) => one.file === wanted);
          return (
            !!section &&
            section.frames.length > 0 &&
            section.frames.every(
              (frame) => frame.state === "drawn" || frame.state === "unshown"
            )
          );
        },
        `${SCRATCH}/${file}`,
        { timeout: 60_000 }
      );
      const answer = (await (
        await fetch(
          `${base}/__cawco/weight?file=${encodeURIComponent(`${SCRATCH}/${file}`)}`
        )
      ).json()) as { weight: SheetWeight | null };
      return answer.weight;
    };

    // 1. Over the fleet store.
    const heavy = await weighed("Fleet.stories.ts");
    kit.check(
      "1: a story importing the fleet store reports its weight, and heaviest names that import first",
      !!heavy && heavy.heaviest[0]?.specifier === FLEET_STORE,
      `${said(heavy)}${heavy?.heaviest[0]?.specifier === FLEET_STORE ? "" : why()}`
    );

    // 1b. The store inside a fixture: the fixture is the import, `via` says where its weight enters.
    const held = await weighed("Holder.stories.ts");
    const holder = held?.heaviest[0];
    kit.check(
      "1b: a fixture holding the fleet store: heaviest names the fixture, and its via names the store",
      !!held &&
        holder?.specifier === "./Holder.svelte" &&
        holder.via[0] === "src/lib/cawco/client.svelte.ts",
      said(held)
    );

    // 2. Biome refuses it.
    const lint = Bun.spawnSync(["bun", "x", "biome", "lint", fleet], {
      cwd: ROOT,
    });
    const lintSaid = `${lint.stdout.toString()}${lint.stderr.toString()}`;
    kit.check(
      "2: bun x biome lint refuses the story with noRestrictedImports' message",
      lint.exitCode !== 0 &&
        lintSaid.includes("lint/style/noRestrictedImports") &&
        lintSaid.includes(LINT_SAID),
      `exit ${lint.exitCode}: ${
        lintSaid
          .split("\n")
          .find((line) => line.includes("×"))
          ?.trim() ?? lintSaid.slice(0, 300)
      }`
    );

    // 3. The import cut: the same sheet, read again once Vite has the edit.
    writeFileSync(fleet, fleetStory(false));
    const lean = await until(
      "the sheet's weight without the fleet store",
      () => weighed("Fleet.stories.ts"),
      (weight) =>
        !!weight &&
        weight.heaviest.every((one) => one.specifier !== FLEET_STORE),
      30_000
    ).catch(() => null);
    kit.check(
      "3: with the import cut it weighs less than before, the fleet store gone from it",
      !!lean && !!heavy && lean.modules < heavy.modules,
      `${said(lean)} (before: ${said(heavy)})`
    );

    // 4. goto on a sheet, and what the sheet loaded.
    logged.length = 0;
    const goes = await weighed("Goes.stories.ts");
    const loaded = await page.evaluate(() => ({
      path: location.pathname,
      page: (window as unknown as { __page?: string }).__page,
      resources: performance
        .getEntriesByType("resource")
        .map((entry) => entry.name),
    }));
    const kitClient = loaded.resources.filter((url) =>
      url.includes(KIT_CLIENT)
    );
    const stubs = loaded.resources.filter((url) => url.includes("cawco:kit/"));
    kit.check(
      "4: goto logs that it does nothing and the frame stays on the sheet; the sheet loaded the cawco:kit stubs and no module of Kit's client runtime",
      logged.includes(GOTO_SAID) &&
        loaded.path === "/@cawco/canvas" &&
        loaded.page === "/@cawco/canvas" &&
        stubs.length === 2 &&
        kitClient.length === 0,
      `console: ${logged.filter((line) => line.startsWith("[cawco]")).join(" | ") || "nothing"}; at ${loaded.path}, page.url ${loaded.page}; stubs ${stubs.map((url) => url.slice(url.indexOf("cawco:kit/"))).join(", ")}; kit client modules ${kitClient.length} of ${loaded.resources.length}; ${said(goes)}`
    );
    // 4b. The empty states' buttons hold one word space: on the real
    // states file, each two-word label's gap between its words' text boxes
    // (a Range over each word), at the canvas's scale undone, against the
    // others', and what the label is in the DOM.
    await page.goto(
      `${base}/@cawco/canvas?file=${encodeURIComponent(EMPTY_STARTS)}`,
      { waitUntil: "load" }
    );
    await page.waitForFunction(
      () =>
        ((window as unknown as { __cawcoCanvas?: { reports: number } })
          .__cawcoCanvas?.reports ?? 0) > 0
    );
    await page.waitForFunction(
      (labels) =>
        labels.every((label) =>
          [...document.querySelectorAll("button, a")].some(
            (one) => one.textContent?.trim() === label
          )
        ),
      SPACED,
      { timeout: 60_000 }
    );
    const spaced = await page.evaluate((labels) => {
      const read = (button: Element) => {
        const walker = document.createTreeWalker(button, NodeFilter.SHOW_TEXT);
        const nodes: Text[] = [];
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          if (node.textContent?.trim()) {
            nodes.push(node as Text);
          }
        }
        const [node] = nodes;
        const text = node?.textContent ?? "";
        const at = text.indexOf(" ");
        const box = (start: number, end: number) => {
          const range = document.createRange();
          range.setStart(node, start);
          range.setEnd(node, end);
          return range.getClientRects()[0];
        };
        const first = box(0, at);
        const second = box(
          at + 1,
          text.indexOf(" ", at + 1) > 0
            ? text.indexOf(" ", at + 1)
            : text.length
        );
        const space = box(at, at + 1);
        const scale =
          button.getBoundingClientRect().width /
          (button as HTMLElement).offsetWidth;
        const style = getComputedStyle(node.parentElement as Element);
        return {
          label: button.textContent?.trim(),
          textNodes: nodes.length,
          oneNode: nodes.length === 1 && text.includes(" "),
          letters: !!button.querySelector('[data-slot="letters"]'),
          parent: `${node.parentElement?.localName}[${node.parentElement?.getAttribute("data-slot") ?? ""}]`,
          gap: Number(((second.left - first.right) / scale).toFixed(3)),
          space: Number((space.width / scale).toFixed(3)),
          font: `${style.fontFamily.split(",")[0]} ${style.fontWeight} ${style.fontSize}`,
          spacing: `letter ${style.letterSpacing}, word ${style.wordSpacing}, kern ${style.fontKerning}`,
          tag: button.localName,
        };
      };
      return labels.map((label) => {
        const button = [...document.querySelectorAll("button, a")].find(
          (one) => one.textContent?.trim() === label
        );
        return button ? read(button) : { label, missing: true };
      });
    }, SPACED);
    const gaps = spaced.map((one) => ("gap" in one ? one.gap : Number.NaN));
    const fonts = new Set(spaced.map((one) => ("font" in one ? one.font : "")));
    kit.check(
      `4b: every empty state's button holds one word space: each label one text node, no letter spans, one face, and its words' gap the same (${spaced.map((one) => `${one.label} ${"gap" in one ? one.gap : "missing"}px`).join(", ")})`,
      spaced.every((one) => "oneNode" in one && one.oneNode && !one.letters) &&
        fonts.size === 1 &&
        Math.max(...gaps) - Math.min(...gaps) < 0.05,
      JSON.stringify(spaced)
    );
  } finally {
    stage.kill("SIGTERM");
    rmSync(dir, { recursive: true, force: true });
  }
};

/** What each numbered message asks the session to call, and what it answered (artifacts.ts's mock). */
const asks = new Map<string, { input: object; name: string }>();
const issued = new Set<string>();
const answered = new Map<string, string>();
const COMMAND = /PROBE-CALL:(\d+)/g;
/** The folder's weight in artifact_create's answer, as the tool result carries it. */
const ANSWERED_WEIGHT = /"weight":(\{[^}]*\})/;

const respond = (request: Seen): Reply => {
  const text = (words: string): Reply => ({ everyMs: 5, words: [words] });
  if (!request.tools) {
    return text("Probe title");
  }
  const marker = [...request.all.matchAll(COMMAND)].at(-1)?.[1];
  const ask = marker ? asks.get(marker) : undefined;
  if (!(marker && ask)) {
    return text("ok");
  }
  if (issued.has(marker)) {
    if (!answered.has(marker)) {
      answered.set(marker, request.last);
    }
    return text("done");
  }
  if (request.toolNames.includes(ask.name)) {
    issued.add(marker);
    return { everyMs: 5, words: [], tool: ask };
  }
  return request.toolNames.includes("ToolSearch")
    ? {
        everyMs: 5,
        words: [],
        tool: {
          name: "ToolSearch",
          input: { query: `select:${ask.name}`, max_results: 1 },
        },
      }
    : text(`${ask.name} is not offered`);
};

/** Check 5, on a scratch fleet. */
const folderCheck = async (kit: Kit) => {
  const folder = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), "weighed-"));
  const files = {
    "index.html": '<!doctype html><script type="module" src="app.js"></script>',
    "app.js": "export const a = 1;\n".repeat(500),
    "assets/chunk.mjs": "export const b = 2;\n".repeat(100),
    "assets/mark.wasm": "\0asm".repeat(256),
  };
  mkdirSync(join(folder, "assets"));
  for (const [name, text] of Object.entries(files)) {
    writeFileSync(join(folder, name), text);
  }
  const size = (name: keyof typeof files) => Buffer.byteLength(files[name]);
  const wanted = {
    files: 4,
    bytes: Object.keys(files).reduce(
      (sum, name) => sum + size(name as keyof typeof files),
      0
    ),
    js: size("app.js") + size("assets/chunk.mjs"),
    wasm: size("assets/mark.wasm"),
    // Its start page holds no <img>, so no desk capture (core FolderWeight).
    captures: 0,
  };
  try {
    const fleet = await kit.fleet(respond);
    fleet.launch("sessiond");
    await fleet.sessiondUp();
    fleet.launch("hub");
    await fleet.hubUp();
    fleet.fileAccount();
    fleet.launch("agent");
    await fleet.agentUp();
    await fleet.accountSignedIn();
    const session = await fleet.spawn("claude", "Weight", fleet.repo);
    asks.set("1", {
      name: "mcp__cawco__artifact_create",
      input: {
        kind: "preview",
        does: "try",
        ask: "Try this page and say whether it works",
        name: "weighed",
        dir: folder,
      },
    });
    await fleet.send(session, "PROBE-CALL:1");
    const created = (await until(
      "artifact_create's answer",
      () => answered.get("1"),
      Boolean,
      180_000
    )) as string;
    const weight = created.match(ANSWERED_WEIGHT)?.[1];
    const read = weight ? (JSON.parse(weight) as Record<string, number>) : null;
    kit.check(
      "5: artifact_create(kind: preview, dir) answers the folder's weight: files, bytes, js, wasm, and its start page's desk captures",
      !!read &&
        Object.keys(read).length === Object.keys(wanted).length &&
        Object.entries(wanted).every(([key, value]) => read[key] === value),
      `answered ${weight ?? created.slice(0, 300)}; the folder holds ${JSON.stringify(wanted)}`
    );
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
};

const spec: Spec = {
  name: "sheet-weight",
  run: async (kit) => {
    await stageChecks(kit);
    await folderCheck(kit);
  },
};
export default spec;
