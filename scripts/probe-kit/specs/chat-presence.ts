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
 * 7. a project's conversation docked on its page, which opens on it with
 *    his pages from before the load standing open: `on`; one that holds no
 *    words is drawn as a conversation, its pane and its empty state;
 * 8. a send from no device that beats: `on` for that chat;
 * 9. the link back after it dropped: the hub hears the tab at once;
 * 10. the iPhone in a chat: its every beat is input, and what a desk left on
 *    screen is no chat the person is in.
 *
 * Their message with no reply (hub db `personUnanswered`):
 * 11. a turn that gives him no reply leaves it owed: the next send says
 *    so, on the chat, elsewhere and away alike;
 * 12. a turn's closing words answer it: the next send does not say so;
 * 13. a send of the session's own never makes one owed;
 * 14. while one is owed, no_reply_needed is refused with its words, on his
 *    own message and on a send that wakes the session after it, and the model
 *    takes its next step; a turn's closing words answer him, and the same call
 *    then ends its turn at the call.
 *
 * Input inside a frame (preview overlay/page.ts, `PAGE_TOUCHED_MESSAGE`):
 * 15. a touch inside a decision page, with no input anywhere else, brings the
 *    person back from away, and a later one moves their last input on;
 * 16. the same inside a preview in the panel, on a tab that had no input;
 * 17. inside a preview embedded in a decision page, another origin's frame
 *    inside another origin's: the embed tells the decision page's overlay,
 *    which tells the dashboard (embeds.ts);
 * 18. inside a canvas on the panel's stage (CanvasStages).
 *
 *   bun scripts/probe-kit/run.ts chat-presence
 */
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { Locator, Page } from "playwright-core";
import {
  type PresenceSaid,
  presenceLine,
} from "../../../packages/core/src/injected";
import { NO_REPLY_OWED } from "../../../packages/core/src/no-reply";
import { toolWords } from "../../lib/tool-call";
import { MACHINE, type Reply, type Seen, until } from "../../scratch-fleet";
import { hubAt } from "../hub";
import { open } from "../kit";
import { atRest } from "../phone";
import type { Kit, KitFleet, Spec } from "../spec";

const NO_REPLY = "mcp__cawco__no_reply_needed";
/** A message the mock calls no_reply_needed on; refused, it ends its turn with no words. */
const SILENT = "PROBE-SILENT";
/** The same, but refused, it answers in closing words. */
const ANSWERS = "PROBE-ANSWERS";
const CLOSING = "closing words";
const DECISION_PAGE = "touched";
const EMBED_PAGE = "embedded";
const EMBED_FRAME = 'iframe[data-slot="embed"]';
const EMBED_WORD = "The folder, live";
const EMBED_PROGRAM = (preview: string) => `root = Decisions("Embedded", [word])
word = Decision("word", "Which word reads right?", [keep, other], "Drawn live.", [], [], false, null, "behaviour")
keep = Option("keep", "Keep this word", "The folder's own page.", true, [live], "One more look.")
other = Option("other", "Another word", "A new page.", false, [], "Another round.")
live = Preview("${preview}", "The folder, live")`;
const CANVAS_FRAME =
  '[data-slot="canvas-stage"][data-canvas-stages-docked] iframe';
const DECISION_PROGRAM = `root = Decisions("Touched", [colour])
colour = Decision("colour", "Which colour?", [red, blue], "Either works.", [], [], false, null, "behaviour")
red = Option("red", "Red", "Warm.", true, [], "Loud.")
blue = Option("blue", "Blue", "Cool.", false, [], "Quiet.")`;
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

/**
 * The model reading the refusal itself. A turn that ended with no words leaves
 * the refusal at the conversation's end, so the next send's words join it in
 * one message: that one is the send's, and names a `PROBE-` tag.
 */
const isRefusal = (request: Seen): boolean =>
  request.last.includes(NO_REPLY_OWED) && !request.last.includes("PROBE-");

/** What the mock does with the refusal of the call it made last. */
let answersRefusal = false;

const respond = (request: Seen): Reply => {
  if (!request.tools) {
    return { everyMs: 5, words: ["Probe title"] };
  }
  if (isRefusal(request)) {
    return { everyMs: 5, words: answersRefusal ? [CLOSING] : [] };
  }
  const answers = request.last.includes(ANSWERS);
  if (answers || request.last.includes(SILENT)) {
    answersRefusal = answers;
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

/** The person's hand inside `frame` alone: the pointer arrives there, and moves on it. */
const touchInside = async (page: Page, frame: Locator): Promise<void> => {
  const box = await frame.boundingBox();
  if (!box) {
    throw new Error("the frame has no box to touch");
  }
  await page.bringToFront();
  const [x, y] = [box.x + box.width / 2, box.y + box.height / 2];
  // The move that enters a frame has no movement there, so it is no one's hand
  // (core `personsInput`), and a frame nested in another may be reached a move late.
  await page.mouse.move(x, y);
  await page.mouse.move(x + 12, y + 12);
  await page.mouse.move(x + 24, y + 24);
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
  const person = () => fleet.api((hub) => hub.api.person.get());
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

  /** The person's last input on `page`'s own client, as the hub keeps it; null before any. */
  const inputOn = async (page: Page): Promise<number | null> => {
    const id = await page.evaluate(() =>
      sessionStorage.getItem("cawco-presence-client")
    );
    return (
      fleet.query<{ at: number | null }>(
        "SELECT input_at AS at FROM presence_clients WHERE client_id = ?",
        id ?? ""
      )[0]?.at ?? null
    );
  };

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
  const background = async (session: string, ask = ""): Promise<string> => {
    tags += 1;
    const tag = `PROBE-BACKGROUND-${tags}${ask}`;
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

  // 15. Before any input anywhere: the person is away, and a load changes
  // nothing. Only the pointer inside the decision page's frame brings them back.
  const project = await fleet.api((hub) =>
    hub.api.projects.post({
      name: "Docked",
      machineId: MACHINE,
      cwd: fleet.repo,
    })
  );
  const conversation = await fleet.spawn(
    "claude",
    "The project's conversation",
    fleet.repo,
    { projectId: project.id }
  );
  // His panel's start names it the project's conversation (client
  // `nameConversation`): the one the project's row names is the one his
  // panel shows (CawLead `conversation`).
  await fleet.api((hub) =>
    hub.api.projects({ id: project.id }).caw.conversation.post({
      instanceId: conversation,
    })
  );
  // Spawned with no words and none sent before leg 7: a project's
  // conversation that holds nothing is drawn as itself, never as his start
  // (CawLead `starting` holds only while a start is under way).
  await fleet.api((hub) =>
    hub.api.instances({ id: conversation }).artifacts.post({
      kind: "page",
      does: "pick",
      title: "Probe pick artifact",
      ask: "Pick the colour",
      name: DECISION_PAGE,
      program: DECISION_PROGRAM,
    })
  );
  const decisions = await kit.page("desk");
  await open(
    decisions,
    `${base}/project/${project.id}?view=decisions&page=${DECISION_PAGE}`,
    '[data-slot="decisions"] iframe'
  );
  const decisionFrame = decisions.locator('[data-slot="decisions"] iframe');
  await (
    await decisionFrame.contentFrame()
  )
    .getByText("Which colour?")
    .waitFor({ timeout: 60_000 });
  check(
    "15: setup: with a decision page loaded and no input, the person is away",
    (await person()).state === "away"
  );
  await touchInside(decisions, decisionFrame);
  const backOnPage = await until(
    "the touch inside the decision page to reach the hub",
    person,
    (view) => view.state === "here",
    20_000
  );
  check(
    "15: a touch inside a decision page holds the person here",
    backOnPage.state === "here"
  );
  const firstTouch = await inputOn(decisions);
  // Past the overlay's throttle, then the tab's next beat says the new input.
  await decisions.waitForTimeout(5100);
  await touchInside(decisions, decisionFrame);
  await until(
    "a later touch inside the page to move the last input on",
    () => inputOn(decisions),
    (at) => at !== firstTouch,
    40_000
  );
  check("15: a later touch inside it moves their last input on", true);
  await decisions.close();

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
  await fleet.api((hub) =>
    hub.api.instances({ id: chat }).artifacts.post({
      kind: "page",
      does: "judge",
      title: "Probe judge artifact",
      ask: "Judge the page",
      name: "beside",
      html: '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Beside</title></head><body><h1>Beside</h1><input aria-label="Field"></body></html>',
    })
  );
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

  // 16. The same inside the preview, on a tab of its own with no input.
  const previewTab = await tabOn(kit, base, chat);
  const previewFrame = previewTab.locator(`${PANE} iframe`).first();
  await (
    await previewFrame.contentFrame()
  )
    .locator("h1")
    .waitFor({ timeout: 60_000 });
  check(
    "16: setup: a tab with the preview open and no input has said none",
    (await inputOn(previewTab)) === null
  );
  await touchInside(previewTab, previewFrame);
  await until(
    "the touch inside the preview to reach the hub",
    () => inputOn(previewTab),
    (at) => at !== null,
    20_000
  );
  check("16: a touch inside a preview is input on its tab", true);
  await previewTab.close();

  // 17. Inside a preview embedded in a decision page: the pointer lands in the
  // embed alone, so the decision page's own window hears nothing of it.
  const folder = join(fleet.sandbox, "embedded");
  await mkdir(folder, { recursive: true });
  await Bun.write(
    join(folder, "index.html"),
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${EMBED_WORD}</title></head><body style="min-height:100vh"><h1>${EMBED_WORD}</h1></body></html>`
  );
  const folderPreview = await fleet.api((hub) =>
    hub.api.instances({ id: conversation }).artifacts.post({
      kind: "preview",
      does: "try",
      title: "Probe try artifact",
      ask: "Try the folder",
      name: "embedded-folder",
      dir: folder,
    })
  );
  await fleet.api((hub) =>
    hub.api.instances({ id: conversation }).artifacts.post({
      kind: "page",
      does: "pick",
      title: "Probe pick artifact",
      ask: "Pick the word",
      name: EMBED_PAGE,
      program: EMBED_PROGRAM(folderPreview.id),
    })
  );
  const embedTab = await kit.page("desk");
  await open(
    embedTab,
    `${base}/project/${project.id}?view=decisions&page=${EMBED_PAGE}`,
    '[data-slot="decisions"] iframe'
  );
  const hostFrame = embedTab.frameLocator('[data-slot="decisions"] iframe');
  const embed = hostFrame.locator(EMBED_FRAME).first();
  await embed.scrollIntoViewIfNeeded({ timeout: 60_000 });
  const inEmbed = await embed.contentFrame();
  await inEmbed.locator("h1").waitFor({ timeout: 60_000 });
  const counting = () => {
    const held = window as unknown as { probeMoves?: number };
    held.probeMoves = 0;
    addEventListener(
      "pointermove",
      (event) => {
        const { movementX, movementY } = event as PointerEvent;
        if (movementX !== 0 || movementY !== 0) {
          held.probeMoves = (held.probeMoves ?? 0) + 1;
        }
      },
      { capture: true }
    );
  };
  const counted = () =>
    (window as unknown as { probeMoves?: number }).probeMoves ?? 0;
  const inHost = hostFrame.locator("body");
  await inEmbed.locator("body").evaluate(counting);
  await inHost.evaluate(counting);
  check(
    "17: setup: a decision page with a live embed and no input has said none",
    (await inputOn(embedTab)) === null
  );
  // Chromium hands a pointer to a frame nested in another origin's frame some
  // moves after it enters, one here and two on a loaded machine, and the
  // decision page hears those. So the pointer is handed over first: moved a
  // few px at a time inside the embed until the embed hears a move of its
  // own. What the leg reads is what comes after.
  const box = await embed.boundingBox();
  if (!box) {
    throw new Error("the embed has no box to touch");
  }
  await embedTab.bringToFront();
  const [x, y] = [box.x + box.width / 2, box.y + box.height / 2];
  const movesNow = async () => ({
    embed: await inEmbed.locator("body").evaluate(counted),
    host: await inHost.evaluate(counted),
  });
  await embedTab.mouse.move(x, y);
  const handFrom = Date.now();
  let step = 0;
  let handed = await movesNow();
  while (handed.embed === 0 && step < 10 && Date.now() - handFrom < 2000) {
    step += 1;
    await embedTab.mouse.move(x + 4 * step, y + 4 * step);
    handed = await movesNow();
  }
  check(
    "17: setup: the pointer is handed over to the embed",
    handed.embed > 0,
    `after ${step} move(s): ${handed.embed} in the embed, ${handed.host} in the decision page`
  );
  // What the hand-over said reaches the hub as the tab's first input; past
  // the overlay's throttle (5 s), the leg's own moves say theirs.
  const handedInput = await until(
    "the hand-over's input to reach the hub",
    () => inputOn(embedTab),
    (at) => at !== null,
    20_000
  );
  await embedTab.waitForTimeout(5100);
  const before = await movesNow();
  for (const more of [1, 2, 3]) {
    await embedTab.mouse.move(x + 4 * (step + more), y + 4 * (step + more));
  }
  const after = await movesNow();
  check(
    "17: setup: the pointer moved in the embed, and the decision page around it heard nothing",
    after.embed > before.embed && after.host === before.host,
    `${after.embed - before.embed} move(s) in the embed, ${after.host - before.host} in the decision page`
  );
  await until(
    "the moves inside the embedded preview to move the tab's last input on",
    () => inputOn(embedTab),
    (at) => at !== null && handedInput !== null && at > handedInput,
    40_000
  );
  check(
    "17: a touch inside a preview embedded in a decision page is input on its tab",
    true
  );
  await embedTab.close();

  // 18. Inside a canvas on the panel's stage, on a tab of its own.
  await fleet.api((hub) =>
    hub.api.instances({ id: other }).artifacts.post({
      kind: "canvas",
      does: "draw",
      title: "Probe draw artifact",
      ask: "Draw on this canvas",
      name: "touched-canvas",
    })
  );
  const canvasTab = await tabOn(kit, base, other);
  const canvasFrame = canvasTab.locator(CANVAS_FRAME).first();
  await (
    await canvasFrame.contentFrame()
  )
    .locator(".canvas-host .excalidraw")
    .waitFor({ timeout: 60_000 });
  check(
    "18: setup: a tab with a canvas on its stage and no input has said none",
    (await inputOn(canvasTab)) === null
  );
  await touchInside(canvasTab, canvasFrame);
  await until(
    "the touch inside the canvas to reach the hub",
    () => inputOn(canvasTab),
    (at) => at !== null,
    20_000
  );
  check(
    "18: a touch inside a canvas on the panel's stage is input on its tab",
    true
  );
  await canvasTab.close();
  await hubAt(fleet.base).api.instances({ id: other }).preview.delete();

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
  await second.goto(`${base}/project/${project.id}`, {
    waitUntil: "domcontentloaded",
  });
  // An empty board opens his panel by itself; a press there would put it away.
  const panel = second.locator("[data-caw-panel]");
  const seat = second.locator('[data-slot="caw-seat"]').first();
  await seat.waitFor({ timeout: 60_000 });
  await panel.waitFor({ timeout: 5000 }).catch(() => seat.click());
  await panel.waitFor({ timeout: 60_000 });
  // His pages from legs 15 and 17 stand open from before this page came:
  // no show, so the panel opens on his conversation (client `revealPreview`
  // only after the first read), Preview beside it in the switch, which
  // stands once they are read.
  await panel
    .locator('[data-slot="caw-tabs"]')
    .first()
    .waitFor({ timeout: 60_000 });
  const cameTo = await panel.getAttribute("data-caw-tab");
  check(
    "7: his panel opens on Assistant, the pages he showed before the load standing open",
    cameTo === "assistant",
    `data-caw-tab=${cameTo}`
  );
  await touch(second);
  await shows(
    conversation,
    "the project's page to say it draws its conversation"
  );
  check(
    "7: a project's conversation that holds no words is drawn as a conversation: its pane, its empty state",
    (await panel.locator('[data-slot="pane"] [data-slot="empty"]').count()) ===
      1,
    (await panel.innerText()).slice(0, 400)
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
    (
      Reflect.get(globalThis, "__cawcoHub") as
        { socket: WebSocket | null } | undefined
    )?.socket?.close()
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
    hubAt(fleet.base).api.presence.post({
      clientId: "probe-phone",
      client: "ios",
      sessionId: other,
      active: true,
      saidAt,
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
  await hubAt(fleet.base).api.presence.post({
    clientId: "probe-phone",
    client: "ios",
    sessionId: null,
    active: false,
    saidAt: Date.now(),
  });
  await touch(tab);

  // 11. A message of theirs the turn left with no reply.
  await say(chat, `${SILENT}-on`);
  const owedOn = await background(chat);
  reads(
    "11: a turn that gave him no reply leaves the message owed: on this chat, the send says so",
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

  // 14. While one is owed, no_reply_needed is refused, and allowed after an answer.
  // Read by the words that woke the call, never counted: a request can read an
  // earlier refusal again after its turn has ended, its conversation stopping
  // there, so a count moves with no new call.
  const refusedOn = (tag: string) =>
    fleet.seen.some((one) => isRefusal(one) && one.all.includes(tag));
  const owedCleared = () =>
    fleet.query<{ open: number }>(
      "SELECT count(*) AS open FROM sent_messages WHERE instance_id = ? AND answered_at IS NULL AND json_extract(body, '$.origin.kind') = 'human'",
      chat
    )[0]?.open === 0;
  const ownTag = `${ANSWERS}-own`;
  await say(chat, ownTag);
  check(
    "14: on his own message, no_reply_needed is refused with its words, and the model goes on",
    refusedOn(ownTag) && owedCleared()
  );
  await say(chat, `${SILENT}-woken`);
  const wakeTag = `PROBE-BACKGROUND-${tags + 1} `;
  const wakesOwed = await background(chat, ` ${SILENT}`);
  check(
    "14: a turn that wrote nothing after the refusal leaves him owed: the next send says so",
    wakesOwed.includes(OWED),
    wakesOwed.slice(-400)
  );
  check(
    "14: a send that wakes the session while he is owed: no_reply_needed is refused",
    refusedOn(wakeTag)
  );
  const allowedTag = `PROBE-BACKGROUND-${tags + 2} `;
  await background(chat);
  await background(chat, ` ${SILENT}`);
  const stepsAfter = fleet.seen.filter(
    (one) => one.afterTool && one.all.includes(allowedTag)
  ).length;
  check(
    "14: after an answer, no_reply_needed is allowed and ends the turn at the call",
    !refusedOn(allowedTag) && stepsAfter === 0,
    `refused: ${refusedOn(allowedTag)}, ${stepsAfter} model step(s) after the call`
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
  await fleet.api((hub) => hub.api.person.away.post({ on: true }));
  const owedAway = await background(other);
  check(
    "11: away, the send reads away, and owed",
    owedAway.includes(AWAY_HEAD) && owedAway.includes(OWED),
    owedAway.slice(-400)
  );
  await fleet.api((hub) => hub.api.person.away.post({ on: false }));
};

const spec: Spec = {
  group: "The hub and machines",
  name: "chat-presence",
  run,
};
export default spec;
