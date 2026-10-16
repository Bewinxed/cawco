/**
 * iOS: the app's task sheet reviews a task as the web's does (tasks/
 * TaskSheet.svelte and its parts; the app's TaskSheetController). On a
 * scratch fleet (this checkout's hub, agent and sessiond; Claude Code
 * against the mock model), one project, "Harbour", with one task in a
 * `review` stage of kind `you`: two attempts, read from the hub's own
 * `work_items` (one failed after 3 min, then one finished in a minute and
 * 5 s with its report), each in a session of its own, and five outputs
 * handed in under `assets/<task>/`: a post (`post.md`), a schedule
 * (`schedule.json`), a table (`week.csv`), a page (`page.html`) and a
 * picture (`cover.png`).
 *
 * The built app on an iPhone 16 Pro and an iPad Pro 13-inch (M4), iOS 18.5,
 * each in a mac-slot.sh slot of its own, opened on the task by a tapped
 * push (`-push-route`). Read from the sheet's DEBUG `TaskSheet` lines (each
 * `task-…` part's frame, whether it shows, what it says):
 *
 *  a. The header's facts are named: Stage, Status (Needs you) and Labels, each
 *     name at one x, each value at one x past it.
 *  b. The result leads with the attempt's own report: "Attempt 2 finished …
 *     and handed this in.", the report card first, then the outputs.
 *  c. Each output is drawn as what it is: the post as a document, the
 *     schedule as data, the CSV as a table, the page as a page, the picture
 *     as a picture; no part of the sheet says an output's file name.
 *  d. The cards stand the body's width less its `px-5`, `gap-4` apart.
 *  e. Attempts: "It has had 2.", tabs with the newest chosen, its state
 *     "Finished in 1 min", Try again.
 *  f. The transcript pane stands under the attempt, 480pt tall, the cards' width.
 *  g. The older tab: "Failed after 3 min" and how it ended; back again.
 *  h. Expand: the pane at the sheet's full height, over the review on the
 *     phone, beside it on the iPad (the review 416pt at the sheet's right
 *     edge, the pane filling the rest); Collapse puts it back under the attempt,
 *     where it stood.
 *  i. The body ends with the safe area under its `pb-6`: the last line
 *     scrolls clear of the home indicator.
 *  j. A data result's label stands in its 6rem column, its value `gap-4` past it.
 *  k. Every markdown in the review (MarkdownDocumentView over MessageBody:
 *     the report, a document handed in, the description and acceptance
 *     criteria) stands at its height again after Expand and Collapse, which
 *     lays it at the iPad review's 416pt and back.
 *  l. No text in the sheet or its transcript lays out wider than its view
 *     (ProseView's DEBUG `prose overflow`): a line that does is cut off.
 *
 * Each device writes the sheet and the sheet expanded, light and dark, to
 * the spec's folder; the same task on the built dashboard (WebKit, at the
 * simulators' viewports) writes its own pair beside them, for the
 * side-by-side review.
 *
 *   bash apps/apple/scripts/build-both.sh ios --compile-only
 *   bun scripts/probe-kit/run.ts ios-task-review
 *
 * `PROBE_DEVICE=iPhone` (or `iPad`) runs one device.
 *
 * `PROBE_LIVE='<hub>|<project id>|<task id>[|<dashboard>]'` runs the same on a real task
 * on a running hub instead of the seed, read and never written: what it
 * expects is what that hub reads of the task (its attempts' words, its
 * facts, its outputs), and the web half is that hub's own dashboard.
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
const STAGES =
  "---\ntodo       todo\nreview     you\ndone       done\nmoves\n  * → *    you, session\nviews\n  board      by stage\n---\n";
const MINUTE = 60_000;
const HEADLINE = "Wrote the launch post and planned launch week's three posts.";
/**
 * Long enough to wrap to a different number of lines at each width the
 * sheet passes through (an expanded iPad's 416pt review, its 672pt sheet),
 * with inline code in it, as a real report has.
 */
const REPORT = [
  "The post leads with booking a berth in two taps. The week goes out **Monday, Wednesday and Friday**, each post under 280 characters, written to `post.md` and planned in `schedule.json`.",
  "`week.csv` keeps each post's reach from the last launch, so the Friday post can lean on what read best. The page in `page.html` is the post as it will look on the site, and `cover.png` its picture.",
  "Nothing was posted: every post waits for your approval in the queue.",
].join("\n\n");
const DESCRIPTION = [
  "The launch post for Harbour, and what goes out each day of launch week: one post a day, each under 280 characters, in the house voice.",
  "Read `knowledge/brand.md` first; the week's posts go in `schedule.json`, one record a day with its time and its words.",
].join("\n\n");
const FAILED_WHY = "the post ran past 280 characters.";
const POST =
  "---\ntitle: Harbour is live\n---\n# Harbour is live\n\nToday we open Harbour to everyone. Book a berth in two taps, pay at the quay, and sail.\n\nWe built it for the people who keep boats, not for the people who sell them.\n";
const SCHEDULE = {
  title: "Launch week",
  channel: "X",
  starts_at: "2026-10-19",
  posts: [
    { day: "Monday", time: "09:00", text: "Harbour is live." },
    { day: "Wednesday", time: "12:30", text: "How berth booking works." },
    { day: "Friday", time: "17:00", text: "A week on the water." },
  ],
};
const WEEK =
  'day,post,reach\nMonday,"Harbour is live.",1200\nWednesday,"How berth booking works.",860\nFriday,"A week on the water.",940\n';
const PAGE =
  '<!doctype html><html><body style="font-family: -apple-system; margin: 24px"><h1>Harbour</h1><p>Book a berth in two taps.</p><a href="https://example.com">Out</a></body></html>';
/** Each output, its kind as the sheet draws it, and its bytes as the folder takes them. */
const OUTPUTS: {
  name: string;
  drawn: string;
  content: string;
  base64?: boolean;
}[] = [
  { name: "post.md", drawn: "document", content: POST },
  {
    name: "schedule.json",
    drawn: "data",
    content: JSON.stringify(SCHEDULE, null, 2),
  },
  { name: "week.csv", drawn: "table", content: WEEK },
  { name: "page.html", drawn: "page", content: PAGE },
  {
    name: "cover.png",
    drawn: "picture",
    content: cover().toString("base64"),
    base64: true,
  },
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

/** `--space-5` and `--space-4` (design/tokens/cawco.tokens.json): the body's inset and the cards' gap. */
const SPACE_5 = 18;
const SPACE_4 = 14;
/** `--space-6`: the body's `pb-6`. */
const SPACE_6 = 21;
/** ResultData's label column, `minmax(6rem, max-content)` with short labels: 6rem. */
const DATA_COLUMN = 96;
/** The task's own text sections (TaskTextPart), by their ids. */
const TEXT_PARTS = ["task-text-description", "task-text-acceptance-criteria"];
const FOOT = /foot=([\d.-]+) safe=([\d.-]+)/;
const LOG_HEAD = /^.*\] /;
const OFFSET = /offset=([\d.-]+)/;
const HANDED_IN = /^Attempt \d+ finished .* and handed this in\.$/;
const EXTENSION = /\.([a-z0-9]+)$/i;
const WORKING = /^Working for /;
const ANY = /./;

/** What the sheet should show for the task it opens: the seeded one's, or a live one's as its hub reads it. */
interface Expect {
  /** The attempts, newest first: what each's status says, and how it ended. */
  attempts: { says: string | RegExp; how: string | null; workItemId: string }[];
  /** The facts the header names (`task-fact-<name>`). */
  facts: string[];
  /** Each output and what the sheet draws it as (TaskOutputView `shown`). */
  outputs: { name: string; drawn: string }[];
}

/** What the sheet draws an output as, by its name (result.ts `resultKind`, an SVG through WebKit). */
const drawnAs = (name: string): string => {
  const ext = EXTENSION.exec(name)?.[1]?.toLowerCase() ?? "";
  if (["md", "markdown", "mdx", "txt"].includes(ext)) {
    return "document";
  }
  if (["html", "htm"].includes(ext)) {
    return "page";
  }
  if (ext === "json") {
    return "data";
  }
  if (["csv", "tsv"].includes(ext)) {
    return "table";
  }
  if (ext === "svg") {
    return "svg";
  }
  return ["png", "jpg", "jpeg", "gif", "webp"].includes(ext)
    ? "picture"
    : "text";
};

/** A span in plain words (project-tasks.ts `spanWords`). */
const spanWords = (ms: number): string => {
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 60) {
    return `${seconds} s`;
  }
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) {
    return `${minutes} min`;
  }
  const rest = minutes % 60;
  return rest > 0
    ? `${Math.floor(minutes / 60)} h ${rest} min`
    : `${Math.floor(minutes / 60)} h`;
};

interface ReadTask {
  attempts: {
    endedAt: number | null;
    endedHow: string | null;
    startedAt: number;
    state: string;
    workItemId: string;
  }[];
  blockedBy: string[];
  labels: string[];
  lastAttemptFailed: boolean;
  lastAttemptStopped: boolean;
  liveAttempt: boolean;
  needsYou: boolean;
  outputs: string[];
  queuedStart: boolean;
  result: { headline: string | null } | null;
}

/** What the sheet should show for a task as its hub reads it (`attemptSentence`; a live attempt's count runs on). */
const expectOf = (task: ReadTask): Expect => ({
  attempts: task.attempts.map((a) => {
    const took = a.endedAt === null ? null : spanWords(a.endedAt - a.startedAt);
    const says: Record<string, string | RegExp> = {
      starting: "Starting",
      running: WORKING,
      done: `Finished in ${took}`,
      failed: `Failed after ${took}`,
      cancelled: `Stopped after ${took}`,
    };
    return {
      says: says[a.state] ?? ANY,
      how: a.endedHow,
      workItemId: a.workItemId,
    };
  }),
  facts: [
    "stage",
    ...(task.needsYou ||
    task.liveAttempt ||
    task.lastAttemptFailed ||
    task.lastAttemptStopped ||
    task.queuedStart
      ? ["status"]
      : []),
    ...(task.blockedBy.length > 0 ? ["waits-on"] : []),
    ...(task.labels.length > 0 ? ["labels"] : []),
  ],
  outputs: task.outputs.map((name) => ({ name, drawn: drawnAs(name) })),
});

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

const saysIt = (said: string | undefined, want: string | RegExp) =>
  typeof want === "string" ? said === want : want.test(said ?? "");
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

/** The task's seed: its stages, its file, its outputs in the folder, its attempts in the hub's work items. */
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
  // Each attempt's session: the finished one has said something, so its transcript has rows.
  const done = await fleet.spawn("claude", "Attempt 2", fleet.repo, {
    projectId: project.id,
  });
  const failed = await fleet.spawn("claude", "Attempt 1", fleet.repo, {
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
    instance: string,
    state: string,
    started: number,
    ended: number,
    words: { summary?: string; headline?: string; error?: string }
  ) =>
    fleet.write(
      "INSERT INTO work_items (id, workspace_id, parent_instance_id, instance_id, brief, title, task_id, project_id, harness, state, summary, headline, error, outputs, created_at, ended_at) VALUES (?, 'ws-review', ?, ?, ?, ?, ?, ?, 'claude', ?, ?, ?, ?, ?, ?, ?)",
      id,
      done,
      instance,
      `Your work item is an attempt at ${task.id}.`,
      TITLE,
      task.id,
      project.id,
      state,
      words.summary ?? null,
      words.headline ?? null,
      words.error ?? null,
      JSON.stringify(OUTPUTS.map((o) => o.name)),
      started,
      ended
    );
  item("wi-review-1", failed, "failed", now - 40 * MINUTE, now - 37 * MINUTE, {
    error: FAILED_WHY,
  });
  item(
    "wi-review-2",
    done,
    "done",
    now - 10 * MINUTE,
    now - 10 * MINUTE + 65_000,
    {
      summary: REPORT,
      headline: HEADLINE,
    }
  );
  return { projectId: project.id, taskId: task.id };
}

async function device(
  kit: Kit,
  base: string,
  ids: { projectId: string; taskId: string },
  which: (typeof DEVICES)[number],
  expect: Expect
): Promise<void> {
  const { tag } = which;
  const count = expect.attempts.length;
  const [newest, older] = expect.attempts;
  let sim: MacSim | undefined;
  let stream: Subprocess | undefined;
  const lines: string[] = [];
  /** Each part on screen now, as its last line has it. */
  const parts = new Map<string, Part>();
  /** Each part as it was last seen, kept after it scrolls away: a list part's frame is in the body's content points, which a scroll moves none of. */
  const seen = new Map<string, Part>();
  /**
   * Each part as it was last seen on screen: a cell the list lays out ahead,
   * off screen, logs its first self-sizing pass, before its words know
   * their width.
   */
  const shown = new Map<string, Part>();
  /** Text the app laid out wider than its view (ProseView's DEBUG `prose overflow`). */
  const overflow: string[] = [];
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
        `exec xcrun simctl spawn ${udid} log stream --level debug --style compact --predicate 'subsystem == "dev.cawco.app" AND (category == "TaskSheet" OR category == "Push" OR (category == "Prose" AND eventMessage BEGINSWITH "prose overflow"))'`,
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
              shown.set(part[1], read);
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
    /**
     * A node labelled `label` wholly inside `region`'s frame in the window
     * (the body, by default), where a tap reaches it: the accessibility tree
     * keeps a node scrolled up under the header, or off the sheet's top, at
     * its frame there.
     */
    const onScreen = async (label: string, region = "task-sheet-body") => {
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
      const node = await onScreen(label, region);
      const f = node?.frame;
      if (!f) {
        throw new Error(`${tag}: nothing labelled "${label}" to tap`);
      }
      await sh(
        `${AXE} tap -x ${Math.round(f.x + f.width / 2)} -y ${Math.round(f.y + f.height / 2)} --udid ${udid}`
      );
    };
    const part = (id: string) => parts.get(id);
    const waitFor = (what: string, test: () => boolean, ms = 60_000) =>
      until(what, () => test() || undefined, Boolean, ms).catch(
        () => undefined
      );
    const shot = (name: string) =>
      sh(
        `xcrun simctl io ${udid} screenshot "${join(kit.out, `${tag}-${name}.png`)}" >/dev/null 2>&1`
      );
    /** How far the body is scrolled from its top (the probe's `offset=`). */
    const offset = () =>
      Number(OFFSET.exec(part("task-sheet-body")?.says ?? "")?.[1] ?? 0);
    /**
     * The body scrolled most of a screen: up its middle to read further down,
     * down it to go back, only while it is not at its top (a drag down there
     * would pull the sheet itself down).
     */
    const scroll = async (down: boolean, slow = false) => {
      const body = part("task-sheet-body");
      // Back up, half as far as the body is scrolled: the swipe's fling
      // carries the body about half again its drag, and a fling that meets
      // the top hands over to the sheet, which it pulls down to its medium
      // detent (510pt back on a 345pt drag did).
      const reach = down
        ? (body?.h ?? 0)
        : Math.min((body?.h ?? 0) * 0.55, (offset() - 40) / 2);
      if (!body || reach < 40) {
        return;
      }
      // In the body's own px-5 margin, where no card stands: a swipe begun
      // on the transcript pane scrolls the transcript, not the body.
      const x = Math.round(body.x + SPACE_5 / 2);
      const top = Math.round(body.y + body.h * 0.25);
      const bottom = Math.round(down ? body.y + body.h * 0.8 : top + reach);
      await sh(
        `${AXE} swipe --start-x ${x} --start-y ${down ? bottom : top} --end-x ${x} --end-y ${down ? top : bottom} --duration ${down && !slow ? 0.4 : 1.2} --udid ${udid}`
      );
      await pause(1600);
    };
    /**
     * The body scrolled until `label` is wholly on screen: from its top, down
     * at the pace it goes up (no fling), so each step is under the body's
     * height and a control can't be passed over between two of them.
     */
    const reveal = async (label: string) => {
      for (
        let n = 0;
        n < 12 && offset() > 40 && !(await onScreen(label));
        n += 1
      ) {
        await scroll(false);
      }
      for (let n = 0; n < 16 && !(await onScreen(label)); n += 1) {
        await scroll(true, true);
      }
    };

    await sh(`xcrun simctl ui ${udid} appearance light`);
    const route = JSON.stringify({
      kind: "attempt",
      projectId: ids.projectId,
      taskId: ids.taskId,
      workItemId: newest?.workItemId,
    });
    await sh(
      `xcrun simctl launch --terminate-running-process ${udid} dev.cawco.app -paywall-env sandbox -cawco-hub-url ${base} -push-route 'push:${route}' >/dev/null`
    );
    const opened = await waitFor(
      "the sheet's attempt",
      () => !!part("task-attempt-status"),
      90_000
    );
    if (
      !kit.check(
        `${tag}: the push opens the task's sheet on its attempt`,
        !!opened,
        lines.slice(-6).join(" | ") || "no TaskSheet line"
      )
    ) {
      await writeFile(join(kit.out, `${tag}-log.txt`), lines.join("\n"));
      return;
    }
    // Every part, top to bottom: from the top of the sheet a screen at a time.
    for (let n = 0; n < 12 && offset() > 40; n += 1) {
      await scroll(false);
    }
    await pause(2000);
    await shot("sheet-light");
    const was = (id: string) => seen.get(id);
    const loaded = () =>
      expect.outputs.every((o) =>
        (was(`task-output-${o.name}`)?.says ?? "state=reading").startsWith(
          `state=${o.drawn}`
        )
      );
    for (let n = 0; n < 8 && !(loaded() && was("task-transcript")); n += 1) {
      await scroll(true);
    }

    // a. The facts, each under its name.
    const facts = expect.facts.map((name) => was(`task-fact-${name}`));
    kit.check(
      `${tag} a: the header names its facts (${expect.facts.join(", ")}), each row at one x`,
      facts.every((f) => f?.shows) &&
        facts.every((f) => near(f?.x, facts[0]?.x)),
      facts.map(at).join(" | ")
    );

    // b. The result leads with the report.
    const hint = was("task-result-hint");
    const report = was("task-report");
    const cards = expect.outputs.map((o) => was(`task-output-${o.name}`));
    kit.check(
      `${tag} b: the result says which attempt handed it in, the report card first, then the outputs in order`,
      HANDED_IN.test(hint?.says ?? "") &&
        !!report &&
        cards.every(
          (c, i) =>
            !!c &&
            (i === 0 ? c.y > (report?.y ?? 0) : c.y > (cards[i - 1]?.y ?? 0))
        ),
      `hint ${at(hint)}; report ${at(report)}; ${cards.map(at).join(" | ")}`
    );

    // c. Each output drawn as what it is; no file name anywhere.
    const named = [...seen.entries()]
      .filter(([, p]) => expect.outputs.some((o) => p.says.includes(o.name)))
      .map(([id]) => id);
    kit.check(
      `${tag} c: each output is drawn as what it is (${expect.outputs.map((o) => o.drawn).join(", ") || "none handed in"}), no part says a file name`,
      expect.outputs.every((o, i) =>
        cards[i]?.says.startsWith(`state=${o.drawn} `)
      ) && named.length === 0,
      `${expect.outputs.map((o, i) => `${o.name}: ${cards[i]?.says ?? "absent"}`).join(" | ")}; naming: ${named.join(", ") || "none"}`
    );

    // d. The cards' width and gaps.
    const body = part("task-sheet-body");
    const wide = (body?.w ?? 0) - 2 * SPACE_5;
    const column = [report, ...cards];
    const gaps = column
      .slice(1)
      .map((c, i) =>
        c && column[i] ? c.y - (column[i].y + column[i].h) : Number.NaN
      );
    kit.check(
      `${tag} d: the cards stand the body's width less px-5 (${wide.toFixed(1)}), gap-4 (${SPACE_4}) apart`,
      column.every((c) => near(c?.w, wide) && near(c?.x, SPACE_5)) &&
        gaps.every((g) => near(g, SPACE_4)),
      `widths ${column.map((c) => c?.w.toFixed(1)).join(", ")}; xs ${column.map((c) => c?.x.toFixed(1)).join(", ")}; gaps ${gaps.map((g) => g.toFixed(1)).join(", ")}`
    );

    // e. Attempts.
    const attemptsHint = was("task-attempts-hint");
    const tabs = was("task-attempt-tabs");
    const status = was("task-attempt-status");
    const again = was("task-try-again");
    kit.check(
      `${tag} e: "It has had ${count}.", ${count > 1 ? "the newest tab chosen" : "no tabs"}, "${newest?.says}", Try again`,
      (attemptsHint?.says ?? "").endsWith(`It has had ${count}.`) &&
        (count > 1 ? tabs?.says === "selected=0" : !tabs) &&
        saysIt(status?.says, newest?.says ?? "") &&
        again?.says === "Try again",
      [attemptsHint, tabs, status, again].map(at).join(" | ")
    );

    // f. The transcript pane.
    const pane = was("task-transcript");
    kit.check(
      `${tag} f: the transcript pane stands under the attempt, 480pt tall, the cards' width`,
      near(pane?.h, 480) &&
        near(pane?.w, wide) &&
        (pane?.y ?? 0) > (status?.y ?? Number.POSITIVE_INFINITY),
      at(pane)
    );

    // i. The body's foot: its last line scrolls clear of the home indicator.
    const footing = FOOT.exec(part("task-sheet-body")?.says ?? "");
    const foot = Number(footing?.[1] ?? -1);
    const safe = Number(footing?.[2] ?? 0);
    kit.check(
      `${tag} i: the body ends with the safe area under its pb-6 (${safe.toFixed(1)} + ${SPACE_6})`,
      foot >= safe + SPACE_6 - 0.5,
      part("task-sheet-body")?.says ?? "no body line"
    );

    // j. A data result's fields: a label column of its own width, the value a gap-4 past it.
    const dataLabel = was("task-data-label-channel");
    const dataValue = was("task-data-value-channel");
    if (expect.outputs.some((o) => o.drawn === "data")) {
      kit.check(
        `${tag} j: a data field's label stands in its 6rem column, the value ${SPACE_4}pt past it`,
        near(dataLabel?.w, DATA_COLUMN) &&
          near(dataValue?.x, (dataLabel?.x ?? 0) + DATA_COLUMN + SPACE_4),
        `label ${at(dataLabel)} | value ${at(dataValue)}`
      );
    }
    /**
     * Every markdown the sheet draws (MarkdownDocumentView over MessageBody):
     * the report, each document handed in, the task's own text sections,
     * measured before the transcript is expanded.
     */
    const markdown = [
      "task-report",
      ...expect.outputs
        .filter((o) => o.drawn === "document")
        .map((o) => `task-output-${o.name}`),
      ...TEXT_PARTS,
    ];
    for (let n = 0; n < 12 && !markdown.every((id) => shown.has(id)); n += 1) {
      await scroll(true);
    }
    const textBefore = markdown.map((id) => shown.get(id)?.h);

    // g. The older attempt, and back.
    if (older) {
      await reveal(`Attempt ${count - 1}`);
      await tapLabel(`Attempt ${count - 1}`);
      await waitFor(
        "the older attempt",
        () => saysIt(part("task-attempt-status")?.says, older.says),
        15_000
      );
      const olderStatus = part("task-attempt-status");
      const how = part("task-attempt-how");
      kit.check(
        `${tag} g: the older tab says "${older.says}" and how it ended`,
        saysIt(olderStatus?.says, older.says) &&
          (older.how === null ? !how : how?.says === older.how) &&
          part("task-attempt-tabs")?.says === "selected=1",
        `${at(olderStatus)} | ${at(how)} | ${at(part("task-attempt-tabs"))}`
      );
      await tapLabel(`Attempt ${count}`);
      await waitFor(
        "the newest attempt",
        () => saysIt(part("task-attempt-status")?.says, newest?.says ?? ""),
        15_000
      );
    }

    // h. Expand and collapse.
    for (const theme of THEMES) {
      await sh(`xcrun simctl ui ${udid} appearance ${theme}`);
      await pause(1500);
      if (theme === "dark") {
        for (let n = 0; n < 12 && offset() > 40; n += 1) {
          await scroll(false);
        }
        await pause(1200);
        await shot("sheet-dark");
      }
      await reveal("Expand transcript");
      // Where the pane stood, in the body's points: everything above it decides it.
      const stood = part("task-transcript")?.y;
      await tapLabel("Expand transcript");
      const expanded = await waitFor(
        "the expanded pane",
        () => !!part("task-transcript-expanded"),
        15_000
      );
      await pause(1500);
      const side = part("task-transcript-expanded");
      const sheet = part("task-sheet");
      const reviewPart = part("task-review");
      await shot(`expanded-${theme}`);
      if (theme === "light") {
        if (which.phone) {
          kit.check(
            `${tag} h: Expand gives the transcript the sheet's whole frame, over the review`,
            !!expanded &&
              near(side?.x, sheet?.x) &&
              near(side?.w, sheet?.w) &&
              near(side?.h, sheet?.h) &&
              reviewPart?.shows === false,
            `pane ${at(side)}; sheet ${at(sheet)}; review ${at(reviewPart)}`
          );
        } else {
          kit.check(
            `${tag} h: Expand puts the transcript beside the review at the sheet's full height, the review 416pt at its right edge`,
            !!expanded &&
              reviewPart?.shows === true &&
              near(reviewPart?.w, 416) &&
              near(
                (reviewPart?.x ?? 0) + (reviewPart?.w ?? 0),
                (sheet?.x ?? 0) + (sheet?.w ?? 0)
              ) &&
              near(side?.x, sheet?.x) &&
              near((side?.x ?? 0) + (side?.w ?? 0), reviewPart?.x) &&
              near(side?.h, sheet?.h) &&
              (sheet?.w ?? 0) > 672,
            `pane ${at(side)}; review ${at(reviewPart)}; sheet ${at(sheet)}`
          );
        }
      }
      // Each markdown is read afresh from here: Collapse lays every part on
      // screen again (its line changes), and one off screen logs as it scrolls in.
      if (theme === "light") {
        for (const id of markdown) {
          shown.delete(id);
        }
      }
      await tapLabel("Collapse transcript", "task-transcript-expanded");
      const back = await waitFor(
        "the pane back under the attempt",
        () =>
          !part("task-transcript-expanded") && !!part("task-transcript")?.shows,
        15_000
      );
      // The rows above it measured again at the review's own width, not the width it passed through.
      await waitFor(
        "the pane where it stood",
        () => near(part("task-transcript")?.y, stood),
        8000
      );
      if (theme === "light") {
        kit.check(
          `${tag} h: Collapse puts the pane back under the attempt where it stood, the review whole again`,
          !!back &&
            near(part("task-transcript")?.y, stood) &&
            part("task-review")?.shows === true &&
            near(part("task-review")?.w, part("task-sheet")?.w),
          `${at(part("task-transcript"))} (stood at ${stood?.toFixed(1)}); review ${at(part("task-review"))}; sheet ${at(part("task-sheet"))}`
        );
        // k. Every markdown in the review, laid at the expanded iPad
        // review's width on the way and back (MessageBody), at its height
        // again, with no re-measure of the sheet's own: from the top down.
        for (let n = 0; n < 12 && offset() > 40; n += 1) {
          await scroll(false);
        }
        for (
          let n = 0;
          n < 12 && !markdown.every((id) => shown.has(id));
          n += 1
        ) {
          await scroll(true);
        }
        const textAfter = markdown.map((id) => shown.get(id));
        kit.check(
          `${tag} k: every markdown (${markdown.join(", ")}) stands at its height again after Expand and Collapse`,
          markdown.every(
            (_, i) =>
              textBefore[i] !== undefined &&
              near(textAfter[i]?.h, textBefore[i])
          ),
          markdown
            .map(
              (id, i) =>
                `${id} ${textBefore[i]?.toFixed(1) ?? "unseen"} → ${textAfter[i]?.h.toFixed(1) ?? "unseen"}`
            )
            .join(" | ")
        );
      }
    }

    // l. No text the sheet or its transcript drew ran past its view.
    kit.check(
      `${tag} l: no text in the sheet or its transcript lays out wider than its view`,
      overflow.length === 0,
      overflow.slice(0, 4).join(" | ") || "none"
    );
  } finally {
    await writeFile(join(kit.out, `${tag}-log.txt`), lines.join("\n"));
    await writeFile(
      join(kit.out, `${tag}-parts.json`),
      JSON.stringify(Object.fromEntries(parts), null, 2)
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
  which: (typeof DEVICES)[number],
  expect: Expect
) {
  const picture = expect.outputs.some((o) => o.drawn === "picture");
  for (const theme of THEMES) {
    const page = await kit.page(which.view, {
      engine: "webkit",
      scale: which.scale,
      theme,
    });
    await open(
      page,
      `${dashboard}/project/${ids.projectId}?task=${ids.taskId}`,
      () =>
        Boolean(
          document.querySelector(".task-sheet [data-task-report]") &&
          document.querySelector(".task-sheet [data-task-transcript]") &&
          // A picture handed in has drawn before the capture.
          (document.querySelector(".task-sheet [data-result-kind='picture']")
            ? document.querySelector(
                ".task-sheet [data-result-kind='picture'] img"
              )
            : true)
        ),
      90_000
    );
    if (picture) {
      await page.waitForSelector(
        ".task-sheet [data-result-kind='picture'] img"
      );
    }
    await settle(page);
    await page.screenshot({
      path: join(kit.out, `web-${which.tag}-sheet-${theme}.png`),
    });
    await page.click(".task-sheet [data-transcript-expand]");
    await page.waitForSelector(
      ".task-sheet [data-task-transcript][data-expanded='true']"
    );
    await settle(page);
    await page.screenshot({
      path: join(kit.out, `web-${which.tag}-expanded-${theme}.png`),
    });
    await page.close();
  }
}

const spec: Spec = {
  name: "ios-task-review",
  async run(kit) {
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
      if (
        !kit.check(
          `the live hub serves ${taskId} with its report (a hub past 0f5a1f451)`,
          !!task.result && task.attempts.length > 0,
          JSON.stringify({
            result: task.result,
            attempts: task.attempts.map((a) => a.state),
            outputs: task.outputs,
          })
        )
      ) {
        return;
      }
      const expect = expectOf(task);
      for (const which of devices) {
        await device(kit, hub, ids, which, expect);
      }
      const relayed = await relay(dashboard);
      try {
        for (const which of devices) {
          await web(kit, relayed.origin, ids, which, expect);
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
    if (
      !kit.check(
        "the hub reads the seeded task: its report, two attempts, five outputs",
        read.result?.headline === HEADLINE &&
          read.attempts.length === 2 &&
          read.outputs.length === OUTPUTS.length,
        JSON.stringify({
          result: read.result,
          attempts: read.attempts.map((a) => a.state),
          outputs: read.outputs,
        })
      )
    ) {
      return;
    }
    // The seed's own words, beside what the hub read of it.
    const expect: Expect = {
      ...expectOf(read),
      attempts: [
        { says: "Finished in 1 min", how: null, workItemId: "wi-review-2" },
        {
          says: "Failed after 3 min",
          how: `Attempt failed: ${FAILED_WHY}`,
          workItemId: "wi-review-1",
        },
      ],
    };
    for (const which of devices) {
      await device(kit, fleet.base, ids, which, expect);
    }
    const dashboard = await fleet.dashboard();
    for (const which of devices) {
      await web(kit, dashboard, ids, which, expect);
    }
    kit.note(
      `captures in ${kit.out}: <device>-sheet-<theme>.png, <device>-expanded-<theme>.png, web-<device>-…`
    );
  },
};
export default spec;
