/**
 * The hub knows whether the person is here, on which chat, or away (hub
 * notifications.ts `rollup`), and everything that hears it does what the
 * owner picked. On a scratch fleet (real hub, agent and sessiond against
 * the mock model) with a stand-in Cawrier and one paired phone:
 *
 * - (rollup) one device after another, through `POST /api/presence` and
 *   read back from `GET /api/person`: the 10-minute clock (idle 9 min is
 *   here, 11 min is away since then), a lock overrides (a tab whose chat is
 *   in front, its machine locked, is away at once), any active device wins
 *   (the phone in front beats the lock), Appear away comes first.
 * - (line) the presence line reaches each session at the start of its turn
 *   on Claude Code, OpenCode and pi alike, in its three forms: here
 *   elsewhere (a hand-off while the person is on another chat), on this
 *   chat (the person's own words), away (a hand-off while Appear away is
 *   on: agents go quiet). The send's record, the person's bubble, holds
 *   none of it.
 * - (recap) away, each session writes its notes into its plan through
 *   `todo_write`, under the heading the line names; the person's next
 *   message carries those notes from the plan for the recap.
 * - (machine) the agent reads its desktop from a headless KWin of the
 *   run's own (ext-idle-notify-v1): the hub hears it in use, then idle; the
 *   presence menu's opt-in turns it on.
 * - (onboarding) Chromium: Needs you's row for this browser, its notice,
 *   Allow granting Idle Detection and notifications, its tick; the tab's
 *   Idle Detection reaching the hub as the machine's word, locked included.
 *   WebKit: the notifications-only row, where it has notifications.
 * - (boxes) the presence dot and its menu at 390, 680 and 1440, Chromium
 *   and WebKit: the dot on the avatar's corner, the menu inside the screen,
 *   Appear away from the menu reaching the hub.
 * - (hold) with the person at a desk whose tab can show it, a finished
 *   turn's push is held and shown on that tab as a desktop notification;
 *   Appear away sends it to the phone. One held more than 10 minutes
 *   before the person's last input stays on the board; one newer goes.
 *
 * Runs inside a workspace: it delegates nothing. Its last leg waits out the
 * 10-minute hold, so the run takes about 20 minutes.
 *
 *   bun scripts/probe-kit/run.ts presence
 */
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  AWAY_AFTER_MS,
  HELD_RECENT_MS,
  type PersonView,
} from "../../../packages/core/src/notifications";
import { presenceWords } from "../../../packages/core/src/words/presence";
import {
  type Harness,
  MACHINE,
  type Reply,
  type Seen,
  until,
} from "../../scratch-fleet";
import {
  type Engine,
  type Kit,
  type KitFleet,
  open,
  type Spec,
  settle,
  type View,
} from "../kit";
import { atRest, type Phone, standInPhone } from "./turn-push";

const HARNESSES: Harness[] = ["claude", "opencode", "pi"];
const TODO = "mcp__cawco__todo_write";
const CODE_MODE = "execute";
const LINE_ON =
  "[CawCo presence] The person is on this chat now: talk to them normally.";
const LINE_ELSEWHERE =
  "[CawCo presence] The person is at their desk but not on this chat.";
const LINE_AWAY = "[CawCo presence] The person is away";
const LINE_BACK = "[CawCo presence] The person is back on this chat";
/** The notes heading the away line names, as the session reads it. */
const HEADING = /under "(## Since [^"]+)"/;
const HEADINGS = /under "(## Since [^"]+)"/g;

const tag = (what: string, harness: Harness) => `PROBE-${what}-${harness}`;
const note = (harness: Harness) =>
  `- ${tag("NOTE", harness)}: the build went green`;

/** Each harness's away turn: its todo_write, once. */
interface Act {
  called: boolean;
  done: boolean;
  input: object;
  searched: boolean;
}
const acts = new Map<Harness, Act>();
/** Each harness's decision page, a step of its plan waiting on it. */
const pages = new Map<Harness, string>();
const CARD = "colour";

const text = (words: string): Reply => ({ everyMs: 5, words: [words] });
const call = (name: string, input: object): Reply => ({
  everyMs: 5,
  words: [],
  tool: { name, input },
});

/** `todo_write` as the harness offers it (plan-changes.ts `todoCall`). */
const todoCall = (request: Seen, act: Act): Reply => {
  const declared = request.toolNames.find((name) =>
    [TODO, "todo_write", "cawco_todo_write"].includes(name)
  );
  if (declared) {
    act.called = true;
    return call(declared, act.input);
  }
  if (request.toolNames.includes(CODE_MODE)) {
    act.called = true;
    return call(CODE_MODE, {
      code: `return await tools.cawco.todo_write(${JSON.stringify(act.input)});`,
    });
  }
  if (!act.searched && request.toolNames.includes("ToolSearch")) {
    act.searched = true;
    return call("ToolSearch", { query: `select:${TODO}`, max_results: 1 });
  }
  if (!act.searched && request.toolNames.includes("tool_search")) {
    act.searched = true;
    return call("tool_search", { query: "cawco todo_write" });
  }
  act.called = true;
  return text(`${TODO} is not offered`);
};

/**
 * Every session answers "ok"; an away hand-off's turn first writes the
 * notes its line asks for, under the heading the line names.
 */
const respond = (request: Seen): Reply => {
  if (!request.tools) {
    return text("Probe title");
  }
  // The conversation, not its last message: after a tool search the last
  // message is the search's answer.
  const away = HARNESSES.find(
    (harness) =>
      request.all.includes(tag("AWAY", harness)) && !acts.get(harness)?.done
  );
  if (away) {
    let act = acts.get(away);
    if (!act) {
      const heading =
        [...request.all.matchAll(HEADINGS)].at(-1)?.[1] ?? "## Since ?";
      act = {
        called: false,
        done: false,
        searched: false,
        input: {
          spec: `${heading}\n${note(away)}`,
          steps: [
            {
              id: "w1",
              content: "Pick the colour",
              status: "pending",
              waitsOn: `${pages.get(away)}#${CARD}`,
            },
          ],
        },
      };
      acts.set(away, act);
    }
    if (!act.called) {
      return todoCall(request, act);
    }
    if (request.afterTool) {
      act.done = true;
      return text("noted");
    }
  }
  return text("ok");
};

/** The person as the hub holds them. */
const personOf = (fleet: KitFleet) => fleet.api<PersonView>("/api/person");

/** One device's beat, as a tab or the app sends it. */
const beat = (
  fleet: KitFleet,
  clientId: string,
  fields: Partial<{
    active: boolean;
    alerts: boolean;
    client: "web" | "ios";
    idleMs: number;
    machine: "active" | "idle" | "locked" | "asleep";
    sessionId: string | null;
  }>
) =>
  fleet.api("/api/presence", {
    clientId,
    client: fields.client ?? "web",
    sessionId: fields.sessionId ?? null,
    active: fields.active ?? false,
    saidAt: Date.now(),
    ...(fields.alerts === undefined ? {} : { alerts: fields.alerts }),
    ...(fields.idleMs === undefined ? {} : { idleMs: fields.idleMs }),
    ...(fields.machine === undefined ? {} : { machine: fields.machine }),
  });

/** A hand-off from another session: CawCo's words to it, not the person's. */
const handOff = async (
  fleet: KitFleet,
  instanceId: string,
  words: string
): Promise<void> => {
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
        origin: { kind: "peer", from: "presence-probe" },
      },
    },
  });
};

/** The request that opened with `words`: the turn its line was read at. */
const turnOf = (fleet: KitFleet, words: string, harness: Harness) =>
  until(
    `${harness}: the turn ${words} started`,
    () =>
      fleet.seen.find((one) => one.tools && one.last.includes(words)) ?? null,
    Boolean,
    180_000
  ).catch(() => undefined);

const run = async (kit: Kit) => {
  const fleet = await kit.fleet(respond);
  const phone = standInPhone(fleet);
  // Short, for the socket's path: a Unix socket's is at most 107 bytes.
  const xdg = await mkdtemp(join(tmpdir(), "kwin-"));
  // The agent's desktop: a headless KWin of this run's own, its socket by
  // path, so the agent reads it and never the desktop it runs on.
  const kwin = Bun.which("kwin_wayland")
    ? Bun.spawn(
        [
          "kwin_wayland",
          "--virtual",
          "--socket",
          "wayland-presence",
          "--no-lockscreen",
          "--no-global-shortcuts",
          "--no-kactivities",
        ],
        {
          env: {
            ...process.env,
            XDG_RUNTIME_DIR: xdg,
            QT_QPA_PLATFORM: "offscreen",
          },
          stdout: "ignore",
          stderr: Bun.file(join(fleet.sandbox, "kwin.log")),
        }
      )
    : undefined;
  try {
    if (kwin) {
      await until(
        "the headless KWin's socket",
        () => Bun.file(join(xdg, "wayland-presence.lock")).exists(),
        Boolean,
        30_000
      );
      fleet.env.WAYLAND_DISPLAY = join(xdg, "wayland-presence");
      fleet.env.XDG_SESSION_TYPE = "wayland";
    }
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
    await writeFile(join(cwd, "README.md"), "presence probe\n");

    await rollupLegs(kit, fleet);
    await lineLegs(kit, fleet, cwd);
    await onboardingLegs(kit, fleet);
    await boxLegs(kit, fleet);
    await machineLeg(kit, fleet, Boolean(kwin));
    await holdLegs(kit, fleet, phone, cwd);
    kit.note(`every push the phone took: ${phone.ids().join(", ")}`);
  } finally {
    await phone.stop();
    kwin?.kill();
    await rm(xdg, { recursive: true, force: true });
  }
};

/** (rollup) Each rule with its case, devices beating straight to the hub. */
const rollupLegs = async (kit: Kit, fleet: KitFleet): Promise<void> => {
  // The clock first, while no device has said anything else.
  await beat(fleet, "probe-clock", { idleMs: 9 * 60_000, machine: "idle" });
  const nine = await personOf(fleet);
  kit.check(
    "(rollup) the 10-min clock: no input for 9 minutes is still here",
    nine.state === "here",
    JSON.stringify(nine)
  );
  const elevenAgo = Date.now() - 11 * 60_000;
  await beat(fleet, "probe-clock", { idleMs: 11 * 60_000, machine: "idle" });
  const eleven = await personOf(fleet);
  kit.check(
    `(rollup) the 10-min clock: no input for 11 minutes is away, since the last input (${AWAY_AFTER_MS / 60_000} min clock)`,
    eleven.state === "away" &&
      eleven.since !== null &&
      Math.abs(eleven.since - elevenAgo) < 5000,
    JSON.stringify(eleven)
  );

  await beat(fleet, "probe-tab", {
    active: true,
    sessionId: "probe-chat",
    machine: "active",
    idleMs: 0,
  });
  const reading = await personOf(fleet);
  kit.check(
    "(rollup) a tab with its chat in front and its machine in use: here, on that chat",
    reading.state === "here" && reading.on === "probe-chat",
    JSON.stringify(reading)
  );
  const lockedAt = Date.now();
  await beat(fleet, "probe-tab", {
    active: true,
    sessionId: "probe-chat",
    machine: "locked",
    idleMs: 0,
  });
  const locked = await personOf(fleet);
  kit.check(
    "(rollup) lock overrides: the same tab, its chat still in front, its machine locked: away at once, since the lock",
    locked.state === "away" &&
      locked.since !== null &&
      locked.since >= lockedAt - 1000,
    JSON.stringify(locked)
  );

  await beat(fleet, "probe-phone", {
    client: "ios",
    active: true,
    sessionId: "probe-phone-chat",
  });
  const phone = await personOf(fleet);
  kit.check(
    "(rollup) any active device wins: the phone's chat in front beats the desk's lock",
    phone.state === "here" && phone.on === "probe-phone-chat",
    JSON.stringify(phone)
  );

  await fleet.api("/api/person/away", { on: true });
  const manual = await personOf(fleet);
  kit.check(
    "(rollup) Appear away comes first: away while the phone's chat is in front",
    manual.state === "away" && manual.manual,
    JSON.stringify(manual)
  );
  await fleet.api("/api/person/away", { on: false });
  const back = await personOf(fleet);
  kit.check(
    "(rollup) Appear away off: here again",
    back.state === "here" && !back.manual,
    JSON.stringify(back)
  );
  // The phone leaves its chat; its input still counts toward the clock.
  await beat(fleet, "probe-phone", { client: "ios", active: false });
};

/** (line) and (recap) on each harness. */
const lineLegs = async (
  kit: Kit,
  fleet: KitFleet,
  cwd: string
): Promise<void> => {
  const ids = new Map<Harness, string>();
  for (const harness of HARNESSES) {
    // biome-ignore lint/performance/noAwaitInLoops: one session at a time, each up before the next
    const id = await fleet.spawn(harness, `Presence ${harness}`, cwd);
    ids.set(harness, id);
    await fleet.send(id, `${tag("START", harness)}: say ok.`);
    await turnOf(fleet, tag("START", harness), harness);
    await atRest(fleet, id);
  }

  // Each session's decision page, which a step of its plan will wait on.
  for (const harness of HARNESSES) {
    const id = ids.get(harness) as string;
    // biome-ignore lint/performance/noAwaitInLoops: one page at a time
    const made = await fetch(`${fleet.base}/api/instances/${id}/artifacts`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        kind: "page",
        name: `colour-${harness}`,
        does: "pick",
        ask: "Pick the colour",
        html: `<main><section data-cawco-choice="${CARD}"><h2>Colour</h2><button data-option="a">Teal</button><button data-option="b">Amber</button></section></main>`,
      }),
    });
    const page = (await made.json().catch(() => ({}))) as { id?: string };
    pages.set(harness, page.id ?? "none");
  }

  // Here, on another chat: a hand-off reads "elsewhere".
  await beat(fleet, "probe-phone", {
    client: "ios",
    active: true,
    sessionId: "probe-phone-chat",
  });
  for (const harness of HARNESSES) {
    const id = ids.get(harness) as string;
    // biome-ignore lint/performance/noAwaitInLoops: each turn read before the next
    await handOff(fleet, id, `${tag("ELSE", harness)}: carry on.`);
    const seen = await turnOf(fleet, tag("ELSE", harness), harness);
    kit.check(
      `(line) ${harness}: a hand-off while the person is on another chat starts its turn with "here, elsewhere"`,
      Boolean(seen?.last.includes(LINE_ELSEWHERE)),
      seen?.last.slice(-400) ?? "no turn"
    );
    await atRest(fleet, id);
  }
  await beat(fleet, "probe-phone", { client: "ios", active: false });

  // The person's own words: "on this chat".
  for (const harness of HARNESSES) {
    const id = ids.get(harness) as string;
    // biome-ignore lint/performance/noAwaitInLoops: each turn read before the next
    await fleet.send(id, `${tag("ON", harness)}: how is it going?`);
    const seen = await turnOf(fleet, tag("ON", harness), harness);
    kit.check(
      `(line) ${harness}: the person's message starts its turn with "on this chat"`,
      Boolean(seen?.last.includes(LINE_ON)),
      seen?.last.slice(-400) ?? "no turn"
    );
    await atRest(fleet, id);
  }

  // Appear away: a hand-off reads "away", and the session writes its notes.
  await fleet.api("/api/person/away", { on: true });
  for (const harness of HARNESSES) {
    const id = ids.get(harness) as string;
    // biome-ignore lint/performance/noAwaitInLoops: each turn read before the next
    await handOff(fleet, id, `${tag("AWAY", harness)}: run the build.`);
    const seen = await turnOf(fleet, tag("AWAY", harness), harness);
    kit.check(
      `(line) ${harness}: Appear away on, a hand-off starts its turn with "away" and the notes' heading (agents go quiet)`,
      Boolean(
        seen?.last.includes(LINE_AWAY) &&
        seen.last.includes("no narration") &&
        HEADING.test(seen.last)
      ),
      seen?.last.slice(-500) ?? "no turn"
    );
    await until(
      `${harness}: its notes written`,
      () =>
        fleet.query<{ spec: string | null }>(
          "SELECT spec FROM session_plans WHERE instance_id = ?",
          id
        )[0]?.spec ?? null,
      (written) => Boolean(written?.includes(tag("NOTE", harness))),
      180_000
    ).catch(() => undefined);
    await atRest(fleet, id);
  }
  await fleet.api("/api/person/away", { on: false });

  // Back: the person's next message carries the notes from the plan.
  for (const harness of HARNESSES) {
    const id = ids.get(harness) as string;
    const [plan] = fleet.query<{ spec: string | null }>(
      "SELECT spec FROM session_plans WHERE instance_id = ?",
      id
    );
    // biome-ignore lint/performance/noAwaitInLoops: each turn read before the next
    const uuid = await fleet.send(id, `${tag("BACK", harness)}: where are we?`);
    const seen = await turnOf(fleet, tag("BACK", harness), harness);
    kit.check(
      `(recap) ${harness}: the person's next message carries the plan's notes since they left`,
      Boolean(
        seen?.last.includes(LINE_BACK) &&
        seen.last.includes(tag("NOTE", harness)) &&
        plan?.spec?.includes(tag("NOTE", harness))
      ),
      `plan: ${JSON.stringify(plan?.spec)}; turn: ${seen?.last.slice(-900) ?? "no turn"}`
    );
    const chip = `[colour-${harness}](cawco:artifact/${pages.get(harness)})`;
    kit.check(
      `(recap) ${harness}: the step waiting on its page is named by the page's chip, read from the plan`,
      Boolean(
        seen?.last.includes(`- step w1 (Pick the colour) waits on ${chip}`)
      ),
      seen?.last.slice(-900) ?? "no turn"
    );
    const [record] = fleet.query<{ body: string }>(
      "SELECT body FROM sent_messages WHERE uuid = ?",
      uuid
    );
    kit.check(
      `(line) ${harness}: the person's bubble is their words alone (the send's record holds no presence line)`,
      Boolean(record && !record.body.includes("[CawCo presence]")),
      record?.body.slice(0, 300) ?? "no record"
    );
    await atRest(fleet, id);
  }
};

/**
 * In the page: the OS's notifications, which a headless Chromium keeps
 * denied whatever is granted (measured: `Notification.permission` reads
 * "denied" after `grantPermissions` and a reload). The stand-in records
 * every notification the page shows, and answers its permission as the
 * person would: what `__notifyAnswer` says (an init script before it sets
 * it, as a script is sent by its source, never its closure), until asked,
 * then yes.
 */
const notificationStandIn = () => {
  const shown: { body?: string; tag?: string; title: string }[] = [];
  const page = window as unknown as {
    __notifyAnswer?: NotificationPermission;
  };
  let answer: NotificationPermission = page.__notifyAnswer ?? "default";
  function Fake(
    this: { close: () => void },
    title: string,
    options?: NotificationOptions
  ) {
    shown.push({ title, body: options?.body, tag: options?.tag });
    this.close = () => undefined;
  }
  Object.defineProperty(Fake, "permission", { get: () => answer });
  Object.assign(Fake, {
    requestPermission: () => {
      answer = "granted";
      return Promise.resolve(answer);
    },
  });
  Object.assign(window, { Notification: Fake, __shown: shown });
};
/** The person allowed notifications before: the stand-in answers granted. */
const notificationsGranted = () => {
  Object.assign(window, { __notifyAnswer: "granted" });
};

/** In the page: the person at this computer in another app, as a headless page can't be. */
const elsewhereOnTheDesk = () => {
  Document.prototype.hasFocus = () => false;
};

/** The row this browser's onboarding stands in, in Caw's panel. */
const DESK_ROW = '[data-slot="row"][data-kind="desk"]';

/** Caw's panel opened from his head in the bar. */
const openNeeds = async (
  page: import("playwright-core").Page,
  base: string
) => {
  await open(page, base, "[data-needs-caw]");
  await page.locator("[data-needs-caw]").first().click();
  await page.waitForSelector(
    ':is([data-caw-pop], [data-glass-card-frame~="caw-pop"])[data-shown]',
    { timeout: 30_000 }
  );
  await settle(page, 400);
};

/** (onboarding) Chromium's step and its Idle Detection; WebKit's notifications-only row. */
const onboardingLegs = async (kit: Kit, fleet: KitFleet): Promise<void> => {
  const base = await fleet.dashboard();
  const page = await kit.page("desk", {
    engine: "chromium",
    init: [notificationStandIn],
  });
  await openNeeds(page, base);
  const row = page.locator(DESK_ROW);
  await row
    .waitFor({ state: "visible", timeout: 20_000 })
    .catch(() => undefined);
  const asked = await row.innerText().catch(() => "");
  kit.check(
    "(onboarding) Chromium: Needs you shows this browser's step, its notice and Skip and Allow",
    asked.includes(presenceWords.title(true)) &&
      asked.includes(presenceWords.lead(true)) &&
      asked.includes(presenceWords.meta) &&
      (await row.getByRole("button", { name: "Allow" }).count()) === 1 &&
      (await row.getByRole("button", { name: "Skip" }).count()) === 1,
    asked
  );
  // The person's yes to Idle Detection's prompt, as the browser takes it:
  // granted to this page's own context (a grant with no context id goes to
  // the default one). Notifications' yes is the stand-in's.
  const { origin } = new URL(base);
  const cdp = await page.context().newCDPSession(page);
  const { targetInfo } = await cdp.send("Target.getTargetInfo");
  await cdp.send("Browser.grantPermissions", {
    origin,
    permissions: ["idleDetection"],
    browserContextId: targetInfo.browserContextId,
  });
  await cdp.send("Emulation.setIdleOverride", {
    isUserActive: true,
    isScreenUnlocked: true,
  });
  const then = await fleet.logMark("hub");
  await row.getByRole("button", { name: "Allow" }).click();
  const ticked = await until(
    "(onboarding) the row's tick",
    async () => {
      try {
        return await row.innerText();
      } catch {
        return "";
      }
    },
    (words) => words.includes(presenceWords.done(true)),
    15_000
  ).catch(() => "");
  kit.check(
    "(onboarding) Chromium: Allow grants both, and the row ticks",
    ticked.includes(presenceWords.done(true)),
    ticked
  );
  const left = await until(
    "(onboarding) the row leaves",
    () => row.count(),
    (count) => count === 0,
    15_000
  ).catch(() => -1);
  kit.check(
    "(onboarding) Chromium: once ticked, the row leaves Needs you",
    left === 0,
    `${left} row(s)`
  );
  const client = await page.evaluate(() =>
    sessionStorage.getItem("cawco-presence-client")
  );
  const short = client?.slice(0, 8) ?? "?";
  const active = await until(
    "(onboarding) the tab's machine word",
    async () => (await then.since()).split("\n"),
    (lines) =>
      lines.some(
        (line) =>
          line.includes(`web ${short}`) && line.includes("machine active")
      ),
    20_000
  ).catch(() => [] as string[]);
  kit.check(
    "(onboarding) Chromium: the tab's Idle Detection reaches the hub as its machine's word: active",
    active.some(
      (line) => line.includes(`web ${short}`) && line.includes("machine active")
    ),
    active.filter((line) => line.includes("[presence]")).join(" | ")
  );
  await cdp.send("Emulation.setIdleOverride", {
    isUserActive: true,
    isScreenUnlocked: false,
  });
  const lockedLines = await until(
    "(onboarding) the tab's lock",
    async () => (await then.since()).split("\n"),
    (lines) =>
      lines.some(
        (line) =>
          line.includes(`web ${short}`) && line.includes("machine locked")
      ),
    20_000
  ).catch(() => [] as string[]);
  kit.check(
    "(onboarding) Chromium: the screen locked, the tab says its machine is locked",
    lockedLines.some(
      (line) => line.includes(`web ${short}`) && line.includes("machine locked")
    ),
    lockedLines.filter((line) => line.includes("[presence]")).join(" | ")
  );
  await page.context().close();

  const safari = await kit.page("desk", { engine: "webkit" });
  await openNeeds(safari, base);
  const notifies = await safari.evaluate(
    () =>
      typeof Notification !== "undefined" &&
      Notification.permission === "default"
  );
  const safariRow = safari.locator(DESK_ROW);
  const shown = await safariRow
    .waitFor({ state: "visible", timeout: 10_000 })
    .then(() => safariRow.innerText())
    .catch(() => "");
  kit.check(
    notifies
      ? "(onboarding) WebKit: no Idle Detection, so the row offers desktop notifications alone"
      : "(onboarding) WebKit: no Idle Detection and no notifications, so no row",
    notifies
      ? shown.includes(presenceWords.title(false)) &&
          shown.includes(presenceWords.lead(false))
      : shown === "",
    shown || "no row"
  );
  await safari.context().close();
};

/** One view's reading of the dot and, opened, its menu. */
interface Boxes {
  dot: { bottom: number; height: number; right: number; width: number };
  img: { bottom: number; right: number };
  label: string;
  menu?: {
    bottom: number;
    left: number;
    right: number;
    sideways: number;
    top: number;
  };
  trigger: { height: number; width: number };
  viewport: { height: number; width: number };
}

const readBoxes = (page: import("playwright-core").Page): Promise<Boxes> =>
  page.evaluate(() => {
    const trigger = [
      ...document.querySelectorAll<HTMLElement>("[data-presence]"),
    ].find((one) => one.getBoundingClientRect().width > 0) as HTMLElement;
    const box = (el: Element) => el.getBoundingClientRect();
    const dot = box(
      trigger.querySelector('[data-slot="presence-dot"]') as Element
    );
    const img = box(trigger.querySelector("img") as Element);
    const menu = document.querySelector<HTMLElement>(
      '[data-slot="dropdown-menu-content"]'
    );
    const m = menu ? box(menu) : undefined;
    return {
      label: trigger.getAttribute("aria-label") ?? "",
      trigger: { width: box(trigger).width, height: box(trigger).height },
      dot: {
        width: dot.width,
        height: dot.height,
        right: dot.right,
        bottom: dot.bottom,
      },
      img: { right: img.right, bottom: img.bottom },
      viewport: { width: innerWidth, height: innerHeight },
      ...(m && menu
        ? {
            menu: {
              left: m.left,
              right: m.right,
              top: m.top,
              bottom: m.bottom,
              sideways: menu.scrollWidth - menu.clientWidth,
            },
          }
        : {}),
    };
  });

const VIEWS: { name: string; view: View }[] = [
  { name: "390", view: "phone" },
  { name: "680", view: "narrowDesk" },
  { name: "1440", view: "desk" },
];

/** (boxes) The dot and its menu at each width, in Chromium and WebKit. */
const boxLegs = async (kit: Kit, fleet: KitFleet): Promise<void> => {
  const base = await fleet.dashboard();
  for (const engine of ["chromium", "webkit"] as Engine[]) {
    for (const { name, view } of VIEWS) {
      // biome-ignore lint/performance/noAwaitInLoops: one page at a time
      const page = await kit.page(view, { engine });
      const leg = `(boxes) ${engine} ${name}`;
      try {
        await open(page, base, "[data-needs-caw]");
        const railed = await page
          .locator("[data-presence]")
          .first()
          .isVisible()
          .catch(() => false);
        if (!railed) {
          await page
            .getByRole("button", { name: "Open navigation" })
            .first()
            .click();
        }
        await page.waitForSelector("[data-presence]", {
          state: "visible",
          timeout: 15_000,
        });
        await settle(page, 500);
        const rest = await readBoxes(page);
        kit.check(
          `${leg}: the dot is a ${rest.dot.width}px circle on the avatar's corner, inside the screen`,
          Math.abs(rest.dot.width - 6) < 0.6 &&
            Math.abs(rest.dot.height - 6) < 0.6 &&
            Math.abs(rest.dot.right - rest.img.right) <= 2 &&
            Math.abs(rest.dot.bottom - rest.img.bottom) <= 2 &&
            rest.dot.right <= rest.viewport.width &&
            rest.dot.bottom <= rest.viewport.height,
          JSON.stringify(rest)
        );
        kit.check(
          `${leg}: the avatar is named with the person's state ("You · …")`,
          rest.label.startsWith("You · "),
          rest.label
        );
        const trigger = page.locator("[data-presence]:visible").first();
        await trigger.click();
        await page.waitForSelector('[data-slot="dropdown-menu-content"]', {
          state: "visible",
          timeout: 10_000,
        });
        await settle(page, 500);
        const opened = await readBoxes(page);
        const { menu } = opened;
        kit.check(
          `${leg}: the menu stands inside the screen and never scrolls sideways`,
          Boolean(
            menu &&
            menu.left >= 0 &&
            menu.top >= 0 &&
            menu.right <= opened.viewport.width &&
            menu.bottom <= opened.viewport.height &&
            menu.sideways <= 0
          ),
          JSON.stringify(menu)
        );
        const item = page.locator('[data-slot="appear-away"]');
        const itemBox = await item.boundingBox();
        kit.check(
          `${leg}: Appear away is in the menu, its row ${Math.round(itemBox?.height ?? 0)}px tall`,
          Boolean(
            itemBox && itemBox.height >= (VIEWS_TOUCH.has(view) ? 44 : 28) - 0.5
          ),
          JSON.stringify(itemBox)
        );
        if (view === "desk") {
          await item.click();
          const appearing = await until(
            `${leg}: the dot appearing away`,
            () =>
              page
                .locator("[data-presence]:visible")
                .first()
                .getAttribute("data-presence"),
            (state) => state === "appearing",
            10_000
          ).catch(() => null);
          const held = await personOf(fleet);
          kit.check(
            `${leg}: Appear away from the menu reaches the hub, and the dot turns hollow in the away hue`,
            appearing === "appearing" && held.manual,
            `dot ${appearing}; hub ${JSON.stringify(held)}`
          );
          await item.click();
          await until(
            `${leg}: Appear away off`,
            async () => (await personOf(fleet)).manual,
            (manual) => !manual,
            10_000
          ).catch(() => undefined);
        }
        await page.keyboard.press("Escape");
      } finally {
        await page.context().close();
      }
    }
  }
};

const VIEWS_TOUCH = new Set<View>(["phone"]);

/** (machine) The agent's desktop from the headless KWin, and the opt-in. */
const machineLeg = async (
  kit: Kit,
  fleet: KitFleet,
  kwin: boolean
): Promise<void> => {
  if (!kwin) {
    kit.note(
      "(machine) no kwin_wayland on this machine: the agent's desktop leg is not run"
    );
    return;
  }
  const short = MACHINE.slice(0, 8);
  const lines = await until(
    "(machine) the agent's desktop in use, then idle",
    async () => (await fleet.logs("hub")).split("\n"),
    (all) =>
      all.some((line) =>
        line.includes(`machine ${short}: active (ext-idle-notify-v1`)
      ) &&
      all.some((line) =>
        line.includes(`machine ${short}: idle (ext-idle-notify-v1`)
      ),
    120_000
  ).catch(() => [] as string[]);
  const said = lines.filter((line) => line.includes(`machine ${short}:`));
  kit.check(
    "(machine) the agent reads its desktop from KWin's ext-idle-notify-v1 and the hub hears it in use, then idle",
    said.some((line) => line.includes(": active (ext-idle-notify-v1")) &&
      said.some((line) => line.includes(": idle (ext-idle-notify-v1")),
    said.join(" | ")
  );
  const before = await personOf(fleet);
  const listed = before.devices.find((device) => device.id === MACHINE);
  await fleet.api(`/api/person/devices/${MACHINE}`, { counts: true });
  const after = await personOf(fleet);
  const counted = after.devices.find((device) => device.id === MACHINE);
  kit.check(
    "(machine) the presence menu lists the machine off until the person opts it in, then on with its state word",
    listed?.counts === false &&
      counted?.counts === true &&
      counted.state === "idle",
    JSON.stringify({ before: listed, after: counted })
  );
  // Back off: the hold legs read only the desk tab and the probe's devices.
  await fleet.api(`/api/person/devices/${MACHINE}`, { counts: false });
};

/** How many desktop notifications the desk tab was asked to show, by title. */
const shownOn = (page: import("playwright-core").Page) =>
  page.evaluate(
    () =>
      (window as unknown as { __shown?: { title: string; tag?: string }[] })
        .__shown ?? []
  );

/** (hold) The person gate: held at the desk, sent on Appear away, only if recent. */
const holdLegs = async (
  kit: Kit,
  fleet: KitFleet,
  phone: Phone,
  cwd: string
): Promise<void> => {
  const base = await fleet.dashboard();
  // The person is at this computer, in another app: the tab is not the
  // one in front, and it may show notifications.
  const page = await kit.page("desk", {
    engine: "chromium",
    init: [notificationsGranted, notificationStandIn, elsewhereOnTheDesk],
  });
  await open(page, base, "[data-needs-caw]");
  // Its beats say it can show them.
  await until(
    "(hold) the desk tab beating with alerts",
    async () => (await fleet.logs("hub")).length,
    Boolean,
    5000
  );
  await settle(page, 1500);

  const pushedFor = async (id: string) => await phone.turns(id);

  // A finished turn while the person is at the desk: held, shown on the tab.
  const first = await fleet.spawn("claude", "Hold one", cwd);
  const then = await fleet.logMark("hub");
  await fleet.send(first, "PROBE-HOLD-1: say ok.");
  await turnOf(fleet, "PROBE-HOLD-1", "claude");
  await atRest(fleet, first);
  const held = await until(
    "(hold) the turn's push held at the desk",
    async () => (await then.since()).split("\n"),
    (lines) =>
      lines.some((line) =>
        line.includes(`push turn-${first}: held, the person is at a desk`)
      ),
    60_000
  ).catch(() => [] as string[]);
  await Bun.sleep(3000);
  const shown = await shownOn(page);
  kit.check(
    "(hold) at a desk, a finished turn's push is held and shown on the desk tab as a desktop notification, not on the phone",
    held.some((line) => line.includes(`push turn-${first}: held`)) &&
      shown.some((one) => one.tag === `turn-${first}`) &&
      (await pushedFor(first)) === 0,
    `tab showed ${JSON.stringify(shown)}; phone ${await pushedFor(first)}; hub: ${held.filter((line) => line.includes(first)).join(" | ")}`
  );

  // Appear away: the held push goes to the phone.
  await fleet.api("/api/person/away", { on: true });
  const sent = await until(
    "(hold) the held push on the phone after Appear away",
    () => pushedFor(first),
    (count) => count > 0,
    60_000
  ).catch(() => 0);
  kit.check(
    "(hold) Appear away: the push held at the desk goes to the phone (it landed within 10 min of the last input)",
    sent === 1,
    `${sent} push(es) for turn-${first}`
  );
  await fleet.api("/api/person/away", { on: false });

  // One held, then the person stays at the desk past the hold's window.
  const old = await fleet.spawn("claude", "Hold old", cwd);
  await fleet.send(old, "PROBE-HOLD-OLD: say ok.");
  await turnOf(fleet, "PROBE-HOLD-OLD", "claude");
  await atRest(fleet, old);
  await until(
    "(hold) the old turn's push held",
    async () => (await fleet.logs("hub")).split("\n"),
    (lines) => lines.some((line) => line.includes(`push turn-${old}: held`)),
    60_000
  ).catch(() => undefined);
  const heldAt = Date.now();
  // The person keeps working at the desk: input every 30 s.
  while (Date.now() - heldAt < HELD_RECENT_MS + 30_000) {
    // biome-ignore lint/performance/noAwaitInLoops: one beat each 30 s, as a tab beats
    await beat(fleet, "probe-desk-input", { idleMs: 0, machine: "active" });
    await page.mouse.move(400 + Math.random() * 10, 400);
    await Bun.sleep(30_000);
  }
  const fresh = await fleet.spawn("claude", "Hold fresh", cwd);
  await fleet.send(fresh, "PROBE-HOLD-FRESH: say ok.");
  await turnOf(fleet, "PROBE-HOLD-FRESH", "claude");
  await atRest(fleet, fresh);
  await until(
    "(hold) the fresh turn's push held",
    async () => (await fleet.logs("hub")).split("\n"),
    (lines) => lines.some((line) => line.includes(`push turn-${fresh}: held`)),
    60_000
  ).catch(() => undefined);
  const release = await fleet.logMark("hub");
  await fleet.api("/api/person/away", { on: true });
  await until(
    "(hold) the fresh push on the phone",
    () => pushedFor(fresh),
    (count) => count > 0,
    60_000
  ).catch(() => 0);
  await Bun.sleep(15_000);
  const freshSent = await pushedFor(fresh);
  const oldSent = await pushedFor(old);
  const said = (await release.since())
    .split("\n")
    .filter((line) => line.includes(old) || line.includes(fresh));
  kit.check(
    `(hold) only items from the last ${HELD_RECENT_MS / 60_000} min follow the person: the one held ${Math.round((Date.now() - heldAt) / 60_000)} min before stays on the board, the fresh one goes to the phone`,
    oldSent === 0 &&
      freshSent === 1 &&
      said.some((line) =>
        line.includes(`push turn-${old}: held at the desk, not sent`)
      ),
    `old ${oldSent}, fresh ${freshSent}; hub: ${said.join(" | ")}`
  );
  await fleet.api("/api/person/away", { on: false });
  await page.context().close();
};

const spec: Spec = {
  name: "presence",
  run,
};

export default spec;
