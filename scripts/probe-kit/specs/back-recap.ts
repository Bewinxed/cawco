/**
 * When the person comes back from being away, each session holding news for
 * them starts a turn on its recap by itself (hub sends.ts `tellBack`): its
 * reply is the news, and nothing waits on them to ask.
 *
 * 2026-11-05: two sessions kept their news in their plans under "Since
 * 12:13" while the person was away, and the recap rode only on his next
 * message to each; he came back, saw nothing, and had to ask "?".
 *
 * On a scratch fleet (real hub, agent and sessiond; Claude Code against the
 * mock model), read from what the model was sent and the hub's records:
 * - setup: two sessions, each asleep after one turn of the person's; the
 *   person appears away; one session's
 *   plan holds away notes (`## Since HH:MM (you were away)`), the other's
 *   holds none.
 * - (a) The person comes back (a tab's input, Appear away off): the session
 *   with notes is woken and starts a turn with no message from the person;
 *   the turn is the hub's word that they are back, its presence line
 *   carrying the notes, and it ends. Its notes are seen. (Fails on main:
 *   nothing is sent until the person writes.)
 * - (b) The session with no notes is sent nothing and stays asleep.
 * - (c) The person's next message to the session with notes carries no
 *   second recap.
 * - (d) The hub restarts while the person is away, and they come back once
 *   it is up: the session's new notes are recapped once (the live return,
 *   their away stretch kept through the restart).
 * - (e) The hub stops while the person is away, and they come back before
 *   it is up (the facts it kept read here as it starts, their away stretch
 *   still open): the session's new notes are recapped once, with no message
 *   from them. (Fails on main: the start reads them here, no return is
 *   ever seen, and nothing is sent.)
 *
 *   bun scripts/probe-kit/run.ts back-recap
 */

import { dataOf } from "../../../packages/agent/src/hub-client";
import {
  awayNotesHeading,
  BACK_MESSAGE,
} from "../../../packages/core/src/injected";
import { type Reply, type Seen, until } from "../../scratch-fleet";
import { hubAt } from "../hub";
import type { Kit, KitFleet, Spec } from "../spec";

/** The line of news the session kept while the person was away. */
const NEWS = "PROBE-BACK-NEWS: the build landed on main";
/** The news kept while the person was away across each restart, (d) and (e). */
const NEWS_D = "PROBE-BACK-NEWS-D: the probe kit ran green";
const NEWS_E = "PROBE-BACK-NEWS-E: the nightly shipped";
/** The person's message after their return. */
const AFTER = "PROBE-BACK-AFTER";
/** Each session's first message, before the person goes away. */
const FIRST = "PROBE-BACK-FIRST";
/** What the recap's presence line opens its notes with (core injected.ts `whereTheyAre`). */
const NOTES_SAID = "Your plan's notes from while they were away";

const respond = (_request: Seen): Reply => ({ everyMs: 5, words: ["ok"] });

/** The session's turns the mock answered since `since` (not a side call). */
const turnsSince = (fleet: KitFleet, since: number) =>
  fleet.seen.filter((one) => one.tools && one.at >= since);

/** The hub's sends to `id` of the "back" origin. */
const backSends = (fleet: KitFleet, id: string) =>
  fleet
    .query<{ body: string }>(
      "SELECT body FROM sent_messages WHERE instance_id = ?",
      id
    )
    .filter((one) => one.body.includes('"name":"back"')).length;

const person = async (fleet: KitFleet): Promise<string> =>
  dataOf(await hubAt(fleet.base).api.person.get()).state;

const appearAway = (fleet: KitFleet, on: boolean) =>
  hubAt(fleet.base).api.person.away.post({ on });

/** A tab's beat with the person's input now. */
const input = (fleet: KitFleet) =>
  hubAt(fleet.base).api.presence.post({
    clientId: "probe-back-tab",
    client: "web",
    sessionId: null,
    active: true,
    showing: [],
    saidAt: Date.now(),
    idleMs: 0,
  });

/** The person goes away and `id`'s plan keeps `line` as its news from then. */
const awayWithNews = async (
  fleet: KitFleet,
  id: string,
  section: string,
  line: string
): Promise<string> => {
  await appearAway(fleet, true);
  const state = await until(
    "the person away",
    () => person(fleet),
    (one) => one === "away",
    30_000
  ).catch(() => "not away");
  fleet.write(
    "INSERT OR REPLACE INTO session_plans (instance_id, steps, spec, spec_at, updated_at) VALUES (?, '[]', ?, ?, ?)",
    id,
    `${awayNotesHeading(section)}\n- ${line}\n\n## Goal\nShip it.`,
    Date.now(),
    Date.now()
  );
  return state;
};

/** Stops the hub as a nightly does, runs `whileDown`, and starts it again; answers once its agent is back. */
const restartHub = async (
  fleet: KitFleet,
  whileDown: () => void = () => undefined
): Promise<void> => {
  await fleet.stop("hub");
  whileDown();
  fleet.launch("hub");
  await fleet.hubUp();
  await fleet.agentUp();
};

/** The session's turns since `since` that are the hub's word that the person is back, carrying `line`. */
const recapTurns = (fleet: KitFleet, since: number, line: string): number =>
  turnsSince(fleet, since).filter(
    (one) =>
      one.last.includes(BACK_MESSAGE) &&
      one.last.includes(NOTES_SAID) &&
      one.last.includes(line)
  ).length;

/** Waits for `id`'s recap turn carrying `line` since `since`, and for that turn to end; answers how many there were. */
const recapOf = async (
  fleet: KitFleet,
  id: string,
  since: number,
  line: string
): Promise<{ recapped: number; ended: unknown }> => {
  const recapped = await until(
    "the session with news starts its recap turn",
    () => recapTurns(fleet, since, line),
    (n) => n > 0,
    120_000
  ).catch(() => 0);
  const ended = await until(
    "its recap turn ended",
    () => fleet.instance(id)?.turn_open_at,
    (open) => open === null,
    120_000
  ).catch(() => "open");
  return { recapped, ended };
};

const asleep = async (fleet: KitFleet, id: string): Promise<string> => {
  await fleet.control(id, "sleep");
  return (
    (await until(
      "the session asleep",
      () => fleet.instance(id)?.status,
      (status) => status === "sleeping",
      60_000
    ).catch(() => fleet.instance(id)?.status)) ?? "gone"
  );
};

const run = async (kit: Kit): Promise<void> => {
  const fleet = await kit.fleet(respond);
  await fleet.up();

  const news = await fleet.spawn("claude", "Holding news");
  const quiet = await fleet.spawn("claude", "No news");
  // One turn each, so each has a conversation to sleep on and wake into.
  for (const [id, tag] of [
    [news, "news"],
    [quiet, "quiet"],
  ] as const) {
    const said = `${FIRST}-${tag}`;
    await fleet.send(id, `${said}: say ok.`);
    await until(
      "its first turn answered",
      () => fleet.seen.some((one) => one.tools && one.last.includes(said)),
      Boolean,
      120_000
    ).catch(() => false);
    await until(
      "its first turn ended",
      () => fleet.instance(id)?.turn_open_at,
      (open) => open === null,
      120_000
    ).catch(() => "open");
  }
  const sleeps = [await asleep(fleet, news), await asleep(fleet, quiet)];
  await appearAway(fleet, true);
  const away = await until(
    "the person away",
    () => person(fleet),
    (state) => state === "away",
    30_000
  ).catch(() => "not away");
  fleet.write(
    "INSERT OR REPLACE INTO session_plans (instance_id, steps, spec, spec_at, updated_at) VALUES (?, '[]', ?, ?, ?)",
    news,
    `${awayNotesHeading("12:13")}\n- ${NEWS}\n\n## Goal\nShip it.`,
    Date.now(),
    Date.now()
  );
  kit.check(
    "setup: two sessions asleep, the person away, one plan holding away notes",
    sleeps.every((one) => one === "sleeping") && away === "away",
    JSON.stringify({ sleeps, away })
  );

  // (a) The person comes back, and writes nothing.
  const backAt = Date.now();
  await input(fleet);
  await appearAway(fleet, false);
  const here = await until(
    "the person here",
    () => person(fleet),
    (state) => state === "here",
    30_000
  ).catch(() => "not here");
  const recapped = await until(
    "the session with news starts its recap turn",
    () =>
      turnsSince(fleet, backAt).filter(
        (one) =>
          one.last.includes(BACK_MESSAGE) &&
          one.last.includes(NOTES_SAID) &&
          one.last.includes(NEWS)
      ).length,
    (n) => n > 0,
    120_000
  ).catch(() => 0);
  const ended = await until(
    "its recap turn ended",
    () => fleet.instance(news)?.turn_open_at,
    (open) => open === null,
    120_000
  ).catch(() => "open");
  const seen = fleet.query<{ away_seen: string | null }>(
    "SELECT away_seen FROM session_plans WHERE instance_id = ?",
    news
  )[0]?.away_seen;
  const personSends = (id: string) =>
    fleet
      .query<{ body: string }>(
        "SELECT body FROM sent_messages WHERE instance_id = ?",
        id
      )
      .filter((one) => one.body.includes('"kind":"human"')).length;
  kit.check(
    "(a) the person back, the session holding news is woken and starts a turn by itself: the hub's word that they are back, its presence line carrying the notes; the turn ends and the notes are seen",
    here === "here" &&
      recapped > 0 &&
      ended === null &&
      personSends(news) === 1 &&
      backSends(fleet, news) === 1 &&
      (seen ?? "").includes(NEWS),
    JSON.stringify({
      here,
      recapped,
      ended,
      personSends: personSends(news),
      backSends: backSends(fleet, news),
      seen,
      status: fleet.instance(news)?.status,
    })
  );
  // Read once (a)'s turn has run: the return told both at once.
  kit.check(
    "(b) the session with no news is sent nothing and stays asleep",
    backSends(fleet, quiet) === 0 &&
      fleet.instance(quiet)?.status === "sleeping",
    JSON.stringify({
      backSends: backSends(fleet, quiet),
      status: fleet.instance(quiet)?.status,
    })
  );

  // (c) His next message: no second recap.
  const afterAt = Date.now();
  await fleet.send(news, `${AFTER}: thanks.`);
  const after = await until(
    "his next message reaches the model",
    () => turnsSince(fleet, afterAt).find((one) => one.last.includes(AFTER)),
    (one) => one !== undefined,
    120_000
  ).catch(() => undefined);
  kit.check(
    "(c) the person's next message to it carries no second recap",
    after !== undefined &&
      !after.last.includes(NOTES_SAID) &&
      !after.last.includes(NEWS),
    after ? after.last.slice(0, 600) : "no request with his message"
  );
  await until(
    "his message's turn ended",
    () => fleet.instance(news)?.turn_open_at,
    (open) => open === null,
    120_000
  ).catch(() => "open");

  // (d) A restart while he is away; he comes back once the hub is up.
  const awayD = await awayWithNews(fleet, news, "13:00", NEWS_D);
  await restartHub(fleet);
  const stillAway = await person(fleet);
  const backD = Date.now();
  await input(fleet);
  await appearAway(fleet, false);
  const d = await recapOf(fleet, news, backD, NEWS_D);
  kit.check(
    "(d) the hub restarted while the person was away, and they came back once it was up: the session's news is recapped once",
    awayD === "away" &&
      stillAway === "away" &&
      d.recapped === 1 &&
      d.ended === null &&
      backSends(fleet, news) === 2,
    JSON.stringify({
      awayD,
      stillAway,
      ...d,
      backSends: backSends(fleet, news),
    })
  );

  // (e) He comes back while the hub is down: the facts it kept read here
  // as it starts, his away stretch still open.
  const awayE = await awayWithNews(fleet, news, "14:00", NEWS_E);
  const backE = Date.now();
  await restartHub(fleet, () => {
    const now = Date.now();
    fleet.write(
      "UPDATE presence_settings SET appear_away = 0, appear_away_at = NULL"
    );
    fleet.write(
      "UPDATE presence_clients SET input_at = ?, at = ?, said_at = ? WHERE client_id = 'probe-back-tab'",
      now,
      now,
      now
    );
  });
  const e = await recapOf(fleet, news, backE, NEWS_E);
  // Two sweeps more: a return is read once.
  await Bun.sleep(25_000);
  kit.check(
    "(e) the person came back while the hub was down: as it starts, the session's news is recapped once, with no message from them",
    awayE === "away" &&
      e.recapped === 1 &&
      e.ended === null &&
      recapTurns(fleet, backE, NEWS_E) === 1 &&
      backSends(fleet, news) === 3 &&
      (await person(fleet)) === "here",
    JSON.stringify({
      awayE,
      ...e,
      turns: recapTurns(fleet, backE, NEWS_E),
      backSends: backSends(fleet, news),
      person: await person(fleet),
    })
  );
};

const spec: Spec = {
  group: "The hub and machines",
  name: "back-recap",
  run,
};

export default spec;
