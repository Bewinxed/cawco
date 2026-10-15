/**
 * iOS: flinging up through a long transcript never shows a blank row and
 * stays smooth, and the main thread is mostly idle while a turn streams.
 *
 * A scratch fleet (real hub, agent and sessiond, Claude Code against the
 * mock model) seeds one session with a long mixed transcript: one turn of
 * `CALLS` replies, each a stretch of Markdown (prose, lists, inline code,
 * fenced code, headings, a table now and then) said before a Bash call whose
 * output is a few lines: hundreds of blocks, several of the hub's pages. The
 * built app runs on an iPhone 16 Pro simulator on iOS 18.5 of its own (a
 * mac-slot.sh slot, deleted at the end), opened on that session with
 * `-probe-pace`, which turns on the app's own measures (Pace.swift `probe
 * pace`, TranscriptView `probeBlanks`):
 *
 * 1. Three passes, each from the foot to the conversation's first row: one
 *    finger flung down the list (axe `drag`, 60 ms, let go moving, so the
 *    list coasts), again as soon as the list rests or 700 ms on, until it
 *    rests at the top with no page before it (`probe rest … top=1 older=0`);
 *    then Jump to latest. The first pass reads the older pages as it goes.
 *    - No blank frame: no frame whose committed screen showed a visible row
 *      blank (a stretch no cell covers, a cell with no row, a text in sight
 *      0pt tall, past its words, or with its lines in sight not laid out or
 *      outside its viewport), checked once a display frame. Must be 0.
 *    - Main-thread hitch ratio: ms the transcript's display-link frames came
 *      late after a main-thread turn over a frame, per second the list was
 *      scrolling. Under 5 ms/s on every pass. Its detail gives every late
 *      frame too (the rest came with the main thread free: the render side,
 *      or the Mac's load) and the Mac's load as the pass began: a pass under
 *      a load average of 20 is a gate pass, and the detail says which are.
 *      A note says where the main thread's scrolling time went.
 *    - Every row stood at an exact height (RowLayout, worked out before any
 *      view, PieceHeight) is its view's: each is measured as its view lays
 *      out while the list rests (RowStore `verify`); none may differ by more
 *      than half a point, and the largest difference is said.
 * 2. A turn streams a long reply into the foot: the main thread's own CPU
 *    time over the wall time the tail was busy. Under 50% (mostly idle).
 *    And every commit of its rows takes under 8 ms (the app says one of
 *    8 ms or more, `probe commit`, with what it took).
 *
 *   bash apps/apple/scripts/build-both.sh ios --compile-only
 *   bun scripts/probe-kit/run.ts ios-scroll-up
 *
 * With `PROBE_SAMPLE=1` the app also samples its main thread's stack every
 * millisecond (MainSampler.swift), writes the busy stacks to its caches as
 * folded stacks, and the run copies them out (`probe-sample-scrolling.folded`,
 * `probe-sample-streaming.folded` in its folder) and notes the functions
 * found most often: where no Instruments template that samples is at hand,
 * the profile that says why. The sampling slows the main thread a little:
 * a gate run is made without it.
 *
 * The app is this checkout's simulator build. The simulator runs on the
 * Mac's CPU and GPU, not a phone's: its hitches and CPU are this build's on
 * this machine, read the same way every run.
 */
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { freshApp } from "../../lib/apple-app";
import { macSim } from "../../lib/mac-sim";
import { type Reply, type Seen, until } from "../../scratch-fleet";
import { type Kit, type KitFleet, ROOT, type Spec } from "../kit";

const AXE = "/opt/homebrew/bin/axe";
/** iOS 18.5: where axe reaches the simulator from a workspace (ios-seen.ts). */
const SIM = {
  runtime: "com.apple.CoreSimulator.SimRuntime.iOS-18-5",
  device: "iPhone 16 Pro",
};
const TITLE = "Scroll-up probe";
/** Replies in the seeding turn, each a stretch of Markdown and a Bash call. */
const CALLS = 360;
/** The fewest blocks the seeded session holds: hundreds, several pages. */
const LEAST_BLOCKS = 600;
const PASSES = 3;
/** The most flings a pass takes to reach the top before it fails. */
const MOST_FLINGS = 160;
/** How long a fling waits for the list to rest before the next. */
const REST_WAIT_MS = 700;
const HITCH_MS_PER_S = 5;
const STREAM_CPU = 0.5;
const LOG_HEAD = /^.*\] /;
const MARK = /(seed|stream)-mark-[0-9a-f]{6}/g;
const PACE = /probe pace (.*)$/;
const REST = /probe rest \w+: top=(\d) older=(\d) rows=(\d+)/;
const COMMIT = /probe commit ([\d.]+) ms/;
/** The app's glyph comparison (GlyphProbe): compared, pixels, the largest channel difference, pixels differing. */
const GLYPHS =
  /probe glyphs: (\d+) compared, (\d+) pixels, the largest channel difference (\d+), (\d+) pixels differing/;
/** Eight glyphs, each in the light and the dark. */
const GLYPH_CASES = 16;
/** `PROBE_SAMPLE=1`: the app samples its main thread's stack (MainSampler.swift) and says where it was busy. */
const SAMPLE = process.env.PROBE_SAMPLE === "1";
/** The most a commit of the rows may take while a turn streams. */
const COMMIT_MS = 8;

/** One stretch of the seeding turn's words: Markdown of every kind a reply draws. */
const said = (n: number): string => {
  const id = String(n).padStart(4, "0");
  switch (n % 7) {
    case 0:
      return `Step ${n}: the reader's place is kept by the first row in view, so **older history** joining above never moves it. The call below prints \`row-${id}\` and a few lines after it.`;
    case 1:
      return `Before call ${id}, three things to check:\n\n- the row is measured at its own width, never at none\n- every text in it is laid out once, at that width\n- \`RowStore\` keeps it built for the next time it is shown, so scrolling back to it costs nothing`;
    case 2:
      return `Here is the shape of it (${id}):\n\n\`\`\`swift\nfinal class Row: UIView {\n    private let text = ProseView()\n    var fitWidth: CGFloat? {\n        didSet { text.fitWidth = fitWidth }\n    }\n    func configure(_ item: Item) {\n        text.attributedText = item.words\n        invalidateIntrinsicContentSize()\n    }\n}\n\`\`\``;
    case 3:
      return `### Reading the page before ${id}\n\nA page is asked for when less than one view of rows stands between the top of the view and the first row held. It lands above the reader, and the first row in view keeps its place as it does.\n\nNothing is asked while a page is on its way, and never twice for the same cursor.`;
    case 4:
      return `The probe's side of it, in TypeScript:\n\n\`\`\`ts\nconst rows = await fleet.api<PageRead>(\`/api/instances/\${id}/transcript\`);\nfor (const block of rows.blocks) {\n  if (block.type === "tool.use") {\n    calls += 1;\n  }\n}\nconsole.log(\`\${calls} calls, cursor \${rows.cursor ?? "none"}\`);\n\`\`\`\n\nThat reads the newest page only.`;
    case 5:
      return `Call ${id} is one of a long run. Each reply in it says what it is about to do in a paragraph long enough to wrap over several lines on a phone, with a [link to the docs](https://example.com/docs/${id}) and some \`inline code\` in it, then calls a tool whose output is a handful of lines. A transcript built this way has text, code and tool rows in the proportions a real session has, and enough of them that the hub serves it in pages.`;
    default:
      return `| Check | Row ${id} |\n| --- | --- |\n| measured | at its width |\n| laid out | once |\n| kept | in RowStore |`;
  }
};

/** The streamed reply: a few hundred words, a paragraph at a time, a list in the middle. */
const STREAMED = Array.from(
  { length: 12 },
  (_, i) =>
    `${i === 6 ? "- one point of the list\n- another point of it, longer than the first\n\n" : ""}Paragraph ${i + 1} of the streamed reply runs on for a while so the live row grows over many frames: the cursor uncovers it a few characters a frame, each new stretch fading in behind it, and the row is measured again as it wraps onto another line.\n\n`
)
  .join("")
  .split(" ")
  .map((word) => `${word} `);

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

/** The app's running totals (Pace.swift `probe pace`), in ms and counts. */
const KEYS = [
  "scroll",
  "hitch",
  "hitches",
  "mainHitch",
  "mainHitches",
  "ticks",
  "checked",
  "checking",
  "heightsChecked",
  "drifts",
  "maxDrift",
  "build",
  "builds",
  "measure",
  "measures",
  "warm",
  "frameBuild",
  "frameMeasure",
  "layout",
  "layouts",
  "text",
  "texts",
  "streamWall",
  "streamCPU",
  "streamAwake",
  "blankFrames",
  "blankRows",
] as const;
type Tally = Record<(typeof KEYS)[number], number>;
const tallyOf = (line: string): Tally => {
  const pairs = new Map(
    (PACE.exec(line)?.[1] ?? "").split(" ").map((pair) => {
      const [key, value] = pair.split("=");
      return [key, Number(value)] as const;
    })
  );
  return Object.fromEntries(
    KEYS.map((key) => [key, pairs.get(key) ?? 0])
  ) as Tally;
};
const minus = (a: Tally, b: Tally): Tally =>
  Object.fromEntries(KEYS.map((key) => [key, a[key] - b[key]])) as Tally;

/** The app's log as it is said, each line with when it was heard. */
interface Heard {
  at: number;
  line: string;
}

/** Streams the app's Transcript and Prose log off the simulator into `heard`. */
function listen(udid: string, heard: Heard[]): () => void {
  const child = Bun.spawn(
    [
      "bash",
      "-c",
      `exec xcrun simctl spawn ${udid} log stream --level debug --style compact --predicate 'subsystem == "dev.cawco.app" AND (category == "Transcript" OR category == "Prose")'`,
    ],
    { stdout: "pipe", stderr: "ignore" }
  );
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
          heard.push({ at: Date.now(), line: line.replace(LOG_HEAD, "") });
        }
      }
    }
  })().catch(() => undefined);
  return () => child.kill();
}

/** The app's newest totals, from a line said at or after `since`. */
async function tally(heard: Heard[], since: number): Promise<Tally> {
  const found = await until(
    "a pace line",
    () =>
      Promise.resolve(
        heard
          .slice(since)
          .filter((h) => PACE.test(h.line))
          .at(-1)
      ),
    Boolean,
    10_000
  );
  return tallyOf(found?.line ?? "");
}

/** An element of the app's screen as VoiceOver reads it (axe `describe-ui`). */
interface UiNode {
  frame?: { height: number; width: number; x: number; y: number };
  id?: string;
  label?: string;
  value?: string;
}

/** The app's screen, element by element, in reading order. */
async function uiNodes(udid: string): Promise<UiNode[]> {
  const nodes: UiNode[] = [];
  const walk = (at: unknown) => {
    if (Array.isArray(at)) {
      for (const one of at) {
        walk(one);
      }
      return;
    }
    if (!at || typeof at !== "object") {
      return;
    }
    const o = at as Record<string, unknown>;
    nodes.push({
      id: (o.AXUniqueId ?? o.identifier) as string | undefined,
      label: (o.AXLabel ?? o.label) as string | undefined,
      value: (o.AXValue ?? o.value) as string | undefined,
      frame: o.frame as UiNode["frame"],
    });
    walk(o.children);
  };
  walk(JSON.parse(await sh(`${AXE} describe-ui --udid ${udid}`)));
  return nodes;
}

/** Where to fling: the middle of the screen, over the transcript's box. */
async function flingLine(
  udid: string
): Promise<{ from: number; to: number; x: number }> {
  const nodes = await uiNodes(udid);
  const list = nodes.find((n) => n.label === "Session transcript")?.frame;
  const composer = nodes.find((n) => n.id === "steer-message")?.frame;
  const screen = nodes[0]?.frame ?? { x: 0, y: 0, width: 402, height: 874 };
  const top = list?.y ?? 110;
  const bottom = list
    ? Math.min(list.y + list.height, composer?.y ?? screen.height)
    : (composer?.y ?? screen.height - 160);
  const height = bottom - top;
  return {
    x: Math.round(screen.width / 2),
    from: Math.round(top + 0.15 * height),
    to: Math.round(top + 0.9 * height),
  };
}

/**
 * A shut call opens under its line and folds shut again (ToolLineView: its
 * body's column stands in the row only while it shows something). The call
 * nearest the transcript's middle that reads Collapsed is tapped, and the
 * room between its line and the element under it read: grown by the body
 * opened, the same as before once it is shut again.
 */
async function disclose(
  udid: string,
  line: { from: number; to: number }
): Promise<{ ok: boolean; said: string }> {
  const middle = (line.from + line.to) / 2;
  const bottom = (f: NonNullable<UiNode["frame"]>) => f.y + f.height;
  /**
   * The call `label` and the room under its line, to the element `next`
   * (the one under it while it was shut: an opened body's own come between).
   */
  const read = async (label?: string, next?: string) => {
    const nodes = (await uiNodes(udid)).filter(
      (n) => n.frame && n.frame.height > 0 && n.label
    );
    const call = label
      ? nodes.find((n) => n.label === label)
      : nodes
          .filter(
            (n) =>
              n.value === "Collapsed" &&
              (n.frame?.y ?? 0) > line.from &&
              bottom(n.frame ?? { x: 0, y: 0, width: 0, height: 0 }) < line.to
          )
          .sort(
            (a, b) =>
              Math.abs((a.frame?.y ?? 0) - middle) -
              Math.abs((b.frame?.y ?? 0) - middle)
          )[0];
    if (!call?.frame) {
      return;
    }
    const foot = bottom(call.frame);
    const under = next
      ? nodes.find((n) => n.label === next)
      : nodes
          .filter((n) => n !== call && (n.frame?.y ?? 0) >= foot - 1)
          .sort((a, b) => (a.frame?.y ?? 0) - (b.frame?.y ?? 0))[0];
    return {
      call,
      under: under?.label,
      room: under?.frame ? under.frame.y - foot : Number.NaN,
    };
  };
  const tap = (f: NonNullable<UiNode["frame"]>) =>
    sh(
      `${AXE} tap -x ${Math.round(f.x + f.width / 2)} -y ${Math.round(f.y + f.height / 2)} --udid ${udid}`
    );
  const shut = await read();
  if (!(shut?.call.frame && shut.under)) {
    return { ok: false, said: "no shut call with a body in view" };
  }
  await tap(shut.call.frame);
  await Bun.sleep(1200);
  const open = await read(shut.call.label, shut.under);
  if (open?.call.frame) {
    await tap(open.call.frame);
  }
  await Bun.sleep(1200);
  const again = await read(shut.call.label, shut.under);
  const ok =
    open?.call.value === "Expanded" &&
    open.room >= shut.room + 20 &&
    again?.call.value === "Collapsed" &&
    Math.abs(again.room - shut.room) <= 1;
  return {
    ok,
    said: `"${shut.call.label?.slice(0, 60)}": shut ${shut.room.toFixed(0)}pt under its line, opened ${open?.call.value ?? "?"} ${open?.room.toFixed(0) ?? "?"}pt, shut again ${again?.call.value ?? "?"} ${again?.room.toFixed(0) ?? "?"}pt`,
  };
}

/** The Mac's load over the last minute, against its cores: the simulator draws on the same CPU. */
const LOADAVG = /\{\s*([\d.]+)/;
async function hostLoad(): Promise<{ average: number; said: string }> {
  const [avg, cores] = (await sh("sysctl -n vm.loadavg hw.ncpu")).split("\n");
  const average = Number(LOADAVG.exec(avg ?? "")?.[1] ?? Number.NaN);
  return { average, said: `host load ${average} on ${cores ?? "?"} cores` };
}

interface Pass {
  flings: number;
  /** The host's load as the pass began. */
  load: string;
  /** The host's one-minute load average as the pass began. */
  loadAverage: number;
  ms: number;
  /** The rows the list held when it rested at the top; undefined if it never did. */
  rows: number | undefined;
  totals: Tally;
}

/** Flings up from where the list stands until it rests at the conversation's first row. */
async function flingToTop(
  udid: string,
  heard: Heard[],
  line: { from: number; to: number; x: number }
): Promise<Pass> {
  const start = heard.length;
  const before = await tally(heard, 0);
  const host = await hostLoad();
  const began = Date.now();
  let flings = 0;
  let rows: number | undefined;
  while (flings < MOST_FLINGS && rows === undefined) {
    const mark = heard.length;
    // biome-ignore lint/performance/noAwaitInLoops: each fling starts where the last one left the list
    await sh(
      `${AXE} drag --start-x ${line.x} --start-y ${line.from} --end-x ${line.x} --end-y ${line.to} --duration 0.06 --steps 6 --udid ${udid}`
    );
    flings += 1;
    // Looked for every 50 ms: the next fling goes as soon as the list rests.
    let rested: RegExpExecArray | undefined;
    for (const end = Date.now() + REST_WAIT_MS; !rested && Date.now() < end; ) {
      // biome-ignore lint/performance/noAwaitInLoops: a poll, in order
      await Bun.sleep(50);
      rested = heard
        .slice(mark)
        .map((h) => REST.exec(h.line) ?? undefined)
        .findLast(Boolean);
    }
    if (rested?.[1] === "1" && rested[2] === "0") {
      rows = Number(rested[3]);
    }
  }
  const ms = Date.now() - began;
  // The totals once the last coast is over.
  await Bun.sleep(1500);
  const totals = minus(await tally(heard, start), before);
  return {
    flings,
    load: host.said,
    loadAverage: host.average,
    ms,
    rows,
    totals,
  };
}

/** Seeds the session: one turn of `CALLS` replies. Returns its id and what the hub holds. */
async function seed(
  kit: Kit,
  marks: { seed: string; stream: string }
): Promise<{
  fleet: KitFleet;
  held: () => Promise<{ blocks: number; busy: boolean; pages: number }>;
  session: string;
}> {
  let calls = 0;
  const respond = (request: Seen): Reply => {
    const turn = [...request.all.matchAll(MARK)].at(-1)?.[0];
    if (!request.tools || turn === undefined) {
      return { everyMs: 5, words: ["Done."] };
    }
    if (turn === marks.stream) {
      return { everyMs: 25, words: STREAMED };
    }
    if (calls >= CALLS) {
      return { everyMs: 5, words: ["Seeded."] };
    }
    calls += 1;
    const id = String(calls).padStart(4, "0");
    return {
      everyMs: 1,
      words: [said(calls)],
      tool: {
        name: "Bash",
        input: {
          command: `echo row-${id}; seq 1 ${(calls % 6) + 1}`,
          description: `Print row-${id}`,
        },
      },
    };
  };
  const fleet = await kit.fleet(respond);
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.launch("agent");
  await fleet.agentUp();
  await fleet.accountSignedIn();
  const session = await fleet.spawn("claude", TITLE);
  interface PageRead {
    blocks: unknown[];
    cursor: string | null;
    tail?: { busy?: boolean };
  }
  const held = async () => {
    const newest = await fleet.api<PageRead>(
      `/api/instances/${session}/transcript`
    );
    let blocks = newest.blocks.length;
    let pages = 1;
    let { cursor } = newest;
    while (cursor) {
      // biome-ignore lint/performance/noAwaitInLoops: each page starts where the last one ended
      const older = await fleet.api<PageRead>(
        `/api/instances/${session}/transcript?limit=250&before=${encodeURIComponent(cursor)}`
      );
      blocks += older.blocks.length;
      pages += 1;
      ({ cursor } = older);
    }
    return { blocks, pages, busy: newest.tail?.busy === true };
  };
  await fleet.send(session, `${marks.seed}: print the rows.`);
  let last = { blocks: 0, busy: true, pages: 0 };
  let toldAt = Date.now();
  const seeded = await until(
    `${CALLS} calls seeded`,
    async () => {
      last = await held();
      if (Date.now() - toldAt > 60_000) {
        toldAt = Date.now();
        console.log(
          `  seeding: ${calls} calls answered, ${last.blocks} blocks in ${last.pages} pages`
        );
      }
      return last;
    },
    (h) => calls >= CALLS && !h.busy,
    30 * 60_000
  ).catch((error: Error) => {
    throw new Error(
      `${error.message}: ${calls} calls answered, the hub holding ${last.blocks} blocks in ${last.pages} pages, busy ${last.busy}`
    );
  });
  kit.check(
    "the session holds a long mixed transcript",
    seeded.blocks >= LEAST_BLOCKS && seeded.pages >= 3,
    `${seeded.blocks} blocks in ${seeded.pages} pages, ${calls} calls`
  );
  return { fleet, held, session };
}

/**
 * The sampler's folded stacks (MainSampler.swift), read back out of the
 * app's caches into the run's folder, and the functions most often on the
 * stack of each phase noted, with their share of its busy samples.
 */
async function readProfiles(kit: Kit, udid: string): Promise<void> {
  // The sampler writes every ten seconds: the last of the stream is in.
  await Bun.sleep(11_000);
  const data = (
    await sh(`xcrun simctl get_app_container ${udid} dev.cawco.app data`)
  ).trim();
  for (const phase of ["scrolling", "streaming"]) {
    const file = Bun.file(
      join(data, "Library/Caches", `probe-sample-${phase}.folded`)
    );
    // biome-ignore lint/performance/noAwaitInLoops: two files, read one after the other
    if (!(await file.exists())) {
      kit.note(`no ${phase} profile was written`);
      continue;
    }
    const text = await file.text();
    await writeFile(join(kit.out, `probe-sample-${phase}.folded`), text);
    const on = new Map<string, number>();
    let busy = 0;
    for (const line of text.split("\n")) {
      const at = line.lastIndexOf(" ");
      const hits = Number(line.slice(at + 1));
      if (at < 0 || !Number.isFinite(hits)) {
        continue;
      }
      busy += hits;
      for (const name of new Set(line.slice(0, at).split(";"))) {
        on.set(name, (on.get(name) ?? 0) + hits);
      }
    }
    const top = [...on.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(
        ([name, hits]) =>
          `${name.slice(0, 90)} ${((100 * hits) / busy).toFixed(0)}%`
      )
      .join(" | ");
    kit.note(
      `${phase} profile (${busy} busy samples, probe-sample-${phase}.folded): ${top}`
    );
  }
}

/** A pass the Mac was quiet enough for (load average under this) is a gate pass. */
const GATE_LOAD = 20;

function judge(kit: Kit, passes: Pass[]): void {
  for (const [i, p] of passes.entries()) {
    const t = p.totals;
    const seconds = t.scroll / 1000;
    const ratio = seconds > 0 ? t.hitch / seconds : Number.NaN;
    const main = seconds > 0 ? t.mainHitch / seconds : Number.NaN;
    kit.check(
      `pass ${i + 1}: flung from the foot to the conversation's first row`,
      p.rows !== undefined,
      `${p.flings} flings in ${(p.ms / 1000).toFixed(1)}s, ${p.rows ?? "no"} rows held at the top`
    );
    kit.check(
      `pass ${i + 1}: no blank frame`,
      t.blankFrames === 0 && t.checked > 0,
      `${t.blankFrames} blank frame(s) of ${t.checked} screens checked, ${t.blankRows} row(s) blank; the check took ${t.checking.toFixed(0)} ms of the main thread`
    );
    const gate = p.loadAverage < GATE_LOAD;
    kit.check(
      `pass ${i + 1}: main-thread hitch ratio under ${HITCH_MS_PER_S} ms/s`,
      main < HITCH_MS_PER_S,
      `${main.toFixed(2)} ms/s (${t.mainHitches} hitches) after a main-thread turn over a frame; all late frames ${ratio.toFixed(2)} ms/s (${t.hitch.toFixed(1)} ms late in ${t.hitches} over ${seconds.toFixed(1)}s scrolling, ${t.ticks} frames), the rest with the main thread free; ${p.load}: ${gate ? "a gate pass" : `not a gate pass (load ${GATE_LOAD} or more)`}`
    );
    kit.note(
      `pass ${i + 1} main thread while scrolling: rows built in the layout pass ${t.build.toFixed(0)} ms (${t.builds}), measured there ${t.measure.toFixed(0)} ms (${t.measures}); in the transcript's frames warm ${t.warm.toFixed(0)} ms, built ${t.frameBuild.toFixed(0)} ms, measured ${t.frameMeasure.toFixed(0)} ms; the layout preparing ${t.layout.toFixed(0)} ms (${t.layouts}); whole texts laid out ${t.text.toFixed(0)} ms (${t.texts}), inside the rest`
    );
  }
}

async function run(kit: Kit): Promise<void> {
  const { path: app, problem } = freshApp(ROOT);
  if (!kit.check("the app is built from this tree", !problem, problem ?? app)) {
    return;
  }
  const marks = {
    seed: `seed-mark-${crypto.randomUUID().slice(0, 6)}`,
    stream: `stream-mark-${crypto.randomUUID().slice(0, 6)}`,
  };
  const { fleet, held, session } = await seed(kit, marks);

  const sim = await macSim(SIM);
  const heard: Heard[] = [];
  let stop: () => void = () => undefined;
  try {
    const { udid } = sim;
    console.log(`  simulator ${udid}`);
    await sh(`xcrun simctl bootstatus ${udid} -b >/dev/null`);
    await sh(`xcrun simctl install ${udid} "${app}"`);
    stop = listen(udid, heard);
    await Bun.sleep(1500);
    /** The app opened fresh on the session, its newest page drawn; `extra`: launch arguments of a pass's own. */
    const launch = async (extra = "") => {
      const from = heard.length;
      await sh(
        `xcrun simctl launch --terminate-running-process ${udid} dev.cawco.app -paywall-env sandbox -cawco-hub-url ${fleet.base} -open-session ${session} -probe-pace ${SAMPLE ? "-probe-sample" : ""} ${extra} >/dev/null`
      );
      await until(
        "the newest page drawn",
        () =>
          Promise.resolve(
            heard
              .slice(from)
              .some((h) => h.line.includes(`page adopted for ${session}`)) &&
              heard.slice(from).some((h) => PACE.test(h.line))
          ),
        Boolean,
        60_000
      );
      await Bun.sleep(2500);
    };
    await launch();
    const line = await flingLine(udid);

    // ── 1. Three passes from the foot to the top ─────────────────────────
    const passes: Pass[] = [];
    for (let pass = 1; pass <= PASSES; pass += 1) {
      // biome-ignore lint/performance/noAwaitInLoops: each pass starts at the foot the last one jumped back to
      passes.push(await flingToTop(udid, heard, line));
      await sh(`${AXE} tap --label "Jump to latest" --udid ${udid}`).catch(
        () => undefined
      );
      await Bun.sleep(2000);
    }
    judge(kit, passes);
    // Rows stood at their exact heights (RowLayout), measured as their views
    // lay out while the list rested (RowStore `verify`): every one the same.
    const heights = await tally(heard, 0);
    const drifted = heard
      .filter((h) => h.line.includes("probe height drift"))
      .slice(0, 6)
      .map((h) => h.line.slice(h.line.indexOf("probe height drift")));
    kit.check(
      "every exact row height is its view's (no drift)",
      heights.drifts === 0 && heights.heightsChecked > 0,
      `${heights.heightsChecked} rows checked, ${heights.drifts} drifted, the largest drift ${heights.maxDrift.toFixed(2)}pt${drifted.length > 0 ? `: ${drifted.join(" | ")}` : ""}`
    );
    // Glyphs drawn from their bitmaps, against the same glyphs drawn from
    // their templates by an image view, in the light and the dark (GlyphProbe).
    const glyphs = heard.find((h) => h.line.includes("probe glyphs"));
    const glyphTally = GLYPHS.exec(glyphs?.line ?? "");
    kit.check(
      "every glyph drawn from its bitmap is its template's pixels (none differs by more than 1 of 255)",
      glyphTally !== null &&
        Number(glyphTally[1]) === GLYPH_CASES &&
        Number(glyphTally[4]) === 0,
      glyphs
        ? glyphs.line.slice(glyphs.line.indexOf("probe glyphs"))
        : "the app never said its glyphs"
    );
    // What setting a row up for its item took, by kind, over the passes (RowStore `row`).
    const set = heard.filter((h) => h.line.includes("probe rows set")).at(-1);
    if (set) {
      kit.note(set.line.slice(set.line.indexOf("probe rows set")));
    }
    const blanks = heard.filter((h) => h.line.includes("probe blank"));
    if (blanks.length > 0) {
      kit.note(
        `blank rows said: ${blanks
          .slice(0, 8)
          .map((h) => h.line)
          .join(" | ")}`
      );
    }

    // ── 2. A shut call opens and folds shut ──────────────────────────────
    const told = await disclose(udid, line);
    kit.check(
      "a shut call opens under its line and folds shut again",
      told.ok,
      told.said
    );

    // ── 3. A turn streams into the foot ──────────────────────────────────
    const streamFrom = heard.length;
    const before = await tally(heard, 0);
    await fleet.send(session, `${marks.stream}: stream a long reply.`);
    await until("the streamed turn began", held, (h) => h.busy, 60_000);
    // The foot as VoiceOver reads it while the turn streams: each element's
    // frame, so the rows laid out by frame (the sent message, the live face)
    // are read where they stand.
    const foot = (await uiNodes(udid))
      .filter((n) => n.frame && n.frame.height > 0 && n.label)
      .filter((n) => (n.frame?.y ?? 0) > line.from - 80)
      .slice(-16)
      .map(
        (n) =>
          `"${n.label?.replace(/\s+/g, " ").slice(0, 32)}"${n.value ? `=${n.value}` : ""} ${n.frame?.x.toFixed(0)},${n.frame?.y.toFixed(0)} ${n.frame?.width.toFixed(0)}x${n.frame?.height.toFixed(0)}`
      );
    kit.note(`the foot while the turn streams: ${foot.join(" | ")}`);
    await until("the streamed turn ended", held, (h) => !h.busy, 5 * 60_000);
    await Bun.sleep(2500);
    const d = minus(await tally(heard, streamFrom), before);
    const busy = d.streamCPU / d.streamWall;
    const awake = d.streamAwake / d.streamWall;
    kit.check(
      `while a turn streams the main thread is mostly idle (CPU under ${STREAM_CPU * 100}%)`,
      busy < STREAM_CPU,
      `main thread CPU ${(busy * 100).toFixed(1)}% (${d.streamCPU.toFixed(0)} ms of ${d.streamWall.toFixed(0)} ms), awake ${(awake * 100).toFixed(1)}%; ${d.blankFrames} blank frame(s)`
    );
    // The app says a commit only when it took 8 ms or more (TranscriptView `probe commit`).
    const slow = heard
      .slice(streamFrom)
      .map((h) => COMMIT.exec(h.line))
      .filter((m) => m !== null);
    kit.check(
      `while a turn streams, each commit of its rows takes under ${COMMIT_MS} ms`,
      slow.length === 0,
      slow.length === 0
        ? "no commit of 8 ms or more"
        : `${slow.length} commit(s) of 8 ms or more, the longest ${Math.max(...slow.map((m) => Number(m[1]))).toFixed(1)} ms: ${slow[0]?.input.slice(slow[0].index) ?? ""}`
    );
    if (SAMPLE) {
      await readProfiles(kit, udid);
    }
  } finally {
    await writeFile(
      join(kit.out, "app-log.txt"),
      heard.map((h) => `${new Date(h.at).toISOString()} ${h.line}`).join("\n")
    );
    stop();
    await sim.release();
  }
}

export default { name: "ios-scroll-up", run } satisfies Spec;
