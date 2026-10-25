/**
 * The hub knows whether the person is here, on which chat, or away (hub
 * notifications.ts `rollup`), and everything that hears it does what the
 * owner picked. On a scratch fleet (real hub, agent and sessiond against
 * the mock model) with a stand-in Cawrier and one paired phone:
 *
 * - (rollup) one device after another, through `POST /api/presence` and
 *   read back from `GET /api/person`: the 5-minute clock (idle 4 min is
 *   here, 6 min is away since then), a lock overrides (a tab whose chat is
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
 * - (onboarding) what this browser is asked for: Chromium's row names
 *   "Your device use", Allow calls the browser's prompt on the press, its
 *   tick, the tab's Idle Detection reaching the hub as the machine's word,
 *   locked included; answered no, the row and the presence menu name the
 *   setting and where to turn it on. WebKit, a Chromium page without
 *   IdleDetector and Brave (its `navigator.brave`): no ask and no warning,
 *   the row saying plainly it is not available here and where this
 *   computer can say it instead; WebKit with notifications to answer, those
 *   alone asked. A browser on the
 *   computer whose agent reads its desktop: tied there by the hub, nothing
 *   asked. The row at 390, 680 and 1440, asking and refused.
 * - (boxes) the presence dot and its menu at 390, 680 and 1440, Chromium
 *   and WebKit: the dot on the avatar's corner, the menu inside the screen,
 *   Appear away from the menu reaching the hub.
 * - (hold) with the person at a desk whose tab can show it, a finished
 *   turn's push is held and shown on that tab as a desktop notification;
 *   Appear away sends it to the phone. One held more than 5 minutes
 *   before the person's last input stays on the board; one newer goes.
 *
 * Runs inside a workspace: it delegates nothing. Its last leg waits out the
 * 5-minute hold, so the run takes about 15 minutes.
 *
 *   bun scripts/probe-kit/run.ts presence
 *   bun scripts/probe-kit/run.ts presence --onboarding   (this browser's asks alone)
 */
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { waitLine } from "../../../packages/core/src/injected";
import {
  AWAY_AFTER_DEFAULT_MS,
  type PersonView,
} from "../../../packages/core/src/notifications";
import { presenceWords } from "../../../packages/core/src/words/presence";
import { presenceLogWords } from "../../../packages/core/src/words/presence-log";
import { sidebarWords } from "../../../packages/core/src/words/sidebar";
import {
  type Harness,
  MACHINE,
  type Reply,
  type Seen,
  until,
} from "../../scratch-fleet";
import { helperOn } from "../hand-off";
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
/** `--onboarding`: this browser's asks alone (onboarding, its boxes, machine, agent-here), a few minutes. */
const ONBOARDING_ONLY = process.argv.includes("--onboarding");
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

    if (ONBOARDING_ONLY) {
      await onboardingLegs(kit, fleet);
      await deskBoxLegs(kit, fleet);
      await machineLeg(kit, fleet, Boolean(kwin));
      await agentHereLeg(kit, fleet, Boolean(kwin));
      return;
    }
    await rollupLegs(kit, fleet);
    await lineLegs(kit, fleet, cwd);
    await onboardingLegs(kit, fleet);
    await deskBoxLegs(kit, fleet);
    await boxLegs(kit, fleet);
    await machineLeg(kit, fleet, Boolean(kwin));
    await agentHereLeg(kit, fleet, Boolean(kwin));
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
  await beat(fleet, "probe-clock", { idleMs: 4 * 60_000, machine: "idle" });
  const four = await personOf(fleet);
  kit.check(
    "(rollup) the 5-min clock: no input for 4 minutes is still here",
    four.state === "here",
    JSON.stringify(four)
  );
  const sixAgo = Date.now() - 6 * 60_000;
  await beat(fleet, "probe-clock", { idleMs: 6 * 60_000, machine: "idle" });
  const six = await personOf(fleet);
  kit.check(
    `(rollup) the 5-min clock: no input for 6 minutes is away, since the last input (${AWAY_AFTER_DEFAULT_MS / 60_000} min clock)`,
    six.state === "away" &&
      six.since !== null &&
      Math.abs(six.since - sixAgo) < 5000,
    JSON.stringify(six)
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
  // A hand-off is another session's (hand-off.ts): CawCo's words, not the person's.
  const helper = await helperOn(fleet, cwd);
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
    await helper.send(id, `${tag("ELSE", harness)}: carry on.`);
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
    await helper.send(id, `${tag("AWAY", harness)}: run the build.`);
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
    // The line the hub writes for it (core injected.ts `waitLine`): the step's chip, then its page's.
    const waiting = waitLine({
      artifact: { id: pages.get(harness) ?? "none", name: `colour-${harness}` },
      content: "Pick the colour",
      session: id,
      step: "w1",
    });
    kit.check(
      `(recap) ${harness}: the step waiting on its page is named by its step's chip and the page's chip, read from the plan`,
      Boolean(seen?.last.includes(waiting)),
      `want ${waiting}; turn: ${seen?.last.slice(-900) ?? "no turn"}`
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

/**
 * In the page: every call to Idle Detection's requestPermission, and
 * whether the press's user activation stood at it (a prompt needs it),
 * before the browser answers.
 */
const recordIdleAsks = () => {
  const page = window as unknown as {
    IdleDetector?: { requestPermission: () => Promise<PermissionState> };
    __idleAsks?: { active: boolean | null }[];
  };
  const Detector = page.IdleDetector;
  if (!Detector) {
    return;
  }
  const asked: { active: boolean | null }[] = [];
  const answer = Detector.requestPermission.bind(Detector);
  Object.defineProperty(Detector, "requestPermission", {
    configurable: true,
    value: () => {
      asked.push({
        active:
          (navigator as Navigator & { userActivation?: { isActive: boolean } })
            .userActivation?.isActive ?? null,
      });
      return answer();
    },
  });
  page.__idleAsks = asked;
};
/** In the page: an engine without Idle Detection, as Safari and Firefox are. */
const noIdleDetector = () => {
  Reflect.deleteProperty(window, "IdleDetector");
};
/** In the page: Brave, as its `navigator.brave.isBrave()` says it. */
const braveStandIn = () => {
  Object.defineProperty(navigator, "brave", {
    configurable: true,
    value: { isBrave: () => Promise.resolve(true) },
  });
};

/**
 * The page's browser on a computer no agent reads: its requests carry a
 * proxy's word that they came from an address no machine of the fleet
 * holds (hub notifications.ts `machineAt` reads it first), as a browser on
 * another computer reaching the hub through a proxy does. The scratch
 * fleet's agent runs on this very computer, its desktop read from the
 * headless KWin, so a page here is otherwise on the agent's machine.
 */
const ELSEWHERE = { "x-forwarded-for": "10.99.0.7" };

/** The page's tie to its machine and the hub's word on that machine, read from the page. */
const tieOf = (page: import("playwright-core").Page) =>
  page.evaluate(async () => {
    const read = (await (await fetch("/api/person")).json()) as {
      devices: { id: string; state: string | null }[];
      thisMachine: string | null;
    };
    return {
      thisMachine: read.thisMachine,
      device: read.devices.find((one) => one.id === read.thisMachine) ?? null,
    };
  });

/** Idle Detection's permission for the page's origin, in its own context, as the browser would hold the person's answer. */
const setIdle = async (
  page: import("playwright-core").Page,
  base: string,
  setting: "granted" | "denied" | "prompt"
) => {
  const cdp = await page.context().newCDPSession(page);
  const { targetInfo } = await cdp.send("Target.getTargetInfo");
  await cdp.send("Browser.setPermission", {
    origin: new URL(base).origin,
    permission: { name: "idle-detection" },
    setting,
    browserContextId: targetInfo.browserContextId,
  });
  return cdp;
};

/** The presence menu's "This browser" lines: its set-up item and a blocked setting's words. */
const menuLines = async (page: import("playwright-core").Page) => {
  const trigger = page.locator("[data-presence]:visible").first();
  if (!(await trigger.isVisible().catch(() => false))) {
    await page
      .getByRole("button", { name: sidebarWords.openNavigation })
      .first()
      .click()
      .catch(() => undefined);
  }
  await page.locator("[data-presence]:visible").first().click();
  await page.waitForSelector('[data-slot="dropdown-menu-content"]', {
    state: "visible",
    timeout: 10_000,
  });
  await settle(page, 300);
  const lines = {
    setUp: await page.locator('[data-slot="set-up-browser"]').count(),
    refusal: await page
      .locator('[data-slot="presence-refusal"]')
      .innerText()
      .catch(() => ""),
  };
  await page.keyboard.press("Escape");
  return lines;
};

/** Caw's panel opened, and the desk row's words once it settles; "" when it never shows. */
const deskRow = async (
  page: import("playwright-core").Page,
  base: string,
  wait = 10_000
) => {
  await openNeeds(page, base);
  const row = page.locator(DESK_ROW);
  const words = await row
    .waitFor({ state: "visible", timeout: wait })
    .then(() => row.innerText())
    .catch(() => "");
  return { row, words };
};

/**
 * (onboarding) What this browser is asked for, by what it can grant and
 * whether its computer's agent already reads it:
 *
 * - Chromium, Idle Detection at prompt: the row names "Your device use",
 *   and Allow calls `IdleDetector.requestPermission()` in the press itself
 *   (its user activation standing), the browser's prompt; the answer (yes,
 *   driven over CDP) starts Idle Detection, which reaches the hub.
 * - Chromium, the person answering no: the refusal names "Your device use"
 *   and where to turn it on; the presence menu says the same.
 * - Without Idle Detection (WebKit; a Chromium page with `IdleDetector`
 *   deleted; Brave, whose `navigator.brave.isBrave()` says so, its
 *   permission denied as Brave keeps it): no ask, no warning, no row.
 */
const onboardingLegs = async (kit: Kit, fleet: KitFleet): Promise<void> => {
  const base = await fleet.dashboard();
  const page = await kit.page("desk", {
    engine: "chromium",
    init: [notificationStandIn, recordIdleAsks],
  });
  await page.context().setExtraHTTPHeaders(ELSEWHERE);
  const { row, words: asked } = await deskRow(page, base, 20_000);
  const tie = await tieOf(page);
  kit.note(`(onboarding) the page elsewhere: ${JSON.stringify(tie)}`);
  kit.check(
    "(onboarding) Chromium, Idle Detection at prompt: the row names “Your device use” and notifications, with Skip and Allow",
    asked.includes(presenceWords.title(true)) &&
      asked.includes(
        presenceWords.lead({ agent: null, idle: true, notify: true })
      ) &&
      asked.includes(presenceWords.deviceUse) &&
      asked.includes(presenceWords.meta) &&
      (await row.getByRole("button", { name: "Allow" }).count()) === 1 &&
      (await row.getByRole("button", { name: "Skip" }).count()) === 1 &&
      tie.thisMachine === null,
    asked
  );
  // The person's yes to the prompt, as the browser holds it: granted to
  // this page's own context. Notifications' yes is the stand-in's.
  const cdp = await setIdle(page, base, "granted");
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
  const prompts = await page.evaluate(
    () =>
      (window as unknown as { __idleAsks?: { active: boolean | null }[] })
        .__idleAsks ?? []
  );
  kit.check(
    "(onboarding) Chromium: Allow calls IdleDetector.requestPermission() once, inside the press's user activation (the browser's prompt), and the row ticks",
    prompts.length === 1 &&
      prompts[0]?.active === true &&
      ticked.includes(presenceWords.done(true)),
    `asks ${JSON.stringify(prompts)}; row: ${ticked}`
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

  // The person answers no to the prompt.
  const denying = await kit.page("desk", {
    engine: "chromium",
    init: [notificationStandIn, recordIdleAsks],
  });
  await denying.context().setExtraHTTPHeaders(ELSEWHERE);
  const denied = await deskRow(denying, base, 20_000);
  await setIdle(denying, base, "denied");
  await denied.row.getByRole("button", { name: "Allow" }).click();
  const blockedTitle = presenceWords.blocked([presenceWords.deviceUse]);
  const unblock = presenceWords.unblock("chromium", false);
  const refused = await until(
    "(onboarding) the refusal",
    async () => {
      try {
        return await denied.row.innerText();
      } catch {
        return "";
      }
    },
    (words) => words.includes(blockedTitle),
    15_000
  ).catch(() => "");
  kit.check(
    `(onboarding) Chromium, the prompt answered no: the row says “${blockedTitle}” and “${unblock}”`,
    refused.includes(blockedTitle) && refused.includes(unblock),
    refused
  );
  const deniedMenu = await menuLines(denying);
  kit.check(
    "(onboarding) Chromium, denied: the presence menu names the setting and where, and offers no set-up",
    deniedMenu.refusal.includes(blockedTitle) &&
      deniedMenu.refusal.includes(unblock) &&
      deniedMenu.setUp === 0,
    JSON.stringify(deniedMenu)
  );
  await denying.context().close();

  // Engines that can't grant Idle Detection, notifications already granted.
  const without: {
    engine: Engine;
    init: (() => void)[];
    name: string;
    deny?: boolean;
  }[] = [
    { name: "WebKit", engine: "webkit", init: [] },
    {
      name: "Chromium without IdleDetector",
      engine: "chromium",
      init: [noIdleDetector],
    },
    {
      name: "Brave (navigator.brave, its permission denied)",
      engine: "chromium",
      init: [braveStandIn],
      deny: true,
    },
  ];
  for (const one of without) {
    // biome-ignore lint/performance/noAwaitInLoops: one browser at a time
    const quiet = await kit.page("desk", {
      engine: one.engine,
      init: [notificationsGranted, notificationStandIn, ...one.init],
    });
    await quiet.context().setExtraHTTPHeaders(ELSEWHERE);
    if (one.deny) {
      await setIdle(quiet, base, "denied");
    }
    const { words } = await deskRow(quiet, base, 8000);
    const menu = await menuLines(quiet);
    kit.check(
      `(onboarding) ${one.name}: no Idle Detection to grant, so the row says so plainly and where this computer can say it instead, asks nothing, and the menu offers no set-up and no warning`,
      words.includes(presenceWords.unavailable(false)) &&
        !words.includes(presenceWords.allow) &&
        menu.setUp === 0 &&
        menu.refusal === "",
      `row "${words}"; menu ${JSON.stringify(menu)}`
    );
    await quiet.context().close();
  }

  // WebKit with notifications still to answer: they alone are asked.
  const safari = await kit.page("desk", {
    engine: "webkit",
    init: [notificationStandIn],
  });
  // On a computer no agent reads: here, the agent's report is what is asked.
  await safari.context().setExtraHTTPHeaders(ELSEWHERE);
  const { words: shown } = await deskRow(safari, base, 10_000);
  kit.check(
    "(onboarding) WebKit, notifications to answer: the row says device use is not available here, asks for notifications alone, and names no device use",
    shown.includes(presenceWords.unavailable(true)) &&
      !shown.includes(presenceWords.deviceUse),
    shown || "no row"
  );
  await safari.context().close();
};

/**
 * (onboarding) A browser on the computer whose agent can read its desktop:
 * the hub ties it to that machine by the address it asks from, and the
 * consent step asks for that agent's report, never the browser's; nothing
 * is read before the yes.
 */
const agentHereLeg = async (
  kit: Kit,
  fleet: KitFleet,
  kwin: boolean
): Promise<void> => {
  if (!kwin) {
    kit.note(
      "(onboarding) no kwin_wayland on this machine: no agent can read the desktop, so the agent-here leg is not run"
    );
    return;
  }
  const base = await fleet.dashboard();
  const page = await kit.page("desk", {
    engine: "chromium",
    init: [notificationsGranted, notificationStandIn, recordIdleAsks],
  });
  const { words } = await deskRow(page, base, 15_000);
  const tie = await tieOf(page);
  const menu = await menuLines(page);
  kit.check(
    "(onboarding) Chromium on the machine whose agent can read its desktop: the hub ties it there, the step asks for that agent's report (not the browser's), and the agent reads nothing before the yes",
    tie.thisMachine === MACHINE &&
      tie.device !== null &&
      tie.device.state === null &&
      words.includes(
        presenceWords.lead({
          agent:
            (await personOf(fleet)).devices.find(
              (device) => device.id === MACHINE
            )?.name ?? "?",
          idle: false,
          notify: false,
        })
      ) &&
      menu.setUp === 0 &&
      menu.refusal === "",
    `tie ${JSON.stringify(tie)}; row "${words}"; menu ${JSON.stringify(menu)}`
  );
  await page.context().close();
};

/**
 * (onboarding boxes) The desk row at a width: inside the screen, never
 * scrolling sideways, its words wrapping inside it, Skip and Allow (or a
 * refusal's words) inside the row.
 */
const deskBoxes = async (
  kit: Kit,
  page: import("playwright-core").Page,
  leg: string,
  refused = false
): Promise<void> => {
  const boxes = await page.evaluate((selector) => {
    const row = document.querySelector<HTMLElement>(selector);
    if (!row) {
      return null;
    }
    const box = (el: Element | null) => {
      if (!el) {
        return null;
      }
      const r = el.getBoundingClientRect();
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
    };
    const peers = row.querySelector('[data-slot="peers"]');
    return {
      viewport: innerWidth,
      sideways: document.scrollingElement
        ? document.scrollingElement.scrollWidth -
          document.scrollingElement.clientWidth
        : 0,
      rowSideways: row.scrollWidth - row.clientWidth,
      row: box(row),
      peers: box(peers),
      parts: [...(peers?.children ?? [])].map((child) => box(child)),
      refusal: (() => {
        const line = row.querySelector<HTMLElement>(
          '[data-slot="desk-refusal"]'
        );
        return line
          ? {
              clipped: line.scrollWidth > line.clientWidth,
              lines: Math.round(
                line.getBoundingClientRect().height /
                  Number.parseFloat(getComputedStyle(line).lineHeight)
              ),
              text: line.textContent?.trim() ?? "",
            }
          : null;
      })(),
    };
  }, DESK_ROW);
  const inside = (
    part: { left: number; right: number } | null,
    frame: { left: number; right: number }
  ) =>
    part !== null &&
    part.left >= frame.left - 0.5 &&
    part.right <= frame.right + 0.5;
  kit.check(
    `(onboarding boxes) ${leg}: the desk row stands inside the screen, nothing scrolls sideways, its buttons and words inside it${refused ? ", the refusal wrapped whole (never cut), naming where to turn it on" : ""}`,
    Boolean(
      boxes?.row &&
      boxes.row.left >= 0 &&
      boxes.row.right <= boxes.viewport + 0.5 &&
      boxes.sideways <= 0 &&
      boxes.rowSideways <= 0 &&
      boxes.parts.length > 0 &&
      boxes.parts.every((part) => boxes.row && inside(part, boxes.row)) &&
      (!refused ||
        (boxes.refusal !== null &&
          !boxes.refusal.clipped &&
          boxes.refusal.text.includes(
            presenceWords.unblock("chromium", false)
          )))
    ),
    JSON.stringify(boxes)
  );
};

/** (onboarding boxes) The asking row and its refusal at 390, 680 and 1440, Chromium. */
const deskBoxLegs = async (kit: Kit, fleet: KitFleet): Promise<void> => {
  const base = await fleet.dashboard();
  for (const { name, view } of VIEWS) {
    // biome-ignore lint/performance/noAwaitInLoops: one page at a time
    const page = await kit.page(view, {
      engine: "chromium",
      init: [notificationStandIn],
    });
    try {
      await page.context().setExtraHTTPHeaders(ELSEWHERE);
      const { row, words } = await deskRow(page, base, 20_000);
      if (!words) {
        kit.check(
          `(onboarding boxes) chromium ${name}: the desk row shows`,
          false,
          "no row"
        );
        continue;
      }
      await deskBoxes(kit, page, `chromium ${name}, asking`);
      await setIdle(page, base, "denied");
      await row.getByRole("button", { name: "Allow" }).click();
      await until(
        "(onboarding boxes) the refusal",
        async () => {
          try {
            return await row.innerText();
          } catch {
            return "";
          }
        },
        (said) =>
          said.includes(presenceWords.blocked([presenceWords.deviceUse])),
        15_000
      ).catch(() => "");
      await settle(page, 300);
      await deskBoxes(kit, page, `chromium ${name}, refused`, true);
    } finally {
      await page.context().close();
    }
  }
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
            .getByRole("button", { name: sidebarWords.openNavigation })
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
  const before = await personOf(fleet);
  const listed = before.devices.find((device) => device.id === MACHINE);
  const quiet = (await fleet.logs("hub"))
    .split("\n")
    .filter((line) => line.includes(`machine ${short}: active`));
  kit.check(
    "(machine) before the person's yes, the presence menu lists the machine off with no state word, and the hub has heard nothing of its desktop",
    listed?.counts === false && listed.state === null && quiet.length === 0,
    `${JSON.stringify(listed)}; ${quiet.join(" | ")}`
  );
  const mark = await fleet.logMark("hub");
  await fleet.api(`/api/person/devices/${MACHINE}`, { counts: true });
  const lines = await until(
    "(machine) the agent's desktop in use, then idle",
    async () => (await mark.since()).split("\n"),
    (all) =>
      all.some((line) =>
        line.includes(`machine ${short}: active (ext-idle-notify-v1`)
      ) &&
      all.some((line) =>
        line.includes(`machine ${short}: idle (ext-idle-notify-v1`)
      ),
    150_000
  ).catch(() => [] as string[]);
  const said = lines.filter((line) => line.includes(`machine ${short}:`));
  const counted = (await personOf(fleet)).devices.find(
    (device) => device.id === MACHINE
  );
  kit.check(
    "(machine) the yes: the agent reads its desktop from KWin's ext-idle-notify-v1 and the hub hears it in use, then idle; the menu lists it on with its state word",
    said.some((line) => line.includes(": active (ext-idle-notify-v1")) &&
      said.some((line) => line.includes(": idle (ext-idle-notify-v1")) &&
      counted?.counts === true &&
      counted.state === "idle",
    `${said.join(" | ")}; ${JSON.stringify(counted)}`
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
        line.includes(presenceLogWords.heldAtDesk(`turn-${first}`))
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
    `(hold) Appear away: the push held at the desk goes to the phone (it landed within ${AWAY_AFTER_DEFAULT_MS / 60_000} min of the last input)`,
    sent === 1,
    `${sent} push(es) for turn-${first}`
  );
  await fleet.api("/api/person/away", { on: false });

  await installLeg(kit, fleet, phone, page);

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
  while (Date.now() - heldAt < AWAY_AFTER_DEFAULT_MS + 30_000) {
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
    `(hold) only items from the last ${AWAY_AFTER_DEFAULT_MS / 60_000} min follow the person: the one held ${Math.round((Date.now() - heldAt) / 60_000)} min before stays on the board, the fresh one goes to the phone`,
    oldSent === 0 &&
      freshSent === 1 &&
      said.some((line) =>
        line.includes(`push turn-${old}: held at the desk, not sent`)
      ),
    `old ${oldSent}, fresh ${freshSent}; hub: ${said.join(" | ")}`
  );
  await fleet.api("/api/person/away", { on: false });
  await goneTabLegs(kit, fleet, phone, page, cwd);
};

/** A port nothing listens on: an SSH install there is refused at once. */
const closedPort = async (): Promise<number> => {
  const lease = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: () => new Response(null),
  });
  const port = lease.port as number;
  await lease.stop(true);
  return port;
};

/** (hold) An install's outcome goes where any item goes: held at the desk, sent on Appear away. */
const installLeg = async (
  kit: Kit,
  fleet: KitFleet,
  phone: Phone,
  page: import("playwright-core").Page
): Promise<void> => {
  const then = await fleet.logMark("hub");
  const started = await fleet.api<{ install: { id: string } }>(
    "/api/installs",
    {
      route: "ssh",
      target: "probe@127.0.0.1",
      port: await closedPort(),
      signIn: "key",
    }
  );
  const { id } = started.install;
  const collapseId = `install-${id}`;
  const held = await until(
    "(install) its outcome held at the desk",
    async () => (await then.since()).split("\n"),
    (lines) =>
      lines.some((line) =>
        line.includes(presenceLogWords.heldAtDesk(collapseId))
      ),
    90_000
  ).catch(() => [] as string[]);
  await Bun.sleep(3000);
  const shown = await shownOn(page);
  kit.check(
    "(hold) an install's outcome goes through the person gate: held at the desk and shown on its tab, not on the phone",
    shown.some((one) => one.tag === collapseId) &&
      phone.installAlerts(id).length === 0,
    `tab showed ${JSON.stringify(shown.filter((one) => one.tag === collapseId))}; phone ${phone.installAlerts(id).length}; hub: ${held.filter((line) => line.includes(id)).join(" | ")}`
  );
  await fleet.api("/api/person/away", { on: true });
  const sent = await until(
    "(install) its push on the phone after Appear away",
    () => phone.installAlerts(id).length,
    (count) => count > 0,
    60_000
  ).catch(() => 0);
  kit.check(
    "(hold) Appear away: the install's outcome held at the desk goes to the phone",
    sent === 1,
    `${sent} push(es) for ${collapseId}: ${JSON.stringify(phone.installAlerts(id))}`
  );
  await fleet.api("/api/person/away", { on: false });
  await fetch(`${fleet.base}/api/installs/${id}`, { method: "DELETE" });
};

/** A desk tab in a browser of its own, which the leg kills without its last beacon; its presence id. */
const doomedTab = async (
  kit: Kit,
  base: string,
  name: string
): Promise<{ id: string; kill: () => Promise<void> }> => {
  const doomed = await kit.page("desk", {
    engine: "chromium",
    browser: name,
    init: [notificationsGranted, notificationStandIn, elsewhereOnTheDesk],
  });
  await open(doomed, base, "[data-needs-caw]");
  await settle(doomed, 1500);
  const id =
    (await doomed.evaluate(() =>
      sessionStorage.getItem("cawco-presence-client")
    )) ?? "?";
  return {
    id,
    // The whole browser, at once (DevTools' Browser.crash): no pagehide
    // runs, so no last beacon (measured: 0 beacons, the page closed, no
    // renderer crash). Its send never settles: the browser is gone.
    kill: async () => {
      const browser = doomed.context().browser();
      const cdp = await browser?.newBrowserCDPSession();
      cdp?.send("Browser.crash").catch(() => undefined);
      await Bun.sleep(1000);
    },
  };
};

/** A finished turn in a new session, at rest: its id. */
const turnEnds = async (
  fleet: KitFleet,
  cwd: string,
  words: string
): Promise<string> => {
  const id = await fleet.spawn("claude", words, cwd);
  await fleet.send(id, `${words}: say ok.`);
  await turnOf(fleet, words, "claude");
  await atRest(fleet, id);
  return id;
};

/**
 * (gone) A desk tab killed without its last beacon: its desk alert goes
 * unanswered, so the item goes on to another live tab, and with none left,
 * to the phone.
 */
const goneTabLegs = async (
  kit: Kit,
  fleet: KitFleet,
  phone: Phone,
  page: import("playwright-core").Page,
  cwd: string
): Promise<void> => {
  const base = await fleet.dashboard();
  const live = (
    (await page.evaluate(() =>
      sessionStorage.getItem("cawco-presence-client")
    )) ?? "?"
  ).slice(0, 8);
  const first = await doomedTab(kit, base, "doomed-one");
  await first.kill();
  const then = await fleet.logMark("hub");
  const one = await turnEnds(fleet, cwd, "PROBE-GONE-1");
  const moved = await until(
    "(gone) the item on the live tab",
    async () => (await then.since()).split("\n"),
    (lines) =>
      lines.some((line) =>
        line.includes(`push turn-${one}: shown on tab ${live} instead`)
      ),
    90_000
  ).catch(() => [] as string[]);
  await Bun.sleep(2000);
  const shown = await shownOn(page);
  kit.check(
    "(gone) a desk tab killed without its last beacon doesn't answer, so its alert goes to the next live tab",
    moved.some((line) =>
      line.includes(
        `push turn-${one}: tab ${first.id.slice(0, 8)} did not answer its desk alert`
      )
    ) &&
      shown.some((item) => item.tag === `turn-${one}`) &&
      (await phone.turns(one)) === 0,
    `phone ${await phone.turns(one)}; hub: ${moved.filter((line) => line.includes(one)).join(" | ")}`
  );

  // No live tab left: the item goes to the phone.
  await page.context().close();
  const second = await doomedTab(kit, base, "doomed-two");
  await second.kill();
  const later = await fleet.logMark("hub");
  const two = await turnEnds(fleet, cwd, "PROBE-GONE-2");
  const pushed = await until(
    "(gone) the item on the phone",
    () => phone.turns(two),
    (count) => count > 0,
    90_000
  ).catch(() => 0);
  const said = (await later.since())
    .split("\n")
    .filter((line) => line.includes(`turn-${two}`));
  kit.check(
    "(gone) with no live tab left, the alert to the killed tab goes unanswered and the item still reaches the phone",
    pushed === 1 &&
      said.some((line) =>
        line.includes(
          `tab ${second.id.slice(0, 8)} did not answer its desk alert`
        )
      ) &&
      said.some((line) =>
        line.includes("no tab at the desk can show it, so it goes to the phone")
      ),
    `phone ${pushed}; hub: ${said.join(" | ")}`
  );
};

const spec: Spec = {
  name: "presence",
  run,
};

export default spec;
