/**
 * The web transcript read again: a re-read never takes away the rows a
 * reader holds or moves their place, and while the transcript cannot be
 * caught up (its machine offline, or the hub failing the read) the pane says
 * so in one line until it can. The web half of probe-ios-catchup.ts.
 *
 * A scratch fleet's session seeded with 820 Bash calls (the newest page and
 * four older ones), and a second session whose turn starts a session of its
 * own, whose card opens on a well (InlineTranscript); the built dashboard
 * against its hub, on the desk, every read of the long transcript counted.
 * The reader scrolls up three older pages, then the hub restarts three times
 * under it, the pages' sockets held off until it is up (each resume a
 * `stream.reset`): the second time its reads answer 500 with a long stack,
 * from the reset's read through Try again's; the third time the agent is
 * away, so the read finds the machine offline.
 *
 *  - a started session answers, and its card opens on its well;
 *  - each read again: the rows in view and the first row's place hold
 *    within 2px, and no older page is read again;
 *  - the read failed: the pane says "Not caught up" beside a Try again that
 *    reads again, exactly one toast says why in the stack's first line, its
 *    thrown error's label ("Error:") taken off (hub-read.ts `failureReason`,
 *    c4ebe8af; the console's `[cawco] toast:`), the reads again keep to the
 *    backoff, and the line goes once one lands;
 *  - the agent away: while the hub still reads it as reconnecting (heard
 *    from within its `RECONNECTING_MS`, c6d6b417), the pane says "<machine>
 *    is reconnecting. The rest comes in once it's back." with no toast; once
 *    the hub stops, the pane reads again by itself (the 503's `Retry-After`)
 *    and says "Not caught up: <machine> is offline. The rest comes in once
 *    it's back." on one line on the desk, at most two at 390 with the name
 *    whole, the card's well saying the same over its rows; both lines go once
 *    the agent is back and the reads land;
 *  - the page never throws: no `pageerror` on either page through the
 *    restarts, nor on a page loaded with the hub away (every read it makes
 *    answering the dashboard's own 502 text, its proxy's `HUB_UNREACHABLE`),
 *    held 40s: a read parses a body only when it is ok JSON
 *    (project-tasks.ts `send`).
 */
// biome-ignore-all lint/complexity/noExcessiveCognitiveComplexity: the scenario runs in order, one step after the last.
import type { Page } from "playwright-core";
import { type Reply, type Seen, until } from "../../../scratch-fleet";
import { SCROLLER } from "../../frames";
import { open, type Spec } from "../../kit";

const ROWS = 820;
const BEHIND = "Not caught up";
const OFFLINE_NEXT = "is offline. The rest comes in once it's back.";
const RECONNECTING_NEXT = "is reconnecting. The rest comes in once it's back.";
/** How long the hub reads a machine it heard from as reconnecting (core handover.ts `RECONNECTING_MS`). */
const RECONNECTING_MS = 60_000;
/** A failed history read whose body is a long stack, as a machine's error can be: the reader is told its first line. */
const FAILED = `Error: the transcript could not be read\n${"    at readHistory (/opt/cawco/agent.js:1:1)\n".repeat(400)}`;
/** That first line as a person reads it: the thrown error's label off, a capital to start (hub-read.ts `failureReason`). */
const FAILED_REASON = "The transcript could not be read";
/** The page's own word on its reads and its toasts (client.svelte.ts `readNewestPage`, `toastBehind`). */
const CAWCO_LOG = /^\[cawco\] (read|toast:) /;
/** A session of its own, drawn as a delegate's card is (rows.ts `isDelegateMsg`, `start`). */
const START_TOOL = "mcp__cawco__start_session";
const HUB_SOCKET = /\/ws\//;
/** The dashboard's answer for a hub it never reached (api/[...path] proxy; hub-read.ts `HUB_UNREACHABLE_HEADER`, `HUB_UNREACHABLE`). */
const UNREACHED_HEADER = "x-cawco-hub-unreachable";
const UNREACHED =
  "The dashboard couldn't reach the hub: the request got no answer. Check that the hub's machine is up and this device is online, then try again.";
/** How long a page loaded with the hub away is watched for a throw. */
const AWAY_HOLD_MS = 40_000;

interface Strip {
  lines: number;
  nameWhole: boolean;
  retry: boolean;
  text: string;
}
interface Place {
  first?: { row: string; y: number };
  height: number;
  rows: string[];
  strip: Strip | null;
}
/** The rows in view, top to bottom, the first one's place, and the pane's line (its dock's, whatever it says). */
const place = (page: Page): Promise<Place> =>
  page.evaluate(() => {
    const scroller = document.querySelector<HTMLElement>(
      '[aria-label="Session transcript"]'
    );
    if (!scroller) {
      return { rows: [], height: 0, strip: null };
    }
    const box = scroller.getBoundingClientRect();
    const tops = new Map<string, number>();
    const walker = document.createTreeWalker(scroller, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      // biome-ignore lint/performance/useTopLevelRegex: serialized into the page
      const row = node.textContent?.match(/row-(\d{4})/)?.[1];
      if (!row || tops.has(row)) {
        continue;
      }
      const range = document.createRange();
      range.selectNodeContents(node);
      const rect = range.getBoundingClientRect();
      if (rect.height > 0 && rect.top >= box.top && rect.bottom <= box.bottom) {
        tops.set(row, rect.top - box.top);
      }
    }
    const rows = [...tops.entries()].sort((a, b) => a[1] - b[1]);
    // The pane's own line floats in its dock (Transcript.svelte `<Behind floating>`).
    const line = scroller.querySelector<HTMLElement>(
      ".behind.floating[role=status]"
    );
    const words = line?.querySelector("p");
    let strip: Strip | null = null;
    if (line && words) {
      const range = document.createRange();
      range.selectNodeContents(words);
      const name = words.querySelector(".name");
      strip = {
        text: words.textContent?.replace(/\s+/g, " ").trim() ?? "",
        lines: new Set(
          [...range.getClientRects()].map((rect) => Math.round(rect.top))
        ).size,
        nameWhole: !name || name.getClientRects().length === 1,
        retry: [...line.querySelectorAll("button")].some(
          (b) => b.textContent?.trim() === "Try again"
        ),
      };
    }
    return {
      first: rows[0] ? { row: rows[0][0], y: rows[0][1] } : undefined,
      rows: rows.map(([row]) => row),
      height: scroller.scrollHeight,
      strip,
    };
  });

/** The delegate's well on its parent's page: whether its rows are drawn, and its line (InlineTranscript's `<Behind>`, whatever it says). */
const well = (page: Page) =>
  page.evaluate(() => {
    const inner = [...document.querySelectorAll<HTMLElement>(".inner")].find(
      (node) => node.textContent?.includes("Done.")
    );
    const line = inner
      ?.querySelector<HTMLElement>(".behind[role=status]")
      ?.textContent?.replace(/\s+/g, " ")
      .trim();
    return { drawn: inner !== undefined, strip: line ?? null };
  });

const spec: Spec = {
  name: "web-catchup",
  run: async (kit) => {
    const tag = crypto.randomUUID().slice(0, 6);
    const MARK = `catchup probe ${tag}`;
    const DELEG = `delegating probe ${tag}`;
    const WELL = `well probe ${tag}`;
    let calls = 0;
    let delegated = false;
    let workdir = "";
    const respond = (request: Seen): Reply => {
      if (request.tools && request.all.includes(MARK) && calls < ROWS) {
        calls += 1;
        const n = String(calls).padStart(4, "0");
        return {
          everyMs: 1,
          words: [],
          tool: {
            name: "Bash",
            input: { command: `echo row-${n}`, description: `Print row-${n}` },
          },
        };
      }
      if (
        request.tools &&
        request.all.includes(DELEG) &&
        !request.all.includes(WELL) &&
        !delegated &&
        request.toolNames.includes(START_TOOL)
      ) {
        delegated = true;
        return {
          everyMs: 1,
          words: [],
          tool: {
            name: START_TOOL,
            input: {
              cwd: workdir,
              prompt: `${WELL}: say ok.`,
              title: "Well probe",
            },
          },
        };
      }
      return { everyMs: 5, words: ["Done."] };
    };
    const fleet = await kit.fleet(respond);
    ({ workdir } = fleet);
    interface PageRead {
      blocks: {
        content?: string;
        id: string;
        metadata?: { delegateInstanceId?: string };
        type: string;
      }[];
      cursor: string | null;
      tail?: { busy?: boolean };
    }
    const walk = async (id: string) => {
      const newest = await fleet.api<PageRead>(
        `/api/instances/${id}/transcript`
      );
      let rows = newest.blocks.length;
      let { cursor } = newest;
      while (cursor) {
        // biome-ignore lint/performance/noAwaitInLoops: each page starts where the last one ended
        const older = await fleet.api<PageRead>(
          `/api/instances/${id}/transcript?limit=250&before=${encodeURIComponent(cursor)}`
        );
        rows += older.blocks.length;
        ({ cursor } = older);
      }
      return { rows, busy: newest.tail?.busy === true };
    };
    fleet.launch("sessiond");
    await fleet.sessiondUp();
    fleet.launch("hub");
    await fleet.hubUp();
    fleet.fileAccount();
    fleet.launch("agent");
    await fleet.agentUp();
    await fleet.accountSignedIn();
    const sessionId = await fleet.spawn("claude", "Catch-up probe");
    await fleet.send(sessionId, `${MARK}: print the rows.`);
    const parentId = await fleet.spawn("claude", "Starting probe");
    await fleet.send(parentId, `${DELEG}: start a session.`);
    const delegateId = await until(
      "the session started",
      async () =>
        (
          await fleet.api<PageRead>(`/api/instances/${parentId}/transcript`)
        ).blocks.find((b) => b.metadata?.delegateInstanceId)?.metadata
          ?.delegateInstanceId,
      Boolean,
      5 * 60_000
    ).catch(() => undefined);
    const answered = delegateId
      ? await until(
          "the started session answered",
          async () =>
            (
              await fleet.api<PageRead>(
                `/api/instances/${delegateId}/transcript`
              )
            ).blocks.some(
              (b) => b.type === "assistant" && b.content?.includes("Done.")
            ),
          Boolean,
          5 * 60_000
        ).catch(() => false)
      : false;
    kit.check(
      "a started session answers, for a card with a well",
      answered,
      delegateId
        ? `session ${delegateId.slice(0, 8)}`
        : "no card in the starting session's transcript"
    );
    await until(
      `${ROWS} rows in the session`,
      () => walk(sessionId),
      (now) => now.rows >= ROWS && !now.busy,
      40 * 60_000
    );

    const base = await fleet.dashboard();
    /** `holding`: the pages' sockets are refused; until `failUntil` (ms epoch), the newest reads answer 500. */
    const wire: {
      failUntil: number;
      holding: boolean;
      reads: { older: boolean; status: number }[];
    } = { failUntil: 0, holding: false, reads: [] };
    const logs: string[] = [];
    const wellLogs: string[] = [];
    /** What either page threw, uncaught, through every restart. */
    const thrown: string[] = [];
    /** A page whose socket to the hub is held off while `holding`. */
    const opened = async (id: string, heard: string[]) => {
      const page = await kit.page("desk");
      page.on("pageerror", (error) => {
        thrown.push(`${id.slice(0, 8)}: ${error.message}`);
      });
      page.on("console", (message) => {
        if (CAWCO_LOG.test(message.text())) {
          heard.push(message.text());
        }
      });
      await page.routeWebSocket(HUB_SOCKET, (ws) => {
        if (wire.holding) {
          ws.close({ code: 1013, reason: "held" });
          return;
        }
        ws.connectToServer();
      });
      await open(page, `${base}/session/${id}`, SCROLLER, 120_000);
      return page;
    };
    const transcriptPath = `/api/instances/${sessionId}/transcript`;
    const page = await opened(sessionId, logs);
    page.on("response", (response) => {
      const url = new URL(response.url());
      if (url.pathname === transcriptPath) {
        wire.reads.push({
          older: url.searchParams.has("before"),
          status: response.status(),
        });
      }
    });
    // The hub's read failing, as its route answers a failed history read.
    await page.route(`**${transcriptPath}`, (route) => {
      const url = new URL(route.request().url());
      if (Date.now() < wire.failUntil && !url.searchParams.has("before")) {
        return route.fulfill({
          status: 500,
          contentType: "text/plain",
          body: FAILED,
        });
      }
      return route.continue();
    });
    await until(
      "the session's rows on screen",
      () => place(page),
      (shown) => shown.first !== undefined,
      120_000
    );
    const parentPage = await opened(parentId, wellLogs);
    let wellOpen = false;
    if (delegateId) {
      // The card's own head in the transcript (Delegate.svelte `.bhead`).
      await parentPage
        .locator(`${SCROLLER} .bhead`)
        .first()
        .click({ timeout: 60_000 })
        .catch(() => undefined);
      wellOpen = await until(
        "the delegate's well drawn",
        () => well(parentPage),
        (shown) => shown.drawn,
        60_000
      )
        .then(() => true)
        .catch(() => false);
    }
    kit.check("the delegate's card opens on its well", wellOpen);
    await page.bringToFront();
    await page.waitForTimeout(3000);

    // Up three older pages.
    const area = await page.locator(SCROLLER).boundingBox();
    if (!area) {
      throw new Error("no transcript scroller on the page");
    }
    await page.mouse.move(area.x + area.width / 2, area.y + area.height / 2);
    for (
      let wheel = 0;
      wheel < 400 && wire.reads.filter((r) => r.older).length < 3;
      wheel += 1
    ) {
      // biome-ignore lint/performance/noAwaitInLoops: each wheel starts where the last one left the list
      await page.mouse.wheel(0, -600);
      await page.waitForTimeout(120);
    }
    await page.mouse.wheel(0, -600);
    await page.waitForTimeout(3000);

    const held = (label: string, before: Place, after: Place) =>
      kit.check(
        label,
        after.first?.row === before.first?.row &&
          Math.abs((after.first?.y ?? 0) - (before.first?.y ?? 0)) < 2 &&
          after.rows.join() === before.rows.join(),
        `before row-${before.first?.row} at y ${before.first?.y?.toFixed(1)} (${before.rows.length} rows), after row-${after.first?.row} at y ${after.first?.y?.toFixed(1)} (${after.rows.length} rows)`
      );
    const newestSince = (from: number) =>
      wire.reads.slice(from).filter((r) => !r.older);
    const olderSince = (from: number) =>
      wire.reads.slice(from).filter((r) => r.older).length;
    /** The session speaks, so a restarted hub's empty ring makes its resume a reset. */
    const speak = async (label: string, id = sessionId) => {
      const spoken = (await walk(id)).rows;
      await fleet.send(id, "One more line.");
      await until(
        `${label}: the session spoke`,
        () => walk(id),
        (now) => now.rows > spoken && !now.busy,
        120_000
      );
    };
    /** The hub restarted under the pages, their sockets held off until it (and the agent, unless away) is up. */
    const restart = async (agentAway: boolean) => {
      wire.holding = true;
      if (agentAway) {
        await fleet.stop("agent");
      }
      await fleet.stop("hub");
      fleet.launch("hub");
      await fleet.hubUp();
      if (!agentAway) {
        await fleet.agentUp();
      }
      wire.holding = false;
      for (const one of [page, parentPage]) {
        // biome-ignore lint/performance/noAwaitInLoops: one page at a time
        await one.evaluate(() => window.dispatchEvent(new Event("online")));
      }
    };

    // A reset over the rows.
    {
      await speak("reset");
      await page.waitForTimeout(3000);
      const before = await place(page);
      const from = wire.reads.length;
      await restart(false);
      await until(
        "reset: the newest page read again",
        () => Promise.resolve(newestSince(from).length),
        (n) => n >= 1,
        60_000
      ).catch(() => 0);
      await page.waitForTimeout(5000);
      held(
        "reset: the rows stay and the place holds",
        before,
        await place(page)
      );
      kit.check(
        "reset: no older page is read again",
        olderSince(from) === 0,
        `${olderSince(from)} older page read(s)`
      );
    }

    // The hub fails the read.
    {
      await speak("5xx");
      await page.waitForTimeout(3000);
      const before = await place(page);
      const from = wire.reads.length;
      const logsFrom = logs.length;
      // Failing from the reset's read on, through Try again's, until let go below.
      wire.failUntil = Date.now() + 600_000;
      await restart(false);
      await until(
        "5xx: the read failed",
        () => Promise.resolve(newestSince(from).some((r) => r.status === 500)),
        Boolean,
        60_000
      ).catch(() => false);
      await page.waitForTimeout(3000);
      const failed = await place(page);
      held("5xx: the rows stay and the place holds", before, failed);
      kit.check(
        "5xx: the pane says it is not caught up, with Try again",
        failed.strip?.text === BEHIND && failed.strip.retry,
        failed.strip
          ? `"${failed.strip.text}"${failed.strip.retry ? " [Try again]" : " (no Try again)"}`
          : "no line in the pane"
      );
      const retriedFrom = wire.reads.length;
      await page
        .locator(".behind button", { hasText: "Try again" })
        .click({ timeout: 10_000 })
        .catch(() => undefined);
      const retried = await until(
        "5xx: Try again read again",
        () =>
          Promise.resolve(
            newestSince(retriedFrom).some((r) => r.status === 500)
          ),
        Boolean,
        15_000
      ).catch(() => false);
      await page.waitForTimeout(1500);
      const still = await place(page);
      kit.check(
        "5xx: Try again reads again",
        retried && still.strip !== null,
        `line ${still.strip ? "still there" : "gone"}`
      );
      // The backoff reads it again by itself; once the hub answers, it lands.
      wire.failUntil = 0;
      await fleet.send(sessionId, "One more line.");
      const gone = await until(
        "5xx: the line goes",
        () => place(page),
        (now) => now.strip === null,
        90_000
      ).catch(() => undefined);
      const heard = logs.slice(logsFrom);
      const backoff = heard.filter((l) => l.includes("because backoff"));
      const failedReads = newestSince(from).filter((r) => r.status === 500);
      kit.check(
        "5xx: read again on the backoff (2s, 4s, 8s, 16s, …), not on every frame",
        backoff.length >= 1 && failedReads.length <= 7,
        `${failedReads.length} failed read(s), ${backoff.length} read(s) because backoff`
      );
      const toasts = heard.filter((l) => l.startsWith("[cawco] toast: "));
      kit.check(
        "5xx: exactly one toast says why, in one sentence, nothing raw",
        toasts.length === 1 &&
          (toasts[0] ?? "").includes(
            `${FAILED_REASON}. Try again reads it now`
          ) &&
          !(toasts[0] ?? "").includes("Error:") &&
          !(toasts[0] ?? "").includes("    at "),
        toasts.join(" | ") || "no toast"
      );
      kit.check("5xx: the line goes once the read lands", gone !== undefined);
      await page.waitForTimeout(4000);
      held(
        "5xx: the rows stay and the place holds after",
        before,
        await place(page)
      );
    }

    // The machine offline.
    {
      await speak("offline");
      if (delegateId) {
        // The card's session speaks too, so its well is read again over the rows it holds.
        await speak("offline: the card's session", delegateId);
      }
      await page.waitForTimeout(3000);
      let before = await place(page);
      const from = wire.reads.length;
      const logsFrom = logs.length;
      await restart(true);
      await until(
        "offline: the read found the machine away",
        () => Promise.resolve(newestSince(from).some((r) => r.status === 503)),
        Boolean,
        60_000
      ).catch(() => false);
      await page.waitForTimeout(3000);
      // The hub heard from the machine moments ago: it is on its way back.
      const coming = await place(page);
      held(
        "offline: the rows stay and the place holds while the machine reconnects",
        before,
        coming
      );
      const toastedSoFar = logs
        .slice(logsFrom)
        .filter((l) => l.startsWith("[cawco] toast: "));
      kit.check(
        "offline: while the hub reads the machine as reconnecting, the pane says so, with no toast",
        coming.strip?.text.endsWith(RECONNECTING_NEXT) === true &&
          !coming.strip.retry &&
          toastedSoFar.length === 0,
        `${coming.strip ? `"${coming.strip.text}"` : "no line in the pane"}; ${toastedSoFar.length} toast(s)`
      );
      // Once the hub stops reading it so, the pane reads again by itself.
      const reads503 = newestSince(from).filter((r) => r.status === 503).length;
      const lapsed = await until(
        "offline: the pane says the machine is offline",
        () => place(page),
        (now) => now.strip?.text.startsWith(BEHIND) === true,
        RECONNECTING_MS + 30_000
      ).catch(() => undefined);
      const readsAfter = newestSince(from).filter(
        (r) => r.status === 503
      ).length;
      kit.check(
        "offline: once the hub stops reading the machine as reconnecting, the pane reads again by itself and says it is offline",
        lapsed !== undefined && readsAfter > reads503,
        `${readsAfter - reads503} read(s) again; ${lapsed?.strip ? `"${lapsed.strip.text}"` : "no offline line"}`
      );
      await page.waitForTimeout(1000);
      const away = await place(page);
      held(
        "offline: the rows stay and the place holds while the machine is offline",
        before,
        away
      );
      kit.check(
        "offline: the pane says it is not caught up, and what comes next, on one line on the desk",
        away.strip?.text.startsWith(BEHIND) === true &&
          away.strip.text.endsWith(OFFLINE_NEXT) &&
          away.strip.lines === 1 &&
          !away.strip.retry,
        away.strip
          ? `"${away.strip.text}", ${away.strip.lines} line(s)`
          : "no line in the pane"
      );
      await page.setViewportSize({ width: 390, height: 844 });
      await page.waitForTimeout(2000);
      const narrow = await place(page);
      kit.check(
        "offline: at 390 the line wraps to at most two, the machine's name whole",
        narrow.strip !== null &&
          narrow.strip.lines <= 2 &&
          narrow.strip.nameWhole,
        narrow.strip
          ? `${narrow.strip.lines} line(s), name ${narrow.strip.nameWhole ? "whole" : "split"}`
          : "no line at 390"
      );
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.waitForTimeout(3000);
      before = await place(page);
      await parentPage.bringToFront();
      // The well's own read again lands on its own clock, within moments of the pane's.
      const wellAway = await until(
        "offline: the well says the machine is offline",
        () => well(parentPage),
        (now) => now.strip?.endsWith(OFFLINE_NEXT) === true,
        15_000
      ).catch(() => well(parentPage));
      kit.check(
        "offline: the delegate's well says it is not caught up over its rows",
        wellAway.drawn && wellAway.strip?.endsWith(OFFLINE_NEXT) === true,
        wellAway.strip
          ? `"${wellAway.strip}"`
          : `no line in the well (${wellAway.drawn ? "rows drawn" : "no rows"})`
      );
      await page.bringToFront();
      fleet.launch("agent");
      await fleet.agentUp();
      const caught = await until(
        "offline: read again once the machine is online",
        () =>
          Promise.resolve(
            logs.slice(logsFrom).some((l) => l.includes("machineOnline"))
          ),
        Boolean,
        60_000
      ).catch(() => false);
      kit.check(
        "offline: read again once the hub says the machine is online",
        caught
      );
      const gone = await until(
        "offline: the line goes",
        () => place(page),
        (now) => now.strip === null,
        30_000
      ).catch(() => undefined);
      kit.check(
        "offline: the line goes once the read lands",
        gone !== undefined
      );
      const wellBack = await until(
        "offline: the well's line goes",
        () => well(parentPage),
        (now) => now.drawn && now.strip === null,
        30_000
      ).catch(() => undefined);
      kit.check(
        "offline: the well's line goes, its rows drawn",
        wellBack !== undefined,
        wellLogs.slice(-3).join(" | ")
      );
      await page.waitForTimeout(5000);
      held(
        "offline: the rows stay and the place holds",
        before,
        await place(page)
      );
      kit.check(
        "offline: no older page is read again",
        olderSince(from) === 0,
        `${olderSince(from)} older page read(s)`
      );
    }

    kit.check(
      "no page throws through the restarts",
      thrown.length === 0,
      thrown.slice(0, 3).join(" | ") || "nothing thrown"
    );

    // A page loaded with the hub away: every read it makes answers the
    // dashboard's own 502, in text, as its proxy does when the hub is down.
    {
      const away = await kit.page("desk");
      const awayThrown: string[] = [];
      away.on("pageerror", (error) => {
        awayThrown.push(error.message);
      });
      await away.route("**/api/**", (route) =>
        route.fulfill({
          status: 502,
          contentType: "text/plain; charset=utf-8",
          headers: { [UNREACHED_HEADER]: "1" },
          body: UNREACHED,
        })
      );
      await away.goto(`${base}/session/${sessionId}`, {
        waitUntil: "domcontentloaded",
      });
      await away.waitForTimeout(AWAY_HOLD_MS);
      kit.check(
        `hub away: a page loaded with every read answering 502 text throws nothing in ${AWAY_HOLD_MS / 1000}s`,
        awayThrown.length === 0,
        awayThrown.slice(0, 3).join(" | ") || "nothing thrown"
      );
    }
  },
};
export default spec;
