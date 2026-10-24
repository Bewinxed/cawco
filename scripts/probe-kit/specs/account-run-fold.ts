/**
 * A run of account lines with no turn between them reads as one row
 * (dashboard rows.ts `accountRunAt`, AccountMoveDivider.svelte; core
 * `accountRunWords`). On a scratch fleet (real hub, agent and sessiond; the
 * real Claude Code CLI against the mock model) with four Claude accounts in
 * organizations of their own:
 *
 * - one session, its first turn answered, holds five landed moves (one
 *   re-reading 737k tokens cold, one compacted there) and a move that
 *   couldn't go, stored after that turn: each page (Chromium and WebKit, at
 *   1440 and 390) draws them as one account row; a sixth move by hand lands
 *   with the pages open and joins that row, the same element, live, with no
 *   console error. (A move by hand leaves the session's process with no
 *   conversation to wake from until its next turn, so the hand can't land
 *   a run of moves with no turn between them: the run is stored.)
 * - a waiting move is stored after it: a reload draws one row of all eight,
 *   saying where the session is now and the move that cost most in core's
 *   run words, and opening it lists the eight in order, each in the hub's
 *   words;
 * - a second session with three moves, a turn, then three more draws two
 *   rows of three.
 *
 *   bun scripts/probe-kit/run.ts account-run-fold
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Page } from "playwright-core";
import {
  type AccountMove,
  accountRunWords,
} from "../../../packages/core/src/accounts";
import { CLAUDE_JSON_NAME } from "../../../packages/core/src/claude-dirs";
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
const B = "acct-run-fold-b";
const C = "acct-run-fold-c";
const D = "acct-run-fold-d";
const OTHERS = [B, C, D] as const;
const TOKEN: Record<string, string> = {
  [B]: "sk-ant-oat01-fake-scratch-fleet-run-b",
  [C]: "sk-ant-oat01-fake-scratch-fleet-run-c",
  [D]: "sk-ant-oat01-fake-scratch-fleet-run-d",
};
const NAME: Record<string, string> = {
  [A]: "Probe",
  [B]: "Probe B",
  [C]: "Probe C",
  [D]: "Probe D",
};
const HOUR = 3_600_000;
/** Only these sessions' words carry it. */
const MARK = "PROBE-RUN-FOLD";
/** The views every page is read at, on each engine. */
const PAGES: readonly { engine: Engine; view: View }[] = [
  { engine: "chromium", view: "desk" },
  { engine: "chromium", view: "phone" },
  { engine: "webkit", view: "desk" },
  { engine: "webkit", view: "phone" },
];
const ROW = "[data-account-move-divider-glyph]";
/** The account rows of the transcript on screen: a phone keeps the one it left mounted under it. */
const SHOWN_ROW = `[data-transcript-shown] ${ROW}`;

const text = (words: string): Reply => ({ everyMs: 5, words: [words] });
const respond = (request: Seen): Reply =>
  request.tools && request.all.includes(MARK)
    ? text("Noted.")
    : text("Probe title");

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
        emailAddress: `probe-run-${n}@scratch-fleet.test`,
        organizationName: `Run Organization ${n}`,
        accountUuid: `00000000-0000-4000-8000-0000000000f${n}`,
        organizationUuid: `00000000-0000-4000-8000-0000000000a${n}`,
      },
    })
  );
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
      "INSERT OR IGNORE INTO accounts (id, provider, kind, label, hue, \"order\", never_backup, created_at) VALUES (?, 'anthropic', 'subscription', ?, ?, ?, 0, ?)",
      id,
      NAME[id],
      ["green", "amber", "violet"][n],
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
  return fleet;
};

interface Line {
  content: string;
  id: string;
  move: AccountMove | undefined;
}

/** The account lines in `id`'s transcript, as a fresh read of it serves them, oldest first. */
const accountLines = async (fleet: KitFleet, id: string): Promise<Line[]> =>
  (
    await fleet.api<{
      blocks: {
        content: string;
        id: string;
        metadata?: { accountMove?: AccountMove };
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

/** A turn of `id`'s, answered: `words` sent, and its turn closed. */
const turn = async (fleet: KitFleet, id: string, words: string) => {
  const since = Date.now();
  await fleet.send(id, `${MARK}: ${words}`);
  await until(
    `${words}: answered`,
    () =>
      fleet.seen.some(
        (one) => one.at > since && one.tools && one.last.includes(words)
      ) && fleet.instance(id)?.turn_open_at === null
        ? 1
        : 0,
    Boolean,
    120_000
  );
};

/** Moves `id` by hand to `to`, as the account chip does, once its line is in. */
const moveTo = async (fleet: KitFleet, id: string, to: string) => {
  const before = (await accountLines(fleet, id)).length;
  const from = fleet.query<{ account_id: string }>(
    "SELECT account_id FROM instances WHERE id = ?",
    id
  )[0]?.account_id as string;
  // A session relaunched by the move before is busy a moment while its
  // custody settles: a move asked then waits for a turn that never comes,
  // so it is called off and asked again until it goes now.
  await until(
    `the move to ${NAME[to]} goes now`,
    async () => {
      const answer = await fleet.api<{ state: string }>(
        `/api/instances/${id}/account`,
        { accountId: to }
      );
      if (answer.state === "pending") {
        await fleet.api(`/api/instances/${id}/account`, { accountId: from });
        await Bun.sleep(2000);
      }
      return answer.state;
    },
    (state) => state === "moved",
    90_000
  );
  await until(
    `moved to ${NAME[to]}, its line in`,
    async () => ({
      account: fleet.query<{ account_id: string | null }>(
        "SELECT account_id FROM instances WHERE id = ?",
        id
      )[0]?.account_id,
      lines: (await accountLines(fleet, id)).length,
    }),
    (now) => now.account === to && now.lines > before,
    60_000
  );
};

/** The account rows `page` draws: each one's words, how many lines it holds, and whether it is the element tagged before. */
const rowsShown = (page: Page) =>
  page.evaluate(
    (glyphs) =>
      [...document.querySelectorAll(glyphs)]
        .filter((glyph) => glyph.checkVisibility({ visibilityProperty: true }))
        .map((glyph) => {
          const row = glyph.closest(".group\\/move");
          const button = row?.querySelector("button");
          return {
            words:
              row
                ?.querySelector('button [data-slot="words"]')
                ?.textContent?.replace(/\s+/g, " ")
                .trim() ?? "",
            lines: Number(button?.getAttribute("data-account-run") ?? 1),
            tagged: row?.hasAttribute("data-probe-tagged") ?? false,
            listed: [
              ...(row?.querySelectorAll(
                '[data-slot="account-run-line"] [data-slot="words"]'
              ) ?? []),
            ].map((one) => one.textContent?.replace(/\s+/g, " ").trim() ?? ""),
            // How far any opened line reaches past the row's own box, px.
            spill: Math.max(
              0,
              ...[
                ...(row?.querySelectorAll('[data-slot="account-run-line"]') ??
                  []),
              ].map(
                (one) =>
                  one.getBoundingClientRect().right -
                  (row?.getBoundingClientRect().right ?? 0)
              )
            ),
          };
        }),
    SHOWN_ROW
  );

type Shown = Awaited<ReturnType<typeof rowsShown>>;

/** Waits until `page` draws its account rows as `ok` says, then answers what it drew. */
const drawn = (page: Page, what: string, ok: (rows: Shown) => boolean) =>
  until(what, () => rowsShown(page), ok, 30_000).catch(() => rowsShown(page));

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

/** The stored line a move that failed, or waits, writes (hub at-limit.ts `unmoved`), named as the hub names accounts. */
const unmoved = (to: string, reason: string, waits: boolean): AccountMove => ({
  kind: "unmoved",
  action: "move",
  from: { id: D, name: NAME[D] as string, hue: "violet" },
  to: { id: to, name: NAME[to] as string, hue: "green" },
  step: "start",
  reason,
  ...(waits ? { waits: true as const } : {}),
});

/** The stored line a landed move writes (hub at-limit.ts `movedNote`), named as the hub names accounts. */
const moved = (
  from: string,
  to: string,
  how: { compact?: "compacted"; same: boolean; tokens: number }
): AccountMove => ({
  kind: "moved",
  from: { id: from, name: NAME[from] as string, hue: "blue" },
  to: { id: to, name: NAME[to] as string, hue: "green" },
  sameOrganization: how.same,
  tokens: how.tokens,
  window: "5-hour",
  resetsAt: null,
  ...(how.compact ? { compact: how.compact } : {}),
});

/** Writes `moves` into `id`'s stored lines, a millisecond apart from `at`. */
const store = (
  fleet: KitFleet,
  id: string,
  at: number,
  moves: AccountMove[]
): void => {
  for (const [n, move] of moves.entries()) {
    fleet.write(
      "INSERT INTO limit_events (id, instance_id, at, move) VALUES (?, ?, ?, ?)",
      crypto.randomUUID(),
      id,
      at + n,
      JSON.stringify(move)
    );
  }
};

/** Starts the hub again, its transcripts read afresh from the machine and its stored lines. */
const restart = async (fleet: KitFleet, write: () => void): Promise<void> => {
  await fleet.stop("hub");
  write();
  fleet.launch("hub");
  await fleet.hubUp();
};

const movesIn = (lines: Line[]): AccountMove[] =>
  lines.flatMap((line) => (line.move ? [line.move] : []));

const run = async (kit: Kit) => {
  const fleet = await standUp(kit);
  const one = await fleet.spawn("claude", "Run fold", fleet.repo, {
    account: A,
  });
  await turn(fleet, one, "the first thing");
  const two = await fleet.spawn("claude", "Run split", fleet.repo, {
    account: A,
  });
  await turn(fleet, two, "the opening");
  const between = Date.now();
  await Bun.sleep(1000);
  await turn(fleet, two, "a turn between the moves");

  // Stored after the first session's turn: five landed moves (one re-read
  // 737k tokens cold, one compacted there) and a move that couldn't go. The
  // second's: three moves before its second turn, three after.
  const after = Date.now();
  await restart(fleet, () => {
    store(fleet, one, after, [
      moved(A, B, { same: false, tokens: 737_000 }),
      moved(B, C, { same: true, tokens: 737_000 }),
      moved(C, D, { same: false, tokens: 412_000, compact: "compacted" }),
      moved(D, B, { same: true, tokens: 90_000 }),
      moved(B, A, { same: true, tokens: 90_000 }),
      unmoved(
        B,
        "copying its conversation on the scratch machine failed",
        false
      ),
    ]);
    store(fleet, two, between, [
      moved(A, B, { same: true, tokens: 50_000 }),
      moved(B, C, { same: true, tokens: 50_000 }),
      moved(C, A, { same: true, tokens: 50_000 }),
    ]);
    store(fleet, two, after, [
      moved(A, B, { same: true, tokens: 50_000 }),
      moved(B, C, { same: true, tokens: 50_000 }),
      moved(C, A, { same: true, tokens: 50_000 }),
    ]);
  });
  await until(
    "the six stored lines read back",
    () => accountLines(fleet, one),
    (lines) => lines.length === 6,
    60_000
  );

  // Live: every page open on it while a sixth move lands by hand.
  const base = await fleet.dashboard();
  const pages: { errors: string[]; label: string; page: Page }[] = [];
  for (const { engine, view } of PAGES) {
    const label = `${engine} ${view}`;
    // biome-ignore lint/performance/noAwaitInLoops: one page at a time
    const page = await kit.page(view, { engine });
    const errors = errorsOf(page);
    await open(page, `${base}/session/${one}`, ROW);
    const before = await drawn(
      page,
      `${label}: one row of six`,
      (rows) => rows.length === 1 && rows[0]?.lines === 6
    );
    kit.check(
      `${label}: five landed moves and a couldn't-move line are one account row`,
      before.length === 1 && before[0]?.lines === 6,
      JSON.stringify(before)
    );
    await page.evaluate((glyphs) => {
      for (const glyph of document.querySelectorAll(glyphs)) {
        glyph.closest(".group\\/move")?.setAttribute("data-probe-tagged", "");
      }
    }, ROW);
    pages.push({ page, errors, label });
  }
  await moveTo(fleet, one, B);
  const landed = await accountLines(fleet, one);
  for (const { page, errors, label } of pages) {
    // biome-ignore lint/performance/noAwaitInLoops: one page at a time
    const live = await drawn(
      page,
      `${label}: one row of seven`,
      (rows) => rows.length === 1 && rows[0]?.lines === 7
    );
    kit.check(
      `${label}: live, the move landing by hand joins the run: one account row of seven, the same element, its words where the session is now`,
      landed.length === 7 &&
        live.length === 1 &&
        live[0]?.lines === 7 &&
        !!live[0].tagged &&
        live[0].words === accountRunWords(movesIn(landed), Date.now()).line,
      JSON.stringify({ live, hub: landed.at(-1)?.content })
    );
    kit.check(
      `${label}: no console error while the move landed`,
      errors.length === 0,
      JSON.stringify(errors.slice(0, 5))
    );
    await page.close();
  }

  // Stored after it: a move waiting for work in flight.
  await restart(fleet, () =>
    store(fleet, one, Date.now(), [
      unmoved(C, "waiting for work in flight to end: 1 command running", true),
    ])
  );
  const stored = await until(
    "the eight lines read back",
    () => accountLines(fleet, one),
    (lines) => lines.length === 8,
    60_000
  ).catch(() => accountLines(fleet, one));
  const kindOf = (move: AccountMove): string => {
    if (move.kind !== "unmoved") {
      return move.kind;
    }
    return move.waits ? "waiting" : "couldn't";
  };
  const kinds = movesIn(stored).map(kindOf);
  kit.check(
    "read back, the first session holds six landed moves, a couldn't-move line and a waiting move with no turn between them",
    stored.length === 8 &&
      kinds.filter((kind) => kind === "moved").length === 6 &&
      kinds.filter((kind) => kind === "couldn't").length === 1 &&
      kinds.at(-1) === "waiting",
    JSON.stringify(stored.map((line) => line.content))
  );
  const head = accountRunWords(movesIn(stored), Date.now()).line;
  const split = await accountLines(fleet, two);

  for (const { engine, view } of PAGES) {
    const label = `${engine} ${view}`;
    // biome-ignore lint/performance/noAwaitInLoops: one page at a time
    const page = await kit.page(view, { engine });
    const errors = errorsOf(page);
    await open(page, `${base}/session/${one}`, ROW);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector(ROW, { timeout: 60_000 });
    const folded = await drawn(
      page,
      `${label}: one row of eight`,
      (rows) => rows.length === 1 && rows[0]?.lines === 8
    );
    kit.check(
      `${label}: after a reload, the eight lines are one account row saying where the session is now and what cost most: ${JSON.stringify(head)}`,
      folded.length === 1 &&
        folded[0]?.lines === 8 &&
        folded[0].words === head &&
        folded[0].listed.length === 0,
      JSON.stringify(folded)
    );
    await page.locator(SHOWN_ROW).filter({ visible: true }).first().click();
    const opened = await drawn(
      page,
      `${label}: opened, the eight lines`,
      (rows) => rows[0]?.listed.length === 8
    );
    kit.check(
      `${label}: opened in place, it lists all eight lines in order, each in the hub's words, none reaching past the row`,
      opened.length === 1 &&
        (opened[0]?.spill ?? 1) <= 0.5 &&
        JSON.stringify(opened[0]?.listed) ===
          JSON.stringify(stored.map((line) => line.content)),
      JSON.stringify({
        listed: opened[0]?.listed,
        spill: opened[0]?.spill,
      })
    );
    // Its own page: a phone keeps the session it left in its stack.
    const other = await kit.page(view, { engine });
    const otherErrors = errorsOf(other);
    await open(other, `${base}/session/${two}`, ROW);
    const splitRows = await drawn(
      other,
      `${label}: two rows of three`,
      (rows) => rows.length === 2
    );
    kit.check(
      `${label}: a turn between the third and fourth move splits them: two account rows of three`,
      split.length === 6 &&
        splitRows.length === 2 &&
        splitRows.every((row) => row.lines === 3),
      JSON.stringify({
        rows: splitRows,
        lines: split.map((line) => line.content),
      })
    );
    kit.check(
      `${label}: no console error through the reload, the opening and the split`,
      errors.length === 0 && otherErrors.length === 0,
      JSON.stringify([...errors, ...otherErrors].slice(0, 5))
    );
  }
};

export default {
  name: "account-run-fold",
  run,
} satisfies Spec;
