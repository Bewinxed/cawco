/**
 * Web: every surface that shows a session's plan reads the hub's plan
 * (`GET /api/instances/:id/plan` and the live plan frames: snapshot, delta,
 * resync), and none reads the machine's task ledger (`getTodos` from the
 * page is gone with tasks.svelte.ts). The board's peek draws the plan with
 * PlanTree, the plan panel's own rows.
 *
 * A scratch fleet (real hub, agent and sessiond, Claude Code against the
 * mock model) with "CawCo's to-dos" on. The session calls `todo_write` with
 * four steps, one nested under another. Then, on an upright tablet (the
 * home is the page there, and the wide layout peeks):
 *
 * 1. Peeked from the home's row, the peek draws the hub's steps: the same
 *    words, depths and statuses in order, under "Plan · 1 of 4".
 * 2. The session ticks the step under way: the peek, never reloaded, holds
 *    it completed, the same as the hub's `/plan` after, under "Plan · 2 of 4".
 * 3. The session's page: its ring opens the plan panel, which draws the same
 *    steps through the same rows.
 * 4. Nothing the page sent on its socket asked a machine for `getTodos`.
 *
 *   bun scripts/probe-kit/run.ts plan-peek
 */
import type { Page } from "playwright-core";
import { type Reply, type Seen, until } from "../../scratch-fleet";
import type { Kit, Spec } from "../kit";

const COMMAND = /PROBE-CALL:(\d+)/g;
const TODO_WRITE = "mcp__cawco__todo_write";
const STEPS = [
  { id: "read", content: "Read the card", status: "completed" },
  { id: "build", content: "Build the tone prop", status: "in_progress" },
  { id: "cut", content: "Cut the enum", status: "pending", depth: 1 },
  { id: "ship", content: "Ship it", status: "pending" },
];
const PEEK_PLAN = '[data-peek-sheet] [data-slot="peek-plan"]';
/** The plan panel's column, beside the conversation or in its sheet: its parts, the steps' tree first. */
const PANE_PLAN = '[data-slot="body"]:has(> ul[data-slot="rows"])';

const asks = new Map<string, { input: object; name: string }>();
const issued = new Set<string>();
const answered = new Map<string, string>();
const answeredAt = new Map<string, number>();

const respond = (request: Seen): Reply => {
  const text = (words: string): Reply => ({ everyMs: 5, words: [words] });
  if (!request.tools) {
    return text("Probe title");
  }
  const marker = [...request.all.matchAll(COMMAND)].at(-1)?.[1];
  const ask = marker ? asks.get(marker) : undefined;
  if (!(marker && ask)) {
    return text("ok");
  }
  if (issued.has(marker)) {
    if (!answered.has(marker)) {
      answered.set(marker, request.last);
      answeredAt.set(marker, Date.now());
    }
    return text("done");
  }
  if (request.toolNames.includes(ask.name)) {
    issued.add(marker);
    return { everyMs: 5, words: [], tool: ask };
  }
  return request.toolNames.includes("ToolSearch")
    ? {
        everyMs: 5,
        words: [],
        tool: {
          name: "ToolSearch",
          input: { query: `select:${ask.name}`, max_results: 1 },
        },
      }
    : text(`${ask.name} is not offered`);
};

interface HubPlan {
  steps: { content: string; depth: number; status: string }[];
}

/** A plan's steps as one line: `words:depth:status`, in order. */
const said = (plan: HubPlan) =>
  plan.steps
    .map((step) => `${step.content}:${step.depth}:${step.status}`)
    .join(",");

/** The rows drawn under `root` as the same line: depth is the rows they hang under. */
const drawn = (page: Page, root: string): Promise<string> =>
  page.evaluate((selector) => {
    const box = document.querySelector(selector);
    if (!box) {
      return "";
    }
    return [...box.querySelectorAll("li[data-status]")]
      .map((li) => {
        let depth = 0;
        for (
          let up = li.parentElement?.closest("li");
          up && box.contains(up);
          up = up.parentElement?.closest("li")
        ) {
          depth += 1;
        }
        const words = li.querySelector(
          ':scope > [data-slot="row"] [data-slot="text"]'
        );
        return `${words?.textContent?.trim()}:${depth}:${li.getAttribute("data-status")}`;
      })
      .join(",");
  }, root);

/** The peek's plan heading. */
const heading = (page: Page): Promise<string> =>
  page.evaluate(
    (selector) =>
      document
        .querySelector(selector)
        ?.previousElementSibling?.textContent?.replace(/\s+/g, " ")
        .trim() ?? "",
    PEEK_PLAN
  );

/** Records every frame the page sends on a WebSocket, before its own scripts run. */
function recordSends(): void {
  const sent: string[] = [];
  (window as unknown as { probeSent: string[] }).probeSent = sent;
  const { send } = WebSocket.prototype;
  WebSocket.prototype.send = function (
    this: WebSocket,
    data: Parameters<WebSocket["send"]>[0]
  ) {
    if (typeof data === "string") {
      sent.push(data);
    }
    return send.call(this, data);
  };
}

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
  // "CawCo's to-dos" on: the session's steps are its todo_write list.
  const choices = await fetch(`${fleet.base}/api/fleet/choices`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ todos: true }),
  });
  if (
    !kit.check(
      "0a: CawCo's to-dos are on",
      choices.ok,
      `${choices.status} ${await choices.text()}`
    )
  ) {
    return;
  }
  const session = await fleet.spawn("claude", "Plan", fleet.repo);
  let n = 0;
  const call = async (input: object) => {
    n += 1;
    const marker = String(n);
    asks.set(marker, { name: TODO_WRITE, input });
    await fleet.send(session, `PROBE-CALL:${marker}`);
    await until(
      `${TODO_WRITE}'s answer (${marker})`,
      () => answered.get(marker),
      Boolean,
      240_000
    );
    return answeredAt.get(marker) ?? Date.now();
  };
  await call({ steps: STEPS });
  const hubPlan = await fleet.api<HubPlan>(`/api/instances/${session}/plan`);
  if (
    !kit.check(
      "0: the hub's plan holds the four steps, one nested",
      said(hubPlan) ===
        "Read the card:0:completed,Build the tone prop:0:in_progress,Cut the enum:1:pending,Ship it:0:pending",
      JSON.stringify(hubPlan).slice(0, 400)
    )
  ) {
    return;
  }

  const dashboard = await fleet.dashboard();
  const page = await kit.page("tablet", { init: [recordSends] });
  page.setDefaultTimeout(60_000);
  await page.goto(`${dashboard}/session`, { waitUntil: "domcontentloaded" });

  // 1. The peek, from the home's row.
  // Its turn over, the session is listed under Finished.
  const main = page.locator("#main-content");
  await main.getByRole("tab", { name: "Finished" }).click();
  await main.locator("button[data-session-row-peek]").first().click();
  await page.waitForSelector(`${PEEK_PLAN} li[data-status]`);
  const peeked = await until(
    "the peek's plan",
    () => drawn(page, PEEK_PLAN),
    (line) => line === said(hubPlan),
    30_000
  ).catch(() => drawn(page, PEEK_PLAN));
  const firstHead = await heading(page);
  await page.screenshot({ path: `${kit.out}/plan-peek-before.png` });
  kit.check(
    "1: the peek draws the hub's steps: words, depths and statuses in order, under Plan · 1 of 4",
    peeked === said(hubPlan) && firstHead === "Plan · 1 of 4",
    `peek: ${peeked || "nothing"} under "${firstHead}"; hub: ${said(hubPlan)}`
  );

  // 2. A tick, heard from the hub's delta: the page is never reloaded.
  const tickedAt = await call({
    steps: STEPS.map((step) =>
      step.id === "build" ? { ...step, status: "completed" } : step
    ),
  });
  const ticked = await until(
    "the tick in the peek",
    () => drawn(page, PEEK_PLAN),
    (line) => line.includes("Build the tone prop:0:completed"),
    30_000
  ).catch(() => drawn(page, PEEK_PLAN));
  const landedAt = Date.now();
  const hubAfter = await fleet.api<HubPlan>(`/api/instances/${session}/plan`);
  const tickHead = await heading(page);
  const navigations = await page.evaluate(
    () => performance.getEntriesByType("navigation").length
  );
  await page.screenshot({ path: `${kit.out}/plan-peek-after.png` });
  kit.check(
    "2: the session's tick reaches the open peek without a reload, the same as the hub's plan after, under Plan · 2 of 4",
    ticked === said(hubAfter) &&
      said(hubAfter).includes("Build the tone prop:0:completed") &&
      tickHead === "Plan · 2 of 4" &&
      navigations === 1,
    `peek (seen within ${landedAt - tickedAt}ms of the tool's answer): ${ticked} under "${tickHead}"; hub: ${said(hubAfter)}; navigations ${navigations}`
  );

  // 3. The plan panel, on the session's page, through the same rows. What
  // the board's page sent is read first: the next page starts its own log.
  const sentOnBoard = await page.evaluate(
    () => (window as unknown as { probeSent: string[] }).probeSent
  );
  await page.keyboard.press("Escape");
  await page.goto(`${dashboard}/session/${session}`, {
    waitUntil: "domcontentloaded",
  });
  await page.locator('[data-slot="plan-ring"]').first().click();
  await page.waitForSelector(`${PANE_PLAN} li[data-status]`);
  const pane = await until(
    "the plan panel",
    () => drawn(page, PANE_PLAN),
    (line) => line === said(hubAfter),
    30_000
  ).catch(() => drawn(page, PANE_PLAN));
  kit.check(
    "3: the session's plan panel draws the same steps through the same rows",
    pane === said(hubAfter),
    `panel: ${pane || "nothing"}; hub: ${said(hubAfter)}`
  );

  // 4. No machine was asked for its ledger.
  const sent = [
    ...sentOnBoard,
    ...(await page.evaluate(
      () => (window as unknown as { probeSent: string[] }).probeSent
    )),
  ];
  const ledger = sent.filter((frame) => frame.includes("getTodos"));
  kit.check(
    "4: nothing the page sent asked a machine for getTodos",
    sent.length > 0 && ledger.length === 0,
    `${sent.length} frames sent, ${ledger.length} with getTodos${ledger[0] ? `: ${ledger[0].slice(0, 200)}` : ""}`
  );
};

const spec: Spec = { name: "plan-peek", run };
export default spec;
