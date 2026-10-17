/**
 * iOS: the Projects PRD's P4 live check (§7, "a canvas drawn with the
 * pencil on the iPad reaches the agent as an outline and a picture, the
 * agent's edit shows on the iPad without a reload, and a re-published form
 * keeps what was typed"), on an iPad simulator, iOS 18.5 and 27.2 (the newest
 * runtime installed).
 *
 * A scratch fleet (real hub, agent and sessiond, Claude Code against the
 * mock model) and the built app. For each runtime, a session of its own:
 *
 * 1. The app, launched with `-canvas-probe-ink -cawcoProbePencil`, says where
 *    its pill is; a finger drags up from there (axe), which the canvas's
 *    swipe takes as the pencil for this run (the simulator has no pencil
 *    input). The canvas opens, a pen stroke goes through Excalidraw's own
 *    pointer path (`pointerType: "pen"`, ComposerCanvas.swift
 *    `probeStroke`) and syncs to the hub, and Send carries the file, the
 *    outline and the picture (ComposerCanvasProbe.swift `inkPass`). The
 *    hub's transcript holds the message with canvas.excalidraw, canvas.md
 *    and one image; the model's request for it holds the outline's ink line
 *    and an image block.
 * 2. The session shows that canvas (`artifact_show`) and adds a rectangle to
 *    it (`artifact_update`): the panel's page holds one element more
 *    (`preview doc … elements=`), at the same document clock (its
 *    `performance.timeOrigin`), and no navigation committed between
 *    (`preview document`).
 * 3. The session makes a page with a text field; a tap puts the focus in it
 *    and the keys type "typed by hand" (axe). The session re-publishes the
 *    page with new HTML (`artifact_update` html): the page's own report
 *    (`preview page …`) says the new paragraph stands, the field still holds
 *    the words and the focus, at the same document clock, with no navigation.
 *    The page names no viewport, as an agent's page may not: the panel lays
 *    it out at its own width and scale 1, as the web's iframe does
 *    (PreviewController `viewport`), before and after the morph.
 *
 *   bash apps/apple/scripts/build-both.sh ios --compile-only
 *   bun scripts/probe-kit/run.ts ios-canvas
 *
 * The app is this checkout's simulator build (`PROBE_IOS_APP` names another).
 */
import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Subprocess } from "bun";
import { freshApp } from "../../lib/apple-app";
import { type MacSim, macSim, type SimChoice } from "../../lib/mac-sim";
import { type Reply, type Seen, until } from "../../scratch-fleet";
import { type Kit, type KitFleet, ROOT, type Spec } from "../kit";

const RUNTIMES: { choice: SimChoice; tag: string }[] = [
  {
    tag: "ios-18.5",
    choice: {
      runtime: "com.apple.CoreSimulator.SimRuntime.iOS-18-5",
      device: "com.apple.CoreSimulator.SimDeviceType.iPad-Pro-13-inch-M4-8GB",
    },
  },
  // The newest runtime installed (`xcrun simctl list runtimes`, 2026-10-18), the same iPad.
  {
    tag: "ios-27.2",
    choice: {
      runtime: "com.apple.CoreSimulator.SimRuntime.iOS-27-2",
      device: "com.apple.CoreSimulator.SimDeviceType.iPad-Pro-13-inch-M4-8GB",
    },
  },
];
const AXE = "/opt/homebrew/bin/axe";
const LOG_HEAD = /^.*?\[dev\.cawco\.app:[^\]]*\] /;
const COMMAND = /PROBE-CALL:(\d+)/g;
const ANSWERED_ID = /"id":"([0-9a-f-]{36})"/;
const SWIPE_AT = /^canvas swipe at (\d+),(\d+)$/;
const SENT = /^canvas ink sent canvas ([0-9a-f-]{36}) to /;
const DOC =
  /^preview doc origin=(\d+) elements=(-?\d+) width=(\d+) scale=([\d.]+)$/;
const PAGE =
  /^preview page value=(\S*) focus=(\S+) revised=(\d) field=(\d+),(\d+)$/;
const INK_LINE = /ink [\w-]+: \d+ points/;
const WORDS = "P4: the pencil's drawing";
const TYPED = "typed by hand";
const SHOW = "mcp__cawco__artifact_show";
const UPDATE = "mcp__cawco__artifact_update";
const CREATE = "mcp__cawco__artifact_create";

/** A page with one text field; its report says the field's words, where the focus is, and whether the agent's revision stands. */
const form = (revised: boolean) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Form</title>
<style>body { font: 17px system-ui; padding: 24px } input { font: inherit; padding: 8px; width: 16em }</style></head>
<body><h1>Who it's for</h1>
<label for="name">Name</label> <input id="name" name="name" type="text" autocomplete="off" autocapitalize="off">
${revised ? '<p id="revised">Revised by the agent.</p>' : ""}
<script>
function report() {
  const field = document.getElementById("name");
  const box = field.getBoundingClientRect();
  window.parent.postMessage({
    type: "cawco:probe",
    state: "value=" + encodeURIComponent(field.value) + " focus=" + (document.activeElement?.id || "none")
      + " revised=" + (document.getElementById("revised") ? 1 : 0),
    rects: { field: { x: box.x, y: box.y, width: box.width, height: box.height } },
  }, "*");
}
</script></body></html>`;

const pause = (ms: number) => Bun.sleep(ms);

/** Where the paired captures go: outside the workspace, for a later review of app against web. */
const keep = join(
  process.env.XDG_CACHE_HOME ?? join(homedir(), ".cache"),
  "cawco-captures",
  "prd-parity",
  "p4-canvas"
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
/** The model's request for the canvas's message, as the harness sent it, by session words. */
const inkRequests: string[] = [];

const respond = (request: Seen): Reply => {
  const text = (words: string): Reply => ({ everyMs: 5, words: [words] });
  if (!request.tools) {
    return text("Probe title");
  }
  if (request.last.includes(WORDS) && !request.afterTool) {
    inkRequests.push(request.body);
    return text("I have your drawing.");
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

/** A transcript block as the hub sends it: a user message's files and pictures are in its metadata. */
interface Block {
  content?: string;
  metadata?: {
    attachments?: { name?: string; text?: string }[];
    images?: unknown[];
  };
}

let n = 0;

/** The session calls `name` with `input`; answers the tool's result as the model read it. */
async function call(
  fleet: KitFleet,
  session: string,
  name: string,
  input: object
): Promise<string> {
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
}

/** A simulator with the app installed, its Probe and Canvas lines heard as they come. */
async function openSim(
  choice: SimChoice,
  app: string
): Promise<{ heard: string[]; sim: MacSim; stream: Subprocess }> {
  const sim = await macSim(choice);
  const { udid } = sim;
  await sh(`xcrun simctl bootstatus ${udid} -b >/dev/null`);
  await sh(`xcrun simctl install ${udid} "${app}"`);
  const runtime = (
    await sh(
      `xcrun simctl list devices -j | python3 -c 'import json,sys; d=json.load(sys.stdin)["devices"]; print(next(k for k,v in d.items() for x in v if x["udid"]=="${udid}"))'`
    )
  ).trim();
  console.log(`  simulator ${udid} on ${runtime}`);
  const heard: string[] = [];
  const stream = Bun.spawn(
    [
      "bash",
      "-c",
      `exec xcrun simctl spawn ${udid} log stream --level debug --style compact --predicate 'subsystem == "dev.cawco.app" AND (category == "Probe" OR category == "Canvas")'`,
    ],
    { stdout: "pipe", stderr: "ignore" }
  );
  (async () => {
    const decoder = new TextDecoder();
    const reader = stream.stdout.getReader();
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
  return { sim, stream, heard };
}

const run = async (kit: Kit) => {
  const { path: app, problem } = freshApp(ROOT);
  if (!kit.check("the app is built from this tree", !problem, problem ?? app)) {
    return;
  }
  const fleet = await kit.fleet(respond);
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.launch("agent");
  await fleet.agentUp();
  await fleet.accountSignedIn();
  const dashboard = await fleet.dashboard();
  for (const { choice, tag } of RUNTIMES) {
    // biome-ignore lint/performance/noAwaitInLoops: one simulator at a time, as the Mac's slots hold them
    await onRuntime(kit, fleet, { app, choice, dashboard, tag });
  }
};

/** The three steps on one runtime's iPad, a session of its own. */
async function onRuntime(
  kit: Kit,
  fleet: KitFleet,
  {
    app,
    choice,
    dashboard,
    tag,
  }: { app: string; choice: SimChoice; dashboard: string; tag: string }
): Promise<void> {
  const session = await fleet.spawn("claude", `P4 ${tag}`, fleet.repo);
  const shots = join(keep, tag);
  await mkdir(shots, { recursive: true });
  let pad: Awaited<ReturnType<typeof openSim>> | undefined;
  try {
    pad = await openSim(choice, app);
    const on: On = {
      dashboard,
      fleet,
      heard: pad.heard,
      kit,
      session,
      shots,
      tag,
      udid: pad.sim.udid,
    };
    const { asked, canvasId, refused } = await inkStep(on);
    await reachedStep(on, asked);
    if (!canvasId) {
      return;
    }
    await editStep(on, canvasId);
    await captureCanvas(on);
    await formStep(on, refused);
    console.log(`  captures: ${shots}`);
  } finally {
    await Bun.write(
      join(kit.out, `ios-canvas-${tag}.log`),
      (pad?.heard ?? []).join("\n")
    );
    pad?.stream.kill();
    await pad?.sim.release();
  }
}

/** One runtime's run: its fleet and session, its simulator and what its app said. */
interface On {
  dashboard: string;
  fleet: KitFleet;
  heard: string[];
  kit: Kit;
  session: string;
  shots: string;
  tag: string;
  udid: string;
}

/** The hub's transcript of `session`. */
async function transcriptOf(
  fleet: KitFleet,
  session: string
): Promise<Block[]> {
  const page = await fleet.api<{ blocks?: Block[] }>(
    `/api/instances/${session}/transcript?limit=200`
  );
  return page.blocks ?? [];
}

/** A user message carrying the canvas's file. */
const carriesCanvas = (block: Block) =>
  (block.metadata?.attachments ?? []).some(
    (file) => file.name === "canvas.excalidraw"
  );

/** 1a. The pencil's stroke, sent: the canvas's id, and axe's error when the simulator's input was refused. */
async function inkStep(
  on: On
): Promise<{ asked: number; canvasId?: string; refused?: string }> {
  const { fleet, heard, kit, session, tag, udid } = on;
  const asked = inkRequests.length;
  await sh(
    `xcrun simctl launch --terminate-running-process ${udid} dev.cawco.app -paywall-env sandbox -cawco-hub-url ${fleet.base} -open-session ${session} -preview-probe -canvas-probe-ink -cawcoProbePencil >/dev/null`
  );
  const swipe = await until(
    `${tag}: where the pill is`,
    () => heard.findLast((line) => SWIPE_AT.test(line)),
    Boolean,
    120_000
  ).catch(() => undefined);
  const at = swipe?.match(SWIPE_AT);
  let dragged = "no swipe asked for";
  /** The simulator's input refused inside this boundary (iOS 27's remote automation socket): axe's exact error. */
  let refused: string | undefined;
  if (at) {
    const [x, y] = [Number(at[1]), Number(at[2])];
    dragged = await sh(
      `${AXE} drag --start-x ${x} --start-y ${y} --end-x ${x} --end-y ${y - 160} --duration 0.4 --steps 30 --udid ${udid}`
    )
      .then(() => `dragged up from ${x},${y}`)
      .catch((error: Error) => {
        refused = error.message;
        return `axe drag: ${error.message}`;
      });
  }
  // No input to stand in for the pencil's swipe: Draw opens the canvas, and the form's words go in by `-preview-type`.
  const by = refused ? "Draw" : "the pencil's swipe";
  if (refused) {
    heard.length = 0;
    await sh(
      `xcrun simctl launch --terminate-running-process ${udid} dev.cawco.app -paywall-env sandbox -cawco-hub-url ${fleet.base} -open-session ${session} -preview-probe -canvas-probe-ink -preview-type '${TYPED}' >/dev/null`
    );
  }
  const sent = await until(
    `${tag}: the canvas sent`,
    () => heard.findLast((line) => SENT.test(line)),
    Boolean,
    180_000
  ).catch(() => undefined);
  const canvasId = sent?.match(SENT)?.[1];
  const inkChecks = heard.filter(
    (line) =>
      line.startsWith("canvas PASS ink") || line.startsWith("canvas FAIL ink")
  );
  kit.check(
    `${tag} 1a: ${by} opens the canvas, a pen stroke is one element synced to the hub, and Send carries the file, the outline and the picture`,
    inkChecks.length === 3 &&
      inkChecks.every((line) => line.startsWith("canvas PASS")) &&
      inkChecks[0]?.includes(by) === true &&
      !!canvasId,
    `${dragged}; ${inkChecks.join(" | ") || "no ink lines"}; ${sent ?? "not sent"}`
  );
  return { asked, canvasId, refused };
}

/** 1b. What reached the agent: the hub's transcript of the message, and the model's request for it. */
async function reachedStep(on: On, asked: number): Promise<void> {
  const { fleet, kit, session, tag } = on;
  const blocks = await until(
    `${tag}: the message in the hub's transcript`,
    () => transcriptOf(fleet, session),
    (all) => all.some(carriesCanvas),
    60_000
  ).catch(() => [] as Block[]);
  const message = blocks.find(carriesCanvas);
  const names = (message?.metadata?.attachments ?? []).map((file) => file.name);
  const images = message?.metadata?.images?.length ?? 0;
  const body = await until(
    `${tag}: the model's request for it`,
    () => inkRequests.slice(asked).at(-1),
    Boolean,
    60_000
  ).catch(() => undefined);
  const imageBlocks = (body?.match(/"type":"image"/g) ?? []).length;
  const ink = body?.match(INK_LINE)?.[0];
  kit.check(
    `${tag} 1b: the message reaches the agent as an outline and a picture: canvas.md and canvas.excalidraw with one image in the hub's transcript, the outline's ink line and an image block in the model's request`,
    names.includes("canvas.md") &&
      names.includes("canvas.excalidraw") &&
      images === 1 &&
      imageBlocks >= 1 &&
      !!ink,
    `hub: attachments ${names.join(", ") || "none"}, images ${images}; model: ${imageBlocks} image block(s), outline ${ink ?? "no ink line"}`
  );
}

/** 2. The agent's edit, without a reload. */
async function editStep(on: On, canvasId: string): Promise<void> {
  const { fleet, heard, kit, session, tag } = on;
  const after = (mark: number) => heard.slice(mark);
  const shownAt = heard.length;
  await call(fleet, session, SHOW, { id: canvasId });
  const before = await until(
    `${tag}: the canvas in the panel`,
    () => after(shownAt).findLast((line) => DOC.test(line)),
    (line) => Number(line?.match(DOC)?.[2] ?? -1) >= 1,
    90_000
  ).catch(() => after(shownAt).findLast((line) => DOC.test(line)));
  const [, origin, count] = before?.match(DOC) ?? [];
  const editAt = heard.length;
  const outline = await call(fleet, session, UPDATE, {
    id: canvasId,
    elements: [
      {
        type: "rectangle",
        id: "agent-box",
        x: 40,
        y: 40,
        width: 160,
        height: 80,
      },
    ],
  });
  const edited = await until(
    `${tag}: the agent's element in the panel`,
    () => after(editAt).findLast((line) => DOC.test(line)),
    (line) => Number(line?.match(DOC)?.[2] ?? -1) === Number(count) + 1,
    30_000
  ).catch(() => after(editAt).findLast((line) => DOC.test(line)));
  const navigated = after(editAt).filter(
    (line) => line === "preview document"
  ).length;
  kit.check(
    `${tag} 2: the agent's edit shows in the panel without a reload: one element more, the same document, no navigation`,
    !!origin &&
      edited?.match(DOC)?.[1] === origin &&
      Number(edited?.match(DOC)?.[2]) === Number(count) + 1 &&
      navigated === 0 &&
      outline.includes("agent-box"),
    `before ${before ?? "nothing"}; after ${edited ?? "nothing"}; navigations ${navigated}; the tool's outline ${outline.includes("agent-box") ? "names agent-box" : outline.slice(0, 160)}`
  );
}

/** The canvas in the panel beside the dashboard's at the iPad's viewport, light and dark. */
async function captureCanvas(on: On): Promise<void> {
  const { dashboard, kit, session, shots, udid } = on;
  for (const theme of ["light", "dark"] as const) {
    // biome-ignore lint/performance/noAwaitInLoops: one appearance at a time, as the simulator holds one
    await sh(`xcrun simctl ui ${udid} appearance ${theme}`);
    await pause(2500);
    await sh(
      `xcrun simctl io ${udid} screenshot "${join(shots, `app-canvas-${theme}.png`)}" >/dev/null`
    );
    try {
      const page = await kit.page("ipad", { engine: "webkit", theme });
      await page.goto(`${dashboard}/session/${session}`, {
        waitUntil: "domcontentloaded",
      });
      await page
        .locator('[data-slot="preview-pane"], .preview-pane')
        .first()
        .waitFor({ timeout: 60_000 });
      await pause(4000);
      await page.screenshot({ path: join(shots, `web-canvas-${theme}.png`) });
      await page.close();
    } catch (error) {
      console.log(
        `  the web ${theme} canvas wasn't captured: ${(error as Error).message.split("\n")[0]}`
      );
    }
  }
  await sh(`xcrun simctl ui ${udid} appearance light`);
}

/** 3. A form re-published keeps what was typed. */
async function formStep(on: On, refused?: string): Promise<void> {
  const { fleet, heard, kit, session, shots, tag, udid } = on;
  const after = (mark: number) => heard.slice(mark);
  const madeAt = heard.length;
  const made = await call(fleet, session, CREATE, {
    kind: "page",
    name: "form",
    html: form(false),
  });
  const pageId = made.match(ANSWERED_ID)?.[1];
  const standing = await until(
    `${tag}: the form in the panel`,
    () => after(madeAt).findLast((line) => PAGE.test(line)),
    Boolean,
    90_000
  ).catch(() => undefined);
  const field = standing?.match(PAGE) ?? undefined;
  const typedBy = await typeIn(on, madeAt, field, refused);
  const typedLine = `value=${encodeURIComponent(TYPED)} focus=name revised=0`;
  const typed = await until(
    `${tag}: the words in the field`,
    () => after(madeAt).findLast((line) => PAGE.test(line)),
    (line) => !!line?.includes(typedLine),
    30_000
  ).catch(() => after(madeAt).findLast((line) => PAGE.test(line)));
  const formDoc = after(madeAt).findLast((line) => DOC.test(line));
  const formOrigin = formDoc?.match(DOC)?.[1];
  const under =
    typed?.includes(typedLine) || refused ? "" : await underTap(udid, field);
  await sh(
    `xcrun simctl io ${udid} screenshot "${join(shots, "app-form-typed.png")}" >/dev/null`
  );
  const republishAt = heard.length;
  const republished = pageId
    ? await call(fleet, session, UPDATE, { id: pageId, html: form(true) })
    : "no page id";
  const kept = await until(
    `${tag}: the revised form`,
    () => after(republishAt).findLast((line) => PAGE.test(line)),
    (line) => !!line?.includes("revised=1"),
    30_000
  ).catch(() => after(republishAt).findLast((line) => PAGE.test(line)));
  await pause(1500);
  const docAfter =
    after(republishAt).findLast((line) => DOC.test(line)) ?? formDoc;
  const formNavigations = after(republishAt).filter(
    (line) => line === "preview document"
  ).length;
  await sh(
    `xcrun simctl io ${udid} screenshot "${join(shots, "app-form-republished.png")}" >/dev/null`
  );
  kit.check(
    `${tag} 3: a form re-published while its field holds typed words and the focus keeps both: the revision stands, the same document at the panel's width and scale 1 (as the web's iframe), no navigation`,
    !!typed?.includes(typedLine) &&
      !!kept?.includes(
        `value=${encodeURIComponent(TYPED)} focus=name revised=1`
      ) &&
      !!formOrigin &&
      docAfter?.match(DOC)?.[1] === formOrigin &&
      formDoc?.match(DOC)?.[4] === "1.00" &&
      docAfter?.match(DOC)?.[4] === "1.00" &&
      docAfter?.match(DOC)?.[3] === formDoc?.match(DOC)?.[3] &&
      Number(formDoc?.match(DOC)?.[3]) < 980 &&
      formNavigations === 0,
    `${typedBy}; typed: ${typed ?? "nothing"}; after: ${kept ?? "nothing"}; document ${formDoc ?? "-"} → ${docAfter ?? "-"}; navigations ${formNavigations}; the tool: ${republished.slice(0, 120)}${under}`
  );
}

/**
 * The words into the form's field: a tap on it and the keys (axe), or,
 * with the simulator's input refused, `-preview-type`'s own. Answers how.
 */
async function typeIn(
  on: On,
  madeAt: number,
  field: RegExpMatchArray | undefined,
  refused: string | undefined
): Promise<string> {
  if (refused) {
    const into = await until(
      `${on.tag}: the words put in by -preview-type`,
      () =>
        on.heard
          .slice(madeAt)
          .findLast((line) => line.startsWith("preview typed into=")),
      Boolean,
      30_000
    ).catch(() => "not typed");
    return `the simulator's input refused (${refused.slice(0, 220)}), so -preview-type: ${into}`;
  }
  if (!field) {
    return "the form never reported";
  }
  return await sh(
    `${AXE} tap -x ${field[4]} -y ${field[5]} --udid ${on.udid} >/dev/null && sleep 1 && ${AXE} type '${TYPED}' --udid ${on.udid} >/dev/null`
  )
    .then(() => `tapped ${field[4]},${field[5]} and typed`)
    .catch((error: Error) => `axe: ${error.message}`);
}

/** What stands under the tap, as the simulator's accessibility reads it: for a tap that put no words in. */
async function underTap(
  udid: string,
  field: RegExpMatchArray | undefined
): Promise<string> {
  try {
    const said = await sh(
      `${AXE} describe-ui --point ${field?.[4] ?? 0},${field?.[5] ?? 0} --udid ${udid}`
    );
    return `; under the tap: ${said.replaceAll(/\s+/g, " ").slice(0, 300)}`;
  } catch (error) {
    return `; describe-ui: ${(error as Error).message}`;
  }
}

const spec: Spec = { name: "ios-canvas", run };
export default spec;
