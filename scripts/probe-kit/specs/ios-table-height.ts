/**
 * iOS: every transcript row draws inside the height it stands at. Two cases
 * of it, the owner's (TestFlight 20261015):
 * - "Tables are messed up in the ios app": a Markdown table takes exactly
 *   the height its laid-out rows need, at every width the app runs at, and
 *   nothing after it draws over it (the blocks after a 3-column table drew
 *   over its rows 2–4);
 * - "While scrolling collapsed search screen calls in the transcript on ios
 *   the screenshots jump in and out": a shut call whose result carries
 *   pictures stands at the height of its line and its pictures (shown under
 *   a shut call, as the web shows them), never at one line's.
 *
 * A scratch fleet (real hub, agent and sessiond, Claude Code against the
 * mock model) with one session whose turn first reads three screenshots at
 * once (three `Read` calls of a PNG: shut calls whose results carry an
 * image, `resultImages`), then replies in the owner's shape: a table of
 * three columns (Variation | What happens | What it costs), four rows whose
 * cells run 15–40 words, then paragraphs, a three-item list and a closing
 * line. The built app runs on an iPhone 16 Pro and an iPad Pro 11-inch (M4),
 * iOS 18.5, each in a mac-slot.sh slot of its own, opened on that session
 * with `-probe-pace`, and reads the app's own geometry (TranscriptView
 * `probe bounds`, once a frame for each row on the screen; a table's row
 * adds the table's frame, each row's frame and its tallest cell's words
 * laid out at the cell's width, and where what follows it starts, the next
 * block or the cell's foot, in the cell's space):
 *
 *  a. iPhone: what follows the table starts at or below its last row's
 *     foot, the table's frame holds every row, and each row is at least as
 *     tall as its tallest cell's words;
 *  b. iPad, its sidebar beside the transcript: the same;
 *  c. iPad, the sidebar hidden (Hide sidebar), the transcript wider: the
 *     same at the new width, measured again there;
 *  d. no row stood at a worked-out height draws at another (the app's
 *     RowStore `verify`, `probe pace` drifts);
 *  e. scrolled up past the calls and back down, a fling at a time: every
 *     row on the screen draws inside its cell, and each cell holds its own
 *     item's row (TranscriptView `probe bounds`: `over` 0, `stale` 0), the
 *     shut calls' pictures among them;
 *  f. noted: what laying tables out cost (`probe table cost`): drawing the
 *     message once, and a turn that streams the same message a word at a
 *     time, per word appended.
 *
 * `PROBE_CAPTURE=<dir>` also writes the iPhone's table, light and dark, there.
 *
 *   bash apps/apple/scripts/build-both.sh ios --compile-only
 *   bun scripts/probe-kit/run.ts ios-table-height
 *
 * The app is this checkout's simulator build (`PROBE_IOS_APP` names another).
 */
import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { freshApp } from "../../lib/apple-app";
import { macSim } from "../../lib/mac-sim";
import { type Reply, type Seen, until } from "../../scratch-fleet";
import { type Kit, ROOT, type Spec } from "../kit";

const AXE = "/opt/homebrew/bin/axe";
/** iOS 18.5, the app's oldest target, where axe reaches the simulator from a workspace. */
const RUNTIME = "com.apple.CoreSimulator.SimRuntime.iOS-18-5";
const IPHONE = "com.apple.CoreSimulator.SimDeviceType.iPhone-16-Pro";
const IPAD = "com.apple.CoreSimulator.SimDeviceType.iPad-Pro-11-inch-M4-8GB";
const TITLE = "Table height probe";
/** A compact log line's head, through its subsystem and category: a message with `] ` in it (a table's rows) keeps its own. */
const LOG_HEAD = /^.*?\[dev\.cawco\.app:[^\]]*\] /;
const MARK = /(seed|stream)-mark-[0-9a-f]{6}/g;
const TABLE =
  /probe bounds .* table (w=([\d.]+) table=([\d.]+)\+([\d.]+) rows=\[([^\]]*)\] next=([\d.]+) (block|end))/;
const COST =
  /probe table cost heights=(\d+) heightMs=([\d.]+) layouts=(\d+) layoutMs=([\d.]+) configures=(\d+)/;
const PACE = /probe pace .*heightsChecked=(\d+) drifts=(\d+) maxDrift=([\d.]+)/;
const BOUNDS =
  /probe bounds (\S+) row=(\S+) cell=([\d.]+) over=([\d.]+) furthest=(\S+) pictures=(\d+) stale=(\d)/;
/** A screenshot the session reads: a phone-shaped PNG, as a screen search returns. */
const SCREEN = join(
  ROOT,
  "apps/apple/Packages/CawCoKit/Sources/CawCoScreens/Resources/Paywall.xcassets/PaywallStoryRest.imageset/PaywallStoryRest.png"
);
/** Screenshots the turn reads at once: three shut calls with pictures. */
const SCREENS = 3;
/** Calls in the same message with no pictures: shut calls one line tall. */
const PLAIN = ["searched", "done"];
/** Flings each way past the calls. */
const FLINGS = 4;
/** Half a point: what a frame snapped to pixels may differ by. */
const SLACK = 0.5;

/** The owner's message: a three-column table of long cells, then paragraphs and a list. */
const MESSAGE = [
  "Three directions are up for you to pick, each with what it does on the page and what it costs us to build:",
  "",
  "| Variation | What happens | What it costs |",
  "| --- | --- | --- |",
  "| A hand | A drawn hand slides in from the right edge and lifts the lid of the laptop, so the board rises out of it as the hero settles. | One more illustration in the house line style, and a second timing pass so the hand and the board never move on the same frame. |",
  "| No hand | The lid opens by itself as the page loads, the board rising with it, and the headline lands once the board has settled in place. | Nothing new to draw; the existing lid animation is reused, with its easing retuned to the slower open the hero wants. |",
  "| Caw shuts it | Caw walks across the open laptop at the end of the scroll and closes the lid behind him, which hands the reader to the pricing section below. | A new Caw walk cycle and the close in Rive, about two days, and the pricing section has to start where the walk ends. |",
  "| Your scroll | The reader's own scroll drives the lid: it opens as they scroll down and shuts as they scroll back, nothing moving unless they do. | The scroll-linked timeline and a reduced-motion version that shows the board open, plus checking it on the slowest phone we support. |",
  "",
  "hero-variations: the five hero ideas, each with and without the board rising.",
  "",
  "landing-full-copy: Fable's whole page.",
  "",
  "What you pick on these three decides the next round:",
  "",
  "- which hero direction to polish;",
  "- who closes the lid;",
  "- which copy goes in.",
  "",
  "Nothing else is running.",
].join("\n");
/** The streamed turn: the same message, a word at a time. */
const WORDS = MESSAGE.split(" ").map((word, i, all) =>
  i < all.length - 1 ? `${word} ` : word
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

interface Heard {
  at: number;
  line: string;
}

/** Streams the app's Transcript log off the simulator into `heard`. */
function listen(udid: string, heard: Heard[]): () => void {
  const child = Bun.spawn(
    [
      "bash",
      "-c",
      `exec xcrun simctl spawn ${udid} log stream --level debug --style compact --predicate 'subsystem == "dev.cawco.app" AND category == "Transcript"'`,
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

/** One table as a `probe bounds` line says it, read. */
interface Geometry {
  next: number;
  nextIs: string;
  rows: { height: number; text: number; y: number }[];
  said: string;
  tableHeight: number;
  tableY: number;
  width: number;
}

const geometryOf = (line: string): Geometry | undefined => {
  const m = TABLE.exec(line);
  if (!m) {
    return;
  }
  const rows = (m[5] ?? "")
    .split(",")
    .filter(Boolean)
    .map((row) => {
      const [y, rest] = row.split("+");
      const [height, text] = (rest ?? "").split("/");
      return { y: Number(y), height: Number(height), text: Number(text) };
    });
  return {
    said: m[1] ?? "",
    width: Number(m[2]),
    tableY: Number(m[3]),
    tableHeight: Number(m[4]),
    rows,
    next: Number(m[6]),
    nextIs: m[7] ?? "",
  };
};

/** The newest table geometry said after `from` once the list has rested 2.5 s, optionally at another width than `not`. */
async function settled(
  heard: Heard[],
  from: number,
  not?: number
): Promise<Geometry | undefined> {
  const newest = () =>
    heard
      .slice(from)
      .map((h) => geometryOf(h.line))
      .filter(
        (g): g is Geometry =>
          g !== undefined &&
          (not === undefined || Math.abs(g.width - not) > SLACK)
      )
      .at(-1);
  const first = await until(
    "a table laid out",
    () => Promise.resolve(newest()),
    Boolean,
    90_000
  ).catch(() => undefined);
  if (!first) {
    return;
  }
  await Bun.sleep(2500);
  return newest();
}

/** The table's own checks at one width. */
function judge(kit: Kit, where: string, g: Geometry | undefined): void {
  if (!kit.check(`${where}: the table was laid out`, g !== undefined)) {
    return;
  }
  const geometry = g as Geometry;
  const foot = Math.max(...geometry.rows.map((r) => r.y + r.height));
  const tableFoot = geometry.tableY + geometry.tableHeight;
  kit.check(
    `${where}: what follows the table starts at or below its last row's foot`,
    geometry.rows.length === 5 && geometry.next + SLACK >= foot,
    `${geometry.nextIs === "block" ? "next block" : "piece's end"} at ${geometry.next.toFixed(2)}, last row's foot ${foot.toFixed(2)}, ${geometry.rows.length} rows; ${geometry.said}`
  );
  kit.check(
    `${where}: the table's frame holds every row`,
    tableFoot + SLACK >= foot,
    `frame ${geometry.tableY.toFixed(2)}…${tableFoot.toFixed(2)}, rows to ${foot.toFixed(2)}`
  );
  const short = geometry.rows.filter((r) => r.height + SLACK < r.text);
  kit.check(
    `${where}: each row is at least as tall as its tallest cell's words`,
    short.length === 0,
    geometry.rows
      .map(
        (r, i) =>
          `row ${i} ${r.height.toFixed(2)} for words ${r.text.toFixed(2)}`
      )
      .join("; ")
  );
}

/** The screen's size, as axe reads the app's first element. */
async function screenOf(
  udid: string
): Promise<{ height: number; width: number }> {
  const tree = JSON.parse(
    await sh(`${AXE} describe-ui --udid ${udid}`)
  ) as unknown;
  const first = (Array.isArray(tree) ? tree[0] : tree) as {
    frame?: { height: number; width: number };
  };
  if (!first.frame) {
    throw new Error("axe describe-ui gave the app's first element no frame");
  }
  return first.frame;
}

/** One finger flung down the middle of the screen (the list moves up toward older rows), or up it. */
async function fling(
  udid: string,
  screen: { height: number; width: number },
  older: boolean
): Promise<void> {
  const x = Math.round(screen.width / 2);
  const [from, to] = [
    Math.round(screen.height * 0.3),
    Math.round(screen.height * 0.75),
  ];
  const [start, end] = older ? [from, to] : [to, from];
  await sh(
    `${AXE} drag --start-x ${x} --start-y ${start} --end-x ${x} --end-y ${end} --duration 0.08 --steps 6 --udid ${udid}`
  );
  await Bun.sleep(900);
}

/** Every row said on the screen since `from` draws inside its cell and is its item's own (`probe bounds`). */
function judgeBounds(
  kit: Kit,
  where: string,
  heard: Heard[],
  from: number
): void {
  const said = heard
    .slice(from)
    .map((h) => BOUNDS.exec(h.line))
    .filter((m) => m !== null);
  const past = said.filter((m) => Number(m[4]) > SLACK);
  const stale = said.filter((m) => m[7] === "1");
  kit.check(
    `${where}: every row on the screen draws inside its cell`,
    said.length > 0 && past.length === 0,
    past.length > 0
      ? past
          .slice(0, 6)
          .map(
            (m) => `${m[1]} ${m[2]} ${m[5]} ${m[4]}pt past its ${m[3]}pt cell`
          )
          .join(" | ")
      : `${said.length} rows checked, none past its cell`
  );
  kit.check(
    `${where}: each cell holds its own item's row`,
    said.length > 0 && stale.length === 0,
    stale.length > 0
      ? stale
          .slice(0, 6)
          .map((m) => `${m[1]} ${m[2]}`)
          .join(" | ")
      : `${said.length} rows checked`
  );
}

/** The shut calls with pictures came on the screen since `from`, their pictures inside their rows. */
function judgePictures(
  kit: Kit,
  where: string,
  heard: Heard[],
  from: number
): void {
  const pictured = heard
    .slice(from)
    .map((h) => BOUNDS.exec(h.line))
    .filter((m) => m !== null)
    .filter((m) => m[2] === "ToolLineView" && Number(m[6]) > 0);
  kit.check(
    `${where}: the shut calls' pictures were on the screen, inside their rows`,
    pictured.length > 0 && pictured.every((m) => Number(m[4]) <= SLACK),
    pictured
      .slice(0, 4)
      .map((m) => `${m[1]} ${m[6]} picture(s), cell ${m[3]}pt, ${m[4]}pt past`)
      .join(" | ") || "no shut call with pictures was said"
  );
}

interface Cost {
  configures: number;
  heightMs: number;
  heights: number;
  layoutMs: number;
  layouts: number;
}

const costAt = (heard: Heard[]): Cost => {
  const m = heard
    .map((h) => COST.exec(h.line))
    .filter((c) => c !== null)
    .at(-1);
  return {
    heights: Number(m?.[1] ?? 0),
    heightMs: Number(m?.[2] ?? 0),
    layouts: Number(m?.[3] ?? 0),
    layoutMs: Number(m?.[4] ?? 0),
    configures: Number(m?.[5] ?? 0),
  };
};

const costSaid = (c: Cost): string =>
  `${c.heights} heights asked (${c.heightMs.toFixed(2)} ms), ${c.layouts} table layouts (${c.layoutMs.toFixed(2)} ms), ${c.configures} configures`;

async function run(kit: Kit): Promise<void> {
  const { path: app, problem } = freshApp(ROOT);
  if (!kit.check("the app is built from this tree", !problem, problem ?? app)) {
    return;
  }
  const marks = {
    seed: `seed-mark-${crypto.randomUUID().slice(0, 6)}`,
    stream: `stream-mark-${crypto.randomUUID().slice(0, 6)}`,
  };
  let screens: string[] = [];
  const respond = (request: Seen): Reply => {
    const turn = [...request.all.matchAll(MARK)].at(-1)?.[0];
    if (!request.tools || turn === undefined) {
      return { everyMs: 5, words: ["Done."] };
    }
    if (turn === marks.stream) {
      return { everyMs: 40, words: WORDS };
    }
    // The seeding turn: the screenshots read at once, then the plan.
    return request.afterTool
      ? { everyMs: 1, words: [MESSAGE] }
      : {
          everyMs: 1,
          words: ["Reading the three screens first."],
          // Shut calls without pictures after them, nearest the foot: the
          // list measures one of those first, and every shut call it holds
          // one line tall stands at that one's height, as the owner's did.
          tools: [
            ...screens.map((path) => ({
              name: "Read",
              input: { file_path: path },
            })),
            ...PLAIN.map((word) => ({
              name: "Bash",
              input: { command: `echo ${word}`, description: `Say ${word}` },
            })),
          ],
        };
  };
  const fleet = await kit.fleet(respond);
  screens = Array.from({ length: SCREENS }, (_, i) =>
    join(fleet.workdir, `screen-${i + 1}.png`)
  );
  await Promise.all(screens.map((path) => copyFile(SCREEN, path)));
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.launch("agent");
  await fleet.agentUp();
  await fleet.accountSignedIn();
  const session = await fleet.spawn("claude", TITLE);
  const ended = () =>
    fleet.query<{ turn_ended_at: number | null }>(
      "SELECT turn_ended_at FROM instances WHERE id = ?",
      session
    )[0]?.turn_ended_at ?? 0;
  await fleet.send(session, `${marks.seed}: say the plan.`);
  await until(
    "the seeded turn ended",
    () => ended(),
    (at) => at > 0,
    120_000
  );
  // The calls' results carry their pictures on the hub, as the owner's searches did.
  const page = await fleet.api<{
    blocks: { metadata?: { resultImages?: unknown[]; toolName?: string } }[];
  }>(`/api/instances/${session}/transcript`);
  const pictured = page.blocks.filter(
    (b) => (b.metadata?.resultImages?.length ?? 0) > 0
  );
  if (
    !kit.check(
      `the seeded turn's ${SCREENS} Read calls carry their pictures (resultImages)`,
      pictured.length === SCREENS,
      `${pictured.length} of ${page.blocks.length} blocks carry pictures: ${pictured.map((b) => b.metadata?.toolName).join(", ")}`
    )
  ) {
    return;
  }

  const turns: Turns = {
    ended,
    stream: () => fleet.send(session, `${marks.stream}: say it again.`),
  };
  for (const device of [
    { tag: "iPhone", type: IPHONE },
    { tag: "iPad", type: IPAD },
  ]) {
    // biome-ignore lint/performance/noAwaitInLoops: one simulator slot at a time
    await leg(kit, device, {
      app,
      launch: `-cawco-hub-url ${fleet.base} -open-session ${session}`,
      turns,
    });
  }
}

/** The seeded session's turns, as a leg reads and starts them. */
interface Turns {
  ended: () => number;
  stream: () => Promise<unknown>;
}

/** One device: the table, the scroll past the calls, then the iPad's width change or the iPhone's captures and streamed turn. */
async function leg(
  kit: Kit,
  device: { tag: string; type: string },
  on: { app: string; launch: string; turns: Turns }
): Promise<void> {
  const sim = await macSim({ runtime: RUNTIME, device: device.type });
  const heard: Heard[] = [];
  let stop: () => void = () => undefined;
  try {
    const { udid } = sim;
    console.log(`  ${device.tag} simulator ${udid}`);
    await sh(`xcrun simctl bootstatus ${udid} -b >/dev/null`);
    await sh(`xcrun simctl install ${udid} "${on.app}"`);
    stop = listen(udid, heard);
    await Bun.sleep(1500);
    await sh(
      `xcrun simctl launch --terminate-running-process ${udid} dev.cawco.app -paywall-env sandbox ${on.launch} -probe-pace >/dev/null`
    );
    const shown = await settled(heard, 0);
    judge(kit, device.tag, shown);
    // Up past the shut calls with their pictures, a fling at a time, and back down.
    const screen = await screenOf(udid);
    for (const older of [true, false]) {
      for (let i = 0; i < FLINGS; i += 1) {
        // biome-ignore lint/performance/noAwaitInLoops: each fling starts where the last left the list
        await fling(udid, screen, older);
      }
    }
    judgeBounds(kit, `${device.tag}, scrolled past the shut calls`, heard, 0);
    judgePictures(kit, `${device.tag}, scrolled past the shut calls`, heard, 0);
    kit.note(`${device.tag}: drawing the message: ${costSaid(costAt(heard))}`);
    if (device.tag === "iPad") {
      await widen(kit, udid, heard, shown);
    } else {
      await captures(udid);
      await streamed(kit, heard, on.turns);
    }
    judgeDrift(kit, device.tag, heard);
  } finally {
    await writeFile(
      join(kit.out, `app-log-${device.tag}.txt`),
      heard.map((h) => `${new Date(h.at).toISOString()} ${h.line}`).join("\n")
    );
    stop();
    await sim.release();
  }
}

/** The iPad's transcript made wider (Hide sidebar): the table measured again at the new width. */
async function widen(
  kit: Kit,
  udid: string,
  heard: Heard[],
  shown: Geometry | undefined
): Promise<void> {
  const from = heard.length;
  const tapped = await sh(`${AXE} tap --label "Hide sidebar" --udid ${udid}`)
    .then(() => true)
    .catch((error: Error) => {
      kit.note(`Hide sidebar: ${error.message}`);
      return false;
    });
  const wider = tapped ? await settled(heard, from, shown?.width) : undefined;
  judge(
    kit,
    `iPad, sidebar hidden (${shown?.width.toFixed(0) ?? "?"} → ${wider?.width.toFixed(0) ?? "?"}pt)`,
    wider
  );
  judgeBounds(kit, "iPad, sidebar hidden", heard, from);
}

/** `PROBE_CAPTURE=<dir>`: the iPhone's screen, light and dark, there. */
async function captures(udid: string): Promise<void> {
  const capture = process.env.PROBE_CAPTURE;
  if (!capture) {
    return;
  }
  await mkdir(capture, { recursive: true });
  for (const look of ["light", "dark"]) {
    // biome-ignore lint/performance/noAwaitInLoops: one appearance after the other
    await sh(`xcrun simctl ui ${udid} appearance ${look}`);
    await Bun.sleep(1500);
    await sh(
      `xcrun simctl io ${udid} screenshot "${join(capture, `ios-table-${look}.png`)}" >/dev/null 2>&1`
    );
  }
  await sh(`xcrun simctl ui ${udid} appearance light`);
}

/** The same message streamed a word at a time: what each word appended costs the tables, and the table it lands as. */
async function streamed(kit: Kit, heard: Heard[], turns: Turns): Promise<void> {
  const before = costAt(heard);
  const from = heard.length;
  const was = turns.ended();
  await turns.stream();
  await until(
    "the streamed turn ended",
    () => turns.ended(),
    (at) => at > was,
    5 * 60_000
  );
  await Bun.sleep(3000);
  const after = costAt(heard);
  const per = (n: number) => (n / WORDS.length).toFixed(2);
  kit.note(
    `iPhone: streaming the message (${WORDS.length} words appended): ${after.heights - before.heights} heights asked (${(after.heightMs - before.heightMs).toFixed(2)} ms), ${after.layouts - before.layouts} table layouts (${(after.layoutMs - before.layoutMs).toFixed(2)} ms), ${after.configures - before.configures} configures; per word ${per(after.heights - before.heights)} heights, ${per(after.layouts - before.layouts)} layouts, ${per(after.configures - before.configures)} configures, ${((after.heightMs - before.heightMs + after.layoutMs - before.layoutMs) / WORDS.length).toFixed(3)} ms`
  );
  judge(kit, "iPhone, after the streamed reply", await settled(heard, from));
  judgeBounds(kit, "iPhone, while and after the reply streamed", heard, from);
}

/** No row stood at a worked-out height draws at another (RowStore `verify`). */
function judgeDrift(kit: Kit, tag: string, heard: Heard[]): void {
  const pace = heard
    .map((h) => PACE.exec(h.line))
    .filter((m) => m !== null)
    .at(-1);
  const drifted = heard
    .filter((h) => h.line.includes("probe height drift"))
    .map((h) => h.line.slice(h.line.indexOf("probe height drift")));
  kit.check(
    `${tag}: no row drew at another height than it stood at`,
    pace !== undefined && Number(pace[2]) === 0,
    `${pace?.[1] ?? "?"} rows checked, ${pace?.[2] ?? "?"} drifted, the largest ${pace?.[3] ?? "?"}pt${drifted.length > 0 ? `: ${drifted.slice(0, 4).join(" | ")}` : ""}`
  );
}

export default { name: "ios-table-height", run } satisfies Spec;
