/**
 * Every artifact waiting on the person counts in Needs you, on every
 * surface that reads it, and leaves by a derived rule (core
 * artifact-needs.ts, hub artifacts/needs.ts). On a scratch fleet (real hub,
 * agent and sessiond; Claude Code against the mock model, with a stand-in
 * Cawrier and one paired phone), read from the hub's own answers
 * (`/api/artifact-needs`, `/api/pending`, a session's plan and artifacts,
 * the push the phone got), the dashboard's DOM and its boxes:
 *
 * Only open asks: an artifact is in Needs you only while it carries an ask
 * (a page to pick on or a canvas to judge, its ask line set), that ask is
 * still open, and the session that made it hasn't ended.
 * - a plain preview with no ask (a row made before asks were kept, as the
 *   live pile's were) and a `try` preview never stand in the lane or in
 *   Caw's panel, and Files still lists them;
 * - a judge canvas with an ask and a pick page with an ask stand in both;
 *   the pick page leaves once its picks are sent; Caw's head counts the
 *   rows his panel lists; in Chromium and WebKit.
 * - a decision page whose options show two judge canvases is one row, not
 *   three; a preview whose folder is deleted leaves the lane at its next
 *   start, still in Files.
 *
 * Reasons, each with its row line:
 * - not opened: a judge page shown and never opened is "New · not opened";
 *   `/api/pending` carries it in its `artifact.needs` envelope.
 * - picks unmade: a decision page is "0 of 3 picked", opened or not.
 * - unsent: a pick not sent is "1 of 3 picked · 1 unsent", Send counting 1;
 *   a pin goes by itself and asks nothing.
 * - an agent's reply on a pin of a page already answered asks nothing: it
 *   stays out of Needs you.
 * - a pin reply that asks (`comment_reply`'s `asks`) stands the artifact's
 *   row by itself: a plain reply adds no row and no push; one asking reply
 *   is the row "1 new answer on pin N" and one push under `artifact-<id>`,
 *   its `thread-id` the artifact's id, its sealed body the reply; three
 *   asking replies in a burst's window are the row "3 new answers" and one
 *   push saying so; the person's reply on one makes it 2, a resolve 1.
 *
 * Retirement:
 * - answered: a partial Send leaves the picks not made, once the session
 *   has read it; every pick sent, it leaves.
 * - the writer moved on: artifact_create of a pick page makes the session's
 *   current step wait on it (its plan's `waitsOn`); ticking that step takes
 *   it out. One made with no step in progress stands past its own turn's
 *   end, and leaves when the session's next turn ends: on Claude Code,
 *   OpenCode and pi alike, each calling the tool its own way.
 * - superseded: a same-name create revises it: one item, same id, its line
 *   in place.
 * - session ended: its conversation gone, it leaves Needs you and is one
 *   notice, "Claude Code ended; 2 picks on … never made".
 * - Not now: the row's notice id acknowledged, it leaves the lane and its
 *   Files list still says it waits; a revision brings it back.
 * - a look: opening a judge page clears "not opened"; a revision with
 *   nothing asked is the notice "… changed since you looked", and opening it
 *   clears it.
 *
 * Surfaces:
 * - Caw's head says the count of Needs you's rows and his rim draws as many
 *   arcs, artifacts among them.
 * - A session's Files card of a waiting artifact wears the needs-you dot
 *   centred on its picture's top-right corner, its reason on its meta line.
 * - The push of a turn that left an artifact waiting, on each harness:
 *   `artifact-<id>` in the turn push's place, the ask its sealed body,
 *   `cawco.kind` artifact, `CAWCO_TASK_OPEN` (Open only); a look at the
 *   artifact clears it.
 * - The artifact row's boxes at 390, 680 and 1440, in Chromium and WebKit,
 *   with one item and with many, a 40-word ask among them: nothing spills
 *   the list sideways, its lines stand in order inside the row, and its ✕
 *   and Send stand inside the row's trailing edge.
 *
 *   bun scripts/probe-kit/run.ts artifact-needs
 */
import {
  mkdirSync,
  readFileSync,
  readlinkSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import type { Page } from "playwright-core";
import {
  type ArtifactNeed,
  type ArtifactNeedNotice,
  type ArtifactNeedsRead,
  type ArtifactReason,
  noticePartWords,
  reasonLine,
  reasonShort,
  unparked,
} from "../../../packages/core/src/artifact-needs";
import type { Envelope } from "../../../packages/core/src/index";
import { artifactWords } from "../../../packages/core/src/words/artifacts";
import { cawHeadWords } from "../../../packages/core/src/words/caw-head";
import { commentWords } from "../../../packages/core/src/words/comments";
import {
  HARNESSES,
  type Harness,
  type Reply,
  type Seen,
  until,
} from "../../scratch-fleet";
import {
  type Engine,
  type Kit,
  type KitFleet,
  open,
  pressIn,
  ROOT,
  type Spec,
  settle,
  type View,
} from "../kit";

/** CawCo's tools by their own names: each harness offers them its way ({@link callTool}). */
const CREATE = "artifact_create";
const TODO = "todo_write";
/** OpenCode's code mode: its one tool runs code that calls the MCP servers' tools. */
const CODE_MODE = "execute";
const COMMAND = /PROBE-CALL:(\d+)/g;
const PANE = ':is([data-slot="preview-pane"], [data-side-card="preview"])';
const FRAME = `${PANE} iframe[title="Preview"]`;
/** The bar's Files item, by its name ("Files, 20"). */
const FILES_ITEM = /^Files/;
/** How long a lane change is waited for. */
const LANE_MS = 20_000;
/** How long the turn's push is waited for: the look grace, the burst's quiet, the stand-in. */
const PUSH_MS = 60_000;

/** A 40-word ask under the ask's 160 characters. */
const LONG_ASK =
  "Pick one of the two new heads for the app page so we can ship it to the app and the site and say why it is the one we want for all of the new pages we do next";

/** The kit page's example card, which each page's own cards replace. */
const EXAMPLE_CARD =
  /<article class="dp-card" id="example">[\s\S]*?<\/article>/;

/** The decision kit's page with one card per id, two options each. */
const kitPage = (title: string, cards: string[]): string =>
  readFileSync(
    join(ROOT, "packages/hub/skills/decision-page/kit/page.html"),
    "utf8"
  )
    .replace(
      EXAMPLE_CARD,
      cards
        .map(
          (card) => `<article class="dp-card" id="${card}">
    <header><h2>Which ${card}?</h2><span class="dp-state" data-dp-state="${card}">Not picked</span></header>
    <div class="dp-opts" data-cawco-choice="${card}" role="group" aria-label="Which ${card}?">
      <button class="dp-opt" type="button" data-option="${card}-a"><b>The first</b></button>
      <button class="dp-opt" type="button" data-option="${card}-b"><b>The second</b></button>
    </div>
  </article>`
        )
        .join("\n")
    )
    .replace("What is being decided", title);

/** A page to judge: a heading and paragraphs a pin can stand on. */
const judgePage = (title: string, lines: string[]): string =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${title}</title></head><body><h1>${title}</h1>${lines
    .map((line, i) => `<p id="line-${i + 1}">${line}</p>`)
    .join("")}</body></html>`;

/* ── The mock model: each numbered message calls one tool ─────────────── */

const asks = new Map<string, { input: object; name: string }>();
const issued = new Set<string>();
const answered = new Map<string, string>();
const text = (words: string): Reply => ({ everyMs: 5, words: [words] });

/**
 * Calls CawCo's tool `name` with `input` as the harness offers it: Claude
 * Code's `mcp__cawco__<name>` (found through ToolSearch first when it is
 * deferred), pi's own name for it, OpenCode's code mode. Answers the reply
 * and whether it is the call itself.
 */
const callTool = (
  request: Seen,
  name: string,
  input: object
): { called: boolean; reply: Reply } => {
  const call = (tool: string, args: object) => ({
    called: true,
    reply: { everyMs: 5, words: [], tool: { name: tool, input: args } },
  });
  const named = [`mcp__cawco__${name}`, `cawco_${name}`, name].find((one) =>
    request.toolNames.includes(one)
  );
  if (named) {
    return call(named, input);
  }
  if (request.toolNames.includes(CODE_MODE)) {
    return call(CODE_MODE, {
      code: `return await tools.cawco.${name}(${JSON.stringify(input)});`,
    });
  }
  if (!request.toolNames.includes("ToolSearch")) {
    return { called: false, reply: text(`${name} is not offered`) };
  }
  return {
    called: false,
    reply: {
      everyMs: 5,
      words: [],
      tool: {
        name: "ToolSearch",
        input: { query: `select:mcp__cawco__${name}`, max_results: 1 },
      },
    },
  };
};

const respond = (request: Seen): Reply => {
  if (!request.tools) {
    return text("Probe title");
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
  const { called, reply } = callTool(request, ask.name, ask.input);
  if (called) {
    issued.add(marker);
  }
  return reply;
};

/** The session's artifact of `name`, as its list on the hub names it: what a tool call made. */
const madeNamed = async (
  fleet: KitFleet,
  session: string,
  name: string
): Promise<string> =>
  (
    (await until(
      `${name} on the hub`,
      () =>
        fleet.api<{ id: string; name: string }[]>(
          `/api/instances/${session}/artifacts`
        ),
      (list) => list.some((one) => one.name === name),
      30_000
    ).catch(() => [])) as { id: string; name: string }[]
  ).find((one) => one.name === name)?.id ?? "";

/* ── The stand-in phone: every push Cawrier is handed, opened with its key ── */

interface Pushed {
  collapseId?: string;
  payload: {
    aps?: {
      alert?: { body?: string; title?: string };
      category?: string;
      "thread-id"?: string;
    };
    cawco?: { artifactId?: string; instanceId?: string; kind?: string };
    e?: string;
  };
}

const standInPhone = (fleet: KitFleet) => {
  const pushed: Pushed[] = [];
  const cawrier = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      if (new URL(request.url).pathname === "/v1/push") {
        pushed.push((await request.json()) as Pushed);
        return Response.json({ ok: true });
      }
      return new Response(null, { status: 204 });
    },
  });
  fleet.env.CAWCO_CAWRIER_ORIGIN = `http://127.0.0.1:${cawrier.port}`;
  const key = crypto.getRandomValues(new Uint8Array(32));
  return {
    pushed,
    pair: async (): Promise<void> => {
      await fleet.api("/api/push/register", {
        pairingId: crypto.randomUUID(),
        secret: Buffer.from(
          crypto.getRandomValues(new Uint8Array(32))
        ).toString("base64url"),
        key: Buffer.from(key).toString("base64"),
        name: "Probe iPhone",
        platform: "ios",
      });
    },
    /** A push's sealed alert, opened as the app's extension opens it (push.ts `seal`). */
    open: async (
      sealed: string
    ): Promise<{ body?: string; title?: string }> => {
      const bytes = Buffer.from(sealed, "base64");
      const opener = await crypto.subtle.importKey(
        "raw",
        key,
        "AES-GCM",
        false,
        ["decrypt"]
      );
      const plain = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: bytes.subarray(0, 12), tagLength: 128 },
        opener,
        bytes.subarray(12)
      );
      return JSON.parse(new TextDecoder().decode(plain));
    },
    stop: () => cawrier.stop(true),
  };
};

/* ── Reads ─────────────────────────────────────────────────────────────── */

interface At {
  base: string;
  /** Calls `tool` as session `session` through the mock model: its answer. */
  call: (session: string, tool: string, input: object) => Promise<string>;
  fleet: KitFleet;
  kit: Kit;
}

const lane = (fleet: KitFleet) =>
  fleet.api<ArtifactNeedsRead>("/api/artifact-needs");
const needOf = async (
  fleet: KitFleet,
  id: string
): Promise<ArtifactNeed | undefined> =>
  (await lane(fleet)).needs.find((need) => need.artifactId === id);
const noticeOf = async (
  fleet: KitFleet,
  id: string
): Promise<ArtifactNeedNotice | undefined> =>
  (await lane(fleet)).notices.find((notice) => notice.artifactId === id);
/** Its row line as the dashboard draws it, or null when it is not in Needs you (none, or put away with Not now). */
const lineOf = async (fleet: KitFleet, id: string): Promise<string | null> => {
  const need = await needOf(fleet, id);
  return need && !need.parked ? reasonLine(need.pending) : null;
};
/** Waits for artifact `id`'s line to read `line` (null: out of the lane); what it read last. */
const lineIs = (
  fleet: KitFleet,
  id: string,
  line: string | null,
  ms = LANE_MS
): Promise<string | null> =>
  until(
    `its line to read ${line}`,
    () => lineOf(fleet, id),
    (now) => now === line,
    ms
  ).catch(() => lineOf(fleet, id));

const create = async (
  fleet: KitFleet,
  session: string,
  input: Record<string, unknown>
): Promise<string> =>
  (
    await fleet.api<{ id: string }>(
      `/api/instances/${session}/artifacts`,
      input
    )
  ).id;

/** The artifact's own tab, its page ready in the pane. */
const ownTab = async (
  at: At,
  id: string,
  view: View = "desk"
): Promise<Page> => {
  const page = await at.kit.page(view);
  await open(page, `${at.base}/artifact/${id}`, FRAME);
  return page;
};

/** Runs `write` on the page's own doc, as the overlay writes the person's marks. */
const inDoc = async (
  page: Page,
  write: (doc: {
    getMap: (name: string) => {
      get: (key: string) => Record<string, unknown> | undefined;
      set: (key: string, value: object) => void;
    };
    transact: (change: () => void) => void;
  }) => void
): Promise<void> => {
  const frame = await until(
    "the page in the pane",
    async () =>
      (await (await page.locator(FRAME).elementHandle())?.contentFrame()) ??
      null,
    Boolean,
    60_000
  );
  if (!frame) {
    throw new Error("no page in the pane");
  }
  await frame.waitForFunction(
    () =>
      !!(window as unknown as { cawcoArtifact?: { doc?: unknown } })
        .cawcoArtifact?.doc,
    null,
    { timeout: 30_000 }
  );
  await frame.evaluate(`(${write.toString()})(window.cawcoArtifact.doc)`);
};

/* ── The legs ──────────────────────────────────────────────────────────── */

/** Not opened, and /api/pending: a judge page nobody opened. */
const notOpened = async (at: At, session: string): Promise<string> => {
  const { fleet, kit } = at;
  const id = await create(fleet, session, {
    kind: "page",
    does: "judge",
    ask: "Judge the routine form's states",
    name: "routine-form",
    html: judgePage("Routine form", ["Its schedule line.", "Its run line."]),
  });
  const line = await lineIs(fleet, id, artifactWords.notOpened);
  kit.check(
    "reason not opened: a judge page shown and never opened reads 'New · not opened'",
    line === artifactWords.notOpened,
    String(line)
  );
  const pending = await fleet.api<Envelope[]>("/api/pending");
  const envelope = pending.find(
    (one) => (one.payload as { kind?: string }).kind === "artifact.needs"
  );
  const carried = (
    envelope?.payload as { needs?: ArtifactNeed[] } | undefined
  )?.needs?.find((need) => need.artifactId === id);
  kit.check(
    "/api/pending carries it: one `artifact.needs` envelope from the hub, holding the item with its ask, reasons, raisedAt and href",
    envelope?.verb === "frames" &&
      envelope.machineId === "hub" &&
      carried?.ask === "Judge the routine form's states" &&
      carried.pending[0]?.kind === "unopened" &&
      typeof carried.raisedAt === "number" &&
      carried.href.startsWith(`/session/${session}?artifact=${id}`),
    JSON.stringify(envelope).slice(0, 600)
  );
  return id;
};

/** Picks unmade, unsent, and rule 1 (a partial answer, then a whole one). */
const picks = async (at: At, session: string) => {
  const { fleet, kit } = at;
  const id = await create(fleet, session, {
    kind: "page",
    does: "pick",
    ask: "Pick the home tile's three parts",
    name: "home-tile",
    html: kitPage("The home tile", ["shape", "color", "label"]),
  });
  const before = await lineIs(fleet, id, "0 of 3 picked");
  const page = await ownTab(at, id);
  await settle(page, 1500);
  const looked = await lineIs(fleet, id, "0 of 3 picked");
  kit.check(
    "reason picks unmade: a decision page reads '0 of 3 picked' before and after a look: a pick page's ask is its cards, never 'not opened'",
    before === "0 of 3 picked" && looked === "0 of 3 picked",
    `before the look: ${before}; after: ${looked}`
  );
  const frame = page.frameLocator(FRAME);
  await frame.locator('[data-option="shape-a"]').waitFor({ timeout: 60_000 });
  await pressIn(frame, '[data-option="shape-a"]');
  const unsent = await lineIs(fleet, id, "1 of 3 picked · 1 unsent");
  const need = await needOf(fleet, id);
  kit.check(
    "reason unsent: a pick not sent reads '1 of 3 picked · 1 unsent', its Send counting 1",
    unsent === "1 of 3 picked · 1 unsent" && need?.unsent === 1,
    `${unsent}; unsent ${need?.unsent}`
  );
  await pressIn(frame, "[data-dp-send]");
  const partial = await lineIs(fleet, id, "1 of 3 picked");
  kit.check(
    "rule 1, answered in part: the Send takes the unsent reason, the picks not made stand ('1 of 3 picked')",
    partial === "1 of 3 picked",
    String(partial)
  );
  await pressIn(frame, '[data-option="color-b"]');
  await pressIn(frame, '[data-option="label-a"]');
  await lineIs(fleet, id, "2 unsent");
  await pressIn(frame, "[data-dp-send]");
  const whole = await lineIs(fleet, id, null);
  kit.check(
    "rule 1, answered whole: every pick made and sent, it leaves Needs you",
    whole === null,
    String(whole)
  );
  await page.close();
};

/** A pin on a judged page, then the agent's answer on it: neither asks anything; then a revision with nothing asked. */
const pins = async (at: At, session: string, id: string) => {
  const { fleet, kit } = at;
  let page = await ownTab(at, id);
  const gone = await lineIs(fleet, id, null);
  kit.check(
    "rule 6, a look: the judge page opened in its own tab leaves Needs you",
    gone === null,
    String(gone)
  );
  await inDoc(page, (doc) => {
    const now = new Date().toISOString();
    doc.transact(() =>
      doc.getMap("pins").set("probe-pin-1", {
        id: "probe-pin-1",
        number: 1,
        kind: "comment",
        anchor: { selector: "#line-1", text: "Its schedule line." },
        at: now,
        by: "person",
        elements: [],
        point: { x: 0.5, y: 0.5 },
        thread: [
          {
            id: "probe-entry-1",
            by: "person",
            text: "Say when it runs.",
            at: now,
          },
        ],
      })
    );
  });
  // Comments go to the session by themselves after their quiet: no Send, nothing unsent.
  await Bun.sleep(4500);
  const pinned = await lineOf(fleet, id);
  kit.check(
    "a pin on a judged page goes by itself and asks nothing: it stays out of Needs you",
    pinned === null,
    String(pinned)
  );
  await fleet.api(
    `/api/instances/${session}/artifacts/comments/probe-pin-1/reply`,
    { text: "It runs at nine, every weekday." }
  );
  // The reply is in the doc once its call answers; the lane is read past its move.
  await Bun.sleep(1500);
  const answer = await lineOf(fleet, id);
  kit.check(
    "only open asks: the agent's reply on a pin of a page already answered asks nothing, it stays out of Needs you",
    answer === null,
    String(answer)
  );
  await page.close();
  // Its pane's link to the doc gone with the tab: a revision now is one nobody has on screen.
  await Bun.sleep(1500);
  // A revision with nothing asked: a notice, not a need, until it is opened.
  await create(fleet, session, {
    kind: "page",
    does: "judge",
    ask: "Judge the routine form's states",
    name: "routine-form",
    html: judgePage("Routine form", [
      "Its schedule line, now with the time.",
      "Its run line.",
      "Its owner line.",
    ]),
  });
  const notice = await until(
    "the changed notice",
    () => noticeOf(fleet, id),
    (one) => one?.parts.some((part) => part.kind === "changed") ?? false,
    LANE_MS
  ).catch(() => noticeOf(fleet, id));
  const words = notice
    ? notice.parts.map((part) => noticePartWords(part, notice.name)).join(" · ")
    : null;
  kit.check(
    "a revision with nothing asked is the notice 'routine-form: N changed since you looked', never a need",
    !!words?.startsWith("routine-form: ") &&
      words.endsWith(commentWords.changedSince(0).slice(1)) &&
      (await lineOf(fleet, id)) === null,
    String(words)
  );
  page = await ownTab(at, id);
  const cleared = await until(
    "the notice cleared by a look",
    () => noticeOf(fleet, id),
    (one) => one === undefined,
    LANE_MS
  ).catch(() => noticeOf(fleet, id));
  kit.check(
    "rule 6, a look: opening the revision clears its notice",
    cleared === undefined,
    JSON.stringify(cleared)
  );
  await page.close();
};

/** When the session's latest turn ended, ms epoch on the hub's clock; 0 before any. */
const turnEndedAt = (fleet: KitFleet, session: string): number =>
  Number(
    fleet.query<{ turn_ended_at: number | null }>(
      "SELECT turn_ended_at FROM instances WHERE id = ?",
      session
    )[0]?.turn_ended_at ?? 0
  );

/** Rule 2: the step the hub set waiting on it, ticked; and the writer's next turn ending. */
const movedOn = async (at: At, session: string) => {
  const { fleet, kit, call } = at;
  await call(session, TODO, {
    steps: [
      {
        id: "head",
        content: "Ask the owner to pick the head",
        status: "in_progress",
      },
    ],
  });
  await call(session, CREATE, {
    kind: "page",
    does: "pick",
    ask: "Pick the head for the phone project page",
    name: "phone-head",
    html: kitPage("The phone page's head", ["head", "size"]),
  });
  const id = await madeNamed(fleet, session, "phone-head");
  const plan = await fleet.api<{
    steps: { id: string; waitsOn?: { artifactId: string; card?: string } }[];
  }>(`/api/instances/${session}/plan`);
  const wait = plan.steps.find((step) => step.id === "head")?.waitsOn;
  const standing = await lineIs(fleet, id, "0 of 2 picked");
  kit.check(
    "rule 2: artifact_create of a pick page makes the session's current step wait on it (waitsOn, no card) and it stands in Needs you",
    wait?.artifactId === id && wait.card === undefined && standing !== null,
    `waitsOn ${JSON.stringify(wait)}; line ${standing}`
  );
  await call(session, TODO, {
    steps: [
      {
        id: "head",
        content: "Ask the owner to pick the head",
        status: "completed",
      },
    ],
  });
  const ticked = await lineIs(fleet, id, null);
  kit.check(
    "rule 2, the writer moved on: the step that waited on it ticked, it leaves Needs you",
    ticked === null,
    String(ticked)
  );
  const calledAt = Date.now();
  await call(session, CREATE, {
    kind: "page",
    does: "pick",
    ask: "Pick the color for the home tile",
    name: "tile-color",
    html: kitPage("The home tile's color", ["color"]),
  });
  const nextId = await madeNamed(fleet, session, "tile-color");
  // Its own turn ends (the call answered, the mock's last words after it): it stands.
  await until(
    "the asking turn's end",
    () => turnEndedAt(fleet, session),
    (end) => end > calledAt,
    60_000
  );
  const after = await lineIs(fleet, nextId, "0 of 1 picked");
  await fleet.send(session, "PROBE-NEXT go on with something else");
  const turned = await lineIs(fleet, nextId, null, 120_000);
  kit.check(
    "rule 2, the writer moved on: with no step waiting it stands past its own turn's end, and leaves once the session's next turn ends",
    after === "0 of 1 picked" && turned === null,
    `after its own turn: ${after}; after the next: ${turned}`
  );
};

/** Superseded, and Not now: a same-name create revises it in place; Not now parks it until a revision. */
const supersededAndNotNow = async (at: At, session: string) => {
  const { fleet, kit } = at;
  const page = (cards: string[]) => ({
    kind: "page",
    does: "pick",
    ask: "Pick the presence page's layout",
    name: "presence-page",
    html: kitPage("The presence page", cards),
  });
  const id = await create(fleet, session, page(["layout", "tone"]));
  const first = await lineIs(fleet, id, "0 of 2 picked");
  const again = await create(
    fleet,
    session,
    page(["layout", "tone", "density"])
  );
  const second = await lineIs(fleet, id, "0 of 3 picked");
  const named = (await lane(fleet)).needs.filter(
    (one) => one.name === "presence-page"
  );
  kit.check(
    "rule 3, superseded: a same-name create is the same item, one row, its line changed in place",
    again === id &&
      first !== null &&
      second === "0 of 3 picked" &&
      named.length === 1 &&
      named[0]?.artifactId === id,
    `ids ${id} ${again}; lines ${first} → ${second}; rows ${named.length}`
  );
  const need = (await needOf(fleet, id)) as ArtifactNeed;
  await fleet.api("/api/notices/seen", { ids: [need.notNow] });
  const parked = await lineIs(fleet, id, null);
  const files = await fleet.api<{ id: string; waiting: boolean }[]>(
    `/api/instances/${session}/artifacts`
  );
  kit.check(
    "rule 5, Not now: it leaves Needs you (the lane carries it parked) and its Files list still says it waits",
    parked === null &&
      (await needOf(fleet, id))?.parked === true &&
      files.find((one) => one.id === id)?.waiting === true,
    `line ${parked}; files ${JSON.stringify(files.find((one) => one.id === id))}`
  );
  await create(fleet, session, page(["layout", "tone", "density", "motion"]));
  const back = await lineIs(fleet, id, "0 of 4 picked");
  kit.check(
    "rule 5, Not now: a revision raises it again, back in Needs you",
    back === "0 of 4 picked" &&
      ((await needOf(fleet, id))?.raisedAt ?? 0) > need.raisedAt,
    String(back)
  );
  return id;
};

/** Removes every transcript file of `conversation` under `home`; how many it removed (plan-changes' own). */
const removeTranscript = async (
  home: string,
  conversation: string
): Promise<number> => {
  if (!conversation) {
    return 0;
  }
  let removed = 0;
  const walk = async (dir: string): Promise<void> => {
    for (const entry of await readdir(dir, { withFileTypes: true }).catch(
      () => []
    )) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        // biome-ignore lint/performance/noAwaitInLoops: a walk, one folder at a time
        await walk(path);
      } else if (entry.name === `${conversation}.jsonl`) {
        await rm(path);
        removed += 1;
      }
    }
  };
  await walk(home);
  return removed;
};

/** One column of the session's row on the hub. */
const rowSays = (fleet: KitFleet, session: string, column: string): string =>
  String(
    fleet.query<Record<string, unknown>>(
      `SELECT ${column} AS value FROM instances WHERE id = ?`,
      session
    )[0]?.value ?? ""
  );

/**
 * Rule 4: its session ended, it is one notice. The session's conversation
 * is gone as it goes in life: stopped, its transcript removed, then woken
 * by a message, whose resume finds nothing (agent claude.ts
 * `conversationGone`), which the hub records (`processFailed`).
 */
const ended = async (at: At, session: string) => {
  const { fleet, kit } = at;
  // A conversation of its own first: a turn.
  const spokeAt = Date.now();
  await fleet.send(session, "PROBE-HELLO say hello");
  await until(
    "its first turn's end",
    () => turnEndedAt(fleet, session),
    (end) => end > spokeAt,
    120_000
  );
  const id = await create(fleet, session, {
    kind: "page",
    does: "pick",
    ask: "Pick the pairing screen's copy",
    name: "pairing",
    html: kitPage("Pairing", ["title", "button"]),
  });
  const page = await ownTab(at, id);
  const stood = await lineIs(fleet, id, "0 of 2 picked");
  await page.close();
  await fleet.stopSession(session);
  await until(
    "the session stopped",
    () => rowSays(fleet, session, "status"),
    (status) => status === "stopped",
    60_000
  );
  const conversation = rowSays(fleet, session, "session_id");
  const removed = await removeTranscript(fleet.home, conversation);
  await fleet.send(session, "PROBE-WAKE are you there");
  const gone = await until(
    "its resume finding the conversation gone",
    () => rowSays(fleet, session, "last_error_kind"),
    (kind) => kind === "conversation-gone",
    120_000
  ).catch(() => rowSays(fleet, session, "last_error_kind"));
  const left = await lineIs(fleet, id, null);
  const notice = await noticeOf(fleet, id);
  const words = notice
    ? notice.parts.map((part) => noticePartWords(part, notice.name)).join(" · ")
    : null;
  kit.check(
    "rule 4, its session ended (stopped, its transcript gone, its resume finding nothing): it leaves Needs you and is one notice, 'Claude Code ended; 2 picks on pairing never made'",
    stood !== null &&
      removed > 0 &&
      gone === "conversation-gone" &&
      left === null &&
      words === "Claude Code ended; 2 picks on pairing never made",
    `stood ${stood}; transcripts removed ${removed}; the hub's record ${gone}; left ${left}; notice ${words}`
  );
};

/** How long the push's burst stays open after an arrival, and a little more: a leg's push goes as itself. */
const BURST_QUIET_MS = 35_000;

/**
 * On one harness: a turn that makes a pick page leaves it standing past its
 * own end, and pushes it (`artifact-<id>`, its ask sealed, `cawco.kind`
 * artifact, Open only) in that turn's push's place; on Claude Code a look at
 * it clears the push. The session's next turn ending, with no step waiting
 * on it, takes it out of Needs you (rule 2).
 */
const onHarness = async (
  at: At,
  harness: Harness,
  phone: ReturnType<typeof standInPhone>
): Promise<void> => {
  const { fleet, kit, call } = at;
  const session = await fleet.spawn(
    harness,
    `Asking on ${harness}`,
    fleet.repo
  );
  const name = `head-${harness}`;
  const ask = `Pick the head for the ${harness} page`;
  // Nothing else of the fleet's in the push's burst: it goes as itself.
  await Bun.sleep(BURST_QUIET_MS);
  const calledAt = Date.now();
  await call(session, CREATE, {
    kind: "page",
    does: "pick",
    ask,
    name,
    html: kitPage(`The ${harness} head`, ["head"]),
  });
  const id = await madeNamed(fleet, session, name);
  await until(
    `the ${harness} asking turn's end`,
    () => turnEndedAt(fleet, session),
    (end) => end > calledAt,
    60_000
  ).catch(() => 0);
  const stands = await lineIs(fleet, id, "0 of 1 picked");
  const push = await until(
    `the ${harness} artifact's push`,
    () => phone.pushed.find((one) => one.collapseId === `artifact-${id}`),
    Boolean,
    PUSH_MS
  ).catch(() => undefined);
  const sealed = push?.payload.e ? await phone.open(push.payload.e) : null;
  kit.check(
    `${harness}: the turn that made it ended and it stands ('0 of 1 picked')`,
    stands === "0 of 1 picked",
    String(stands)
  );
  kit.check(
    `${harness} push: the turn that left it waiting pushed under artifact-<id> in its turn push's place, its sealed body the ask, cawco.kind artifact, CAWCO_TASK_OPEN (Open only)`,
    !!push &&
      sealed?.body === ask &&
      push.payload.cawco?.kind === "artifact" &&
      push.payload.cawco.artifactId === id &&
      push.payload.cawco.instanceId === session &&
      push.payload.aps?.category === "CAWCO_TASK_OPEN" &&
      !phone.pushed.some((one) => one.collapseId === `turn-${session}`),
    JSON.stringify({
      push: push?.payload.cawco,
      collapseIds: phone.pushed.map((one) => one.collapseId),
      category: push?.payload.aps?.category,
      sealed,
    })
  );
  if (harness === "claude") {
    const page = await ownTab(at, id);
    const cleared = await until(
      "the push cleared by a look",
      () => fleet.logs("hub"),
      (logs) => logs.includes(`cleared (look): artifact-${id}`),
      LANE_MS
    ).catch(() => "");
    kit.check(
      "push: a look at the artifact clears it",
      cleared.includes(`cleared (look): artifact-${id}`),
      cleared.includes(`cleared (look): artifact-${id}`)
        ? `the hub's log: cleared (look): artifact-${id}`
        : "no `cleared (look)` line for it in the hub's log"
    );
    await page.close();
  }
  const before = await lineOf(fleet, id);
  await fleet.send(session, "PROBE-NEXT go on with something else");
  const turned = await lineIs(fleet, id, null, 120_000);
  kit.check(
    `${harness}, rule 2, the writer moved on: with no step waiting on it, it leaves Needs you once the session's next turn ends`,
    before === "0 of 1 picked" && turned === null,
    `before the next turn: ${before}; after it: ${turned}`
  );
};

/**
 * A pin reply that asks reaches the person through Needs you, grouped per
 * artifact; one that doesn't stays on the page. On the judged page `id`,
 * opened and answered already (it asks nothing of its own), with three more
 * of the person's pins: a plain reply adds no row and no push; one asking
 * reply is the row with 1 and one push (`artifact-<id>`, `thread-id` the
 * artifact's id, the reply sealed); the person's reply clears it; three
 * asking replies in one burst's window are one row with 3 and one push
 * saying so; the person's reply on one makes it 2, a resolve 1.
 */
const pinAsks = async (
  at: At,
  session: string,
  id: string,
  phone: ReturnType<typeof standInPhone>
) => {
  const { fleet, kit } = at;
  const reply = (pin: string, words: string, asking?: true) =>
    fleet.api(`/api/instances/${session}/artifacts/comments/${pin}/reply`, {
      text: words,
      ...(asking ? { asks: asking } : {}),
    });
  const ours = (from: number) =>
    phone.pushed
      .slice(from)
      .filter((one) => one.collapseId === `artifact-${id}`);
  let page = await ownTab(at, id);
  await inDoc(page, (doc) => {
    const now = new Date().toISOString();
    doc.transact(() => {
      for (const [n, line, words] of [
        [2, "line-2", "Is this the run line you meant?"],
        [3, "line-3", "Who owns it?"],
        [4, "line-1", "Which time zone?"],
      ] as const) {
        doc.getMap("pins").set(`probe-pin-${n}`, {
          id: `probe-pin-${n}`,
          number: n,
          kind: "comment",
          anchor: { selector: `#${line}` },
          at: now,
          by: "person",
          elements: [],
          point: { x: 0.5, y: 0.5 },
          thread: [
            { id: `probe-entry-${n}`, by: "person", text: words, at: now },
          ],
        });
      }
    });
  });
  // Delivered by themselves; the tab closed, so no look stands past a reply.
  await Bun.sleep(4500);
  await page.close();
  await Bun.sleep(BURST_QUIET_MS);

  const plainFrom = phone.pushed.length;
  await reply("probe-pin-2", "Fixed: the run line now says nine.");
  await Bun.sleep(BURST_QUIET_MS);
  const plain = await lineOf(fleet, id);
  kit.check(
    "a plain pin reply adds no Needs you row and sends no push",
    plain === null && ours(plainFrom).length === 0,
    `line ${plain}; pushes under artifact-<id> since: ${ours(plainFrom).length}`
  );

  const oneFrom = phone.pushed.length;
  const question = "Nine in the morning or nine at night?";
  await reply("probe-pin-2", question, true);
  const single = await lineIs(fleet, id, artifactWords.newAnswerOn(2));
  const onePush = await until(
    "the asking reply's push",
    () => ours(oneFrom)[0],
    Boolean,
    PUSH_MS
  ).catch(() => undefined);
  await Bun.sleep(BURST_QUIET_MS);
  const oneSealed = onePush?.payload.e
    ? await phone.open(onePush.payload.e)
    : null;
  const oneNeed = await needOf(fleet, id);
  kit.check(
    "an asking reply stands the artifact's row with the count 1 ('1 new answer on pin 2'), its stop the pin",
    single === artifactWords.newAnswerOn(2) &&
      oneNeed?.pending.length === 1 &&
      oneNeed.pending[0]?.kind === "answer" &&
      oneNeed.pending[0].count === 1 &&
      oneNeed.href.endsWith("&stop=pin:2"),
    `${single}; ${JSON.stringify(oneNeed?.pending)}; ${oneNeed?.href}`
  );
  kit.check(
    "an asking reply is one push under artifact-<id>, its thread-id the artifact's id, its shown body the count, its sealed body the reply, cawco.kind artifact",
    ours(oneFrom).length === 1 &&
      onePush?.payload.aps?.["thread-id"] === id &&
      onePush.payload.aps.alert?.body === artifactWords.newAnswers(1) &&
      oneSealed?.body === question &&
      onePush.payload.cawco?.kind === "artifact" &&
      onePush.payload.cawco.artifactId === id,
    JSON.stringify({
      pushes: ours(oneFrom).length,
      aps: onePush?.payload.aps,
      cawco: onePush?.payload.cawco,
      sealed: oneSealed,
    })
  );

  // The person answers it: the row goes.
  page = await ownTab(at, id);
  await inDoc(page, (doc) => {
    const marks = doc.getMap("pins");
    const pin = marks.get("probe-pin-2") as { thread: object[] };
    doc.transact(() =>
      marks.set("probe-pin-2", {
        ...pin,
        thread: [
          ...pin.thread,
          {
            id: "probe-entry-2b",
            by: "person",
            text: "In the morning.",
            at: new Date().toISOString(),
          },
        ],
      })
    );
  });
  const cleared = await lineIs(fleet, id, null);
  kit.check(
    "the person's reply on the asking pin answers it: the row leaves Needs you",
    cleared === null,
    String(cleared)
  );
  await Bun.sleep(4500);
  await page.close();
  await Bun.sleep(BURST_QUIET_MS);

  const manyFrom = phone.pushed.length;
  await reply("probe-pin-2", "Morning it is. Every weekday, or daily?", true);
  await reply("probe-pin-3", "Should it be you or the team?", true);
  await reply("probe-pin-4", "Your time zone, or the server's?", true);
  const three = await lineIs(fleet, id, artifactWords.newAnswers(3));
  const threeRows = (await lane(fleet)).needs.filter(
    (need) => need.artifactId === id
  ).length;
  await until(
    "the three asking replies' push",
    () => ours(manyFrom)[0],
    Boolean,
    PUSH_MS
  ).catch(() => undefined);
  await Bun.sleep(BURST_QUIET_MS);
  const many = ours(manyFrom);
  const manySealed = many[0]?.payload.e
    ? await phone.open(many[0].payload.e)
    : null;
  kit.check(
    "three asking replies in quick succession are one row with the count 3 ('3 new answers')",
    three === artifactWords.newAnswers(3) && threeRows === 1,
    `${three}; rows ${threeRows}`
  );
  kit.check(
    "the three asking replies' pushes collapse into one under artifact-<id>, thread-id the artifact's id, saying how many (shown and sealed)",
    many.length === 1 &&
      many[0]?.payload.aps?.["thread-id"] === id &&
      many[0].payload.aps.alert?.body === artifactWords.newAnswers(3) &&
      manySealed?.body === artifactWords.newAnswers(3),
    JSON.stringify({
      pushes: many.length,
      aps: many.map((one) => one.payload.aps),
      sealed: manySealed,
    })
  );

  page = await ownTab(at, id);
  await inDoc(page, (doc) => {
    const marks = doc.getMap("pins");
    const pin = marks.get("probe-pin-3") as { thread: object[] };
    doc.transact(() =>
      marks.set("probe-pin-3", {
        ...pin,
        thread: [
          ...pin.thread,
          {
            id: "probe-entry-3b",
            by: "person",
            text: "The team.",
            at: new Date().toISOString(),
          },
        ],
      })
    );
  });
  const two = await lineIs(fleet, id, artifactWords.newAnswers(2));
  kit.check(
    "the person replies to one of the three: the row's count is 2",
    two === artifactWords.newAnswers(2),
    String(two)
  );
  await inDoc(page, (doc) => {
    const marks = doc.getMap("pins");
    const pin = marks.get("probe-pin-4") as object;
    const now = new Date().toISOString();
    doc.transact(() =>
      marks.set("probe-pin-4", {
        ...pin,
        resolvedAt: now,
        resolvedBy: "person",
        seenAt: now,
      })
    );
  });
  const resolved = await lineIs(fleet, id, artifactWords.newAnswerOn(2));
  kit.check(
    "the person resolves one: the row's count is 1, on the pin still asking",
    resolved === artifactWords.newAnswerOn(2),
    String(resolved)
  );
  // The last one resolved too, so the legs after this find the lane as they left it.
  await inDoc(page, (doc) => {
    const marks = doc.getMap("pins");
    const pin = marks.get("probe-pin-2") as object;
    const now = new Date().toISOString();
    doc.transact(() =>
      marks.set("probe-pin-2", {
        ...pin,
        resolvedAt: now,
        resolvedBy: "person",
        seenAt: now,
      })
    );
  });
  await lineIs(fleet, id, null);
  await page.close();
};

/* ── The dashboard: the count and arcs, Files' dot, the row's boxes ─────── */

/** Caw's panel opened on `page`: its Needs-you rows. */
const cawPanel = async (page: Page): Promise<void> => {
  await page.locator("[data-needs-caw]").click();
  await page.locator('[data-slot="list"]').first().waitFor({ timeout: 15_000 });
  await settle(page, 400);
};

/** Caw's Needs-you rows as the page draws them: his label, his arcs, the rows and the artifacts among them, each row's box. */
const panelRead = (page: Page) =>
  page.evaluate(() => {
    const button = document.querySelector("[data-needs-caw]");
    const rows = [
      ...document.querySelectorAll<HTMLElement>(
        '[aria-labelledby="caw-needs"] [data-slot="row"]'
      ),
    ];
    return {
      label: button?.getAttribute("aria-label") ?? "",
      arcs: Number(
        document
          .querySelector('[data-needs-caw] svg[data-slot="rim"]')
          ?.getAttribute("data-count") ?? -1
      ),
      rows: rows.length,
      artifacts: rows
        .filter((row) => {
          const box = row.getBoundingClientRect();
          return box.width > 0 && box.height > 0;
        })
        .map((row) => row.dataset.artifact)
        .filter((id): id is string => !!id),
    };
  });

/** A folder a preview serves: one page with a line on it. */
const previewFolder = (fleet: KitFleet): string => {
  const folder = join(fleet.repo, "probe-plain-preview");
  mkdirSync(folder, { recursive: true });
  writeFileSync(
    join(folder, "index.html"),
    judgePage("Plain preview", ["A line to look at."])
  );
  return folder;
};

/**
 * The invariant, as the person sees it: a plain preview with no ask (a row
 * made before asks were kept: judge, its ask empty, as the live pile's) and
 * a try preview never stand in Needs you, and Files still lists them; a
 * judge canvas and a pick page, each with its ask, stand in the lane and in
 * Caw's panel, whose head counts its rows; the pick page leaves once its
 * picks are sent. Caw's panel read in Chromium and WebKit.
 */
const onlyOpenAsks = async (at: At, session: string) => {
  const { fleet, kit, base } = at;
  const folder = previewFolder(fleet);
  const plain = await create(fleet, session, {
    kind: "preview",
    does: "judge",
    ask: "Judge the plain preview",
    name: "plain-preview",
    dir: folder,
  });
  fleet.write("UPDATE artifacts SET ask = '' WHERE id = ?", plain);
  const tried = await create(fleet, session, {
    kind: "preview",
    does: "try",
    ask: "Try the plain preview's page",
    name: "tried-preview",
    dir: folder,
  });
  const canvas = await create(fleet, session, {
    kind: "canvas",
    does: "judge",
    ask: "Judge the tray's flow",
    name: "tray-flow",
  });
  const pick = await create(fleet, session, {
    kind: "page",
    does: "pick",
    ask: "Pick the tray's chip",
    name: "tray-chip",
    html: kitPage("The tray chip", ["chip"]),
  });
  const canvasLine = await lineIs(fleet, canvas, artifactWords.notOpened);
  const pickLine = await lineIs(fleet, pick, "0 of 1 picked");
  const listed = (await lane(fleet)).needs.map((need) => need.artifactId);
  kit.check(
    "only open asks, the hub's lane: a plain preview with no ask and a try preview are never in it; a judge canvas with its ask reads 'New · not opened', a pick page with its ask '0 of 1 picked'",
    !(listed.includes(plain) || listed.includes(tried)) &&
      canvasLine === artifactWords.notOpened &&
      pickLine === "0 of 1 picked",
    JSON.stringify({ listed, plain, tried, canvasLine, pickLine })
  );
  const files = await fleet.api<{ id: string; waiting: boolean }[]>(
    `/api/instances/${session}/artifacts/files`
  );
  const filed = (id: string) => files.find((one) => one.id === id);
  kit.check(
    "only open asks, Files: the plain preview and the try preview are still listed, neither waiting on the person",
    filed(plain)?.waiting === false && filed(tried)?.waiting === false,
    JSON.stringify({ plain: filed(plain), tried: filed(tried) })
  );
  for (const engine of ["chromium", "webkit"] as const) {
    // biome-ignore lint/performance/noAwaitInLoops: one engine at a time
    const page = await kit.page("desk", { engine });
    await open(page, `${base}/session`, "[data-needs-caw]");
    await cawPanel(page);
    const read = await until(
      "Caw's panel listing the canvas and the pick page",
      () => panelRead(page),
      (now) => now.artifacts.includes(canvas) && now.artifacts.includes(pick),
      LANE_MS
    ).catch(() => panelRead(page));
    kit.check(
      `only open asks, Caw's panel (${engine}): the judge canvas and the pick page are rows a person sees, the plain preview and the try are not; his label says 'Needs you, N' and his rim N arcs, N the rows listed`,
      read.artifacts.includes(canvas) &&
        read.artifacts.includes(pick) &&
        !read.artifacts.includes(plain) &&
        !read.artifacts.includes(tried) &&
        read.label.startsWith(cawHeadWords.needs(read.rows)) &&
        read.arcs === read.rows,
      JSON.stringify({ read, canvas, pick, plain, tried })
    );
    await page.close();
  }
  // The plain preview's Files card stands in the session's Files, no dot on it.
  const filesPage = await kit.page("desk");
  await open(filesPage, `${base}/session/${session}`, "[data-needs-caw]");
  await filesPage.getByRole("button", { name: FILES_ITEM }).first().click();
  const card = filesPage.locator(`[data-files-card][data-artifact="${plain}"]`);
  const drawn = await card
    .waitFor({ timeout: 20_000 })
    .then(() => true)
    .catch(() => false);
  const cardRead = drawn
    ? await card.evaluate((node) => {
        const box = node.getBoundingClientRect();
        return {
          width: box.width,
          height: box.height,
          dot: !!node.querySelector('[data-slot="needs-dot"]'),
        };
      })
    : null;
  kit.check(
    "only open asks, Files on screen: the plain preview's card is drawn in the session's Files, with no needs-you dot",
    !!cardRead && cardRead.width > 0 && cardRead.height > 0 && !cardRead.dot,
    JSON.stringify(cardRead)
  );
  await filesPage.close();
  // The pick page answered: its pick made and sent, it leaves the lane and the panel.
  const pickPage = await ownTab(at, pick);
  const frame = pickPage.frameLocator(FRAME);
  await frame.locator('[data-option="chip-a"]').waitFor({ timeout: 60_000 });
  await pressIn(frame, '[data-option="chip-a"]');
  await lineIs(fleet, pick, "1 unsent");
  await pressIn(frame, "[data-dp-send]");
  const sent = await lineIs(fleet, pick, null);
  await pickPage.close();
  const page = await kit.page("desk", { engine: "webkit" });
  await open(page, `${base}/session`, "[data-needs-caw]");
  await cawPanel(page);
  const after = await until(
    "Caw's panel without the pick page",
    () => panelRead(page),
    (now) => !now.artifacts.includes(pick) && now.artifacts.includes(canvas),
    LANE_MS
  ).catch(() => panelRead(page));
  kit.check(
    "only open asks: the pick page's picks sent, it leaves the lane and Caw's panel; the judge canvas stays, and the head still counts the rows",
    sent === null &&
      !after.artifacts.includes(pick) &&
      after.artifacts.includes(canvas) &&
      after.label.startsWith(cawHeadWords.needs(after.rows)) &&
      after.arcs === after.rows,
    JSON.stringify({ sent, after })
  );
  await page.close();
};

/** A decision page whose two options each show a canvas to judge, by id. */
const mediaProgram = (flat: string, raised: string) =>
  `root = Decisions("The tray's look", [look])
look = Decision("look", "Which tray look ships?", [flatLook, raisedLook], "Each look is drawn on a canvas.")
flatLook = Option("flat", "Flat", "It sits in the bar.", true, [flatPic], "Less depth.")
raisedLook = Option("raised", "Raised", "It floats above the bar.", false, [raisedPic], "More weight.")
flatPic = Canvas("${flat}", "The flat tray")
raisedPic = Canvas("${raised}", "The raised tray")`;

/**
 * Two more that ask nothing of their own: a decision page's option media
 * (two judge canvases, each with its ask) give one row, the page's; and a
 * preview whose folder is deleted leaves the lane once its machine says so
 * at its next start, still listed in Files.
 */
const mediaAndGone = async (at: At, session: string) => {
  const { fleet, kit, base } = at;
  const flat = await create(fleet, session, {
    kind: "canvas",
    does: "judge",
    ask: "Judge the flat tray",
    name: "tray-flat",
  });
  const raised = await create(fleet, session, {
    kind: "canvas",
    does: "judge",
    ask: "Judge the raised tray",
    name: "tray-raised",
  });
  const page = await create(fleet, session, {
    kind: "page",
    does: "pick",
    ask: "Pick the tray's look",
    name: "tray-look",
    program: mediaProgram(flat, raised),
  });
  const pageLine = await lineIs(fleet, page, "0 of 1 picked");
  const listed = (await lane(fleet)).needs.map((need) => need.artifactId);
  kit.check(
    "option media, the hub's lane: a decision page whose two options show judge canvases is one row, the page's ('0 of 1 picked'); neither canvas is its own",
    pageLine === "0 of 1 picked" &&
      listed.includes(page) &&
      !(listed.includes(flat) || listed.includes(raised)),
    JSON.stringify({ pageLine, listed, page, flat, raised })
  );
  for (const engine of ["chromium", "webkit"] as const) {
    // biome-ignore lint/performance/noAwaitInLoops: one engine at a time
    const view = await kit.page("desk", { engine });
    await open(view, `${base}/session`, "[data-needs-caw]");
    await cawPanel(view);
    const read = await until(
      "Caw's panel listing the page",
      () => panelRead(view),
      (now) => now.artifacts.includes(page),
      LANE_MS
    ).catch(() => panelRead(view));
    const ours = read.artifacts.filter((id) =>
      [page, flat, raised].includes(id)
    );
    kit.check(
      `option media, Caw's panel (${engine}): one row a person sees for the page and its two canvases, not three; the head counts the rows`,
      ours.length === 1 &&
        ours[0] === page &&
        read.label.startsWith(cawHeadWords.needs(read.rows)) &&
        read.arcs === read.rows,
      JSON.stringify({ ours, read })
    );
    await view.close();
  }

  // A revision that drops the raised tray's canvas: it stays the page's picture, no row of its own.
  const revised = await create(fleet, session, {
    kind: "page",
    does: "pick",
    ask: "Pick the tray's look",
    name: "tray-look",
    program: `root = Decisions("The tray's look", [look])
look = Decision("look", "Which tray look ships?", [flatLook, plainLook], "The flat look is drawn on a canvas.")
flatLook = Option("flat", "Flat", "It sits in the bar.", true, [flatPic], "Less depth.")
plainLook = Option("plain", "Plain", "No tray at all.", false, [], "Nothing to hold.")
flatPic = Canvas("${flat}", "The flat tray")`,
  });
  await Bun.sleep(1500);
  const afterRevision = (await lane(fleet)).needs.map(
    (need) => need.artifactId
  );
  kit.check(
    "option media, a revision drops one: the page stays one row, the canvas it dropped doesn't come back as its own, nor the one it keeps",
    revised === page &&
      afterRevision.includes(page) &&
      !(afterRevision.includes(raised) || afterRevision.includes(flat)),
    JSON.stringify({ revised, page, flat, raised, afterRevision })
  );

  const folder = join(fleet.repo, "probe-gone-preview");
  mkdirSync(folder, { recursive: true });
  writeFileSync(
    join(folder, "index.html"),
    judgePage("Gone preview", ["A line that goes."])
  );
  const gone = await create(fleet, session, {
    kind: "preview",
    does: "judge",
    ask: "Judge the preview that goes",
    name: "gone-preview",
    dir: folder,
  });
  const before = await lineIs(fleet, gone, artifactWords.notOpened);
  rmSync(folder, { recursive: true, force: true });
  // Its next start, as the person's open of it starts it: the machine says the folder is gone.
  const shown = await fleet
    .api(`/api/instances/${session}/artifacts/${gone}/show`, {})
    .then((answer) => JSON.stringify(answer))
    .catch((error: unknown) => String(error));
  const after = await lineIs(fleet, gone, null);
  const files = await fleet.api<{ id: string; waiting: boolean }[]>(
    `/api/instances/${session}/artifacts/files`
  );
  const filed = files.find((one) => one.id === gone);
  kit.check(
    "a gone source: a judge preview with its ask stands ('New · not opened'); its folder deleted, its next start fails on the machine's words and it leaves the lane, still in Files, not waiting",
    before === artifactWords.notOpened &&
      shown.includes(": 503 ") &&
      after === null &&
      filed?.waiting === false,
    JSON.stringify({ before, shown, after, filed })
  );
};

/** An fd's link to a socket, its inode captured. */
const SOCKET_LINK = /^socket:\[(\d+)\]$/;
const SPACES = /\s+/;

/** The listening TCP sockets process `pid` holds, as `address:port` in /proc's hex, and every process under it (Linux /proc). */
const heldBy = async (
  pid: number
): Promise<{ listening: string[]; processes: number[] }> => {
  const inodes = new Set(
    (await readdir(`/proc/${pid}/fd`).catch(() => []))
      .map((fd) => {
        try {
          return readlinkSync(`/proc/${pid}/fd/${fd}`);
        } catch {
          return "";
        }
      })
      .flatMap((link) => SOCKET_LINK.exec(link)?.slice(1) ?? [])
  );
  const listening = ["tcp", "tcp6"].flatMap((table) =>
    readFileSync(`/proc/${pid}/net/${table}`, "utf8")
      .split("\n")
      .slice(1)
      .map((line) => line.trim().split(SPACES))
      // State 0A is LISTEN; column 9 the socket's inode.
      .filter((cols) => cols[3] === "0A" && inodes.has(cols[9] ?? ""))
      .map((cols) => `${table} ${cols[1]}`)
  );
  const parents = new Map<number, number[]>();
  for (const entry of await readdir("/proc")) {
    const id = Number(entry);
    if (!Number.isInteger(id)) {
      continue;
    }
    let stat = "";
    try {
      stat = readFileSync(`/proc/${id}/stat`, "utf8");
    } catch {
      continue;
    }
    const parent = Number(stat.slice(stat.lastIndexOf(")") + 2).split(" ")[1]);
    parents.set(parent, [...(parents.get(parent) ?? []), id]);
  }
  const processes: number[] = [];
  const walk = (at: number) => {
    for (const child of parents.get(at) ?? []) {
      processes.push(child);
      walk(child);
    }
  };
  walk(pid);
  return { listening: listening.sort(), processes: processes.sort() };
};

/**
 * A folder gone while its machine was away: a judge preview with its ask
 * stands; its agent stopped, its folder deleted, the agent launched again
 * while the hub is held still, so what the agent holds of its own before
 * any hub word is read; the hub let go, the machine registers and the hub
 * reads the folder, and the preview leaves the lane with no start of it.
 * The agent then holds no listening socket and no process it didn't hold
 * before the register: the read started nothing.
 */
const goneAtRegister = async (at: At, session: string) => {
  const { fleet, kit } = at;
  const folder = join(fleet.repo, "probe-away-preview");
  mkdirSync(folder, { recursive: true });
  writeFileSync(
    join(folder, "index.html"),
    judgePage("Away preview", ["A line that goes while away."])
  );
  const away = await create(fleet, session, {
    kind: "preview",
    does: "judge",
    ask: "Judge the preview that goes while away",
    name: "away-preview",
    dir: folder,
  });
  // The panel shows a page after it: no panel holds the preview, so no
  // register restarts it (server.ts `reconcilePreviews`), and only the
  // register's read can say its folder went.
  await create(fleet, session, {
    kind: "page",
    does: "judge",
    ask: "Judge the cover page",
    name: "away-cover",
    html: judgePage("Cover", ["The panel shows this instead."]),
  });
  const before = await lineIs(fleet, away, artifactWords.notOpened);
  await fleet.stop("agent");
  rmSync(folder, { recursive: true, force: true });
  fleet.freeze("hub", true);
  const agent = fleet.launch("agent");
  // The agent up and waiting at the held hub's door: what it holds of its own.
  await Bun.sleep(8000);
  const own = await heldBy(agent.pid);
  fleet.freeze("hub", false);
  await fleet.agentUp();
  // Nothing shows it: only the register's read can take it out.
  const after = await lineIs(fleet, away, null);
  await Bun.sleep(2000);
  const then = await heldBy(agent.pid);
  const newListening = then.listening.filter(
    (one) => !own.listening.includes(one)
  );
  const newProcesses = then.processes.filter(
    (one) => !own.processes.includes(one)
  );
  const files = await fleet.api<{ id: string; waiting: boolean }[]>(
    `/api/instances/${session}/artifacts/files`
  );
  kit.check(
    "a folder gone while its machine was away: as the machine registers the hub reads the folder (a stat, no start) and the preview leaves the lane, still in Files",
    before === artifactWords.notOpened &&
      after === null &&
      files.find((one) => one.id === away)?.waiting === false,
    JSON.stringify({ before, after })
  );
  kit.check(
    "the register's read starts nothing: the agent holds no listening socket and no process it didn't hold before the hub's first word",
    newListening.length === 0 && newProcesses.length === 0,
    JSON.stringify({ own, then, newListening, newProcesses })
  );
};

const countAndArcs = async (at: At) => {
  const { fleet, kit, base } = at;
  const page = await kit.page("desk");
  await open(page, `${base}/session`, "[data-needs-caw]");
  const expected = unparked((await lane(fleet)).needs).map(
    (need) => need.artifactId
  );
  await cawPanel(page);
  const read = await until(
    "Caw's panel listing the lane's artifacts",
    () => panelRead(page),
    (now) => expected.every((id) => now.artifacts.includes(id)),
    LANE_MS
  ).catch(() => null);
  kit.check(
    "the home count and Caw's arcs include it: his label says 'Needs you, N' and his rim N arcs, N the panel's Needs-you rows, every artifact the hub lists among them",
    !!read &&
      read.artifacts.length === expected.length &&
      read.label.startsWith(cawHeadWords.needs(read.rows)) &&
      read.arcs === read.rows &&
      read.rows >= expected.length,
    JSON.stringify({ read, expected })
  );
  await page.close();
};

const filesDot = async (at: At, session: string, id: string) => {
  const { kit, base, fleet } = at;
  const page = await kit.page("desk");
  await open(page, `${base}/session/${session}`, "[data-needs-caw]");
  await page.getByRole("button", { name: FILES_ITEM }).first().click();
  const card = page.locator(`[data-files-card][data-artifact="${id}"]`);
  await card.waitFor({ timeout: 20_000 });
  await settle(page, 400);
  const read = await card.evaluate((node) => {
    const well = node
      .querySelector("[data-files-thumb]")
      ?.getBoundingClientRect();
    const dot = node
      .querySelector('[data-slot="needs-dot"]:not([data-ping])')
      ?.getBoundingClientRect();
    const reason = node.querySelector(
      '[data-slot="needs-reason"]'
    )?.textContent;
    const mask = node.querySelector("[data-files-thumb]")
      ? getComputedStyle(node.querySelector("[data-files-thumb]") as Element)
          .maskImage
      : "";
    const fill = node.querySelector('[data-slot="needs-dot"]:not([data-ping])');
    return {
      well: well ? { right: well.right, top: well.top } : null,
      dot: dot
        ? {
            x: dot.left + dot.width / 2,
            y: dot.top + dot.height / 2,
            size: dot.width,
          }
        : null,
      reason: reason ?? null,
      cut: mask.includes("radial-gradient"),
      ink: fill ? getComputedStyle(fill).backgroundColor : "",
    };
  });
  // Its strongest reason as the hub lists it now: opening the session put
  // it in front, a look that took "not opened" away.
  const listed = (
    await fleet.api<
      { id: string; pending: { pending: ArtifactReason[] } | null }[]
    >(`/api/instances/${session}/artifacts`)
  ).find((one) => one.id === id)?.pending?.pending[0];
  kit.check(
    "the Files card wears the dot: a 6px needs-you dot centred on its picture's top-right corner, the picture cut round it, its strongest reason on its meta line as the hub lists it",
    !!read.dot &&
      !!read.well &&
      Math.abs(read.dot.x - read.well.right) <= 0.5 &&
      Math.abs(read.dot.y - read.well.top) <= 0.5 &&
      Math.abs(read.dot.size - 6) <= 0.5 &&
      read.cut &&
      !!listed &&
      read.reason === reasonShort(listed),
    JSON.stringify({ ...read, listed })
  );
  await page.close();
};

/** The artifact rows' boxes in Caw's panel, at one width in one engine. */
const rowBoxes = async (at: At, engine: Engine, view: View, label: string) => {
  const { kit, base, fleet } = at;
  const page = await kit.page(view, { engine });
  await open(page, `${base}/session`, "[data-needs-caw]");
  const expected = unparked((await lane(fleet)).needs).length;
  await cawPanel(page);
  await until(
    "the artifact rows drawn",
    () =>
      page
        .locator(
          '[aria-labelledby="caw-needs"] [data-slot="row"][data-kind="artifact"]'
        )
        .count(),
    (n) => n >= expected,
    LANE_MS
  ).catch(() => 0);
  await settle(page, 400);
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: every row's every box against the row and the list, each failure named, in one read of the page
  const read = await page.evaluate(() => {
    // Caw's panel's own list: the home's lists are `list` slots too.
    const list = document
      .querySelector('[aria-labelledby="caw-needs"]')
      ?.closest<HTMLElement>('[data-slot="list"]');
    const rows = [
      ...document.querySelectorAll<HTMLElement>(
        '[aria-labelledby="caw-needs"] [data-slot="row"][data-kind="artifact"]'
      ),
    ];
    const box = (el: Element | null | undefined) => el?.getBoundingClientRect();
    const problems: string[] = [];
    const listBox = box(list);
    if (list && list.scrollWidth > list.clientWidth + 0.5) {
      problems.push(
        `the list scrolls sideways (${list.scrollWidth} > ${list.clientWidth})`
      );
    }
    for (const row of rows) {
      const id = row.dataset.artifact ?? "?";
      const r = box(row) as DOMRect;
      const name = box(row.querySelector('[data-slot="name"]'));
      const want = box(row.querySelector('[data-slot="want"]'));
      const meta = box(row.querySelector('[data-slot="meta"]'));
      const x = box(row.querySelector("[data-needs-card-not-now]"));
      const send = box(row.querySelector("[data-needs-card-send]"));
      const pad = Number.parseFloat(getComputedStyle(row).paddingInlineEnd);
      if (
        listBox &&
        (r.left < listBox.left - 0.5 || r.right > listBox.right + 0.5)
      ) {
        problems.push(`${id}: the row stands outside the list`);
      }
      for (const [what, b] of [
        ["title", name],
        ["reason", want],
        ["meta", meta],
        ["Not now", x],
        ["Send", send],
      ] as const) {
        if (b && (b.left < r.left - 0.5 || b.right > r.right + 0.5)) {
          problems.push(
            `${id}: its ${what} spills the row (${b.left}–${b.right} in ${r.left}–${r.right})`
          );
        }
      }
      if (!(name && want && meta && x)) {
        problems.push(`${id}: a line or its ✕ is missing`);
        continue;
      }
      if (!(name.bottom <= want.top + 0.5 && want.bottom <= meta.top + 0.5)) {
        problems.push(
          `${id}: its lines overlap (${name.bottom} ${want.top} ${want.bottom} ${meta.top})`
        );
      }
      if (name.right > x.left + 0.5) {
        problems.push(`${id}: its title runs under the ✕`);
      }
      // The ✕'s box hangs past the text edge, never past the row's own padding.
      if (x.right > r.right - pad + 13) {
        problems.push(`${id}: the ✕ hangs past the row's padding`);
      }
      if (send && meta.right > send.left + 0.5) {
        problems.push(`${id}: its meta runs under Send`);
      }
    }
    return { rows: rows.length, problems };
  });
  kit.check(
    `row boxes ${label}, ${engine} ${view} (${page.viewportSize()?.width}px): ${read.rows} artifact rows, nothing spills the list sideways, the lines stand in order inside the row, the ✕ and Send inside its edge`,
    read.rows >= expected && read.rows > 0 && read.problems.length === 0,
    read.problems.join("; ") || `${read.rows} rows`
  );
  await page.close();
};

const ROW_LEGS: { engine: Engine; view: View }[] = [
  { engine: "chromium", view: "phone" },
  { engine: "chromium", view: "narrowDesk" },
  { engine: "chromium", view: "desk" },
  { engine: "webkit", view: "phone" },
  { engine: "webkit", view: "narrowDesk" },
  { engine: "webkit", view: "desk" },
];

const run = async (kit: Kit) => {
  const fleet = await kit.fleet(respond);
  const phone = standInPhone(fleet);
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.launch("agent");
  await fleet.agentUp();
  await fleet.accountSignedIn();
  await phone.pair();
  const base = await fleet.dashboard();
  let calls = 0;
  const call = async (
    session: string,
    tool: string,
    input: object
  ): Promise<string> => {
    calls += 1;
    const marker = String(calls);
    asks.set(marker, { name: tool, input });
    await fleet.send(session, `PROBE-CALL:${marker}`);
    return (await until(
      `the ${tool} call (${marker})`,
      () => answered.get(marker),
      Boolean,
      180_000
    )) as string;
  };
  const at: At = { base, fleet, kit, call };
  const judging = await fleet.spawn("claude", "Judging", fleet.repo);
  const picking = await fleet.spawn("claude", "Picking", fleet.repo);
  const showing = await fleet.spawn("claude", "Showing", fleet.repo);

  await onlyOpenAsks(at, showing);
  const media = await fleet.spawn("claude", "Media", fleet.repo);
  await mediaAndGone(at, media);

  const judge = await notOpened(at, judging);
  // One item, at every width and in both engines.
  for (const leg of ROW_LEGS) {
    // biome-ignore lint/performance/noAwaitInLoops: one page at a time
    await rowBoxes(at, leg.engine, leg.view, "with one item");
  }
  await picks(at, picking);
  await pins(at, judging, judge);
  await pinAsks(at, judging, judge, phone);
  const writing = await fleet.spawn("claude", "Writing", fleet.repo);
  await movedOn(at, writing);
  const parking = await fleet.spawn("claude", "Parking", fleet.repo);
  const presence = await supersededAndNotNow(at, parking);
  const ending = await fleet.spawn("claude", "Ending", fleet.repo);
  await ended(at, ending);
  for (const harness of HARNESSES) {
    // biome-ignore lint/performance/noAwaitInLoops: one harness at a time, each push out before the next
    await onHarness(at, harness, phone);
  }
  await filesDot(at, parking, presence);
  // Many items, a 40-word ask among them.
  const many = await fleet.spawn("claude", "Many asks", fleet.repo);
  kit.check(
    "the long ask is 40 words inside the ask's 160 characters",
    LONG_ASK.split(" ").length === 40 && LONG_ASK.length <= 160,
    `${LONG_ASK.split(" ").length} words, ${LONG_ASK.length} characters`
  );
  for (const [n, ask] of [
    LONG_ASK,
    "Judge the new onboarding page",
    "Pick the plan's sheet heights",
    "Pick the tray's icons",
  ].entries()) {
    // biome-ignore lint/performance/noAwaitInLoops: one create at a time
    const id = await create(fleet, many, {
      kind: "page",
      does: n === 1 ? "judge" : "pick",
      ask,
      name: `many-${n + 1}`,
      html: kitPage(`Many ${n + 1}`, ["one", "two"]),
    });
    if (n === 0) {
      // Something written and not sent: its row stands Send.
      const page = await ownTab(at, id);
      const frame = page.frameLocator(FRAME);
      await frame.locator('[data-option="one-a"]').waitFor({ timeout: 60_000 });
      await pressIn(frame, '[data-option="one-a"]');
      await lineIs(fleet, id, "1 of 2 picked · 1 unsent");
      await page.close();
    }
  }
  await countAndArcs(at);
  for (const leg of ROW_LEGS) {
    // biome-ignore lint/performance/noAwaitInLoops: one page at a time
    await rowBoxes(
      at,
      leg.engine,
      leg.view,
      "with many items, a 40-word ask among them"
    );
  }
  const away = await fleet.spawn("claude", "Away", fleet.repo);
  await goneAtRegister(at, away);
  phone.stop();
};

const spec: Spec = { name: "artifact-needs", run };
export default spec;
