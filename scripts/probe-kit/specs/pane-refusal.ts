/**
 * A write the hub would not keep is never a closed socket and a lost copy
 * (Pi Durable 13.9C, hub artifacts/sync.ts `refusal`; dashboard
 * preview/artifact-doc.ts `refusedBy`, PreviewPane `refusedReplies`). On a
 * scratch fleet (real hub, agent and sessiond; Claude Code against the mock
 * model), a session's judge page with one comment of the person's on it:
 *
 * - (h) The hub: a doc client writes a pin the hub refuses. It is told why
 *   on its socket, which stays open; the next write on that socket is not
 *   kept; a fresh client's write is, and the hub's doc holds nothing
 *   pending.
 * - (p) The pane: its link from the hub held (the probe's route keeps what
 *   the hub sends it), the agent answers the comment, and the person replies
 *   in the pane, which has not heard the answer. The hub refuses the reply,
 *   whichever write wins the merge (hub artifacts/sync.ts: one that drops
 *   the agent's answer, `pinsProblem`; one that loses to it, whose words
 *   would be gone, `crossedProblem`), and the reply stays in its row and
 *   thread, unsent, with the hub's reason and Try again, kept on the device. Try again lands it on
 *   the hub beside the agent's answer, the row's reason goes, and the hub's
 *   doc holds nothing pending.
 *
 *   bun scripts/probe-kit/run.ts pane-refusal
 */
import type { Page, WebSocketRoute } from "playwright-core";
import { messageAuth, WebsocketProvider } from "y-websocket";
import { Doc } from "yjs";
import { commentWords } from "../../../packages/core/src/words/comments";
import { type Reply, type Seen, until } from "../../scratch-fleet";
import { type Kit, type KitFleet, open, type Spec, settle } from "../kit";

const CREATE = "mcp__cawco__artifact_create";
const REPLY_TOOL = "mcp__cawco__comment_reply";
const ANSWERED_ID = /"id":"([0-9a-f-]{36})"/;
const CALL = /PROBE-PR-CALL:(\d+)/g;
const PANE = ':is([data-slot="preview-pane"], [data-side-card="preview"])';
const RAIL = '[data-slot="comment-rail"]';
/** The pane's own link to the doc, through the dashboard's relay (artifact-doc.ts). */
const PANE_SOCKET = /\/ws\/artifact\/[0-9a-f-]{36}\/[0-9a-f-]{36}$/;

const text = (words: string): Reply => ({ everyMs: 5, words: [words] });
const asks = new Map<string, { input: object; name: string }>();
const issued = new Set<string>();
const answered = new Map<string, string>();

const respond = (request: Seen): Reply => {
  if (!request.tools) {
    return text("Probe title");
  }
  const marker = [...request.all.matchAll(CALL)].at(-1)?.[1];
  const ask = marker ? asks.get(marker) : undefined;
  if (!(marker && ask)) {
    return text("Heard.");
  }
  if (issued.has(marker)) {
    if (!answered.has(marker)) {
      answered.set(marker, request.last);
    }
    return text("done");
  }
  if (request.toolNames.includes(ask.name)) {
    issued.add(marker);
    return {
      everyMs: 5,
      words: [],
      tool: { name: ask.name, input: ask.input },
    };
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

let calls = 0;
/** A tool call the mock makes in session `to`, and the tool's answer. */
const callIn = async (
  fleet: KitFleet,
  to: string,
  name: string,
  input: object
): Promise<string> => {
  calls += 1;
  const marker = String(calls);
  asks.set(marker, { name, input: { response_format: "detailed", ...input } });
  await fleet.send(to, `PROBE-PR-CALL:${marker}`);
  return await until(
    `the ${name} call (${marker})`,
    () => answered.get(marker),
    Boolean,
    180_000
  );
};

/** A doc client of the probe's own on the hub's pane socket, and what the hub told it. */
interface Client {
  closes: number[];
  doc: Doc;
  leave: () => void;
  link: WebsocketProvider;
  refusals: string[];
}

const joinHub = async (
  fleet: KitFleet,
  session: string,
  artifact: string
): Promise<Client> => {
  const doc = new Doc();
  const link = new WebsocketProvider(
    `ws://${fleet.hub.at}:${new URL(fleet.base).port}/ws/artifact/${session}`,
    artifact,
    doc,
    { disableBc: true, WebSocketPolyfill: WebSocket as never }
  );
  const refusals: string[] = [];
  const closes: number[] = [];
  // The hub's refusal (y-protocols' permission denied, under y-websocket's auth type): heard, its words left unread.
  link.messageHandlers[messageAuth] = () => {
    refusals.push(new Date().toISOString());
  };
  link.on("connection-close", (event: CloseEvent | null) => {
    closes.push(event?.code ?? 0);
  });
  await until("a doc client joined", () => link.synced, Boolean, 30_000);
  return {
    doc,
    link,
    refusals,
    closes,
    leave: () => {
      link.destroy();
      doc.destroy();
    },
  };
};

/** The hub's doc as a fresh client reads it: its pins, and whether anything waits there unintegrated. */
const hubDoc = async (fleet: KitFleet, session: string, artifact: string) => {
  const client = await joinHub(fleet, session, artifact);
  const pins = client.doc.getMap("pins").toJSON() as Record<
    string,
    { thread: { by: string; text: string }[] }
  >;
  const pending =
    client.doc.store.pendingStructs !== null ||
    client.doc.store.pendingDs !== null;
  client.leave();
  return { pins, pending };
};

const personPin = (id: string, number: number, words: string) => {
  const at = new Date().toISOString();
  return {
    id,
    number,
    kind: "comment",
    anchor: {
      selector: "body > main",
      source: null,
      text: "A page to pin.",
      box: { x: 0, y: 0, w: 200, h: 80 },
    },
    at,
    by: "person",
    elements: [],
    point: { x: 0.5, y: 0.5 },
    thread: [{ id: crypto.randomUUID(), by: "person", text: words, at }],
  };
};

/** (h) The hub tells a refused writer why on a socket that stays, keeps nothing more from it, and keeps a fresh client's write. */
const legH = async (
  kit: Kit,
  fleet: KitFleet,
  session: string,
  artifact: string
) => {
  const writer = await joinHub(fleet, session, artifact);
  const bad = crypto.randomUUID();
  const after = crypto.randomUUID();
  // An entry past its bound (core comments.ts `COMMENT_LIMITS.text`).
  writer.doc
    .getMap("pins")
    .set(bad, personPin(bad, 7, "PROBE-TOO-LONG ".repeat(4000)));
  await until(
    "(h) the hub's refusal",
    () => writer.refusals[0],
    Boolean,
    15_000
  ).catch(() => undefined);
  writer.doc
    .getMap("pins")
    .set(after, personPin(after, 8, "PROBE-AFTER-REFUSAL"));
  await Bun.sleep(3000);
  const stood = writer.link.wsconnected;
  const closed = writer.closes.length;
  const later = await hubDoc(fleet, session, artifact);
  writer.leave();
  const fresh = await joinHub(fleet, session, artifact);
  const good = crypto.randomUUID();
  fresh.doc.getMap("pins").set(good, personPin(good, 9, "PROBE-FRESH-WRITE"));
  const landed = await until(
    "(h) a fresh client's write on the hub",
    async () => (await hubDoc(fleet, session, artifact)).pins[good],
    Boolean,
    15_000
  ).catch(() => undefined);
  fresh.leave();
  const end = await hubDoc(fleet, session, artifact);
  kit.check(
    "(h) a write the hub refuses is told its writer on a socket that stays open, never a close; the next write on that socket is not kept; a fresh client's is, and nothing waits pending on the hub",
    writer.refusals.length > 0 &&
      closed === 0 &&
      stood &&
      !later.pins[bad] &&
      !later.pins[after] &&
      !later.pending &&
      !!landed &&
      !end.pending,
    `refusals heard: ${writer.refusals.length}; closes before it left: ${closed}; socket open after: ${stood}; refused pin on the hub: ${!!later.pins[bad]}; the later write on the hub: ${!!later.pins[after]}; pending then: ${later.pending}; fresh write landed: ${!!landed}; pending at the end: ${end.pending}`
  );
  // The fresh pin goes again, so the pane's leg reads one comment.
  const tidy = await joinHub(fleet, session, artifact);
  tidy.doc.getMap("pins").delete(good);
  await Bun.sleep(1000);
  tidy.leave();
};

/** The pane's links, newest last: each passes through, or holds the doc updates the hub sends while `held`. */
interface PaneLink {
  held: boolean;
  queue: (string | Buffer)[];
  ws: WebSocketRoute;
}

/** The person's reply in pin 1's thread, opened from its row. */
const replyInPane = async (page: Page, words: string) => {
  const button = page.locator(`${PANE} button[data-slot="comments"]`);
  if ((await button.getAttribute("aria-expanded")) !== "true") {
    await button.click();
  }
  await page.locator(RAIL).waitFor({ timeout: 10_000 });
  await settle(page, 350);
  await page.locator(`${RAIL} [data-slot="pin-row"][data-pin-row="1"]`).click();
  const card = page.locator('[data-slot="pin-card"][data-pin-card="1"]');
  await card.waitFor({ timeout: 10_000 });
  await card.getByRole("combobox").fill(words);
  await card.getByRole("button", { name: "Reply" }).click();
  await settle(page, 300);
  await page.keyboard.press("Escape");
};

/** What leg (p) works with: the fleet, its session and page, the pane's links, and its page errors. */
interface Pane {
  artifact: string;
  base: string;
  errors: string[];
  fleet: KitFleet;
  kit: Kit;
  links: PaneLink[];
  page: Page;
  session: string;
}

/** The pane's replies kept aside on the device (PreviewPane `refusedReplies`), as stored: null when none. */
const keptOf = (on: Pane) =>
  on.page.evaluate(
    (key) => localStorage.getItem(key),
    `cawco-refused-replies:${on.artifact}`
  );

/** Hands a held link what it kept, to a link the pane may have let go of after a refusal: what fails is nothing to hand on. */
const letGo = (link: PaneLink | undefined) => {
  if (!link) {
    return;
  }
  link.held = false;
  for (const message of link.queue.splice(0)) {
    try {
      link.ws.send(message);
    } catch {
      return;
    }
  }
};

/**
 * The pane's link from the hub held, the agent answers pin 1, and the
 * person replies in the pane, which hasn't heard it. The reply's words and
 * the hub's reason, kept on the device once the hub refused it; nothing
 * when nothing was kept.
 */
const tryStale = async (
  on: Pane
): Promise<{ why: string; words: string } | undefined> => {
  await open(
    on.page,
    `${on.base}/session/${on.session}`,
    "[data-artifact-trigger]"
  );
  await on.page
    .locator(`${PANE} button[data-slot="comments"]`)
    .waitFor({ timeout: 60_000 });
  await settle(on.page, 600);
  const link = on.links.at(-1);
  if (link) {
    link.held = true;
  }
  await callIn(on.fleet, on.session, REPLY_TOOL, {
    pin: (await pinOne(on.fleet, on.session, on.artifact)) ?? "",
    text: "PROBE-AGENT-ANSWER",
  });
  const words = "PROBE-PANE-REPLY";
  await replyInPane(on.page, words);
  const stored = await until(
    "(p) the pane's reply refused",
    () => keptOf(on),
    Boolean,
    8000
  ).catch(() => null);
  letGo(link);
  if (!stored) {
    return;
  }
  const said = JSON.parse(stored) as Record<
    string,
    { entries: { text: string }[]; why: string }
  >;
  const [one] = Object.values(said);
  return one?.entries.some((entry) => entry.text === words)
    ? { why: one.why, words }
    : undefined;
};

/** The rail open, and pin 1's row in it. */
const railRow = async (page: Page) => {
  const button = page.locator(`${PANE} button[data-slot="comments"]`);
  if ((await button.getAttribute("aria-expanded")) !== "true") {
    await button.click();
  }
  const row = page.locator(`${RAIL} [data-slot="pin-row"][data-pin-row="1"]`);
  await row.waitFor({ timeout: 10_000 });
  return row;
};

/** The refused reply as the pane draws it: its row's not-sent line and Try again, and its thread. */
const checkKept = async (on: Pane, refused: { why: string; words: string }) => {
  const row = await railRow(on.page);
  const line = (
    await on.page
      .locator(`${RAIL} [data-not-sent]`)
      .first()
      .textContent({ timeout: 10_000 })
      .catch(() => null)
  )?.trim();
  const retryShown = await on.page
    .locator(`${RAIL} [data-slot="pin-retry"]`)
    .first()
    .isVisible()
    .catch(() => false);
  await row.click();
  const card = on.page.locator('[data-slot="pin-card"][data-pin-card="1"]');
  await card.waitFor({ timeout: 10_000 });
  const thread = (await card.textContent()) ?? "";
  await on.page.keyboard.press("Escape");
  on.kit.check(
    "(p) a pane reply the hub refuses stays in its thread, unsent, its row saying the hub's reason with Try again, and kept on the device",
    line === commentWords.notSent(refused.why) &&
      retryShown &&
      thread.includes(refused.words),
    `row: ${line ?? "no not-sent line"}; Try again: ${retryShown}; thread holds the reply: ${thread.includes(refused.words)}; reason kept: ${refused.why}`
  );
};

/** Try again on the refused reply: it lands on the hub, and nothing is left aside or pending. */
const checkRetry = async (on: Pane, words: string) => {
  await railRow(on.page);
  await on.page.locator(`${RAIL} [data-slot="pin-retry"]`).first().click();
  const landed = await until(
    "(p) Try again's reply on the hub",
    async () => {
      const now = await hubDoc(on.fleet, on.session, on.artifact);
      const pin = Object.values(now.pins).find((one) =>
        one.thread.some(
          (entry) => entry.by === "person" && entry.text === words
        )
      );
      return pin ? { now, pin } : undefined;
    },
    Boolean,
    30_000
  ).catch(() => undefined);
  await settle(on.page, 1000);
  const after = await notSentLines(on.page);
  const left = await keptOf(on);
  on.kit.check(
    "(p) Try again lands the reply on the hub beside the agent's answers, the row's reason goes, nothing is kept aside, and nothing waits pending on the hub",
    !!landed &&
      landed.pin.thread.some((entry) => entry.by === "agent") &&
      !landed.now.pending &&
      after === 0 &&
      left === null,
    `landed: ${landed ? JSON.stringify(landed.pin.thread.map((entry) => `${entry.by}: ${entry.text}`)) : "not within 30 s"}; pending: ${landed?.now.pending}; not-sent lines after: ${after}; kept on the device: ${left ?? "nothing"}; page errors: ${on.errors.join(" / ") || "none"}`
  );
};

/** (p) A pane reply the hub refuses stays in its thread with why and Try again, and Try again lands it. */
const legP = async (
  kit: Kit,
  fleet: KitFleet,
  session: string,
  artifact: string
) => {
  const page = await kit.page("desk");
  const on: Pane = {
    artifact,
    base: await fleet.dashboard(),
    errors: [],
    fleet,
    kit,
    links: [],
    page,
    session,
  };
  await page.routeWebSocket(PANE_SOCKET, (ws) => {
    const server = ws.connectToServer();
    const link: PaneLink = { ws, held: false, queue: [] };
    on.links.push(link);
    ws.onMessage((message) => server.send(message));
    // Held, the doc's updates wait (y-protocols sync, type 0); the hub's
    // word on the pane's own writes (auth, type 2) and its beat go through.
    server.onMessage((message) => {
      if (link.held && typeof message !== "string" && message[0] === 0) {
        link.queue.push(message);
      } else {
        ws.send(message);
      }
    });
  });
  page.on("pageerror", (error) => on.errors.push(error.message));
  const refused = await tryStale(on);
  if (refused) {
    await settle(page, 600);
    await checkKept(on, refused);
    await checkRetry(on, refused.words);
  } else {
    kit.check(
      "(p) the hub refuses a stale pane reply, and the pane keeps it aside",
      false,
      `nothing kept on the device within 8 s; page errors: ${on.errors.join(" / ") || "none"}`
    );
  }
  await page.close();
};

/** How many not-sent lines the rail draws. */
const notSentLines = (page: Page) =>
  page.locator(`${RAIL} [data-not-sent]`).count();

/** Pin 1's id on the hub. */
const pinOne = async (fleet: KitFleet, session: string, artifact: string) => {
  const { pins } = await hubDoc(fleet, session, artifact);
  return Object.entries(pins).find(
    ([, pin]) => (pin as unknown as { number: number }).number === 1
  )?.[0];
};

const run = async (kit: Kit) => {
  const fleet = await kit.fleet(respond);
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.launch("agent");
  await fleet.agentUp();
  await fleet.accountSignedIn();
  const session = await fleet.spawn("claude", "Pane refusal");
  await fleet.send(session, "hello");
  const made = await callIn(fleet, session, CREATE, {
    kind: "page",
    does: "judge",
    ask: "Judge this page: pin anything that reads wrong",
    name: "pane-refusal",
    html: "<!doctype html><html><body><main><h1>Refusal</h1><p>A page to pin.</p></main></body></html>",
  });
  const artifact = made.match(ANSWERED_ID)?.[1];
  if (!artifact) {
    kit.check("the page is made", false, made.slice(0, 400));
    return;
  }
  const seed = await joinHub(fleet, session, artifact);
  const pin = crypto.randomUUID();
  seed.doc.getMap("pins").set(pin, personPin(pin, 1, "PROBE-PERSON-COMMENT"));
  await Bun.sleep(1000);
  seed.leave();
  await legH(kit, fleet, session, artifact);
  await legP(kit, fleet, session, artifact);
};

export default { name: "pane-refusal", run } satisfies Spec;
