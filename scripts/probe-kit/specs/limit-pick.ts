/**
 * A session a person started, stopped at its account's limit, is never left
 * there quietly while another account can take it (hub at-limit.ts,
 * admission.ts, server.ts `moveByHand`; dashboard switch.svelte.ts). On a
 * scratch fleet (real hub, agent and sessiond; the real Claude Code CLI
 * against the mock model) with two Claude accounts in two organizations,
 * Probe (A) and Probe B, every model request saying which one it ran on.
 * B's 5-hour window reads 72%, priced at $2.56 a percent from its own
 * history: room, above the old fixed 50% admission ceiling that called such
 * an account full (2026-10-22 10:16, "No other account has room for it"
 * beside marketing@ at 72%).
 *
 * - move: A refuses the session's first turn. The hub moves it to B by
 *   itself within {@link MOVE_WITHIN_MS}, its turn carried on there, and
 *   never says no other account has room.
 * - full: B is spent until 2 minutes on, A refuses until 4 minutes on, and
 *   the session's cache is cold (the mock writes none): the wait for A
 *   outlives its cache, so it waits for B, the account with room soonest.
 *   Its row and transcript line name B and when; at B's reset it runs on B.
 * - pick: moving at the limit is switched off, and the session holds a
 *   background command when A refuses it. Its row, its head (tab and card)
 *   and its transcript line show the stop as an error, in the failure ink,
 *   with the way out (pick another account). Picked from its card's
 *   account chip, B takes it at once: the chip never goes back to A, no
 *   line waits for a turn, the command is ended by the move and the session
 *   is told so on B, where it carries on; the error goes.
 *
 *   bun scripts/probe-kit/run.ts limit-pick
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Page } from "playwright-core";
import { CLAUDE_JSON_NAME } from "../../../packages/core/src/claude-dirs";
import {
  ACCOUNT,
  MACHINE,
  type Reply,
  type Seen,
  until,
} from "../../scratch-fleet";
import { type Kit, type KitFleet, open, type Spec } from "../kit";

const A = ACCOUNT;
const B = "acct-limit-pick-b";
const TOKEN: Record<string, string> = {
  [A]: "sk-ant-oat01-fake-scratch-fleet",
  [B]: "sk-ant-oat01-fake-scratch-fleet-pick-b",
};
const NAME = { [A]: "Probe", [B]: "Probe B" } as const;
const HOUR = 3_600_000;
const MINUTE = 60_000;
/** B's 5-hour window as read, and the dollars a percent of it costs. */
const B_USED_PCT = 72;
const B_USD_PER_PCT = 2.56;
/** A session moved off its limit runs on B within this of A's refusal. */
const MOVE_WITHIN_MS = 30_000;

const LEGS = ["move", "full", "pick"] as const;
type Leg = (typeof LEGS)[number];
/** Only `leg`'s session's words carry this. */
const markOf = (leg: Leg) => `PROBE-LIMIT-${leg}`;
/** The pick leg's first answer, which a later request carrying it has. */
const MEMORY = "PROBE-PICK-MEMORY";
/** What the hub tells a session whose move ended its background work (server.ts `endedByMoveWords`). */
const ENDED = "You were moved to another account.";

/** Until when A refuses each leg's session, and B the full leg's. */
const limited: Record<Leg, number> = { move: 0, full: 0, pick: 0 };
let bFullUntil = 0;
/** When an account refused each leg's session first. */
const refusedAt: Partial<Record<Leg, number>> = {};
let pickWorked = false;

const text = (words: string): Reply => ({ everyMs: 5, words: [words] });
const onAccount = (request: Seen, id: string): boolean =>
  request.auth.endsWith(TOKEN[id] as string);
const accountOf = (request: Seen): string | undefined =>
  [B, A].find((id) => onAccount(request, id));

const refuse = (leg: Leg, resetsAt: number): Reply => {
  refusedAt[leg] ??= Date.now();
  return { everyMs: 5, words: [], refuse: { resetsAt } };
};

const respond = (request: Seen): Reply => {
  if (!request.tools) {
    return text("Probe title");
  }
  const leg = LEGS.find((one) => request.all.includes(markOf(one)));
  if (!leg) {
    return text("ok");
  }
  const now = Date.now();
  if (onAccount(request, A) && limited[leg] > now) {
    return refuse(leg, limited[leg]);
  }
  if (leg === "full" && onAccount(request, B) && bFullUntil > now) {
    return refuse(leg, bFullUntil);
  }
  // The pick leg's first turn leaves a command running in the background,
  // which no resume on another account brings back.
  if (leg === "pick" && !pickWorked) {
    if (!request.afterTool) {
      return {
        everyMs: 5,
        words: [],
        tool: {
          name: "Bash",
          input: {
            command: "sleep 600",
            description: "A long wait in the background",
            run_in_background: true,
          },
        },
      };
    }
    pickWorked = true;
    return text(`Working on it. ${MEMORY}`);
  }
  return text("Carrying on.");
};

/** Account B's Claude dir in `home`: signed in with its token, in another organization. */
const furnishB = async (home: string) => {
  const dir = join(home, ".cawco", "accounts", B, "claude");
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, ".credentials.json"),
    JSON.stringify({
      claudeAiOauth: {
        accessToken: TOKEN[B],
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
        emailAddress: "probe-pick-b@scratch-fleet.test",
        organizationName: "Other Organization",
        accountUuid: "00000000-0000-4000-8000-0000000000c1",
        organizationUuid: "00000000-0000-4000-8000-0000000000c2",
      },
    })
  );
};

/** B's 5-hour window: `percent` used, resetting at `resetsAt`. */
const bWindow = (fleet: KitFleet, percent: number, resetsAt: number) =>
  fleet.write(
    "INSERT OR REPLACE INTO account_windows (account_id, kind, scope_label, \"group\", is_active, percent, severity, resets_at) VALUES (?, 'session', '', 'session', 1, ?, ?, ?)",
    B,
    percent,
    percent >= 100 ? "critical" : "normal",
    new Date(resetsAt).toISOString()
  );

/**
 * B's room measured as the hub measures a signed-in account's (forecast.ts
 * `usdPerPercent`): read at {@link B_USED_PCT}%, its history moving 0% → 72%
 * across $184.32 of its turns, so a percent costs {@link B_USD_PER_PCT}.
 */
const measureB = (fleet: KitFleet): void => {
  const now = Date.now();
  const resetsAt = now + 4 * HOUR;
  bWindow(fleet, B_USED_PCT, resetsAt);
  for (const [percent, at] of [
    [0, now - 2 * HOUR],
    [B_USED_PCT, now - HOUR],
  ] as const) {
    fleet.write(
      "INSERT INTO usage_limit_history (account_id, kind, scope_label, percent, severity, resets_at, fetched_at) VALUES (?, 'session', NULL, ?, 'normal', ?, ?)",
      B,
      percent,
      new Date(resetsAt).toISOString(),
      at
    );
  }
  fleet.write(
    "INSERT INTO turn_usage (instance_id, result_id, model, account_id, input_tokens, cache_read_tokens, cache_write_tokens, cache_write_1h_tokens, output_tokens, cost_usd, keep_alive, at) VALUES ('b-history', 'b-history', 'claude-probe', ?, 0, 0, 0, 0, 0, ?, 0, ?)",
    B,
    B_USED_PCT * B_USD_PER_PCT,
    now - 1.5 * HOUR
  );
};

/** At the limit, a session moves to an account with room (`move`), or waits (moving off). */
const route = async (fleet: KitFleet, move: boolean): Promise<void> => {
  const placed = { strategy: "pinned", pinnedAccountId: A };
  const put = await fetch(`${fleet.base}/api/accounts/routing/anthropic`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      yours: placed,
      delegates: placed,
      atLimit: { move, waitMinutes: 0, moveWholeUnderK: 200 },
    }),
  });
  if (!put.ok) {
    throw new Error(`routing: ${put.status} ${await put.text()}`);
  }
};

const standUp = async (kit: Kit): Promise<KitFleet> => {
  const fleet = await kit.fleet(respond);
  await furnishB(fleet.home);
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.write(
    "INSERT OR IGNORE INTO accounts (id, provider, kind, label, hue, \"order\", never_backup, created_at) VALUES (?, 'anthropic', 'subscription', ?, 'green', 1, 0, ?)",
    B,
    NAME[B],
    Date.now()
  );
  fleet.launch("agent");
  await fleet.agentUp();
  await fleet.accountSignedIn();
  await until(
    "account B signed in",
    () =>
      fleet.query<{ state: string }>(
        "SELECT state FROM account_signins WHERE account_id = ?",
        B
      )[0],
    (row) => row?.state === "signed-in",
    120_000
  );
  for (const id of [A, B]) {
    fleet.write(
      "INSERT OR REPLACE INTO account_readings (account_id, subscription, overage, last_seen_at) VALUES (?, 'max', NULL, ?)",
      id,
      Date.now()
    );
  }
  measureB(fleet);
  await route(fleet, true);
  return fleet;
};

/** The account the hub's row names for `id`. */
const rowAccount = (fleet: KitFleet, id: string) =>
  fleet.query<{ account_id: string | null }>(
    "SELECT account_id FROM instances WHERE id = ?",
    id
  )[0]?.account_id ?? null;

/** What reached the model from `leg`'s session after `since`. */
const seenOf = (fleet: KitFleet, leg: Leg, since: number) =>
  fleet.seen.filter(
    (one) => one.at > since && one.tools && one.all.includes(markOf(leg))
  );

/** The board's row for `id`, as every dashboard is handed it. */
const boardRow = async (fleet: KitFleet, id: string) =>
  (
    await fleet.api<
      {
        accountId?: string | null;
        id: string;
        owedMove?: { accountId: string; waits: string };
        stalled?: { until?: number; words: string };
      }[]
    >("/api/instances")
  ).find((one) => one.id === id);

/** The account lines in `id`'s transcript, newest last. */
const accountLines = async (fleet: KitFleet, id: string) =>
  (
    await fleet.api<{
      blocks: {
        content: string;
        metadata?: { accountMove?: { kind: string; why?: string } };
        type: string;
      }[];
    }>(`/api/instances/${id}/transcript?limit=400`)
  ).blocks.filter((one) => one.type === "system.account_move");

/** A moment as the hub's words say it (core accounts.ts `clockWords`). */
const clockOf = (at: number): string =>
  new Date(at).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

const moveLeg = async (kit: Kit, fleet: KitFleet): Promise<void> => {
  const id = await fleet.spawn("claude", "Limit move", fleet.repo, {
    account: A,
  });
  limited.move = Date.now() + 90_000;
  await fleet.send(id, `${markOf("move")}: go on`);
  const refused = await until(
    "move: A refuses its first turn",
    () => refusedAt.move,
    Boolean,
    120_000
  ).catch(() => undefined);
  const onB = await until(
    "move: it runs on B",
    () => seenOf(fleet, "move", refused ?? 0).find((one) => onAccount(one, B)),
    Boolean,
    MOVE_WITHIN_MS + 60_000
  ).catch(() => undefined);
  const lines = await accountLines(fleet, id);
  const log = (await fleet.logs("hub"))
    .split("\n")
    .filter((line) => line.includes("Limit move"));
  kit.check(
    `move: refused on A, it moves to B (read at ${B_USED_PCT}%) by itself within ${MOVE_WITHIN_MS / 1000} s, and nothing says no other account has room`,
    !!refused &&
      !!onB &&
      onB.at - refused <= MOVE_WITHIN_MS &&
      rowAccount(fleet, id) === B &&
      lines.some((one) => one.metadata?.accountMove?.kind === "moved") &&
      !log.some((line) => line.includes("No other account has room")),
    `${onB && refused ? `first request on B ${onB.at - refused} ms after A's refusal` : "nothing on B"}; account ${rowAccount(fleet, id)}; lines ${JSON.stringify(lines.map((one) => one.content))}; log ${JSON.stringify(log.filter((line) => line.includes("[at-limit]")).slice(-4))}`
  );
};

const fullLeg = async (kit: Kit, fleet: KitFleet): Promise<void> => {
  const id = await fleet.spawn("claude", "Limit full", fleet.repo, {
    account: A,
  });
  const now = Date.now();
  bFullUntil = now + 2 * MINUTE;
  limited.full = now + 4 * MINUTE;
  bWindow(fleet, 100, bFullUntil);
  await fleet.send(id, `${markOf("full")}: go on`);
  const row = await until(
    "full: its row says it is stopped and continues on B",
    () => boardRow(fleet, id),
    (one) => !!one?.stalled?.words.includes(`continues on ${NAME[B]}`),
    120_000
  ).catch(() => boardRow(fleet, id));
  const line = (await accountLines(fleet, id)).at(-1);
  kit.check(
    "full: with no account free and its cache cold, its row and transcript line name B, the account with room soonest, and when",
    !!row?.stalled?.words.includes(
      `continues on ${NAME[B]} at ${clockOf(bFullUntil)}`
    ) &&
      Math.abs((row.stalled.until ?? 0) - bFullUntil) <= 2000 &&
      !!line?.content.includes(`Waiting for ${NAME[B]} to reset`),
    `row ${JSON.stringify(row?.stalled ?? null)}; line ${JSON.stringify(line?.content ?? null)}; B resets at ${clockOf(bFullUntil)}, A at ${clockOf(limited.full)}`
  );
  const onB = await until(
    "full: it runs on B past B's reset",
    () => seenOf(fleet, "full", bFullUntil).find((one) => onAccount(one, B)),
    Boolean,
    Math.max(0, bFullUntil - Date.now()) + 120_000
  ).catch(() => undefined);
  kit.check(
    "full: at B's reset, before A's, it runs on B",
    !!onB && onB.at < limited.full && rowAccount(fleet, id) === B,
    `${onB ? `first request on B ${onB.at - bFullUntil} ms after B's reset` : "nothing on B"}; account ${rowAccount(fleet, id)}`
  );
};

const CARD = "[data-session-details-popover]";

/** Opens session `id`'s page and its card, from a hover on its tab. */
const openCard = async (page: Page, base: string, id: string) => {
  await open(page, `${base}/session/${id}`, `[data-session-tab="${id}"]`);
  await page
    .locator(`[data-session-tab="${id}"]`)
    .filter({ visible: true })
    .first()
    .hover();
  await page.waitForSelector(`${CARD} [data-slot="settings"]`, {
    timeout: 15_000,
  });
};

/** What the page says of the stop: its row, its tab and card glyphs, its card's line, its transcript line, each with its ink. */
const stopShown = (page: Page, id: string) =>
  page.evaluate(
    ({ session, card }) => {
      const fail = document.createElement("span");
      fail.className = "text-status-fail-ink";
      document.body.append(fail);
      const failInk = getComputedStyle(fail).color;
      fail.remove();
      const read = (el: Element | null | undefined) =>
        el
          ? {
              text: el.textContent?.replace(/\s+/g, " ").trim() ?? "",
              failInk: getComputedStyle(el).color === failInk,
            }
          : null;
      const glyph = (el: Element | null | undefined) =>
        el
          ? {
              label: el.getAttribute("aria-label"),
              tone: el.getAttribute("data-session-status-tone"),
            }
          : null;
      const words = document.querySelector('[data-slot="stop"][role="alert"]');
      // The rail's row is one line: its title in the failure ink, the whole
      // sentence on the row (its title, for the pointer), its mark failed.
      const row = document.querySelector<HTMLElement>(
        `[data-session-row="${session}"] [data-session-row-row]`
      );
      const name = row?.querySelector('[data-slot="title"]');
      return {
        row:
          row?.title && name
            ? { text: row.title, failInk: read(name)?.failInk ?? false }
            : {
                text: "",
                failInk: false,
                rows: [
                  ...document.querySelectorAll<HTMLElement>(
                    "[data-session-row]"
                  ),
                ].map((one) => one.dataset.sessionRow),
              },
        tab: glyph(
          document.querySelector(
            `[data-session-tab="${session}"] [data-slot="session-status"]`
          )
        ),
        head: glyph(
          document.querySelector(`${card} [data-slot="session-status"]`)
        ),
        card: read(document.querySelector(`${card} [data-slot="failure"]`)),
        transcript: read(words),
        line: read(words?.closest(".group\\/move")?.querySelector("button")),
        chip:
          document
            .querySelector(
              `${card} [data-slot="settings"] [data-account-chip] [data-slot="chip-label"]`
            )
            ?.textContent?.trim() ?? null,
      };
    },
    { session: id, card: CARD }
  );

/** Session `id`'s row in the rail, once the rail has drawn it, as {@link stopShown} reads it. */
const railRowOf = async (page: Page, base: string, id: string) => {
  await open(
    page,
    `${base}/session/${id}`,
    `[data-session-row="${id}"]`,
    120_000
  ).catch(() => undefined);
  return (await stopShown(page, id)).row;
};

const pickLeg = async (kit: Kit, fleet: KitFleet): Promise<void> => {
  await route(fleet, false);
  // In a project, as the owner's own sessions are: the rail lists a
  // session under its project.
  const project = await fleet.api<{ id: string }>("/api/projects", {
    name: "Limits",
    machineId: MACHINE,
    cwd: fleet.repo,
    caw: false,
  });
  const id = await fleet.spawn("claude", "Limit pick", fleet.repo, {
    account: A,
    projectId: project.id,
  });
  await fleet.send(id, `${markOf("pick")}: start the long wait`);
  await until(
    "pick: its first turn answered, the command left running",
    () => (pickWorked && fleet.instance(id)?.turn_open_at === null ? 1 : 0),
    Boolean,
    120_000
  );
  limited.pick = Date.now() + 20 * MINUTE;
  await fleet.send(id, `${markOf("pick")}: and the next thing`);
  const held = await until(
    "pick: its row says it is stopped",
    () => boardRow(fleet, id),
    (one) => !!one?.stalled,
    120_000
  ).catch(() => boardRow(fleet, id));
  kit.check(
    "pick: refused on A with moving off, its row says it is stopped at A's limit",
    !!held?.stalled?.words.startsWith(`Stopped at ${NAME[A]}’s limit`),
    JSON.stringify(held?.stalled ?? null)
  );
  const base = await fleet.dashboard();
  const page = await kit.page("desk");
  const railRow = () => railRowOf(page, base, id);
  const row = await railRow();
  await openCard(page, base, id);
  const way = "Pick another account to move it now.";
  const shown = await until(
    "pick: the page shows the stop as an error",
    () => stopShown(page, id),
    (one) => !!one.transcript && !!one.card,
    30_000
  ).catch(() => stopShown(page, id));
  kit.check(
    "pick: its row, its head (tab and card) and its transcript line show the stop as an error in the failure ink, with the way out",
    row.text.endsWith(way) &&
      row.failInk &&
      shown.tab?.tone === "failed" &&
      shown.tab.label === "Stopped at its limit" &&
      shown.head?.tone === "failed" &&
      !!shown.card?.text.endsWith(way) &&
      shown.card.failInk &&
      !!shown.transcript?.text.endsWith(way) &&
      shown.transcript.failInk &&
      !!shown.line?.failInk,
    JSON.stringify({ ...shown, row })
  );
  // The pick, from the card's account chip; the chip is read every 100 ms
  // from then until the hub's row names B.
  const pickedAt = Date.now();
  await page
    .locator(`${CARD} [data-slot="settings"] [data-account-chip][data-tool]`)
    .first()
    .click();
  await page
    .locator(`[data-account-option="${B}"]`)
    .filter({ visible: true })
    .first()
    .click({ timeout: 10_000 });
  // Sampled for 5 s from the pick, past the move landing, so a chip that
  // went back to A after it would be seen; the card is held open by its tab.
  const chips: string[] = [];
  const owed: string[] = [];
  while (Date.now() - pickedAt < 5000) {
    // biome-ignore lint/performance/noAwaitInLoops: one sample of the chip at a time
    const now = await stopShown(page, id);
    if (now.chip) {
      chips.push(now.chip);
    } else {
      await page
        .locator(`[data-session-tab="${id}"]`)
        .filter({ visible: true })
        .first()
        .hover();
    }
    const waits = (await boardRow(fleet, id))?.owedMove?.waits;
    if (waits) {
      owed.push(waits);
    }
    await Bun.sleep(100);
  }
  const onB = await until(
    "pick: it runs on B",
    () => seenOf(fleet, "pick", pickedAt).find((one) => onAccount(one, B)),
    Boolean,
    60_000
  ).catch(() => undefined);
  kit.check(
    "pick: picked from its card, it moves to B at once, though its background command still ran, and the chip never goes back to A",
    !!onB &&
      onB.at - pickedAt <= MOVE_WITHIN_MS &&
      rowAccount(fleet, id) === B &&
      chips.length > 0 &&
      chips.every((one) => one === NAME[B]) &&
      !owed.includes("turn"),
    `${onB ? `first request on B ${onB.at - pickedAt} ms after the pick` : "nothing on B"}; account ${rowAccount(fleet, id)}; chip samples ${JSON.stringify([...new Set(chips)])} of ${chips.length}; owed waits seen ${JSON.stringify([...new Set(owed)])}`
  );
  const told = await until(
    "pick: told on B what the move ended",
    () =>
      seenOf(fleet, "pick", pickedAt).find(
        (one) => onAccount(one, B) && one.all.includes(ENDED)
      ),
    Boolean,
    60_000
  ).catch(() => undefined);
  kit.check(
    "pick: on B it reads that the move ended its background command, its earlier turns with it",
    !!told && told.body.includes(MEMORY),
    told
      ? `told ${told.at - pickedAt} ms after the pick`
      : `B's requests: ${JSON.stringify(seenOf(fleet, "pick", pickedAt).map((one) => [accountOf(one), one.last.slice(0, 120)]))}`
  );
  const after = await until(
    "pick: the error goes",
    async () => ({
      row: await boardRow(fleet, id),
      page: await stopShown(page, id),
    }),
    (one) => !(one.row?.stalled || one.page.transcript || one.page.row?.text),
    30_000
  ).catch(async () => ({
    row: await boardRow(fleet, id),
    page: await stopShown(page, id),
  }));
  const rowAfter = await railRow();
  kit.check(
    "pick: once on B, its row, head and transcript no longer show the stop",
    !(
      after.row?.stalled ||
      after.page.transcript ||
      rowAfter.text ||
      rowAfter.failInk
    ) && after.page.tab?.tone !== "failed",
    JSON.stringify({
      stalled: after.row?.stalled ?? null,
      page: after.page,
      row: rowAfter,
    })
  );
};

const run = async (kit: Kit) => {
  const fleet = await standUp(kit);
  await moveLeg(kit, fleet);
  await fullLeg(kit, fleet);
  // A free again before the pick leg's session is placed on it, so nothing
  // moves it before its own refusal.
  await Bun.sleep(Math.max(0, limited.full + 5000 - Date.now()));
  await pickLeg(kit, fleet);
};

export default {
  name: "limit-pick",
  run,
} satisfies Spec;
