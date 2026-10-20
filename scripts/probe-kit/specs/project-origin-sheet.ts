/**
 * A project's decision page whose option embeds a component canvas (a sheet
 * on its session's stage) draws that canvas inside the page, on every route
 * (Projects spec §5.8, the owner's pairing page of 2026-10-20: "if i refresh
 * the preview the canvas elements load for a split second then show the
 * error"). Host-only: a sheet's stage runs in a stage clone's boundary,
 * which needs namespaces no workspace can make.
 *
 *   bun scripts/probe-kit/run.ts project-origin-sheet
 *
 * On a scratch fleet, a Claude Code session of a project in a Vite + Svelte
 * folder (as session-sheet's), against the mock model; in port mode and in
 * host mode (a `p-{port}.localhost` pattern, every name on the range's first
 * port, as an outpost's proxy reaches the hub):
 * (a) the page opened in the session's panel draws the canvas's card
 *     (`[data-probe="title"]`) inside its Preview embed;
 * (b) it still does once the embed reloads itself (as Vite's client does
 *     when its socket drops: `location.reload()` once a ping answers), and
 *     after a settle long enough for that to happen on its own.
 */
// biome-ignore-all lint/performance/noAwaitInLoops: one step at a time, as a person takes them
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { Frame, Page } from "playwright-core";
import { MACHINE, type Reply, type Seen, until } from "../../scratch-fleet";
import { type Kit, open, type Spec } from "../kit";

const respond = (request: Seen): Reply => ({
  everyMs: 5,
  words: [request.tools ? "ok" : "Probe title"],
});

const STORY = "src/Card.stories.js";

/** The project in the session's folder: plain Vite and Svelte, installed only in its stage clone (session-sheet.ts `PROJECT`). */
const PROJECT: Record<string, string> = {
  ".gitignore": "node_modules\n",
  "package.json": JSON.stringify({
    name: "probe-pairing",
    private: true,
    type: "module",
    devDependencies: {
      "@sveltejs/vite-plugin-svelte": "^7.3.1",
      svelte: "5.57.1",
      vite: "^8.3.4",
    },
  }),
  "vite.config.mjs": `import { svelte } from "@sveltejs/vite-plugin-svelte";
export default { plugins: [svelte()], server: { fs: { strict: false } } };
`,
  "index.html": "<!doctype html><html><head></head><body></body></html>\n",
  "src/Card.svelte": `<script>
  let { title } = $props();
</script>

<h2 data-probe="title">{title}</h2>
`,
  [STORY]: `import Card from "./Card.svelte";

export default { component: Card, args: { title: "Caw swallows the code" } };

export const One = { args: {} };
`,
};

const CARD = "Caw swallows the code";

const pageProgram = (
  sheet: string
) => `root = Decisions("Pair the code", [leave])
leave = Decision("leave", "When you approve, how does the code leave?", [swallow, fly], "Both drawn live.")
swallow = Option("swallow", "Caw swallows the code", "It goes in one gulp.", true, [desk], "Less to watch.")
fly = Option("fly", "The code flies up to Caw", "It travels up the page.", false, [], "More motion to follow.")
desk = Preview("${sheet}", "Desk · Caw swallows the code")`;

/** Every frame under `frame`, itself first. */
const within = (frame: Frame): Frame[] => [
  frame,
  ...frame.childFrames().flatMap(within),
];

/** The decision page's frame in `tab`. */
const pageFrame = async (tab: Page): Promise<Frame | undefined> =>
  (
    await Promise.all(
      tab
        .frames()
        .map(
          async (frame) =>
            [
              frame,
              await frame
                .evaluate(() => !!document.getElementById("decision-leave"))
                .catch(() => false),
            ] as const
        )
    )
  ).find(([, card]) => card)?.[0];

/** What the embed drew: the card's title in any frame under the page's, else every address under it. */
const embedIn = async (tab: Page): Promise<string> => {
  const page = await pageFrame(tab);
  if (!page) {
    return "no page";
  }
  const under = page.childFrames().flatMap(within);
  const titles = await Promise.all(
    under.map((frame) =>
      frame
        .evaluate(
          () =>
            document.querySelector('[data-probe="title"]')?.textContent ?? ""
        )
        .catch(() => "")
    )
  );
  return (
    titles.find((one) => one === CARD) ?? under.map((f) => f.url()).join(" | ")
  );
};

const run = async (kit: Kit) => {
  const fleet = await kit.fleet(respond);
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.launch("agent");
  await fleet.agentUp();
  await fleet.accountSignedIn();
  const dir = `${fleet.sandbox}/pairing-sheet`;
  await Promise.all(
    Object.entries(PROJECT).map(async ([file, text]) => {
      await mkdir(dirname(join(dir, file)), { recursive: true });
      await writeFile(join(dir, file), text);
    })
  );
  // A sheet's stage runs in a clone cut from the folder's HEAD.
  await Bun.$`git init -q -b main && bun install --lockfile-only --no-progress && git add -A && git -c user.email=p@p -c user.name=p commit -q -m pairing`
    .cwd(dir)
    .quiet();
  const { id: projectId } = await fleet.api<{ id: string }>("/api/projects", {
    name: "Pairing sheet",
    machineId: MACHINE,
    cwd: dir,
    caw: false,
  });
  const writer = await fleet.spawn("claude", "Pair the code", dir, {
    projectId,
  });
  const at = `/api/instances/${writer}/artifacts`;
  const sheet = await fleet.api<{ id: string }>(at, {
    kind: "component",
    does: "judge",
    ask: "Judge the card",
    name: "pairing-card",
    file: STORY,
  });
  const page = await fleet.api<{ id: string }>(at, {
    kind: "page",
    does: "pick",
    ask: "Pick how the code leaves",
    name: "pairing-behaviour",
    program: pageProgram(sheet.id),
  });
  const base = await fleet.dashboard();
  const range = await fleet.api<{ ports: string }>("/api/preview-settings");
  const first = Number(range.ports.split("–")[0]);

  for (const mode of ["port", "host"] as const) {
    const put = await fetch(`${fleet.base}/api/preview-settings`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(
        mode === "host"
          ? { mode, pattern: `http://p-{port}.localhost:${first}` }
          : { mode }
      ),
    });
    const board =
      mode === "host" ? base.replace("127.0.0.1", "localhost") : base;
    const tab = await kit.page("desk", { theme: "light" });
    await open(tab, `${board}/session/${writer}`, '[data-slot="pane"]');
    await (
      await fetch(`${fleet.base}${at}/${page.id}/show`, { method: "POST" })
    ).text();
    const drawn = await until(
      `${mode}: the canvas's card inside the page`,
      () => embedIn(tab),
      (said) => said === CARD,
      120_000
    ).catch(() => embedIn(tab));
    kit.check(
      `(a) ${mode}: the page opened in its session's panel draws the component canvas's card inside its Preview embed`,
      put.ok && drawn === CARD,
      JSON.stringify({ put: put.status, drawn })
    );
    // The embed loads itself again, as Vite's client does once its socket drops.
    const page$ = await pageFrame(tab);
    for (const frame of page$?.childFrames() ?? []) {
      await frame.evaluate(() => location.reload()).catch(() => undefined);
    }
    await tab.waitForTimeout(15_000);
    const settled = await embedIn(tab);
    kit.check(
      `(b) ${mode}: it still draws the card after the embed reloads itself, and 15 s on`,
      settled === CARD,
      settled
    );
    await tab.close();
  }
};

const spec: Spec = { name: "project-origin-sheet", run };
export default spec;
