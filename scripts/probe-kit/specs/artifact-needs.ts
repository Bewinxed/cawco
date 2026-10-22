/**
 * Every artifact waiting on the person counts in Needs you, on every
 * surface that reads it, and leaves by a derived rule (core
 * artifact-needs.ts, hub artifacts/needs.ts). On a scratch fleet (real hub,
 * agent and sessiond; Claude Code against the mock model, with a stand-in
 * Cawrier and one paired phone), read from the hub's own answers
 * (`/api/artifact-needs`, `/api/pending`, a session's plan and artifacts,
 * the push the phone got), the dashboard's DOM and its boxes:
 *
 * Reasons, each with its row line:
 * - not opened: a judge page shown and never opened is "New · not opened";
 *   `/api/pending` carries it in its `artifact.needs` envelope.
 * - picks unmade: a decision page opened is "0 of 3 picked".
 * - unsent: a pick not sent is "1 of 3 picked · 1 unsent", Send counting 1;
 *   a pin written and not sent is "1 unsent".
 * - new answer: the agent's reply on a pin the person sent is "1 new answer
 *   on pin 1".
 *
 * Retirement:
 * - answered: a partial Send leaves the picks not made, once the session
 *   has read it; every pick sent, it leaves; a pin sent leaves; a look at
 *   the pin's answer leaves.
 * - the writer moved on: artifact_create of a pick page makes the session's
 *   current step wait on it (its plan's `waitsOn`); ticking that step takes
 *   it out. One made with no step in progress stands past its own turn's
 *   end, and leaves when the session's next turn ends.
 * - superseded: a same-name create revises it: one item, same id, its line
 *   in place.
 * - session ended: its conversation gone, it leaves Needs you and is one
 *   notice, "Claude Code ended; 2 picks on … never made".
 * - Not now: the row's notice id acknowledged, it leaves the lane and its
 *   Files list still says it waits; a revision brings it back.
 * - a look: opening clears "not opened"; a revision with nothing asked is
 *   the notice "… changed since you looked", and opening it clears it.
 *
 * Surfaces:
 * - Caw's head says the count of Needs you's rows and his rim draws as many
 *   arcs, artifacts among them.
 * - A session's Files card of a waiting artifact wears the needs-you dot
 *   centred on its picture's top-right corner, its reason on its meta line.
 * - The push of a turn that left an artifact waiting: `artifact-<id>`, the
 *   ask its sealed body, `cawco.kind` artifact, `CAWCO_TURN_OPEN`; a look at
 *   the artifact clears it.
 * - The artifact row's boxes at 390, 680 and 1440, in Chromium and WebKit,
 *   with one item and with many, a 40-word ask among them: nothing spills
 *   the list sideways, its lines stand in order inside the row, and its ✕
 *   and Send stand inside the row's trailing edge.
 *
 *   bun scripts/probe-kit/run.ts artifact-needs
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Page } from "playwright-core";
import {
  type ArtifactNeed,
  type ArtifactNeedNotice,
  type ArtifactNeedsRead,
  noticePartWords,
  reasonLine,
} from "../../../packages/core/src/artifact-needs";
import type { Envelope } from "../../../packages/core/src/index";
import { type Reply, type Seen, until } from "../../scratch-fleet";
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

const CREATE = "mcp__cawco__artifact_create";
const TODO = "mcp__cawco__todo_write";
const COMMAND = /PROBE-CALL:(\d+)/g;
/** The id in artifact_create's answer, as the tool result carries it. */
const ANSWERED_ID = /"id":"([0-9a-f-]{36})"/;
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
  "Pick one of the two new heads for the phone page so we can ship it to the app and the site and say why it is the one we want for all of the next pages too";

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

/** Calls `name` with `input`, loading it through ToolSearch first when it is deferred. */
const callTool = (request: Seen, name: string, input: object): Reply => {
  if (request.toolNames.includes(name)) {
    return { everyMs: 5, words: [], tool: { name, input } };
  }
  if (!request.toolNames.includes("ToolSearch")) {
    return text(`${name} is not offered`);
  }
  return {
    everyMs: 5,
    words: [],
    tool: {
      name: "ToolSearch",
      input: { query: `select:${name}`, max_results: 1 },
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
  const reply = callTool(request, ask.name, ask.input);
  if (reply.tool?.name === ask.name) {
    issued.add(marker);
  }
  return reply;
};

/* ── The stand-in phone: every push Cawrier is handed, opened with its key ── */

interface Pushed {
  collapseId?: string;
  payload: {
    aps?: { category?: string };
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
/** Its row line as the dashboard draws it, or null when it is not in Needs you. */
const lineOf = async (fleet: KitFleet, id: string): Promise<string | null> => {
  const need = await needOf(fleet, id);
  return need ? reasonLine(need.pending) : null;
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
  const line = await lineIs(fleet, id, "New · not opened");
  kit.check(
    "reason not opened: a judge page shown and never opened reads 'New · not opened'",
    line === "New · not opened",
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
  const before = await lineIs(fleet, id, "New · not opened · 0 of 3 picked");
  const page = await ownTab(at, id);
  const looked = await lineIs(fleet, id, "0 of 3 picked");
  kit.check(
    "reason picks unmade: a decision page opened reads '0 of 3 picked'; rule 6, the look took 'New · not opened' away",
    before === "New · not opened · 0 of 3 picked" && looked === "0 of 3 picked",
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
  // The session reads what was sent (artifact_read): the move is the person's again.
  await until(
    "the Send on the hub",
    () =>
      fleet.api<{ sentAt: string | null }>(
        `/api/instances/${session}/artifacts/${id}`
      ),
    (read) => !!read.sentAt,
    15_000
  ).catch(() => undefined);
  const partial = await lineIs(fleet, id, "1 of 3 picked");
  kit.check(
    "rule 1, answered in part: once the Send is read, the picks not made stand ('1 of 3 picked'), the unsent reason gone",
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

/** A pin: unsent, sent (answered), answered by the agent, looked at; then a revision with nothing asked. */
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
  const unsent = await lineIs(fleet, id, "1 unsent");
  kit.check(
    "reason unsent: a pin written and not sent reads '1 unsent'",
    unsent === "1 unsent",
    String(unsent)
  );
  await fleet.api(`/api/instances/${session}/artifacts/${id}/send`, {});
  const sent = await lineIs(fleet, id, null);
  kit.check(
    "rule 1, answered: the pin sent, it leaves Needs you",
    sent === null,
    String(sent)
  );
  await fleet.api(
    `/api/instances/${session}/artifacts/comments/probe-pin-1/reply`,
    { text: "It runs at nine, every weekday." }
  );
  const answer = await lineIs(fleet, id, "1 new answer on pin 1");
  kit.check(
    "reason new answer: the agent's reply on the pin reads '1 new answer on pin 1'",
    answer === "1 new answer on pin 1",
    String(answer)
  );
  await inDoc(page, (doc) => {
    const held = doc.getMap("pins");
    const pin = held.get("probe-pin-1");
    doc.transact(() =>
      held.set("probe-pin-1", { ...pin, seenAt: new Date().toISOString() })
    );
  });
  const read = await lineIs(fleet, id, null);
  kit.check(
    "rule 6, a look at the answer: the pin's thread seen, it leaves Needs you",
    read === null,
    String(read)
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
      words.endsWith(" changed since you looked") &&
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
  const made = await call(session, CREATE, {
    kind: "page",
    does: "pick",
    ask: "Pick the head for the phone project page",
    name: "phone-head",
    html: kitPage("The phone page's head", ["head", "size"]),
  });
  const id = made.match(ANSWERED_ID)?.[1] ?? "";
  const plan = await fleet.api<{
    steps: { id: string; waitsOn?: { artifactId: string; card?: string } }[];
  }>(`/api/instances/${session}/plan`);
  const wait = plan.steps.find((step) => step.id === "head")?.waitsOn;
  const standing = await lineIs(fleet, id, "New · not opened · 0 of 2 picked");
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
  const next = await call(session, CREATE, {
    kind: "page",
    does: "pick",
    ask: "Pick the color for the home tile",
    name: "tile-color",
    html: kitPage("The home tile's color", ["color"]),
  });
  const nextId = next.match(ANSWERED_ID)?.[1] ?? "";
  // Its own turn ends (the call answered, the mock's last words after it): it stands.
  await until(
    "the asking turn's end",
    () => turnEndedAt(fleet, session),
    (end) => end > calledAt,
    60_000
  );
  const after = await lineIs(fleet, nextId, "New · not opened · 0 of 1 picked");
  await fleet.send(session, "PROBE-NEXT go on with something else");
  const turned = await lineIs(fleet, nextId, null, 120_000);
  kit.check(
    "rule 2, the writer moved on: with no step waiting it stands past its own turn's end, and leaves once the session's next turn ends",
    after === "New · not opened · 0 of 1 picked" && turned === null,
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
  const first = await lineIs(fleet, id, "New · not opened · 0 of 2 picked");
  const again = await create(
    fleet,
    session,
    page(["layout", "tone", "density"])
  );
  const second = await lineIs(fleet, id, "New · not opened · 0 of 3 picked");
  const named = (await lane(fleet)).needs.filter(
    (one) => one.name === "presence-page"
  );
  kit.check(
    "rule 3, superseded: a same-name create is the same item, one row, its line changed in place",
    again === id &&
      first !== null &&
      second === "New · not opened · 0 of 3 picked" &&
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
    "rule 5, Not now: it leaves Needs you and its Files list still says it waits",
    parked === null && files.find((one) => one.id === id)?.waiting === true,
    `line ${parked}; files ${JSON.stringify(files.find((one) => one.id === id))}`
  );
  await create(fleet, session, page(["layout", "tone", "density", "motion"]));
  const back = await lineIs(fleet, id, "New · not opened · 0 of 4 picked");
  kit.check(
    "rule 5, Not now: a revision raises it again, back in Needs you",
    back === "New · not opened · 0 of 4 picked" &&
      ((await needOf(fleet, id))?.raisedAt ?? 0) > need.raisedAt,
    String(back)
  );
  return id;
};

/** Rule 4: its session ended, it is one notice. */
const ended = async (at: At, session: string) => {
  const { fleet, kit } = at;
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
  // Its conversation gone, as the hub records Claude Code's refusal to resume it.
  fleet.write(
    "UPDATE instances SET last_error_kind = 'conversation-gone' WHERE id = ?",
    session
  );
  const left = await lineIs(fleet, id, null);
  const notice = await noticeOf(fleet, id);
  const words = notice
    ? notice.parts.map((part) => noticePartWords(part, notice.name)).join(" · ")
    : null;
  kit.check(
    "rule 4, its session ended: it leaves Needs you and is one notice, 'Claude Code ended; 2 picks on pairing never made'",
    stood !== null &&
      left === null &&
      words === "Claude Code ended; 2 picks on pairing never made",
    `stood ${stood}; left ${left}; notice ${words}`
  );
};

/** The push of a turn that left an artifact waiting, and its clear by a look. */
const pushed = async (
  at: At,
  session: string,
  phone: ReturnType<typeof standInPhone>
): Promise<string> => {
  const { fleet, kit, call } = at;
  const ask = "Pick the head for the phone project page";
  const made = await call(session, CREATE, {
    kind: "page",
    does: "pick",
    ask,
    name: "push-head",
    html: kitPage("The head", ["head"]),
  });
  const id = made.match(ANSWERED_ID)?.[1] ?? "";
  const push = await until(
    "the artifact's push",
    () => phone.pushed.find((one) => one.collapseId === `artifact-${id}`),
    Boolean,
    PUSH_MS
  ).catch(() => undefined);
  const sealed = push?.payload.e ? await phone.open(push.payload.e) : null;
  kit.check(
    "push: the turn that left it waiting pushed under artifact-<id>, its sealed body the ask, cawco.kind artifact, category CAWCO_TURN_OPEN (Open only)",
    !!push &&
      sealed?.body === ask &&
      push.payload.cawco?.kind === "artifact" &&
      push.payload.cawco.artifactId === id &&
      push.payload.aps?.category === "CAWCO_TURN_OPEN" &&
      !phone.pushed.some((one) => one.collapseId === `turn-${session}`),
    JSON.stringify({
      push: push?.payload.cawco,
      category: push?.payload.aps?.category,
      sealed,
    })
  );
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
    "no `cleared (look)` line for it in the hub's log"
  );
  await page.close();
  return id;
};

/* ── The dashboard: the count and arcs, Files' dot, the row's boxes ─────── */

/** Caw's panel opened on `page`: its Needs-you rows. */
const cawPanel = async (page: Page): Promise<void> => {
  await page.locator("[data-needs-caw]").click();
  await page.locator('[data-slot="list"]').first().waitFor({ timeout: 15_000 });
  await settle(page, 400);
};

const countAndArcs = async (at: At) => {
  const { fleet, kit, base } = at;
  const page = await kit.page("desk");
  await open(page, `${base}/session`, "[data-needs-caw]");
  const expected = (await lane(fleet)).needs.map((need) => need.artifactId);
  await cawPanel(page);
  const read = await until(
    "Caw's panel listing the lane's artifacts",
    () =>
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
            .map((row) => row.dataset.artifact)
            .filter((id): id is string => !!id),
        };
      }),
    (now) => expected.every((id) => now.artifacts.includes(id)),
    LANE_MS
  ).catch(() => null);
  kit.check(
    "the home count and Caw's arcs include it: his label says 'Needs you, N' and his rim N arcs, N the panel's Needs-you rows, every artifact the hub lists among them",
    !!read &&
      read.artifacts.length === expected.length &&
      read.label.startsWith(`Needs you, ${read.rows}`) &&
      read.arcs === read.rows &&
      read.rows >= expected.length,
    JSON.stringify({ read, expected })
  );
  await page.close();
};

const filesDot = async (at: At, session: string, id: string) => {
  const { kit, base } = at;
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
  kit.check(
    "the Files card wears the dot: a 6px needs-you dot centred on its picture's top-right corner, the picture cut round it, its reason on its meta line",
    !!read.dot &&
      !!read.well &&
      Math.abs(read.dot.x - read.well.right) <= 0.5 &&
      Math.abs(read.dot.y - read.well.top) <= 0.5 &&
      Math.abs(read.dot.size - 6) <= 0.5 &&
      read.cut &&
      read.reason === "New",
    JSON.stringify(read)
  );
  await page.close();
};

/** The artifact rows' boxes in Caw's panel, at one width in one engine. */
const rowBoxes = async (at: At, engine: Engine, view: View, label: string) => {
  const { kit, base, fleet } = at;
  const page = await kit.page(view, { engine });
  await open(page, `${base}/session`, "[data-needs-caw]");
  const expected = (await lane(fleet)).needs.length;
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
    const list = document.querySelector(
      '[data-slot="list"]'
    ) as HTMLElement | null;
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

  const judge = await notOpened(at, judging);
  // One item, at every width and in both engines.
  for (const leg of ROW_LEGS) {
    // biome-ignore lint/performance/noAwaitInLoops: one page at a time
    await rowBoxes(at, leg.engine, leg.view, "with one item");
  }
  await picks(at, picking);
  await pins(at, judging, judge);
  const writing = await fleet.spawn("claude", "Writing", fleet.repo);
  await movedOn(at, writing);
  const parking = await fleet.spawn("claude", "Parking", fleet.repo);
  const presence = await supersededAndNotNow(at, parking);
  const ending = await fleet.spawn("claude", "Ending", fleet.repo);
  await ended(at, ending);
  const pushing = await fleet.spawn("claude", "Pushing", fleet.repo);
  await pushed(at, pushing, phone);
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
  phone.stop();
};

const spec: Spec = { name: "artifact-needs", run };
export default spec;
