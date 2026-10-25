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
 * folder (as session-sheet's), against the mock model; the page's two
 * options each embed the canvas; in port mode and in host mode (a
 * `https://p-{port}.localtest.me` pattern, every name on the range's first
 * port behind an https front, the dashboard behind one of its own under the
 * names' domain: pass-legs.ts), each tab a browser holding no pass:
 * (a) the page opened in the session's panel draws the canvas's card
 *     (`[data-probe="title"]`) inside both Preview embeds;
 * (b) it still does once the embeds reload themselves (as Vite's client does
 *     when its socket drops: `location.reload()` once a ping answers), and
 *     after a settle long enough for that to happen on its own;
 * (c) host mode, the owner's 401s ("Failed to load resource: the server
 *     responded with a status of 401", seven times on one decision page):
 *     both canvases remounted three times (the page sets each frame's
 *     address again) draw the card each time; nothing is answered 401,
 *     the page's first load included (the dashboard enters before it), and
 *     one `/__cawco/enter` is asked in all, none once the remounts begin;
 * (d) the Previews told the hub the shape their canvas said (hub preview.ts
 *     `PAGE_SHAPE_PATH`): the page served again carries it in its media,
 *     at the frames' own height, so the next Preview's skeleton stands at it.
 */
// biome-ignore-all lint/performance/noAwaitInLoops: one step at a time, as a person takes them
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { Frame, Page } from "playwright-core";
import { MACHINE, type Reply, type Seen, until } from "../../scratch-fleet";
import { type Kit, open, type Spec } from "../kit";
import {
  hear,
  PASS_HOSTS,
  passHeld,
  passPattern,
  passTunnel,
  remount,
  storeHostMode,
} from "../pass-legs";

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
fly = Option("fly", "The code flies up to Caw", "It travels up the page.", false, [phone], "More motion to follow.")
desk = Preview("${sheet}", "Desk · Caw swallows the code")
phone = Preview("${sheet}", "Phone · Caw swallows the code")`;

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

/** Both embeds drew the card: what {@link embedIn} says then. */
const BOTH = `${CARD} ×2`;

/** What the embeds drew: the card in each of the page's embeds, else every address under the page. */
const embedIn = async (tab: Page): Promise<string> => {
  const page = await pageFrame(tab);
  if (!page) {
    return "no page";
  }
  const drawn = await Promise.all(
    page.childFrames().map(async (embed) => {
      const titles = await Promise.all(
        within(embed).map((frame) =>
          frame
            .evaluate(
              () =>
                document.querySelector('[data-probe="title"]')?.textContent ??
                ""
            )
            .catch(() => "")
        )
      );
      return titles.includes(CARD);
    })
  );
  return drawn.length === 2 && drawn.every(Boolean)
    ? BOTH
    : page
        .childFrames()
        .flatMap(within)
        .map((f) => f.url())
        .join(" | ");
};

/**
 * (d): the Previews told the hub the shape their canvas said (hub
 * preview.ts `PAGE_SHAPE_PATH`); the page served again carries it in its
 * media, at the frames' own height.
 */
async function shapeHeard(
  kit: Kit,
  mode: string,
  tab: Page,
  sheet: string
): Promise<void> {
  const shapes = await (
    await pageFrame(tab)
  )?.evaluate(async (id) => {
    const html = await (await fetch(location.href)).text();
    const media = new DOMParser()
      .parseFromString(html, "text/html")
      .getElementById("cawco-media")?.textContent;
    const said =
      (
        JSON.parse(media ?? "{}") as Record<
          string,
          { shapes?: { said?: Record<string, { h: number }> } }
        >
      )[id]?.shapes?.said ?? {};
    const frames = [
      ...document.querySelectorAll("iframe[data-slot=embed]"),
    ].map((one) => Math.round(one.getBoundingClientRect().height));
    return { said, frames };
  }, sheet);
  kit.check(
    `(d) ${mode}: the page served again carries the shape its Previews heard the canvas say, at the frames' own height (${JSON.stringify(shapes)})`,
    !!shapes &&
      (shapes.said[""]?.h ?? 0) > 0 &&
      shapes.frames.length === 2 &&
      shapes.frames.every((h) => h === shapes.said[""]?.h),
    JSON.stringify(shapes)
  );
}

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
  const tunnel = await passTunnel(kit.out, first, base);

  for (const mode of ["port", "host"] as const) {
    await storeHostMode(
      fleet,
      mode === "host" ? passPattern("{port}", tunnel.front) : { mode }
    );
    const settings = await fleet.api<{ mode: string }>("/api/preview-settings");
    const board = mode === "host" ? tunnel.board : base;
    const tab = await kit.page("desk", {
      theme: "light",
      ignoreHTTPSErrors: true,
      hostRules: PASS_HOSTS,
    });
    const heard = hear(tab);
    await open(tab, `${board}/session/${writer}`, '[data-slot="pane"]');
    await (
      await fetch(`${fleet.base}${at}/${page.id}/show`, { method: "POST" })
    ).text();
    const drawn = await until(
      `${mode}: the canvas's card inside the page`,
      () => embedIn(tab),
      (said) => said === BOTH,
      120_000
    ).catch(() => embedIn(tab));
    kit.check(
      `(a) ${mode}: the page opened in its session's panel draws the component canvas's card inside both Preview embeds`,
      settings.mode === mode && drawn === BOTH,
      JSON.stringify({ settings, drawn })
    );
    // The embed loads itself again, as Vite's client does once its socket drops.
    const page$ = await pageFrame(tab);
    for (const frame of page$?.childFrames() ?? []) {
      await frame.evaluate(() => location.reload()).catch(() => undefined);
    }
    await tab.waitForTimeout(15_000);
    const settled = await embedIn(tab);
    kit.check(
      `(b) ${mode}: it still draws the card in both after the embeds reload themselves, and 15 s on`,
      settled === BOTH,
      settled
    );
    await shapeHeard(kit, mode, tab, sheet.id);
    if (mode === "host") {
      const shown = await pageFrame(tab);
      const embeds = new Set(
        (shown?.childFrames() ?? []).map(
          (frame) => new URL(frame.url()).hostname
        )
      );
      const remountsFrom = heard.length;
      const remounts: string[] = [];
      for (let time = 1; time <= 3; time += 1) {
        if (shown) {
          await remount(shown).catch(() => undefined);
        }
        remounts.push(
          await until(
            `${mode}: both canvases after remount ${time}`,
            () => embedIn(tab),
            (said) => said === BOTH,
            60_000
          ).catch(() => embedIn(tab))
        );
      }
      const pass = passHeld(heard, embeds, remountsFrom);
      kit.check(
        `(c) ${mode}: both canvases remounted three times draw the card each time; none of the embeds' ${pass.said.embedAnswers} answers is 401, nor the page's first load (entered before it), one /__cawco/enter is asked in all and none per remount`,
        remounts.every((one) => one === BOTH) && pass.held,
        JSON.stringify({ remounts, embeds: [...embeds], ...pass.said })
      );
    }
    await tab.close();
  }
  tunnel.stop();
};

const spec: Spec = {
  name: "project-origin-sheet",
  run,
  host: "a sheet's stage runs in a stage clone's boundary, which needs namespaces no workspace can make",
};
export default spec;
