/**
 * While the person is in a session's chat, every send to it tells it so, and
 * a message of theirs with no reply yet is answered by the next turn, whatever
 * woke it (owner's report, 2026-11-04: three milestones lost to "at their desk
 * but not on this chat" while he sat in the chat).
 *
 * On a scratch fleet (real hub, agent and sessiond; Claude Code against the
 * mock model) and the built dashboard at the desk, read from what the model
 * was sent (`presenceLine` in the send's reminder), `GET /api/person` and the
 * hub's `presence_clients`:
 *
 * On the chat (hub notifications.ts `chatsOn`, dashboard presence.ts `showing`):
 * 1. a tab in the chat reads `on`;
 * 2. the same with a page open in the panel beside it and the press inside
 *    its frame;
 * 3. the window no longer focused (the notification gate's `active` false),
 *    still on screen: `on`;
 * 4. a second tab, on another chat, with the newest input: `on` for both;
 * 5. the second tab on a page with no chat, with the newest input: `on`;
 * 6. and the rule still parts: that tab hidden, `elsewhere`;
 * 7. a project's conversation docked on its page: `on`;
 * 8. a send from no device that beats: `on` for that chat;
 * 9. the link back after it dropped: the hub hears the tab at once;
 * 10. the iPhone in a chat: its every beat is input, and what a desk left on
 *    screen is no chat the person is in.
 *
 * Their message with no reply (hub db `personUnanswered`):
 * 11. a turn that ends on no_reply_needed leaves it owed: the next send says
 *    so, on the chat, elsewhere and away alike;
 * 12. a turn's closing words answer it: the next send does not say so;
 * 13. a send of the session's own never makes one owed.
 *
 *   bun scripts/probe-kit/run.ts chat-presence
 */
import type { Page } from "playwright-core";
import {
  type PresenceSaid,
  presenceLine,
} from "../../../packages/core/src/injected";
import type { PersonView } from "../../../packages/core/src/notifications";
import { toolWords } from "../../lib/tool-call";
import { MACHINE, type Reply, type Seen, until } from "../../scratch-fleet";
import { type Kit, type KitFleet, open, type Spec } from "../kit";
import { atRest } from "../phone";

const NO_REPLY = "mcp__cawco__no_reply_needed";
/** A message the mock's turn ends on no_reply_needed for. */
const SILENT = "PROBE-SILENT";
const PANE = ':is([data-slot="preview-pane"], [data-side-card="preview"])';

/** The line in full for the plain forms, the head alone for `away`, whose clock this spec does not set. */
const ON = presenceLine({ kind: "on" });
const ELSEWHERE = presenceLine({ kind: "elsewhere" });
const AWAY_HEAD = "[CawCo presence] The person is away";
/** What the owed form adds to a line: its own words, read off `presenceLine` itself. */
const OWED = (() => {
  const said: PresenceSaid = { kind: "on", unanswered: true };
  return presenceLine(said).slice(ON.length).trim();
})();

const respond = (request: Seen): Reply => {
  if (!request.tools) {
    return { everyMs: 5, words: ["Probe title"] };
  }
  if (request.last.includes(SILENT) && !request.afterTool) {
    return { everyMs: 5, words: [], tool: { name: NO_REPLY, input: {} } };
  }
  return { everyMs: 5, words: ["ok"] };
};

/** A tab of its own at the desk on `session`, its workspace that one chat. */
const tabOn = async (
  kit: Kit,
  base: string,
  session: string
): Promise<Page> => {
  const page = await kit.page("desk");
  await page.addInitScript(
    ([tab]) => {
      localStorage.setItem(
        "cawco-workspace",
        JSON.stringify({
          v: 1,
          root: { t: "l", id: "pone", tabs: [tab], active: tab, opened: null },
          focusedLeaf: "pone",
        })
      );
    },
    [session] as const
  );
  await open(page, `${base}/session/${session}`, '[data-slot="pane"]');
  return page;
};

/** The person's hand on the page: its newest input, said to the hub by the next beat, or at once after a quiet minute. */
const touch = async (page: Page): Promise<void> => {
  await page.bringToFront();
  await page.mouse.move(300, 300);
  await page.mouse.move(340, 340);
};

/** The page says it is hidden (headless pages cannot be: kit hidden-tab.ts) or visible again, as a browser tells it. */
const setHidden = (page: Page, hidden: boolean) =>
  page.evaluate((to) => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => (to ? "hidden" : "visible"),
    });
    document.dispatchEvent(new Event("visibilitychange"));
  }, hidden);

/** The page's window loses the keyboard while it stays on screen (Playwright's focus emulation keeps `hasFocus` true by itself). */
const blurWindow = (page: Page) =>
  page.evaluate(() => {
    document.hasFocus = () => false;
    window.dispatchEvent(new Event("blur"));
  });

const run = async (kit: Kit): Promise<void> => {
  const { check } = kit;
  const fleet: KitFleet = await kit.fleet(respond);
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.launch("agent");
  await fleet.agentUp();
  await fleet.accountSignedIn();
  const base = await fleet.dashboard();

  const chat = await fleet.spawn("claude", "In the chat", fleet.repo);
  const other = await fleet.spawn("claude", "Another chat", fleet.repo);
  // Hands off and does nothing else: the hub refuses a dashboard send that
  // names any origin but the person's (stream.ts), so another session's
  // hand-off is what gives a session words that are not theirs.
  const helper = await fleet.spawn("claude", "Hands off", fleet.repo);
  await atRest(fleet, helper);
  const credential = await fleet.sessionCredential(helper);
  if (!credential) {
    throw new Error("the helper carries no credential");
  }
  const door = { base: fleet.base, credential, id: helper };
  const handoff = (target: string, message: string) =>
    toolWords(door, "handoff", { target, message }, { via: "mcp" });

  /** The hub as it reads the person now. */
  const person = () => fleet.api<PersonView>("/api/person");
  const chatsOf = () =>
    fleet.query<{ showing: string; active: number; session_id: string | null }>(
      "SELECT showing, active, session_id FROM presence_clients WHERE kind = 'web'"
    );
  /** Until the hub says the person is in `session` (`on` is the first of them, so a client's own row is read). */
  const shows = (session: string, what: string) =>
    until(
      what,
      chatsOf,
      (rows) =>
        rows.some((row) =>
          (JSON.parse(row.showing) as string[]).includes(session)
        ),
      40_000
    );

  /** How many turns the session has ended, as the hub's row keeps the last. */
  const endedAt = (session: string): number | null =>
    fleet.query<{ at: number | null }>(
      "SELECT turn_ended_at AS at FROM instances WHERE id = ?",
      session
    )[0]?.at ?? null;

  let tags = 0;
  /**
   * A send that is not the person's, as a delegate's report is: another
   * session's hand-off. What the model read of it, reminder included, once
   * its turn has ended. A hub that finds the target's cache cold refuses the
   * first call and delivers the same call again.
   */
  const background = async (session: string): Promise<string> => {
    tags += 1;
    const tag = `PROBE-BACKGROUND-${tags}`;
    const before = endedAt(session);
    let answer = await handoff(session, tag);
    if (answer.refused) {
      answer = await handoff(session, tag);
    }
    if (answer.refused) {
      throw new Error(`hand-off refused: ${answer.text}`);
    }
    const read = await until(
      `the session to read ${tag}`,
      () => fleet.seen.find((one) => one.last.includes(tag)),
      (one) => one !== undefined,
      120_000
    );
    await until(
      `the turn on ${tag} to end`,
      () => endedAt(session),
      (at) => at !== before,
      120_000
    );
    return read?.last ?? "";
  };
  /** The person's own message, its turn over. */
  const say = async (session: string, words: string): Promise<void> => {
    const before = endedAt(session);
    await fleet.send(session, words);
    await until(
      `the turn on "${words}" to end`,
      () => endedAt(session),
      (at) => at !== before,
      120_000
    );
  };
  const reads = (what: string, read: string, line: string) =>
    check(what, read.includes(line), read.slice(-400));

  // 1. A tab in the chat.
  const tab = await tabOn(kit, base, chat);
  await touch(tab);
  await shows(chat, "the tab to say it draws the chat");
  await until(
    "the hub to hold the person on the chat",
    person,
    (view) => view.on === chat,
    40_000
  );
  reads("1: a tab in the chat reads on", await background(chat), ON);

  // 2. A page in the panel beside it, the press inside its frame.
  await fleet.api(`/api/instances/${chat}/artifacts`, {
    kind: "page",
    does: "judge",
    ask: "Judge the page",
    name: "beside",
    html: '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Beside</title></head><body><h1>Beside</h1><input aria-label="Field"></body></html>',
  });
  await tab.locator(PANE).first().waitFor({ timeout: 60_000 });
  const frame = await tab.locator(`${PANE} iframe`).first().contentFrame();
  await frame.locator("h1").waitFor({ timeout: 60_000 });
  await frame.locator("input").click();
  check(
    "2: setup: the keyboard is inside the panel's frame",
    await tab.evaluate(() => document.activeElement?.tagName === "IFRAME")
  );
  reads(
    "2: with the panel open beside the chat and the press in its frame, a send reads on",
    await background(chat),
    ON
  );

  // 3. The window unfocused, still on screen.
  await blurWindow(tab);
  await until(
    "the tab to say it is not active",
    chatsOf,
    (rows) => rows.some((row) => row.session_id === chat && row.active === 0),
    40_000
  );
  reads(
    "3: the window unfocused but on screen reads on, with `active` false for the notification gate",
    await background(chat),
    ON
  );

  // 4. A second tab, on another chat, with the newest input.
  const second = await tabOn(kit, base, other);
  await touch(second);
  await shows(other, "the second tab to say it draws its chat");
  reads(
    "4: a second tab on another chat with the newest input leaves the first chat on",
    await background(chat),
    ON
  );
  reads(
    "4: and that second tab's own chat reads on",
    await background(other),
    ON
  );

  // 5. The second tab on a page with no chat, the newest input still there.
  await second.goto(`${base}/usage`, { waitUntil: "domcontentloaded" });
  await touch(second);
  await until(
    "the second tab to draw no chat",
    chatsOf,
    (rows) =>
      !rows.some((row) =>
        (JSON.parse(row.showing) as string[]).includes(other)
      ),
    40_000
  );
  reads(
    "5: a second tab on a page with no chat, with the newest input leaves the chat on",
    await background(chat),
    ON
  );

  // 6. The chat's own tab hidden: the rule still parts.
  await setHidden(tab, true);
  await until(
    "the hidden tab to draw no chat",
    chatsOf,
    (rows) =>
      !rows.some((row) => (JSON.parse(row.showing) as string[]).includes(chat)),
    40_000
  );
  reads(
    "6: the chat's tab hidden, a send reads elsewhere",
    await background(chat),
    ELSEWHERE
  );
  await setHidden(tab, false);
  await shows(chat, "the tab to draw the chat again");

  // 7. A project's conversation, docked on its page.
  const project = await fleet.api<{ id: string }>("/api/projects", {
    name: "Docked",
    machineId: MACHINE,
    cwd: fleet.repo,
  });
  const conversation = await fleet.spawn(
    "claude",
    "The project's conversation",
    fleet.repo,
    { projectId: project.id }
  );
  await second.goto(`${base}/project/${project.id}`, {
    waitUntil: "domcontentloaded",
  });
  // An empty board opens his panel by itself; a press there would put it away.
  const panel = second.locator("[data-caw-panel]");
  const seat = second.locator('[data-slot="caw-seat"]').first();
  await seat.waitFor({ timeout: 60_000 });
  await panel.waitFor({ timeout: 5000 }).catch(() => seat.click());
  await panel.waitFor({ timeout: 60_000 });
  await touch(second);
  await shows(
    conversation,
    "the project's page to say it draws its conversation"
  );
  reads(
    "7: a project's conversation docked on its page reads on",
    await background(conversation),
    ON
  );

  // 8. A send from no device that beats on the chat: the person is in it.
  await second.goto(`${base}/usage`, { waitUntil: "domcontentloaded" });
  await until(
    "no tab to draw the chat",
    chatsOf,
    (rows) =>
      !rows.some((row) =>
        (JSON.parse(row.showing) as string[]).includes(other)
      ),
    40_000
  );
  await say(other, "From no device");
  await until(
    "the hub to hold the person on the chat they wrote in",
    person,
    (view) => view.on === other,
    10_000
  );
  reads(
    "8: a send from no device that beats leaves the person on that chat",
    await background(other),
    ON
  );

  // 9. The link back: the hub hears the tab at once, not on its next beat.
  // Just after a beat, so its next is 30 s off whatever this does.
  const heardAt = () =>
    fleet.query<{ at: number }>(
      "SELECT at FROM presence_clients WHERE kind = 'web' AND session_id = ?",
      chat
    )[0]?.at;
  const lastBeat = heardAt();
  await until("the tab's next beat", heardAt, (at) => at !== lastBeat, 40_000);
  const beforeBack = heardAt();
  await tab.evaluate(() =>
    (Reflect.get(globalThis, "__cawcoSocket") as WebSocket | undefined)?.close()
  );
  await until(
    "a beat from the tab as its link comes back, before its next",
    heardAt,
    (at) => at !== beforeBack,
    20_000
  );
  check("9: the link back, the hub hears the tab before its 30 s beat", true);

  // 10. The iPhone in a chat.
  const phoneBeat = (saidAt: number) =>
    fetch(`${fleet.base}/api/presence`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientId: "probe-phone",
        client: "ios",
        sessionId: other,
        active: true,
        saidAt,
      }),
    });
  const phoneInput = () =>
    fleet.query<{ at: number }>(
      "SELECT input_at AS at FROM presence_clients WHERE client_id = 'probe-phone'"
    )[0]?.at;
  await phoneBeat(Date.now());
  const firstInput = phoneInput();
  await tab.waitForTimeout(1100);
  await phoneBeat(Date.now());
  check(
    "10: the iPhone's every beat in a chat is input: reading on it holds the person here",
    phoneInput() !== firstInput,
    `${firstInput} then ${phoneInput()}`
  );
  const onPhone = await until(
    "the hub to hold the person on the phone's chat",
    person,
    (view) => view.on === other,
    10_000
  );
  check("10: the phone in use: its chat", onPhone.on === other);
  reads("10: the phone's chat reads on", await background(other), ON);
  reads(
    "10: a chat a desk left on screen reads elsewhere while the phone is in use",
    await background(chat),
    ELSEWHERE
  );
  await fetch(`${fleet.base}/api/presence`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      clientId: "probe-phone",
      client: "ios",
      sessionId: null,
      active: false,
      saidAt: Date.now(),
    }),
  });
  await touch(tab);

  // 11. A message of theirs the turn left with no reply.
  await say(chat, `${SILENT}-on`);
  const owedOn = await background(chat);
  reads(
    "11: a turn that ended on no_reply_needed leaves the message owed: on this chat, the send says so",
    owedOn,
    `${ON} ${OWED}`
  );
  // 12. Its closing words answered it.
  const answered = await background(chat);
  check(
    "12: the turn's closing words answer it: the next send does not say it is owed",
    answered.includes(ON) && !answered.includes(OWED),
    answered.slice(-300)
  );
  // 13. The session's own sends never make one owed.
  check(
    "13: a send that is not the person's owes nothing",
    !(await background(chat)).includes(OWED)
  );

  // 11, elsewhere: a chat he left.
  await say(other, `${SILENT}-elsewhere`);
  await say(chat, "Back on this chat");
  const owedElsewhere = await background(other);
  reads(
    "11: a chat the person is not on: the send reads elsewhere, and owed",
    owedElsewhere,
    `${ELSEWHERE} ${OWED}`
  );

  // 11, away.
  await say(other, `${SILENT}-away`);
  await fleet.api("/api/person/away", { on: true });
  const owedAway = await background(other);
  check(
    "11: away, the send reads away, and owed",
    owedAway.includes(AWAY_HEAD) && owedAway.includes(OWED),
    owedAway.slice(-400)
  );
  await fleet.api("/api/person/away", { on: false });
};

const spec: Spec = {
  group: "The hub and machines",
  name: "chat-presence",
  run,
};
export default spec;
