/**
 * A post to another person's repository held for the owner names itself in
 * Needs you (NeedsCard, DESIGN.md "Needs you"): its own title is the row's
 * title, where it goes (owner/repo#n) its one line under it, no command
 * line, and the session that asked stands in the meta line where the kind
 * stood, giving way as the machine's name does. Read from the engine on the
 * dashboard's stage (stage-host/host.ts, bundled and started in
 * apps/dashboard as sheet-weight starts it), over NeedsCard.stories.ts,
 * whose asks are made by core's own describePost and presentPermission:
 *
 * 1. Comment (400): title "This fixes the repro in #14190 on our side
 *    too." (the body's first line), target "sveltejs/svelte#14212"; Issue:
 *    its title over "sveltejs/svelte"; GitLab: the host kept,
 *    "gitlab.com/inkscape/inkscape". Approve is named by both: "Approve
 *    <title> to <target>".
 * 2. LongNames at 1280 and LongNamesNarrow at 320, a comment whose asking
 *    session's name runs past 60 characters: the target is
 *    owner/repo#98765, there is no `.cmd`, `[data-slot="asker"]` computes
 *    `flex-shrink: 1`, the machine's OS mark lies inside the meta's box and
 *    the meta does not overflow (scrollWidth ≤ clientWidth + 1); at 320 the
 *    asker ellipsizes (scrollWidth > clientWidth).
 * 3. Budget, a project past its daily cap: the row says "Reached its daily
 *    budget · Caw paused", and nothing in it is a currency sign or a money
 *    figure.
 *
 *   bun scripts/probe-kit/run.ts held-post-row
 */
// biome-ignore-all lint/performance/noAwaitInLoops: one page, one frame read at a time.
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildStageHost } from "../../../packages/agent/src/stage-host/build";
import { until } from "../../scratch-fleet";
import { type Kit, ROOT, type Spec } from "../kit";

const APP = join(ROOT, "apps/dashboard");
const STORIES = "src/lib/cawco/home/NeedsCard.stories.ts";
const LONG_TARGET =
  "some-organisation-with-a-long-name/an-equally-long-repository-name#98765";
/** A currency sign, its code, or a figure with cents. */
const MONEY = /[$€£¥]|\bUSD\b|\d+\.\d{2}\b/;

/** A port nothing holds now. */
const freePort = async (): Promise<number> => {
  const lease = Bun.serve({ port: 0, fetch: () => new Response(null) });
  const port = lease.port as number;
  await lease.stop(true);
  return port;
};

/** One story's row at rest, as the engine lays it out. */
const readRow = (story: string) => {
  const frame = document.querySelector(
    `.cawco-frame[data-cawco-story="${story}"][data-cawco-interaction="rest"]`
  );
  const row = frame?.querySelector('[data-slot="row"]');
  if (!(frame && row)) {
    return null;
  }
  const text = (slot: string) =>
    (row.querySelector(`[data-slot="${slot}"]`)?.textContent ?? "")
      .replace(/\s+/g, " ")
      .trim();
  const box = (el: Element | null) => {
    const r = el?.getBoundingClientRect();
    return r
      ? { left: r.left, right: r.right, top: r.top, bottom: r.bottom }
      : null;
  };
  const meta = row.querySelector<HTMLElement>('[data-slot="meta"]');
  const asker = row.querySelector<HTMLElement>('[data-slot="asker"]');
  const mark = row.querySelector('[data-slot="machine"] > svg');
  return {
    width: Math.round(
      frame.querySelector(".cawco-frame-body")?.getBoundingClientRect().width ??
        0
    ),
    name: text("name"),
    want: text("want"),
    asker: asker?.textContent?.trim() ?? "",
    cmd: row.querySelector('[data-slot="needs-command"]') !== null,
    approve:
      row.querySelector("[data-approve]")?.getAttribute("aria-label") ?? null,
    askerShrink: asker ? getComputedStyle(asker).flexShrink : "",
    askerOverflows: asker ? asker.scrollWidth > asker.clientWidth : false,
    askerBox: box(asker),
    metaBox: box(meta),
    markBox: box(mark),
    metaScroll: meta ? meta.scrollWidth - meta.clientWidth : -1,
    all: (row.textContent ?? "").replace(/\s+/g, " ").trim(),
  };
};

const spec: Spec = {
  name: "held-post-row",
  run: async (kit: Kit) => {
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
    const hear = (chunk: Buffer) => {
      words += chunk.toString("utf8");
    };
    stage.stdout.on("data", hear);
    stage.stderr.on("data", hear);
    try {
      await until(
        "the stage's ready",
        () => words,
        (text) => text.includes('"cawco":"ready"'),
        60_000
      );
      const page = await kit.page("desk");
      const logged: string[] = [];
      page.on("console", (message) => {
        if (message.type() === "error") {
          logged.push(message.text());
        }
      });
      page.on("pageerror", (error) => logged.push(error.message));
      await page.goto(
        `http://127.0.0.1:${port}/@cawco/canvas?file=${encodeURIComponent(STORIES)}`,
        { waitUntil: "load" }
      );
      await page
        .waitForFunction(
          () =>
            document.querySelectorAll(
              '.cawco-frame[data-cawco-interaction="rest"] [data-slot="row"]'
            ).length >= 5,
          undefined,
          { timeout: 60_000 }
        )
        .catch(async (error: Error) => {
          const frames = await page.evaluate(() =>
            [...document.querySelectorAll<HTMLElement>(".cawco-frame")].map(
              (frame) =>
                `${frame.dataset.cawcoStory}: ${frame.querySelector(".cawco-frame-status")?.textContent ?? ""}`
            )
          );
          throw new Error(
            `${error.message}; frames ${JSON.stringify(frames)}; errors ${JSON.stringify(logged.slice(0, 5))}`
          );
        });
      const read = (story: string) => page.evaluate(readRow, story);

      // 1. Each post's own name over its target.
      const comment = await read("Comment");
      const issue = await read("Issue");
      const gitlab = await read("GitLab");
      kit.check(
        "1: a held post's row: its title (a comment's first line) over owner/repo#n, the host kept off GitHub, Approve named by both",
        comment?.name === "This fixes the repro in #14190 on our side too." &&
          comment.want === "sveltejs/svelte#14212" &&
          comment.approve ===
            "Approve This fixes the repro in #14190 on our side too. to sveltejs/svelte#14212" &&
          issue?.name === "$state proxies drop symbol keys on spread" &&
          issue.want === "sveltejs/svelte" &&
          gitlab?.name === "Snap to page edges when the canvas is rotated" &&
          gitlab.want === "gitlab.com/inkscape/inkscape",
        JSON.stringify({ comment, issue, gitlab })
      );

      // 2. A long asker, at 1280 and at 320.
      for (const story of ["LongNames", "LongNamesNarrow"]) {
        const row = await read(story);
        const inside =
          !!row?.markBox &&
          !!row.metaBox &&
          row.markBox.left >= row.metaBox.left - 0.5 &&
          row.markBox.right <= row.metaBox.right + 0.5;
        const narrow = story === "LongNamesNarrow";
        kit.check(
          `2: ${story} at ${row?.width}: target owner/repo#n, no command line, the ${row?.asker.length}-character asker shrinks (flex-shrink 1)${narrow ? " and ellipsizes" : ""}, the OS mark inside the meta, the meta never overflows`,
          !!row &&
            row.asker.length > 60 &&
            row.want === LONG_TARGET &&
            !row.cmd &&
            row.askerShrink === "1" &&
            (!narrow || row.askerOverflows) &&
            inside &&
            row.metaScroll <= 1,
          JSON.stringify(row)
        );
      }

      // 3. A project past its budget says so in words, never the amount.
      const budget = await read("Budget");
      kit.check(
        '3: Budget: the cap\'s row reads "Reached its daily budget · Caw paused", with no currency sign or money figure anywhere in the row',
        budget?.want === "Reached its daily budget · Caw paused" &&
          !MONEY.test(budget.all),
        JSON.stringify(budget)
      );
    } finally {
      stage.kill("SIGTERM");
    }
  },
};
export default spec;
