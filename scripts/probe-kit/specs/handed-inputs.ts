/**
 * What a session hands another by name lands as files in the receiver's
 * `$TMPDIR/inputs/`, written by the hub, with no file the caller writes
 * (core handed-input.ts `HandedInput`, hub handed-inputs.ts
 * `createHandedInputs`, work-items.ts `readInputs` and `handIn`). On a
 * scratch fleet (real hub, agent and sessiond; Claude Code, OpenCode and pi
 * against the mock model) and the built dashboard at the desk, read from the
 * files the hub wrote, the leaf's brief and what the leaf's Bash printed:
 *
 * 1. Leaf A hands its parent a canvas (`artifact_create`, `to: "parent"`,
 *    one rectangle), drawn on the hub machine's screen, and finishes with a
 *    report.
 * 2. The parent makes a page and a preview of a folder; a person's pin on
 *    the page, written in its own doc, gets the agent's reply in its thread;
 *    the person sends the parent a message carrying a picture.
 * 3. Refused in words naming the entry, before anything is cut: a report of
 *    no item, an artifact the parent has none of, an entry of no shape.
 * 4. The parent delegates leaf B with inputs naming A's report, the page,
 *    the canvas, the preview, the page's pins, the person's picture, inline
 *    text and a blob. Each lands in B's `$TMPDIR/inputs/` under its
 *    predictable name with the expected contents: the report's words, the
 *    page's HTML and its picks file, the pin's words and the reply, the
 *    canvas's scene with its rectangle and its PNG, the preview's pass, the
 *    picture's bytes, the text, the blob's bytes; B's brief names every one.
 * 5. The preview's pass opens from inside B's workspace on this fleet's
 *    origin, the hub machine's tailnet name, which srt refuses for any other
 *    host: B's relay dials the hub's own preview origins from the host
 *    (agent proxy-relay.ts, core hub-previews.ts). B's curl of the pass gets
 *    the folder's page, and B's `artifact_browse` of the preview answers an
 *    address, not a refusal. A private address that is not the hub's
 *    (192.168.255.254) and the hub's own port that is no preview's, on that
 *    same tailnet name, are still refused (403).
 * 6. The parent's `handoff` tool, called with a `{ text, name }` input,
 *    lands it in B's inputs and names it; B finishes.
 * 7. OpenCode and pi: a parent on each calls `delegate` as that harness
 *    offers it (OpenCode's Code Mode, pi's own tool) with a `{ text, name }`
 *    input; its leaf's brief names the file and its Bash reads the words.
 * 8. The calls the hub refused on 2026-10-24, each accepted now, one leaf
 *    each, its files in `$TMPDIR/inputs/` with their folders:
 *    `{ report: <A's session's short id> }`; a folder path, landing as
 *    `inputs/<folder>/…` at every depth; `{ assets: <A's item's short id> }`
 *    of A's outputs, nested a folder down, landing at their project-folder
 *    paths; and a decision page whose `Preview` names the preview by its
 *    short id (`artifact_create`).
 * 9. A call that must still be refused: the parent's own `delegate` tool
 *    call with a path under `~/.ssh`. No work item comes of it; on the desk
 *    the parent's transcript draws it as the plain tool row with its error
 *    (`[data-slot="tools"] [data-slot="row"][data-err]`), never a delegate
 *    card (`[data-delegate-tone]`), and the tray's failed count is unchanged.
 * 10. One id resolver (hub handles.ts `byId`): a working delegate per form
 *    of naming it (its full id, six and eight characters of it, its handle
 *    `<folder>#<id8>`, a mention chip `@Title <handle>`) is reached by the
 *    parent's `handoff` (its words reach that leaf), `interrupt_delegate`,
 *    `answer_delegate` and `stop_delegate` (each answer names it, the stop
 *    cancels its item), and `find`'s `around` reads that session.
 *
 * It delegates, so its fleet cuts workspaces: it runs on the host, outside
 * every boundary.
 *
 *   bun scripts/probe-kit/run.ts handed-inputs
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Frame, Page } from "playwright-core";
import { type ToolSession, toolRecord, toolWords } from "../../lib/tool-call";
import {
  MACHINE,
  MODEL,
  type Reply,
  type Seen,
  until,
} from "../../scratch-fleet";
import { type Kit, type KitFleet, open, type Spec } from "../kit";
import { writePagePins } from "../pins";

const RUN = crypto.randomUUID().slice(0, 8);
const TAG_A = `PROBE-HANDED-A-${RUN}`;
const TAG_B = `PROBE-HANDED-B-${RUN}`;
const FINISH = "mcp__cawco__finish_item";
const CREATE = "mcp__cawco__artifact_create";
const BROWSE = "mcp__cawco__artifact_browse";
/** OpenCode keeps MCP tools in Code Mode's catalog. */
const CODE_MODE = "execute";

const REPORT_TOKEN = `handed-report-${crypto.randomUUID()}`;
const PAGE_TOKEN = `handed-page-${crypto.randomUUID()}`;
const PREVIEW_TOKEN = `handed-preview-${crypto.randomUUID()}`;
const PIN_WORDS = `handed-pin-${crypto.randomUUID()}`;
const REPLY_WORDS = `handed-reply-${crypto.randomUUID()}`;
const TEXT_TOKEN = `handed-text-${crypto.randomUUID()}`;
const HANDOFF_TOKEN = `handed-handoff-${crypto.randomUUID()}`;
const BLOB = Buffer.from(`handed-blob-${crypto.randomUUID()}\u0000ÿ`);
/** A 1×1 PNG, the person's pasted picture. */
const PICTURE = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64"
);
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

const CANVAS = `probe-canvas-${RUN}`;
const PAGE_NAME = `probe-page-${RUN}`;
const PREVIEW = `probe-preview-${RUN}`;
const BOX = "probe-box";
/** A's outputs: a folder whose files sit one level down and deeper (step 8). */
const BRIEFS: Record<string, string> = {
  "design-briefs/one.md": `brief-one-${crypto.randomUUID()}`,
  "design-briefs/deep/two.md": `brief-two-${crypto.randomUUID()}`,
};
const WRITE_BRIEFS = [
  "mkdir -p design-briefs/deep",
  ...Object.entries(BRIEFS).map(
    ([path, body]) => `printf %s ${body} > ${path}`
  ),
].join(" && ");
/** Step 8's leaves: one per call the hub refused before, each finishing at once. */
const TAG_SHORT = `PROBE-HANDED-SHORT-${RUN}`;
/** Step 9: the parent's own delegate call the hub must still refuse. */
const TAG_REFUSED = `PROBE-HANDED-REFUSED-${RUN}`;
const REFUSED_TITLE = `Refused probe ${RUN}`;
const DELEGATE = "mcp__cawco__delegate";
/** Step 10: each form a target may name a session in, from its whole id and its folder. */
const FORMS: Record<string, (id: string, folder: string) => string> = {
  "its full id": (id) => id,
  "six characters": (id) => id.slice(0, 6),
  "eight characters": (id) => id.slice(0, 8),
  "its handle": (id, folder) => `${folder}#${id.slice(0, 8)}`,
  "a mention chip": (id, folder) => `@Forms leaf <${folder}#${id.slice(0, 8)}>`,
};
const TAG_FORM = `PROBE-HANDED-FORM-${RUN}`;
const LAN_CODE = /lan:\d+/;
const LAN_DIRECT_CODE = /lan-direct:\d+/;
/** artifact_browse's answer: the address its browser loads. */
const BROWSE_ADDRESS = /Load https?:\/\/\S+ once in your browser tool/;
const HUB_API_CODE = /hub-api:\d+/;

interface Block {
  content?: unknown;
  id?: string;
  input?: { command?: string };
  name?: string;
  text?: string;
  tool_use_id?: string;
  type?: string;
}

/** A tool call a request's history holds, and its answer once it has one. */
export interface Answered {
  /** The answer's words: a string result whole, a list's text blocks joined, any other block as JSON. */
  answer?: string;
  id: string;
}

/**
 * The newest tool call `picks` takes in an Anthropic messages body, and the
 * `tool_result` whose `tool_use_id` is that call's id: never another call's
 * result (ToolSearch's `tool_reference` that loads the tool comes before it).
 * None: the body holds no such call.
 */
export const answerOf = (
  body: string,
  picks: (use: Block) => boolean
): Answered | undefined => {
  const parsed = JSON.parse(body) as { messages?: { content?: unknown }[] };
  const blocks = (parsed.messages ?? []).flatMap((message) =>
    Array.isArray(message.content) ? (message.content as Block[]) : []
  );
  const use = blocks.findLast(
    (block) => block.type === "tool_use" && picks(block)
  );
  if (!use?.id) {
    return;
  }
  const result = blocks.find(
    (block) => block.type === "tool_result" && block.tool_use_id === use.id
  );
  if (!result) {
    return { id: use.id };
  }
  const { content } = result;
  const answer =
    typeof content === "string"
      ? content
      : (Array.isArray(content) ? (content as Block[]) : [])
          .map((part) =>
            part.type === "text" ? (part.text ?? "") : JSON.stringify(part)
          )
          .join("\n");
  return { id: use.id, answer };
};

const isBrowse = (use: Block): boolean => use.name === BROWSE;
const isBash = (use: Block, words: string): boolean =>
  use.name === "Bash" && (use.input?.command ?? "").includes(words);
const loadsBrowse = (use: Block): boolean =>
  use.name === "ToolSearch" && JSON.stringify(use.input).includes(BROWSE);

/**
 * Step 5's read of B's artifact_browse over B's requests, oldest first: the
 * call's own answer, else why there is none.
 */
export const browseRead = (
  bodies: string[]
): { answer?: string; why: string } => {
  const calls = bodies.map((body) => answerOf(body, isBrowse));
  const answer = calls.find((one) => one?.answer !== undefined)?.answer;
  if (answer !== undefined) {
    return { answer, why: answer };
  }
  if (calls.some(Boolean)) {
    return { why: "B called artifact_browse and no answer came back" };
  }
  const loaded = bodies.some(
    (body) => answerOf(body, loadsBrowse)?.answer !== undefined
  );
  return {
    why: loaded
      ? "B loaded artifact_browse and never called it"
      : "B never loaded artifact_browse",
  };
};

/** A private address that is not the hub's: B's boundary still refuses it. */
const LAN_ADDRESS = "192.168.255.254";
const PIN_ID = crypto.randomUUID();
const HANDOFF_FILE = "handoff-note.md";

const PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Handed</title></head><body><h1>Handed</h1><p id="here">${PAGE_TOKEN}</p></body></html>`;
const PANE = ':is([data-slot="preview-pane"], [data-side-card="preview"])';
const FRAME = `${PANE} iframe[title="Preview"]`;

/** How a brief or a handoff names its inputs (core `withInputsLine`). */
const INPUTS_LINE = "Your parent's inputs are in $TMPDIR/inputs/: ";

const say = (words: string): Reply => ({ everyMs: 5, words: [words] });
const call = (name: string, input: object): Reply => ({
  everyMs: 5,
  words: [],
  tool: { name, input },
});
/** A deferred tool is found first, then called. */
const found = (request: Seen, name: string, input: object): Reply => {
  if (request.toolNames.includes(name)) {
    return call(name, input);
  }
  return request.toolNames.includes("ToolSearch")
    ? call("ToolSearch", { query: `select:${name}`, max_results: 1 })
    : say(`${name} is not offered`);
};

/** The harnesses besides Claude Code whose parent calls `delegate` itself (step 7). */
const OTHERS = ["opencode", "pi"] as const;
type Other = (typeof OTHERS)[number];

/** Step 7 on one harness: its parent's and leaf's marks, the words handed, and where each is. */
interface OtherLeg {
  called: boolean;
  file: string;
  finished: boolean;
  leafTag: string;
  read: boolean;
  tag: string;
  token: string;
}

const otherLeg = (harness: Other): OtherLeg => ({
  tag: `PROBE-HANDED-${harness.toUpperCase()}-${RUN}`,
  leafTag: `PROBE-HANDED-${harness.toUpperCase()}-LEAF-${RUN}`,
  token: `handed-${harness}-${crypto.randomUUID()}`,
  file: `${harness}-note.md`,
  called: false,
  read: false,
  finished: false,
});

interface Progress {
  a: { finished: boolean; made: boolean; wrote: boolean };
  b: {
    finished: boolean;
    /** The hub's own port that serves no preview, on the pass's host: refused. */
    hubApi: string;
    opened: boolean;
    /** The preview's id, for B's artifact_browse of it. */
    preview: string;
    read: boolean;
    tried: boolean;
  };
  others: Record<Other, OtherLeg>;
  /** Step 9: the parent's delegate call, and the path it names. */
  refused: { called: boolean; path: string };
}

/** Where each mocked session is. */
const state: Progress = {
  a: { made: false, wrote: false, finished: false },
  refused: { called: false, path: "" },
  b: {
    read: false,
    opened: false,
    tried: false,
    finished: false,
    preview: "",
    hubApi: "",
  },
  others: { opencode: otherLeg("opencode"), pi: otherLeg("pi") },
};

/** Leaf A: hand its parent a canvas, then finish with a report. */
const leafA = (request: Seen): Reply => {
  if (state.a.finished) {
    return say("ok");
  }
  if (!state.a.made) {
    const reply = found(request, CREATE, {
      kind: "canvas",
      name: CANVAS,
      does: "judge",
      ask: "Judge this sketch",
      to: "parent",
      elements: [
        {
          type: "rectangle",
          id: BOX,
          x: 0,
          y: 0,
          width: 160,
          height: 60,
          label: { text: "Probe box" },
        },
      ],
    });
    state.a.made = reply.tool?.name === CREATE;
    return reply;
  }
  if (!state.a.wrote) {
    state.a.wrote = true;
    return call("Bash", {
      command: WRITE_BRIEFS,
      description: "Write the briefs",
    });
  }
  const headline = "Handed a canvas up.";
  const reply = found(request, FINISH, {
    headline,
    summary: `${headline}\n\n${REPORT_TOKEN}`,
  });
  state.a.finished = reply.tool?.name === FINISH;
  return reply;
};

/**
 * Leaf B: list its inputs and read the preview's file; open its pass, and
 * try a private address and the hub's own other port; ask artifact_browse
 * for the preview; work until the handoff's input is named, then finish.
 */
const leafB = (request: Seen): Reply => {
  if (state.b.finished) {
    return say("ok");
  }
  if (!state.b.read) {
    state.b.read = true;
    return call("Bash", {
      command: `cd "$TMPDIR/inputs" && ls -1 && cat artifact-${PREVIEW}.json`,
      description: "List the inputs and read the preview's",
    });
  }
  if (!state.b.opened) {
    state.b.opened = true;
    return call("Bash", {
      command: [
        `url=$(grep -o '"url": *"[^"]*"' "$TMPDIR/inputs/artifact-${PREVIEW}.json" | tail -1 | sed 's/.*"url": *"//; s/"$//')`,
        `curl -sSL -c "$TMPDIR/jar" -b "$TMPDIR/jar" "$url"`,
        // srt's own NO_PROXY names the private ranges (sandbox-utils.js
        // `generateProxyEnvVars`), so a plain curl dials the LAN directly,
        // where the sandbox's network namespace has no route; a client that
        // ignores NO_PROXY goes through the proxy, which refuses it.
        `echo; echo "lan-direct:$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 http://${LAN_ADDRESS}/)"`,
        `echo "lan:$(curl -s --noproxy '' -o /dev/null -w '%{http_code}' --max-time 15 http://${LAN_ADDRESS}/)"`,
        `echo "hub-api:$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 ${state.b.hubApi})"`,
      ].join("; "),
      description:
        "Open the preview's pass, and two addresses that stay refused",
    });
  }
  if (!state.b.tried) {
    const reply = found(request, BROWSE, { id: state.b.preview });
    state.b.tried = reply.tool?.name === BROWSE;
    return reply;
  }
  if (!request.all.includes(HANDOFF_FILE)) {
    return call("Bash", { command: "sleep 2", description: "Work" });
  }
  const headline = "Read every input.";
  const reply = found(request, FINISH, {
    headline,
    summary: `${headline}\n\nls and curl printed them.`,
  });
  state.b.finished = reply.tool?.name === FINISH;
  return reply;
};

/** Step 8's leaves: finish at once; the hub wrote their inputs before their brief. */
const leafShort = (request: Seen): Reply =>
  answerOf(request.body, (use) => use.name === FINISH)
    ? say("ok")
    : found(request, FINISH, { headline: "Done.", summary: "Done." });

/** Step 9's parent: one delegate call naming a path under ~/.ssh, then words. */
const refusedParent = (request: Seen, repo: string): Reply => {
  if (state.refused.called) {
    return say("The hub refused it.");
  }
  const reply = found(request, DELEGATE, {
    title: REFUSED_TITLE,
    prompt: "Read your input, then finish.",
    harness: "claude",
    model: MODEL.claude,
    cwd: repo,
    lands: "none",
    inputs: [state.refused.path],
  });
  state.refused.called = reply.tool?.name === DELEGATE;
  return reply;
};

/** `delegate` as pi offers it: its own name, else as an MCP name. */
const piDelegate = (request: Seen): string | undefined =>
  request.toolNames.find((name) =>
    ["delegate", "mcp__cawco__delegate", "cawco_delegate"].includes(name)
  );

/** A parent on `harness`: one `delegate` call with a text input, as that harness offers the tool. */
const otherParent = (
  request: Seen,
  harness: Other,
  leg: OtherLeg,
  repo: string
): Reply => {
  const direct = harness === "pi" ? piDelegate(request) : undefined;
  const codeMode =
    harness === "opencode" && request.toolNames.includes(CODE_MODE);
  if (leg.called || !(direct || codeMode)) {
    return say(leg.called ? "Delegated." : "No delegate tool is offered.");
  }
  leg.called = true;
  const input = {
    title: `Handed inputs ${harness} ${RUN}`,
    prompt: `${leg.leafTag}: read your input, then finish.`,
    harness: "claude",
    model: MODEL.claude,
    cwd: repo,
    lands: "none",
    inputs: [{ text: leg.token, name: leg.file }],
  };
  return direct
    ? call(direct, input)
    : call(CODE_MODE, {
        code: `return await tools.cawco.delegate(${JSON.stringify(input)});`,
      });
};

/** That parent's leaf: read its input, then finish. */
const otherLeaf = (request: Seen, leg: OtherLeg): Reply => {
  if (leg.finished) {
    return say("ok");
  }
  if (!leg.read) {
    leg.read = true;
    return call("Bash", {
      command: `cat "$TMPDIR/inputs/${leg.file}"`,
      description: "Read the input",
    });
  }
  const reply = found(request, FINISH, {
    headline: "Read the input.",
    summary: "Read the input.",
  });
  leg.finished = reply.tool?.name === FINISH;
  return reply;
};

interface Started {
  instanceId: string;
  workItemId: string;
  workspaceId: string;
  workspaceTmp: string;
}

const workspaceCount = (fleet: KitFleet): number =>
  fleet.query<{ n: number }>("SELECT COUNT(*) AS n FROM workspaces")[0]?.n ?? 0;

const ended = (fleet: KitFleet, workItemId: string) =>
  until(
    `item ${workItemId} ended`,
    () =>
      fleet.query<{ state: string; result: string | null }>(
        "SELECT state, result FROM work_items WHERE id = ?",
        workItemId
      )[0],
    (row) => ["done", "failed", "cancelled"].includes(row.state),
    300_000
  ).catch(() => undefined);

/** The parent's own credential, as its tools call the hub with it. */
const credentialOf = async (fleet: KitFleet, parent: string): Promise<string> =>
  (await Bun.file(`/proc/${await fleet.sessionPid(parent)}/environ`).text())
    .split("\0")
    .find((line) => line.startsWith("CAWCO_SESSION_CREDENTIAL="))
    ?.slice("CAWCO_SESSION_CREDENTIAL=".length) ?? "";

const pageFrame = async (page: Page): Promise<Frame> =>
  (await until(
    "the page in the pane",
    async () =>
      (await (await page.locator(FRAME).elementHandle())?.contentFrame()) ??
      null,
    Boolean,
    60_000
  )) as Frame;

/** The person's pin on the page, written in its own doc as the overlay writes one, then the agent's reply in its thread. */
const pinned = async (
  kit: Kit,
  fleet: KitFleet,
  parent: string,
  pageId: string
): Promise<void> => {
  const base = await fleet.dashboard();
  const page = await kit.page("desk");
  await open(
    page,
    `${base}/artifact/${pageId}`,
    `${PANE} [data-slot="comments"]`
  );
  const frame = await pageFrame(page);
  await frame.waitForFunction(
    () =>
      !!document.querySelector("#here") &&
      !!(window as unknown as { cawcoArtifact?: { doc?: unknown } })
        .cawcoArtifact?.doc
  );
  const at = new Date().toISOString();
  await writePagePins(frame, {
    id: PIN_ID,
    number: 1,
    kind: "comment",
    anchor: { selector: "#here", source: null, text: "the paragraph" },
    at,
    by: "person",
    elements: [],
    point: { x: 0.5, y: 0.5 },
    thread: [{ id: `${PIN_ID}-1`, by: "person", text: PIN_WORDS, at }],
  });
  await until(
    "the hub holding the pin",
    () =>
      fleet.api<{ artifacts: { pins: { id: string }[] }[] }>(
        `/api/instances/${parent}/artifacts/comments?artifact=${pageId}&filter=all`
      ),
    (read) =>
      read.artifacts.some((one) => one.pins.some((pin) => pin.id === PIN_ID)),
    30_000
  );
  await fleet.api(
    `/api/instances/${parent}/artifacts/comments/${PIN_ID}/reply`,
    { text: REPLY_WORDS }
  );
  await page.close();
};

/** The person's message to the parent, carrying a picture, as the composer sends one. */
const sendPicture = async (fleet: KitFleet, parent: string): Promise<void> => {
  await fleet.post({
    type: "command",
    commandId: crypto.randomUUID(),
    kind: "send",
    machineId: MACHINE,
    sessionId: parent,
    payload: {
      instanceId: parent,
      message: {
        type: "user",
        uuid: crypto.randomUUID(),
        message: {
          role: "user",
          content: [
            { type: "text", text: "Here is the picture." },
            {
              type: "image",
              source: {
                type: "base64",
                media_type: "image/png",
                data: PICTURE.toString("base64"),
              },
            },
          ],
        },
        parent_tool_use_id: null,
        origin: { kind: "human" },
      },
    },
  });
  await until(
    "the picture among the parent's attachments",
    () =>
      fleet.api<{ attachments: { name: string }[] }>(
        `/api/instances/${parent}/attachments`
      ),
    (read) => read.attachments.some((one) => one.name === "Picture 1"),
    60_000
  );
};

/** Each entry that names nothing the parent may read is refused in words naming it, and cuts nothing. */
const refuses = async (
  { check }: Kit,
  fleet: KitFleet,
  delegate: (inputs: unknown[]) => Promise<Started>
): Promise<void> => {
  const cases: [string, unknown, string][] = [
    [
      "a report of no item",
      { report: "no-such-item" },
      '{ report: "no-such-item" } names no work item',
    ],
    [
      "an artifact the parent has none of",
      { artifact: "00000000-0000-4000-8000-000000000000" },
      '{ artifact: "00000000-0000-4000-8000-000000000000" }: This session has no artifact',
    ],
    ["an entry of no shape", { wat: "x" }, "is none of the shapes it takes"],
  ];
  for (const [what, entry, words] of cases) {
    const before = workspaceCount(fleet);
    // biome-ignore lint/performance/noAwaitInLoops: one refusal after another, each counted against the workspaces before it
    const refused = await delegate([entry]).then(
      () => "started",
      (error: unknown) => String(error)
    );
    check(
      `3: ${what} is refused at delegate time, in words naming it`,
      refused.includes(": 400 ") && refused.includes(words),
      refused.slice(0, 400)
    );
    check(
      `3: ${what}: the refused delegate cut no workspace`,
      workspaceCount(fleet) === before,
      `${before} before, ${workspaceCount(fleet)} after`
    );
  }
};

/** Every handed file in B's inputs, under its name, with what it should hold. */
const landed = async (
  { check }: Kit,
  started: Started,
  reportOf: string
): Promise<void> => {
  const dir = join(started.workspaceTmp, "inputs");
  const bytes = (name: string) =>
    readFile(join(dir, name)).catch(() => Buffer.alloc(0));
  const text = async (name: string) => (await bytes(name)).toString("utf8");
  const report = await text(`report-${reportOf.slice(0, 8)}.md`);
  check(
    "4: A's report lands as report-<item>.md with its words",
    report.includes(REPORT_TOKEN) && report.includes("Handed a canvas up."),
    report.slice(0, 300) || "missing"
  );
  const html = await text(`artifact-${PAGE_NAME}.html`);
  const picks = await text(`artifact-${PAGE_NAME}.json`);
  check(
    "4: the page lands as its HTML and its picks file",
    html.includes(PAGE_TOKEN) && picks.includes('"state"'),
    `${html.slice(0, 120)} | ${picks.slice(0, 120)}`
  );
  const pins = await text(`pins-${PAGE_NAME}.json`);
  check(
    "4: the page's pins land with the person's words and the agent's reply in the thread",
    pins.includes(PIN_ID) &&
      pins.includes(PIN_WORDS) &&
      pins.includes(REPLY_WORDS),
    pins.slice(0, 400) || "missing"
  );
  const scene = await text(`artifact-${CANVAS}.excalidraw`);
  const picture = await bytes(`artifact-${CANVAS}.png`);
  check(
    "4: the canvas lands as its scene, holding its rectangle, and its PNG",
    scene.includes(`"${BOX}"`) &&
      picture.subarray(0, 4).equals(PNG_SIGNATURE) &&
      picture.length > 100,
    `scene ${scene.length} chars, ${scene.includes(BOX) ? "with" : "without"} ${BOX}; png ${picture.length} bytes`
  );
  const pasted = await bytes("attachment-Picture-1.png");
  check(
    "4: the person's picture lands as attachment-Picture-1.png, its bytes as sent",
    pasted.equals(PICTURE),
    `${pasted.length} bytes`
  );
  check(
    "4: the inline text lands under its name",
    (await text("notes.md")) === TEXT_TOKEN
  );
  check(
    "4: the blob lands under its name, its bytes as sent",
    (await bytes("blob.bin")).equals(BLOB)
  );
};

/**
 * Step 5: the preview lands with a pass; B's curl of it from inside its
 * workspace gets the folder's page, its artifact_browse answers an address,
 * and a private address and the hub's own other port stay refused (403).
 */
const previewReach = async (
  { check }: Kit,
  fleet: KitFleet,
  b: Started
): Promise<void> => {
  const landedFile = await readFile(
    join(b.workspaceTmp, "inputs", `artifact-${PREVIEW}.json`),
    "utf8"
  ).catch(() => "");
  let said: { pass?: { url?: string } | null; reach?: string } = {};
  try {
    said = JSON.parse(landedFile) as typeof said;
  } catch {
    said = {};
  }
  check(
    "5: the preview lands with a pass, on the hub machine's tailnet origin",
    typeof said.pass?.url === "string",
    said.reach ?? (landedFile.slice(0, 400) || "missing")
  );
  const tried = await until(
    "B's curls",
    () =>
      fleet.seen
        .filter((one) => one.all.includes(TAG_B))
        .map((one) => answerOf(one.body, (use) => isBash(use, "hub-api:")))
        .find((one) => one?.answer !== undefined),
    Boolean,
    180_000
  ).catch(() => undefined);
  const said5 = tried?.answer ?? "";
  check(
    "5: the preview's pass, opened from inside B's workspace, serves the folder's page",
    said5.includes(PREVIEW_TOKEN),
    tried
      ? `B's curl answered without the page's words: ${said5.slice(0, 300)}`
      : "no curl answer"
  );
  check(
    "5: a private address that is not the hub's stays refused from inside B's workspace: no route dialed direct, 403 through the proxy",
    said5.includes("lan-direct:000") && said5.includes("lan:403"),
    `${said5.match(LAN_DIRECT_CODE)?.[0] ?? "no direct answer"}; ${said5.match(LAN_CODE)?.[0] ?? "no proxied answer"}`
  );
  check(
    "5: the hub's own port that serves no preview stays refused from inside B's workspace",
    said5.includes("hub-api:403"),
    said5.match(HUB_API_CODE)?.[0] ?? "no answer"
  );
  const bodiesOfB = () =>
    fleet.seen.filter((one) => one.all.includes(TAG_B)).map((one) => one.body);
  const browsed = await until(
    "B's artifact_browse of the preview, answered",
    () => browseRead(bodiesOfB()),
    (read) => read.answer !== undefined,
    120_000
  ).catch(() => browseRead(bodiesOfB()));
  check(
    "5: B's artifact_browse of the preview, from inside its workspace, answers an address",
    // Its words (hub presenters/artifacts.ts `artifactBrowsedWords`): the address to load.
    browsed.answer !== undefined &&
      BROWSE_ADDRESS.test(browsed.answer) &&
      !browsed.answer.includes(
        "a workspace's boundary reaches public hosts only"
      ),
    browsed.why.slice(0, 300)
  );
};

/** Step 7 on `harness`: its parent delegates with a text input; the leaf's brief names the file and its Bash reads the words. */
const otherHarness = async (
  { check }: Kit,
  fleet: KitFleet,
  harness: Other,
  repo: string,
  projectId: string
): Promise<void> => {
  const leg = state.others[harness];
  const parent = await fleet.spawn(harness, `${harness} parent`, repo, {
    projectId,
  });
  await fleet.send(parent, `${leg.tag}: delegate with a text input.`);
  const brief = await until(
    `the ${harness} parent's leaf's brief`,
    () =>
      fleet.seen.find(
        (one) => one.tools && one.all.includes(leg.leafTag) && !one.afterTool
      ),
    Boolean,
    180_000
  ).catch(() => undefined);
  check(
    `7: ${harness}'s delegate call with a { text, name } input starts a leaf whose brief names the file`,
    !!brief && brief.all.includes(`${INPUTS_LINE}${leg.file}`),
    brief
      ? `${brief.all.includes(`${INPUTS_LINE}${leg.file}`) ? "names" : "does not name"} ${leg.file}`
      : `no brief (delegate called: ${leg.called})`
  );
  const read = await until(
    `the ${harness} parent's leaf read its input`,
    () =>
      fleet.seen
        .filter((one) => one.all.includes(leg.leafTag))
        .map((one) => answerOf(one.body, (use) => isBash(use, leg.file)))
        .find((one) => one?.answer !== undefined),
    Boolean,
    120_000
  ).catch(() => undefined);
  check(
    `7: the leaf reads the ${harness} parent's words from $TMPDIR/inputs/`,
    read?.answer?.includes(leg.token) === true,
    read ? (read.answer ?? "").slice(0, 300) : "the leaf's cat answered nothing"
  );
};

/** A leaf's file in its `$TMPDIR/inputs/`, by its path there, once written; "" when it never is. */
const inputText = async (started: Started, path: string): Promise<string> => {
  const file = join(started.workspaceTmp, "inputs", path);
  const read = () => readFile(file, "utf8").catch(() => "");
  return await until(`inputs/${path}`, read, Boolean, 60_000).catch(read);
};

/**
 * Step 8: each call the hub refused on 2026-10-24, sent again as it was, is
 * accepted, and its files land in the leaf's inputs with their folders.
 */
const refusedBefore = async (
  { check }: Kit,
  fleet: KitFleet,
  {
    a,
    parent,
    previewId,
    delegate,
  }: {
    a: Started;
    delegate: (inputs: unknown[]) => Promise<Started>;
    parent: string;
    previewId: string;
  }
): Promise<void> => {
  const tried = (inputs: unknown[]) =>
    delegate(inputs).then(
      (started) => ({ started, refused: "" }),
      (error: unknown) => ({ started: undefined, refused: String(error) })
    );

  // A short session id.
  const bySession = await tried([{ report: a.instanceId.slice(0, 8) }]);
  const report = bySession.started
    ? await inputText(
        bySession.started,
        `report-${a.workItemId.slice(0, 8)}.md`
      )
    : "";
  check(
    "8: { report: <session's 8-character short id> } is accepted and lands A's report",
    report.includes(REPORT_TOKEN),
    bySession.refused.slice(0, 300) || report.slice(0, 200) || "missing"
  );

  // A folder.
  const folder = join(fleet.sandbox, "handed-folder");
  await mkdir(join(folder, "deep"), { recursive: true });
  const top = `folder-top-${crypto.randomUUID()}`;
  const deep = `folder-deep-${crypto.randomUUID()}`;
  await writeFile(join(folder, "top.md"), top);
  await writeFile(join(folder, "deep", "inner.md"), deep);
  const byFolder = await tried([folder]);
  const folderFiles = byFolder.started
    ? [
        await inputText(byFolder.started, "handed-folder/top.md"),
        await inputText(byFolder.started, "handed-folder/deep/inner.md"),
      ]
    : [];
  check(
    "8: a folder path is accepted and lands as inputs/<folder>/…, its subfolder kept",
    folderFiles[0] === top && folderFiles[1] === deep,
    byFolder.refused.slice(0, 300) || JSON.stringify(folderFiles)
  );

  // An item's assets, nested a folder down, by the item's short id.
  const key = a.workItemId.slice(0, 8);
  const byAssets = await tried([{ assets: key }]);
  const assets = byAssets.started
    ? await Promise.all(
        Object.keys(BRIEFS).map((path) =>
          inputText(byAssets.started as Started, `assets/${key}/${path}`)
        )
      )
    : [];
  check(
    "8: { assets: <item's short id> } of nested outputs is accepted and lands every file at its folder path",
    Object.values(BRIEFS).every((body, at) => assets[at] === body),
    byAssets.refused.slice(0, 300) || JSON.stringify(assets)
  );

  // A decision page's Preview naming an artifact by its short id.
  const page = await fleet
    .api<{ id: string }>(`/api/instances/${parent}/artifacts`, {
      kind: "page",
      does: "pick",
      ask: "Pick the page",
      name: `probe-short-preview-${RUN}`,
      program: `root = Decisions("Keep the page", [keep])
keep = Decision("keep", "Keep the served page?", [yes, no], "It is the one served.")
yes = Option("yes", "Keep it", "It shows the folder.", true, [live], "Nothing more.")
no = Option("no", "Redo it", "A new page.", false, [], "Another round.")
live = Preview("${previewId.slice(0, 8)}", "The served page")`,
    })
    .then(
      (made) => made.id,
      (error: unknown) => `refused: ${String(error)}`
    );
  check(
    "8: a decision program's Preview naming an artifact by its short id is accepted",
    !page.startsWith("refused"),
    page.slice(0, 300)
  );
};

/** The tray's failed count as drawn: its "N failed" chip's number, else 1 for a lone failure chip, else 0. */
const trayFailed = (page: Page): Promise<number> =>
  page.evaluate(() => {
    const row = document.querySelector('[data-slot="tray"] [data-slot="row"]');
    const counted = row
      ?.querySelector('[data-delegate-tray-count] [data-slot="num"]')
      ?.textContent?.trim();
    if (counted) {
      return Number(counted);
    }
    return (
      row?.querySelectorAll('[data-delegate-tray-tone="failed"][data-end]')
        .length ?? 0
    );
  });

/**
 * Step 9: the parent's own delegate call naming a path under `~/.ssh`. The
 * hub refuses it; no work item comes of it; the transcript draws it as the
 * plain tool row with its error, no delegate card; the tray's failed count
 * stays as it was.
 */
const stillRefused = async (
  kit: Kit,
  fleet: KitFleet,
  parent: string,
  home: string
): Promise<void> => {
  const { check } = kit;
  await mkdir(join(home, ".ssh"), { recursive: true });
  state.refused.path = join(home, ".ssh", "id_probe");
  await writeFile(state.refused.path, "not a key");
  const base = await fleet.dashboard();
  const page = await kit.page("desk");
  await open(
    page,
    `${base}/session/${parent}`,
    `[data-session-row="${parent}"]`,
    120_000
  );
  const before = await trayFailed(page);
  const cards = await page.locator("[data-delegate-tone]").count();
  await fleet.send(parent, `${TAG_REFUSED}: delegate with a key as input.`);
  const answered = await until(
    "the parent's delegate call, answered",
    () =>
      fleet.seen
        .filter((one) => one.all.includes(TAG_REFUSED))
        .map((one) => answerOf(one.body, (use) => use.name === DELEGATE))
        .find((one) => one?.answer !== undefined),
    Boolean,
    120_000
  ).catch(() => undefined);
  check(
    "9: the parent's delegate call naming a path under ~/.ssh is refused",
    (answered?.answer ?? "").includes(".ssh"),
    (answered?.answer ?? "no answer").slice(0, 300)
  );
  const rows = fleet.query<{ n: number }>(
    "SELECT COUNT(*) AS n FROM work_items WHERE title = ?",
    REFUSED_TITLE
  )[0]?.n;
  check(
    "9: no work item comes of the refused call",
    rows === 0,
    `${rows} rows`
  );
  const errorRow = page.locator(
    '[data-slot="tools"] [data-slot="row"][data-err]'
  );
  await errorRow
    .first()
    .waitFor({ state: "attached", timeout: 60_000 })
    .catch(() => undefined);
  const drawn = await errorRow.count();
  const after = await page.locator("[data-delegate-tone]").count();
  check(
    "9: the transcript draws the refused call as the plain tool row with its error, no delegate card",
    drawn > 0 && after === cards,
    `${drawn} error rows; delegate cards ${cards} before, ${after} after`
  );
  const failedAfter = await trayFailed(page);
  check(
    "9: the tray's failed count is unchanged",
    failedAfter === before,
    `${before} before, ${failedAfter} after`
  );
  await page.close();
};

/**
 * Step 10 for one form: a working leaf, named `written(id, folder)`, is
 * reached by handoff (its words reach it), interrupt, answer and stop (each
 * answer names it; the stop cancels its item), and find's `around` reads it.
 */
const reachedAs = async (
  { check }: Kit,
  fleet: KitFleet,
  session: ToolSession,
  form: string,
  written: (id: string, folder: string) => string,
  delegate: (tag: string) => Promise<Started>
): Promise<void> => {
  const tag = `${TAG_FORM} ${form}`;
  const leaf = await delegate(tag);
  const id8 = leaf.instanceId.slice(0, 8);
  const cwd =
    fleet.query<{ cwd: string }>(
      "SELECT cwd FROM instances WHERE id = ?",
      leaf.instanceId
    )[0]?.cwd ?? "";
  const target = written(leaf.instanceId, cwd.split("/").at(-1) ?? "");
  await until(
    `the ${form} leaf working`,
    () => fleet.seen.find((one) => one.all.includes(tag)),
    Boolean,
    180_000
  ).catch(() => undefined);
  const token = `forms-handoff-${crypto.randomUUID()}`;
  const handed = await toolWords(session, "handoff", {
    target,
    message: token,
  });
  const reached = await until(
    `the handoff named by ${form}, read by its leaf`,
    () =>
      fleet.seen.find(
        (one) => one.all.includes(tag) && one.all.includes(token)
      ),
    Boolean,
    120_000
  ).catch(() => undefined);
  check(
    `10: handoff to ${form} (${target}) reaches that leaf`,
    !handed.refused && !!reached,
    `${handed.status} ${handed.text.slice(0, 200)}${reached ? "" : "; its leaf never read it"}`
  );
  const names = async (tool: string, args: Record<string, unknown>) => {
    const answer = await toolWords(session, tool, { target, ...args });
    check(
      `10: ${tool} to ${form} (${target}) names that leaf`,
      !answer.refused && answer.text.includes(id8),
      `${answer.status} ${answer.text.slice(0, 200)}`
    );
  };
  await names("interrupt_delegate", {});
  await names("answer_delegate", { requestId: `probe-${id8}`, deny: true });
  const around = await toolRecord<{ around?: { id?: string } }>(
    session,
    "find",
    { around: target }
  );
  check(
    `10: find's around ${form} (${target}) reads that session`,
    !around.refused && around.record.around?.id === leaf.instanceId,
    around.refused
      ? around.text.slice(0, 200)
      : JSON.stringify(around.record.around ?? null)
  );
  await names("stop_delegate", {});
  const stopped = await ended(fleet, leaf.workItemId);
  check(
    `10: stop_delegate to ${form} cancels that leaf's item`,
    stopped?.state === "cancelled",
    stopped?.state ?? "still running"
  );
};

const spec: Spec = {
  name: "handed-inputs",
  host: "it delegates, so its fleet cuts workspaces",
  run: async (kit: Kit) => {
    const { check } = kit;
    let repo = "";
    const fleet = await kit.fleet((request) => {
      if (!request.tools) {
        return say("Probe title");
      }
      for (const harness of OTHERS) {
        const leg = state.others[harness];
        if (request.all.includes(leg.leafTag)) {
          return otherLeaf(request, leg);
        }
        if (request.all.includes(leg.tag)) {
          return otherParent(request, harness, leg, repo);
        }
      }
      if (request.all.includes(TAG_FORM)) {
        // Working until it is stopped, so every tool finds it running.
        return call("Bash", { command: "sleep 3", description: "Work" });
      }
      if (request.all.includes(TAG_REFUSED)) {
        return refusedParent(request, repo);
      }
      if (request.all.includes(TAG_SHORT)) {
        return leafShort(request);
      }
      if (request.all.includes(TAG_B)) {
        return leafB(request);
      }
      if (request.all.includes(TAG_A)) {
        return leafA(request);
      }
      return say("ok");
    });
    const home = fleet.env.HOME as string;
    fleet.launch("sessiond");
    await fleet.sessiondUp();
    fleet.launch("hub");
    await fleet.hubUp();
    fleet.fileAccount();
    fleet.launch("agent");
    await fleet.agentUp();
    await fleet.accountSignedIn();
    repo = join(fleet.sandbox, "src");
    await mkdir(repo, { recursive: true });
    await writeFile(
      join(home, ".gitconfig"),
      "[user]\n\tname = Owner\n\temail = owner@probe.test\n"
    );
    await Bun.$`sh -c ${"git init -q -b main && echo handed > README.md && git add -A && git commit -qm 'First commit'"}`
      .cwd(repo)
      .env({ ...process.env, HOME: home })
      .quiet();
    const project = await fleet.api<{ id: string }>("/api/projects", {
      name: "Handed inputs",
      machineId: MACHINE,
      cwd: repo,
    });
    const parent = await fleet.spawn("claude", "Parent", repo, {
      projectId: project.id,
    });
    const delegate = (tag: string, inputs: unknown[], outputs?: string[]) =>
      fleet.api<Started>("/api/work-items", {
        parentInstanceId: parent,
        title: "Handed inputs probe",
        prompt: `${tag}: do your part, then finish.`,
        harness: "claude",
        model: MODEL.claude,
        cwd: repo,
        lands: "none",
        inputs,
        ...(outputs ? { outputs } : {}),
      });

    // 1. Leaf A hands a canvas up, writes its briefs and reports.
    const a = await delegate(TAG_A, [], ["design-briefs/"]);
    const aEnded = await ended(fleet, a.workItemId);
    check(
      "1: leaf A finishes with its report",
      aEnded?.state === "done" && (aEnded.result ?? "").includes(REPORT_TOKEN),
      `${aEnded?.state}: ${(aEnded?.result ?? "").slice(0, 300)}`
    );
    const canvasId =
      fleet.query<{ id: string }>(
        "SELECT id FROM artifacts WHERE name = ?",
        CANVAS
      )[0]?.id ?? "";
    const drawn = await until(
      "the canvas's picture",
      () => fetch(`${fleet.base}/api/artifacts/${canvasId}/thumbnail/light`),
      (picture) => picture.ok,
      60_000
    ).catch(() => undefined);
    check(
      "1: the canvas A handed up is drawn on the hub machine's screen",
      !!canvasId && drawn?.ok === true,
      `${canvasId || "no canvas"}: ${drawn?.status ?? "no picture"}`
    );

    // 2. A page with a pin and its reply, a preview of a folder, a picture.
    const pageId = (
      await fleet.api<{ id: string }>(`/api/instances/${parent}/artifacts`, {
        kind: "page",
        does: "judge",
        ask: "Judge this page",
        name: PAGE_NAME,
        html: PAGE,
      })
    ).id;
    const served = join(fleet.sandbox, "served");
    await mkdir(served, { recursive: true });
    await writeFile(
      join(served, "index.html"),
      `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Served</title></head><body><p>${PREVIEW_TOKEN}</p></body></html>`
    );
    const previewId = (
      await fleet.api<{ id: string }>(`/api/instances/${parent}/artifacts`, {
        kind: "preview",
        does: "try",
        ask: "Try this page",
        name: PREVIEW,
        dir: served,
      })
    ).id;
    state.b.preview = previewId;
    // The address the parent, outside every workspace, is handed.
    const { url: passUrl } = await fleet.api<{ url: string }>(
      `/api/instances/${parent}/artifacts/${previewId}/browse`,
      {}
    );
    // The hub's own port, which serves no preview, on the pass's host.
    state.b.hubApi = `http://${new URL(passUrl).hostname}:${new URL(fleet.base).port}/`;
    await pinned(kit, fleet, parent, pageId);
    await sendPicture(fleet, parent);

    // 3. Refusals.
    await refuses(kit, fleet, (inputs) => delegate(TAG_B, inputs));

    // 4. Leaf B is handed everything by name.
    const b = await delegate(TAG_B, [
      { report: a.workItemId },
      { artifact: pageId },
      { pins: pageId },
      { artifact: canvasId },
      { artifact: previewId },
      { attachment: "Picture 1" },
      { text: TEXT_TOKEN, name: "notes.md" },
      { blob: BLOB.toString("base64"), name: "blob.bin" },
    ]);
    const brief = await until(
      "leaf B's brief",
      () =>
        fleet.seen.find(
          (one) => one.tools && one.all.includes(TAG_B) && !one.afterTool
        ),
      Boolean,
      180_000
    ).catch(() => undefined);
    const names = [
      `report-${a.workItemId.slice(0, 8)}.md`,
      `artifact-${PAGE_NAME}.html`,
      `pins-${PAGE_NAME}.json`,
      `artifact-${CANVAS}.excalidraw`,
      `artifact-${CANVAS}.png`,
      `artifact-${PREVIEW}.json`,
      "attachment-Picture-1.png",
      "notes.md",
      "blob.bin",
    ];
    check(
      "4: B's brief names every handed file in $TMPDIR/inputs/",
      !!brief &&
        brief.all.includes(INPUTS_LINE) &&
        names.every((name) => brief.all.includes(name)),
      brief
        ? `missing: ${names.filter((name) => !brief.all.includes(name)).join(", ") || "none"}`
        : "no brief"
    );
    await landed(kit, b, a.workItemId);

    // 5. The preview as B's workspace reaches it.
    await previewReach(kit, fleet, b);

    // 6. The parent's handoff tool takes a { text, name } input.
    const handed = await toolWords(
      {
        base: fleet.base,
        id: parent,
        credential: await credentialOf(fleet, parent),
      },
      "handoff",
      {
        target: b.instanceId,
        message: `${TAG_B}: one more input.`,
        inputs: [{ text: HANDOFF_TOKEN, name: HANDOFF_FILE }],
      }
    );
    check(
      "6: the handoff tool takes a { text, name } input",
      !handed.refused,
      `${handed.status} ${handed.text.slice(0, 300)}`
    );
    const handedWords = await readFile(
      join(b.workspaceTmp, "inputs", HANDOFF_FILE),
      "utf8"
    ).catch(() => "");
    check(
      "6: the handoff's input is in B's $TMPDIR/inputs/",
      handedWords === HANDOFF_TOKEN,
      handedWords.slice(0, 120) || "missing"
    );
    const bEnded = await ended(fleet, b.workItemId);
    check(
      "6: B, told of the handoff's input, finishes",
      bEnded?.state === "done",
      `${bEnded?.state}: ${(bEnded?.result ?? "").slice(0, 300)}`
    );

    // 7. OpenCode and pi: each parent's own delegate call carries a text input.
    for (const harness of OTHERS) {
      // biome-ignore lint/performance/noAwaitInLoops: one harness's parent after the other, so the mock answers one leg at a time
      await otherHarness(kit, fleet, harness, repo, project.id);
    }

    // 8. The calls refused before, accepted now.
    await refusedBefore(kit, fleet, {
      a,
      parent,
      previewId,
      delegate: (inputs) => delegate(TAG_SHORT, inputs),
    });

    // 9. A call the hub must still refuse, as the parent's transcript draws it.
    await stillRefused(kit, fleet, parent, home);

    // 10. Every form of naming a session reaches the same one, through each tool.
    const session = {
      base: fleet.base,
      id: parent,
      credential: await credentialOf(fleet, parent),
    };
    for (const [form, written] of Object.entries(FORMS)) {
      // biome-ignore lint/performance/noAwaitInLoops: one leaf after another, each named one way
      await reachedAs(kit, fleet, session, form, written, (tag) =>
        delegate(tag, [])
      );
    }
  },
};

export default spec;
