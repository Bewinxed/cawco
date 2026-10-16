/**
 * Turning Caw off over what he started (The Stay In Context Rule), and the
 * forget it shares its tray with, on a scratch fleet (real hub, agent and
 * sessiond; Claude Code against the mock model) in the built dashboard at
 * the desk, read from the page's own words and the hub's answers. The
 * sessions he started are sessions spawned under his (a delegate's row,
 * nested under him), so no workspace is needed. Every question is the
 * running-sessions tray in the page (StopTray, `data-stop-tray`): in his
 * panel under the switch, under the head's ⋯ for forget. In order:
 *
 * 0. Caw, a Claude lead, starts with keep-alive on (caw.ts `startLead`):
 *    his context is the project's history, kept warm under keep-alive's cap.
 * 1. His settings popover (the head's ⋯ › Caw settings…) stands in the
 *    glass card's frame (web/caw-seat-pop's check); nothing he started runs: the switch flips at once, no tray.
 * 2. Only his own turn (a routine's) runs: one line under the switch, no
 *    tray; "Stop now" turns him off once the hub says the turn stopped.
 * 3. Two sessions he started run: the tray names both; "Stop 2 and turn Caw
 *    off", armed "Stop 2 mid-turn and turn Caw off", "Stopping …", then
 *    "Caw is off" with "Stopped 2 sessions."; the hub has him off and both
 *    sessions ended.
 * 4. One runs on a machine that is away: its row says "Stops when … is
 *    back", the stop is recorded (the tray ends saying so), and the session
 *    ends once its machine is back.
 * 5. "Let them finish": he is off, the session runs on, and his panel says
 *    "Off · 1 of his still finishing".
 * 6. Forget, on the same tray, as before: "Stop N and forget", armed "Stop N
 *    mid-turn and forget", then "Forgotten", and the project is gone.
 *
 *   bun scripts/probe-kit/run.ts caw-off
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Page } from "playwright-core";
import { MACHINE, type Reply, type Seen, until } from "../../scratch-fleet";
import { type Kit, open, type Spec, settle } from "../kit";
import { checkCawSeatPop, openCawSettings } from "./web/caw-seat-pop";

const CAW = "You are Caw";
const text = (words: string): Reply => ({ everyMs: 5, words: [words] });

const respond = (request: Seen): Reply => {
  if (!request.tools) {
    return text("Probe title");
  }
  // A routine's turn that lasts: forty seconds of words.
  if (request.all.includes(CAW) && request.last.includes("PROBE-SLOW-TURN")) {
    return { everyMs: 2000, words: Array.from({ length: 20 }, () => "… ") };
  }
  return text("ok");
};

/**
 * Every distinct confirm label and tray line the page shows, in order, and
 * `probeShown`: the words a node shows. A kit Button keeps its label and its
 * pending label both in the page, the one not shown `aria-hidden` (the
 * cross-fade, pending-content.svelte), as MorphText keeps its letters
 * hidden beside a plain copy; `textContent` runs them together ("Stop 2 and
 * turn Caw offTurning Caw off…"), so the shown words skip hidden subtrees.
 */
const RECORD = () => {
  const seen: string[] = [];
  const shown = (node: Element | null): string => {
    if (!node) {
      return "";
    }
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
    let words = "";
    for (let run = walker.nextNode(); run; run = walker.nextNode()) {
      if (!run.parentElement?.closest('[aria-hidden="true"]')) {
        words += run.textContent ?? "";
      }
    }
    return words.replace(/\s+/g, " ").trim();
  };
  const probe = window as unknown as {
    probeSeen: string[];
    probeShown: (node: Element | null) => string;
  };
  probe.probeSeen = seen;
  probe.probeShown = shown;
  const note = () => {
    for (const node of document.querySelectorAll(
      "[data-stop-confirm], [data-stop-tray] p.line"
    )) {
      const words = shown(node);
      if (words && seen.at(-1) !== words && !seen.includes(words)) {
        seen.push(words);
      }
    }
  };
  new MutationObserver(note).observe(document, {
    subtree: true,
    childList: true,
    characterData: true,
  });
};

/** The words the tray's confirm shows (RECORD's `probeShown`). */
const confirmWords = (page: Page) =>
  page.evaluate(() =>
    (
      window as unknown as { probeShown: (node: Element | null) => string }
    ).probeShown(document.querySelector("[data-stop-confirm]"))
  );

/** Waits until the tray's confirm shows `words`, or contains them with `part`. */
const confirmShows = (page: Page, words: string, part = false) =>
  page.waitForFunction(
    ({ want, contains }) => {
      const now = (
        window as unknown as { probeShown: (node: Element | null) => string }
      ).probeShown(document.querySelector("[data-stop-confirm]"));
      return contains ? now.includes(want) : now === want;
    },
    { want: words, contains: part },
    { timeout: 60_000 }
  );

const seenOn = (page: Page) =>
  page.evaluate(
    () => (window as unknown as { probeSeen?: string[] }).probeSeen ?? []
  );

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

  const home = fleet.env.HOME as string;
  const src = join(fleet.sandbox, "src");
  await mkdir(src, { recursive: true });
  await writeFile(
    join(home, ".gitconfig"),
    "[user]\n\tname = Owner\n\temail = owner@probe.test\n"
  );
  await Bun.$`git init -q -b main && echo caw > README.md && git add -A && git commit -qm 'First commit'`
    .cwd(src)
    .env({ ...process.env, HOME: home })
    .quiet();
  const project = await fleet.api<{ id: string; name: string }>(
    "/api/projects",
    { name: "Caw off", machineId: MACHINE, cwd: src, caw: true }
  );
  // A task on the board: Caw sits in the head (his seat), not over it.
  await fleet.api(`/api/projects/${project.id}/tasks`, { title: "A task" });
  await fleet.api(`/api/projects/${project.id}/threads`, { body: "Hello" });
  const leadId = await until(
    "Caw's session",
    () =>
      fleet.query<{ lead_instance_id: string | null }>(
        "SELECT lead_instance_id FROM projects WHERE id = ?",
        project.id
      )[0]?.lead_instance_id ?? undefined,
    Boolean,
    180_000
  );
  // 0. Caw starts kept warm.
  const [lead] = fleet.query<{ harness: string; keep_alive: number }>(
    "SELECT harness, keep_alive FROM instances WHERE id = ?",
    leadId
  );
  kit.check(
    "0: Caw, a Claude lead, starts with keep-alive on",
    lead?.harness === "claude" && lead.keep_alive === 1,
    JSON.stringify(lead)
  );
  const cawOn = () =>
    fleet.query<{ caw: number }>(
      "SELECT caw FROM projects WHERE id = ?",
      project.id
    )[0]?.caw === 1;
  const patch = (body: object) =>
    fetch(`${fleet.base}/api/projects/${project.id}/caw`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  const turnOn = async () => {
    await patch({ on: true });
    await until("Caw on", cawOn, Boolean, 10_000);
  };
  /** A session under Caw's, as his delegate's row stands: its id. */
  const underCaw = (title: string) =>
    fleet.spawn("claude", title, src, {
      projectId: project.id,
      parent: { instanceId: leadId },
    });
  const status = (id: string) => fleet.instance(id)?.status;

  const base = await fleet.dashboard();
  const page = await kit.page("desk", { init: [RECORD] });
  const openPanel = async () => {
    await open(page, `${base}/project/${project.id}`, "button.caw-seat");
    await openCawSettings(page);
  };
  const flip = () => page.click(".caw-panel [role='switch']");
  // The running-sessions tray in the page (StopTray): in his panel under
  // the switch for Caw off, under the head's ⋯ for forget.
  const tray = page.locator(`[data-stop-tray="${project.id}"]`);

  // ── 1. nothing he started runs ──────────────────────────────────────
  await openPanel();
  // His popover in the glass card's frame, as it stood before 5a493be53.
  await settle(page, 400);
  await checkCawSeatPop(kit, page, "1, his panel");
  await flip();
  await until("Caw off", () => !cawOn(), Boolean, 15_000);
  kit.check(
    "1: nothing he started runs: the switch flips at once, no tray",
    (await tray.count()) === 0 &&
      (await page.locator("[data-caw-turn-line]").count()) === 0
  );
  await turnOn();

  // ── 2. only his own turn ────────────────────────────────────────────
  await fleet.api("/api/routines", {
    projectId: project.id,
    timeZone: "UTC",
    target: "lead",
    name: "Slow turn",
    cron: "0 0 1 1 *",
    prompt: "PROBE-SLOW-TURN: brief the board.",
  });
  await until(
    "his routine's turn running",
    async () =>
      (
        (await (
          await fetch(`${fleet.base}/api/projects/${project.id}/caw`)
        ).json()) as { running: { kind: string }[] }
      ).running,
    (rowsNow) => rowsNow.some((each) => each.kind === "turn"),
    120_000
  );
  await openPanel();
  await flip();
  const line = page.locator("[data-caw-turn-line]");
  await line.waitFor({ timeout: 15_000 });
  const lineWords = (await line.textContent())?.replace(/\s+/g, " ") ?? "";
  kit.check(
    "2: only his own turn runs: one line under the switch, no tray",
    (await tray.count()) === 0 &&
      lineWords.includes("Answering") &&
      lineWords.includes("Let him finish") &&
      lineWords.includes("Stop now"),
    lineWords
  );
  await line.getByRole("button", { name: "Stop now" }).click();
  await line.waitFor({ state: "detached", timeout: 30_000 });
  kit.check(
    "2: “Stop now” turns him off once the hub says the turn stopped",
    !cawOn()
  );
  await turnOn();

  // ── 3. two sessions he started: list, armed, stopping, done ─────────
  const one = await underCaw("Started one");
  const two = await underCaw("Started two");
  await openPanel();
  await flip();
  await tray.waitFor({ timeout: 15_000 });
  const confirm = page.locator("[data-stop-confirm]");
  const rows = await page.locator("li[data-row]").count();
  const listed = await confirmWords(page);
  const other = (await page.locator("[data-stop-other]").textContent())?.trim();
  kit.check(
    "3: the tray names both sessions he started, and offers both ways",
    rows === 2 &&
      listed === "Stop 2 and turn Caw off" &&
      other === "Let them finish" &&
      ((await tray.locator("p.title").textContent()) ?? "").includes(
        "Turn Caw off for"
      ) &&
      (await tray.evaluate((node) => Boolean(node.closest(".caw-panel")))),
    `${rows} rows; confirm “${listed}”; other “${other}”`
  );
  await confirm.click();
  await confirmShows(page, "mid-turn", true);
  // The label morphs letter by letter: read it once the morph has landed.
  await page.waitForTimeout(600);
  const armed = await confirmWords(page);
  kit.check(
    "3: one press arms it in place",
    armed === "Stop 2 mid-turn and turn Caw off",
    `“${armed}”`
  );
  await page.waitForTimeout(600);
  await confirm.click();
  await confirmShows(page, "Caw is off");
  const seen = await seenOn(page);
  kit.check(
    "3: it stops each as its machine confirms, then says Caw is off",
    seen.some((words) => words.startsWith("Stopping")) &&
      seen.some((words) => words.includes("Stopped 2 sessions. Caw is off.")) &&
      !cawOn() &&
      status(one) !== "running" &&
      status(two) !== "running",
    `${seen.join(" | ")}; sessions ${status(one)}, ${status(two)}`
  );
  // It holds "Caw is off" where it was asked, then leaves.
  await tray.waitFor({ state: "detached", timeout: 15_000 });
  await turnOn();

  // ── 4. a session on a machine that is away ──────────────────────────
  const away = await underCaw("Started away");
  await fleet.stop("agent");
  await until(
    "the machine away",
    () => fleet.api<{ machineId: string; status: string }[]>("/api/agents"),
    (agents) =>
      !agents.some((a) => a.machineId === MACHINE && a.status === "online"),
    60_000
  );
  await openPanel();
  await flip();
  await tray.waitFor({ timeout: 15_000 });
  const awayRow = page.locator(`li[data-row="${away}"]`);
  const awayWords = (await awayRow.textContent())?.replace(/\s+/g, " ") ?? "";
  await confirm.click();
  await page.waitForTimeout(600);
  await confirm.click();
  await confirmShows(page, "Caw is off");
  const ended = await seenOn(page);
  kit.check(
    "4: an away machine's row says when it stops, and the stop is recorded",
    awayWords.includes("Stops when") &&
      ended.some((words) => words.includes("stops when")) &&
      !cawOn(),
    `${awayWords}; ${ended.slice(-3).join(" | ")}`
  );
  fleet.launch("agent");
  await fleet.agentUp();
  await until(
    "the away session stopped once its machine was back",
    () => status(away),
    (now) => now !== "running" && now !== "unknown",
    120_000
  );
  kit.check("4: its machine back, the recorded stop is carried out", true);
  await turnOn();

  // ── 5. let them finish ──────────────────────────────────────────────
  const kept = await underCaw("Started kept");
  await openPanel();
  await flip();
  await tray.waitFor({ timeout: 15_000 });
  await page.locator("[data-stop-other]").click();
  await tray.waitFor({ state: "detached", timeout: 15_000 });
  await openPanel();
  const sentence =
    (await page.locator(".caw-panel .sentence").textContent())?.trim() ?? "";
  kit.check(
    "5: “Let them finish”: he is off, it runs on, and his panel says so",
    !cawOn() &&
      status(kept) === "running" &&
      sentence === "Off · 1 of his still finishing",
    `caw ${cawOn()}; session ${status(kept)}; “${sentence}”`
  );

  // ── 6. forget, on the same tray ─────────────────────────────────────
  await open(page, `${base}/project/${project.id}`, "button.caw-seat");
  await page.click(`[aria-label="More for ${project.name}"]`);
  await page.getByRole("menuitem", { name: "Forget project…" }).click();
  await tray.waitFor({ timeout: 15_000 });
  const forgetRows = await page.locator("li[data-row]").count();
  const forgetFirst = await confirmWords(page);
  await confirm.click();
  await page.waitForTimeout(600);
  const forgetArmed = await confirmWords(page);
  await confirm.click();
  await confirmShows(page, "Forgotten");
  const projects = await fleet.api<{ id: string }[]>("/api/projects");
  kit.check(
    "6: forget on the shared tray: lists, arms, stops, forgets",
    forgetRows > 0 &&
      forgetFirst === `Stop ${forgetRows} and forget` &&
      forgetArmed === `Stop ${forgetRows} mid-turn and forget` &&
      (await page.locator("[data-stop-other]").count()) === 0 &&
      !projects.some((each) => each.id === project.id),
    `${forgetRows} rows; “${forgetFirst}” → “${forgetArmed}” → Forgotten`
  );
};

export default { name: "caw-off", run } satisfies Spec;
