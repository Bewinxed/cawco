#!/usr/bin/env bun
/**
 * Notification gate probe (hub notifications.ts): a notification about a
 * session the owner is reading goes nowhere else, and one that is over comes
 * down everywhere.
 *
 *   bun scripts/probe-notification-gate.ts [--dashboard <dir>] [--keep]
 *
 * Run from the repo root after `bunx vite build` in apps/dashboard. A scratch
 * fleet (scratch-fleet.ts) runs a real hub, agent and Claude Code session;
 * Cawrier and the Telegram Bot API are local stand-ins that record every
 * request (`CAWCO_CAWRIER_ORIGIN`, `CAWCO_TELEGRAM_API`). One registered
 * device; a built dashboard served by `vite preview` with the session open in
 * Chromium (playwright-core); a second raw dashboard socket.
 *
 * Headless Chromium reports every page focused and visible, so the tab's blur
 * is the page's own: `document.hasFocus()` answers false and a real `blur`
 * event reaches the dashboard's listener. Leaving is a real `pagehide`
 * (the tab navigates away), and expiry is a client that stops beating.
 *
 *  (b) a turn ending while the tab is active on the session, then looked at:
 *      never pushed, before or after the blur;
 *  (a) an ask while the tab is active: no push, no Telegram; the blur sends
 *      both at once;
 *  (c) dismissing it through the API: the `notificationsCleared` frame on the
 *      second socket, one background push with the whole set, the next
 *      visible push carrying the id, a second clear coalesced;
 *  (d) Telegram: the ask's message deleted on the clear;
 *  (e) an iOS client that stops beating: held until it expires.
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
const respond = (request: Seen): Reply => {
  if (request.tools && request.last.includes("ASK-")) {
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
        CAWCO_PREVIEW_PORT: fleet.env.CAWCO_PREVIEW_PORT,
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
      | { active?: boolean; sessionId?: string | null }
      | undefined;

  // ── (b) A turn ends while the tab is active; it is looked at ─────────
  const turnStart = Date.now();
  await fleet.send(session, "TURN-1: say done");
  await until(
    "the turn ended",
    () =>
      fleet.query<{ turn_ended_at: number | null; seen_at: number | null }>(
        "SELECT turn_ended_at, seen_at FROM instances WHERE id = ?",
        session
      )[0],
    (row) => (row?.turn_ended_at ?? 0) > turnStart,
    120_000
  );
  await pause(9000);
  const [seen] = fleet.query<{
    turn_ended_at: number;
    seen_at: number | null;
  }>("SELECT turn_ended_at, seen_at FROM instances WHERE id = ?", session);
  check(
    "(b) looked at as the turn ended",
    (seen?.seen_at ?? 0) >= (seen?.turn_ended_at ?? Number.POSITIVE_INFINITY),
    `turn_ended_at=${seen?.turn_ended_at} seen_at=${seen?.seen_at}`
  );
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

  // ── (a) An ask while the tab is active; the blur sends it ────────────
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
    "(d) no Telegram message while active",
    askMessages().length === telegramBefore,
    `${askMessages().length - telegramBefore} ask messages sent`
  );
  const held = (await hubLog())
    .split("\n")
    .filter((line) => line.includes(ask1Id) && line.includes("held"));
  check("(a) held by the gate", held.length >= 2, held.join(" | "));
  const blurAt = Date.now();
  await setFocus(page, false);
  const askPush = await until(
    "the ask's push after the blur",
    () => pushesFor(ask1Id)[0],
    Boolean,
    30_000
  );
  const askTelegram = await until(
    "the ask's Telegram message after the blur",
    () => askMessages()[telegramBefore],
    Boolean,
    30_000
  );
  check(
    "(a) pushed once the tab blurred",
    askPush.at - blurAt < 10_000,
    `${askPush.at - blurAt}ms after the blur (last beat ${JSON.stringify(lastBeat())})`
  );
  check(
    "(d) Telegram sent once the tab blurred",
    askTelegram.at - blurAt < 10_000,
    `${askTelegram.at - blurAt}ms after the blur`
  );

  // ── (c) Dismissed through the API ────────────────────────────────────
  const dismissAt = Date.now();
  await fleet.api("/api/notifications/dismiss", {
    collapseIds: [ask1Id],
    via: "dismiss",
  });
  const frame = await found(
    "the cleared frame on the second socket",
    () => frames.find((one) => one.collapseIds.includes(ask1Id)),
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
      (firstBackground.body.payload.cawco?.cleared ?? []).includes(ask1Id) &&
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

  // The next visible push carries the id: the tab leaves (a real pagehide),
  // the ask is answered, and the turn that ends is nobody's in front.
  await page.goto("about:blank");
  await until(
    "the tab's leaving beat",
    () => lastBeat()?.active,
    (active) => active === false,
    10_000
  );
  await fleet.control(session, "resolvePermission", [
    ask1,
    {
      behavior: "allow",
      updatedInput: {
        command: "touch gate-probe.txt",
        description: "Make a file",
      },
    },
  ]);
  const turnPush = await until(
    "the turn's visible push",
    () => pushesFor(turnId)[0],
    Boolean,
    120_000
  );
  check(
    "(c) the next visible push carries the cleared id",
    (turnPush.body.payload.cawco?.cleared ?? []).includes(ask1Id),
    `${turnId} cawco.cleared=${JSON.stringify(turnPush.body.payload.cawco?.cleared)}`
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
      `${turnId},${ask1Id}`,
    JSON.stringify(read)
  );

  // ── (e) An iOS client that stops beating ─────────────────────────────
  await fleet.api("/api/presence", {
    clientId: "probe-ios",
    client: "ios",
    sessionId: session,
    active: true,
  });
  const beatAt = Date.now();
  await fleet.send(session, "ASK-2: run it again");
  const ask2 = await until(
    "the second ask parked",
    () => askOf(session, [ask1]),
    Boolean,
    120_000
  );
  const ask2Id = `ask-${ask2}`;
  await pause(5000);
  check(
    "(e) held while the iOS client is active",
    pushesFor(ask2Id).length === 0,
    `${pushesFor(ask2Id).length} pushes under ${ask2Id}`
  );
  const expired = await until(
    "the ask's push once the client expired",
    () => pushesFor(ask2Id)[0],
    Boolean,
    120_000
  );
  const silent = expired.at - beatAt;
  check(
    "(e) sent once the client went 60s without a beat",
    silent >= 60_000 && silent < 72_000,
    `${silent}ms after its only beat; visible push cleared=${JSON.stringify(expired.body.payload.cawco?.cleared)}`
  );

  await writeFile(
    join(out, "captures.json"),
    JSON.stringify({ pushes, bot, frames, presence }, null, 2)
  );
  console.log(`  captures: ${join(out, "captures.json")}`);
  const notify = (await hubLog())
    .split("\n")
    .filter((line) => line.includes("[notify]"));
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
