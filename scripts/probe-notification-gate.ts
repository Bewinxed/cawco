#!/usr/bin/env bun
/**
 * Notification gate probe (hub notifications.ts): nothing that lands in a
 * session while the owner has it in front is ever sent anywhere, not then and
 * not after he leaves; what lands while nobody is in front goes at once; and
 * one that is over comes down everywhere.
 *
 *   bun scripts/probe-notification-gate.ts [--dashboard <dir>] [--keep]
 *
 * Run from the repo root after `bunx vite build` in apps/dashboard. A scratch
 * fleet (scratch-fleet.ts) runs a real hub, agent and Claude Code session;
 * Cawrier and the Telegram Bot API are local stand-ins that record every
 * request (`CAWCO_CAWRIER_ORIGIN`, `CAWCO_TELEGRAM_API`). One registered
 * device; a built dashboard served by `vite preview` with the session open in
 * Chromium (playwright-core); a second raw dashboard socket; a scripted iOS
 * client that beats through the API and never posts a look.
 *
 * Headless Chromium reports every page focused and visible, so the tab's blur
 * is the page's own: `document.hasFocus()` answers false and a real `blur`
 * event reaches the dashboard's listener. Leaving is a real `pagehide`
 * (the tab navigates away), and expiry is a client that stops beating.
 *
 *  (b) a turn ending while the tab is active on the session: never pushed,
 *      before or after the blur;
 *  (a) an ask while the tab is active: no push, no Telegram, and none after
 *      the blur either; the hub logs it dropped on both outlets;
 *  (s) an ask while nobody is in front: push and Telegram at once;
 *  (c) dismissing it through the API: the `notificationsCleared` frame on the
 *      second socket, one background push with the whole set, the next
 *      visible push carrying the id, a second clear coalesced;
 *  (d) Telegram: the ask's message deleted on the clear;
 *  (f) a late dismissal (`deliveredAt`): one delivered before the id's latest
 *      send leaves it standing (a pending ask, and the turn id re-pushed by
 *      the next turn), one delivered after clears it, and one without
 *      `deliveredAt` clears as given;
 *  (e) the iOS client active on the session, no look from anyone: a turn that
 *      ends is dropped, and its leaving beat sends nothing; then an ask while
 *      it is active, and it stops beating: it lapses at 60 s and the ask is
 *      never sent. The hub's `[presence]` lines show each change.
 *
 * Captures go to $TMPDIR/notification-gate/ (or .probe/ outside a workspace).
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { chromium, type Page } from "playwright-core";
import { type Reply, type Seen, scratchFleet, until } from "./scratch-fleet";

const args = process.argv.slice(2);
const keep = args.includes("--keep");
const root = resolve(import.meta.dir, "..");
const at = args.indexOf("--dashboard");
const dashboardDir = resolve(
  at >= 0 ? (args[at + 1] ?? "") : join(root, "apps", "dashboard")
);
const out =
  process.env.CAWCO_WORKSPACE && process.env.TMPDIR
    ? join(process.env.TMPDIR, "notification-gate")
    : join(root, ".probe", "notification-gate");
await mkdir(out, { recursive: true });

let failures = 0;
const check = (step: string, ok: boolean, detail: string) => {
  console.log(`${ok ? "PASS" : "FAIL"} ${step}: ${detail}`);
  if (!ok) {
    failures += 1;
  }
};
const pause = (ms: number) => Bun.sleep(ms);
const t0 = Date.now();
const clock = () => `+${((Date.now() - t0) / 1000).toFixed(1)}s`;

// ── The stand-ins: Cawrier and the Bot API, recording every request ─────
interface PushSent {
  at: number;
  body: {
    collapseId?: string;
    payload: {
      aps: Record<string, unknown>;
      cawco?: { cleared?: string[]; kind?: string };
    };
    pushType?: string;
  };
}
const pushes: PushSent[] = [];
const cawrier = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  async fetch(request) {
    if (new URL(request.url).pathname === "/v1/push") {
      const body = (await request.json()) as PushSent["body"];
      pushes.push({ at: Date.now(), body });
      console.log(
        `  ${clock()} cawrier ← ${body.pushType ?? "alert"} ${body.collapseId ?? ""} cleared=${JSON.stringify(body.payload.cawco?.cleared ?? null)}`
      );
      return Response.json({ ok: true });
    }
    return Response.json({ ok: true });
  },
});

interface BotCall {
  at: number;
  body: Record<string, unknown>;
  /** The id a sendMessage was answered with. */
  messageId?: number;
  method: string;
}
const bot: BotCall[] = [];
let nextMessage = 100;
let pinned = false;
const telegram = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  idleTimeout: 0,
  async fetch(request) {
    const method = new URL(request.url).pathname.split("/").pop() ?? "";
    const body = (await request.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    if (method === "getUpdates") {
      if (!pinned) {
        pinned = true;
        return Response.json({
          ok: true,
          result: [
            {
              update_id: 1,
              message: { message_id: 1, chat: { id: 42 }, text: "hello" },
            },
          ],
        });
      }
      await pause(5000);
      return Response.json({ ok: true, result: [] });
    }
    bot.push({ at: Date.now(), method, body });
    console.log(
      `  ${clock()} telegram ← ${method} ${method === "sendMessage" ? JSON.stringify(String(body.text).slice(0, 60)) : JSON.stringify(body.message_id ?? "")}`
    );
    if (method === "sendMessage") {
      nextMessage += 1;
      (bot.at(-1) as BotCall).messageId = nextMessage;
      return Response.json({
        ok: true,
        result: { message_id: nextMessage, chat: { id: 42 } },
      });
    }
    return Response.json({ ok: true, result: true });
  },
});

// ── The fleet ──────────────────────────────────────────────────────────
// An ASK- prompt calls Bash once, which parks for the owner; its result ends the turn.
const respond = (request: Seen): Reply => {
  if (request.tools && !request.afterTool && request.last.includes("ASK-")) {
    return {
      everyMs: 1,
      words: [],
      tool: {
        name: "Bash",
        input: { command: "touch gate-probe.txt", description: "Make a file" },
      },
    };
  }
  return { everyMs: 5, words: ["Done."] };
};
const fleet = await scratchFleet({ name: "probe-notification-gate", respond });
fleet.env.CAWCO_CAWRIER_ORIGIN = `http://127.0.0.1:${cawrier.port}`;
fleet.env.CAWCO_TELEGRAM_API = `http://127.0.0.1:${telegram.port}`;
fleet.env.CAWCO_TELEGRAM_TOKEN = "123456:gate-probe-fake";

const b64 = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64");
const random = (n: number) => crypto.getRandomValues(new Uint8Array(n));

let dashboard: ReturnType<typeof Bun.spawn> | undefined;
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
const frames: { at: number; collapseIds: string[] }[] = [];
const presence: { at: number; body: unknown }[] = [];

const pushesFor = (collapseId: string) =>
  pushes.filter((push) => push.body.collapseId === collapseId);
const backgrounds = () =>
  pushes.filter((push) => push.body.pushType === "background");
const askMessages = () =>
  bot.filter(
    (call) =>
      call.method === "sendMessage" && call.body.reply_markup !== undefined
  );

/** The tab's own blur or focus: `hasFocus()` answers it and the window hears the event. */
const setFocus = (page: Page, focused: boolean) =>
  page.evaluate((on) => {
    Object.defineProperty(document, "hasFocus", {
      configurable: true,
      value: () => on,
    });
    window.dispatchEvent(new FocusEvent(on ? "focus" : "blur"));
  }, focused);

interface Parked {
  instanceId?: string;
  requestId?: string;
}
const askOf = async (instanceId: string, not: string[] = []) =>
  (await fleet.api<Parked[]>("/api/pending")).find(
    (parked) =>
      parked.instanceId === instanceId &&
      parked.requestId &&
      !not.includes(parked.requestId)
  )?.requestId;
const hubLog = () => fleet.logs("hub");
/** The hub's log lines naming `id` and saying `word`. */
const logged = async (id: string, word: string) =>
  (await hubLog())
    .split("\n")
    .filter((line) => line.includes(id) && line.includes(word));
/** `until` for a read that finds one thing: what it found. */
const found = <T>(
  label: string,
  read: () => T | undefined | Promise<T | undefined>,
  ms: number
): Promise<T> =>
  until(label, read, (value) => value !== undefined, ms) as Promise<T>;

try {
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.launch("agent");
  await fleet.agentUp();
  await fleet.accountSignedIn();
  await until(
    "the Telegram chat pinned",
    () => bot.find((call) => call.method === "sendMessage"),
    Boolean,
    60_000
  );
  const pairingId = crypto.randomUUID();
  await fleet.api("/api/push/register", {
    pairingId,
    secret: Buffer.from(random(32)).toString("base64url"),
    key: b64(random(32)),
    name: "Probe iPhone",
    platform: "ios",
  });
  const session = await fleet.spawn(
    "claude",
    "Gate probe",
    fleet.workdir,
    // Asks, so its Bash call parks for the owner.
    { permissionMode: "default" }
  );
  const turnId = `turn-${session}`;
  console.log(`  session ${session}`);
  const turnEnded = (after: number) =>
    until(
      "the turn ended",
      () =>
        fleet.query<{ turn_ended_at: number | null }>(
          "SELECT turn_ended_at FROM instances WHERE id = ?",
          session
        )[0],
      (row) => (row?.turn_ended_at ?? 0) > after,
      120_000
    );
  const allow = (requestId: string) =>
    fleet.control(session, "resolvePermission", [
      requestId,
      {
        behavior: "allow",
        updatedInput: {
          command: "touch gate-probe.txt",
          description: "Make a file",
        },
      },
    ]);

  // A second client on the dashboard socket.
  const { port } = new URL(fleet.base);
  const second = new WebSocket(`ws://127.0.0.1:${port}/ws/dashboard`);
  second.onmessage = (event) => {
    const frame = JSON.parse(String(event.data)) as {
      type?: string;
      collapseIds?: string[];
    };
    if (frame.type === "notificationsCleared") {
      frames.push({ at: Date.now(), collapseIds: frame.collapseIds ?? [] });
      console.log(
        `  ${clock()} second socket ← notificationsCleared ${JSON.stringify(frame.collapseIds)}`
      );
    }
  };
  await until(
    "the second socket open",
    () => second.readyState === WebSocket.OPEN,
    Boolean,
    15_000
  );

  // ── The dashboard, the session in front ──────────────────────────────
  const webPort = Number(port) + 7;
  const base = `http://127.0.0.1:${webPort}`;
  dashboard = Bun.spawn(
    [
      "bunx",
      "vite",
      "preview",
      "--host",
      "127.0.0.1",
      "--port",
      String(webPort),
      "--strictPort",
    ],
    {
      cwd: dashboardDir,
      env: {
        ...process.env,
        CAWCO_DEV_HUB_URL: fleet.base,
        CAWCO_HUB_URL: fleet.base,
      },
      stdout: Bun.file(join(fleet.sandbox, "dashboard.log")),
      stderr: Bun.file(join(fleet.sandbox, "dashboard.err")),
    }
  );
  await until(
    "the dashboard answering",
    () => fetch(base).then((r) => r.ok),
    Boolean,
    60_000
  );
  browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/presence") {
      const body = request.postDataJSON() as unknown;
      presence.push({ at: Date.now(), body });
      console.log(`  ${clock()} tab → /api/presence ${JSON.stringify(body)}`);
    }
  });
  await page.goto(`${base}/session/${session}`, {
    waitUntil: "domcontentloaded",
  });
  await until(
    "the tab active on the session",
    () =>
      presence.find(
        (beat) =>
          (beat.body as { sessionId?: string; active?: boolean }).sessionId ===
            session && (beat.body as { active?: boolean }).active
      ),
    Boolean,
    60_000
  );
  const lastBeat = () =>
    presence.at(-1)?.body as
      { active?: boolean; sessionId?: string | null } | undefined;

  // ── (b) A turn ends while the tab is active ──────────────────────────
  const turnStart = Date.now();
  await fleet.send(session, "TURN-1: say done");
  await turnEnded(turnStart);
  await pause(9000);
  check(
    "(b) no turn push while active",
    pushesFor(turnId).length === 0,
    `${pushesFor(turnId).length} pushes under ${turnId} 9s after the turn ended`
  );
  await setFocus(page, false);
  await pause(15_000);
  check(
    "(b) no turn push after the blur either",
    pushesFor(turnId).length === 0,
    `${pushesFor(turnId).length} pushes under ${turnId} 15s after the blur (last beat ${JSON.stringify(lastBeat())})`
  );
  await setFocus(page, true);
  await until(
    "the tab active again",
    () => lastBeat()?.active,
    (active) => active === true,
    10_000
  );

  // ── (a) An ask while the tab is active: never sent ───────────────────
  const telegramBefore = askMessages().length;
  await fleet.send(session, "ASK-1: run the command");
  const ask1 = await found("the ask parked", () => askOf(session), 120_000);
  const ask1Id = `ask-${ask1}`;
  await pause(8000);
  check(
    "(a) no push while active",
    pushesFor(ask1Id).length === 0,
    `${pushesFor(ask1Id).length} pushes under ${ask1Id} 8s after it parked`
  );
  check(
    "(a) no Telegram message while active",
    askMessages().length === telegramBefore,
    `${askMessages().length - telegramBefore} ask messages sent`
  );
  const dropped1 = await logged(ask1Id, "dropped");
  check(
    "(a) dropped by the gate on push and Telegram",
    dropped1.some((line) => line.includes("push")) &&
      dropped1.some((line) => line.includes("telegram")),
    dropped1.join(" | ")
  );
  await setFocus(page, false);
  await pause(12_000);
  check(
    "(a) nothing sent once the tab blurred",
    pushesFor(ask1Id).length === 0 && askMessages().length === telegramBefore,
    `${pushesFor(ask1Id).length} pushes, ${askMessages().length - telegramBefore} ask messages 12s after the blur (last beat ${JSON.stringify(lastBeat())})`
  );

  // The tab leaves (a real pagehide); the ask is answered and the turn
  // that ends is nobody's in front: sent.
  await page.goto("about:blank");
  await until(
    "the tab's leaving beat",
    () => lastBeat()?.active,
    (active) => active === false,
    10_000
  );
  await allow(ask1);
  const turnPush = await until(
    "the turn's visible push, nobody in front",
    () => pushesFor(turnId)[0],
    Boolean,
    120_000
  );
  check(
    "(s) a turn that ends with nobody in front is pushed",
    turnPush !== undefined,
    `${turnId} pushed at ${clock()}`
  );

  // ── (s) An ask while nobody is in front goes at once ─────────────────
  const telegramBefore2 = askMessages().length;
  const ask2Start = Date.now();
  await fleet.send(session, "ASK-2: run it again");
  const ask2 = await found(
    "the second ask parked",
    () => askOf(session, [ask1]),
    120_000
  );
  const ask2Id = `ask-${ask2}`;
  const ask2Push = await until(
    "the second ask's push",
    () => pushesFor(ask2Id)[0],
    Boolean,
    30_000
  );
  const askTelegram = await until(
    "the second ask's Telegram message",
    () => askMessages()[telegramBefore2],
    Boolean,
    30_000
  );
  check(
    "(s) push and Telegram at once",
    ask2Push.at - ask2Start < 60_000 && askTelegram.at - ask2Start < 60_000,
    `push ${ask2Push.at - ask2Start}ms, Telegram ${askTelegram.at - ask2Start}ms after the prompt`
  );

  // ── (c) Dismissed through the API ────────────────────────────────────
  const dismissAt = Date.now();
  await fleet.api("/api/notifications/dismiss", {
    collapseIds: [ask2Id],
    via: "dismiss",
  });
  const frame = await found(
    "the cleared frame on the second socket",
    () => frames.find((one) => one.collapseIds.includes(ask2Id)),
    10_000
  );
  check(
    "(c) socket frame to the second client",
    frame.at - dismissAt < 2000,
    `${frame.at - dismissAt}ms, ${JSON.stringify(frame.collapseIds)}`
  );
  const firstBackground = await until(
    "the background push",
    () => backgrounds()[0],
    Boolean,
    10_000
  );
  check(
    "(c) one background push with the whole set",
    backgrounds().length === 1 &&
      firstBackground.body.payload.aps["content-available"] === 1 &&
      (firstBackground.body.payload.cawco?.cleared ?? []).includes(ask2Id) &&
      firstBackground.body.collapseId === undefined,
    JSON.stringify(firstBackground.body)
  );
  const askMessageId = askTelegram.messageId;
  const deleted = await found(
    "the ask's Telegram message deleted",
    () => bot.find((call) => call.method === "deleteMessage"),
    10_000
  );
  check(
    "(d) Telegram message deleted on the clear",
    deleted.body.message_id === askMessageId,
    `deleteMessage ${JSON.stringify(deleted.body)} (the ask was message ${askMessageId})`
  );

  // The next visible push carries the id: the ask is answered and its turn,
  // nobody's in front, is pushed again under the turn's id.
  const turnsBefore = pushesFor(turnId).length;
  await allow(ask2);
  const turnPush2 = await until(
    "the next turn's visible push",
    () => pushesFor(turnId)[turnsBefore],
    Boolean,
    120_000
  );
  check(
    "(c) the next visible push carries the cleared id",
    (turnPush2.body.payload.cawco?.cleared ?? []).includes(ask2Id),
    `${turnId} cawco.cleared=${JSON.stringify(turnPush2.body.payload.cawco?.cleared)}`
  );

  // A second clear inside 20 minutes: its frame goes, its background waits.
  await fleet.api("/api/notifications/dismiss", {
    collapseIds: [turnId],
    via: "open",
  });
  await until(
    "the second cleared frame",
    () => frames.find((one) => one.collapseIds.includes(turnId)),
    Boolean,
    10_000
  );
  await pause(10_000);
  check(
    "(c) a second clear within 20 minutes is coalesced",
    backgrounds().length === 1,
    `${backgrounds().length} background pushes 10s after the second clear`
  );
  const read = await fleet.api<{
    cleared: { collapseId: string; at: number }[];
  }>(`/api/notifications/cleared?since=${t0}`);
  check(
    "(c) the launch sweep reads both",
    read.cleared.map((row) => row.collapseId).join(",") ===
      `${turnId},${ask2Id}`,
    JSON.stringify(read)
  );

  // ── (f) A late dismissal never clears a newer send under its id ──────
  const sentAt = (collapseId: string) =>
    fleet.query<{ sent_at: number }>(
      "SELECT sent_at FROM notification_sent WHERE collapse_id = ?",
      collapseId
    )[0]?.sent_at;
  const framed = (collapseId: string, since: number) =>
    frames.some(
      (one) => one.at >= since && one.collapseIds.includes(collapseId)
    );
  /** Dismisses one id as a device would and answers whether it cleared within 4 s. */
  const dismissed = async (
    collapseId: string,
    deliveredAt: number | undefined
  ): Promise<boolean> => {
    const since = Date.now();
    await fleet.api("/api/notifications/dismiss", {
      collapseIds: [collapseId],
      via: "dismiss",
      ...(deliveredAt === undefined
        ? {}
        : { deliveredAt: { [collapseId]: deliveredAt } }),
    });
    await pause(4000);
    return framed(collapseId, since);
  };
  await fleet.send(session, "ASK-3: once more");
  const ask3 = await found(
    "the third ask parked",
    () => askOf(session, [ask1, ask2]),
    120_000
  );
  const ask3Id = `ask-${ask3}`;
  const ask3Push = await until(
    "the third ask's push",
    () => pushesFor(ask3Id)[0],
    Boolean,
    30_000
  );
  const ask3Sent = sentAt(ask3Id);
  const ask3Stale = await dismissed(ask3Id, ask3Push.at - 5 * 60_000);
  check(
    "(f) a deliveredAt older than the latest send leaves it standing",
    !ask3Stale && sentAt(ask3Id) === ask3Sent && ask3Sent !== undefined,
    `${ask3Id} deliveredAt=sent-5min: frame=${ask3Stale}, sent_at ${ask3Sent} → ${sentAt(ask3Id)}`
  );
  const ask3Plain = await dismissed(ask3Id, undefined);
  check(
    "(f) no deliveredAt clears it",
    ask3Plain && sentAt(ask3Id) === undefined,
    `${ask3Id} frame=${ask3Plain}, sent_at now ${sentAt(ask3Id)}`
  );

  // The real case: the turn id was cleared in (c); the next turn re-sends it.
  const turnsBefore3 = pushesFor(turnId).length;
  await allow(ask3);
  const resent = await until(
    "the next turn's push under the same id",
    () => pushesFor(turnId)[turnsBefore3],
    Boolean,
    120_000
  );
  const turnSent = sentAt(turnId);
  // This device had the earlier turn's push; past the 120 s skew margin, the
  // earlier of that delivery and three minutes before the re-send.
  const turnStale = await dismissed(
    turnId,
    Math.min(turnPush2.at, resent.at - 180_000)
  );
  check(
    "(f) a late dismissal of the earlier turn keeps the re-pushed one",
    !turnStale && sentAt(turnId) === turnSent && turnSent !== undefined,
    `${turnId} first delivered ${turnPush2.at}, re-sent ${turnSent} (push ${resent.at}): frame=${turnStale}, sent_at → ${sentAt(turnId)}`
  );
  const turnFresh = await dismissed(turnId, Date.now());
  check(
    "(f) a deliveredAt after the send clears it",
    turnFresh && sentAt(turnId) === undefined,
    `${turnId} frame=${turnFresh}, sent_at now ${sentAt(turnId)}`
  );

  // ── (e) The iOS client in front, no look from anyone ─────────────────
  const ios = (active: boolean) =>
    fleet.api("/api/presence", {
      clientId: "probe-ios-client",
      client: "ios",
      sessionId: session,
      active,
      saidAt: Date.now(),
    });
  await ios(true);
  const turnsBefore4 = pushesFor(turnId).length;
  const turn4Start = Date.now();
  await fleet.send(session, "TURN-4: say done");
  await turnEnded(turn4Start);
  // The turn's grace (5 s), then its burst's quiet (10 s, push.ts `QUIET_MS`):
  // the gate is asked as the burst goes out.
  await pause(17_000);
  const [unlooked] = fleet.query<{
    turn_ended_at: number;
    seen_at: number | null;
  }>("SELECT turn_ended_at, seen_at FROM instances WHERE id = ?", session);
  check(
    "(e) nobody looked: the gate alone decides",
    (unlooked?.seen_at ?? 0) < (unlooked?.turn_ended_at ?? 0),
    `turn_ended_at=${unlooked?.turn_ended_at} seen_at=${unlooked?.seen_at}`
  );
  const dropped4 = await logged(turnId, "dropped");
  check(
    "(e) the turn that ended while iOS was active is dropped",
    pushesFor(turnId).length === turnsBefore4 && dropped4.length > 0,
    `${pushesFor(turnId).length - turnsBefore4} new pushes; ${dropped4.at(-1)}`
  );
  await ios(false);
  await pause(15_000);
  check(
    "(e) its leaving beat sends nothing",
    pushesFor(turnId).length === turnsBefore4,
    `${pushesFor(turnId).length - turnsBefore4} new pushes under ${turnId} 15s after the iOS client left`
  );

  // An ask while it is active; then it stops beating and lapses.
  await ios(true);
  const beatAt = Date.now();
  const telegramBefore5 = askMessages().length;
  await fleet.send(session, "ASK-5: and again");
  const ask5 = await found(
    "the fifth ask parked",
    () => askOf(session, [ask1, ask2, ask3]),
    120_000
  );
  const ask5Id = `ask-${ask5}`;
  const lapsed = await until(
    "the iOS client lapsed",
    async () =>
      (await hubLog())
        .split("\n")
        .find((line) => line.includes("probe-io") && line.includes("lapsed")),
    Boolean,
    100_000
  );
  await pause(10_000);
  check(
    "(e) an ask while iOS was active is never sent, through its lapse",
    pushesFor(ask5Id).length === 0 &&
      askMessages().length === telegramBefore5 &&
      (await logged(ask5Id, "dropped")).length === 2,
    `${pushesFor(ask5Id).length} pushes, ${askMessages().length - telegramBefore5} ask messages ${Math.round((Date.now() - beatAt) / 1000)}s after its only beat; ${lapsed}`
  );

  await writeFile(
    join(out, "captures.json"),
    JSON.stringify({ pushes, bot, frames, presence }, null, 2)
  );
  console.log(`  captures: ${join(out, "captures.json")}`);
  const notify = (await hubLog())
    .split("\n")
    .filter((line) => line.includes("[notify]") || line.includes("[presence]"));
  await writeFile(join(out, "hub-notify.log"), notify.join("\n"));
  console.log(notify.map((line) => `  hub: ${line}`).join("\n"));
} catch (error) {
  failures += 1;
  console.error(`FAIL ${error instanceof Error ? error.message : error}`);
  console.error(
    (await hubLog().catch(() => "")).split("\n").slice(-40).join("\n")
  );
} finally {
  await browser?.close();
  dashboard?.kill();
  await fleet.close();
  await fleet.clean(keep);
  cawrier.stop(true);
  telegram.stop(true);
}
console.log(failures === 0 ? "ALL PASS" : `${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
