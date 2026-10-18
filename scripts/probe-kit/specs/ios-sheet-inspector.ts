/**
 * iOS: the artifact panel's sheet inspector and its title menu (Projects
 * PRD L723–724, "The person edits props and variants in the inspector and
 * saves them into the story's `args`"; L650–652, the panel lists "the
 * session's artifacts newest first"). The app's PreviewController head,
 * Preview/SheetInspector.swift and Preview/ArtifactMenu.swift.
 *
 * A scratch fleet (real hub, agent and sessiond, Claude Code against the
 * mock model) and the built app on an iPhone simulator of its own. A project
 * session in the fleet's repo, a Vite + Svelte project whose `Card` has an
 * enum prop `tone`, makes three pages and promotes the first. Then:
 *
 * 1. The app opened on the session with `-menu-remove notes`: the title
 *    menu lists the session's artifacts newest first, as the hub's
 *    `/api/instances/:id/artifacts` does, the promoted page tagged
 *    "Promoted <commit>" with the promote's short commit. Remove takes
 *    `notes` out: the menu's rows and the hub's list no longer hold it.
 * 2. The session makes a sheet of `src/Card.stories.js`, and the app opened
 *    again with `-inspect-set tone=warm` hears the sheet from its page
 *    (`inspector heard`, story One, Card's props), opens the inspector, sets
 *    `tone` and Saves. The hub's write lands: `git diff --stat` in the repo
 *    names one file, the story file, and its diff is the args literal of One
 *    alone (`tone: "warm"`).
 *
 * The sheet's stage runs in a place over the session's folder, a boundary
 * of its own: like session-sheet, leg 2 runs only outside every workspace
 * boundary (README "A spec that delegates runs on the host"); inside one
 * the stage's start is refused ("…runs inside another macOS sandbox
 * (Seatbelt), and Seatbelt does not nest…", core boundary-nesting.ts).
 *
 *   bash apps/apple/scripts/build-both.sh ios --compile-only
 *   bun scripts/probe-kit/run.ts ios-sheet-inspector
 *
 * The app is this checkout's simulator build (`PROBE_IOS_APP` names another).
 */
import { mkdir, symlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Subprocess } from "bun";
import { freshApp } from "../../lib/apple-app";
import { type MacSim, macSim } from "../../lib/mac-sim";
import { MACHINE, type Reply, type Seen, until } from "../../scratch-fleet";
import { type Kit, ROOT, type Spec } from "../kit";

/** iOS 18.5, the app's oldest target, as the other iOS specs run it. */
const SIM = {
  runtime: "com.apple.CoreSimulator.SimRuntime.iOS-18-5",
  device: "iPhone 16 Pro",
};
const STORY = "src/Card.stories.js";
const LOG_HEAD = /^.*?\[dev\.cawco\.app:[^\]]*\] /;
const ID = /"id":"([0-9a-f-]{36})"/;
const COMMIT = /"commit":"([0-9a-f]{7,40})"/;
const COMMAND = /PROBE-CALL:(\d+)/g;
/** A diff's changed line, not its file header. */
const CHANGED_LINE = /^[+-][^+-]/;
/** Save's write: One's args literal holding the value set, and nothing else. */
const SAVED_ARGS = /^\+export const One = \{ args: \{ ?tone: "warm" ?\} \};$/;

/** The project: plain Vite and Svelte, the dashboard's packages linked in; Card's `tone` is an enum. */
const PROJECT: Record<string, string> = {
  "package.json": JSON.stringify({
    name: "probe-cards",
    private: true,
    type: "module",
    devDependencies: {
      "@sveltejs/vite-plugin-svelte": "*",
      svelte: "*",
      vite: "*",
    },
  }),
  "vite.config.mjs": `import { svelte } from "@sveltejs/vite-plugin-svelte";
export default { cacheDir: ".vite-cache", plugins: [svelte()], server: { fs: { strict: false } } };
`,
  "index.html": "<!doctype html><html><head></head><body></body></html>\n",
  ".gitignore": ".vite-cache\nnode_modules\n",
  "src/Card.svelte": `<script lang="ts">
  let { title, tone = "neutral" }: { title: string; tone?: "neutral" | "warm" | "cool" } = $props();
</script>

<h2 data-probe="title" data-tone={tone}>{title}</h2>
`,
  [STORY]: `import Card from "./Card.svelte";

export default { component: Card, args: { title: "Hello" } };

export const One = { args: {} };
`,
};

const PAGE = (words: string) =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${words}</title></head><body><p>${words}</p></body></html>`;

const pause = (ms: number) => Bun.sleep(ms);

/** Where the paired captures go: outside the workspace, for a later review of app against web. */
const keep = join(
  process.env.XDG_CACHE_HOME ?? join(homedir(), ".cache"),
  "cawco-captures",
  "prd-parity",
  "b1-artifact-panel"
);

async function sh(script: string): Promise<string> {
  const child = Bun.spawn(["bash", "-s"], {
    stdin: new TextEncoder().encode(`set -euo pipefail\n${script}\n`),
    stdout: "pipe",
    stderr: "pipe",
  });
  const [text, err, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  if (code !== 0) {
    throw new Error(`exited ${code}: ${err.trim() || text.trim()}`);
  }
  return text;
}

const asks = new Map<string, { input: object; name: string }>();
const issued = new Set<string>();
const answered = new Map<string, string>();

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

const short = (said: string) => said.replaceAll(/\s+/g, " ").slice(0, 400);

const run = async (kit: Kit) => {
  const { path: app, problem } = freshApp(ROOT);
  if (!kit.check("the app is built from this tree", !problem, problem ?? app)) {
    return;
  }
  const fleet = await kit.fleet(respond);
  await mkdir(join(fleet.repo, "src"), { recursive: true });
  await Promise.all(
    Object.entries(PROJECT).map(([file, words]) =>
      writeFile(join(fleet.repo, file), words)
    )
  );
  await symlink(
    join(ROOT, "apps/dashboard/node_modules"),
    join(fleet.repo, "node_modules")
  );
  // The project as committed: the inspector's Save is the only change after it.
  await sh(
    `git -C "${fleet.repo}" add -A && git -C "${fleet.repo}" -c user.email=p@p -c user.name=p commit -q -m cards`
  );
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.launch("agent");
  await fleet.agentUp();
  await fleet.accountSignedIn();
  const project = await fleet.api<{ id: string }>("/api/projects", {
    name: "Cards",
    machineId: MACHINE,
    cwd: fleet.repo,
    caw: false,
  });
  const session = await fleet.spawn("claude", "Cards", fleet.repo, {
    projectId: project.id,
  });
  let n = 0;
  const call = async (name: string, input: object) => {
    n += 1;
    const marker = String(n);
    asks.set(marker, { name, input });
    await fleet.send(session, `PROBE-CALL:${marker}`);
    return (await until(
      `${name}'s answer (${marker})`,
      () => answered.get(marker),
      Boolean,
      240_000
    )) as string;
  };
  const CREATE = "mcp__cawco__artifact_create";
  const kept = await call(CREATE, {
    kind: "page",
    name: "kept",
    html: PAGE("Kept"),
  });
  const keptId = kept.match(ID)?.[1];
  const promoted = await call("mcp__cawco__artifact_promote", { id: keptId });
  const commit = promoted.match(COMMIT)?.[1]?.slice(0, 7);
  await call(CREATE, { kind: "page", name: "notes", html: PAGE("Notes") });
  await call(CREATE, { kind: "page", name: "draft", html: PAGE("Draft") });
  if (
    !kit.check(
      "0: the session made a page and promoted it, and two more pages",
      !!keptId && !!commit,
      `kept ${short(kept)}; promote ${short(promoted)}`
    )
  ) {
    return;
  }

  let sim: MacSim | undefined;
  let stream: Subprocess | undefined;
  const heard: string[] = [];
  const said = (prefix: string) =>
    heard.filter((line) => line.startsWith(prefix));
  try {
    sim = await macSim(SIM);
    const { udid } = sim;
    console.log(`  simulator ${udid}`);
    await sh(`xcrun simctl bootstatus ${udid} -b >/dev/null`);
    await sh(`xcrun simctl install ${udid} "${app}"`);
    const child = Bun.spawn(
      [
        "bash",
        "-c",
        `exec xcrun simctl spawn ${udid} log stream --level debug --style compact --predicate 'subsystem == "dev.cawco.app" AND category == "Probe"'`,
      ],
      { stdout: "pipe", stderr: "ignore" }
    );
    stream = child;
    (async () => {
      const decoder = new TextDecoder();
      const reader = child.stdout.getReader();
      let rest = "";
      for (;;) {
        // biome-ignore lint/performance/noAwaitInLoops: the stream is read in order
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        rest += decoder.decode(value, { stream: true });
        const split = rest.split("\n");
        rest = split.pop() ?? "";
        for (const line of split) {
          if (line.includes("dev.cawco.app")) {
            heard.push(line.replace(LOG_HEAD, ""));
          }
        }
      }
    })().catch(() => undefined);
    await pause(1500);
    const launch = (flags: string) =>
      until(
        "the app launched",
        () =>
          sh(
            `xcrun simctl launch --terminate-running-process ${udid} dev.cawco.app -paywall-env sandbox -cawco-hub-url ${fleet.base} -open-session ${session} -preview-probe ${flags} >/dev/null`
          ).then(() => true),
        Boolean,
        60_000
      );

    // 1. The menu: newest first, the promote's commit, Remove.
    const listedBefore = await fleet.api<{ id: string; name: string }[]>(
      `/api/instances/${session}/artifacts`
    );
    await launch("-menu-remove notes");
    const firstRows = await until(
      "the menu's rows",
      () => said("artifact menu rows").at(0),
      Boolean,
      120_000
    ).catch(() => undefined);
    const removed = await until(
      "notes removed",
      () => said("artifact menu removed notes").at(-1),
      Boolean,
      30_000
    ).catch(() => undefined);
    await pause(1000);
    const lastRows = said("artifact menu rows").at(-1);
    const listedAfter = await fleet.api<{ id: string; name: string }[]>(
      `/api/instances/${session}/artifacts`
    );
    const tagged = (name: string) =>
      name === "kept" ? `kept[Promoted ${commit}]` : name;
    await sh(
      `xcrun simctl io ${udid} screenshot "${join(kit.out, "ios-sheet-inspector-menu.png")}" >/dev/null`
    );
    kit.check(
      "1: the menu lists the hub's artifacts newest first, the promoted one tagged with its short commit; Remove takes notes out of the menu and the hub",
      listedBefore.map((row) => row.name).join() === "draft,notes,kept" &&
        firstRows ===
          `artifact menu rows ${listedBefore.map((row) => tagged(row.name)).join(",")}` &&
        !!removed &&
        lastRows === `artifact menu rows draft,${tagged("kept")}` &&
        listedAfter.map((row) => row.name).join() === "draft,kept",
      `hub before: ${listedBefore.map((row) => row.name).join()}; first: ${firstRows}; removed: ${removed}; last: ${lastRows}; hub after: ${listedAfter.map((row) => row.name).join()}`
    );

    // The menu open beside the dashboard's, at the simulator's viewport, light and dark, for a later review.
    await mkdir(keep, { recursive: true });
    const dashboard = await fleet.dashboard();
    for (const theme of ["light", "dark"] as const) {
      // biome-ignore lint/performance/noAwaitInLoops: one appearance at a time, as the simulator holds one
      await sh(`xcrun simctl ui ${udid} appearance ${theme}`);
      const opened = said("artifact menu open").length;
      await launch("-menu-remove notes");
      await until(
        `the ${theme} menu`,
        () => said("artifact menu open").length > opened,
        Boolean,
        90_000
      ).catch(() => undefined);
      await pause(2000);
      await sh(
        `xcrun simctl io ${udid} screenshot "${join(keep, `app-menu-${theme}.png`)}" >/dev/null`
      );
      try {
        const page = await kit.page("iphone", { engine: "webkit", theme });
        await page.goto(`${dashboard}/session/${session}`, {
          waitUntil: "domcontentloaded",
        });
        await page
          .locator("[data-artifact-trigger]")
          .first()
          .click({ timeout: 30_000 });
        await page.locator("[data-artifact-list]").waitFor({ timeout: 10_000 });
        await pause(500);
        await page.screenshot({ path: join(keep, `web-menu-${theme}.png`) });
        await page.close();
      } catch (error) {
        console.log(
          `  the web ${theme} menu wasn't captured: ${(error as Error).message.split("\n")[0]}`
        );
      }
    }
    await sh(`xcrun simctl ui ${udid} appearance light`);
    console.log(`  captures: ${keep}`);

    // 2. The inspector: the sheet heard, tone set, Saved into the story file.
    const tree = await sh(`git -C "${fleet.repo}" status --porcelain`);
    if (
      !kit.check(
        "2: the repo is clean before the sheet (the inspector's write is the only change)",
        tree.trim() === "",
        tree.trim()
      )
    ) {
      return;
    }
    const sheet = await call(CREATE, {
      kind: "sheet",
      name: "cards",
      file: STORY,
    });
    if (
      !kit.check(
        "2a: the session makes the sheet, its stage live",
        ID.test(sheet),
        short(sheet)
      )
    ) {
      return;
    }
    await launch("-inspect-set tone=warm");
    const heardSheet = await until(
      "the inspector hearing the sheet",
      () => said("inspector heard").at(-1),
      Boolean,
      180_000
    ).catch(() => undefined);
    const wrote = await until(
      "the inspector's write",
      () => said("inspector wrote").at(-1),
      Boolean,
      60_000
    ).catch(() => undefined);
    const stat = await until(
      "the story file changed",
      () => sh(`git -C "${fleet.repo}" diff --stat`),
      (text) => text.includes(STORY),
      30_000
    ).catch(() => sh(`git -C "${fleet.repo}" diff --stat`));
    const diff = await sh(`git -C "${fleet.repo}" diff -U0 -- ${STORY}`);
    const changed = diff.split("\n").filter((line) => CHANGED_LINE.test(line));
    const files = stat.trim().split("\n").slice(0, -1);
    await sh(
      `xcrun simctl io ${udid} screenshot "${join(kit.out, "ios-sheet-inspector-saved.png")}" >/dev/null`
    );
    kit.check(
      "2b: the inspector hears the sheet, sets tone and Saves: one file changed, the story file, its args literal alone",
      !!heardSheet?.includes("stories=One") &&
        heardSheet.includes("tone") &&
        !!wrote &&
        files.length === 1 &&
        files[0]?.includes(STORY) &&
        changed.length === 2 &&
        changed[0] === "-export const One = { args: {} };" &&
        SAVED_ARGS.test(changed[1] ?? ""),
      `heard: ${heardSheet ?? "nothing"}; wrote: ${wrote ?? "nothing"}; stat: ${stat.trim()}; diff: ${changed.join(" | ")}; last inspector line: ${said("inspector ").at(-1)}`
    );
  } finally {
    stream?.kill();
    await sim?.release();
  }
};

const spec: Spec = { name: "ios-sheet-inspector", run };
export default spec;
