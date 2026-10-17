/**
 * Every blur the dashboard moves, driven where a phone's Safari draws it:
 * WebKit 2359 (kit `PINNED_WEBKIT`, whose web process hangs on a
 * transitioned blur as the owner's iPhone Safari does) at an iPhone 15
 * Pro's size, touch, 3x. The ask card's parts hung it (safari-long-ask);
 * this is each other place a `filter` sits under a transition, an
 * animation or a script's motion:
 *
 *  - the recall wheel's rows, blurred by depth as they roll, and the pick's
 *    cross-blur as it lands in the field (RecallWheel, recall bench);
 *  - the update notice's notes (UpdateCard) and the moved logins
 *    (MovedLogins, out of `--fold-blur`), folding open and shut, Caw's
 *    notices bench;
 *  - the compaction divider's chevron, out of a 4px blur as its summary
 *    opens (CompactionDivider, traffic bench);
 *  - the send and stop glyphs' swap, a turn starting and ending (Composer
 *    `glyphOut`, `icon-swap`);
 *  - the queued edit's row, rising out of a 4px blur (Composer `.edit-row`);
 *  - a minimized question's bar, coming up out of a 4px blur, and the card
 *    again (Composer `askedIn`);
 *  - a tree mark's face and chevron swapping as its rows open and fold
 *    (TreeMark), in the phone's sidebar sheet;
 *  - the theme switch's icons (app.css `.icon-swap`), in the same sheet;
 *  - the keychain unlock's result mark (MachineAuthStatus `mark-in`);
 *  - a decision record's fold (RecordCard).
 *
 * The queued edit's row hung it (its blur is gone, Composer `.edit-row`),
 * and the update notes' fold did, in 2 of 12 runs, on a page's first
 * presses (its blur is gone, UpdateCard `.fold-inner`); every other one
 * draws.
 *
 * Each case on a page of its own: its motion happened (read from the DOM),
 * and the page answered a script within {@link ANSWERS_MS} the whole way.
 */
// biome-ignore-all lint/performance/noAwaitInLoops: one case, one step at a time, as a hand makes them
import { join } from "node:path";
import type { Page } from "playwright-core";
import { seedDecisions } from "../../../decisions-preview/seed";
import { MACHINE, type Reply, type Seen, until } from "../../../scratch-fleet";
import { answering, settled } from "../../answering";
import {
  COMPOSER_FIELD,
  type Kit,
  type KitFleet,
  open,
  PINNED_WEBKIT,
  type Spec,
  settle,
} from "../../kit";

const SLOW = "PROBE-SLOW";
const QUESTION = "PROBE-QUESTION";
/**
 * How long the page may take to answer. A hung web process never answers
 * again (10s here, killed some 20s in); the theme switch's whole-page view
 * transition, drawn in software at 3x, took up to 906ms.
 */
const ANSWERS_MS = 3000;
/** The composer's field (MentionField's editable box, kit {@link COMPOSER_FIELD}). */
const FIELD = COMPOSER_FIELD;

/** A turn that runs for a while; a question; every other one, a word. */
const respond = (request: Seen): Reply => {
  if (!request.tools || request.afterTool) {
    return { everyMs: 5, words: ["ok"] };
  }
  if (request.last.includes(SLOW)) {
    return { everyMs: 300, words: Array.from({ length: 80 }, () => "step") };
  }
  if (request.last.includes(QUESTION)) {
    return {
      everyMs: 5,
      words: [],
      tool: {
        name: "AskUserQuestion",
        input: {
          questions: [
            {
              question: "Which voice should the notes take?",
              header: "Voice",
              multiSelect: false,
              options: [
                { label: "Plain", description: "Say it plainly." },
                { label: "Warm", description: "Say it warmly." },
              ],
            },
          ],
        },
      },
    };
  }
  return { everyMs: 5, words: ["ok"] };
};

/** A phone's page on the pinned WebKit. */
async function phone(kit: Kit): Promise<Page> {
  const page = await kit.page("iphone15Pro", {
    engine: "webkit",
    webkit: PINNED_WEBKIT,
    scale: 3,
  });
  page.setDefaultTimeout(30_000);
  return page;
}

/**
 * One case: `act` drives its motion and says whether it happened (a
 * reading of the DOM); the page answers within {@link ANSWERS_MS} throughout.
 */
async function drive(
  kit: Kit,
  page: Page,
  what: string,
  act: () => Promise<{ happened: boolean; detail: string }>
): Promise<void> {
  // A step that threw says what it was waiting on: the error's first line
  // and the last lines of Playwright's call log.
  const said = (error: unknown) => {
    if (!(error instanceof Error)) {
      return String(error);
    }
    const lines = error.message.split("\n").map((line) => line.trim());
    const log = lines.filter((line) => line.startsWith("- ")).slice(-4);
    return [lines[0], ...log].join(" ");
  };
  const run = await answering(page, () =>
    act().catch((error: unknown) => ({ happened: false, detail: said(error) }))
  );
  kit.check(
    `${what}: it moves, and the page keeps answering`,
    run.result.happened && run.longest < ANSWERS_MS && !page.isClosed(),
    `${run.result.detail}; longest ${Math.round(run.longest)}ms`
  );
}

const present = (page: Page, selector: string, timeout = 10_000) =>
  settled(page.waitForSelector(selector, { timeout }));

async function recallWheel(kit: Kit, bench: string) {
  const page = await phone(kit);
  await open(page, `${bench}/motion/recall`, FIELD);
  await settle(page);
  await drive(
    kit,
    page,
    "the recall wheel rolls and its pick lands",
    async () => {
      await page.locator(FIELD).tap();
      await page.keyboard.press("ArrowUp");
      const up = await present(page, "[data-slot=\"ghosts\"][role='listbox']");
      for (const _step of [1, 2, 3, 4]) {
        await page.keyboard.press("ArrowUp");
        await page.waitForTimeout(250);
      }
      const blurred = await page.evaluate(
        () =>
          [
            ...document.querySelectorAll<HTMLElement>(
              "[data-slot=\"ghosts\"] [role='option']"
            ),
          ].filter((row) => row.style.filter.includes("blur")).length
      );
      await page.keyboard.press("Enter");
      await page.waitForTimeout(800);
      // The field's words are its textContent (kit COMPOSER_FIELD).
      const taken = await page.evaluate(
        (sel) => document.querySelector(sel)?.textContent?.trim() ?? "",
        FIELD
      );
      return {
        happened: up && blurred > 0 && taken.length > 0,
        detail: `wheel ${up}, ${blurred} rows blurred, field "${taken.slice(0, 40)}"`,
      };
    }
  );
  await page.close();
}

async function cawFolds(kit: Kit, bench: string) {
  for (const [what, toggle, fold] of [
    [
      "the update notice's notes fold shut and open",
      ':is([data-caw-pop], [data-glass-card-frame~="caw-pop"]) :is([data-slot="actions"], [data-actions]) [data-toggle]',
      "#update-notes",
    ],
    [
      "the moved logins fold open and shut",
      ':is([data-caw-pop], [data-glass-card-frame~="caw-pop"]) :is([data-slot="more"], [data-more]) [data-toggle]',
      "#moved-done",
    ],
  ] as const) {
    const page = await phone(kit);
    await open(page, `${bench}/motion/caw-notices?frame&fixture=full`, toggle);
    await settle(page);
    await drive(kit, page, what, async () => {
      const flips: boolean[] = [];
      for (const _press of [1, 2]) {
        const before = await page
          .locator(toggle)
          .first()
          .getAttribute("aria-expanded");
        await page.locator(toggle).first().tap();
        await page.waitForTimeout(700);
        const after = await page
          .locator(toggle)
          .first()
          .getAttribute("aria-expanded");
        flips.push(before !== after);
      }
      const folds = await page.locator(fold).count();
      return {
        happened: flips.every(Boolean) && folds > 0,
        detail: `flipped ${flips.join(",")}, ${folds} folds`,
      };
    });
    await page.close();
  }
}

async function compactionChevron(kit: Kit, bench: string) {
  const page = await phone(kit);
  await open(page, `${bench}/motion/traffic`, () => "__traffic" in window);
  await page.evaluate(() => {
    const traffic = (window as unknown as { __traffic: Record<string, never> })
      .__traffic as unknown as {
      assistant: (text: string) => void;
      compaction: {
        boundary: (trigger: "manual" | "auto", preTokens?: number) => void;
        idle: () => void;
        summary: (text: string) => void;
      };
      reset: (seed?: number) => void;
    };
    traffic.reset(6);
    traffic.compaction.boundary("manual", 150_000);
    traffic.compaction.summary("What was done, and what is left.");
    traffic.compaction.idle();
    traffic.assistant("Carrying on.");
  });
  const divider = page
    .locator('button[data-slot="divider"]:not([disabled])')
    .first();
  await divider.waitFor();
  await settle(page);
  await drive(
    kit,
    page,
    "the compaction divider's chevron comes in as its summary opens",
    async () => {
      await divider.tap();
      await page.waitForTimeout(600);
      const opened = await divider.getAttribute("aria-expanded");
      await divider.tap();
      await page.waitForTimeout(600);
      const shut = await divider.getAttribute("aria-expanded");
      return {
        happened: opened === "true" && shut === "false",
        detail: `opened ${opened}, then ${shut}`,
      };
    }
  );
  await page.close();
}

const turnEnds = (fleet: KitFleet, id: string) =>
  until(
    "the turn ended",
    () => fleet.instance(id),
    (row) => row?.turn_open_at === null,
    120_000
  );

async function composerCases(kit: Kit, fleet: KitFleet, base: string) {
  // The send and stop glyphs: a turn starts and ends.
  const talk = await fleet.spawn("claude", "Probe blur glyphs", fleet.workdir);
  let page = await phone(kit);
  await open(page, `${base}/session/${talk}`, FIELD, 90_000);
  await drive(
    kit,
    page,
    "the send and stop glyphs swap as a turn starts and ends",
    async () => {
      await fleet.send(talk, `${SLOW} a short while`);
      const stop = await present(
        page,
        "button[aria-label='Stop the agent']",
        30_000
      );
      await turnEnds(fleet, talk);
      const back = await settled(
        page.waitForFunction(
          () => !document.querySelector("button[aria-label='Stop the agent']"),
          null,
          { timeout: 10_000 }
        )
      );
      return {
        happened: stop && back,
        detail: `stop ${stop}, send again ${back}`,
      };
    }
  );
  await page.close();

  // The queued edit: a send waits behind a turn, ↑ lifts it into the field.
  const queue = await fleet.spawn("claude", "Probe blur queue", fleet.workdir);
  page = await phone(kit);
  await open(page, `${base}/session/${queue}`, FIELD, 90_000);
  await fleet.send(queue, `${SLOW} the long turn`);
  await until(
    "the turn running",
    () => fleet.instance(queue),
    (row) => row?.turn_open_at !== null,
    60_000
  );
  await fleet.send(queue, "Then rename the branch");
  await page.waitForTimeout(1500);
  await drive(
    kit,
    page,
    "the queued edit's row grows over the field",
    async () => {
      await page.locator(FIELD).tap();
      await page.keyboard.press("ArrowUp");
      const row = await present(page, '[data-slot="edit-row"]');
      await page.waitForTimeout(800);
      const words = await page.evaluate(
        () =>
          document
            .querySelector('[data-slot="edit-row"] [data-slot="what"]')
            ?.textContent?.trim() ?? ""
      );
      await page.keyboard.press("Escape");
      await page.waitForTimeout(800);
      return {
        happened: row && words.length > 0,
        detail: `row ${row}: "${words}"`,
      };
    }
  );
  await page.close();

  // A question minimized to its bar, then brought back.
  const asker = await fleet.spawn(
    "claude",
    "Probe blur question",
    fleet.workdir,
    {
      permissionMode: "default",
    }
  );
  page = await phone(kit);
  // What the page heard about this session (each frame's kinds and types)
  // and asked the hub, on the wall clock the card's record below keeps, said
  // on a miss.
  const heard: string[] = [];
  const t0 = Date.now();
  const kinds = (text: string) =>
    [
      ...new Set(
        [
          ...text.matchAll(/"(kind|type|subtype|verb)":"([a-z_.]+)"/g),
        ].map((m) => `${m[1]}=${m[2]}`)
      ),
    ]
      .slice(0, 6)
      .join(" ");
  page.on("websocket", (socket) => {
    socket.on("framereceived", ({ payload }) => {
      const text = String(payload);
      if (text.includes(asker)) {
        heard.push(`${Date.now() - t0}ms ${kinds(text)}`);
      }
    });
  });
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith("/api/")) {
      heard.push(`${Date.now() - t0}ms GET ${url.pathname.slice(0, 60)}`);
    }
  });
  await open(page, `${base}/session/${asker}`, FIELD, 90_000);
  heard.length = 0;
  // The ask card's and the composer's comings and goings, said on a miss.
  await page.evaluate((from) => {
    const said: string[] = [];
    const at = () => Date.now() - from;
    const watched = '[data-slot="ask"], [data-slot="dock"], [data-slot="hitl"]';
    const name = (el: Element) =>
      `${el.getAttribute("data-slot")}${el.closest("[data-pane]") ? " in a pane" : ""}${el.closest("[data-slot='leaf']") ? " in a leaf" : ""}`;
    const note = (nodes: NodeList, how: string) => {
      for (const node of nodes) {
        if (node instanceof Element) {
          const hit = [
            ...(node.matches(watched) ? [node] : []),
            ...node.querySelectorAll(watched),
          ];
          for (const el of hit) {
            said.push(`${at()}ms ${how}${name(el)}`);
          }
        }
      }
    };
    new MutationObserver((records) => {
      for (const record of records) {
        note(record.addedNodes, "+");
        note(record.removedNodes, "-");
      }
    }).observe(document.body, { childList: true, subtree: true });
    (window as unknown as { __askSaid: string[] }).__askSaid = said;
  }, t0);
  await fleet.send(asker, `${QUESTION} pick a voice`);
  const minimize = page.locator(
    "[data-slot=\"ask\"] button[aria-label='Minimize question']"
  );
  await minimize.waitFor({ timeout: 120_000 });
  await page.waitForTimeout(1000);
  await drive(
    kit,
    page,
    "a minimized question's bar comes up, and the card again",
    async () => {
      // What the composer's ask holds as the press goes in, and after a
      // press that missed, said on a miss.
      const asks = () =>
        page.evaluate(
          () =>
            [...document.querySelectorAll('[data-slot="ask"]')]
              .map(
                (ask) =>
                  `"${ask.textContent?.replace(/\s+/g, " ").trim().slice(0, 120)}" [${[
                    ...ask.querySelectorAll("button"),
                  ]
                    .map(
                      (b) => b.getAttribute("aria-label") ?? b.textContent?.trim()
                    )
                    .join(", ")}]`
              )
              .join("; ") || "nothing"
        );
      const asking = await asks();
      await minimize.tap().catch(async (error: unknown) => {
        // Who took the question down: the fleet's own logs, kept for a reader.
        for (const role of ["hub", "agent", "sessiond"] as const) {
          await Bun.write(
            join(kit.out, `question-${role}.log`),
            await fleet.logs(role)
          );
        }
        const row = await fleet.instance(asker);
        const came = await page.evaluate(() =>
          (window as unknown as { __askSaid?: string[] }).__askSaid
            ?.slice(-24)
            .join(", ")
        );
        throw new Error(
          `${error instanceof Error ? error.message : String(error)}\n- the ask held ${asking}, then ${await asks()}; the session ${JSON.stringify(row ?? null).slice(0, 300)}; came and went: ${came}; the page heard ${heard.slice(0, 40).join(", ") || "nothing of it"}; at ${page.url()}; the fleet's logs in ${kit.out}`
        );
      });
      const bar = await present(page, '[data-slot="asked-chip"]');
      await page.waitForTimeout(800);
      await page.locator('[data-slot="asked-chip"]').tap();
      const card = await settled(minimize.waitFor({ timeout: 10_000 }));
      await page.waitForTimeout(800);
      return {
        happened: bar && card,
        detail: `bar ${bar}, card again ${card}`,
      };
    }
  );
  await page.close();
}

async function sheetCases(kit: Kit, fleet: KitFleet, base: string) {
  const project = await fleet.api<{ id: string }>("/api/projects", {
    name: "Harbour",
    machineId: MACHINE,
    cwd: fleet.repo,
    caw: false,
  });
  for (const title of ["Alpha", "Beta"]) {
    await fleet.spawn("claude", title, fleet.repo, { projectId: project.id });
  }
  const page = await phone(kit);
  await open(page, `${base}/session`, '[data-slot="burger"]', 90_000);
  await settle(page);
  await page.tap('[data-slot="burger"]');
  const row = page.locator(
    `[data-rail-sheet] a[data-sidebar="menu-button"][href="/project/${project.id}"]`
  );
  await row.waitFor();
  await settle(page);
  await drive(
    kit,
    page,
    "a tree mark's face and chevron swap as its rows fold and open",
    async () => {
      const hit = row.locator('[data-slot="tree-mark"] [data-slot="hit"]');
      const flips: string[] = [];
      for (const _press of [1, 2]) {
        await hit.tap();
        await page.waitForTimeout(700);
        flips.push(String(await hit.getAttribute("aria-expanded")));
      }
      return {
        happened: flips[0] !== flips[1],
        detail: `aria-expanded ${flips.join(" → ")}`,
      };
    }
  );
  await drive(kit, page, "the theme switch's icons swap", async () => {
    const before = await page.evaluate(() =>
      document.documentElement.classList.contains("dark")
    );
    await page.tap(
      '[data-slot="sheet-content"] button[aria-label$="mode"], [data-slot="sheet-content"] button[aria-label="System"]'
    );
    await page.waitForTimeout(800);
    const after = await page.evaluate(() =>
      document.documentElement.classList.contains("dark")
    );
    return { happened: before !== after, detail: `dark ${before} → ${after}` };
  });
  await page.close();
}

/**
 * The keychain unlock's result: its mark comes in out of a 4px blur
 * (MachineAuthStatus `mark-in`). Only a Mac whose logins are unreadable
 * offers it, so the page is told the scratch machine is one (its
 * `/api/agents` read and the socket's machine rows rewritten), and the
 * unlock is answered at the socket as a Mac that unlocked answers it.
 */
async function unlockMark(kit: Kit, base: string) {
  const page = await phone(kit);
  const asMac = (agents: unknown): unknown =>
    Array.isArray(agents)
      ? agents.map((agent: { machineId?: string }) =>
          agent.machineId === MACHINE
            ? { ...agent, os: "darwin", auth: "unreadable-credentials" }
            : agent
        )
      : agents;
  await page.route("**/api/agents", async (route) => {
    const response = await route.fetch();
    await route.fulfill({ response, json: asMac(await response.json()) });
  });
  let asked = false;
  await page.routeWebSocket(
    (url) => url.pathname === "/ws/dashboard",
    (ws) => {
      const server = ws.connectToServer();
      ws.onMessage((message) => {
        const raw = String(message);
        const frame = JSON.parse(raw) as {
          machineId?: string;
          payload?: { method?: string };
          requestId?: string;
          verb?: string;
        };
        if (
          frame.verb === "control" &&
          frame.payload?.method === "unlockKeychain"
        ) {
          asked = true;
          ws.send(
            JSON.stringify({
              verb: "frames",
              machineId: frame.machineId,
              requestId: frame.requestId,
              payload: {
                kind: "control_result",
                requestId: frame.requestId,
                ok: true,
                result: "authenticated",
              },
            })
          );
          return;
        }
        server.send(raw);
      });
      server.onMessage((message) => {
        const raw = String(message);
        const frame = JSON.parse(raw) as { payload?: { agents?: unknown } };
        if (frame.payload?.agents) {
          frame.payload.agents = asMac(frame.payload.agents);
          ws.send(JSON.stringify(frame));
          return;
        }
        ws.send(raw);
      });
    }
  );
  await open(page, `${base}/session`, '[data-slot="burger"]', 90_000);
  await settle(page);
  await page.tap('[data-slot="burger"]');
  const row = page.locator(
    `[data-rail-sheet] [data-machine="${MACHINE}"] :is([data-slot="row"], [data-task-table-row], [data-project-spend-row], [data-view-routines-row], [data-view-table-row], [data-layout-row], [data-account-name-row], [data-session-row-row])`
  );
  await row.waitFor();
  await settle(page);
  await drive(kit, page, "the keychain unlock's mark comes in", async () => {
    // A finger's long press on the row: the menu opens on its contextmenu.
    const box = await row.boundingBox();
    await row.dispatchEvent("contextmenu", {
      bubbles: true,
      clientX: (box?.x ?? 0) + 40,
      clientY: (box?.y ?? 0) + 10,
    });
    await page
      .getByRole("menuitem", { name: "Unlock keychain…" })
      .tap({ timeout: 10_000 });
    const field = page.locator("input[type='password']");
    await field.fill("probe");
    await field.press("Enter");
    const mark = await present(
      page,
      '[data-slot="unlock"] :is([data-slot="mark"], [data-needs-card-mark], [data-transcript-skeleton-mark], [data-os-mark-class~="mark"]):is([data-enter], [data-slot="enter"])'
    );
    await page.waitForTimeout(800);
    return {
      happened: asked && mark,
      detail: `unlock asked ${asked}, mark ${mark}`,
    };
  });
  await page.close();
}

async function recordFold(kit: Kit, fleet: KitFleet, base: string) {
  const seeded = await seedDecisions(fleet, {
    name: "launch-q4",
    machineId: MACHINE,
    cwd: fleet.repo,
  });
  const page = await phone(kit);
  await open(
    page,
    `${base}/project/${seeded.projectId}?view=decisions&page=pricing`,
    '[data-slot="decisions"] [data-slot="record"]',
    90_000
  );
  await settle(page);
  const toggle = page
    .locator('[data-slot="record"]', { hasText: "How long is the trial?" })
    .locator('[data-slot="fold-row"] button');
  await drive(
    kit,
    page,
    "a decision record's fold opens and shuts",
    async () => {
      const flips: string[] = [];
      for (const _press of [1, 2]) {
        await toggle.tap();
        await page.waitForTimeout(700);
        flips.push((await toggle.textContent())?.trim() ?? "");
      }
      return {
        happened: flips[0] !== flips[1],
        detail: flips.join(" → "),
      };
    }
  );
  await page.close();
}

const spec: Spec = {
  name: "safari-blurs",
  run: async (kit) => {
    const bench = await kit.bench();
    await recallWheel(kit, bench);
    await cawFolds(kit, bench);
    await compactionChevron(kit, bench);

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
    await composerCases(kit, fleet, base);
    await sheetCases(kit, fleet, base);
    await unlockMark(kit, base);
    await recordFold(kit, fleet, base);
  },
};
export default spec;
