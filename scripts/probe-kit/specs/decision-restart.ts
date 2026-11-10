/**
 * What the person writes on a decision page reaches the hub across a hub
 * restart and while it is down (owner, 2026-11-05: his picks on a decision
 * page open in his panel were lost after the hub restarted for a nightly;
 * the page said "Not sent: Its link to p-3487.bewinxed.com closed (code
 * 1006)." and the hub's doc never held them).
 *
 * On a scratch fleet (real hub, agent and sessiond; Claude Code against the
 * mock model), the page shown in its session's panel on host mode's names
 * (`https://p-{port}.localtest.me:<front>`) behind a Cloudflare-like front
 * answering https, the dashboard behind one of its own under the same
 * domain, as the owner's tunnel serves both (pass-legs `passTunnel`). Each
 * leg stops the hub, keeps it down past the pane's grace (PreviewPane
 * `LINK_DOWN_MS`, so the page's link stands down as his did), and reads the
 * hub's doc through its API, as `artifact_read` does:
 *
 * 1. Started again, a pick made at once (no wait for the link) is in the
 *    hub's doc within {@link REACH_MS}, with no Send pressed.
 * 2. Started again, a pick and the page's own Send (`cawco.send`) made at
 *    once: the Send resolves, and the hub's doc holds the pick and a
 *    `sentAt`.
 * 3. While it is down, the pane says the comments aren't reaching the agent
 *    (its Comments control's `data-link-down`), and a pick made then stays
 *    marked on the page; started again, the pick is in the hub's doc within
 *    {@link REACH_MS}, nothing pressed.
 * 4. A pick and the page's Send made while it is down, the hub started
 *    again {@link PRESS_DOWN_MS} later: the Send is held and resolves once
 *    it is back, no error to retry, and the doc holds the pick and a newer
 *    `sentAt`.
 *
 * 5. Every question answered, the hub's own send gone (the page's Send says
 *    Sent), then a press: it resolves, Send still says Sent, and no error
 *    stands in the pane (hub artifacts/sync.ts: a Send with nothing new
 *    reads as sent on the page's own route).
 *
 * Every leg runs in the frame the page first loaded in: a restart keeps the
 * show's revision (hub db `shown_previews.revision`), so no panel loads its
 * page again and no press in it is lost (r453: "Frame was detached" in leg 2,
 * the restored show's new revision a new frame).
 *
 *   bun scripts/probe-kit/run.ts decision-restart
 */
import type { Frame, Page } from "playwright-core";
import { type Reply, type Seen, until } from "../../scratch-fleet";
import { ToolCalls } from "../../tool-calls";
import { open } from "../kit";
import {
  PASS_DOMAIN,
  PASS_HOSTS,
  passPattern,
  passTunnel,
  storeHostMode,
} from "../pass-legs";
import type { Kit, Spec } from "../spec";

const CREATE = "mcp__cawco__artifact_create";
const ANSWERED_ID = /"id":"([0-9a-f-]{36})"/u;
/** Past PreviewPane `LINK_DOWN_MS`: the page's link stands down, as the owner's did. */
const DOWN_MS = 13_000;
/** How long a pick has to reach the hub's doc once it is up. Our call: y-websocket's backoff tops at 2.5 s, a sync takes one round. */
const REACH_MS = 20_000;
/** How long the hub stays down under a held Send (leg 4): a nightly's restart, about 6 s on the owner's machine. */
const PRESS_DOWN_MS = 6000;
const PANE = ':is([data-slot="preview-pane"], [data-side-card="preview"])';
/** The pane's word that the page's link is down (PreviewPane `linkDown`). */
const DOWN = `${PANE} button[data-slot="comments"][data-link-down]`;

/** A decision page of one card: answered by one pick, so the hub sends it by itself once his changes stand quiet (artifacts/service.ts `sendAnswered`). */
const PROGRAM = `root = Decisions("How the rail closes", [close])
close = Decision("rail-close", "How does the rail close?", [a, b], "Either reads.", [], [], false, null, "behaviour")
a = Option("a", "Its own close", "A close on the rail.", true, [], "One more control.")
b = Option("b", "The head's close", "The panel head closes it.", false, [], "Further to reach.")`;
/** The page's own Send, in its foot. */
const SEND = '[data-slot="page-foot"] [data-send]';
/** The pane's own failure line, where a refused Send of the page's is said. */
const FAILURE = `${PANE} [data-pane-failure]`;

const calls = new ToolCalls();

const respond = (request: Seen): Reply => {
  const text = (words: string): Reply => ({ everyMs: 5, words: [words] });
  if (!request.tools) {
    return text("Probe title");
  }
  return calls.reply(request) ?? text("ok");
};

/** The page's frame in the panel: the one on a preview name. */
const pageFrame = (tab: Page) =>
  until(
    "the page in its frame",
    () =>
      tab.frames().find((one) => {
        try {
          return new URL(one.url()).hostname.endsWith(`.${PASS_DOMAIN}`);
        } catch {
          return false;
        }
      }),
    Boolean,
    60_000
  );

/** The options the page marks picked. */
const marked = (frame: Frame): Promise<string> =>
  frame
    .locator("[data-option][data-cawco-picked]")
    .evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute("data-option") ?? "").join()
    )
    .catch(() => "");

const run = async (kit: Kit) => {
  const fleet = await kit.fleet(respond);
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.launch("agent");
  await fleet.agentUp();
  await fleet.accountSignedIn();
  const base = await fleet.dashboard();
  const range = await fleet.api((hub) => hub.api["preview-settings"].get());
  const first = Number(range.ports.split("–")[0]);
  const tunnel = await passTunnel(kit.out, first, base);
  await storeHostMode(fleet, passPattern("{port}", tunnel.front));

  const session = await fleet.spawn("claude", "Restart", fleet.repo);
  const created = await calls.call(fleet, session, CREATE, {
    response_format: "detailed",
    kind: "page",
    does: "pick",
    title: "How the rail closes",
    ask: "Pick how the rail closes",
    name: "rail-close",
    program: PROGRAM,
  });
  const id = String(created).match(ANSWERED_ID)?.[1];
  if (!id) {
    kit.check("0: the page is made", false, String(created).slice(0, 300));
    return;
  }
  const read = () =>
    fleet.api((hub) =>
      hub.api.instances({ id: session }).artifacts({ artifact: id }).view.get()
    );
  const pickOf = async () =>
    (await read()).choices["rail-close"]?.options?.join() ?? "";

  const tab = await kit.page("desk", {
    ignoreHTTPSErrors: true,
    hostRules: PASS_HOSTS,
  });
  const said: string[] = [];
  tab.on("console", (message) => {
    if (message.type() === "error") {
      said.push(message.text());
    }
  });
  await open(tab, `${tunnel.board}/session/${session}`, PANE);
  // The one frame the page loaded in: no restart loads it again, so a press
  // in it is never lost to a new frame.
  const frame = await pageFrame(tab);
  await frame.locator('[data-option="a"]').waitFor();
  const kept = () => (frame.isDetached() ? "loaded again" : "kept");
  /** What the page's Send says, its words alone. */
  const sendSays = async () =>
    (
      await frame
        .locator(SEND)
        .textContent({ timeout: 1000 })
        .catch(() => null)
    )
      ?.replace(/\s+/gu, " ")
      .trim() ?? null;
  const pick = (option: string) =>
    frame.locator(`[data-option="${option}"]`).click({ timeout: 10_000 });
  const reached = (option: string, within = REACH_MS) =>
    until(
      `the hub's doc holding ${option}`,
      pickOf,
      (now) => now === option,
      within
    )
      .then(() => true)
      .catch(() => false);
  /** The page's own Send (`cawco.send`), as its Send button calls it: how it ended. */
  const press = () =>
    frame
      .evaluate(() =>
        (
          window as unknown as { cawco: { send: () => Promise<void> } }
        ).cawco.send()
      )
      .then(
        () => "resolved",
        (error: unknown) => `refused: ${String(error).slice(0, 300)}`
      );
  const sends: string[] = [];
  tab.on("request", (request) => {
    if (request.method() === "POST" && request.url().endsWith("/send")) {
      sends.push(request.url());
    }
  });
  const restart = async () => {
    await fleet.stop("hub");
    await tab.waitForTimeout(DOWN_MS);
    fleet.launch("hub");
    await fleet.hubUp();
  };

  // 1. A pick at once after a restart, no Send.
  await restart();
  const before1 = said.length;
  await pick("b");
  const one = await reached("b");
  kit.check(
    "1: a pick made as the hub comes back reaches its doc with no Send, in the page as it was loaded",
    one && sends.length === 0 && !frame.isDetached(),
    `hub holds "${await pickOf()}"; page marks "${await marked(frame)}", ${kept()}; sends ${sends.length}; said: ${said.slice(before1).slice(-4).join(" | ") || "nothing"}`
  );

  // 2. A pick and the page's Send at once after a restart.
  await restart();
  const before2 = said.length;
  await pick("a");
  const pressed = await press();
  const two = await reached("a");
  const sent = (await read()).sentAt;
  kit.check(
    "2: a pick and Send made as the hub comes back: the Send goes, and the doc holds the pick and its sentAt",
    pressed === "resolved" && two && sent !== null && !frame.isDetached(),
    `send ${pressed}; hub holds "${await pickOf()}", sentAt ${sent}; page ${kept()}; said: ${said.slice(before2).slice(-4).join(" | ") || "nothing"}`
  );

  // 3. A pick while the hub is down: said, kept, delivered once it is back.
  await fleet.stop("hub");
  const toldDown = await until(
    "the pane saying the link is down",
    () => tab.locator(DOWN).count(),
    (count) => count > 0,
    30_000
  )
    .then(() => true)
    .catch(() => false);
  await pick("b");
  await tab.waitForTimeout(2000);
  const keptWhileDown = await marked(frame);
  fleet.launch("hub");
  await fleet.hubUp();
  const three = await reached("b");
  kit.check(
    "3: with the hub down the pane says so and the page keeps the pick; once the hub is back the pick is in its doc, nothing pressed",
    toldDown && keptWhileDown === "b" && three && !frame.isDetached(),
    `said down ${toldDown}; page marks "${keptWhileDown}", ${kept()}; hub holds "${await pickOf()}"`
  );

  // 4. Send pressed while the hub restarts: held, and it goes once the hub is back.
  const sentBefore = (await read()).sentAt;
  await fleet.stop("hub");
  await pick("a");
  const pressing = press();
  await tab.waitForTimeout(PRESS_DOWN_MS);
  fleet.launch("hub");
  await fleet.hubUp();
  const pressedDown = await pressing;
  const four = await reached("a");
  const sentAfter = (await read()).sentAt;
  kit.check(
    "4: a Send pressed while the hub is down goes once it is back, no error to retry: the doc holds the pick and a newer sentAt",
    pressedDown === "resolved" &&
      four &&
      sentAfter !== null &&
      sentAfter !== sentBefore &&
      !frame.isDetached(),
    `send ${pressedDown}; hub holds "${await pickOf()}", sentAt ${sentBefore} → ${sentAfter}; page ${kept()}`
  );

  // 5. A press after the hub's own send: already sent, so it reads as sent.
  const sentByPress = (await read()).sentAt;
  await pick("b");
  const hubSent = await until(
    "the hub's own send of the answered page",
    async () => (await read()).sentAt,
    (at) => at !== null && at !== sentByPress,
    REACH_MS
  ).catch(() => null);
  const spentBefore = await until(
    "the page's Send saying Sent",
    () => sendSays(),
    (words) => words === "Sent",
    REACH_MS
  ).catch(() => sendSays());
  const pressedSpent = await press();
  await tab.waitForTimeout(2000);
  const failures = await tab.locator(FAILURE).allTextContents();
  const spentAfter = await sendSays();
  kit.check(
    "5: every question answered and the hub's own send gone, a press reads as sent: it resolves, the Send still says Sent, and no error stands",
    hubSent !== null &&
      spentBefore === "Sent" &&
      pressedSpent === "resolved" &&
      spentAfter === "Sent" &&
      failures.length === 0,
    `hub's send ${hubSent ?? "none"}; Send said "${spentBefore}", then "${spentAfter}"; press ${pressedSpent}; failure ${failures.join(" | ") || "none"}`
  );
  tunnel.stop();
};

const spec: Spec = {
  group: "Previews, pages and comments",
  name: "decision-restart",
  run,
};
export default spec;
