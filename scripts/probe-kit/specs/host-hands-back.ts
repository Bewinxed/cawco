/**
 * A host-scope delegate hands files back through the hub: what it leaves in
 * `$TMPDIR/outputs/` reaches its project's `assets/<item>/` when it finishes,
 * and its scratch dir goes once its session is stopped. On a scratch fleet
 * (real hub, agent and sessiond; Claude Code against the mock model). Host
 * scope cuts no workspace, so this runs inside one too; host-delegates' h9
 * holds the same of OpenCode and pi, on the host.
 *
 * - o1. Its `TMPDIR` is its host workspace's scratch dir
 *   (`~/.cawco/tmp/<id8>`, agent host-scratch.ts), and the input it was
 *   delegated with is in `$TMPDIR/inputs/`.
 * - o2. Its item is done, and its parent's report lists each file it left in
 *   `$TMPDIR/outputs/`, a subfolder's at its path, at `assets/<item>/…` of
 *   the project's folder, each holding what it wrote.
 * - o3. Its session stopped, the hub settles its row: the scratch dir is
 *   gone from the machine (hub workspaces.ts `settleHost`).
 *
 *   bun scripts/probe-kit/run.ts host-hands-back
 */
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  MACHINE,
  MODEL,
  type Reply,
  type Seen,
  until,
} from "../../scratch-fleet";
import { delegateStarted } from "../kit";
import type { Kit, Spec } from "../spec";

const TAG = "PROBE-HOST-HANDS-BACK";
const BEGIN = "HANDSBACK-BEGIN";
const END = "HANDSBACK-END";
const REPORT = "[Report from delegate ";
const IN_FILE = "handed-in.txt";
/** What it leaves in `$TMPDIR/outputs/`, by path there; only this run's command can have written these. */
const OUT: Record<string, string> = {
  "Slope-USDC-trace-report.pdf": `pdf-${crypto.randomUUID()}`,
  "deep/ledger.csv": `csv-${crypto.randomUUID()}`,
};
const COMMAND = [
  `printf '${BEGIN}\\n'`,
  'echo "tmpdir $TMPDIR"',
  `ls "$TMPDIR/inputs" | sed 's/^/input /'`,
  'mkdir -p "$TMPDIR/outputs/deep"',
  ...Object.entries(OUT).map(
    ([path, body]) => `printf %s ${body} > "$TMPDIR/outputs/${path}"`
  ),
  `printf '${END}\\n'`,
].join("; ");

const text = (words: string): Reply => ({ everyMs: 5, words: [words] });
const useTool = (name: string, input: object): Reply => ({
  everyMs: 5,
  words: [],
  tool: { name, input },
});

/** The delegate's reading once its shell answered. */
let reading: string[] | undefined;
let finished = false;
let searched = false;

/** The lines between the marks of the request's text, or none. */
const readingIn = (said: string): string[] | undefined => {
  const from = said.indexOf(`${BEGIN}\n`);
  const to = said.indexOf(END, from + 1);
  return from < 0 || to < 0
    ? undefined
    : said
        .slice(from + BEGIN.length + 1, to)
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);
};

/** The delegate runs its command, then finishes with its reading; everyone else says "ok". */
const respond = (request: Seen): Reply => {
  if (
    !(request.tools && request.all.includes(`${TAG}:`)) ||
    request.all.includes(REPORT)
  ) {
    return text("ok");
  }
  if (request.afterTool && !reading) {
    reading = readingIn(request.last);
  }
  if (finished) {
    return text("Done.");
  }
  if (!reading) {
    return useTool("Bash", {
      command: COMMAND,
      description: "Copy the files out",
    });
  }
  if (!(request.toolNames.includes("mcp__cawco__finish_item") || searched)) {
    searched = true;
    return useTool("ToolSearch", {
      query: "select:mcp__cawco__finish_item",
      max_results: 1,
    });
  }
  finished = true;
  return useTool("mcp__cawco__finish_item", {
    headline: "Handed the files back.",
    summary: `${TAG} READ ${JSON.stringify(reading)}`,
  });
};
const spec: Spec = {
  group: "Workspaces and what agents may touch",
  name: "host-hands-back",
  run: async (kit: Kit) => {
    const { check } = kit;
    const fleet = await kit.fleet(respond);
    const home = fleet.env.HOME as string;
    fleet.launch("sessiond");
    await fleet.sessiondUp();
    fleet.launch("hub");
    await fleet.hubUp();
    fleet.fileAccount();
    fleet.launch("agent");
    await fleet.agentUp();
    await fleet.accountSignedIn();
    const src = join(fleet.sandbox, "src");
    await mkdir(src, { recursive: true });
    const project = await fleet.api((hub) =>
      hub.api.projects.post({
        name: "Host hands back",
        machineId: MACHINE,
        cwd: src,
      })
    );
    const parent = await fleet.spawn("claude", "Parent", src, {
      projectId: project.id,
    });
    const input = join(fleet.sandbox, IN_FILE);
    await writeFile(input, "handed in\n");
    const started = delegateStarted(
      await fleet.api((hub) =>
        hub.api["work-items"].post({
          parentInstanceId: parent,
          title: "Hand files back",
          prompt: `${TAG}: copy the files into $TMPDIR/outputs/, then finish.`,
          harness: "claude",
          model: MODEL.claude,
          host: true,
          inputs: [input],
        })
      )
    );
    const state = await until(
      "the host delegate's item ended",
      () =>
        fleet.query<{ state: string }>(
          "SELECT state FROM work_items WHERE id = ?",
          started.workItemId
        )[0]?.state,
      (now) => now === "done" || now === "failed" || now === "cancelled",
      240_000
    ).catch(() => "unended");
    const scratch = join(
      home,
      ".cawco",
      "tmp",
      started.workspaceId.slice(0, 8)
    );
    const tmpdir = reading
      ?.find((line) => line.startsWith("tmpdir "))
      ?.slice("tmpdir ".length);
    check(
      "o1: its TMPDIR is its host workspace's scratch dir, and its input is in $TMPDIR/inputs/",
      tmpdir === scratch && reading?.includes(`input ${IN_FILE}`) === true,
      `${state}; reading ${JSON.stringify(reading)}; want ${scratch}`
    );
    const report =
      (await until(
        "the report at its parent",
        () =>
          fleet.seen
            .map((one) => one.all)
            .find(
              (all) => all.includes(REPORT) && all.includes(`${TAG} READ`)
            ) ?? null,
        Boolean,
        120_000
      ).catch(() => null)) ?? "";
    const assets = `/assets/${started.workItemId.slice(0, 8)}/`;
    const listed = report
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.startsWith("- /") && line.includes(assets))
      .map((line) => line.slice(2));
    const copied = await Promise.all(
      Object.entries(OUT).map(async ([path, body]) => {
        const at = listed.find((one) => one.endsWith(`${assets}${path}`));
        const held = at ? await readFile(at, "utf8").catch(() => "") : "";
        return `${path}: ${at ?? "not listed"} ${held === body ? "ok" : "wrong"}`;
      })
    );
    check(
      "o2: its item is done, and its parent's report lists each file it left in $TMPDIR/outputs/ at assets/<item>/, each holding what it wrote",
      state === "done" && copied.every((one) => one.endsWith(" ok")),
      `${state}; ${copied.join("; ")}; ${report.slice(-800)}`
    );
    await fleet.stopSession(started.instanceId);
    const gone = await until(
      "its scratch dir gone",
      () => !existsSync(scratch),
      Boolean,
      60_000
    ).catch(() => false);
    check(
      "o3: its session stopped, the hub settles its row and its scratch dir is gone",
      gone,
      scratch
    );
  },
};

export default spec;
