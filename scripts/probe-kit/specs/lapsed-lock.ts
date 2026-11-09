/**
 * A device that goes quiet after saying its machine is locked never reads as
 * the person being here: only fresh input does (hub notifications.ts
 * `rollup`, rules 2 and 3). Since the person's return sends every session
 * holding news its recap (sends.ts `tellBack`), a false away→here costs
 * turns as well as a wrong presence line.
 *
 * 2026-11-05, read from the code: a lock counted only while its device still
 * beat inside its hold (`MACHINE_TTL_MS` for a machine's agent,
 * `DEVICE_TTL_MS` for a tab's Idle Detection). A machine that locks and then
 * sleeps stops beating, its lock stopped counting, and the away clock read
 * the person here from the input before the lock until the clock ran out.
 *
 * On a scratch hub, read from `GET /api/person`. The tab's Idle Detection
 * word (`machine` on its beat) stands in for the machine: both are devices
 * the rollup reads with one rule, and the scratch agent has no desktop to
 * read. The tab's quiet is set in the facts the hub keeps while it is down,
 * not waited out: its last word moves back past its hold (`DEVICE_TTL_MS`),
 * inside the away clock, and a second tab heard just now keeps that quiet
 * as it was across the restart (`restore` counts silence from the hub's
 * last moment).
 * - (a) The person's input on a tab: here.
 * - (b) The tab says its machine is locked: away.
 * - (c) The tab quiet past its hold, inside the away clock, and the
 *   hub rolls the person up again (the other tab's beat, no input): the
 *   person still reads away. (Fails on main: they read here, from the input
 *   before the lock.)
 * - (d) Fresh input on the tab: here again.
 *
 *   bun scripts/probe-kit/run.ts lapsed-lock
 */

import { fetchHub, hubRequest } from "../../../packages/core/src/hub-request";
import {
  AWAY_AFTER_DEFAULT_MS,
  DEVICE_TTL_MS,
  type MachineState,
} from "../../../packages/core/src/notifications";
import { type Reply, until } from "../../scratch-fleet";
import type { Kit, KitFleet, Spec } from "../kit";

const respond = (): Reply => ({ everyMs: 5, words: ["ok"] });

const TAB = "probe-lapsed-lock-tab";
const OTHER = "probe-lapsed-lock-other";
/** How far back the locked tab's last word moves: past its hold, by half a minute. */
const QUIET_MS = DEVICE_TTL_MS + 30_000;

interface Person {
  readonly state: string;
}

const person = async (fleet: KitFleet): Promise<string> =>
  (
    (await (
      await fetchHub(fetch, fleet.base, hubRequest("GET /api/person"))
    ).json()) as Person
  ).state;

/** A tab's beat: the person's last input `idleMs` ago, its machine as Idle Detection reads it. */
const beat = (
  fleet: KitFleet,
  idleMs: number | undefined,
  machine: MachineState | undefined,
  clientId = TAB
) =>
  fetchHub(
    fetch,
    fleet.base,
    hubRequest("POST /api/presence", {
      body: {
        clientId,
        client: "web",
        sessionId: null,
        active: true,
        showing: [],
        saidAt: Date.now(),
        ...(idleMs === undefined ? {} : { idleMs }),
        ...(machine === undefined ? {} : { machine }),
      },
    })
  );

const reads = (fleet: KitFleet, want: string) =>
  until(
    `the person ${want}`,
    () => person(fleet),
    (state) => state === want,
    30_000
  ).catch(() => `not ${want}`);

const run = async (kit: Kit): Promise<void> => {
  const fleet = await kit.fleet(respond);
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();

  await beat(fleet, 0, "active");
  const here = await reads(fleet, "here");
  kit.check("(a) the person's input on a tab: here", here === "here", here);

  await Bun.sleep(2000);
  await beat(fleet, 2000, "locked");
  const away = await reads(fleet, "away");
  kit.check(
    "(b) the tab says its machine is locked: away",
    away === "away",
    away
  );

  // The tab quiet past its hold, inside the away clock: its last word
  // moves back while the hub is down, and the other tab is heard now.
  await fleet.stop("hub");
  const now = Date.now();
  fleet.write(
    "UPDATE presence_clients SET at = at - ?, input_at = input_at - ?, locked_at = locked_at - ?, said_at = said_at - ? WHERE client_id = ?",
    QUIET_MS,
    QUIET_MS,
    QUIET_MS,
    QUIET_MS,
    TAB
  );
  fleet.write(
    "INSERT INTO presence_clients (client_id, kind, session_id, active, showing, alerts, handheld, machine_id, input_at, desk_input_at, machine, locked_at, source, said_at, at) VALUES (?, 'web', NULL, 0, '[]', 0, 0, NULL, NULL, NULL, NULL, NULL, NULL, ?, ?)",
    OTHER,
    now,
    now
  );
  fleet.launch("hub");
  await fleet.hubUp();
  // The roll the sweep would run: a beat with no input, from the other tab.
  await beat(fleet, undefined, undefined, OTHER);
  const [kept] = fleet.query<{ at: number; input_at: number | null }>(
    "SELECT at, input_at FROM presence_clients WHERE client_id = ?",
    TAB
  );
  const quietFor = kept ? Date.now() - kept.at : 0;
  const sinceInput = kept?.input_at ? Date.now() - kept.input_at : 0;
  const after = await person(fleet);
  kit.check(
    "(c) the tab quiet past its hold, inside the away clock, and the person rolled up again: they still read away",
    after === "away" &&
      quietFor > DEVICE_TTL_MS &&
      sinceInput < AWAY_AFTER_DEFAULT_MS,
    JSON.stringify({
      after,
      tabQuietForMs: quietFor,
      sinceInputMs: sinceInput,
      holdMs: DEVICE_TTL_MS,
      awayAfterMs: AWAY_AFTER_DEFAULT_MS,
    })
  );

  await beat(fleet, 0, "active");
  const back = await reads(fleet, "here");
  kit.check("(d) fresh input on the tab: here again", back === "here", back);
};

export default {
  group: "The hub and machines",
  name: "lapsed-lock",
  run,
} satisfies Spec;
