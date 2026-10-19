/**
 * The usage-accounts fleet held up for a capture by hand: the iPhone app and
 * the simulator's Safari pointed at its hub and dashboard, each screen driven
 * and captured from outside (MobileBuildMCP), the app beside the web.
 *
 * Three Claude accounts (usage-accounts.ts): the personal plan and the Team
 * seat on one email in two organizations, and a second email. Each runs one
 * session on its own account, moving at a limit switched off so the Team
 * seat's stays on it. Then:
 *
 * - the personal plan is current: 75% and 50% left;
 * - the Team seat is at its 5-hour limit, its reading three hours old, so
 *   its dial says when it last reported;
 * - the second email's reading has gone two hours with nothing refreshing it.
 *
 * Ages read from the clock, so the hold pins both every 30 s (the two hours
 * stay "2h 00m" while the captures run), and runs a turn on the personal
 * plan every 20 min so its reading stays current (one is stale an hour after).
 * The hold takes an iPhone 16 Pro simulator slot (mac-sim.ts) under its own
 * heavy run, building the checkout's simulator app first when it is missing
 * or stale. `$TMPDIR/usage-ios.json` names the hub, the dashboard, the app,
 * the simulator and each session; touching `$TMPDIR/usage-ios.stop` ends the
 * hold, deletes the simulator and stops the fleet.
 *
 *   bun scripts/probe-kit/run.ts usage-ios
 */

import { existsSync } from "node:fs";
import { rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { UsageLimitsResponse } from "../../../packages/core/src";
import { freshApp } from "../../lib/apple-app";
import { macSim } from "../../lib/mac-sim";
import { type Reply, type Seen, until } from "../../scratch-fleet";
import { type Kit, ROOT, type Spec } from "../kit";
import {
  ACCOUNTS,
  accountOf,
  type Id,
  OTHER,
  PERSONAL,
  standUp,
  TEAM,
} from "./usage-accounts";

const HOUR_MS = 3_600_000;
const STARTED = Date.now();
/** Each account's share used: the Team seat's 5-hour spent. */
const USED: Record<Id, { fiveHour: number; sevenDay: number }> = {
  [PERSONAL]: { fiveHour: 0.25, sevenDay: 0.5 },
  [TEAM]: { fiveHour: 1, sevenDay: 0.25 },
  [OTHER]: { fiveHour: 0.75, sevenDay: 0.75 },
};
/** How old each held reading is kept. */
const AGED: Partial<Record<Id, number>> = {
  [TEAM]: 3 * HOUR_MS,
  [OTHER]: 2 * HOUR_MS,
};
const PIN_EVERY_MS = 30_000;
const REFRESH_EVERY_MS = 20 * 60_000;
const scratch = process.env.TMPDIR ?? "/tmp";
const NOTE = join(scratch, "usage-ios.json");
const STOP = join(scratch, "usage-ios.stop");

const respond = (request: Seen): Reply => {
  const id = accountOf(request);
  if (!id) {
    return { everyMs: 5, words: ["ok"] };
  }
  const step = ACCOUNTS.indexOf(id) * 60_000;
  return {
    everyMs: 5,
    words: ["ok"],
    limits: {
      fiveHour: {
        utilization: USED[id].fiveHour,
        resetsAt: STARTED + 2 * HOUR_MS + step,
      },
      sevenDay: {
        utilization: USED[id].sevenDay,
        resetsAt: STARTED + 24 * HOUR_MS + step,
      },
    },
  };
};

const run = async (kit: Kit) => {
  await rm(STOP, { force: true });
  const fleet = await standUp(kit, respond);
  // At its limit the hub moves a session to an account with room (at-limit.ts
  // `decideAtLimit`, rebalance.ts): switched off, the Team seat's session
  // stays on its own account, each account keeping one.
  const routing = (
    await fleet.api<{
      routing: { provider: string; atLimit: Record<string, unknown> }[];
    }>("/api/accounts")
  ).routing.find((one) => one.provider === "anthropic");
  const off = await fetch(`${fleet.base}/api/accounts/routing/anthropic`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      ...routing,
      provider: undefined,
      atLimit: { ...routing?.atLimit, move: false, delegateWork: undefined },
    }),
  });
  kit.check(
    "moving at a limit is switched off",
    off.ok,
    `${off.status} ${await off.text()}`
  );
  const sessions = {} as Record<Id, string>;
  for (const id of ACCOUNTS) {
    // biome-ignore lint/performance/noAwaitInLoops: one session's start at a time, on its own account
    sessions[id] = await fleet.spawn("claude", `Usage ${id}`, fleet.repo, {
      account: id,
    });
    await fleet.send(sessions[id], "PROBE-USAGE say ok");
  }
  const limits = async () =>
    (await fleet.api<UsageLimitsResponse>("/api/usage/limits")).claude ?? [];
  const landed = await until(
    "each account's reading on the hub",
    limits,
    (all) =>
      ACCOUNTS.every((id) =>
        all
          .find((one) => one.accountId === id)
          ?.limits?.windows.some(
            (w) => w.kind === "session" && w.percent === USED[id].fiveHour * 100
          )
      ),
    180_000
  ).catch(() => undefined);
  kit.check(
    "each account's own reading landed on the hub",
    landed !== undefined,
    JSON.stringify(await limits())
  );
  const pin = () => {
    for (const [id, age] of Object.entries(AGED)) {
      fleet.write(
        "UPDATE account_readings SET last_seen_at = ? WHERE account_id = ?",
        Date.now() - (age ?? 0),
        id
      );
    }
  };
  pin();
  const dashboard = await fleet.dashboard();
  // The checkout's simulator app, built here under this run's own heavy run
  // when it is missing or older than the checkout (apple-app.ts).
  const { path: app, problem } = freshApp(ROOT);
  kit.check("the checkout's simulator app is built", !problem, problem ?? app);
  // The simulator in a slot of this process's own heavy run, beside its
  // fleet: one taken alone would wait on this run's slot.
  const sim = await macSim({ device: "iPhone 16 Pro" });
  try {
    await writeFile(
      NOTE,
      JSON.stringify(
        {
          hub: fleet.base,
          dashboard,
          app,
          udid: sim.udid,
          sessions,
          limits: await limits(),
        },
        null,
        2
      )
    );
    console.log(`  held: ${NOTE}`);
    let refreshed = Date.now();
    while (!existsSync(STOP)) {
      // biome-ignore lint/performance/noAwaitInLoops: the hold, one beat at a time
      await Bun.sleep(PIN_EVERY_MS);
      pin();
      if (Date.now() - refreshed >= REFRESH_EVERY_MS) {
        refreshed = Date.now();
        await fleet.send(sessions[PERSONAL], "PROBE-USAGE again");
      }
    }
  } finally {
    await sim.release();
    await rm(STOP, { force: true });
  }
};

export default {
  name: "usage-ios",
  run,
} satisfies Spec;
