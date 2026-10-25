/**
 * A session's transcript says what happened to its account, not every
 * attempt (hub server.ts `noteAtLimit`, at-limit.ts `unmoved`, db
 * at-limit.ts `waitsLine`). On a scratch fleet (real hub, agent and
 * sessiond; the real Claude Code CLI against the mock model) with four
 * Claude accounts: an orchestrator's child, its last turn sent by its
 * parent, refused at A's limit with a command running in the background. No
 * person waits on it, so its move waits for that command.
 *
 * - Three attempts, each to another account (B, then C, then D: only one of
 *   them has room at a time, and a message from its parent held at the
 *   limit has the hub look again at once), are one line, "Can't move from
 *   A to … yet", its target said again in its place: the same line, never a
 *   second one.
 * - On Chromium and WebKit at 1440 and 390, the session's page draws that
 *   one row, the same element taking the new target as it changes, and a
 *   reload draws the one row again; no console error.
 * - Its hold's start set back past the cap, the next look moves it to D,
 *   ending the command: the waiting line gives way to one line of its move,
 *   on the hub and on every page.
 *
 *   bun scripts/probe-kit/run.ts limit-wait-row
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Page } from "playwright-core";
import type { accountMoveWords } from "../../../packages/core/src/accounts";
import { CLAUDE_JSON_NAME } from "../../../packages/core/src/claude-dirs";
import { toolWords } from "../../lib/tool-call";
import { ACCOUNT, type Reply, type Seen, until } from "../../scratch-fleet";
import {
  type Engine,
  type Kit,
  type KitFleet,
  open,
  type Spec,
  type View,
} from "../kit";

const A = ACCOUNT;
const B = "acct-wait-row-b";
const C = "acct-wait-row-c";
const D = "acct-wait-row-d";
const OTHERS = [B, C, D] as const;
const TOKEN: Record<string, string> = {
  [A]: "sk-ant-oat01-fake-scratch-fleet",
  [B]: "sk-ant-oat01-fake-scratch-fleet-wait-b",
  [C]: "sk-ant-oat01-fake-scratch-fleet-wait-c",
  [D]: "sk-ant-oat01-fake-scratch-fleet-wait-d",
};
const NAME: Record<string, string> = {
  [A]: "Probe",
  [B]: "Probe B",
  [C]: "Probe C",
  [D]: "Probe D",
};
const HOUR = 3_600_000;
const MINUTE = 60_000;
/** The restart bound a move waits for work held for later (core binary-updates.ts `RESTART_WAIT_CAP_MS`). */
const CAP_MS = 30 * MINUTE;
/** The one account with room at an attempt: its 5-hour window as read, and the dollars a percent of it costs. */
const ROOM_PCT = 72;
const USD_PER_PCT = 2.56;
/** Only this session's words carry it. */
const MARK = "PROBE-WAIT-ROW";
/** What the hub tells a session whose move ended its background work (server.ts `endedByMoveWords`). */
const ENDED = "You were moved to another account.";
/** The views every page is read at, on each engine. */
const PAGES: readonly { engine: Engine; view: View }[] = [
  { engine: "chromium", view: "desk" },
  { engine: "chromium", view: "phone" },
  { engine: "webkit", view: "desk" },
  { engine: "webkit", view: "phone" },
];

/** Until when A refuses the session. */
let limitedUntil = 0;
/** Its first turn has answered. */
let worked = false;

const text = (words: string): Reply => ({ everyMs: 5, words: [words] });
const onAccount = (request: Seen, id: string): boolean =>
  request.auth.endsWith(TOKEN[id] as string);

const respond = (request: Seen): Reply => {
  if (!request.tools) {
    return text("Probe title");
  }
  if (!request.all.includes(MARK)) {
    return text("ok");
  }
  if (onAccount(request, A) && limitedUntil > Date.now()) {
    return { everyMs: 5, words: [], refuse: { resetsAt: limitedUntil } };
  }
  // Its first turn leaves a command running in the background, which no
  // resume on another account brings back.
  if (!(worked || request.afterTool)) {
    return {
      everyMs: 5,
      words: [],
      tool: {
        name: "Bash",
        input: {
          command: "sleep 900",
          description: "A long wait in the background",
          run_in_background: true,
        },
      },
    };
  }
  if (!worked) {
    worked = true;
    return text("Working on it.");
  }
  return text("Carrying on.");
};

/** An account's Claude dir in `home`, signed in with its token, in an organization of its own. */
const furnish = async (home: string, id: string, n: number) => {
  const dir = join(home, ".cawco", "accounts", id, "claude");
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, ".credentials.json"),
    JSON.stringify({
      claudeAiOauth: {
        accessToken: TOKEN[id],
        expiresAt: Date.now() + 365 * 24 * HOUR,
        scopes: ["user:inference", "user:profile"],
        subscriptionType: "max",
      },
    })
  );
  await writeFile(
    join(dir, CLAUDE_JSON_NAME),
    JSON.stringify({
      hasCompletedOnboarding: true,
      oauthAccount: {
        emailAddress: `probe-wait-${n}@scratch-fleet.test`,
        organizationName: `Wait Organization ${n}`,
        accountUuid: `00000000-0000-4000-8000-0000000000d${n}`,
        organizationUuid: `00000000-0000-4000-8000-0000000000e${n}`,
      },
    })
  );
};

/** An account's 5-hour window: `percent` used, resetting at `resetsAt`. */
const window5h = (
  fleet: KitFleet,
  id: string,
  percent: number,
  resetsAt: number
) =>
  fleet.write(
    "INSERT OR REPLACE INTO account_windows (account_id, kind, scope_label, \"group\", is_active, percent, severity, resets_at) VALUES (?, 'session', '', 'session', 1, ?, ?, ?)",
    id,
    percent,
    percent >= 100 ? "critical" : "normal",
    new Date(resetsAt).toISOString()
  );

/**
 * An account's room measured as the hub measures a signed-in account's
 * (forecast.ts `usdPerPercent`): its history moving 0% → {@link ROOM_PCT}
 * across that many percent's dollars of its turns.
 */
const measure = (fleet: KitFleet, id: string): void => {
  const now = Date.now();
  const resetsAt = now + 4 * HOUR;
  for (const [percent, at] of [
    [0, now - 2 * HOUR],
    [ROOM_PCT, now - HOUR],
  ] as const) {
    fleet.write(
      "INSERT INTO usage_limit_history (account_id, kind, scope_label, percent, severity, resets_at, fetched_at) VALUES (?, 'session', NULL, ?, 'normal', ?, ?)",
      id,
      percent,
      new Date(resetsAt).toISOString(),
      at
    );
  }
  fleet.write(
    "INSERT INTO turn_usage (instance_id, result_id, model, account_id, input_tokens, cache_read_tokens, cache_write_tokens, cache_write_1h_tokens, output_tokens, cost_usd, keep_alive, at) VALUES (?, ?, 'claude-probe', ?, 0, 0, 0, 0, 0, ?, 0, ?)",
    `${id}-history`,
    `${id}-history`,
    id,
    ROOM_PCT * USD_PER_PCT,
    now - 1.5 * HOUR
  );
};

/** Only `id` of B, C and D has room; the other two are at their limit for an hour. */
const roomOn = (fleet: KitFleet, id: string): void => {
  const now = Date.now();
  for (const one of OTHERS) {
    if (one === id) {
      window5h(fleet, one, ROOM_PCT, now + 4 * HOUR);
    } else {
      window5h(fleet, one, 100, now + HOUR);
    }
  }
};

const standUp = async (kit: Kit): Promise<KitFleet> => {
  const fleet = await kit.fleet(respond);
  for (const [n, id] of OTHERS.entries()) {
    // biome-ignore lint/performance/noAwaitInLoops: one account's dir at a time
    await furnish(fleet.home, id, n + 1);
  }
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  for (const [n, id] of OTHERS.entries()) {
    fleet.write(
      "INSERT OR IGNORE INTO accounts (id, provider, kind, label, hue, \"order\", never_backup, created_at) VALUES (?, 'anthropic', 'subscription', ?, 'green', ?, 0, ?)",
      id,
      NAME[id],
      n + 1,
      Date.now()
    );
  }
  fleet.launch("agent");
  await fleet.agentUp();
  await fleet.accountSignedIn();
  for (const id of OTHERS) {
    // biome-ignore lint/performance/noAwaitInLoops: one account's sign-in at a time
    await until(
      `account ${NAME[id]} signed in`,
      () =>
        fleet.query<{ state: string }>(
          "SELECT state FROM account_signins WHERE account_id = ?",
          id
        )[0],
      (row) => row?.state === "signed-in",
      120_000
    );
  }
  for (const id of [A, ...OTHERS]) {
    fleet.write(
      "INSERT OR REPLACE INTO account_readings (account_id, subscription, overage, last_seen_at) VALUES (?, 'max', NULL, ?)",
      id,
      Date.now()
    );
  }
  for (const id of OTHERS) {
    measure(fleet, id);
  }
  roomOn(fleet, B);
  const placed = { strategy: "pinned", pinnedAccountId: A };
  const put = await fetch(`${fleet.base}/api/accounts/routing/anthropic`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      yours: placed,
      delegates: placed,
      atLimit: { move: true, waitMinutes: 0, moveWholeUnderK: 200 },
    }),
  });
  if (!put.ok) {
    throw new Error(`routing: ${put.status} ${await put.text()}`);
  }
  return fleet;
};

/**
 * A message to `id` from its parent session `parent`, sent as a parent
 * sends it: its `handoff`, through the hub's tool door with the parent's own
 * credential (a page's send is the person's, hub stream.ts, so a socket
 * send naming the parent is refused).
 */
const peerSend = async (
  fleet: KitFleet,
  id: string,
  parent: string,
  words: string
): Promise<void> => {
  const credential = await until(
    "the parent's credential",
    () => fleet.sessionCredential(parent),
    Boolean,
    60_000
  );
  const said = await toolWords(
    { base: fleet.base, id: parent, credential },
    "handoff",
    { target: id, message: words }
  );
  if (said.refused) {
    throw new Error(`the parent's handoff was refused: ${said.text}`);
  }
};

type Move = Parameters<typeof accountMoveWords>[0];
interface Line {
  content: string;
  id: string;
  move: Move | undefined;
}

/** The account lines in `id`'s transcript, as a fresh read of it serves them, oldest first. */
const accountLines = async (fleet: KitFleet, id: string): Promise<Line[]> =>
  (
    await fleet.api<{
      blocks: {
        content: string;
        id: string;
        metadata?: { accountMove?: Move };
        type: string;
      }[];
    }>(`/api/instances/${id}/transcript?limit=400`)
  ).blocks
    .filter((one) => one.type === "system.account_move")
    .map((one) => ({
      id: one.id,
      content: one.content,
      move: one.metadata?.accountMove,
    }));

const waitingOf = (lines: Line[]) =>
  lines.filter(
    (one) => one.move?.kind === "unmoved" && one.move.waits === true
  );
const movedOf = (lines: Line[]) =>
  lines.filter((one) => one.move?.kind === "moved");

/** The words of a waiting move from A to `to`. */
const waitingWords = (to: string) =>
  `Can't move from ${NAME[A]} to ${NAME[to]} yet`;

/** The account rows `page` draws, in order: each one's words, and whether it is the element tagged before. */
const rowsShown = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll("[data-account-move-divider-glyph]")].map(
      (glyph) => {
        const row = glyph.closest(".group\\/move");
        return {
          words:
            row
              ?.querySelector('[data-slot="words"]')
              ?.textContent?.replace(/\s+/g, " ")
              .trim() ?? "",
          tagged: row?.hasAttribute("data-probe-tagged") ?? false,
        };
      }
    )
  );

/** Tags the account rows `page` draws, so a later read tells the same element from a new one. */
const tagRows = (page: Page) =>
  page.evaluate(() => {
    for (const glyph of document.querySelectorAll(
      "[data-account-move-divider-glyph]"
    )) {
      glyph.closest(".group\\/move")?.setAttribute("data-probe-tagged", "");
    }
  });

/** Everything `page` said went wrong: its console errors and uncaught errors. */
const errorsOf = (page: Page): string[] => {
  const said: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      said.push(message.text());
    }
  });
  page.on("pageerror", (error) => {
    said.push(`${error.message}\n${error.stack ?? ""}`);
  });
  return said;
};

interface Shown {
  errors: string[];
  label: string;
  page: Page;
}

/** Waits until `page` draws its account rows as `ok` says, then answers what it drew. */
const drawn = (
  page: Page,
  what: string,
  ok: (rows: Awaited<ReturnType<typeof rowsShown>>) => boolean
) =>
  until(what, () => rowsShown(page), ok, 30_000).catch(() => rowsShown(page));

/**
 * One attempt to `to`: only it has room, and a message from the parent,
 * held at A's limit, has the hub look again now. Answers the transcript's
 * account lines once the waiting line names `to`.
 */
const attempt = async (
  fleet: KitFleet,
  id: string,
  parent: string,
  to: string,
  n: number
): Promise<Line[]> => {
  roomOn(fleet, to);
  await peerSend(fleet, id, parent, `${MARK}: and step ${n}`);
  return await until(
    `attempt ${n}: its waiting line names ${NAME[to]}`,
    () => accountLines(fleet, id),
    (lines) =>
      waitingOf(lines).some((one) => one.content.startsWith(waitingWords(to))),
    120_000
  ).catch(() => accountLines(fleet, id));
};

const run = async (kit: Kit) => {
  const fleet = await standUp(kit);
  const parent = await fleet.spawn("claude", "Wait parent", fleet.repo, {
    account: A,
  });
  const id = await fleet.spawn("claude", "Wait row", fleet.repo, {
    account: A,
  });
  fleet.write(
    "UPDATE instances SET parent_instance_id = ? WHERE id = ?",
    parent,
    id
  );
  await peerSend(fleet, id, parent, `${MARK}: start`);
  await until(
    "its first turn answered, the command left running",
    () => (worked && fleet.instance(id)?.turn_open_at === null ? 1 : 0),
    Boolean,
    120_000
  );
  // A refuses it well past every step here, and well before the cap's end.
  limitedUntil = Date.now() + 25 * MINUTE;

  // Attempt 1, to B: refused at A's limit, its move waits for its command.
  await peerSend(fleet, id, parent, `${MARK}: and the next thing`);
  const first = await until(
    "attempt 1: its waiting line names B",
    () => accountLines(fleet, id),
    (lines) =>
      waitingOf(lines).some((one) => one.content.startsWith(waitingWords(B))),
    120_000
  ).catch(() => accountLines(fleet, id));
  const [line] = waitingOf(first);
  kit.check(
    "attempt 1: its move to B waits for its command, one line saying it can't move yet",
    first.length === 1 &&
      !!line?.content.startsWith(waitingWords(B)) &&
      fleet.query<{ account_id: string }>(
        "SELECT account_id FROM instances WHERE id = ?",
        id
      )[0]?.account_id === A,
    JSON.stringify(first)
  );

  // Attempt 2, to C: the same line, said again in its place.
  const second = await attempt(fleet, id, parent, C, 2);
  kit.check(
    "attempt 2: its move now waits to go to C, and the transcript still holds exactly one account line, the same one, its target changed to C",
    second.length === 1 &&
      waitingOf(second).length === 1 &&
      second[0]?.id === line?.id &&
      !!second[0]?.content.startsWith(waitingWords(C)),
    JSON.stringify(second)
  );

  // Every page draws that one row; a reload draws it again.
  const base = await fleet.dashboard();
  const shown: Shown[] = [];
  for (const { engine, view } of PAGES) {
    // biome-ignore lint/performance/noAwaitInLoops: one page at a time
    const page = await kit.page(view, { engine });
    const errors = errorsOf(page);
    const label = `${engine} ${view}`;
    await open(
      page,
      `${base}/session/${id}`,
      "[data-account-move-divider-glyph]"
    );
    const before = await drawn(
      page,
      `${label}: one waiting row naming C`,
      (rows) => rows.length === 1
    );
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector("[data-account-move-divider-glyph]", {
      timeout: 60_000,
    });
    const after = await drawn(
      page,
      `${label}: one waiting row naming C after the reload`,
      (rows) => rows.length === 1
    );
    kit.check(
      `${label}: the session's page draws one account row, its move waiting to go to C, and a reload draws that one row again`,
      before.length === 1 &&
        !!before[0]?.words.startsWith(waitingWords(C)) &&
        after.length === 1 &&
        !!after[0]?.words.startsWith(waitingWords(C)),
      JSON.stringify({ before, after })
    );
    await tagRows(page);
    shown.push({ page, errors, label });
  }

  // Attempt 3, to D: the same line again, and the same element on each page.
  const third = await attempt(fleet, id, parent, D, 3);
  kit.check(
    "attempt 3: its move now waits to go to D, and the transcript still holds exactly one account line, the same one, its target changed to D",
    third.length === 1 &&
      waitingOf(third).length === 1 &&
      third[0]?.id === line?.id &&
      !!third[0]?.content.startsWith(waitingWords(D)),
    JSON.stringify(third)
  );
  for (const { page, label } of shown) {
    // biome-ignore lint/performance/noAwaitInLoops: one page at a time
    const live = await drawn(
      page,
      `${label}: the row names D`,
      (rows) =>
        rows.length === 1 && !!rows[0]?.words.startsWith(waitingWords(D))
    );
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector("[data-account-move-divider-glyph]", {
      timeout: 60_000,
    });
    const reloaded = await drawn(
      page,
      `${label}: one row naming D after the reload`,
      (rows) => rows.length === 1
    );
    kit.check(
      `${label}: live, the one row it drew changes in place to name D, never a second row; a reload draws that one row`,
      live.length === 1 &&
        !!live[0]?.tagged &&
        !!live[0].words.startsWith(waitingWords(D)) &&
        reloaded.length === 1 &&
        !!reloaded[0]?.words.startsWith(waitingWords(D)),
      JSON.stringify({ live, reloaded })
    );
  }

  // It lands: its hold's start set back past the cap, the next look (its
  // parent's message, held at the limit) moves it to D, ending the command.
  fleet.write(
    "UPDATE limit_holds SET created_at = ? WHERE instance_id = ?",
    Date.now() - CAP_MS - MINUTE,
    id
  );
  const landingAt = Date.now();
  await peerSend(fleet, id, parent, `${MARK}: and the last step`);
  const onD = await until(
    "it runs on D, told what the move ended",
    () =>
      fleet.seen.find(
        (one) =>
          one.at > landingAt &&
          one.all.includes(MARK) &&
          onAccount(one, D) &&
          one.all.includes(ENDED)
      ),
    Boolean,
    120_000
  ).catch(() => undefined);
  const landed = await until(
    "its transcript holds the one moved line",
    () => accountLines(fleet, id),
    (lines) => movedOf(lines).length === 1 && waitingOf(lines).length === 0,
    30_000
  ).catch(() => accountLines(fleet, id));
  const [moved] = landed;
  /** The moved line's words, as the hub says them and every page draws them. */
  const movedLine = moved?.content ?? "";
  kit.check(
    "landed: it runs on D, and the waiting line gave way to exactly one line, its move to D: no waiting line is left, nothing else stands",
    !!onD &&
      landed.length === 1 &&
      movedOf(landed).length === 1 &&
      moved?.move?.kind === "moved" &&
      moved.move.to?.id === D &&
      moved.id !== line?.id,
    JSON.stringify(landed)
  );
  for (const { page, errors, label } of shown) {
    // biome-ignore lint/performance/noAwaitInLoops: one page at a time
    const live = await drawn(
      page,
      `${label}: the one row says it moved to D`,
      (rows) => rows.length === 1 && rows[0]?.words === movedLine
    );
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector("[data-account-move-divider-glyph]", {
      timeout: 60_000,
    });
    const reloaded = await drawn(
      page,
      `${label}: one moved row after the reload`,
      (rows) => rows.length === 1
    );
    kit.check(
      `${label}: live and after a reload, the page draws exactly one account row, its move to D in the hub's words`,
      movedLine !== "" &&
        live.length === 1 &&
        live[0]?.words === movedLine &&
        reloaded.length === 1 &&
        reloaded[0]?.words === movedLine,
      JSON.stringify({ live, reloaded })
    );
    kit.check(
      `${label}: no console error from open to close`,
      errors.length === 0,
      JSON.stringify(errors.slice(0, 5))
    );
  }
};

export default {
  name: "limit-wait-row",
  run,
} satisfies Spec;
