/**
 * Writes to one pin from many places all land, and a write the hub would
 * not keep is never a closed socket and a lost copy (Pi Durable 13.9C; hub
 * artifacts/sync.ts `refusal`; core comments.ts `PIN_MAPS`, each part of a
 * pin its own key; overlay artifact.ts `keepRefused`). On a scratch fleet
 * (real hub, agent and sessiond; Claude Code against the mock model), a
 * session's judge page with two comments of the person's on it:
 *
 * - (h) The hub: a doc client writes a pin the hub refuses. It is told why
 *   on its socket, which stays open; the next write on that socket is not
 *   kept; a fresh client's write is, and the hub's doc holds nothing
 *   pending.
 * - (m) Two doc clients, both offline, write to comment 2 at once: one a
 *   reply, the other a resolve and an anchor move. Back online, all three
 *   are on the hub, in its doc and in what comment_read reads.
 * - (p) The pane: its link from the hub held (the probe's route keeps what
 *   the hub sends it), the agent answers comment 1, and the person replies
 *   in the pane, which has not heard the answer. The reply and the answer
 *   both land on the hub, the hub refuses nothing, the pane keeps nothing
 *   aside, and its thread draws both once its link is let through.
 * - (o) The page's overlay, on a second page holding all but one of the
 *   comments a page keeps: its link from the hub held, another client takes
 *   the last place, and the page writes a comment as the overlay writes
 *   one. The hub refuses it on the page's socket, which it doesn't close;
 *   the page keeps the comment aside, its row in the rail saying the hub's
 *   reason with Try again. With room again, Try again lands it on the hub,
 *   and the page keeps nothing aside.
 * - (w) A doc the hub kept with each pin one whole value (as every doc stored
 *   before pins were written in parts): the hub, started again, keeps it in
 *   its parts as it loads it, and comment_read reads the pin as it was.
 *
 *   bun scripts/probe-kit/run.ts pane-refusal
 */
import type { Frame, Page, WebSocketRoute } from "playwright-core";
import { messageAuth, WebsocketProvider } from "y-websocket";
import { applyUpdate, Doc, encodeStateAsUpdate, encodeStateVector } from "yjs";
import {
  COMMENT_LIMITS,
  deletePin,
  type Pin,
  pinDelivered,
  placeOf,
  placePin,
  readPin,
  readPins,
  replyToPin,
  resolvePin,
  writePin,
} from "../../../packages/core/src/comments";
import { commentWords } from "../../../packages/core/src/words/comments";
import type { CommentRead } from "../../../packages/hub/src/artifacts/service";
import { type Reply, type Seen, until } from "../../scratch-fleet";
import { type Kit, type KitFleet, open, type Spec, settle } from "../kit";
import { pagePins, writePagePins } from "../pins";

const CREATE = "mcp__cawco__artifact_create";
const REPLY_TOOL = "mcp__cawco__comment_reply";
const ANSWERED_ID = /"id":"([0-9a-f-]{36})"/;
const CALL = /PROBE-PR-CALL:(\d+)/g;
const PANE = ':is([data-slot="preview-pane"], [data-side-card="preview"])';
const RAIL = '[data-slot="comment-rail"]';
const FRAME = `${PANE} iframe[title="Preview"]`;
/** The pane's own link to the doc, through the dashboard's relay (artifact-doc.ts). */
const PANE_SOCKET = /\/ws\/artifact\/[0-9a-f-]{36}\/[0-9a-f-]{36}$/;
/** The page's own link to the doc, on its preview origin (overlay artifact.ts). */
const PAGE_SOCKET = /\/__cawco\/artifact\/[0-9a-f-]{36}/;
const PAGE_HTML =
  "<!doctype html><html><body><main><h1>Refusal</h1><p>A page to pin.</p></main></body></html>";

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

/** The hub's doc as a fresh client reads it: its pins, whole, and whether anything waits there unintegrated. */
const hubDoc = async (fleet: KitFleet, session: string, artifact: string) => {
  const client = await joinHub(fleet, session, artifact);
  const pins = Object.fromEntries(readPins(client.doc));
  const pending =
    client.doc.store.pendingStructs !== null ||
    client.doc.store.pendingDs !== null;
  client.leave();
  return { pins, pending };
};

const personPin = (id: string, number: number, words: string): Pin => {
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
  writePin(writer.doc, personPin(bad, 7, "PROBE-TOO-LONG ".repeat(4000)));
  await until(
    "(h) the hub's refusal",
    () => writer.refusals[0],
    Boolean,
    15_000
  ).catch(() => undefined);
  writePin(writer.doc, personPin(after, 8, "PROBE-AFTER-REFUSAL"));
  await Bun.sleep(3000);
  const stood = writer.link.wsconnected;
  const closed = writer.closes.length;
  const later = await hubDoc(fleet, session, artifact);
  writer.leave();
  const fresh = await joinHub(fleet, session, artifact);
  const good = crypto.randomUUID();
  writePin(fresh.doc, personPin(good, 9, "PROBE-FRESH-WRITE"));
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
  // The fresh pin goes again, so the pane's leg reads its two comments.
  const tidy = await joinHub(fleet, session, artifact);
  deletePin(tidy.doc, good);
  await Bun.sleep(1000);
  tidy.leave();
};

/** Where the merge leg moves comment 2: the page's heading. */
const MOVED_TO = {
  selector: "body > main > h1",
  source: null,
  text: "Refusal",
};

/** (m) Two clients, offline, write a reply, a resolve and an anchor move to one pin at once: all three are on the hub once they are back. */
const legM = async (
  kit: Kit,
  fleet: KitFleet,
  session: string,
  artifact: string,
  pin: string
) => {
  const replier = await joinHub(fleet, session, artifact);
  const resolver = await joinHub(fleet, session, artifact);
  replier.link.disconnect();
  resolver.link.disconnect();
  const offline = await until(
    "(m) both clients offline",
    () => !(replier.link.wsconnected || resolver.link.wsconnected),
    Boolean,
    10_000
  ).catch(() => false);
  // Neither has heard the other: each writes on the pin as it last had it.
  const replied = replyToPin(replier.doc, pin, { text: "PROBE-MERGE-REPLY" });
  const resolved = resolvePin(resolver.doc, pin, true);
  const was = readPin(resolver.doc, pin);
  if (was) {
    placePin(resolver.doc, pin, { ...placeOf(was), anchor: MOVED_TO });
  }
  replier.link.connect();
  resolver.link.connect();
  const all = (seen: Pin | undefined) =>
    !!seen &&
    seen.thread.some((entry) => entry.text === "PROBE-MERGE-REPLY") &&
    !!seen.resolvedAt &&
    seen.resolvedBy === "person" &&
    "selector" in seen.anchor &&
    seen.anchor.selector === MOVED_TO.selector;
  const landed = await until(
    "(m) the reply, the resolve and the move on the hub",
    async () => {
      const now = await hubDoc(fleet, session, artifact);
      return all(now.pins[pin]) ? now : undefined;
    },
    Boolean,
    15_000
  ).catch(() => undefined);
  const read = await fleet.api<CommentRead>(
    `/api/instances/${session}/artifacts/comments?artifact=${artifact}&filter=all`
  );
  const told = read.artifacts[0]?.pins.find((one) => one.id === pin);
  replier.leave();
  resolver.leave();
  const end = await hubDoc(fleet, session, artifact);
  const held = end.pins[pin];
  kit.check(
    "(m) a reply on one client and a resolve and an anchor move on another, written at once to one pin, all land: the hub's doc and comment_read's read hold all three, nothing pending",
    offline &&
      replied === null &&
      resolved === null &&
      !!was &&
      !!landed &&
      all(told) &&
      !end.pending,
    `offline first: ${offline}; written: reply ${replied ?? "ok"}, resolve ${resolved ?? "ok"}, move ${was ? "ok" : "no pin"}; on the hub: ${held ? JSON.stringify({ thread: held.thread.map((entry) => entry.text), resolvedAt: held.resolvedAt, resolvedBy: held.resolvedBy, anchor: held.anchor }) : "no pin"}; comment_read: ${told ? JSON.stringify({ entries: told.thread.length, resolvedAt: told.resolvedAt, anchor: told.anchor }) : "no pin"}; pending: ${end.pending}`
  );
};

/** A link of the page's or the pane's to the hub, through the probe: it passes, or holds the doc updates the hub sends while `held`. */
interface Held {
  held: boolean;
  /** The hub closed it, before the page did. */
  hubClosed: boolean;
  /** The page closed it (the hub's close that follows is its answer). */
  pageClosed: boolean;
  queue: (string | Buffer)[];
  /** Refusal frames the hub sent on it (y-websocket's auth type). */
  refusals: number;
  ws: WebSocketRoute;
}

/**
 * Each link `pattern` names, through the probe, newest last. Held, the
 * doc's updates wait (y-protocols sync, type 0); the hub's word on the
 * client's own writes (auth, type 2) and its beat go through. Closes go
 * on to the other side, as without the probe.
 */
const routeLinks = async (page: Page, pattern: RegExp): Promise<Held[]> => {
  const links: Held[] = [];
  await page.routeWebSocket(pattern, (ws) => {
    const server = ws.connectToServer();
    const link: Held = {
      ws,
      held: false,
      queue: [],
      refusals: 0,
      hubClosed: false,
      pageClosed: false,
    };
    links.push(link);
    ws.onMessage((message) => server.send(message));
    server.onMessage((message) => {
      const type = typeof message === "string" ? -1 : message[0];
      if (type === messageAuth) {
        link.refusals += 1;
      }
      if (link.held && type === 0) {
        link.queue.push(message);
      } else {
        ws.send(message);
      }
    });
    ws.onClose((code, reason) => {
      link.pageClosed = true;
      server.close({ code, reason }).catch(() => undefined);
    });
    server.onClose((code, reason) => {
      link.hubClosed ||= !link.pageClosed;
      ws.close({ code, reason }).catch(() => undefined);
    });
  });
  return links;
};

/** Hands a held link what it kept, to a link the client may have let go of: what fails is nothing to hand on. */
const letThrough = (link: Held | undefined) => {
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

/** The rail open, and comment `n`'s row in it. */
const railRow = async (page: Page, n: number) => {
  const button = page.locator(`${PANE} button[data-slot="comments"]`);
  if ((await button.getAttribute("aria-expanded")) !== "true") {
    await button.click();
  }
  const row = page.locator(
    `${RAIL} [data-slot="pin-row"][data-pin-row="${n}"]`
  );
  await row.waitFor({ timeout: 10_000 });
  return row;
};

/** Comment `n`'s not-sent line in the rail, as drawn; null when it draws none. */
const notSentOf = async (page: Page, n: number) =>
  (
    await page
      .locator(
        `${RAIL} li:has([data-slot="pin-row"][data-pin-row="${n}"]) [data-not-sent]`
      )
      .textContent({ timeout: 2000 })
      .catch(() => null)
  )?.trim() ?? null;

/** The person's reply in comment 1's thread, opened from its row. */
const replyInPane = async (page: Page, words: string) => {
  await railRow(page, 1);
  await settle(page, 350);
  await page.locator(`${RAIL} [data-slot="pin-row"][data-pin-row="1"]`).click();
  const card = page.locator('[data-slot="pin-card"][data-pin-card="1"]');
  await card.waitFor({ timeout: 10_000 });
  await card.getByRole("combobox").fill(words);
  await card.getByRole("button", { name: "Reply" }).click();
  await settle(page, 300);
  await page.keyboard.press("Escape");
};

/** Comment 1's thread as the pane draws it. */
const threadInPane = async (page: Page) => {
  await (await railRow(page, 1)).click();
  const card = page.locator('[data-slot="pin-card"][data-pin-card="1"]');
  await card.waitFor({ timeout: 10_000 });
  const said = (await card.textContent()) ?? "";
  await page.keyboard.press("Escape");
  return said;
};

/** (p) The pane's link from the hub held, the agent answers comment 1, and the person replies in the pane, which hasn't heard it: both land. */
const legP = async (
  kit: Kit,
  fleet: KitFleet,
  session: string,
  artifact: string,
  pin: string
) => {
  const page = await kit.page("desk");
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const links = await routeLinks(page, PANE_SOCKET);
  await open(
    page,
    `${await fleet.dashboard()}/session/${session}`,
    "[data-artifact-trigger]"
  );
  await page
    .locator(`${PANE} button[data-slot="comments"]`)
    .waitFor({ timeout: 60_000 });
  await settle(page, 600);
  // Comment 1's row drawn: the pane's doc holds the hub's (a fresh desk keeps no copy of it).
  await railRow(page, 1);
  const link = links.at(-1);
  if (link) {
    link.held = true;
  }
  await callIn(fleet, session, REPLY_TOOL, {
    pin,
    text: "PROBE-AGENT-ANSWER",
  });
  const words = "PROBE-PANE-REPLY";
  await replyInPane(page, words);
  const both = (seen: Pin | undefined) =>
    !!seen?.thread.some(
      (entry) => entry.by === "agent" && entry.text === "PROBE-AGENT-ANSWER"
    ) &&
    seen.thread.some((entry) => entry.by === "person" && entry.text === words);
  const landed = await until(
    "(p) the pane's reply beside the agent's answer on the hub",
    async () => {
      const now = await hubDoc(fleet, session, artifact);
      return both(now.pins[pin]) ? now : undefined;
    },
    Boolean,
    20_000
  ).catch(() => undefined);
  const unheard = link?.queue.length ?? 0;
  letThrough(link);
  await settle(page, 1000);
  const thread = await threadInPane(page);
  const kept = await page.evaluate(
    (key) => localStorage.getItem(key),
    `cawco-refused-replies:${artifact}`
  );
  const line = await notSentOf(page, 1);
  const refusals = links.reduce((sum, one) => sum + one.refusals, 0);
  const held = (await hubDoc(fleet, session, artifact)).pins[pin];
  kit.check(
    "(p) a reply in a pane that hasn't heard the agent's answer lands beside it: the hub holds both, refuses nothing, the pane keeps nothing aside and says nothing unsent, and its thread draws both once its link is let through",
    !!landed &&
      !landed.pending &&
      unheard > 0 &&
      refusals === 0 &&
      kept === null &&
      line === null &&
      thread.includes("PROBE-AGENT-ANSWER") &&
      thread.includes(words),
    `on the hub: ${held ? JSON.stringify(held.thread.map((entry) => `${entry.by}: ${entry.text}`)) : "no pin"}; pending: ${landed?.pending}; updates the pane hadn't heard: ${unheard}; refusal frames to the pane: ${refusals}; kept on the device: ${kept ?? "nothing"}; not-sent line: ${line ?? "none"}; thread draws the answer: ${thread.includes("PROBE-AGENT-ANSWER")}, the reply: ${thread.includes(words)}; page errors: ${errors.join(" / ") || "none"}`
  );
  await page.close();
};

/** The pane's page in `page` once it holds artifact `artifact`; null when it doesn't within 60 s. */
const pageHolding = (page: Page, artifact: string) =>
  until(
    "(o) the page in the pane",
    async () => {
      try {
        const handle = await page
          .locator(FRAME)
          .elementHandle({ timeout: 1000 });
        const frame = await handle?.contentFrame();
        if (!frame) {
          return null;
        }
        const id = await frame.evaluate(() => {
          let held: string | null = null;
          (
            window as unknown as {
              cawcoArtifact?: {
                subscribe: (
                  holder: (hold: { ref: { id: string } | null }) => void
                ) => () => void;
              };
            }
          ).cawcoArtifact?.subscribe((hold) => {
            held = hold.ref?.id ?? null;
          })?.();
          return held;
        });
        return id === artifact ? frame : null;
      } catch {
        return null;
      }
    },
    Boolean,
    60_000
  ).catch(() => null) as Promise<Frame | null>;

/** The page's doc's link to the hub now (overlay artifact.ts `Link`). */
const pageLink = (frame: Frame) =>
  frame
    .evaluate(() => {
      let state = "";
      (
        window as unknown as {
          cawcoArtifact?: {
            subscribe: (
              holder: (hold: { link: { state: string } }) => void
            ) => () => void;
          };
        }
      ).cawcoArtifact?.subscribe((hold) => {
        ({ state } = hold.link);
      })?.();
      return state;
    })
    .catch(() => "");

/** The comments the page keeps aside on the device (overlay artifact.ts `REFUSED_KEY`), as stored: null when none. */
const keptOnPage = (frame: Frame, artifact: string) =>
  frame
    .evaluate(
      (key) => localStorage.getItem(key),
      `cawco-refused-pins:${artifact}`
    )
    .catch(() => null);

/** The pins of the page with all but one of the comments a page keeps: each delivered, so none is owed. */
const fill = async (fleet: KitFleet, session: string, artifact: string) => {
  const seed = await joinHub(fleet, session, artifact);
  const at = new Date().toISOString();
  seed.doc.transact(() => {
    for (let number = 1; number < COMMENT_LIMITS.pins; number += 1) {
      writePin(
        seed.doc,
        pinDelivered(
          personPin(crypto.randomUUID(), number, `PROBE-FULL-${number}`),
          at
        )
      );
    }
  });
  const filled = await until(
    "(o) the page's comments on the hub",
    async () =>
      Object.keys((await hubDoc(fleet, session, artifact)).pins).length,
    (count) => count === COMMENT_LIMITS.pins - 1,
    30_000
  ).catch(() => 0);
  seed.leave();
  return filled;
};

/** Null once the page's doc holds its `filled` comments and its link has synced with the hub, not only filled from what the hub embedded in the page; else what it holds. */
const syncedWith = async (frame: Frame, filled: number) => {
  const holds = await until(
    "(o) the page's doc holding its comments",
    async () => Object.keys(await pagePins(frame)).length,
    (count) => count === filled,
    30_000
  ).catch(() => 0);
  const linked = await until(
    "(o) the page's link synced",
    () => pageLink(frame),
    (state) => state === "synced",
    30_000
  ).catch(() => pageLink(frame));
  return holds === filled && linked === "synced"
    ? null
    : `its doc holds ${holds}; its link ${linked || "none"}`;
};

/** (o) A comment the page's overlay writes and the hub refuses is told on the page's open socket, kept aside with why and Try again; with room again, Try again lands it. */
const legO = async (kit: Kit, fleet: KitFleet, session: string) => {
  const made = await callIn(fleet, session, CREATE, {
    kind: "page",
    does: "judge",
    ask: "Judge this page too: pin anything that reads wrong",
    name: "overlay-refusal",
    html: PAGE_HTML,
  });
  const artifact = made.match(ANSWERED_ID)?.[1];
  if (!artifact) {
    kit.check("(o) the second page is made", false, made.slice(0, 400));
    return;
  }
  const filled = await fill(fleet, session, artifact);
  const page = await kit.page("desk");
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const links = await routeLinks(page, PAGE_SOCKET);
  await open(
    page,
    `${await fleet.dashboard()}/session/${session}`,
    "[data-artifact-trigger]"
  );
  const frame = await pageHolding(page, artifact);
  const shown = frame ? await syncedWith(frame, filled) : null;
  if (!(frame && filled > 0 && shown === null)) {
    kit.check(
      "(o) the second page, filled, in the pane, its link synced",
      false,
      `filled ${filled}; page ${frame ? "shown" : "not shown"}; ${shown ?? ""}; page errors: ${errors.join(" / ") || "none"}`
    );
    await page.close();
    return;
  }
  const link = links.at(-1);
  if (link) {
    link.held = true;
  }
  // Another device takes the page's last place; the page, its link held, hasn't heard it.
  const other = await joinHub(fleet, session, artifact);
  const theirs = crypto.randomUUID();
  writePin(other.doc, personPin(theirs, 300, "PROBE-OTHER-DEVICE"));
  await until(
    "(o) the other device's comment on the hub",
    async () => (await hubDoc(fleet, session, artifact)).pins[theirs],
    Boolean,
    15_000
  ).catch(() => undefined);
  const words = "PROBE-PAGE-COMMENT";
  const mine = personPin(crypto.randomUUID(), filled + 1, words);
  await writePagePins(frame, mine);
  const stored = await until(
    "(o) the page's comment kept aside",
    () => keptOnPage(frame, artifact),
    Boolean,
    20_000
  ).catch(() => null);
  const keptPins = stored ? (JSON.parse(stored) as Pin[]) : [];
  const why = keptPins.find((one) => one.id === mine.id)?.notSent?.why ?? "";
  await settle(page, 600);
  await railRow(page, mine.number).catch(() => undefined);
  const said = await until(
    "(o) its row saying why",
    () => notSentOf(page, mine.number),
    Boolean,
    10_000
  ).catch(() => null);
  const retry = await page
    .locator(
      `${RAIL} li:has([data-slot="pin-row"][data-pin-row="${mine.number}"]) [data-slot="pin-retry"]`
    )
    .isVisible()
    .catch(() => false);
  const refused = links.find((one) => one.refusals > 0);
  const refusedOnHub = !!(await hubDoc(fleet, session, artifact)).pins[mine.id];
  kit.check(
    "(o) a comment the page's overlay writes and the hub refuses: the refusal comes on the page's socket, which the hub doesn't close; the page keeps the comment aside with the hub's reason, its row saying it with Try again; the hub holds none of it",
    !!refused &&
      !refused.hubClosed &&
      !!why &&
      said === commentWords.notSent(why) &&
      retry &&
      !refusedOnHub,
    `refusal frames: ${links.map((one) => one.refusals).join(", ")}; the hub closed that link: ${refused?.hubClosed}, the page did: ${refused?.pageClosed}; kept: ${stored ? `${keptPins.length} comment(s), why ${JSON.stringify(why)}` : "nothing"}; row: ${said ?? "no not-sent line"}; Try again: ${retry}; on the hub: ${refusedOnHub}; page errors: ${errors.join(" / ") || "none"}`
  );
  letThrough(link);
  // The other device's comment goes: there is room again.
  deletePin(other.doc, theirs);
  const room = await until(
    "(o) the other device's comment gone from the hub",
    async () => !(await hubDoc(fleet, session, artifact)).pins[theirs],
    Boolean,
    15_000
  ).catch(() => false);
  other.leave();
  await page
    .locator(
      `${RAIL} li:has([data-slot="pin-row"][data-pin-row="${mine.number}"]) [data-slot="pin-retry"]`
    )
    .click({ timeout: 10_000 })
    .catch(() => undefined);
  const landed = await until(
    "(o) Try again's comment on the hub",
    async () => {
      const now = await hubDoc(fleet, session, artifact);
      return now.pins[mine.id]?.thread.some((entry) => entry.text === words)
        ? now
        : undefined;
    },
    Boolean,
    30_000
  ).catch(() => undefined);
  await settle(page, 1000);
  const after = await notSentOf(page, mine.number);
  const left = await keptOnPage(frame, artifact);
  kit.check(
    "(o) with room again, Try again lands the page's comment on the hub with its words, its row's reason goes, the page keeps nothing aside, and nothing waits pending on the hub",
    room && !!landed && !landed.pending && after === null && left === null,
    `room: ${room}; landed: ${landed ? "yes" : "not within 30 s"}; pending: ${landed?.pending}; not-sent line after: ${after ?? "none"}; kept on the page: ${left ?? "nothing"}; page errors: ${errors.join(" / ") || "none"}`
  );
  await page.close();
};

/** The updates the hub keeps for `artifact`, in order. */
const storedUpdates = (fleet: KitFleet, artifact: string) =>
  fleet.query<{ update: Uint8Array }>(
    'SELECT "update" FROM artifact_updates WHERE artifact_id = ? ORDER BY seq',
    artifact
  );

/** A doc of the updates the hub keeps for `artifact`. */
const storedDoc = (fleet: KitFleet, artifact: string) => {
  const doc = new Doc();
  for (const { update } of storedUpdates(fleet, artifact)) {
    applyUpdate(doc, update);
  }
  return doc;
};

/** The hub stopped and started again, the agent joined to it again. */
const restartHub = async (fleet: KitFleet) => {
  await fleet.stop("hub");
  fleet.launch("hub");
  await fleet.hubUp();
  await fleet.agentUp();
};

/**
 * (w) A doc the hub kept before pins were written in parts, each pin one
 * whole value in `pins` with its thread inside it (as every doc stored
 * before this holds them): the hub, started again, keeps it in its parts
 * as it loads it, in its own update in the log, and comment_read reads the
 * pin as it was, nothing of it lost.
 */
const legW = async (kit: Kit, fleet: KitFleet, session: string) => {
  const made = await callIn(fleet, session, CREATE, {
    kind: "page",
    does: "judge",
    ask: "Judge this older page: pin anything that reads wrong",
    name: "whole-pins",
    html: PAGE_HTML,
  });
  const artifact = made.match(ANSWERED_ID)?.[1];
  if (!artifact) {
    kit.check("(w) the older page is made", false, made.slice(0, 400));
    return;
  }
  await fleet.stop("hub");
  // The pin as a doc stored before kept it: whole, answered, resolved by the agent, looked at, delivered.
  const doc = storedDoc(fleet, artifact);
  const had = encodeStateVector(doc);
  const said = personPin(crypto.randomUUID(), 1, "PROBE-WHOLE-COMMENT");
  const answeredAt = new Date(Date.parse(said.at) + 1000).toISOString();
  const whole: Pin = {
    ...pinDelivered(
      {
        ...said,
        thread: [
          ...said.thread,
          {
            id: crypto.randomUUID(),
            by: "agent",
            text: "PROBE-WHOLE-ANSWER",
            at: answeredAt,
          },
        ],
      },
      answeredAt
    ),
    resolvedAt: answeredAt,
    resolvedBy: "agent",
    seenAt: answeredAt,
  };
  doc.getMap("pins").set(whole.id, whole);
  // Kept as the hub keeps an update (db/artifacts.ts `append`): next in the log, and the artifact's seq moved to it.
  const seq =
    (fleet.query<{ seq: number }>(
      "SELECT seq FROM artifacts WHERE id = ?",
      artifact
    )[0]?.seq ?? 0) + 1;
  fleet.write(
    'INSERT INTO artifact_updates (artifact_id, seq, "update") VALUES (?, ?, unhex(?))',
    artifact,
    seq,
    Buffer.from(encodeStateAsUpdate(doc, had)).toString("hex")
  );
  fleet.write("UPDATE artifacts SET seq = ? WHERE id = ?", seq, artifact);
  doc.destroy();
  await restartHub(fleet);
  const read = await until(
    "(w) the whole pin through comment_read",
    async () =>
      (
        await fleet.api<CommentRead>(
          `/api/instances/${session}/artifacts/comments?artifact=${artifact}&filter=all`
        )
      ).artifacts[0]?.pins.find((one) => one.id === whole.id),
    Boolean,
    30_000
  ).catch(() => undefined);
  const lost = Object.entries(whole)
    .filter(
      ([key, value]) =>
        JSON.stringify((read as Record<string, unknown> | undefined)?.[key]) !==
        JSON.stringify(value)
    )
    .map(([key]) => key);
  // Kept in the log in its parts: the next load finds nothing whole to split.
  const kept = await until(
    "(w) the pin's parts in the hub's log",
    () => {
      const now = storedDoc(fleet, artifact);
      const head = now.getMap("pins").get(whole.id) as
        Record<string, unknown> | undefined;
      const entries = [...now.getMap("entries").keys()].filter((key) =>
        key.startsWith(`${whole.id}:`)
      ).length;
      const pin = readPins(now).get(whole.id);
      now.destroy();
      return head && !("thread" in head) && entries === 2 && pin
        ? { head: Object.keys(head), entries, thread: pin.thread.length }
        : undefined;
    },
    Boolean,
    15_000
  ).catch(() => undefined);
  kit.check(
    "(w) a doc stored with each pin whole is kept in its parts once the hub loads it, in the hub's log: comment_read reads the pin as it was (its thread, the agent's resolve, the look, the delivery), nothing lost",
    !!read && lost.length === 0 && !!kept,
    `comment_read: ${read ? `differs in ${lost.join(", ") || "nothing"}` : "no pin"}; in the log: ${kept ? JSON.stringify(kept) : "not in parts within 15 s"}`
  );
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
    html: PAGE_HTML,
  });
  const artifact = made.match(ANSWERED_ID)?.[1];
  if (!artifact) {
    kit.check("the page is made", false, made.slice(0, 400));
    return;
  }
  const seed = await joinHub(fleet, session, artifact);
  const first = crypto.randomUUID();
  const second = crypto.randomUUID();
  writePin(seed.doc, personPin(first, 1, "PROBE-PERSON-COMMENT"));
  writePin(seed.doc, personPin(second, 2, "PROBE-MERGE-COMMENT"));
  await Bun.sleep(1000);
  seed.leave();
  await legH(kit, fleet, session, artifact);
  await legM(kit, fleet, session, artifact, second);
  await legP(kit, fleet, session, artifact, first);
  await legO(kit, fleet, session);
  await legW(kit, fleet, session);
};

export default { name: "pane-refusal", run } satisfies Spec;
