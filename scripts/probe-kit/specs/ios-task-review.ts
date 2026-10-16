/**
 * iOS: the app's task sheet reads a task as the web's task page does
 * (tasks/TaskPane.svelte and TaskReview.svelte; the app's
 * TaskSheetController and TaskReviewView). On a scratch fleet (this
 * checkout's hub, agent and sessiond; Claude Code against the mock model),
 * one project, "Harbour", with two tasks:
 * - the review: in a `review` stage of kind `you`, two attempts read from
 *   the hub's own `work_items` (one failed, then one finished with its
 *   report), five outputs handed in under `assets/<task>/`;
 * - the failed run: in `todo`, its one session failed.
 *
 * The built app on an iPhone 16 Pro and an iPad Pro 13-inch (M4), iOS 18.5,
 * each in a mac-slot.sh slot of its own, opened on each task by a tapped
 * push (`-push-route`). Read from the sheet's DEBUG `TaskSheet` lines (each
 * `task-…` part's frame, whether it shows, what it says), light and dark:
 *
 *  a. Review · Details, Review chosen; the bands in order: the result, the
 *     stage, the decision, one under the other at the sheet's width.
 *  b. The result band: the session that handed it in, its Open, and what it
 *     attached as links, each output by its name; nothing drawn as a format.
 *  c. The stage: its words whole (nothing presented), the report's markdown.
 *  d. The decision: Approve → Done, and Send back.
 *  e. The failed run: Failed beside its session, the hub's reason in the
 *     band, Try again where Approve was, no Approve.
 *  f. Details: the description, labels (editable: `launch` with its ×),
 *     fields, relations, the sessions that worked it (two), then the
 *     activity: the history's changes in one stream.
 *  g. A comment typed into the activity's box and sent stands in the stream.
 *  i. The details end with the safe area under their `pb-6`.
 *  q. A phone's sheet lays its surface over the screen's foot, `max(12,
 *     safe area) - 7` tall (ScreenEdges.svelte `.edge-bottom`); an iPad's, none.
 *  l. No text in the sheet lays out wider than its view (`prose overflow`).
 *  m. No inline code chip narrower than its line is laid across two.
 *
 * Each device writes the review and the details, light and dark, to the
 * spec's folder; the same task's page on the built dashboard (WebKit, at the
 * simulators' viewports; TaskPane and TaskReview, which web/task-review.ts
 * proves) writes its review beside them, light and dark, for the
 * side-by-side review.
 *
 *   bash apps/apple/scripts/build-both.sh ios --compile-only
 *   bun scripts/probe-kit/run.ts ios-task-review
 *
 * `PROBE_DEVICE=iPhone` (or `iPad`) runs one device.
 *
 * `PROBE_LIVE='<hub>|<project id>|<task id>[|<dashboard>]'` reads a real
 * task on a running hub instead of the seed, read and never written (no
 * comment is sent): a and f, and the web half from that hub's own dashboard.
 */
// biome-ignore-all lint/complexity/noExcessiveCognitiveComplexity: the checks are read in order, one after another.
// biome-ignore-all lint/performance/noAwaitInLoops: one device, one theme, one step after another
import { writeFile } from "node:fs/promises";
import { connect, createServer } from "node:net";
import { join } from "node:path";
import type { Subprocess } from "bun";
import { PNG } from "pngjs";
import { freshApp } from "../../lib/apple-app";
import { type MacSim, macSim } from "../../lib/mac-sim";
import { MACHINE, type Seen, until } from "../../scratch-fleet";
import { type Kit, open, ROOT, type Spec, settle, THEMES } from "../kit";

const AXE = "/opt/homebrew/bin/axe";
/** iOS 18.5, the app's oldest target, where axe reaches the simulator from a workspace. */
const RUNTIME = "com.apple.CoreSimulator.SimRuntime.iOS-18-5";
const DEVICES = [
  {
    tag: "iPhone",
    phone: true,
    view: "iphone",
    scale: 3,
    type: "com.apple.CoreSimulator.SimDeviceType.iPhone-16-Pro",
  },
  {
    tag: "iPad",
    phone: false,
    view: "ipad",
    scale: 2,
    type: "com.apple.CoreSimulator.SimDeviceType.iPad-Pro-13-inch-M4-8GB",
  },
] as const;

const NAME = "Harbour";
const TITLE = "Write the launch post and its week of posts";
const FAILED_TITLE = "Shorten the launch post to fit X";
const STAGES =
  "---\ntodo       todo\nreview     you\ndone       done\nmoves\n  * → *    you, session\nviews\n  board      by stage\n---\n";
const MINUTE = 60_000;
const HEADLINE = "Wrote the launch post and planned launch week's three posts.";
/** A real report's length, with inline code in it. */
const REPORT = [
  "The post leads with booking a berth in two taps. The week goes out **Monday, Wednesday and Friday**, each post under 280 characters, written to `post.md` and planned in `schedule.json`.",
  "`week.csv` keeps each post's reach from the last launch, so the Friday post can lean on what read best. The page in `page.html` is the post as it will look on the site, and `cover.png` its picture.",
  "Nothing was posted: every post waits for your approval in `Queue { posts, approvals }` until you say so.",
].join("\n\n");
const DESCRIPTION = [
  "The launch post for Harbour, and what goes out each day of launch week: one post a day, each under 280 characters, in the house voice.",
  "Read `knowledge/brand.md` first; the week's posts go in `schedule.json`, one record a day with its time and its words.",
].join("\n\n");
const FAILED_WHY = "the post ran past 280 characters.";
const COMMENT = "Lead Friday with the reach numbers.";
const POST =
  "---\ntitle: Harbour is live\n---\n# Harbour is live\n\nToday we open Harbour to everyone. Book a berth in two taps, pay at the quay, and sail.\n";
const SCHEDULE = {
  title: "Launch week",
  channel: "X",
  posts: [
    { day: "Monday", time: "09:00", text: "Harbour is live." },
    { day: "Wednesday", time: "12:30", text: "How berth booking works." },
    { day: "Friday", time: "17:00", text: "A week on the water." },
  ],
};
const WEEK =
  'day,post,reach\nMonday,"Harbour is live.",1200\nWednesday,"How berth booking works.",860\nFriday,"A week on the water.",940\n';
const PAGE =
  '<!doctype html><html><body style="font-family: -apple-system; margin: 24px"><h1>Harbour</h1><p>Book a berth in two taps.</p></body></html>';
/** Each output and its bytes as the folder takes them. */
const OUTPUTS: { name: string; content: string; base64?: boolean }[] = [
  { name: "post.md", content: POST },
  { name: "schedule.json", content: JSON.stringify(SCHEDULE, null, 2) },
  { name: "week.csv", content: WEEK },
  { name: "page.html", content: PAGE },
  { name: "cover.png", content: cover().toString("base64"), base64: true },
];

/** A picture worth looking at: 320 × 180, a sea's gradient under a horizon. */
function cover(): Buffer {
  const png = new PNG({ width: 320, height: 180 });
  for (let y = 0; y < png.height; y += 1) {
    for (let x = 0; x < png.width; x += 1) {
      const at = (y * png.width + x) * 4;
      const sea = y > 110;
      png.data[at] = sea ? 30 : 250 - y;
      png.data[at + 1] = sea ? 90 + (y - 110) : 200 - y / 2;
      png.data[at + 2] = sea ? 140 + x / 8 : 120 + y;
      png.data[at + 3] = 255;
    }
  }
  return PNG.sync.write(png);
}

/** `--space-6`: the details' `pb-6`. */
const SPACE_6 = 21;
/** The details' own parts, in the web's order (TaskPane's `.task-body`). */
const DETAIL_PARTS = [
  "task-text-description",
  "task-text-acceptance-criteria",
  "task-labels",
  "task-fields",
  "task-relations",
  "task-sessions",
  "task-activity",
];
const FOOT = /foot=([\d.-]+) safe=([\d.-]+)/;
const LOG_HEAD = /^.*\] /;
const OFFSET = /offset=([\d.-]+)/;
const COMMENT_PART = /^task-activity-comment-\d+$/;
const CHANGE_PART = /^task-activity-change-\d+$/;
const SESSION_PART = /^task-session-/;

/** What the sheet should show for a task, as its hub reads it. */
interface ReadTask {
  attempts: {
    endedHow: string | null;
    instanceId: string;
    state: string;
    workItemId: string;
  }[];
  kind: string;
  labels: string[];
  lastAttemptFailed: boolean;
  outputs: string[];
  result: { headline: string | null } | null;
}

/**
 * A dashboard on the local network, relayed to a loopback port this process
 * holds, byte for byte: a browser Playwright downloads has no Local Network
 * permission on macOS ("The Internet connection appears to be offline"),
 * while this process, a command-line one, reaches the hub as curl does.
 */
async function relay(
  target: string
): Promise<{ origin: string; stop: () => void }> {
  const to = new URL(target);
  if (["127.0.0.1", "localhost"].includes(to.hostname)) {
    return { origin: target, stop: () => undefined };
  }
  const server = createServer((client) => {
    const upstream = connect(Number(to.port || 80), to.hostname);
    client.pipe(upstream);
    upstream.pipe(client);
    upstream.on("error", () => client.destroy());
    client.on("error", () => upstream.destroy());
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  return { origin: `http://127.0.0.1:${port}`, stop: () => server.close() };
}

/** A `TaskSheet` part line: its id, where its frame is read, the frame, whether it shows, what it says. */
const PART =
  /^part (\S+) in=(body|window) frame=([\d.-]+),([\d.-]+),([\d.-]+),([\d.-]+) shows=(\w+)(?: says=(.*))?$/;

interface Part {
  h: number;
  in: string;
  says: string;
  shows: boolean;
  w: number;
  x: number;
  y: number;
}

interface Node {
  frame?: { x: number; y: number; width: number; height: number };
  label?: string;
}

const pause = (ms: number) => Bun.sleep(ms);

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

const near = (a: number | undefined, b: number | undefined, by = 1) =>
  a !== undefined && b !== undefined && Math.abs(a - b) <= by;

const at = (part: Part | undefined) =>
  part
    ? `${part.x.toFixed(1)},${part.y.toFixed(1)} ${part.w.toFixed(1)}×${part.h.toFixed(1)}${part.shows ? "" : " hidden"}${part.says ? ` "${part.says}"` : ""}`
    : "absent";

/** The seed: its stages, the two tasks' files, the outputs in the folder, the attempts in the hub's work items. */
async function seed(fleet: Awaited<ReturnType<Kit["fleet"]>>) {
  const project = await fleet.api<{ id: string }>("/api/projects", {
    name: NAME,
    machineId: MACHINE,
    cwd: fleet.repo,
    caw: false,
  });
  const put = async (path: string, content: string, base64 = false) => {
    const response = await fetch(
      `${fleet.base}/api/projects/${project.id}/folder/file`,
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          path,
          content,
          ...(base64 ? { encoding: "base64" } : {}),
        }),
      }
    );
    if (!response.ok) {
      throw new Error(
        `write ${path}: ${response.status} ${await response.text()}`
      );
    }
  };
  await put("stages.md", STAGES);
  const task = await fleet.api<{ id: string; path: string }>(
    `/api/projects/${project.id}/tasks`,
    { title: TITLE, stage: "review" }
  );
  await put(
    task.path,
    [
      "---",
      "stage: review",
      "type: writer",
      `outputs: [${OUTPUTS.map((o) => o.name).join(", ")}]`,
      "labels: [launch]",
      "lands: none",
      "---",
      `# ${TITLE}`,
      "",
      DESCRIPTION,
      "",
      "## Acceptance criteria",
      "",
      "The post reads in under a minute. Each day has one post.",
      "",
      "## To-dos",
      "",
      "- [x] [td-1] Draft the post",
      "- [x] [td-2] Plan the week",
      "",
    ].join("\n")
  );
  for (const output of OUTPUTS) {
    await put(
      `assets/${task.id}/${output.name}`,
      output.content,
      output.base64
    );
  }
  const failedTask = await fleet.api<{ id: string }>(
    `/api/projects/${project.id}/tasks`,
    { title: FAILED_TITLE, stage: "todo" }
  );
  // Each attempt's session.
  const done = await fleet.spawn("claude", "Write launch week", fleet.repo, {
    projectId: project.id,
  });
  const failed = await fleet.spawn("claude", "First draft", fleet.repo, {
    projectId: project.id,
  });
  const shortened = await fleet.spawn("claude", "Shorten it", fleet.repo, {
    projectId: project.id,
  });
  await fleet.send(done, "Plan launch week, one post a day.");
  const now = Date.now();
  fleet.write(
    "INSERT INTO workspaces (id, machine_id, repo_root, path, branch, state, created_by_instance_id, created_at) VALUES (?, ?, ?, ?, ?, 'archived', ?, ?)",
    "ws-review",
    MACHINE,
    fleet.repo,
    fleet.repo,
    "ws/review",
    done,
    now - 60 * MINUTE
  );
  const item = (
    id: string,
    taskId: string,
    instance: string,
    state: string,
    started: number,
    ended: number,
    words: { summary?: string; headline?: string; error?: string },
    outputs: string[]
  ) =>
    fleet.write(
      "INSERT INTO work_items (id, workspace_id, parent_instance_id, instance_id, brief, title, task_id, project_id, harness, state, summary, headline, error, outputs, created_at, ended_at) VALUES (?, 'ws-review', ?, ?, ?, ?, ?, ?, 'claude', ?, ?, ?, ?, ?, ?, ?)",
      id,
      done,
      instance,
      `Your work item is an attempt at ${taskId}.`,
      TITLE,
      taskId,
      project.id,
      state,
      words.summary ?? null,
      words.headline ?? null,
      words.error ?? null,
      JSON.stringify(outputs),
      started,
      ended
    );
  const names = OUTPUTS.map((o) => o.name);
  item(
    "wi-review-1",
    task.id,
    failed,
    "failed",
    now - 40 * MINUTE,
    now - 37 * MINUTE,
    { error: FAILED_WHY },
    names
  );
  item(
    "wi-review-2",
    task.id,
    done,
    "done",
    now - 10 * MINUTE,
    now - 10 * MINUTE + 65_000,
    { summary: REPORT, headline: HEADLINE },
    names
  );
  item(
    "wi-failed-1",
    failedTask.id,
    shortened,
    "failed",
    now - 8 * MINUTE,
    now - 6 * MINUTE,
    { error: FAILED_WHY },
    []
  );
  return {
    projectId: project.id,
    taskId: task.id,
    failedTaskId: failedTask.id,
  };
}

/** One device: the review, the failed run, then the details and a comment, light and dark. */
async function device(
  kit: Kit,
  base: string,
  ids: { projectId: string; taskId: string; failedTaskId?: string },
  which: (typeof DEVICES)[number],
  task: ReadTask,
  writes: boolean
): Promise<void> {
  const { tag } = which;
  let sim: MacSim | undefined;
  let stream: Subprocess | undefined;
  const lines: string[] = [];
  /** Each part on screen now, as its last line has it. */
  const parts = new Map<string, Part>();
  /** Each part as it was last seen, kept after it scrolls away. */
  const seen = new Map<string, Part>();
  /** Each part as it last stood on screen. */
  const onShow = new Map<string, Part>();
  /** Text the app laid out wider than its view (ProseView's DEBUG `prose overflow`). */
  const overflow: string[] = [];
  /** Inline code chips narrower than a line laid across two (`prose chip split`). */
  const splits: string[] = [];
  try {
    sim = await macSim({ runtime: RUNTIME, device: which.type });
    const { udid } = sim;
    console.log(`  ${tag} simulator ${udid}`);
    await sh(`xcrun simctl bootstatus ${udid} -b >/dev/null`);
    await sh(`xcrun simctl install ${udid} "${freshApp(ROOT).path}"`);
    const child = Bun.spawn(
      [
        "bash",
        "-c",
        `exec xcrun simctl spawn ${udid} log stream --level debug --style compact --predicate 'subsystem == "dev.cawco.app" AND (category == "TaskSheet" OR category == "Push" OR (category == "Prose" AND (eventMessage BEGINSWITH "prose overflow" OR eventMessage BEGINSWITH "prose chip split")))'`,
      ],
      { stdout: "pipe", stderr: "ignore" }
    );
    stream = child;
    (async () => {
      const decoder = new TextDecoder();
      const reader = child.stdout.getReader();
      let rest = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        rest += decoder.decode(value, { stream: true });
        const split = rest.split("\n");
        rest = split.pop() ?? "";
        for (const raw of split) {
          if (!raw.includes("dev.cawco.app")) {
            continue;
          }
          const line = raw.replace(LOG_HEAD, "");
          lines.push(line);
          if (line.startsWith("prose overflow")) {
            overflow.push(line);
          }
          if (line.startsWith("prose chip split")) {
            splits.push(line);
          }
          const part = PART.exec(line);
          if (part) {
            const read: Part = {
              in: part[2],
              x: Number(part[3]),
              y: Number(part[4]),
              w: Number(part[5]),
              h: Number(part[6]),
              shows: part[7] === "true",
              says: part[8] ?? "",
            };
            parts.set(part[1], read);
            seen.set(part[1], read);
            if (read.shows) {
              onShow.set(part[1], read);
            }
          } else if (line.startsWith("gone ")) {
            parts.delete(line.slice(5));
          }
        }
      }
    })().catch(() => undefined);
    await pause(1500);

    const tree = async (): Promise<Node[]> => {
      const out: Node[] = [];
      const walk = (node: Record<string, unknown>) => {
        out.push({
          label: (node.AXLabel ?? node.label) as string | undefined,
          frame: node.frame as Node["frame"],
        });
        for (const kid of (node.children as
          Record<string, unknown>[] | undefined) ?? []) {
          walk(kid);
        }
      };
      for (const root of JSON.parse(
        await sh(`${AXE} describe-ui --udid ${udid}`)
      ) as Record<string, unknown>[]) {
        walk(root);
      }
      return out;
    };
    const part = (id: string) => parts.get(id);
    /** A node labelled `label` wholly inside `region`'s frame in the window, where a tap reaches it. */
    const onScreen = async (label: string, region = "task-sheet") => {
      const within = part(region);
      const top = within?.y ?? 0;
      const floor = within ? within.y + within.h : Number.POSITIVE_INFINITY;
      return (await tree()).find(
        (n) =>
          n.label === label &&
          (n.frame?.width ?? 0) > 0 &&
          (n.frame?.y ?? -1) >= top &&
          (n.frame?.y ?? 0) + (n.frame?.height ?? 0) <= floor
      );
    };
    const tapLabel = async (label: string, region?: string) => {
      const f = (await onScreen(label, region))?.frame;
      if (!f) {
        throw new Error(`${tag}: nothing labelled "${label}" to tap`);
      }
      await sh(
        `${AXE} tap -x ${Math.round(f.x + f.width / 2)} -y ${Math.round(f.y + f.height / 2)} --udid ${udid}`
      );
    };
    const waitFor = (what: string, test: () => boolean, ms = 60_000) =>
      until(what, () => test() || undefined, Boolean, ms).catch(
        () => undefined
      );
    const shot = (name: string) =>
      sh(
        `xcrun simctl io ${udid} screenshot "${join(kit.out, `${tag}-${name}.png`)}" >/dev/null 2>&1`
      );
    /** How far the details are scrolled from their top (the probe's `offset=`). */
    const offset = () =>
      Number(OFFSET.exec(part("task-details")?.says ?? "")?.[1] ?? 0);
    /**
     * The details scrolled by a drag down their middle, about half their
     * height: down to read further, up only while not at the top, where a
     * drag would pull the sheet itself down.
     */
    const scroll = async (down: boolean) => {
      const body = part("task-details");
      if (!body || (!down && offset() < 40)) {
        return;
      }
      const reach = Math.round(
        down ? Math.min(200, body.h * 0.5) : Math.min(200, offset() / 2)
      );
      // Down the list's middle at a finger's pace: a 1.5s drag in its 9pt
      // margin moved it none in 24 tries; 0.5s down the middle moved it 476pt.
      const x = Math.round(body.x + body.w / 2);
      const middle = Math.round(body.y + body.h / 2);
      const [from, to] = down
        ? [middle + reach / 2, middle - reach / 2]
        : [middle - reach / 2, middle + reach / 2];
      await sh(
        `${AXE} swipe --start-x ${x} --start-y ${from} --end-x ${x} --end-y ${to} --duration 0.6 --udid ${udid}`
      );
      await pause(1600);
    };
    /** The details scrolled down until `label` is wholly on screen. */
    const reveal = async (label: string) => {
      for (let n = 0; n < 24 && !(await onScreen(label)); n += 1) {
        await scroll(true);
      }
    };
    /** The sheet opened on a task by its push, Review chosen, its result band read. */
    const openOn = async (taskId: string) => {
      for (const id of [...parts.keys()]) {
        parts.delete(id);
      }
      const route = JSON.stringify({
        kind: "task",
        projectId: ids.projectId,
        taskId,
      });
      await sh(
        `xcrun simctl launch --terminate-running-process ${udid} dev.cawco.app -paywall-env sandbox -cawco-hub-url ${base} -push-route 'push:${route}' >/dev/null`
      );
      const opened = await waitFor(
        `${taskId}'s review`,
        () =>
          part("task-id")?.says === taskId &&
          !!part("task-band-result")?.shows &&
          !!part("task-review-session"),
        90_000
      );
      await pause(2500);
      return !!opened;
    };

    // The review, light and dark.
    for (const theme of THEMES) {
      await sh(`xcrun simctl ui ${udid} appearance ${theme}`);
      const opened = await openOn(ids.taskId);
      if (
        !kit.check(
          `${tag} (${theme}): the push opens the task's sheet on its review`,
          opened,
          lines.slice(-6).join(" | ") || "no TaskSheet line"
        )
      ) {
        return;
      }
      await shot(`review-${theme}`);
      // a. The switch, and the bands in order.
      const sheet = part("task-sheet");
      const bands = ["task-band-result", "task-band-stage", "task-band-decide"]
        .map((id) => part(id))
        .filter((band) => band?.shows);
      const deciding = task.kind === "you" || task.lastAttemptFailed;
      // Each band across the sheet, in its `--pane-inline` (space-5) or edge to edge.
      const across = (band: Part | undefined) =>
        !!band &&
        !!sheet &&
        near(band.x + band.w / 2, sheet.x + sheet.w / 2) &&
        band.w >= sheet.w - 2 * 18 - 1;
      kit.check(
        `${tag} a (${theme}): Review · Details on Review; the result, the stage${deciding ? ", the decision" : ""}, in order, across the sheet`,
        part("task-view-switch")?.says === "selected=0" &&
          bands.length === (deciding ? 3 : 2) &&
          bands.every(
            (band, i) =>
              across(band) &&
              (i === 0 ||
                (band?.y ?? 0) >=
                  (bands[i - 1]?.y ?? 0) + (bands[i - 1]?.h ?? 0))
          ),
        `switch ${at(part("task-view-switch"))} | ${bands.map(at).join(" | ")} | sheet ${at(sheet)}`
      );
      if (writes && theme === "light") {
        // b. The session, its Open, what it attached as links.
        const attached = task.outputs.map((name) =>
          part(`task-attachment-${name}`)
        );
        const drawnAs = [...parts.keys()].filter((id) =>
          id.startsWith("task-output-")
        );
        kit.check(
          `${tag} b: the session that handed it in, Open, and the ${task.outputs.length} outputs as links by name`,
          !!part("task-review-session")?.says &&
            part("task-review-open")?.shows === true &&
            attached.every(
              (a, i) => a?.shows && a.says.startsWith(task.outputs[i])
            ) &&
            drawnAs.length === 0,
          `session ${at(part("task-review-session"))} | open ${at(part("task-review-open"))} | ${attached.map(at).join(" | ")}`
        );
        // c. Nothing presented: the stage is its words whole.
        const words = part("task-review-words");
        const stage = part("task-band-stage");
        kit.check(
          `${tag} c: the stage holds the session's words whole`,
          !!words?.shows &&
            (words?.y ?? 0) >= (stage?.y ?? Number.POSITIVE_INFINITY),
          `words ${at(words)} | stage ${at(stage)}`
        );
        // d. The decision.
        kit.check(
          `${tag} d: the decision: Approve → Done, and Send back`,
          part("task-approve")?.says === "Approve → Done" &&
            part("task-send-back")?.says === "Send back" &&
            !part("task-try-again"),
          `${at(part("task-approve"))} | ${at(part("task-send-back"))}`
        );
      }
    }

    // e. The failed run.
    if (ids.failedTaskId) {
      await sh(`xcrun simctl ui ${udid} appearance light`);
      const opened = await openOn(ids.failedTaskId);
      await shot("failed-light");
      kit.check(
        `${tag} e: the failed run says Failed and why, with Try again in Approve's place`,
        opened &&
          part("task-review-ended-badge")?.says === "Failed" &&
          part("task-review-ended")?.says === FAILED_WHY &&
          part("task-try-again")?.says === "Try again" &&
          !part("task-approve") &&
          !!part("task-band-decide")?.shows,
        [
          "task-review-ended-badge",
          "task-review-ended",
          "task-try-again",
          "task-approve",
          "task-band-decide",
        ]
          .map((id) => `${id} ${at(part(id))}`)
          .join(" | ")
      );
    }

    // f. Details, light and dark.
    for (const theme of THEMES) {
      await sh(`xcrun simctl ui ${udid} appearance ${theme}`);
      await openOn(ids.taskId);
      await tapLabel("Details");
      await waitFor("the details", () => !!part("task-details")?.shows, 15_000);
      await pause(1500);
      await shot(`details-${theme}`);
      // Each part as it stood when it was on screen: the list hides a cell
      // it has scrolled away, so one passed on the way down reads hidden after.
      for (
        let n = 0;
        n < 24 && !DETAIL_PARTS.every((id) => onShow.has(id));
        n += 1
      ) {
        await scroll(true);
      }
      await pause(1500);
      await shot(`details-foot-${theme}`);
      if (theme !== "light") {
        continue;
      }
      const shownParts = DETAIL_PARTS.map((id) => onShow.get(id));
      const sessions = [...seen.keys()].filter((id) => SESSION_PART.test(id));
      const changes = [...seen.keys()].filter((id) => CHANGE_PART.test(id));
      kit.check(
        `${tag} f: Details on Details; ${DETAIL_PARTS.join(", ")} in order; ${task.attempts.length} sessions; the history in the activity`,
        part("task-view-switch")?.says === "selected=1" &&
          shownParts.every(
            (p, i) =>
              p?.shows && (i === 0 || (p.y ?? 0) > (shownParts[i - 1]?.y ?? 0))
          ) &&
          task.labels.every((label) => !!seen.get(`task-label-${label}`)) &&
          sessions.length === task.attempts.length &&
          changes.length > 0,
        `${shownParts.map(at).join(" | ")} | sessions ${sessions.length} | changes ${changes.length}`
      );
      // i. The details' foot.
      const footing = FOOT.exec(part("task-details")?.says ?? "");
      const foot = Number(footing?.[1] ?? -1);
      const safe = Number(footing?.[2] ?? 0);
      kit.check(
        `${tag} i: the details end with the safe area under their pb-6 (${safe.toFixed(1)} + ${SPACE_6})`,
        foot >= safe + SPACE_6 - 0.5,
        part("task-details")?.says ?? "no details line"
      );
      // q. The phone's foot strip. The details end over the keyboard's guide,
      // the safe area's top with no keyboard: the sheet's safe area is what
      // stands under them.
      const footStrip = part("task-sheet-foot");
      const sheet = part("task-sheet");
      const details = part("task-details");
      const sheetSafe =
        (sheet?.y ?? 0) +
        (sheet?.h ?? 0) -
        ((details?.y ?? 0) + (details?.h ?? 0));
      const strip = which.phone ? Math.max(12, sheetSafe) - 7 : 0;
      kit.check(
        `${tag} q: the sheet's foot strip stands ${strip.toFixed(1)}pt tall at the screen's foot (its safe area ${sheetSafe.toFixed(1)})`,
        !!footStrip &&
          near(footStrip.h, strip) &&
          (strip === 0 ||
            near(footStrip.y + footStrip.h, (sheet?.y ?? 0) + (sheet?.h ?? 0))),
        `foot ${at(footStrip)} | sheet ${at(sheet)} | details ${at(details)}`
      );
      // g. A comment, typed and sent, in the stream.
      if (writes) {
        await reveal("Add a comment");
        await tapLabel("Add a comment");
        await pause(800);
        await sh(`${AXE} type '${COMMENT}' --udid ${udid}`);
        await pause(800);
        await tapLabel("Send the comment");
        const posted = await waitFor(
          "the comment in the stream",
          () =>
            [...parts.entries()].some(
              ([id, p]) => COMMENT_PART.test(id) && p.says.endsWith(COMMENT)
            ),
          30_000
        );
        await pause(1500);
        await shot("commented-light");
        const said = [...parts.entries()].find(
          ([id, p]) => COMMENT_PART.test(id) && p.says.endsWith(COMMENT)
        );
        kit.check(
          `${tag} g: a comment typed into the activity's box and sent stands in its stream as yours`,
          !!posted && said?.[1].says === `You: ${COMMENT}`,
          said
            ? `${said[0]} ${at(said[1])}`
            : [
                "task-comment-field",
                "task-comment-send",
                "task-comment-refused",
              ]
                .map((id) => `${id} ${at(seen.get(id))}`)
                .join(" | ")
        );
      }
    }
    await sh(`xcrun simctl ui ${udid} appearance light`);

    // l. No text the sheet drew ran past its view.
    kit.check(
      `${tag} l: no text in the sheet lays out wider than its view`,
      overflow.length === 0,
      overflow.slice(0, 4).join(" | ") || "none"
    );
    // m. An inline code chip that fits a line stands on one (the web's `inline-block`).
    kit.check(
      `${tag} m: no inline code chip narrower than its line is laid across two`,
      splits.length === 0,
      splits.slice(0, 4).join(" | ") || "none"
    );
  } finally {
    await writeFile(join(kit.out, `${tag}-log.txt`), lines.join("\n"));
    await writeFile(
      join(kit.out, `${tag}-parts.json`),
      JSON.stringify(Object.fromEntries(seen), null, 2)
    );
    stream?.kill();
    await sim?.release();
  }
}

/** The same task on the built dashboard, at the simulator's viewport in WebKit: the web half of each pair. */
async function web(
  kit: Kit,
  dashboard: string,
  ids: { projectId: string; taskId: string },
  which: (typeof DEVICES)[number]
) {
  for (const theme of THEMES) {
    const page = await kit.page(which.view, {
      engine: "webkit",
      scale: which.scale,
      theme,
    });
    // The task's page (TaskPane), its review's first band the session's
    // message (TaskReview `data-band=result`), as web/task-review.ts reads it.
    const pane = `[data-task-pane="${ids.taskId}"]`;
    await open(
      page,
      `${dashboard}/project/${ids.projectId}?task=${ids.taskId}`,
      `${pane} [data-band=result]`,
      90_000
    );
    await settle(page, 400);
    await page.screenshot({
      path: join(kit.out, `web-${which.tag}-review-${theme}.png`),
    });
    await page.close();
  }
}

const spec: Spec = {
  name: "ios-task-review",
  async run(kit) {
    // A checkout with no app built from its tree builds one: the host runs
    // this spec in a checkout of its own, where only the compile check had
    // built it, and a compile check passed earlier is not run again.
    if (freshApp(ROOT).problem) {
      await sh(`cd "${ROOT}" && bash apps/apple/scripts/build-both.sh ios`);
    }
    const { path: app, problem } = freshApp(ROOT);
    if (
      !kit.check("the app is built from this tree", !problem, problem ?? app)
    ) {
      return;
    }
    const only = process.env.PROBE_DEVICE;
    const devices = DEVICES.filter((d) => !only || d.tag === only);
    // `PROBE_LIVE=<hub>|<project id>|<task id>`: a real task on a running
    // hub, read and never written; its dashboard is the hub's own.
    const live = process.env.PROBE_LIVE?.split("|");
    if (live && live.length >= 3) {
      const [hub, projectId, taskId, dashboard = hub] = live;
      const ids = { projectId, taskId };
      const task = (await (
        await fetch(`${hub}/api/projects/${projectId}/tasks/${taskId}`)
      ).json()) as ReadTask;
      for (const which of devices) {
        await device(kit, hub, ids, which, task, false);
      }
      const relayed = await relay(dashboard);
      try {
        for (const which of devices) {
          await web(kit, relayed.origin, ids, which);
        }
      } finally {
        relayed.stop();
      }
      kit.note(`live captures of ${taskId} in ${kit.out}`);
      return;
    }
    const fleet = await kit.fleet((_: Seen) => ({
      everyMs: 20,
      words: ["Laid the week out day by day: Monday, Wednesday and Friday."],
    }));
    fleet.launch("sessiond");
    await fleet.sessiondUp();
    fleet.launch("hub");
    await fleet.hubUp();
    fleet.fileAccount();
    fleet.launch("agent");
    await fleet.agentUp();
    await fleet.accountSignedIn();
    const ids = await seed(fleet);
    const read = await fleet.api<ReadTask>(
      `/api/projects/${ids.projectId}/tasks/${ids.taskId}`
    );
    const failed = await fleet.api<ReadTask>(
      `/api/projects/${ids.projectId}/tasks/${ids.failedTaskId}`
    );
    if (
      !kit.check(
        "the hub reads the seed: the review's report, two attempts, five outputs; the failed run's one failed session",
        read.result?.headline === HEADLINE &&
          read.attempts.length === 2 &&
          read.outputs.length === OUTPUTS.length &&
          failed.lastAttemptFailed &&
          failed.attempts[0]?.endedHow === FAILED_WHY,
        JSON.stringify({
          result: read.result,
          attempts: read.attempts.map((a) => a.state),
          outputs: read.outputs,
          failed: failed.attempts.map((a) => [a.state, a.endedHow]),
        })
      )
    ) {
      return;
    }
    for (const which of devices) {
      await device(kit, fleet.base, ids, which, read, true);
    }
    const dashboard = await fleet.dashboard();
    for (const which of devices) {
      await web(kit, dashboard, ids, which);
    }
    kit.note(
      `captures in ${kit.out}: <device>-review-<theme>.png, <device>-failed-light.png, <device>-details-<theme>.png, <device>-commented-light.png, web-<device>-review-<theme>.png`
    );
  },
};
export default spec;
