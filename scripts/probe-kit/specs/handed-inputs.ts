/**
 * What a session hands another by name lands as files in the receiver's
 * `$TMPDIR/inputs/`, written by the hub, with no file the caller writes
 * (core handed-input.ts `HandedInput`, hub handed-inputs.ts
 * `createHandedInputs`, work-items.ts `readInputs` and `handIn`). On a
 * scratch fleet (real hub, agent and sessiond; Claude Code and OpenCode
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
 * 5. B's Bash opens the preview's pass from inside its workspace and gets
 *    the folder's page.
 * 6. The parent's `handoff` tool, called with a `{ text, name }` input,
 *    lands it in B's inputs and names it; B finishes.
 * 7. OpenCode: a parent there calls `delegate` (Code Mode) with a
 *    `{ text, name }` input; its leaf's brief names the file and its Bash
 *    reads the words.
 *
 * It delegates, so its fleet cuts workspaces: it runs on the host, outside
 * every boundary.
 *
 *   bun scripts/probe-kit/run.ts handed-inputs
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Frame, Page } from "playwright-core";
import {
  MACHINE,
  MODEL,
  type Reply,
  type Seen,
  until,
} from "../../scratch-fleet";
import { type Kit, type KitFleet, open, type Spec } from "../kit";

const RUN = crypto.randomUUID().slice(0, 8);
const TAG_A = `PROBE-HANDED-A-${RUN}`;
const TAG_B = `PROBE-HANDED-B-${RUN}`;
const TAG_OC = `PROBE-HANDED-OC-${RUN}`;
const TAG_OC_LEAF = `PROBE-HANDED-OC-LEAF-${RUN}`;
const FINISH = "mcp__cawco__finish_item";
const CREATE = "mcp__cawco__artifact_create";
/** OpenCode keeps MCP tools in Code Mode's catalog. */
const CODE_MODE = "execute";

const REPORT_TOKEN = `handed-report-${crypto.randomUUID()}`;
const PAGE_TOKEN = `handed-page-${crypto.randomUUID()}`;
const PREVIEW_TOKEN = `handed-preview-${crypto.randomUUID()}`;
const PIN_WORDS = `handed-pin-${crypto.randomUUID()}`;
const REPLY_WORDS = `handed-reply-${crypto.randomUUID()}`;
const TEXT_TOKEN = `handed-text-${crypto.randomUUID()}`;
const HANDOFF_TOKEN = `handed-handoff-${crypto.randomUUID()}`;
const OC_TOKEN = `handed-opencode-${crypto.randomUUID()}`;
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
const PIN_ID = crypto.randomUUID();
const HANDOFF_FILE = "handoff-note.md";
const OC_FILE = "oc-note.md";

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

interface Progress {
  a: { finished: boolean; made: boolean };
  b: { finished: boolean; read: boolean };
  oc: { called: boolean };
  ocLeaf: { finished: boolean; read: boolean };
}

/** Where each mocked session is. */
const state: Progress = {
  a: { made: false, finished: false },
  b: { read: false, finished: false },
  oc: { called: false },
  ocLeaf: { read: false, finished: false },
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
  const headline = "Handed a canvas up.";
  const reply = found(request, FINISH, {
    headline,
    summary: `${headline}\n\n${REPORT_TOKEN}`,
  });
  state.a.finished = reply.tool?.name === FINISH;
  return reply;
};

/** Leaf B: list its inputs and open the preview's pass, work until the handoff's input is named, then finish. */
const leafB = (request: Seen): Reply => {
  if (state.b.finished) {
    return say("ok");
  }
  if (!state.b.read) {
    state.b.read = true;
    return call("Bash", {
      command: `cd "$TMPDIR/inputs" && ls -1 && url=$(grep -o '"url": *"[^"]*"' artifact-${PREVIEW}.json | tail -1 | sed 's/.*"url": *"//; s/"$//') && curl -sSL -c "$TMPDIR/jar" -b "$TMPDIR/jar" "$url"`,
      description: "List the inputs and open the preview's pass",
    });
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

/** The OpenCode parent: one `delegate` call with a text input, through Code Mode. */
const ocParent = (request: Seen, repo: string): Reply => {
  if (state.oc.called || !request.toolNames.includes(CODE_MODE)) {
    return say("Delegated.");
  }
  state.oc.called = true;
  const input = {
    title: `Handed inputs OpenCode ${RUN}`,
    prompt: `${TAG_OC_LEAF}: read your input, then finish.`,
    harness: "claude",
    model: MODEL.claude,
    cwd: repo,
    lands: "none",
    inputs: [{ text: OC_TOKEN, name: OC_FILE }],
  };
  return call(CODE_MODE, {
    code: `return await tools.cawco.delegate(${JSON.stringify(input)});`,
  });
};

/** The OpenCode parent's leaf: read its input, then finish. */
const ocLeaf = (request: Seen): Reply => {
  if (state.ocLeaf.finished) {
    return say("ok");
  }
  if (!state.ocLeaf.read) {
    state.ocLeaf.read = true;
    return call("Bash", {
      command: `cat "$TMPDIR/inputs/${OC_FILE}"`,
      description: "Read the input",
    });
  }
  const reply = found(request, FINISH, {
    headline: "Read the input.",
    summary: "Read the input.",
  });
  state.ocLeaf.finished = reply.tool?.name === FINISH;
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
  await frame.evaluate(
    ({ id, words }) => {
      const { doc } = (
        window as unknown as {
          cawcoArtifact: {
            doc: {
              getMap: (n: string) => { set: (k: string, v: object) => void };
            };
          };
        }
      ).cawcoArtifact;
      const at = new Date().toISOString();
      doc.getMap("pins").set(id, {
        id,
        number: 1,
        kind: "comment",
        anchor: { selector: "#here", text: "the paragraph" },
        at,
        by: "person",
        elements: [],
        point: { x: 0.5, y: 0.5 },
        thread: [{ id: `${id}-1`, by: "person", text: words, at }],
      });
    },
    { id: PIN_ID, words: PIN_WORDS }
  );
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
  const preview = await text(`artifact-${PREVIEW}.json`);
  check(
    "4: the preview lands with a pass into it",
    preview.includes('"pass"') && preview.includes('"url"'),
    preview.slice(0, 400) || "missing"
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
      if (request.all.includes(TAG_OC_LEAF)) {
        return ocLeaf(request);
      }
      if (request.all.includes(TAG_OC)) {
        return ocParent(request, repo);
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
    const delegate = (tag: string, inputs: unknown[]) =>
      fleet.api<Started>("/api/work-items", {
        parentInstanceId: parent,
        title: "Handed inputs probe",
        prompt: `${tag}: do your part, then finish.`,
        harness: "claude",
        model: MODEL.claude,
        cwd: repo,
        lands: "none",
        inputs,
      });

    // 1. Leaf A hands a canvas up and reports.
    const a = await delegate(TAG_A, []);
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
      names.filter((name) => !brief?.all.includes(name)).join(", ") ||
        "no brief"
    );
    await landed(kit, b, a.workItemId);

    // 5. The preview's pass opens from inside B's workspace.
    const opened = await until(
      "B's curl of the preview's pass",
      () =>
        fleet.seen.find(
          (one) =>
            one.afterTool &&
            one.all.includes(TAG_B) &&
            one.body.includes(PREVIEW_TOKEN)
        ),
      Boolean,
      120_000
    ).catch(() => undefined);
    check(
      "5: the preview's pass, opened from inside B's workspace, serves the folder's page",
      opened !== undefined
    );

    // 6. The parent's handoff tool takes a { text, name } input.
    const response = await fetch(
      `${fleet.base}/api/delegation/call/${parent}`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${await credentialOf(fleet, parent)}`,
        },
        body: JSON.stringify({
          name: "handoff",
          arguments: {
            target: b.instanceId,
            message: `${TAG_B}: one more input.`,
            inputs: [{ text: HANDOFF_TOKEN, name: HANDOFF_FILE }],
          },
        }),
      }
    );
    check(
      "6: the handoff tool takes a { text, name } input",
      response.ok,
      `${response.status} ${(await response.text()).slice(0, 300)}`
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

    // 7. OpenCode: its delegate call carries a text input.
    const ocParentId = await fleet.spawn("opencode", "OpenCode parent", repo, {
      projectId: project.id,
    });
    await fleet.send(ocParentId, `${TAG_OC}: delegate with a text input.`);
    const ocBrief = await until(
      "the OpenCode parent's leaf's brief",
      () =>
        fleet.seen.find(
          (one) => one.tools && one.all.includes(TAG_OC_LEAF) && !one.afterTool
        ),
      Boolean,
      180_000
    ).catch(() => undefined);
    check(
      "7: OpenCode's delegate call with a { text, name } input starts a leaf whose brief names the file",
      !!ocBrief && ocBrief.all.includes(`${INPUTS_LINE}${OC_FILE}`),
      ocBrief ? "brief without the file" : "no brief"
    );
    const ocRead = await until(
      "the OpenCode parent's leaf read its input",
      () =>
        fleet.seen.find(
          (one) =>
            one.afterTool &&
            one.all.includes(TAG_OC_LEAF) &&
            one.body.includes(OC_TOKEN)
        ),
      Boolean,
      120_000
    ).catch(() => undefined);
    check(
      "7: the leaf reads the OpenCode parent's words from $TMPDIR/inputs/",
      ocRead !== undefined
    );
  },
};

export default spec;
