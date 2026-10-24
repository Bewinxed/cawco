/**
 * Input decides whether the person is here (hub notifications.ts `rollup`):
 * a tab open, visible and focused with nobody at it is no input, the chat
 * follows the device with the newest input, the away clock is the person's
 * own setting, and the hub's restart changes nothing the person did. On a
 * scratch fleet (real hub, agent and sessiond against the mock model), with
 * real dashboard tabs, a stand-in Cawrier and a paired phone:
 *
 * - (replay) today's beats on the owner's hub, rebuilt from its journal's
 *   `[presence]` lines, through the hub's own notifications.ts in-process
 *   on a held clock: here on the orchestrator's chat with no flapping at
 *   10:52–10:57, away from 12:09:44 (the last input, 11:59:44, plus 10
 *   minutes) until his next input, the 14:55 restart changing nothing.
 * - (clock) the away clock is the person's setting: 10 minutes until set,
 *   changed from the presence menu's row and read back from the hub. The
 *   legs after run on a 1-minute clock (5 around the restart), the
 *   person's own setting, so they run in minutes.
 * - (a) two tabs on two chats, both focused: no input, and both beating,
 *   the person is away; input in one puts them on its chat, and many beats
 *   from the other never move it (no "[presence] the person" line); input
 *   in the other moves it once.
 * - (b) both tabs focused and beating with no input past the clock: away
 *   since the last input.
 * - (c) away, a session keeps its notes; input after it is one return, and
 *   only the person's next message carries the recap, with the hub's own
 *   away-since; a hand-off between carries none, and the message after it
 *   none either.
 * - (d) a hub restart in the middle: no away or back, the same chat after,
 *   the return unchanged.
 * - (e) today's TestFlight beat (five fields, no input time): coming to a
 *   chat is input there, the same beat again is none; a phone with the
 *   newest input gets the push, a desk tab with it gets the desk alert. A
 *   phone-sized page says it is handheld.
 * - (elsewhere) a blurred tab with recent input reads "elsewhere", then
 *   away once the clock passes; an opted-in machine whose desktop sees
 *   input keeps the person elsewhere past the clock, and what needs them
 *   shows on the desk tab; a lock there is away at once.
 * - (chrome idle) a Chromium tab's Idle Detection, granted (DevTools'
 *   `Browser.grantPermissions`, `Emulation.setIdleOverride`), counts as an
 *   opted-in machine's desktop does: active keeps the person here, on no
 *   chat, with the tab blurred past the clock; a lock is away at once;
 *   idle past the clock is away. In WebKit, which has none, the onboarding
 *   step and the presence menu say it is not available here and where this
 *   computer can say it instead, at 390, 680 and 1440, with no console
 *   error.
 *
 * Runs inside a workspace: it delegates nothing. About 15 minutes.
 *
 *   bun scripts/probe-kit/run.ts presence-input
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Page } from "playwright-core";
import { presenceLine } from "../../../packages/core/src/injected";
import {
  AWAY_AFTER_DEFAULT_MS,
  type PersonView,
} from "../../../packages/core/src/notifications";
import { presenceWords } from "../../../packages/core/src/words/presence";
import { presenceLogWords } from "../../../packages/core/src/words/presence-log";
import { sidebarWords } from "../../../packages/core/src/words/sidebar";
import type { DbShape, PresenceClientRow } from "../../../packages/hub/src/db";
import type { HubLifetimeShape } from "../../../packages/hub/src/lifetime";
import { createNotifications } from "../../../packages/hub/src/notifications";
import type { RegistryShape } from "../../../packages/hub/src/registry";
import { MACHINE, type Reply, type Seen, until } from "../../scratch-fleet";
import { type Kit, type KitFleet, open, type Spec, settle } from "../kit";
import { shaped } from "../words";
import { atRest, type Phone, standInPhone } from "./turn-push";

const TODO = "mcp__cawco__todo_write";
const LINE_ON = presenceLine({ kind: "on" });
const LINE_ELSEWHERE = presenceLine({ kind: "elsewhere" });
const LINE_AWAY = presenceLine({ kind: "away", since: null }).split(
  "."
)[0] as string;
const LINE_BACK = presenceLine({
  kind: "on",
  recap: { notes: "", section: "", since: "" },
}).split(";")[0] as string;
const HEADINGS = /under "(## Since [^"]+)"/g;
/** The opening of every line where the person changed. */
const TURNED = `${presenceLogWords.subject}:`;
/** The opening of the hub's first word on the person at its start. */
const AT_START = presenceLogWords.atStart("", "").split(":")[0] as string;
/** A line where the person changed to `state`, its why aside. */
const turnedTo = (state: string) =>
  presenceLogWords.turned(state, "").trimEnd();
const BACK = shaped(presenceLogWords.back);
const READ_BACK = shaped(presenceLogWords.readBack);
/** The recap's opening, back since `since`, up to the notes. */
const backSince = (since: string) =>
  presenceLine({
    kind: "on",
    recap: { notes: "\u0000", section: "", since },
  }).split("\u0000")[0] as string;
/** When he left today, as the hub said it. */
const LEFT_AT = "2026-10-24T08:59:44.833Z";
const NOTE = "- PROBE-NOTE: the build went green";
const MINUTE = 60_000;

const text = (words: string): Reply => ({ everyMs: 5, words: [words] });
const call = (name: string, input: object): Reply => ({
  everyMs: 5,
  words: [],
  tool: { name, input },
});

/** The away turn's `todo_write`, once. */
const act: {
  called: boolean;
  done: boolean;
  input: object;
  searched: boolean;
} = {
  called: false,
  done: false,
  input: {},
  searched: false,
};

/** Every session answers "ok"; the away hand-off's turn first writes its notes under the heading its line names. */
const respond = (request: Seen): Reply => {
  if (!request.tools) {
    return text("Probe title");
  }
  if (request.all.includes("PROBE-AWAY") && !act.done) {
    if (!act.called) {
      const heading =
        [...request.all.matchAll(HEADINGS)].at(-1)?.[1] ?? "## Since ?";
      act.input = { spec: `${heading}\n${NOTE}` };
      const declared = request.toolNames.find((name) =>
        [TODO, "todo_write"].includes(name)
      );
      if (declared) {
        act.called = true;
        return call(declared, act.input);
      }
      if (!act.searched && request.toolNames.includes("ToolSearch")) {
        act.searched = true;
        return call("ToolSearch", { query: `select:${TODO}`, max_results: 1 });
      }
      act.called = true;
      return text(`${TODO} is not offered`);
    }
    if (request.afterTool) {
      act.done = true;
      return text("noted");
    }
  }
  return text("ok");
};

/** In the page: the OS's notifications, granted, each one shown recorded (presence.ts's stand-in, as the person allowed them). */
const notificationsGranted = () => {
  const shown: { tag?: string; title: string }[] = [];
  function Fake(
    this: { close: () => void },
    title: string,
    options?: NotificationOptions
  ) {
    shown.push({ title, tag: options?.tag });
    this.close = () => undefined;
  }
  Object.defineProperty(Fake, "permission", { get: () => "granted" });
  Object.assign(Fake, {
    requestPermission: () => Promise.resolve("granted"),
  });
  Object.assign(window, { Notification: Fake, __shown: shown });
};

/** In the page: the person at this computer in another window, so the tab is blurred. */
const blurred = () => {
  Document.prototype.hasFocus = () => false;
};

const shownOn = (page: Page) =>
  page.evaluate(
    () => (window as unknown as { __shown?: { tag?: string }[] }).__shown ?? []
  );

const personOf = (fleet: KitFleet) => fleet.api<PersonView>("/api/person");

/** The person once `accept` holds, polled; the last read when it never does. */
const personWhen = async (
  fleet: KitFleet,
  label: string,
  accept: (person: PersonView) => boolean,
  ms: number
): Promise<PersonView> => {
  try {
    return await until(label, () => personOf(fleet), accept, ms);
  } catch {
    return await personOf(fleet);
  }
};

/** A tab's presence id. */
const presenceIdOf = async (page: Page): Promise<string> =>
  (await page.evaluate(() =>
    sessionStorage.getItem("cawco-presence-client")
  )) ?? "?";

/** A device's last word as the hub keeps it (`presence_clients`). */
const kept = (fleet: KitFleet, clientId: string) =>
  fleet.query<{
    active: number;
    at: number;
    handheld: number;
    input_at: number | null;
    session_id: string | null;
  }>(
    "SELECT active, at, handheld, input_at, session_id FROM presence_clients WHERE client_id = ?",
    clientId
  )[0];

/** The away stretch as the hub keeps it. */
const stretchOf = (fleet: KitFleet) =>
  fleet.query<{
    away_since: number | null;
    back_at: number | null;
    recapped: string;
  }>(
    "SELECT away_since, back_at, recapped FROM presence_settings WHERE id = 'person'"
  )[0];

/** The person's input on a page: a key no control takes. */
const touch = async (page: Page): Promise<number> => {
  const at = Date.now();
  await page.keyboard.press("Shift");
  return at;
};

/** The hub's lines about the person since `then`. */
const personLines = async (then: { since: () => Promise<string> }) =>
  (await then.since())
    .split("\n")
    .filter((line) => line.includes(presenceLogWords.subject));

/** A hand-off from another session: CawCo's words to it, never the person's. */
const handOff = async (fleet: KitFleet, instanceId: string, words: string) => {
  await fleet.post({
    type: "command",
    commandId: crypto.randomUUID(),
    kind: "send",
    machineId: MACHINE,
    sessionId: instanceId,
    payload: {
      instanceId,
      message: {
        type: "user",
        uuid: crypto.randomUUID(),
        message: { role: "user", content: words },
        parent_tool_use_id: null,
        origin: { kind: "peer", from: "presence-input-probe" },
      },
    },
  });
};

/** The request that opened with `words`: the turn its line was read at. */
const turnOf = (fleet: KitFleet, words: string) =>
  until(
    `the turn ${words} started`,
    () =>
      fleet.seen.find((one) => one.tools && one.last.includes(words)) ?? null,
    Boolean,
    180_000
  ).catch(() => undefined);

/** The person's away clock, set as the presence menu sets it. */
const setClock = (fleet: KitFleet, ms: number) =>
  fleet.api<PersonView>("/api/person/away-clock", { awayAfterMs: ms });

/** A tab on a session, its own clock held by Playwright so its beats can be run on. */
const tabOn = async (
  kit: Kit,
  base: string,
  session: string,
  init: (() => void)[] = []
): Promise<Page> => {
  const page = await kit.page("desk", {
    engine: "chromium",
    init: [notificationsGranted, ...init],
  });
  await page.clock.install();
  await open(
    page,
    `${base}/session/${session}`,
    `[data-session-tab="${session}"]`
  );
  await settle(page, 1000);
  return page;
};

/** One beat from a tab now: its interval run on by a beat's length. */
const beatNow = async (page: Page): Promise<void> => {
  await page.clock.fastForward(30_000);
  await Bun.sleep(400);
};

// ---------------------------------------------------------------------------
// (replay)

/** Local time on the owner's hub (+03) today, epoch ms. */
const local = (hhmmss: string): number =>
  Date.parse(`2026-10-24T${hhmmss}+03:00`);

/** What notifications.ts keeps on the hub, in memory: the presence tables and nothing else. */
const memoryDb = (): DbShape => {
  const rows = new Map<string, PresenceClientRow>();
  let stretch = {
    awaySince: null as Date | null,
    backAt: null as Date | null,
    recapped: [] as readonly string[],
  };
  return {
    presence: {
      appearAway: () => null,
      setAppearAway: () => undefined,
      counted: () => new Set<string>(),
      setCounts: () => undefined,
      clients: () => [...rows.values()],
      keepClient: (row: PresenceClientRow) => rows.set(row.clientId, row),
      dropClient: (id: string) => rows.delete(id),
      awayAfter: () => null,
      setAwayAfter: () => undefined,
      stretch: () => stretch,
      setStretch: (next: typeof stretch) => {
        stretch = next;
      },
    },
    notifications: {
      prune: () => undefined,
      clear: () => [],
      sent: () => undefined,
      sentAt: () => new Map(),
      clearedSince: () => [],
    },
    listAgents: () => [],
  } as unknown as DbShape;
};

/** One thing that happened today, at its time: a beat, an input, the hub's stop or start, a sweep. */
interface Happened {
  readonly act: () => void;
  readonly at: number;
}

/** A line the hub said, at its time on the held clock. */
interface Said {
  readonly at: number;
  readonly line: string;
}

const S1 = "23cb5219";
const S2 = "6d1f4852";
const W1 = "w1-23cb-tab";
const W2 = "w2-6d1f-client";
const LAST_INPUT = local("11:59:44") + 833;
const W2_INPUT = local("10:51:50");

/** His input on the orchestrator's tab: every 40 s until he left, and his message's at 15:22:30. */
const W1_INPUTS = [
  ...Array.from(
    { length: Math.floor((LAST_INPUT - local("10:50:00")) / 40_000) + 1 },
    (_, n) => local("10:50:00") + n * 40_000
  ),
  LAST_INPUT,
  local("15:22:30"),
];

const w1InputBy = (at: number): number =>
  Math.max(...W1_INPUTS.filter((input) => input <= at));

/** The tab blurred 12:01:00–12:02:11, as the 12:02:11 line implies. */
const w1Focused = (at: number): boolean =>
  !(at >= local("12:01:00") && at < local("12:02:11"));

/** The hub was down 14:55:00–14:55:40. */
const hubDown = (at: number): boolean =>
  at >= local("14:55:00") && at < local("14:55:40");

/** Every beat, input, stop, start and sweep of today, in time order. */
const today = (hub: {
  beat: (
    clientId: string,
    sessionId: string,
    active: boolean,
    input: number
  ) => void;
  spoke: () => void;
  start: () => void;
  sweep: () => void;
}): Happened[] => {
  const happened: Happened[] = [];
  const w1Beat = (at: number) =>
    happened.push({
      at,
      act: () => hub.beat(W1, S1, w1Focused(at), w1InputBy(at)),
    });
  for (let at = local("10:50:00"); at <= local("15:25:00"); at += 30_000) {
    if (!hubDown(at)) {
      w1Beat(at);
    }
  }
  for (let at = local("10:50:00"); at <= local("15:25:00"); at += 10_000) {
    if (!hubDown(at)) {
      happened.push({ at, act: hub.sweep });
    }
  }
  // A beat at once on each change: his last input, the blur, the refocus,
  // his message's first key.
  for (const at of [
    LAST_INPUT,
    local("12:01:00"),
    local("12:02:11"),
    local("15:22:30"),
  ]) {
    w1Beat(at);
  }
  for (let at = local("10:52:13"); at <= local("10:57:30"); at += 30_000) {
    happened.push({ at, act: () => hub.beat(W2, S2, true, W2_INPUT) });
  }
  happened.push({
    at: local("10:57:43"),
    act: () => hub.beat(W2, S2, false, W2_INPUT),
  });
  happened.push({ at: local("14:55:40"), act: hub.start });
  happened.push({ at: local("15:22:40"), act: hub.spoke });
  return happened.sort((a, b) => a.at - b.at);
};

/**
 * Today's beats through the hub's own notifications.ts, in-process on a
 * held clock, with the presence tables in memory across its restart:
 * every `[presence]` line it said, at its time.
 */
const replayToday = (): Said[] => {
  const realNow = Date.now;
  const realLog = console.log;
  let now = local("10:50:00");
  const said: Said[] = [];
  Date.now = () => now;
  console.log = (...args: unknown[]) => {
    const line = args.map(String).join(" ");
    if (line.includes(presenceLogWords.subject) || READ_BACK.test(line)) {
      said.push({ at: now, line });
    }
  };
  try {
    const store = memoryDb();
    let sweeps: (() => void)[] = [];
    const startHub = () => {
      sweeps = [];
      return createNotifications({
        db: store,
        hubMachineId: () => "obelisk",
        lifetime: {
          every: (_ms: number, sweep: () => void) => {
            sweeps.push(sweep);
          },
        } as unknown as HubLifetimeShape,
        registry: {
          broadcast: () => undefined,
          broadcastTyped: () => undefined,
          machineIds: () => [],
          address: () => undefined,
        } as unknown as RegistryShape,
      });
    };
    let hub: ReturnType<typeof createNotifications> = startHub();
    const happened = today({
      beat: (clientId, sessionId, active, input) =>
        hub.presence({
          clientId,
          client: "web",
          sessionId,
          active,
          saidAt: now,
          idleMs: Math.max(0, now - input),
        }),
      spoke: () => hub.spoke(W1, S1),
      start: () => {
        hub = startHub();
      },
      sweep: () => {
        for (const sweep of sweeps) {
          sweep();
        }
      },
    });
    for (const one of happened) {
      now = one.at;
      one.act();
    }
  } finally {
    Date.now = realNow;
    console.log = realLog;
  }
  return said;
};

/** HH:MM:SS on the owner's hub (+03). */
const hubClock = (at: number) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Istanbul",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(at);

/**
 * (replay) Today's beats, as the journal's `[presence]` lines and the hub's
 * own "away since 2026-10-24T08:59:44.833Z" say them: the orchestrator's
 * tab (23cb5219) with his input until 11:59:44.833 and focused all
 * afternoon; a second client on 6d1f4852 focused 10:52–10:57 with no input
 * of his there after 10:51:50; the tab blurred and focused again at
 * 12:02:11 with no input; the hub down 14:55:00–14:55:40; his message at
 * 15:22:30. The journal names neither client's idle time, so these input
 * times are the rebuild's: the one the hub logged (11:59:44.833) and the
 * ones the flapping implies.
 */
const replayLegs = (kit: Kit): void => {
  // Each line about the person, and the restart's reading back.
  const told = replayToday();
  kit.note(
    `(replay) every line the hub said of the person today, rebuilt (local +03):\n${told.map(({ at, line }) => `  ${hubClock(at)} ${line}`).join("\n")}`
  );
  const turned = (from: number, to: number) =>
    told.filter(
      ({ at, line }) => at >= from && at <= to && line.startsWith(TURNED)
    );
  kit.check(
    "(replay) 10:52–10:57, two clients on two chats beating in turn: no flapping, the person stays on 23cb5219 (no line between)",
    turned(local("10:51:00"), local("10:58:00")).length === 0 &&
      told.some(
        ({ at, line }) =>
          at < local("10:51:00") && line.includes(presenceLogWords.hereOn(S1))
      ),
    told.map(({ line }) => line).join(" | ")
  );
  const away = told.find(({ line }) =>
    line.includes(turnedTo(presenceLogWords.awaySince(LEFT_AT)))
  );
  kit.check(
    "(replay) away since his last input (11:59:44.833) once the 10-minute clock passed it: said at 12:09:44–12:09:55, the tab focused all along",
    away !== undefined &&
      away.at >= local("12:09:44") &&
      away.at <= local("12:09:55"),
    away ? `${hubClock(away.at)} ${away.line}` : "never away"
  );
  const quiet = turned(local("12:10:00"), local("15:22:29"));
  kit.check(
    "(replay) the 12:02:11 refocus with no input, every focused beat all afternoon, and the 14:55 restart move nothing: no line from 12:10 to 15:22",
    quiet.length === 0 &&
      told.some(
        ({ at, line }) =>
          at === local("14:55:40") &&
          line.includes(
            presenceLogWords.atStart(presenceLogWords.awaySince(LEFT_AT), "")
          )
      ),
    quiet.map(({ line }) => line).join(" | ")
  );
  const back = told.filter(
    ({ at }) => at >= local("15:22:30") && at <= local("15:22:41")
  );
  kit.check(
    "(replay) his next input (15:22:30) is the return: here, on 23cb5219, and back after away since 11:59:44",
    back.some(({ line }) =>
      line.includes(turnedTo(presenceLogWords.hereOn(S1)))
    ) && back.some(({ line }) => line.includes(presenceLogWords.back(LEFT_AT))),
    back.map(({ line }) => line).join(" | ")
  );
};

// ---------------------------------------------------------------------------
// (clock)

const clockLegs = async (kit: Kit, fleet: KitFleet, base: string) => {
  const first = await personOf(fleet);
  kit.check(
    `(clock) until the person sets it, the away clock is their pick: ${AWAY_AFTER_DEFAULT_MS / MINUTE} minutes`,
    first.awayAfterMs === AWAY_AFTER_DEFAULT_MS &&
      AWAY_AFTER_DEFAULT_MS === 10 * MINUTE,
    JSON.stringify(first)
  );
  const page = await kit.page("desk", { engine: "chromium" });
  try {
    await open(page, base, "[data-needs-caw]");
    if (!(await page.locator("[data-presence]:visible").count())) {
      await page
        .getByRole("button", { name: sidebarWords.openNavigation })
        .first()
        .click()
        .catch(() => undefined);
    }
    await page.locator("[data-presence]:visible").first().click();
    const row = page.locator('[data-slot="away-clock"]');
    await row.waitFor({ state: "visible", timeout: 10_000 });
    const before = (await row.innerText()).trim();
    await row.click();
    const five = page.locator(`[data-away-after="${5 * MINUTE}"]`);
    await five.waitFor({ state: "visible", timeout: 10_000 });
    await five.click();
    const set = await personWhen(
      fleet,
      "(clock) the hub's clock after the pick",
      (person) => person.awayAfterMs === 5 * MINUTE,
      10_000
    );
    await settle(page, 300);
    const after = (await row.innerText().catch(() => "")).trim();
    kit.check(
      `(clock) the presence menu's row reads “${presenceWords.awayAfter(10)}”; picking ${presenceWords.minutes(5)} sets the hub's clock, and the row reads “${presenceWords.awayAfter(5)}”`,
      before === presenceWords.awayAfter(10) &&
        set.awayAfterMs === 5 * MINUTE &&
        after === presenceWords.awayAfter(5),
      `before "${before}", after "${after}", hub ${set.awayAfterMs}`
    );
    await page.keyboard.press("Escape");
  } finally {
    await page.context().close();
  }
  const refused = await fetch(`${fleet.base}/api/person/away-clock`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ awayAfterMs: 1000 }),
  });
  kit.check(
    "(clock) a clock under a minute is refused",
    refused.status >= 400 && refused.status < 500,
    `answered ${refused.status}`
  );
  await setClock(fleet, MINUTE);
};

// ---------------------------------------------------------------------------
// (a) (b) (c)

const twoTabLegs = async (
  kit: Kit,
  fleet: KitFleet,
  base: string,
  s1: string,
  s2: string
): Promise<{ a: Page; b: Page }> => {
  const a = await tabOn(kit, base, s1);
  const b = await tabOn(kit, base, s2);
  const idA = await presenceIdOf(a);
  const idB = await presenceIdOf(b);
  kit.note(
    `(a) tab A ${idA.slice(0, 8)} on ${s1}, tab B ${idB.slice(0, 8)} on ${s2}`
  );

  // Both focused and beating, nobody at either: away once the clock passes.
  const quiet = await personWhen(
    fleet,
    "(a) away with two focused tabs and no input",
    (person) => person.state === "away",
    3 * MINUTE
  );
  const rowA = kept(fleet, idA);
  const rowB = kept(fleet, idB);
  kit.check(
    "(a) two tabs focused on two chats, beating, with no input in either: away (a tab open and focused is no input)",
    quiet.state === "away" &&
      rowA?.active === 1 &&
      rowB?.active === 1 &&
      rowA.input_at === null &&
      rowB.input_at === null,
    `person ${JSON.stringify(quiet)}; A ${JSON.stringify(rowA)}; B ${JSON.stringify(rowB)}`
  );

  // Input in A: on its chat, at once.
  await touch(a);
  const onA = await personWhen(
    fleet,
    "(a) on A's chat",
    (person) => person.state === "here" && person.on === s1,
    10_000
  );
  kit.check(
    "(a) input in tab A: here, on A's chat, within seconds (the first input since its load is said at once)",
    onA.state === "here" && onA.on === s1,
    JSON.stringify(onA)
  );
  const steady = await fleet.logMark("hub");
  const reads: (string | null)[] = [];
  for (let n = 0; n < 8; n += 1) {
    // biome-ignore lint/performance/noAwaitInLoops: one beat at a time, each read after it lands
    await beatNow(b);
    reads.push((await personOf(fleet)).on);
  }
  const flaps = await personLines(steady);
  kit.check(
    "(a) eight beats from tab B, focused on the other chat with no input: the person stays on A's chat after each, and the hub says nothing of them",
    reads.every((on) => on === s1) && flaps.length === 0,
    `on after each: ${JSON.stringify(reads)}; lines: ${flaps.join(" | ")}`
  );

  // Input in B: the chat moves once; A's beats never move it back.
  const moving = await fleet.logMark("hub");
  await touch(b);
  const onB = await personWhen(
    fleet,
    "(a) on B's chat",
    (person) => person.on === s2,
    10_000
  );
  const back: (string | null)[] = [];
  for (let n = 0; n < 4; n += 1) {
    // biome-ignore lint/performance/noAwaitInLoops: one beat at a time
    await beatNow(a);
    back.push((await personOf(fleet)).on);
  }
  const moved = await personLines(moving);
  kit.check(
    "(a) input in tab B moves the person to B's chat once; four beats from A after it move nothing",
    onB.on === s2 &&
      back.every((on) => on === s2) &&
      moved.length === 1 &&
      moved[0]?.includes(presenceLogWords.hereOn(s2)) === true,
    `on ${onB.on}; after A's beats ${JSON.stringify(back)}; lines: ${moved.join(" | ")}`
  );
  return { a, b };
};

const awayLeg = async (
  kit: Kit,
  fleet: KitFleet,
  a: Page,
  b: Page
): Promise<void> => {
  const idB = await presenceIdOf(b);
  const inputB = kept(fleet, idB)?.input_at ?? null;
  const gone = await personWhen(
    fleet,
    "(b) away past the clock",
    (person) => person.state === "away",
    2 * MINUTE
  );
  const now = Date.now();
  const rows = [kept(fleet, await presenceIdOf(a)), kept(fleet, idB)];
  kit.check(
    "(b) both tabs still focused and beating, no input past the 1-minute clock: away, since B's last input",
    gone.state === "away" &&
      inputB !== null &&
      gone.since === inputB &&
      rows.every((row) => row?.active === 1 && now - (row?.at ?? 0) < 45_000),
    `person ${JSON.stringify(gone)}; B's input ${inputB}; rows ${JSON.stringify(rows)}`
  );
};

const recapLegs = async (
  kit: Kit,
  fleet: KitFleet,
  a: Page,
  s1: string
): Promise<void> => {
  // Away: the hand-off's turn writes its notes under the line's heading.
  await handOff(fleet, s1, "PROBE-AWAY: run the build.");
  const awayTurn = await turnOf(fleet, "PROBE-AWAY");
  await until(
    "(c) the notes written",
    () =>
      fleet.query<{ spec: string | null }>(
        "SELECT spec FROM session_plans WHERE instance_id = ?",
        s1
      )[0]?.spec ?? null,
    (written) => Boolean(written?.includes(NOTE)),
    120_000
  ).catch(() => undefined);
  await atRest(fleet, s1);
  kit.check(
    "(c) while away, a hand-off starts its turn with the away line",
    Boolean(awayTurn?.last.includes(`${LINE_AWAY} since`)),
    awayTurn?.last.slice(-400) ?? "no turn"
  );
  const stretch = stretchOf(fleet);

  // Input after away: one return.
  const returning = await fleet.logMark("hub");
  await touch(a);
  const here = await personWhen(
    fleet,
    "(c) back on A's chat",
    (person) => person.state === "here" && person.on === s1,
    10_000
  );
  const lines = (await returning.since())
    .split("\n")
    .filter((line) => BACK.test(line));
  kit.check(
    "(c) input after away: here on A's chat, and one return said",
    here.on === s1 && lines.length === 1,
    `${JSON.stringify(here)}; ${lines.join(" | ")}`
  );

  // Not before: a hand-off between carries no recap.
  await handOff(fleet, s1, "PROBE-PEER: carry on.");
  const peer = await turnOf(fleet, "PROBE-PEER");
  await atRest(fleet, s1);
  kit.check(
    "(c) a hand-off after the return and before the person's message: on this chat, no recap",
    Boolean(peer?.last.includes(LINE_ON) && !peer.last.includes(LINE_BACK)),
    peer?.last.slice(-400) ?? "no turn"
  );

  // The person's next message: the recap, with the hub's own away-since.
  const awaySince = stretch?.away_since ?? null;
  const since =
    awaySince === null
      ? "?"
      : new Intl.DateTimeFormat("en-GB", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        }).format(awaySince);
  await fleet.send(s1, "PROBE-BACK: where are we?");
  const backTurn = await turnOf(fleet, "PROBE-BACK");
  await atRest(fleet, s1);
  kit.check(
    `(c) the person's next message carries the recap: back, away since ${since} (the hub's own word), with the plan's notes`,
    Boolean(
      backTurn?.last.includes(backSince(since)) && backTurn.last.includes(NOTE)
    ),
    backTurn?.last.slice(-700) ?? "no turn"
  );
  await fleet.send(s1, "PROBE-AGAIN: and now?");
  const again = await turnOf(fleet, "PROBE-AGAIN");
  await atRest(fleet, s1);
  kit.check(
    "(c) the message after it: on this chat, no recap again",
    Boolean(again?.last.includes(LINE_ON) && !again.last.includes(LINE_BACK)),
    again?.last.slice(-400) ?? "no turn"
  );
};

// ---------------------------------------------------------------------------
// (d)

const restartLeg = async (
  kit: Kit,
  fleet: KitFleet,
  a: Page,
  s1: string
): Promise<void> => {
  await setClock(fleet, 5 * MINUTE);
  // The probe's own sends (no tab named) are the newest input: A's key,
  // under a minute after its last, is said on A's next beat.
  await touch(a);
  const before = await personWhen(
    fleet,
    "(d) on A's chat before the restart",
    (person) => person.state === "here" && person.on === s1,
    45_000
  );
  const stretch = stretchOf(fleet);
  const mark = await fleet.logMark("hub");
  await fleet.stop("hub");
  fleet.launch("hub");
  await fleet.hubUp();
  const after = await personOf(fleet);
  await Bun.sleep(40_000);
  const later = await personOf(fleet);
  const said = await personLines(mark);
  const start = said.filter((line) => line.includes(AT_START));
  const turned = said.filter((line) => line.includes(TURNED));
  const backs = (await mark.since())
    .split("\n")
    .filter((line) => BACK.test(line));
  kit.check(
    "(d) a hub restart: the person reads back here, on the same chat, at its start and after the tabs beat again, with no away or back between and the return unchanged",
    before.on === s1 &&
      after.state === "here" &&
      after.on === s1 &&
      later.on === s1 &&
      start.length === 1 &&
      start[0]?.includes(presenceLogWords.hereOn(s1)) === true &&
      turned.length === 0 &&
      backs.length === 0 &&
      JSON.stringify(stretchOf(fleet)) === JSON.stringify(stretch),
    `before ${before.on}; at start ${JSON.stringify(after)}; 40 s on ${later.on}; lines ${said.join(" | ")}; backs ${backs.length}; stretch ${JSON.stringify(stretch)} → ${JSON.stringify(stretchOf(fleet))}`
  );
  await setClock(fleet, MINUTE);
};

// ---------------------------------------------------------------------------
// (e)

/** The beat today's TestFlight build sends: these five fields, no input time. */
const testFlight = (
  fleet: KitFleet,
  sessionId: string | null,
  active: boolean
) =>
  fleet.api("/api/presence", {
    clientId: "probe-testflight-iphone",
    client: "ios",
    sessionId,
    active,
    saidAt: Date.now(),
  });

const phoneLegs = async (
  kit: Kit,
  fleet: KitFleet,
  phone: Phone,
  base: string,
  a: Page,
  s1: string,
  s2: string,
  s3: string
): Promise<void> => {
  // Long enough that the routing, not the clock, decides where each push goes.
  await setClock(fleet, 5 * MINUTE);
  await testFlight(fleet, null, false);
  await testFlight(fleet, s2, true);
  const came = await personOf(fleet);
  const firstInput = kept(fleet, "probe-testflight-iphone")?.input_at ?? null;
  for (let n = 0; n < 5; n += 1) {
    // biome-ignore lint/performance/noAwaitInLoops: beats a second apart, as the app's are 30 s apart
    await Bun.sleep(1000);
    await testFlight(fleet, s2, true);
  }
  const steadyInput = kept(fleet, "probe-testflight-iphone")?.input_at ?? null;
  kit.check(
    "(e) a TestFlight beat (no input time) coming to a chat is input there: here, on the phone's chat; five more of the same are no input (its input time stays)",
    came.state === "here" &&
      came.on === s2 &&
      firstInput !== null &&
      steadyInput === firstInput,
    `person ${JSON.stringify(came)}; input ${firstInput} → ${steadyInput}`
  );

  // The phone has the newest input: a finished turn's push goes to it.
  const pushedBefore = await phone.turns(s3);
  const toPhone = await fleet.logMark("hub");
  await handOff(fleet, s3, "PROBE-PHONE: say ok.");
  await turnOf(fleet, "PROBE-PHONE");
  await atRest(fleet, s3);
  const phoned = await until(
    "(e) the push on the phone",
    () => phone.turns(s3),
    (count) => count > pushedBefore,
    90_000
  ).catch(() => pushedBefore);
  const phoneLines = (await toPhone.since())
    .split("\n")
    .filter((line) => line.includes(`turn-${s3}`));
  kit.check(
    "(e) with the phone's input the newest, what needs the person goes to the phone, never held at a desk",
    phoned > pushedBefore &&
      !phoneLines.some((line) =>
        line.includes(presenceLogWords.heldAtDesk(`turn-${s3}`))
      ),
    `pushes ${pushedBefore} → ${phoned}; ${phoneLines.join(" | ")}`
  );

  // Input on the desk tab: the chat and the routing follow it.
  await touch(a);
  const desk = await personWhen(
    fleet,
    "(e) on the desk tab's chat",
    (person) => person.on === s1,
    10_000
  );
  const after: (string | null)[] = [];
  for (let n = 0; n < 3; n += 1) {
    // biome-ignore lint/performance/noAwaitInLoops: one beat at a time
    await testFlight(fleet, s2, true);
    after.push((await personOf(fleet)).on);
  }
  kit.check(
    "(e) input on the desk tab moves the person there; the phone's same beats after it move nothing",
    desk.on === s1 && after.every((on) => on === s1),
    `on ${desk.on}; after the phone's beats ${JSON.stringify(after)}`
  );
  const toDesk = await fleet.logMark("hub");
  const deskPushes = await phone.turns(s3);
  await handOff(fleet, s3, "PROBE-DESK: say ok.");
  await turnOf(fleet, "PROBE-DESK");
  await atRest(fleet, s3);
  const held = await until(
    "(e) held at the desk",
    async () => (await toDesk.since()).split("\n"),
    (lines) =>
      lines.some((line) =>
        line.includes(presenceLogWords.heldAtDesk(`turn-${s3}`))
      ),
    90_000
  ).catch(() => [] as string[]);
  await Bun.sleep(3000);
  kit.check(
    "(e) with the desk tab's input the newest, the same push is held at the desk as a desk alert, not sent to the phone",
    held.some((line) =>
      line.includes(presenceLogWords.heldAtDesk(`turn-${s3}`))
    ) && (await phone.turns(s3)) === deskPushes,
    held.filter((line) => line.includes(s3)).join(" | ")
  );

  // Off the chat and back: the phone's coming to it is input again.
  await testFlight(fleet, s2, false);
  await testFlight(fleet, s2, true);
  const again = await personOf(fleet);
  kit.check(
    "(e) the app leaving its chat and coming back to it is input again: on the phone's chat",
    again.on === s2,
    JSON.stringify(again)
  );
  await testFlight(fleet, null, false);

  // A phone's browser says it is handheld.
  const handheld = await kit.page("phone", { engine: "chromium" });
  try {
    await open(handheld, `${base}/session/${s2}`, "[data-needs-caw]");
    await settle(handheld, 1500);
    const row = kept(fleet, await presenceIdOf(handheld));
    kit.check(
      "(e) a phone-sized page under a coarse pointer says it is handheld, so it is never a desk tab",
      row?.handheld === 1,
      JSON.stringify(row)
    );
  } finally {
    await handheld.context().close();
  }
  await setClock(fleet, MINUTE);
};

// ---------------------------------------------------------------------------
// (elsewhere)

/** A machine of the fleet's that the spec speaks for: registered, and its desktop's word on each heartbeat. */
const standInMachine = async (fleet: KitFleet, machineId: string) => {
  const socket = new WebSocket(`${fleet.base.replace("http", "ws")}/ws`);
  await new Promise<void>((done, fail) => {
    socket.addEventListener("open", () => done(), { once: true });
    socket.addEventListener(
      "error",
      () => fail(new Error("the machine socket did not open")),
      { once: true }
    );
  });
  socket.send(
    JSON.stringify({
      verb: "register",
      machineId,
      payload: {
        machineId,
        hostname: machineId,
        os: "linux",
        home: "/tmp",
        auth: { state: "signed-out" },
      },
    })
  );
  let state: "active" | "idle" | "locked" = "active";
  const say = () =>
    socket.send(
      JSON.stringify({
        verb: "heartbeat",
        machineId,
        payload: {
          at: Date.now(),
          instances: [],
          activity: {
            state,
            idleMs: state === "active" ? 500 : 0,
            source: "probe stand-in",
          },
        },
      })
    );
  const beating = setInterval(say, 5000);
  return {
    set: (next: typeof state) => {
      state = next;
      say();
    },
    stop: () => {
      clearInterval(beating);
      socket.close();
    },
  };
};

const elsewhereLegs = async (
  kit: Kit,
  fleet: KitFleet,
  base: string,
  s1: string,
  s3: string
): Promise<void> => {
  const c = await tabOn(kit, base, s1, [blurred]);
  try {
    const idC = await presenceIdOf(c);
    await touch(c);
    const elsewhere = await personWhen(
      fleet,
      "(elsewhere) here, on no chat",
      (person) => person.state === "here" && person.on === null,
      10_000
    );
    await handOff(fleet, s1, "PROBE-ELSE: carry on.");
    const turn = await turnOf(fleet, "PROBE-ELSE");
    await atRest(fleet, s1);
    kit.check(
      "(elsewhere) a blurred tab with the newest input: here, on no chat, and a hand-off to its chat reads “at their desk but not on this chat”",
      elsewhere.state === "here" &&
        elsewhere.on === null &&
        kept(fleet, idC)?.active === 0 &&
        Boolean(turn?.last.includes(LINE_ELSEWHERE)),
      `${JSON.stringify(elsewhere)}; ${turn?.last.slice(-300) ?? "no turn"}`
    );
    const left = await personWhen(
      fleet,
      "(elsewhere) away past the clock",
      (person) => person.state === "away",
      2 * MINUTE
    );
    kit.check(
      "(elsewhere) the blurred tab's input past the 1-minute clock: away, since that input",
      left.state === "away" && left.since === kept(fleet, idC)?.input_at,
      JSON.stringify(left)
    );

    // An opted-in machine whose desktop sees input keeps them here, elsewhere.
    const desk = "probe-desk-two";
    const machine = await standInMachine(fleet, desk);
    try {
      await Bun.sleep(1500);
      await fleet.api(`/api/person/devices/${desk}`, { counts: true });
      await touch(c);
      const tabInput = Date.now();
      await Bun.sleep(MINUTE + 15_000);
      const kept1 = await personOf(fleet);
      kit.check(
        "(elsewhere) an opted-in machine reporting input keeps the person here, on no chat, past the clock while the tab stays blurred",
        kept1.state === "here" &&
          kept1.on === null &&
          Date.now() - tabInput > MINUTE,
        JSON.stringify(kept1)
      );
      const then = await fleet.logMark("hub");
      await handOff(fleet, s3, "PROBE-ELSE-ALERT: say ok.");
      await turnOf(fleet, "PROBE-ELSE-ALERT");
      await atRest(fleet, s3);
      const held = await until(
        "(elsewhere) the desk alert",
        async () => (await then.since()).split("\n"),
        (lines) =>
          lines.some((line) =>
            line.includes(presenceLogWords.heldAtDesk(`turn-${s3}`))
          ),
        90_000
      ).catch(() => [] as string[]);
      await Bun.sleep(3000);
      const shown = await shownOn(c);
      kit.check(
        "(elsewhere) at the desk but not on the CawCo tab, what needs the person shows on the tab as a desktop notification",
        shown.some((one) => one.tag === `turn-${s3}`),
        `${JSON.stringify(shown)}; ${held.filter((line) => line.includes(s3)).join(" | ")}`
      );
      const lockedAt = Date.now();
      machine.set("locked");
      const locked = await personWhen(
        fleet,
        "(elsewhere) away at the lock",
        (person) => person.state === "away",
        3000
      );
      kit.check(
        "(elsewhere) that machine locks: away at once, since the lock",
        locked.state === "away" &&
          locked.since !== null &&
          locked.since >= lockedAt - 1000 &&
          Date.now() - lockedAt < 3500,
        JSON.stringify(locked)
      );
    } finally {
      machine.stop();
      await fleet.api(`/api/person/devices/${desk}`, { counts: false });
    }
  } finally {
    await c.context().close();
  }
};

// ---------------------------------------------------------------------------
// (chrome idle)

/** The page's browser on a computer no agent reads: an address no machine of the fleet holds, through a proxy's word. */
const ELSEWHERE = { "x-forwarded-for": "10.99.0.7" };

/** Idle Detection as the person left it, and the desktop's state as the browser reads it, through DevTools. */
const idleOf = async (page: Page, base: string) => {
  const cdp = await page.context().newCDPSession(page);
  const { targetInfo } = await cdp.send("Target.getTargetInfo");
  await cdp.send("Browser.grantPermissions", {
    origin: new URL(base).origin,
    permissions: ["idleDetection"],
    browserContextId: targetInfo.browserContextId,
  });
  return {
    say: (isUserActive: boolean, isScreenUnlocked: boolean) =>
      cdp.send("Emulation.setIdleOverride", {
        isUserActive,
        isScreenUnlocked,
      }),
  };
};

/**
 * (chrome idle) A Chromium tab's Idle Detection, granted, counts by the one
 * rule an opted-in machine's desktop does: the user active keeps the
 * person here, on no chat, with the tab blurred and no input in it past the
 * clock; a lock is away at once; idle past the clock is away.
 */
const chromeIdleLegs = async (
  kit: Kit,
  fleet: KitFleet,
  base: string,
  s1: string
): Promise<void> => {
  const page = await kit.page("desk", {
    engine: "chromium",
    init: [notificationsGranted, blurred],
  });
  try {
    await page.context().setExtraHTTPHeaders(ELSEWHERE);
    const idle = await idleOf(page, base);
    await idle.say(true, true);
    await open(page, `${base}/session/${s1}`, `[data-session-tab="${s1}"]`);
    await settle(page, 1500);
    const id = await presenceIdOf(page);
    const started = Date.now();
    await Bun.sleep(MINUTE + 15_000);
    const kept1 = await personOf(fleet);
    const [row] = fleet.query<{
      desk_input_at: number | null;
      input_at: number | null;
      machine: string | null;
    }>(
      "SELECT desk_input_at, input_at, machine FROM presence_clients WHERE client_id = ?",
      id
    );
    kit.check(
      "(chrome idle) a blurred Chromium tab, Idle Detection granted and the user active, no input in the tab: here, on no chat, past the 1-minute clock",
      kept1.state === "here" &&
        kept1.on === null &&
        Date.now() - started > MINUTE &&
        row?.input_at === null &&
        row.desk_input_at !== null &&
        row.machine === "active",
      `${JSON.stringify(kept1)}; row ${JSON.stringify(row)}`
    );
    const lockedAt = Date.now();
    await idle.say(true, false);
    const locked = await personWhen(
      fleet,
      "(chrome idle) away at the lock",
      (person) => person.state === "away",
      5000
    );
    kit.check(
      "(chrome idle) the screen locks: away at once, since the lock",
      locked.state === "away" &&
        locked.since !== null &&
        locked.since >= lockedAt - 1000 &&
        Date.now() - lockedAt < 6000,
      JSON.stringify(locked)
    );
    await idle.say(true, true);
    const back = await personWhen(
      fleet,
      "(chrome idle) here again, unlocked and active",
      (person) => person.state === "here",
      10_000
    );
    const idleAt = Date.now();
    await idle.say(false, true);
    const gone = await personWhen(
      fleet,
      "(chrome idle) away once idle",
      (person) => person.state === "away",
      10_000
    );
    kit.check(
      "(chrome idle) unlocked and active again: here; then idle, which Idle Detection says once its threshold (the away clock) has passed: away, since a clock before it said so",
      back.state === "here" &&
        gone.state === "away" &&
        gone.since !== null &&
        Math.abs(gone.since - (idleAt - MINUTE)) < 5000,
      `back ${JSON.stringify(back)}; idle ${JSON.stringify(gone)}`
    );
  } finally {
    await page.context().close();
  }
};

/** Caw's panel opened, and the desk row's words; "" when it never shows. */
const deskRowOf = async (page: Page, base: string): Promise<string> => {
  await open(page, base, "[data-needs-caw]");
  await page.locator("[data-needs-caw]").first().click();
  await page.waitForSelector(
    ':is([data-caw-pop], [data-glass-card-frame~="caw-pop"])[data-shown]',
    { timeout: 30_000 }
  );
  await settle(page, 400);
  const row = page.locator('[data-slot="row"][data-kind="desk"]');
  return await row
    .waitFor({ state: "visible", timeout: 15_000 })
    .then(() => row.innerText())
    .catch(() => "");
};

/** The desk row's box against the screen: inside it, nothing sideways, its words whole (its want line is never clamped). */
const deskBox = (page: Page) =>
  page.evaluate(() => {
    const row = document.querySelector<HTMLElement>(
      '[data-slot="row"][data-kind="desk"]'
    );
    if (!row) {
      return null;
    }
    const box = row.getBoundingClientRect();
    const scroller = document.scrollingElement;
    return {
      left: box.left,
      right: box.right,
      viewport: innerWidth,
      sideways: scroller ? scroller.scrollWidth - scroller.clientWidth : 0,
      rowSideways: row.scrollWidth - row.clientWidth,
      cut: (() => {
        const want = row.querySelector<HTMLElement>('[data-slot="want"]');
        return (
          !want ||
          want.scrollHeight > want.clientHeight + 1 ||
          want.scrollWidth > want.clientWidth + 1
        );
      })(),
    };
  });

/**
 * (chrome idle) WebKit has no Idle Detection: the onboarding step says so,
 * points to this computer's CawCo agent switch, asks nothing it can't, and
 * the presence menu says "not available here"; no console error; the row
 * whole at 390, 680 and 1440.
 */
const webkitLegs = async (kit: Kit, base: string): Promise<void> => {
  for (const [name, view] of [
    ["390", "phone"],
    ["680", "narrowDesk"],
    ["1440", "desk"],
  ] as const) {
    // biome-ignore lint/performance/noAwaitInLoops: one page at a time
    const page = await kit.page(view, {
      engine: "webkit",
      init: [notificationsGranted],
    });
    const errors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") {
        errors.push(message.text());
      }
    });
    page.on("pageerror", (error) => errors.push(error.message));
    try {
      await page.context().setExtraHTTPHeaders(ELSEWHERE);
      const words = await deskRowOf(page, base);
      const box = await deskBox(page);
      kit.check(
        `(chrome idle) WebKit ${name}: the onboarding step says plainly this browser can't tell CawCo, and points to this computer's CawCo agent switch; nothing to allow; the row inside the screen, nothing sideways or cut`,
        words.includes(presenceWords.unavailable(null, false)) &&
          !words.includes(presenceWords.allow) &&
          box !== null &&
          box.left >= 0 &&
          box.right <= box.viewport + 0.5 &&
          box.sideways <= 0 &&
          box.rowSideways <= 0 &&
          !box.cut,
        `row "${words}"; box ${JSON.stringify(box)}`
      );
      if (view === "desk") {
        await page.keyboard.press("Escape");
        await page.locator("[data-presence]:visible").first().click();
        const item = page.locator('[data-slot="at-computer"]');
        await item.waitFor({ state: "visible", timeout: 10_000 });
        const state = await item.getAttribute("data-desk");
        const said = (await item.innerText()).trim();
        const instead = await page
          .locator('[data-slot="at-computer-instead"]')
          .innerText()
          .catch(() => "");
        kit.check(
          "(chrome idle) WebKit: the presence menu shows this browser's report as not available here, and where this computer can say it instead",
          state === "unavailable" &&
            said.includes(presenceWords.atComputerState("unavailable")) &&
            instead.includes(presenceWords.unavailable(null, false)),
          `state ${state}; "${said}"; "${instead}"`
        );
        await page.keyboard.press("Escape");
      }
      kit.check(
        `(chrome idle) WebKit ${name}: no console error`,
        errors.length === 0,
        errors.join(" | ")
      );
    } finally {
      await page.context().close();
    }
  }
};

const run = async (kit: Kit) => {
  replayLegs(kit);
  const fleet = await kit.fleet(respond);
  const phone = standInPhone(fleet);
  try {
    fleet.launch("sessiond");
    await fleet.sessiondUp();
    fleet.launch("hub");
    await fleet.hubUp();
    await phone.pair();
    fleet.fileAccount();
    fleet.launch("agent");
    await fleet.agentUp();
    await fleet.accountSignedIn();
    const cwd = join(fleet.sandbox, "work");
    await mkdir(cwd, { recursive: true });
    await writeFile(join(cwd, "README.md"), "presence input probe\n");
    const sessions: string[] = [];
    for (const name of ["One", "Two", "Three"]) {
      // biome-ignore lint/performance/noAwaitInLoops: one session at a time, each up before the next
      const id = await fleet.spawn("claude", `Presence ${name}`, cwd);
      await handOff(fleet, id, `PROBE-START-${name}: say ok.`);
      await turnOf(fleet, `PROBE-START-${name}`);
      await atRest(fleet, id);
      sessions.push(id);
    }
    const [s1, s2, s3] = sessions as [string, string, string];
    const base = await fleet.dashboard();
    await clockLegs(kit, fleet, base);
    const { a, b } = await twoTabLegs(kit, fleet, base, s1, s2);
    await awayLeg(kit, fleet, a, b);
    await recapLegs(kit, fleet, a, s1);
    await restartLeg(kit, fleet, a, s1);
    await phoneLegs(kit, fleet, phone, base, a, s1, s2, s3);
    await b.context().close();
    await a.context().close();
    await elsewhereLegs(kit, fleet, base, s1, s3);
    await chromeIdleLegs(kit, fleet, base, s1);
    await webkitLegs(kit, base);
  } finally {
    await phone.stop();
  }
};

const spec: Spec = {
  name: "presence-input",
  run,
};

export default spec;
