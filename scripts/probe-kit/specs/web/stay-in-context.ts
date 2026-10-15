/**
 * Stay in context (DESIGN.md, The Stay In Context Rule) for a session's own
 * flows, on the built dashboard against a scratch fleet: Stop, Archive,
 * Rename, Approve (the Needs panel) and Delete transcript. Each is read from
 * the DOM in three states, the hub's answer held or refused at the wire
 * (Playwright's WebSocket and request routing), never guessed at:
 *
 *  - before the hub answers: what was asked is said pending on the thing
 *    asked of, and nothing claims it is done;
 *  - refused: the reason stands under that row with Try again (or the
 *    question's own retry), the row and the page where they were;
 *  - confirmed: the row says the system's state.
 *
 * Throughout, nothing reaches the page's unhandled-rejection reporter.
 * Desk, light: these are states, not looks.
 */
import { cp, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { Page, Route, WebSocketRoute } from "playwright-core";
import {
  CLAUDE_JSON_NAME,
  HOOK_TEMPLATES,
} from "../../../../packages/core/src/index";
import { projectClaudeDir } from "../../../../packages/core/src/paths";
import {
  ACCOUNT,
  MACHINE,
  MODEL,
  type Reply,
  type Seen,
  until,
} from "../../../scratch-fleet";
import { type Kit, type KitFleet, open, ROOT, type Spec } from "../../kit";
import { openCawSettings } from "./caw-seat-pop";

const ASK = "PROBE-ASK";
const STOP_REFUSAL = "The machine would not stop it: probe refusal.";
const ARCHIVE_REFUSAL = "Not archived, still doing something. it is mid-turn";
const RENAME_REFUSAL = "That name is taken: probe refusal.";
const ANSWER_REFUSAL = "The machine dropped it: probe refusal.";
const DELETE_REFUSAL = "The transcript is locked: probe refusal.";
const TRY_AGAIN = /Try again/;
const STOP_ITEM = /^Stop/;
const RENAME_ITEM = /^Rename/;
const DELETE_ITEM = /Delete transcript/;
const FINISHED_TAB = /Finished/;
const PICK_STAGES = /Pick stages/;
const SOCIAL = /Social posts/;
const FORGET = /Forget project/;
const FORGOTTEN = /Forgotten/;
const REMOVE_EVERYWHERE = /Remove everywhere/;
const MACHINES_BUTTON = /^\d+ machines?/;
const REMOVE_MACHINE = /Remove machine/;
const ACCOUNT_ITEM = /^Account/;
const SECOND_ACCOUNT = /^Probe two$/;
const CANCEL_RUN = /^Cancel run$/;
const ADOPT = /^Adopt$/;
const SIGN_IN = /^Sign in$/;
const TAB_CLOSED = /closed before it finished/;
const CONTINUE_TO_HUB = /Continue to your hub/;
const SIGNED_IN_ROW = /Signed in for the fleet/;
const CREATE_PROJECT = /^Create project$/;
const CANCEL = /^Cancel$/;
const RETRY = /^Retry$/;
/** How long the probe project's install runs on a target: the window a move's Cancel stands in. */
const INSTALL_SECONDS = 173;
const STOPPED = /^Stopped\./;
const MOVE_CANCEL_REFUSAL = "The move is mid-step: probe refusal.";
const MOVE_RETRY_REFUSAL = "The machine is busy: probe refusal.";
const OFFER_REFUSAL = "The project could not take it: probe refusal.";
/** A machine's word on a fleet row it holds or is being sent. */
const HOLDING = /Has it|Being sent it/;

/** A workflow step's prompt: its turn runs long, so the step stays running. */
const SLOW = "PROBE-SLOW-STEP";

/**
 * Words for a turn; a tool call that needs a permission for the ask; a
 * workflow step's turn that goes on for minutes.
 */
const respondIn =
  (dir: string) =>
  (request: Seen): Reply => {
    if (request.all.includes(SLOW)) {
      return {
        everyMs: 1000,
        words: Array.from({ length: 600 }, () => "step"),
      };
    }
    return request.tools && request.last.includes(ASK)
      ? {
          everyMs: 5,
          words: [],
          tool: {
            name: "Write",
            input: { file_path: `${dir}/probe.txt`, content: "probe" },
          },
        }
      : { everyMs: 5, words: ["ok"] };
  };

type Rule = (frame: Record<string, unknown>) => "hold" | "refuse" | "pass";

/**
 * The page's socket, routed: each frame the page sends is passed, held, or
 * refused by the rule in force; a held frame can be let through or refused
 * later. Frames from the hub pass untouched.
 */
function wire(page: Page) {
  let route: WebSocketRoute | null = null;
  let server: ReturnType<WebSocketRoute["connectToServer"]> | null = null;
  let rule: Rule = () => "pass";
  const held: { raw: string; frame: Record<string, unknown> }[] = [];
  /** Every frame the page sent, as `verb:verdict`, for a failure's reading. */
  const sent: string[] = [];
  const refusals: Record<string, (frame: Record<string, unknown>) => object> =
    {};
  const refuseWith = (frame: Record<string, unknown>) => {
    const make = refusals.current;
    route?.send(JSON.stringify(make(frame)));
  };
  const ready = page.routeWebSocket(
    (url) => url.pathname === "/ws/dashboard",
    (ws) => {
      route = ws;
      server = ws.connectToServer();
      ws.onMessage((message) => {
        const raw = String(message);
        let frame: Record<string, unknown> = {};
        try {
          frame = JSON.parse(raw);
        } catch {
          // Not JSON: passed as it is.
        }
        const verdict = rule(frame);
        sent.push(`${String(frame.verb ?? frame.type)}:${verdict}`);
        if (verdict === "hold") {
          held.push({ raw, frame });
        } else if (verdict === "refuse") {
          refuseWith(frame);
        } else {
          server?.send(raw);
        }
      });
    }
  );
  return {
    ready,
    held,
    sent,
    /** From now, frames `match` picks are held. */
    hold(match: (frame: Record<string, unknown>) => boolean) {
      rule = (frame) => (match(frame) ? "hold" : "pass");
    },
    passAll() {
      rule = () => "pass";
    },
    /** Answers every held frame with the refusal `make` builds. */
    refuseHeld(make: (frame: Record<string, unknown>) => object) {
      refusals.current = make;
      for (const one of held.splice(0)) {
        refuseWith(one.frame);
      }
    },
    /** Lets every held frame through to the hub. */
    releaseHeld() {
      for (const one of held.splice(0)) {
        server?.send(one.raw);
      }
    },
  };
}

/** The error envelope the hub answers a refused request with (registry.ts `refusalFrame`). */
const errorFrame = (message: string) => (frame: Record<string, unknown>) => ({
  verb: "frames",
  machineId: frame.machineId ?? MACHINE,
  instanceId: frame.instanceId,
  requestId: frame.requestId,
  payload: { kind: "error", message },
});

/** What the page says about one session's row in the sidebar, read from the DOM. */
const rowState = (id: string) => {
  const link = document.querySelector<HTMLElement>(
    `.work-tabs ~ * [data-hover-session="${id}"], [data-hover-session="${id}"]`
  );
  const field = document.querySelector<HTMLInputElement>(
    'input[aria-label="Session title"]'
  );
  const item = (link ?? field)?.closest(".item");
  const after: string[] = [];
  let next = item?.parentElement?.firstElementChild ?? null;
  let past = false;
  while (next) {
    if (next === item) {
      past = true;
    } else if (past && next.classList.contains("row-fault")) {
      after.push(next.textContent?.replace(/\s+/g, " ").trim() ?? "");
    }
    next = next.nextElementSibling;
  }
  return {
    present: Boolean(item),
    title: item?.querySelector(".title")?.textContent?.trim() ?? null,
    doing: item?.querySelector(".doing")?.textContent?.trim() ?? null,
    busy: link?.getAttribute("aria-busy") ?? null,
    field: field
      ? {
          value: field.value,
          readonly: field.readOnly,
          focused: document.activeElement === field,
        }
      : null,
    faults: after,
    tryAgain: Boolean(item?.parentElement?.querySelector(".row-fault button")),
    path: location.pathname,
    rejections: (window as unknown as { __rejections: string[] }).__rejections
      .length,
  };
};

type RowState = ReturnType<typeof rowState>;

const note = (kit: Kit, what: string, state: unknown) =>
  kit.note(`${what}: ${JSON.stringify(state)}`);

async function rightClickRow(page: Page, id: string) {
  const row = page.locator(`[data-hover-session="${id}"]`).first();
  await row.scrollIntoViewIfNeeded();
  await row.click({ button: "right" });
  await page.waitForSelector('[role="menu"]', { timeout: 10_000 });
}

async function menuItem(page: Page, name: RegExp) {
  await page.getByRole("menuitem", { name }).first().click();
}

async function finishedTab(page: Page) {
  await page.getByRole("tab", { name: FINISHED_TAB }).first().click();
}

const rejectionsOf = (page: Page) =>
  page.evaluate(
    () => (window as unknown as { __rejections: string[] }).__rejections
  );

/**
 * One request route, gated: while `hold` is on, requests of `method` wait
 * here until refused (fulfilled with the hub's kind of refusal, a status and
 * a sentence) or let through; everything else passes.
 */
async function gate(page: Page, url: string, method: string) {
  const held: Route[] = [];
  const rule = { hold: Boolean(url) };
  await page.route(url, async (route) => {
    if (route.request().method() === method && rule.hold) {
      held.push(route);
      return;
    }
    await route.fallback();
  });
  return {
    held: () => held.length,
    waitHeld: () =>
      until(
        `${method} ${url} held`,
        () => held.length,
        (n) => n > 0
      ),
    refuse: (status: number, body: string) =>
      Promise.all(
        held
          .splice(0)
          .map((route) =>
            route.fulfill({ status, contentType: "text/plain", body })
          )
      ),
    open: () => {
      rule.hold = false;
    },
  };
}

const MOVE_REFUSAL = "That move is not open from here: probe refusal.";
const TEMPLATE_REFUSAL = "stages.md could not be written: probe refusal.";
const STOP_TRAY_REFUSAL = "The machine did not stop it: probe refusal.";
const HOOK_REFUSAL = "The hook could not be written: probe refusal.";
const MCP_REFUSAL = "The server could not be removed: probe refusal.";
const ACCOUNT_REFUSAL = "The account could not be removed: probe refusal.";
const MACHINE_REFUSAL = "The machine could not be removed: probe refusal.";

const WORKFLOW_REFUSAL = "The run could not be cancelled: probe refusal.";
const ACCOUNT_MOVE_REFUSAL = "That account is busy: probe refusal.";
const ADOPT_REFUSAL = "The hub could not take the skill: probe refusal.";
const SIGN_IN_REFUSAL = "The provider would not start: probe refusal.";
const EDITOR_DELETE_REFUSAL = "The hook could not be deleted: probe refusal.";

/**
 * What a question asked in the page says now, by where it was asked
 * (AskHere's `data-ask`): its title, the things it names, its refusal, its
 * busy confirm, and whether anything holds the page (a modal, or the body
 * made inert to the pointer), which The Open Page Rule says nothing does.
 */
const askState = (at: string) => {
  const ask = document.querySelector(`[data-ask="${CSS.escape(at)}"]`);
  return {
    open: Boolean(ask),
    title: ask?.querySelector("p.title")?.textContent?.trim() ?? null,
    items: [...(ask?.querySelectorAll("[data-item]") ?? [])].map((item) =>
      item.textContent?.replace(/\s+/g, " ").trim()
    ),
    fault:
      ask
        ?.querySelector(".row-fault")
        ?.textContent?.replace(/\s+/g, " ")
        .trim() ?? null,
    busy: Boolean(ask?.querySelector('[aria-busy="true"]')),
    held:
      Boolean(
        document.querySelector(
          '[role="alertdialog"], [role="dialog"][aria-modal="true"]'
        )
      ) || getComputedStyle(document.body).pointerEvents === "none",
    rejections: (window as unknown as { __rejections: string[] }).__rejections
      .length,
  };
};

/** Waits for the question asked at `at` to say `text` (its refusal), then reads it. */
async function askSays(page: Page, at: string, text: string) {
  await page
    .locator(`[data-ask="${at}"]`)
    .getByText(text)
    .waitFor({ timeout: 30_000 });
  return page.evaluate(askState, at);
}

/** The question asked at `at`: its confirm button (the last of its actions). */
const askConfirm = (page: Page, at: string) =>
  page.locator(`[data-ask="${at}"] .actions button`).last();

/**
 * A session's question, read with where it stands: directly under the row
 * drawing `link` (a live row's `data-hover-session`, a stored one's
 * `data-share`), the row it was asked from, and only there.
 */
const sessionAskState = ([at, link]: [string, string]) => {
  const asks = document.querySelectorAll(`[data-ask="${CSS.escape(at)}"]`);
  const [ask] = asks;
  const row = ask?.previousElementSibling;
  return {
    open: Boolean(ask),
    title: ask?.querySelector("p.title")?.textContent?.trim() ?? null,
    text: ask?.textContent?.replace(/\s+/g, " ").trim() ?? null,
    fault:
      ask
        ?.querySelector(".row-fault")
        ?.textContent?.replace(/\s+/g, " ")
        .trim() ?? null,
    busy: Boolean(ask?.querySelector('[aria-busy="true"]')),
    focused: Boolean(ask?.contains(document.activeElement)),
    held:
      Boolean(
        document.querySelector(
          '[role="alertdialog"], [role="dialog"][aria-modal="true"]'
        )
      ) || getComputedStyle(document.body).pointerEvents === "none",
    rejections: (window as unknown as { __rejections: string[] }).__rejections
      .length,
    count: asks.length,
    // Every one of its buttons inside the question, and the topmost thing
    // where it stands: nothing beside it (a pane past a narrow rail) covers it.
    // Each one that is not: its label, its box, the question's, what covers it.
    outOfHand: [...(ask?.querySelectorAll(".actions button") ?? [])].flatMap(
      (button) => {
        const box = button.getBoundingClientRect();
        const frame = ask?.getBoundingClientRect();
        const hit = document.elementFromPoint(
          box.left + box.width / 2,
          box.top + box.height / 2
        );
        const inside =
          frame !== undefined &&
          box.right <= frame.right + 0.5 &&
          box.left >= frame.left - 0.5;
        if (inside && button.contains(hit)) {
          return [];
        }
        // Every box around it up to what is hit: one of them clips it.
        const around: string[] = [];
        for (
          let up = button.parentElement;
          up && up !== hit && around.length < 16;
          up = up.parentElement
        ) {
          const edge = up.getBoundingClientRect();
          const style = getComputedStyle(up);
          around.push(
            `${up.tagName}.${up.className.toString().slice(0, 24)} ${edge.top.toFixed(0)}..${edge.bottom.toFixed(0)} ${style.display} ${style.overflowX}/${style.overflowY}${style.contain === "none" ? "" : ` contain:${style.contain}`}${style.clipPath === "none" ? "" : ` clip:${style.clipPath}`}${
              up.getAnimations().length
                ? ` anims:${up
                    .getAnimations()
                    .map((run) => run.playState)
                    .join("+")}`
                : ""
            }`
          );
        }
        return [
          `${button.textContent?.trim()} ${box.left.toFixed(0)}..${box.right.toFixed(0)}x${box.top.toFixed(0)}..${box.bottom.toFixed(0)} in ${frame?.left.toFixed(0)}..${frame?.right.toFixed(0)}x${frame?.top.toFixed(0)}..${frame?.bottom.toFixed(0)}, under ${hit?.tagName}.${hit?.className.toString().slice(0, 30)}; around: ${around.join(" < ")}`,
        ];
      }
    ),
    underRow: Boolean(
      row && (row.matches(link) || row.querySelector(link) !== null)
    ),
    rowPresent: Boolean(document.querySelector(link)),
  };
};

/** Where a session's question is asked, and how its answer is held at the hub's door. */
interface RowQuestion {
  /** The question's `at`: the row's session (its instance id, or a stored transcript's). */
  at: string;
  /** Holds what the confirm sends. */
  hold: () => void;
  /** The menu item that asks it. */
  item: RegExp;
  /** Lets what the confirm sends through from now on. */
  letThrough: () => void;
  /** The row the question belongs under: a selector inside it. */
  link: string;
  /** Right-clicks the row, its menu open. */
  menu: () => Promise<void>;
  refusal: string;
  /** Refuses what is held, with `refusal`. */
  refuse: () => Promise<unknown>;
  /** Words the question says, each in its text, when what it names is the point. */
  says?: string[];
  /** The question's title. */
  title: string;
  /** Waits until what the confirm sent is held. */
  waitHeld: () => Promise<unknown>;
  /** The flow's name in its checks. */
  what: string;
}

/**
 * One session-row question through its states, read from the DOM: asked
 * under the row it was asked from (and only there), in hand, nothing
 * holding the page; Cancel puts it away, the row untouched; pending while
 * the hub holds the answer; refused with the reason under it; confirmed,
 * the question and the row gone together.
 */
async function rowQuestion(kit: Kit, page: Page, q: RowQuestion) {
  const read = () =>
    page.evaluate(sessionAskState, [q.at, q.link] as [string, string]);
  const ask = page.locator(`[data-ask="${q.at}"]`);
  await q.menu();
  await menuItem(page, q.item);
  await ask.waitFor();
  // Read once it has unfolded: no finite animation is still running on it,
  // in the row it opens under, or on any box around it (its own `unfold`,
  // the tree's fold, a list revealing the height it grew by).
  await page.waitForFunction(
    (at) => {
      const opened = document.querySelector(`[data-ask="${CSS.escape(at)}"]`);
      if (!opened) {
        return false;
      }
      const moving = (runs: Animation[]) =>
        runs.some(
          (run) =>
            run.playState === "running" &&
            run.effect?.getTiming().iterations !== Number.POSITIVE_INFINITY
        );
      const branch = opened.closest("li") ?? opened;
      if (moving(branch.getAnimations({ subtree: true }))) {
        return false;
      }
      for (let up = branch.parentElement; up; up = up.parentElement) {
        if (moving(up.getAnimations())) {
          return false;
        }
      }
      return true;
    },
    q.at,
    { timeout: 10_000 }
  );
  const asked = await read();
  note(kit, `${q.what}, the question`, asked);
  kit.check(
    `${q.what}: the question stands under the row it was asked from, and only there, Cancel in hand, its buttons inside it and uncovered; nothing holds the page${q.says ? `; it says ${q.says.map((words) => `“${words}”`).join(", ")}` : ""}`,
    asked.title === q.title &&
      (q.says ?? []).every((words) => asked.text?.includes(words)) &&
      asked.outOfHand.length === 0 &&
      asked.count === 1 &&
      asked.underRow &&
      asked.focused &&
      !asked.held,
    JSON.stringify(asked)
  );
  await ask.getByRole("button", { name: CANCEL }).click();
  await ask.waitFor({ state: "detached" });
  const cancelled = await read();
  kit.check(
    `${q.what}: Cancel puts the question away; the row stays as it was`,
    !cancelled.open && cancelled.rowPresent,
    JSON.stringify(cancelled)
  );
  await q.menu();
  await menuItem(page, q.item);
  await ask.waitFor();
  q.hold();
  await askConfirm(page, q.at).click();
  await q.waitHeld();
  const pending = await read();
  note(kit, `${q.what}, before the hub answers`, pending);
  kit.check(
    `${q.what}: before the hub answers, the question stays under the row, its confirm busy, the row in its place`,
    pending.open && pending.busy && pending.underRow && pending.rowPresent,
    JSON.stringify(pending)
  );
  await q.refuse();
  await ask.getByText(q.refusal).waitFor({ timeout: 30_000 });
  const refused = await read();
  note(kit, `${q.what}, refused`, refused);
  kit.check(
    `${q.what}: refused, the question stays with the reason under it, the row in its place, no unhandled rejection`,
    refused.open &&
      (refused.fault ?? "").includes(q.refusal) &&
      !refused.busy &&
      refused.rowPresent &&
      refused.rejections === 0,
    JSON.stringify(refused)
  );
  q.letThrough();
  await askConfirm(page, q.at).click();
  const gone = await page
    .waitForFunction(
      ([at, link]) =>
        !(
          document.querySelector(link) ||
          document.querySelector(`[data-ask="${CSS.escape(at)}"]`)
        ),
      [q.at, q.link] as const,
      { timeout: 60_000 }
    )
    .then(
      () => true,
      () => false
    );
  const done = await read();
  note(kit, `${q.what}, confirmed`, done);
  kit.check(
    `${q.what}: confirmed, the question and the row leave together; no unhandled rejection`,
    gone && !done.open && !done.rowPresent && done.rejections === 0,
    JSON.stringify(done)
  );
}

type Socket = ReturnType<typeof wire>;

/** Holds the frames `match` picks at the page's socket, for a row question. */
const atSocket = (
  socket: Socket,
  match: (frame: Record<string, unknown>) => boolean,
  refusal: string
) => ({
  hold: () => socket.hold(match),
  waitHeld: () =>
    until(
      "the answer held",
      () => socket.held.length,
      (n) => n === 1
    ),
  refuse: () => {
    socket.refuseHeld(errorFrame(refusal));
    return Promise.resolve();
  },
  letThrough: () => socket.passAll(),
  refusal,
});

/** The machine's delete of a transcript, held at the socket. */
const deletesTranscript = (frame: Record<string, unknown>) =>
  frame.verb === "control" &&
  (frame.payload as { method?: string } | undefined)?.method ===
    "deleteSession";

/** Delete transcript from a live session's row (LiveSessionMenu). */
const deleteOnRow = (
  socket: Socket,
  page: Page,
  id: string,
  what: string
): RowQuestion => ({
  what,
  at: id,
  link: `[data-hover-session="${id}"]`,
  item: DELETE_ITEM,
  title: "Delete this transcript?",
  menu: () => rightClickRow(page, id),
  ...atSocket(socket, deletesTranscript, DELETE_REFUSAL),
});

const DISCARD_ITEM = /^Discard$/;
const REMOVE_ITEM = /^Remove session$/;
const DISCARD_REFUSAL = "The worktree is in use: probe refusal.";
const REMOVE_REFUSAL = "The session could not be removed: probe refusal.";
const GRANT_REFUSAL = "The session would not restart: probe refusal.";
const FULL_SEND = /Full Send/;
const SESSION_DETAILS = /^Session details$/;
/** A hub log line about a machine's fleet sync. */
const FLEET_LOG = /fleet|sync/i;
/** An agent log line about listing a machine's sessions. */
const LISTING_LOG = /listSessions|list sessions|catalog/i;

/** Until `id`'s turn has ended on the hub. */
const turnEnds = (fleet: KitFleet, id: string) =>
  until(
    "the turn ended",
    () => fleet.instance(id),
    (row) => row?.turn_open_at === null,
    120_000
  );

/**
 * Where Claude keeps a conversation's transcript, in the fleet's sandbox: a
 * config dir's `projects/<project>/<id>.jsonl`, the one place the machine's
 * catalog lists (claude.ts `listSessions`), not another store's copy.
 */
async function transcriptFile(fleet: KitFleet, sessionId: string) {
  const inProjects = new RegExp(`(^|/)projects/[^/]+/${sessionId}\\.jsonl$`);
  for (const root of [fleet.home, fleet.sandbox]) {
    // biome-ignore lint/performance/noAwaitInLoops: two roots, the first that has it wins
    const found = (await readdir(root, { recursive: true })).find((path) =>
      inProjects.test(path)
    );
    if (found) {
      return join(root, found);
    }
  }
  throw new Error(`no transcript for ${sessionId} under the fleet's sandbox`);
}

/**
 * A tab's menu, asked for the moment a session's page has landed, `times`
 * over: it opens every time. A miss notes what came and went around the
 * press (menus, the tab's own nodes), what had the focus, and what stood
 * under the pointer.
 */
async function tabMenuOnLanding(
  kit: Kit,
  page: Page,
  base: string,
  id: string,
  times: number
) {
  const tab = `[data-session-tab="${id}"]`;
  const misses: unknown[] = [];
  for (let at = 0; at < times; at += 1) {
    // biome-ignore lint/performance/noAwaitInLoops: each landing is its own, one after another
    await open(page, `${base}/session/${id}`, tab);
    await page.evaluate((selector) => {
      const seen: string[] = [];
      const start = performance.now();
      const stamp = () => `${Math.round(performance.now() - start)}ms`;
      const mark = (nodes: NodeList, how: string) => {
        for (const node of nodes) {
          if (!(node instanceof Element)) {
            continue;
          }
          if (node.querySelector('[role="menu"]')) {
            seen.push(`${stamp()} menu ${how}`);
          }
          if (node.matches(selector) || node.querySelector(selector)) {
            seen.push(`${stamp()} tab ${how}`);
          }
        }
      };
      new MutationObserver((records) => {
        for (const record of records) {
          mark(record.addedNodes, "added");
          mark(record.removedNodes, "removed");
        }
      }).observe(document.body, { childList: true, subtree: true });
      addEventListener(
        "focusin",
        (event) => {
          const target = event.target as Element | null;
          seen.push(
            `${stamp()} focus ${target?.tagName ?? "?"}.${String(target?.className ?? "").slice(0, 40)}`
          );
        },
        true
      );
      (window as unknown as { __menuSeen: string[] }).__menuSeen = seen;
    }, tab);
    await page.locator(tab).first().click({ button: "right" });
    const opened = await page
      .locator('[role="menu"]')
      .first()
      .waitFor({ timeout: 5000 })
      .then(
        () => true,
        () => false
      );
    if (!opened) {
      misses.push({
        at,
        seen: await page.evaluate(
          () => (window as unknown as { __menuSeen: string[] }).__menuSeen
        ),
        active: await page.evaluate(
          () =>
            `${document.activeElement?.tagName}.${String(document.activeElement?.className ?? "").slice(0, 40)}`
        ),
      });
    }
    await page.keyboard.press("Escape");
  }
  note(kit, "a tab's menu right after landing, misses", misses);
  kit.check(
    `A tab's menu opens on the first right-click right after its page lands, ${times} times out of ${times}`,
    misses.length === 0,
    JSON.stringify(misses)
  );
}

/**
 * A session's details card, opened pinned from its tab's own menu (Session
 * details, PaneTabs): a click opens it only on the tab already active, and
 * a key only where the focus is, neither settled on a page just landed on.
 */
async function openDetails(kit: Kit, page: Page, tab: string) {
  // What happens around the press, for a reading if no menu stands after
  // it: each menu that came or went, the element under the tab's centre,
  // and the tab's own nodes replaced.
  await page.evaluate((selector) => {
    const seen: string[] = [];
    const start = performance.now();
    const at = () => `${Math.round(performance.now() - start)}ms`;
    /** Which pane group a node was taken from or put in, by its parent. */
    const groupOf = (parent: Node) =>
      parent instanceof Element
        ? (parent.closest("[data-leaf]")?.getAttribute("data-leaf") ?? "none")
        : "none";
    const mark = (nodes: NodeList, how: string, parent: Node) => {
      for (const node of nodes) {
        if (!(node instanceof Element)) {
          continue;
        }
        if (node.querySelector('[role="menu"]')) {
          seen.push(`${at()} menu ${how}`);
        }
        if (node.matches(selector) || node.querySelector(selector)) {
          // Which node went, and in which group: the tab alone or what held it.
          seen.push(
            `${at()} tab ${how}: ${node.tagName}.${String(node.className).slice(0, 40)} in group ${groupOf(parent)}`
          );
        }
      }
    };
    new MutationObserver((records) => {
      for (const record of records) {
        mark(record.addedNodes, "added", record.target);
        mark(record.removedNodes, "removed", record.target);
      }
    }).observe(document.body, { childList: true, subtree: true });
    seen.push(
      `groups: ${[...document.querySelectorAll("[data-leaf]")].map((leaf) => leaf.getAttribute("data-leaf")).join(",")}; saved: ${localStorage.getItem("cawco-workspace")?.slice(0, 400)}`
    );
    const tabNode = document.querySelector(selector);
    const box = tabNode?.getBoundingClientRect();
    const top = box
      ? document.elementFromPoint(
          box.left + box.width / 2,
          box.top + box.height / 2
        )
      : null;
    seen.push(
      `under the tab's centre: ${top?.tagName ?? "nothing"}.${top?.className ?? ""} (inside the tab: ${Boolean(top && tabNode?.contains(top))})`
    );
    (window as unknown as { __menuSeen: string[] }).__menuSeen = seen;
  }, tab);
  await page.locator(tab).first().click({ button: "right" });
  await page
    .getByRole("menuitem", { name: SESSION_DETAILS })
    .click({ timeout: 15_000 })
    .catch(async (error: unknown) => {
      note(
        kit,
        "the tab's menu, without Session details",
        await page.evaluate(() => ({
          menus: [...document.querySelectorAll('[role="menu"]')].map((menu) =>
            [...menu.querySelectorAll('[role="menuitem"]')].map((item) =>
              item.textContent?.replace(/\s+/g, " ").trim()
            )
          ),
          seen: (window as unknown as { __menuSeen: string[] }).__menuSeen,
          active: document.activeElement?.tagName,
          path: location.pathname,
        }))
      );
      throw error;
    });
  await page
    .locator(".session-details")
    .waitFor({ timeout: 30_000 })
    .catch(async (error: unknown) => {
      note(
        kit,
        "session details, not opened",
        await page.evaluate((selector) => {
          const tabs = [...document.querySelectorAll(selector)];
          return {
            tabs: tabs.map((one) => ({
              selected: one.getAttribute("aria-selected"),
              text: one.textContent?.replace(/\s+/g, " ").trim(),
              box: one.getBoundingClientRect().width,
            })),
            cards: document.querySelectorAll(".session-details").length,
            path: location.pathname,
          };
        }, tab)
      );
      throw error;
    });
}

/** The home, its Finished list showing `id`'s row. */
async function homeShowing(page: Page, base: string, id: string) {
  await open(page, base, "[data-needs-caw]");
  await finishedTab(page);
  await page.waitForSelector(`[data-hover-session="${id}"]`, {
    timeout: 60_000,
  });
}

/**
 * The session menus' other questions, each under its own row: Discard a
 * spin-off, Remove a session that never started, Delete a transcript only
 * its machine keeps (Recent's row); and Full Send, asked under the
 * permission rows in a session's details.
 */
async function sessionQuestions(
  kit: Kit,
  fleet: KitFleet,
  page: Page,
  base: string,
  socket: Socket
) {
  // ── Discard a spin-off ───────────────────────────────────────────────
  // With a worktree of its own holding two files that are nowhere else: the
  // question names them and that they are kept as a carry (agent carry.ts),
  // and the confirmed Discard leaves that carry.
  const repo = join(fleet.sandbox, "spin-repo");
  await mkdir(repo, { recursive: true });
  await Bun.$`sh -c ${"git init -q -b main && echo spin > README.md && git add -A && git -c user.name=Owner -c user.email=o@probe.test commit -qm 'First commit'"}`
    .cwd(repo)
    .quiet();
  const spin = await fleet.spawn("claude", "Probe spin-off", repo, {
    scratch: { worktree: true },
  });
  await fleet.send(spin, "hello");
  await turnEnds(fleet, spin);
  const tree = (await Bun.$`git -C ${repo} worktree list --porcelain`.quiet())
    .text()
    .split("\n")
    .find((line) => line.endsWith(`-${spin.slice(0, 8)}`))
    ?.slice("worktree ".length);
  if (!tree) {
    throw new Error(`git lists no worktree of spin-off ${spin}`);
  }
  await writeFile(join(tree, "loose-a.txt"), "loose a\n");
  await writeFile(join(tree, "loose-b.txt"), "loose b\n");
  await homeShowing(page, base, spin);
  await rowQuestion(kit, page, {
    what: "Discard spin-off",
    at: spin,
    link: `[data-hover-session="${spin}"]`,
    item: DISCARD_ITEM,
    title: "Discard this spin-off?",
    says: [
      `Its worktree ${tree} holds work that is nowhere else: 2 changed files.`,
      "That work is saved first, as a carry on",
      "(in ~/.cawco/carries)",
    ],
    menu: () => rightClickRow(page, spin),
    ...atSocket(
      socket,
      (frame) =>
        frame.verb === "stop" &&
        (frame.payload as { discard?: boolean } | undefined)?.discard === true,
      DISCARD_REFUSAL
    ),
  });
  const carries = join(fleet.home, ".cawco", "carries");
  const [carry] = (await readdir(carries).catch(() => [] as string[])).filter(
    (name) => name.startsWith(`${spin}-`)
  );
  const diff = carry
    ? await readFile(join(carries, carry, "uncommitted.patch"), "utf8").catch(
        () => ""
      )
    : "";
  kit.check(
    "Discard spin-off: its worktree is gone, and a carry named by it holds both files",
    !(await Bun.file(join(tree, "loose-a.txt")).exists()) &&
      diff.includes("+loose a") &&
      diff.includes("+loose b"),
    `carry ${carry ?? "none"}: ${diff.slice(0, 400)}`
  );

  // ── A session that never started ────────────────────────────────────
  // A start its machine fails before the harness names a conversation: its
  // folder is a file (a missing folder the machine would make).
  const notAFolder = join(fleet.sandbox, "not-a-folder");
  await writeFile(notAFolder, "probe");
  const never = crypto.randomUUID();
  await fleet.post({
    verb: "spawn",
    machineId: MACHINE,
    instanceId: never,
    requestId: crypto.randomUUID(),
    payload: {
      instanceId: never,
      cwd: notAFolder,
      harness: "claude",
      model: MODEL.claude,
      title: "Probe never started",
      permissionMode: "bypassPermissions",
    },
  });
  await until(
    "the start failed",
    () => fleet.instance(never)?.status,
    (status) =>
      status !== undefined && !["starting", "running"].includes(status),
    90_000
  );
  note(kit, "the never-started session on the hub", {
    ...fleet.instance(never),
    sessionId: fleet.query<{ session_id: string | null }>(
      "SELECT session_id FROM instances WHERE id = ?",
      never
    )[0]?.session_id,
  });
  await homeShowing(page, base, never);
  const removals = await gate(page, `**/api/instances/${never}`, "DELETE");
  await rowQuestion(kit, page, {
    what: "Remove a never-started session",
    at: never,
    link: `[data-hover-session="${never}"]`,
    item: REMOVE_ITEM,
    title: "Remove this session?",
    menu: () => rightClickRow(page, never),
    hold: () => undefined,
    waitHeld: removals.waitHeld,
    refuse: () => removals.refuse(409, REMOVE_REFUSAL),
    letThrough: removals.open,
    refusal: REMOVE_REFUSAL,
  });

  // ── A transcript only its machine keeps ─────────────────────────────
  // One no hub session started, as the CLI leaves them: a real session's
  // transcript, beside it under a conversation id of its own.
  const source = await fleet.spawn("claude", "Probe transcript source");
  await fleet.send(source, "hello");
  await turnEnds(fleet, source);
  const sourceId = await until(
    "the source's conversation named on the hub",
    () =>
      fleet.query<{ session_id: string | null }>(
        "SELECT session_id FROM instances WHERE id = ?",
        source
      )[0]?.session_id ?? "",
    (named) => named.length > 0,
    60_000
  );
  const original = await transcriptFile(fleet, sourceId);
  const sessionId = crypto.randomUUID();
  const copy = join(dirname(original), `${sessionId}.jsonl`);
  await writeFile(
    copy,
    (await readFile(original, "utf8")).replaceAll(sourceId, sessionId)
  );
  note(kit, "the transcript only its machine keeps", copy);
  /** The page's own word on a catalog read that failed (loadCatalog). */
  const catalogSaid: string[] = [];
  page.on("console", (message) => {
    if (message.text().includes("listSessions")) {
      catalogSaid.push(message.text());
    }
  });
  await open(page, base, "[data-needs-caw]");
  const recent = page.locator("section.recent button.disclosure").first();
  if ((await recent.getAttribute("aria-expanded")) !== "true") {
    await recent.click();
  }
  const storedLink = `a[data-share="session:${sessionId}"]`;
  const listed = await page
    .waitForSelector(storedLink, { state: "attached", timeout: 60_000 })
    .then(
      () => true,
      () => false
    );
  if (!listed) {
    // What Recent does list, for the reading: its rows' names and links.
    note(
      kit,
      "Recent, without the stored transcript",
      await page.evaluate(() =>
        [...document.querySelectorAll("section.recent")].map((section) => ({
          open: section
            .querySelector("button.disclosure")
            ?.getAttribute("aria-expanded"),
          rows: [...section.querySelectorAll("a[data-share^='session:']")].map(
            (row) =>
              `${row.getAttribute("data-share")} ${row.textContent?.replace(/\s+/g, " ").trim()}`
          ),
        }))
      )
    );
    note(kit, "the page on its catalog read", catalogSaid);
    note(
      kit,
      "the agent on listing sessions",
      (await fleet.logs("agent"))
        .split("\n")
        .filter((line) => LISTING_LOG.test(line))
        .slice(-20)
    );
    throw new Error(`Recent never listed the stored transcript ${sessionId}`);
  }
  await rowQuestion(kit, page, {
    what: "Delete a stored transcript",
    at: sessionId,
    link: storedLink,
    item: DELETE_ITEM,
    title: "Delete this transcript?",
    menu: async () => {
      const row = page.locator(storedLink).first();
      await row.scrollIntoViewIfNeeded();
      await row.click({ button: "right" });
      await page.waitForSelector('[role="menu"]', { timeout: 10_000 });
    },
    ...atSocket(socket, deletesTranscript, DELETE_REFUSAL),
  });

  // ── Full Send, under the permission rows ────────────────────────────
  // A session with a conversation: a restart resumes it by its key.
  const granted = await fleet.spawn("claude", "Probe grant", fleet.workdir, {
    permissionMode: "default",
  });
  await fleet.send(granted, "hello");
  await turnEnds(fleet, granted);
  const tab = `[data-session-tab="${granted}"]`;
  await open(page, `${base}/session/${granted}`, tab);
  await openDetails(kit, page, tab);
  const chip = page.locator(
    '.session-details button[aria-label^="Permission mode:"]'
  );
  const ask = page.locator('[data-ask="fullSend"]');
  const pickFullSend = async () => {
    await chip.click();
    await page.click('[data-perm="fullSend"]');
    await ask.waitFor();
  };
  const details = () =>
    page.evaluate(() => {
      const card = document.querySelector(".session-details");
      return {
        chip:
          card
            ?.querySelector('button[aria-label^="Permission mode:"]')
            ?.getAttribute("aria-label") ?? null,
        pending: card?.querySelector(".feedback")?.textContent?.trim() ?? null,
        failure: card?.querySelector(".failure")?.textContent?.trim() ?? null,
        rejections: (window as unknown as { __rejections: string[] })
          .__rejections.length,
      };
    });
  await chip.waitFor({ timeout: 30_000 });
  await pickFullSend();
  await page.waitForTimeout(400);
  const grantAsked = {
    ...(await page.evaluate(askState, "fullSend")),
    under: await page.evaluate(
      () =>
        document.querySelector('[data-ask="fullSend"]')?.previousElementSibling
          ?.role === "radiogroup"
    ),
    confirm: (await askConfirm(page, "fullSend").textContent())?.trim(),
    shield: (await askConfirm(page, "fullSend").locator("svg").count()) > 0,
  };
  note(kit, "full send, the question", grantAsked);
  kit.check(
    "Full Send: the question stands under the permission rows, its confirm the grant's (shield); nothing holds the page",
    grantAsked.open &&
      grantAsked.under &&
      grantAsked.title === "Switch to Full Send?" &&
      grantAsked.shield &&
      !grantAsked.held,
    JSON.stringify(grantAsked)
  );
  await ask.getByRole("button", { name: CANCEL }).click();
  await ask.waitFor({ state: "detached" });
  const grantCancelled = await details();
  kit.check(
    "Full Send: Cancel puts the question away; the mode is as it was",
    !FULL_SEND.test(grantCancelled.chip ?? ""),
    JSON.stringify(grantCancelled)
  );
  await page.keyboard.press("Escape");
  socket.hold(
    (frame) => frame.verb === "spawn" && frame.instanceId === granted
  );
  await chip.waitFor();
  await pickFullSend();
  await askConfirm(page, "fullSend").click();
  await until(
    "the restart held",
    () => socket.held.length,
    (n) => n === 1,
    30_000
  ).catch(async (error: unknown) => {
    note(kit, "full send, no restart sent", {
      ...(await details()),
      sent: socket.sent.slice(-10),
    });
    throw error;
  });
  // The question folds away (its exit transition) once said yes.
  const askGone = await ask
    .waitFor({ state: "detached", timeout: 10_000 })
    .then(
      () => true,
      () => false
    );
  const grantPending = { ...(await details()), askGone };
  note(kit, "full send, before the machine answers", grantPending);
  kit.check(
    "Full Send: once said yes, the question goes and the session's own line says the change is on its way",
    askGone && grantPending.pending === "Applying change…",
    JSON.stringify(grantPending)
  );
  socket.refuseHeld(errorFrame(GRANT_REFUSAL));
  await page
    .locator(".session-details .failure", { hasText: GRANT_REFUSAL })
    .waitFor({ timeout: 30_000 });
  const grantRefused = await details();
  note(kit, "full send, refused", grantRefused);
  kit.check(
    "Full Send: refused, the session's line says why, in the machine's words; no unhandled rejection",
    (grantRefused.failure ?? "").includes(GRANT_REFUSAL) &&
      grantRefused.rejections === 0,
    JSON.stringify(grantRefused)
  );
  socket.passAll();

  /**
   * Full Send said yes to, through to the machine: the hub holds the mode
   * and the session runs on it, in a process started again for it (Full
   * Send is a mode its harness only takes at launch), not merely recorded.
   */
  const restarted = async (id: string, what: string) => {
    const pidBefore = await fleet.sessionPid(id);
    await pickFullSend();
    await askConfirm(page, "fullSend").click();
    await until(
      `${what}: the session in Full Send on the hub`,
      () =>
        fleet.query<{ permission_mode: string | null }>(
          "SELECT permission_mode FROM instances WHERE id = ?",
          id
        )[0]?.permission_mode,
      (mode) => mode === "fullSend",
      120_000
    );
    const pidAfter = await until(
      `${what}: its process started again`,
      () => fleet.sessionPid(id),
      (pid) => pid !== pidBefore,
      120_000
    ).catch(() => undefined);
    await page.waitForFunction(
      () =>
        document
          .querySelector(
            '.session-details button[aria-label^="Permission mode:"]'
          )
          ?.getAttribute("aria-label")
          ?.includes("Full Send"),
      null,
      { timeout: 30_000 }
    );
    const done = { ...(await details()), pidBefore, pidAfter };
    note(kit, `${what}, confirmed`, done);
    kit.check(
      `${what}: confirmed, the session runs on Full Send in a process started again for it, its chip says so, no failure line; no unhandled rejection`,
      FULL_SEND.test(done.chip ?? "") &&
        done.failure === null &&
        pidAfter !== undefined &&
        pidAfter !== pidBefore &&
        done.rejections === 0,
      JSON.stringify(done)
    );
  };
  await restarted(granted, "Full Send");
  await page.keyboard.press("Escape");

  // ── Full Send before the session's first message ────────────────────
  // Its harness has begun no conversation: it starts again fresh under its
  // id, on Full Send (core `relaunchOf`).
  const fresh = await fleet.spawn(
    "claude",
    "Probe fresh grant",
    fleet.workdir,
    { permissionMode: "default" }
  );
  const freshTab = `[data-session-tab="${fresh}"]`;
  await open(page, `${base}/session/${fresh}`, freshTab);
  await openDetails(kit, page, freshTab);
  await chip.waitFor({ timeout: 30_000 });
  await restarted(fresh, "Full Send before the first message");
  await page.keyboard.press("Escape");

  // ── A tab's menu, the moment its page lands ─────────────────────────
  await tabMenuOnLanding(kit, page, base, granted, 6);
}

const MARKET = "probe-market";
const UNLINK = /^Unlink$/;
const UNLINK_REFUSAL = "The marketplace is in use: probe refusal.";

/** Unlink a marketplace: asked under its row, naming the machines tracking it. */
async function unlinkMarketplace(
  kit: Kit,
  fleet: KitFleet,
  page: Page,
  base: string
) {
  const source = join(fleet.sandbox, MARKET);
  await mkdir(join(source, ".claude-plugin"), { recursive: true });
  await writeFile(
    join(source, ".claude-plugin", "marketplace.json"),
    JSON.stringify({ name: MARKET, owner: { name: "Probe" }, plugins: [] })
  );
  await fleet.api("/api/fleet/marketplace-links", { source });
  await until(
    "the machine tracking the marketplace",
    () =>
      fetch(`${fleet.base}/api/agents`)
        .then((r) => r.json())
        .then(
          (rows: { fleet?: { marketplaces?: Record<string, unknown> } }[]) =>
            rows.some((row) => row.fleet?.marketplaces?.[MARKET])
        ),
    Boolean,
    60_000
  );
  const unlinks = await gate(
    page,
    `**/api/fleet/marketplaces/${MARKET}`,
    "DELETE"
  );
  const more = `button[aria-label="More for ${MARKET}"]`;
  const at = `marketplace:${MARKET}`;
  await open(page, `${base}/config/skills`, more);
  await page.click(more);
  await page.getByRole("menuitem", { name: UNLINK }).click();
  await page.locator(`[data-ask="${at}"]`).waitFor();
  const asked = await page.evaluate(askState, at);
  note(kit, "unlink, the question", asked);
  kit.check(
    "Unlink marketplace: the question stands under its row, naming the machine tracking it; nothing holds the page",
    asked.title === `Unlink ${MARKET}?` &&
      asked.items.length === 1 &&
      HOLDING.test(asked.items[0] ?? "") &&
      !asked.held,
    JSON.stringify(asked)
  );
  await askConfirm(page, at).click();
  await unlinks.waitHeld();
  const pending = await page.evaluate(askState, at);
  await unlinks.refuse(409, UNLINK_REFUSAL);
  const refused = await askSays(page, at, UNLINK_REFUSAL);
  note(kit, "unlink, pending then refused", { pending, refused });
  kit.check(
    "Unlink marketplace: pending, the question waits busy; refused, the reason under it, the machine still named; no unhandled rejection",
    pending.busy &&
      refused.open &&
      (refused.fault ?? "").includes(UNLINK_REFUSAL) &&
      refused.items.length === 1 &&
      refused.rejections === 0,
    JSON.stringify({ pending, refused })
  );
  unlinks.open();
  await askConfirm(page, at).click();
  await page.waitForFunction(
    (selector) => !document.querySelector(selector),
    more,
    { timeout: 30_000 }
  );
  const linked = await fetch(`${fleet.base}/api/fleet`).then(
    (r) =>
      r.json() as Promise<{ config?: { marketplaces?: { name: string }[] } }>
  );
  kit.check(
    "Unlink marketplace: confirmed, the question and the row leave together and the fleet no longer tracks it",
    (await page.locator(`[data-ask="${at}"]`).count()) === 0 &&
      !(linked.config?.marketplaces ?? []).some((one) => one.name === MARKET) &&
      (await rejectionsOf(page)).length === 0,
    JSON.stringify(linked.config?.marketplaces ?? null)
  );
}

const CAW_OFF_REFUSAL = "Caw could not be turned off: probe refusal.";
const CAW_IS_OFF = /Caw is off/;

/**
 * Turning Caw off with a session he started running: the tray unfolds in
 * his panel under the switch, names the session, and stops it on the hub's
 * word; refused, the row says why with Try again.
 */
async function cawOff(kit: Kit, fleet: KitFleet, page: Page, base: string) {
  const project = await fleet.api<{ id: string; name: string }>(
    "/api/projects",
    { name: "Probe caw", machineId: MACHINE, cwd: fleet.repo, caw: true }
  );
  // His lead session, started as he is: by a message in his thread. Then a
  // delegate of his: what he started, still running.
  await fleet.api(`/api/projects/${project.id}/threads`, {
    body: "Probe: hello, Caw.",
  });
  const leadOf = async (): Promise<string | null> => {
    const response = await fetch(`${fleet.base}/api/projects`);
    const rows = (await response.json()) as {
      id: string;
      leadInstanceId: string | null;
    }[];
    return rows.find((row) => row.id === project.id)?.leadInstanceId ?? null;
  };
  let lead: string;
  try {
    lead = await until(
      "Caw's lead session started and running",
      async () => {
        const id = (await leadOf()) ?? "";
        return fleet.instance(id)?.status === "running" ? id : "";
      },
      (id) => id.length > 0,
      120_000
    );
  } catch (error) {
    // Why not, in the hub's words: the lead it named and how that row
    // stands (his lead runs in a workspace boundary: on a host that cannot
    // start one, the hub says so here).
    const named = await leadOf();
    const said = (await fleet.logs("hub"))
      .split("\n")
      .filter(
        (line) =>
          line.includes(project.id) || (named ? line.includes(named) : false)
      )
      .slice(-12)
      .join("\n");
    throw new Error(
      `${error instanceof Error ? error.message : String(error)}; lead ${named ?? "none"} ${JSON.stringify(named ? fleet.instance(named) : null)}; hub said:\n${said}`,
      { cause: error }
    );
  }
  const delegate = await fleet.spawn("claude", "Probe delegate", fleet.repo, {
    projectId: project.id,
    parent: { instanceId: lead },
  });
  const cawView = async () => {
    const response = await fetch(
      `${fleet.base}/api/projects/${project.id}/caw`
    );
    return (await response.json()) as {
      on: boolean;
      running?: { id: string }[];
    };
  };
  try {
    await until(
      "Caw listing his delegate as running",
      async () => {
        const caw = await cawView();
        return caw.on && (caw.running ?? []).some((one) => one.id === delegate);
      },
      Boolean,
      60_000
    );
  } catch (error) {
    note(kit, "Caw's view, without his delegate", {
      lead,
      delegate: fleet.instance(delegate),
      view: await cawView(),
    });
    throw error;
  }
  const offs = await gate(page, `**/api/projects/${project.id}/caw`, "PATCH");
  // The board is empty: he stands over it, and is his own seat there, the
  // one place his switch is on this page (no seat in the head).
  await open(page, `${base}/project/${project.id}`, ".caw-80 .caw-seat");
  // The head's seat, there while his view was read, folds out as he stands.
  await page
    .locator(".project-head .caw-seat")
    .waitFor({ state: "detached", timeout: 10_000 })
    .catch(() => undefined);
  const standingSeat = {
    inHead: await page.locator(".project-head .caw-seat").count(),
    standing: await page.locator(".caw-80 .caw-seat").count(),
  };
  note(kit, "caw off, his seat on the empty board", standingSeat);
  kit.check(
    "Caw off: on an empty board he stands over it as his own seat, the head without one",
    standingSeat.standing === 1 && standingSeat.inHead === 0,
    JSON.stringify(standingSeat)
  );
  // His switch is the project's setting, under the head's ⋯.
  await openCawSettings(page);
  // His view read: the switch says he is on, and takes a press.
  await page
    .waitForFunction(
      () => {
        const toggle = document.querySelector<HTMLButtonElement>(
          ".caw-panel [role='switch']"
        );
        return (
          toggle?.getAttribute("aria-checked") === "true" && !toggle.disabled
        );
      },
      null,
      { timeout: 30_000 }
    )
    .catch(async (error: unknown) => {
      note(
        kit,
        "Caw's panel, his switch not on",
        await page.evaluate(() => {
          const toggle = document.querySelector<HTMLButtonElement>(
            ".caw-panel [role='switch']"
          );
          return {
            seats: document.querySelectorAll(".caw-seat").length,
            panels: document.querySelectorAll(".caw-panel").length,
            checked: toggle?.getAttribute("aria-checked"),
            disabled: toggle?.disabled,
            sentence: document
              .querySelector(".caw-panel .sentence")
              ?.textContent?.trim(),
            refused: document
              .querySelector(".caw-panel .refused")
              ?.textContent?.trim(),
            path: location.pathname,
          };
        })
      );
      throw error;
    });
  await page.locator(".caw-panel [role='switch']").click();
  await page.locator(`[data-row="${delegate}"]`).waitFor({ timeout: 30_000 });
  await page.waitForTimeout(400);
  const asked = await page.evaluate(trayState, project.id);
  note(kit, "caw off, the tray", asked);
  kit.check(
    "Caw off: the tray unfolds in his panel under the switch, naming what he started; nothing holds the page",
    asked.open && asked.inPanel && asked.rows.includes(delegate) && !asked.held,
    JSON.stringify(asked)
  );
  await page.click("[data-stop-confirm]");
  await page.waitForTimeout(500);
  await page.click("[data-stop-confirm]");
  await offs.waitHeld();
  const pending = await page.evaluate(trayState, project.id);
  note(kit, "caw off, before the hub answers", pending);
  kit.check(
    "Caw off: before the hub answers, the tray stays, its confirm busy, the delegate's row stopping",
    pending.open && pending.busy === "true" && pending.rows.includes(delegate),
    JSON.stringify(pending)
  );
  await offs.refuse(409, CAW_OFF_REFUSAL);
  await page
    .locator(`[data-row="${delegate}"] .row-fault`, {
      hasText: CAW_OFF_REFUSAL,
    })
    .waitFor({ timeout: 30_000 });
  const refused = await page.evaluate(trayState, project.id);
  note(kit, "caw off, refused", refused);
  kit.check(
    "Caw off: refused, the delegate's row says why with Try again, the tray where it was; no unhandled rejection",
    refused.open &&
      refused.faults.some((fault) => (fault ?? "").includes(CAW_OFF_REFUSAL)) &&
      refused.rejections === 0,
    JSON.stringify(refused)
  );
  offs.open();
  await page
    .locator(`[data-row="${delegate}"] .row-fault`)
    .getByRole("button", { name: TRY_AGAIN })
    .click();
  await page
    .locator(`[data-stop-tray="${project.id}"]`)
    .getByText(CAW_IS_OFF)
    .first()
    .waitFor({ timeout: 60_000 });
  const view = await fetch(`${fleet.base}/api/projects/${project.id}/caw`).then(
    (r) => r.json() as Promise<{ on: boolean }>
  );
  const done = await page.evaluate(trayState, project.id);
  note(kit, "caw off, confirmed", { done, view });
  kit.check(
    "Caw off: confirmed, he is off on the hub, his delegate stopped, and the tray says so where it was asked",
    !view.on &&
      fleet.instance(delegate)?.status === "stopped" &&
      done.rejections === 0,
    JSON.stringify({ done, on: view.on, delegate: fleet.instance(delegate) })
  );
  await page.keyboard.press("Escape");
}

/** What a running-sessions tray says now (StopTray, `data-stop-tray`). */
const trayState = (projectId: string) => {
  const tray = document.querySelector(
    `[data-stop-tray="${CSS.escape(projectId)}"]`
  );
  return {
    open: Boolean(tray),
    title: tray?.querySelector("p.title")?.textContent?.trim() ?? null,
    line: tray?.querySelector("p.line")?.textContent?.trim() ?? null,
    rows: [...(tray?.querySelectorAll("[data-row]") ?? [])].map((row) =>
      row.getAttribute("data-row")
    ),
    confirm:
      tray
        ?.querySelector("[data-stop-confirm]")
        ?.textContent?.replace(/\s+/g, " ")
        .trim() ?? null,
    busy:
      tray?.querySelector("[data-stop-confirm]")?.getAttribute("aria-busy") ??
      null,
    faults: [...(tray?.querySelectorAll(".row-fault") ?? [])].map((fault) =>
      fault.textContent?.replace(/\s+/g, " ").trim()
    ),
    after: tray?.previousElementSibling?.className ?? null,
    inPanel: Boolean(tray?.closest(".caw-panel")),
    held:
      Boolean(
        document.querySelector(
          '[role="alertdialog"], [role="dialog"][aria-modal="true"]'
        )
      ) || getComputedStyle(document.body).pointerEvents === "none",
    path: location.pathname,
    rejections: (window as unknown as { __rejections: string[] }).__rejections
      .length,
  };
};

/** Drag a task to another stage; Pick stages; Forget the project (its tray). */
async function projectFlows(
  kit: Kit,
  fleet: KitFleet,
  page: Page,
  base: string
) {
  const project = await fleet.api<{ id: string; name: string }>(
    "/api/projects",
    { name: "Probe board", machineId: MACHINE, cwd: fleet.repo, caw: false }
  );
  const { stages } = await fleet.api<{ stages: { name: string }[] }>(
    `/api/projects/${project.id}/stages`
  );
  const [from] = stages.map((stage) => stage.name);
  const task = await fleet.api<{ id: string }>(
    `/api/projects/${project.id}/tasks`,
    { title: "Probe card", stage: from }
  );
  await open(
    page,
    `${base}/project/${project.id}`,
    `[data-share="task:${task.id}"]`
  );
  const where = () =>
    page.evaluate((id) => {
      // The card standing in a column: while a move is out, the one marked
      // moving (the copy leaving its old column is still drawn as it goes).
      const placed = [
        ...document.querySelectorAll(`[data-share="task:${id}"]`),
      ].filter((one) => one.closest("section.column ol.cards > li"));
      const card =
        placed.find((one) => one.closest("li[aria-busy]")) ?? placed.at(-1);
      const item = card?.closest("li");
      return {
        copies: document.querySelectorAll(`[data-share="task:${id}"]`).length,
        column:
          card
            ?.closest("section.column")
            ?.querySelector("h3")
            ?.textContent?.trim() ?? null,
        moving: item?.getAttribute("aria-busy") ?? null,
        words: item?.querySelector(".moving")?.textContent?.trim() ?? null,
        fault: item?.querySelector(".row-fault")?.textContent?.trim() ?? null,
        rejections: (window as unknown as { __rejections: string[] })
          .__rejections.length,
      };
    }, task.id);
  const before = await where();
  /** The board settled: one copy of the card stands, in one column. */
  const standing = () =>
    page.waitForFunction(
      (id) =>
        [...document.querySelectorAll(`[data-share="task:${id}"]`)].filter(
          (one) => one.closest("section.column ol.cards > li")
        ).length === 1,
      task.id,
      { timeout: 10_000 }
    );

  // ── #5 Drag a task to another stage ───────────────────────────────────
  const moves = await gate(
    page,
    `**/api/projects/${project.id}/tasks/${task.id}/stage`,
    "POST"
  );
  // The second stage's column: its heading is the stage's label.
  const fromIndex = await page
    .locator("section.column")
    .evaluateAll(
      (columns, id) =>
        columns.findIndex((column) =>
          column.querySelector(`[data-share="task:${id}"]`)
        ),
      task.id
    );
  await page
    .locator(`[data-share="task:${task.id}"]`)
    .dragTo(page.locator("section.column").nth(fromIndex + 1));
  await moves.waitHeld();
  const movePending = await where();
  note(kit, "drag, before the hub answers", movePending);
  kit.check(
    "Drag: before the hub answers, the card stands where it was put, saying Moving…",
    movePending.moving === "true" &&
      movePending.words === "Moving…" &&
      movePending.column !== before.column,
    JSON.stringify({ before, movePending })
  );
  await moves.refuse(409, MOVE_REFUSAL);
  await page.waitForSelector(`.row-fault >> text=${MOVE_REFUSAL}`);
  await standing();
  const moveRefused = await where();
  note(kit, "drag, refused", moveRefused);
  kit.check(
    "Drag: refused, the card is back in its column with the hub's sentence under it and Try again",
    moveRefused.column === before.column &&
      (moveRefused.fault ?? "").includes(MOVE_REFUSAL) &&
      moveRefused.moving === null &&
      moveRefused.rejections === 0,
    JSON.stringify(moveRefused)
  );
  moves.open();
  await page
    .locator(".row-fault", { hasText: MOVE_REFUSAL })
    .getByRole("button", { name: TRY_AGAIN })
    .click();
  await page.waitForFunction(
    (id) =>
      !document
        .querySelector(`[data-share="task:${id}"]`)
        ?.closest("li")
        ?.hasAttribute("aria-busy"),
    task.id
  );
  await standing();
  const moveDone = await where();
  note(kit, "drag, confirmed", moveDone);
  kit.check(
    "Drag: confirmed, the card stays in its new column, no fault",
    moveDone.column !== before.column &&
      moveDone.fault === null &&
      moveDone.rejections === 0,
    JSON.stringify(moveDone)
  );

  // ── #21 Pick stages: the tasks a set strands, named before it is chosen ─
  const templates = await gate(
    page,
    `**/api/projects/${project.id}/stages/template`,
    "POST"
  );
  await page.getByRole("button", { name: `More for ${project.name}` }).click();
  await page.getByRole("menuitem", { name: PICK_STAGES }).click();
  await page.getByRole("button", { name: SOCIAL }).click();
  await page.locator('[data-ask="social"]').waitFor();
  const templateAsked = await page.evaluate(askState, "social");
  note(kit, "stages, the question", templateAsked);
  kit.check(
    "Pick stages: before it is chosen, the question stands under the set in the picker, naming the task the set strands with its stage; nothing holds the page",
    templateAsked.items.length === 1 &&
      (templateAsked.items[0] ?? "").includes("Probe card") &&
      !templateAsked.held,
    JSON.stringify(templateAsked)
  );
  await askConfirm(page, "social").click();
  await templates.waitHeld();
  const templatePending = await page.evaluate(askState, "social");
  note(kit, "stages, before the hub answers", templatePending);
  kit.check(
    "Pick stages: before the hub answers, the question stays, its button busy",
    templatePending.open && templatePending.busy,
    JSON.stringify(templatePending)
  );
  await templates.refuse(409, TEMPLATE_REFUSAL);
  const templateRefused = await askSays(page, "social", TEMPLATE_REFUSAL);
  note(kit, "stages, refused", templateRefused);
  kit.check(
    "Pick stages: refused, the question stays with the hub's reason, the task still named",
    templateRefused.open &&
      (templateRefused.fault ?? "").includes(TEMPLATE_REFUSAL) &&
      templateRefused.items.length === 1 &&
      templateRefused.rejections === 0,
    JSON.stringify(templateRefused)
  );
  templates.open();
  await askConfirm(page, "social").click();
  await page
    .locator('[data-ask="social"]')
    .waitFor({ state: "detached", timeout: 30_000 });
  const written = await fleet.api<{ source: string }>(
    `/api/projects/${project.id}/stages`
  );
  kit.check(
    "Pick stages: confirmed, the question goes and the project has its own stages",
    written.source === "file",
    JSON.stringify(written.source)
  );

  // ── StopTray: a session that would not stop says why on its row ─────────
  const session = await fleet.spawn("claude", "Probe forget", fleet.repo, {
    projectId: project.id,
  });
  const stops = await gate(page, `**/api/projects/${project.id}/stop`, "POST");
  await page.getByRole("button", { name: `More for ${project.name}` }).click();
  await page.getByRole("menuitem", { name: FORGET }).click();
  await page.waitForSelector(`[data-row="${session}"]`);
  await page.waitForTimeout(400);
  const trayAsked = await page.evaluate(trayState, project.id);
  note(kit, "forget tray, asked", trayAsked);
  kit.check(
    "Forget tray: it unfolds under the project's head, where `⋯` asked it, naming the running session; nothing holds the page",
    trayAsked.open &&
      (trayAsked.after ?? "").includes("project-head") &&
      trayAsked.rows.includes(session) &&
      !trayAsked.held,
    JSON.stringify(trayAsked)
  );
  await page.click("[data-stop-confirm]");
  await page.waitForTimeout(500);
  await page.click("[data-stop-confirm]");
  await stops.waitHeld();
  const trayPending = await page.evaluate(trayState, project.id);
  note(kit, "forget tray, before the hub answers", trayPending);
  kit.check(
    "Forget tray: before the hub answers, the tray stays where it was asked, its confirm busy",
    trayPending.open &&
      trayPending.busy === "true" &&
      trayPending.rows.includes(session),
    JSON.stringify(trayPending)
  );
  await stops.refuse(500, STOP_TRAY_REFUSAL);
  await page.waitForSelector(`[data-row="${session}"] .row-fault`);
  const trayRefused = await page.evaluate((id) => {
    const row = document.querySelector(`[data-row="${id}"]`);
    return {
      fault: row
        ?.querySelector(".row-fault")
        ?.textContent?.replace(/\s+/g, " ")
        .trim(),
      tryAgain: Boolean(row?.querySelector(".row-fault button")),
      rejections: (window as unknown as { __rejections: string[] }).__rejections
        .length,
    };
  }, session);
  note(kit, "forget tray, a stop refused", trayRefused);
  kit.check(
    "Forget tray: a stop refused says why under its row, with Try again (RowFault), no unhandled rejection",
    (trayRefused.fault ?? "").includes(STOP_TRAY_REFUSAL) &&
      trayRefused.tryAgain &&
      trayRefused.rejections === 0,
    JSON.stringify(trayRefused)
  );
  stops.open();
  await page
    .locator(`[data-row="${session}"] .row-fault`)
    .getByRole("button", { name: TRY_AGAIN })
    .click();
  await until(
    "the forgotten project's session stopped",
    () => fleet.instance(session)?.status,
    (status) => status === "stopped",
    60_000
  );
  kit.check(
    "Forget tray: Try again stops the row on the machine's word",
    fleet.instance(session)?.status === "stopped",
    String(fleet.instance(session)?.status)
  );
  // The last stop lands, the ring is whole, and the forget runs: "Forgotten"
  // is said in the tray where it was asked, then the page leaves.
  await page
    .locator(`[data-stop-tray="${project.id}"] [data-stop-confirm]`, {
      hasText: FORGOTTEN,
    })
    .waitFor({ timeout: 60_000 });
  const trayEnded = await page.evaluate(trayState, project.id);
  note(kit, "forget tray, forgotten", trayEnded);
  kit.check(
    "Forget tray: the end is said in the tray where it was asked (Forgotten), the page still the project's",
    trayEnded.open && trayEnded.path === `/project/${project.id}`,
    JSON.stringify(trayEnded)
  );
  await until(
    "the project forgotten",
    () =>
      fetch(`${fleet.base}/api/projects`)
        .then((r) => r.json() as Promise<{ id: string }[]>)
        .then((rows) => rows.some((row) => row.id === project.id)),
    (listed) => !listed,
    60_000
  );
  await page.waitForFunction(
    (id) => location.pathname !== `/project/${id}`,
    project.id,
    { timeout: 30_000 }
  );
  const trayDone = await page.evaluate(trayState, project.id);
  note(kit, "forget tray, confirmed", trayDone);
  kit.check(
    "Forget tray: confirmed, the hub has forgotten the project and the page has left it; no unhandled rejection",
    trayDone.path !== `/project/${project.id}` && trayDone.rejections === 0,
    JSON.stringify(trayDone)
  );
}

/** Writes a hook on the hub, as a probe's starting state; refused is a failure. */
async function putHook(
  fleet: KitFleet,
  id: string,
  draft: (typeof HOOK_TEMPLATES)[number]["draft"]
) {
  const response = await fetch(`${fleet.base}/api/fleet/hooks/${id}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...draft, matcher: draft.matcher ?? null }),
  });
  if (!response.ok) {
    throw new Error(
      `the probe's hook was refused: ${response.status} ${await response.text()}`
    );
  }
}

/**
 * Opens an editor and waits until the one editor stands, the hub connected
 * (the first drawn, before the hub's rows are in, gives way to it).
 */
async function openEditor(page: Page, url: string) {
  await open(page, url, 'input[aria-label="Hook name"]');
  await page.waitForFunction(
    () =>
      document.querySelectorAll("footer button[type=submit]").length === 1 &&
      !document.querySelector("footer button[title*='unreachable']"),
    null,
    { timeout: 30_000 }
  );
}

/** A hook saved in place; an MCP server removed, naming its machines. */
async function configureFlows(
  kit: Kit,
  fleet: KitFleet,
  page: Page,
  base: string
) {
  // ── #11 Hook save: no second dialog, the reach on Save, the chip after ──
  const hookId = crypto.randomUUID();
  const draft = { ...HOOK_TEMPLATES[0].draft, name: "Probe hook" };
  await putHook(fleet, hookId, draft);
  const hookSaves = await gate(page, `**/api/fleet/hooks/${hookId}`, "PUT");
  await openEditor(page, `${base}/config/hooks/${hookId}`);
  await page.fill('input[aria-label="Hook name"]', "Probe hook renamed");
  const save = page.locator("footer button[type=submit]");
  await page.waitForFunction(
    () =>
      !(
        document.querySelector(
          "footer button[type=submit]"
        ) as HTMLButtonElement | null
      )?.disabled,
    null,
    { timeout: 30_000 }
  );
  const saveWords = (await save.textContent())?.replace(/\s+/g, " ").trim();
  await save.click();
  await hookSaves.waitHeld();
  const hookPending = await page.evaluate(() => ({
    dialog: Boolean(document.querySelector('[role="alertdialog"]')),
    busy: document
      .querySelector("footer button[type=submit]")
      ?.getAttribute("aria-busy"),
    reach: document.querySelector("footer .reach")?.textContent?.trim(),
  }));
  note(kit, "hook save, before the hub answers", { saveWords, ...hookPending });
  kit.check(
    "Hook save: no second dialog; Save says its reach and spins; the machines it writes to are named beside it",
    !hookPending.dialog &&
      hookPending.busy === "true" &&
      (saveWords ?? "").includes("1 machine") &&
      Boolean(hookPending.reach),
    JSON.stringify({ saveWords, ...hookPending })
  );
  await hookSaves.refuse(409, HOOK_REFUSAL);
  await page.waitForSelector(`[role="alert"] >> text=${HOOK_REFUSAL}`);
  kit.check(
    "Hook save: refused, the reason stands in the editor, the edit kept, no unhandled rejection",
    (await page.inputValue('input[aria-label="Hook name"]')) ===
      "Probe hook renamed" && (await rejectionsOf(page)).length === 0,
    "reason shown in the editor"
  );
  hookSaves.open();
  await save.click();
  await until(
    "the hook renamed on the hub",
    () =>
      fetch(`${fleet.base}/api/fleet/hooks`)
        .then((r) => r.json())
        .then(
          (
            all:
              | { hooks?: { id: string; name: string }[] }
              | { id: string; name: string }[]
          ) =>
            (Array.isArray(all) ? all : (all.hooks ?? [])).find(
              (h) => h.id === hookId
            )?.name
        ),
    (name) => name === "Probe hook renamed",
    30_000
  );
  await page.waitForSelector(
    "footer .result button, footer .result [data-slot]",
    {
      timeout: 30_000,
    }
  );
  const hookDone = await page.evaluate(() => ({
    toasts: document.querySelectorAll("[data-sonner-toast]").length,
    chip: document
      .querySelector("footer .result")
      ?.textContent?.replace(/\s+/g, " ")
      .trim(),
  }));
  note(kit, "hook save, confirmed", hookDone);
  kit.check(
    "Hook save: confirmed, no toast; the rollout chip beside Save is the result",
    hookDone.toasts === 0 && (hookDone.chip ?? "").includes("machine"),
    JSON.stringify(hookDone)
  );

  // ── #11 Remove an MCP server everywhere: its machines named ─────────────
  await fetch(`${fleet.base}/api/fleet/mcp/probe-mcp`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      config: { command: "true" },
      enabled: true,
      projectId: null,
    }),
  });
  const removals = await gate(page, "**/api/fleet/mcp/probe-mcp", "DELETE");
  await open(
    page,
    `${base}/config/mcp`,
    'button[aria-label="More for probe-mcp"]'
  );
  // The machine reports it before the question can name it.
  try {
    await until(
      "the machine holding probe-mcp",
      () =>
        fetch(`${fleet.base}/api/agents`)
          .then((r) => r.json())
          .then((rows: { fleet?: { mcp?: Record<string, unknown> } }[]) =>
            rows.some((row) => row.fleet?.mcp?.["probe-mcp"])
          ),
      Boolean,
      60_000
    );
  } catch (error) {
    // What the machine was doing instead of syncing the fleet.
    note(
      kit,
      "the agent, its fleet not synced",
      (await fleet.logs("agent")).split("\n").slice(-40)
    );
    note(
      kit,
      "the hub, its fleet not synced",
      (await fleet.logs("hub"))
        .split("\n")
        .filter((line) => FLEET_LOG.test(line))
        .slice(-20)
    );
    throw error;
  }
  await page.click('button[aria-label="More for probe-mcp"]');
  await page.getByRole("menuitem", { name: REMOVE_EVERYWHERE }).click();
  await page.locator('[data-ask="probe-mcp"]').waitFor();
  const mcpAsked = await page.evaluate(askState, "probe-mcp");
  note(kit, "mcp remove, the question", mcpAsked);
  kit.check(
    "Remove everywhere: the question stands under the server's row, naming the machine that holds it with its status; nothing holds the page",
    mcpAsked.items.length === 1 &&
      HOLDING.test(mcpAsked.items[0] ?? "") &&
      !mcpAsked.held,
    JSON.stringify(mcpAsked)
  );
  await askConfirm(page, "probe-mcp").click();
  await removals.waitHeld();
  const mcpPending = await page.evaluate(askState, "probe-mcp");
  await removals.refuse(409, MCP_REFUSAL);
  const mcpRefused = await askSays(page, "probe-mcp", MCP_REFUSAL);
  note(kit, "mcp remove, pending then refused", { mcpPending, mcpRefused });
  kit.check(
    "Remove everywhere: pending, the question waits busy; refused, the reason under it and the machine still named",
    mcpPending.busy &&
      mcpRefused.open &&
      (mcpRefused.fault ?? "").includes(MCP_REFUSAL) &&
      mcpRefused.items.length === 1 &&
      mcpRefused.rejections === 0,
    JSON.stringify({ mcpPending, mcpRefused })
  );
  removals.open();
  await askConfirm(page, "probe-mcp").click();
  await page.waitForFunction(
    () => !document.querySelector('button[aria-label="More for probe-mcp"]'),
    null,
    { timeout: 30_000 }
  );
  kit.check(
    "Remove everywhere: confirmed, the question and the row leave together",
    (await page.locator('[data-ask="probe-mcp"]').count()) === 0 &&
      (await rejectionsOf(page)).length === 0,
    "row gone"
  );
}

/**
 * #11 An editor's delete asks in its footer, in the page: a hook's, held,
 * refused, then let through. The editor's fields stay live while it stands.
 */
async function editorDelete(
  kit: Kit,
  fleet: KitFleet,
  page: Page,
  base: string
) {
  const hookId = crypto.randomUUID();
  const draft = { ...HOOK_TEMPLATES[0].draft, name: "Probe hook to delete" };
  await putHook(fleet, hookId, draft);
  const deletes = await gate(page, `**/api/fleet/hooks/${hookId}*`, "DELETE");
  await openEditor(page, `${base}/config/hooks/${hookId}`);
  await page.locator("footer button.delete").click();
  await page.locator('[data-ask="editor"]').waitFor();
  // The field stays live while the question stands: typing into it works.
  await page.fill('input[aria-label="Hook name"]', "Still typing");
  const asked = {
    ...(await page.evaluate(askState, "editor")),
    typed: await page.inputValue('input[aria-label="Hook name"]'),
  };
  note(kit, "editor delete, the question", asked);
  kit.check(
    "Editor delete: the question stands in the footer, in the page; the fields still take typing; nothing holds the page",
    asked.open && !asked.held && asked.typed === "Still typing",
    JSON.stringify(asked)
  );
  await askConfirm(page, "editor").click();
  await deletes.waitHeld();
  const pending = await page.evaluate(askState, "editor");
  await deletes.refuse(409, EDITOR_DELETE_REFUSAL);
  const refused = await askSays(page, "editor", EDITOR_DELETE_REFUSAL);
  note(kit, "editor delete, pending then refused", { pending, refused });
  kit.check(
    "Editor delete: pending, the question waits busy; refused, the hub's reason under it, the editor where it was",
    pending.busy &&
      refused.open &&
      (refused.fault ?? "").includes(EDITOR_DELETE_REFUSAL) &&
      new URL(page.url()).pathname === `/config/hooks/${hookId}` &&
      refused.rejections === 0,
    JSON.stringify({ pending, refused })
  );
  deletes.open();
  await askConfirm(page, "editor").click();
  await page.waitForURL("**/config/hooks", { timeout: 30_000 });
  const left = await fetch(`${fleet.base}/api/fleet/hooks`)
    .then((r) => r.json())
    .then((all: { hooks?: { id: string }[] } | { id: string }[]) =>
      (Array.isArray(all) ? all : (all.hooks ?? [])).some(
        (hook) => hook.id === hookId
      )
    );
  kit.check(
    "Editor delete: confirmed, the hub no longer has it and the list is where the editor was",
    !left && (await rejectionsOf(page)).length === 0,
    JSON.stringify({ stillThere: left })
  );
}

/** Remove the account (naming its machine), then the machine (its sessions). */
async function removeFlows(
  kit: Kit,
  fleet: KitFleet,
  page: Page,
  base: string
) {
  // ── #24 Remove an account: the machines signed in to it named ──────────
  const accounts = await fetch(`${fleet.base}/api/accounts`).then(
    (r) => r.json() as Promise<{ accounts: { id: string }[] }>
  );
  const account = accounts.accounts[0]?.id as string;
  const accountRemovals = await gate(
    page,
    `**/api/accounts/${account}`,
    "DELETE"
  );
  await open(page, `${base}/config/accounts/${account}`, "footer");
  // Asked the moment the editor stands, while the skeleton it replaces is
  // still leaving: the skeleton going must not take this editor's question.
  await page.locator("footer button.delete").click();
  await page.locator('[data-ask="editor"]').waitFor();
  await page.waitForFunction(
    () => document.querySelectorAll("footer").length === 1,
    null,
    { timeout: 10_000 }
  );
  await page.waitForTimeout(400);
  const accountAsked = {
    ...(await page.evaluate(askState, "editor")),
    body: await page
      .locator('[data-ask="editor"] p.body')
      .first()
      .textContent(),
  };
  note(kit, "account remove, the question", accountAsked);
  kit.check(
    "Remove account: the question stands in the editor's footer naming the machine signed in to it, and stays once the skeleton it replaced has gone; nothing holds the page",
    accountAsked.open &&
      (accountAsked.body ?? "").includes("signed in to it") &&
      !accountAsked.held,
    JSON.stringify(accountAsked)
  );
  await askConfirm(page, "editor").click();
  await accountRemovals.waitHeld();
  const accountPending = await page.evaluate(askState, "editor");
  await accountRemovals.refuse(409, ACCOUNT_REFUSAL);
  const accountRefused = await askSays(page, "editor", ACCOUNT_REFUSAL);
  note(kit, "account remove, pending then refused", {
    accountPending,
    accountRefused,
  });
  kit.check(
    "Remove account: pending, the question waits busy; refused, the reason under it, no unhandled rejection",
    accountPending.busy &&
      (accountRefused.fault ?? "").includes(ACCOUNT_REFUSAL) &&
      accountRefused.rejections === 0,
    JSON.stringify({ accountPending, accountRefused })
  );
  // Kept: the machine's removal below needs the fleet as it is. Cancel puts
  // the question away, the account untouched.
  await page
    .locator('[data-ask="editor"]')
    .getByRole("button", { name: "Cancel" })
    .click();
  await page.locator('[data-ask="editor"]').waitFor({ state: "detached" });

  // ── #23 Remove a machine: its sessions named, nested, with status ───────
  await fleet.stop("agent");
  await until(
    "the machine offline",
    () =>
      fetch(`${fleet.base}/api/agents`)
        .then((r) => r.json())
        .then(
          (rows: { machineId: string; status: string }[]) =>
            rows.find((row) => row.machineId === MACHINE)?.status
        ),
    (status) => status !== "online",
    60_000
  );
  const machineRemovals = await gate(
    page,
    `**/api/agents/${MACHINE}`,
    "DELETE"
  );
  await open(page, base, "[data-needs-caw]");
  await page.getByRole("button", { name: MACHINES_BUTTON }).first().click();
  const machineRow = page.locator(`li[data-machine="${MACHINE}"] .row`).first();
  await machineRow.waitFor();
  await machineRow.click({ button: "right" });
  await page.getByRole("menuitem", { name: REMOVE_MACHINE }).click();
  await page.locator(`[data-ask="${MACHINE}"]`).waitFor();
  const machineAsked = await page.evaluate(askState, MACHINE);
  note(kit, "machine remove, the question", machineAsked);
  kit.check(
    "Remove machine: the question stands under the machine's row, naming its sessions each with its status; nothing holds the page",
    machineAsked.items.length >= 3 && !machineAsked.held,
    JSON.stringify(machineAsked)
  );
  await askConfirm(page, MACHINE).click();
  await machineRemovals.waitHeld();
  const machinePending = await page.evaluate(askState, MACHINE);
  await machineRemovals.refuse(409, MACHINE_REFUSAL);
  const machineRefused = await askSays(page, MACHINE, MACHINE_REFUSAL);
  note(kit, "machine remove, pending then refused", {
    machinePending,
    machineRefused,
  });
  kit.check(
    "Remove machine: pending, the question waits busy; refused, the reason under it, the sessions still named",
    machinePending.busy &&
      (machineRefused.fault ?? "").includes(MACHINE_REFUSAL) &&
      machineRefused.items.length === machineAsked.items.length &&
      machineRefused.rejections === 0,
    JSON.stringify({ machinePending, machineRefused })
  );
  machineRemovals.open();
  await askConfirm(page, MACHINE).click();
  await page
    .locator(`[data-ask="${MACHINE}"]`)
    .waitFor({ state: "detached", timeout: 30_000 });
  const left = await fetch(`${fleet.base}/api/agents`).then(
    (r) => r.json() as Promise<{ machineId: string }[]>
  );
  kit.check(
    "Remove machine: confirmed, the question closes and the hub no longer has it",
    !left.some((one) => one.machineId === MACHINE),
    JSON.stringify(left.map((one) => one.machineId))
  );
}

/** A second Claude account on the scratch machine: the first's fake login, copied. */
const SECOND = "acct-probe-two";

/**
 * #15 Move a session to another account: said on the session's own row
 * ("Moving to Probe two…" at rest), held at the hub's door, refused with
 * the reason on the row, then let through until the row names the account.
 */
async function accountMove(
  kit: Kit,
  fleet: KitFleet,
  page: Page,
  base: string
) {
  // A login of its own (its own identity), beside the first account's; the
  // agent reports it when it connects.
  const dir = join(fleet.home, ".cawco", "accounts", SECOND, "claude");
  await mkdir(dir, { recursive: true });
  await cp(
    join(
      fleet.home,
      ".cawco",
      "accounts",
      ACCOUNT,
      "claude",
      ".credentials.json"
    ),
    join(dir, ".credentials.json")
  );
  await writeFile(
    join(dir, CLAUDE_JSON_NAME),
    JSON.stringify({
      hasCompletedOnboarding: true,
      oauthAccount: {
        emailAddress: "probe-two@scratch-fleet.test",
        organizationName: "Scratch Fleet Two",
        accountUuid: "00000000-0000-4000-8000-000000000003",
        organizationUuid: "00000000-0000-4000-8000-000000000004",
      },
    })
  );
  fleet.write(
    "INSERT OR IGNORE INTO accounts (id, provider, kind, label, hue, \"order\", never_backup, created_at) VALUES (?, 'anthropic', 'console', 'Probe two', 'green', 1, 0, ?)",
    SECOND,
    Date.now()
  );
  await fleet.stop("agent");
  fleet.launch("agent");
  await fleet.agentUp();
  await until(
    "the second account signed in on the machine",
    () =>
      fleet.query<{ state: string }>(
        "SELECT state FROM account_signins WHERE account_id = ? AND machine_id = ?",
        SECOND,
        MACHINE
      )[0]?.state,
    (state) => state === "signed-in",
    120_000
  );
  const mover = await fleet.spawn("claude", "Probe mover");
  await fleet.send(mover, "hello");
  await until(
    "the mover's turn ended",
    () => fleet.instance(mover),
    (row) => row?.turn_open_at === null,
    120_000
  );
  const moves = await gate(page, `**/api/instances/${mover}/account`, "POST");
  await open(page, base, "[data-needs-caw]");
  await finishedTab(page);
  await page.waitForSelector(`[data-hover-session="${mover}"]`, {
    timeout: 60_000,
  });
  const path = new URL(page.url()).pathname;
  await rightClickRow(page, mover);
  await page.getByRole("menuitem", { name: ACCOUNT_ITEM }).first().click();
  // The submenu's accounts are radio items (AccountSubmenu).
  await page.getByRole("menuitemradio", { name: SECOND_ACCOUNT }).click();
  await moves.waitHeld();
  await page.waitForFunction(
    (id) =>
      document
        .querySelector(`[data-hover-session="${id}"]`)
        ?.closest(".item")
        ?.querySelector(".doing")
        ?.textContent?.includes("Probe two") ?? false,
    mover
  );
  const movePending = await page.evaluate(rowState, mover);
  note(kit, "account move, before the hub answers", movePending);
  kit.check(
    "Move account: before the hub answers, the session's own row says it moves to Probe two; no toast, no navigation",
    (movePending.doing ?? "").includes("Moving to Probe two") &&
      movePending.path === path &&
      (await page.locator("[data-sonner-toast]").count()) === 0,
    JSON.stringify(movePending)
  );
  await moves.refuse(409, ACCOUNT_MOVE_REFUSAL);
  await page.waitForSelector(`.row-fault >> text=${ACCOUNT_MOVE_REFUSAL}`);
  const moveRefused = await page.evaluate(rowState, mover);
  note(kit, "account move, refused", moveRefused);
  kit.check(
    "Move account: refused, the hub's reason stands under the session's row with Try again, no toast, no unhandled rejection",
    moveRefused.doing === null &&
      moveRefused.faults.some((text) => text.includes(ACCOUNT_MOVE_REFUSAL)) &&
      moveRefused.tryAgain &&
      (await page.locator("[data-sonner-toast]").count()) === 0 &&
      moveRefused.rejections === 0,
    JSON.stringify({ ...moveRefused, said: await rejectionsOf(page) })
  );
  moves.open();
  await page
    .locator(".row-fault", { hasText: ACCOUNT_MOVE_REFUSAL })
    .getByRole("button", { name: TRY_AGAIN })
    .click();
  await until(
    "the session on the second account",
    () =>
      fleet.query<{ account_id: string | null }>(
        "SELECT account_id FROM instances WHERE id = ?",
        mover
      )[0]?.account_id,
    (account) => account === SECOND,
    90_000
  );
  await page.waitForFunction(
    (id) =>
      !document
        .querySelector(`[data-hover-session="${id}"]`)
        ?.closest(".item")
        ?.querySelector(".doing"),
    mover,
    { timeout: 30_000 }
  );
  const moveDone = await page.evaluate(rowState, mover);
  note(kit, "account move, confirmed", moveDone);
  kit.check(
    "Move account: confirmed, the row stops saying it moves once the hub names the new account; its fault gone",
    moveDone.doing === null &&
      moveDone.faults.length === 0 &&
      moveDone.rejections === 0,
    JSON.stringify(moveDone)
  );
}

/**
 * #17 Cancel a workflow run: the question stands under the run's head, in
 * the page, naming the step running now; held, refused, then let through
 * until the hub has cancelled the run.
 */
async function workflowCancel(
  kit: Kit,
  fleet: KitFleet,
  page: Page,
  base: string
) {
  const workflow = await fleet.api<{ id: string }>("/api/workflows", {
    name: "Probe slow run",
    program: `import { z } from "zod"; export const inputs = z.object({}); export default async function(w: Workflow<typeof inputs>) { return await w.run({ title: "Probe slow step", harness: "claude", model: ${JSON.stringify(MODEL.claude)}, prompt: ${JSON.stringify(`${SLOW} take your time`)}, timeoutMinutes: 30, retries: 0, output: z.object({ ok: z.boolean() }) }); }`,
  });
  const { runId } = await fleet.api<{ runId: string }>(
    `/api/workflows/${workflow.id}/runs`,
    { workspace: { machineId: MACHINE, path: fleet.workdir } }
  );
  const detail = () =>
    fleet.api<{
      status: string;
      steps: { status: string; instanceId?: string | null }[];
    }>(`/api/workflow-runs/${runId}`);
  await until(
    "the run's step running",
    detail,
    (run) =>
      run.steps.some((step) => step.status === "running" && step.instanceId),
    120_000
  );
  const cancels = await gate(
    page,
    `**/api/workflow-runs/${runId}/cancel`,
    "POST"
  );
  await open(page, `${base}/session/run:${runId}`, ".run-view .actions");
  await page.getByRole("button", { name: CANCEL_RUN }).click();
  await page.locator('[data-ask="cancel-run"]').waitFor();
  const asked = await page.evaluate(askState, "cancel-run");
  note(kit, "workflow cancel, the question", asked);
  kit.check(
    "Cancel run: the question stands under the run's head, in the page, naming the step running now with its status; nothing holds the page",
    asked.open &&
      asked.items.length === 1 &&
      (asked.items[0] ?? "").length > 0 &&
      !asked.held,
    JSON.stringify(asked)
  );
  await askConfirm(page, "cancel-run").click();
  await cancels.waitHeld();
  const pending = await page.evaluate(askState, "cancel-run");
  const stillRunning = (await detail()).status;
  await cancels.refuse(409, WORKFLOW_REFUSAL);
  const refused = await askSays(page, "cancel-run", WORKFLOW_REFUSAL);
  note(kit, "workflow cancel, pending then refused", {
    pending,
    stillRunning,
    refused,
  });
  kit.check(
    "Cancel run: pending, the question waits busy and the run still runs; refused, the hub's reason under it, the step still named",
    pending.busy &&
      stillRunning === "running" &&
      (refused.fault ?? "").includes(WORKFLOW_REFUSAL) &&
      refused.items.length === 1 &&
      refused.rejections === 0,
    JSON.stringify({ pending, stillRunning, refused })
  );
  cancels.open();
  await askConfirm(page, "cancel-run").click();
  await until(
    "the run cancelled",
    async () => (await detail()).status,
    (status) => status === "cancelled",
    90_000
  );
  await page
    .locator('[data-ask="cancel-run"]')
    .waitFor({ state: "detached", timeout: 30_000 });
  kit.check(
    "Cancel run: confirmed, the hub cancels the run and the question goes; no unhandled rejection",
    (await rejectionsOf(page)).length === 0,
    "cancelled"
  );
}

/**
 * #25 Adopt a skill a machine already has: held, refused with the reason
 * under its entry, then let through until the entry turns "In the fleet".
 */
async function adoptFromMachine(
  kit: Kit,
  fleet: KitFleet,
  page: Page,
  base: string
) {
  // The scratch machine's own user layer: its HOME, not this process's.
  const dir = projectClaudeDir(fleet.home, "skills", "probe-adopt");
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, "SKILL.md"),
    "---\nname: probe-adopt\ndescription: A skill the probe wrote on the machine.\n---\n\nProbe.\n"
  );
  const adopts = await gate(page, "**/api/fleet/skills/probe-adopt", "PUT");
  await open(page, `${base}/config/skills`, ".machines button.head");
  await page.locator(".machines button.head").first().click();
  const entry = page.locator(".machines li.entry", { hasText: "probe-adopt" });
  await entry.waitFor({ timeout: 60_000 });
  const adopt = entry.getByRole("button", { name: ADOPT });
  await adopt.click();
  await adopts.waitHeld();
  const read = () =>
    entry.evaluate((li) => ({
      busy: li.querySelector('[aria-busy="true"]') !== null,
      fault:
        li
          .querySelector(".row-fault")
          ?.textContent?.replace(/\s+/g, " ")
          .trim() ?? null,
      inFleet: li.textContent?.includes("In the fleet") ?? false,
      toasts: document.querySelectorAll("[data-sonner-toast]").length,
      rejections: (window as unknown as { __rejections: string[] }).__rejections
        .length,
    }));
  const pending = await read();
  await adopts.refuse(409, ADOPT_REFUSAL);
  await entry.getByText(ADOPT_REFUSAL).waitFor();
  const refused = await read();
  note(kit, "adopt, pending then refused", { pending, refused });
  kit.check(
    "Adopt: pending, its button busy; refused, the hub's reason under the entry, no toast, no unhandled rejection",
    pending.busy &&
      (refused.fault ?? "").includes(ADOPT_REFUSAL) &&
      refused.toasts === 0 &&
      refused.rejections === 0,
    JSON.stringify({ pending, refused })
  );
  adopts.open();
  await adopt.click();
  await entry.getByText("In the fleet").waitFor({ timeout: 30_000 });
  // The refusal folds away as the entry turns.
  await entry
    .locator(".row-fault")
    .waitFor({ state: "detached", timeout: 10_000 });
  const done = await read();
  note(kit, "adopt, confirmed", done);
  kit.check(
    "Adopt: confirmed, the entry turns In the fleet in place, its fault gone, no toast",
    done.inFleet && done.fault === null && done.toasts === 0,
    JSON.stringify(done)
  );
}

/**
 * #26 Join a project from a session's offer: a project holds one checkout
 * of a repository, and a plain session in another checkout of it has
 * started a delegate, which the hub offers a project on (project-offers.ts,
 * `delegates`). Accepting joins the project that holds the repository (by
 * remote): held, refused (the reason on the card), then joined, the card
 * saying what it joined where the offer stood, with no toast.
 */
async function offerJoin(kit: Kit, fleet: KitFleet, page: Page, base: string) {
  // Two checkouts of one repository, as two clones of a hosted one are: the
  // hub knows a repository by its host-named remote (projects.ts
  // `normaliseRemote`; a path on the disk names none), and nothing here
  // fetches from it.
  const checkout = async (name: string) => {
    const dir = join(fleet.sandbox, name);
    await Bun.$`git clone -q ${join(fleet.sandbox, "origin.git")} ${dir} && git -C ${dir} remote set-url origin https://probe.test/scratch/repo.git`.quiet();
    return dir;
  };
  const held = await checkout("offers-held");
  const clone = await checkout("offers-loose");
  const project = await fleet.api<{ id: string; name: string }>(
    "/api/projects",
    { name: "Probe offers", machineId: MACHINE, cwd: held, caw: false }
  );
  const loose = await fleet.spawn("claude", "Probe loose", clone);
  await fleet.spawn("claude", "Probe loose's delegate", clone, {
    parent: { instanceId: loose },
  });
  await fleet.send(loose, "hello");
  await until(
    "the hub offering the loose session a project, on its delegate",
    () =>
      fleet.query<{ reason: string }>(
        "SELECT reason FROM project_offers WHERE instance_id = ?",
        loose
      )[0]?.reason,
    (reason) => reason === "delegates",
    120_000
  );
  const answers = await gate(
    page,
    `**/api/project-offers/${loose}/accept`,
    "POST"
  );
  // This session's own card: other sessions the run opened stay in the
  // workspace, and may carry offers of their own.
  const pane = `[data-offer="${loose}"]`;
  await open(
    page,
    `${base}/session/${loose}`,
    `section${pane}[aria-label="Make this session a project"]`
  );
  const card = page.locator(`section${pane}`);
  const read = () =>
    card.evaluate((section) => ({
      label: section.getAttribute("aria-label"),
      words: section.textContent?.replace(/\s+/g, " ").trim() ?? "",
      busy: section.querySelector('[aria-busy="true"]') !== null,
      fault:
        section
          .querySelector(".row-fault")
          ?.textContent?.replace(/\s+/g, " ")
          .trim() ?? null,
      path: location.pathname,
      toasts: document.querySelectorAll("[data-sonner-toast]").length,
      rejections: (window as unknown as { __rejections: string[] }).__rejections
        .length,
    }));
  await card.getByRole("button", { name: CREATE_PROJECT }).click();
  await answers.waitHeld();
  const pending = await read();
  await answers.refuse(409, OFFER_REFUSAL);
  await card.getByText(OFFER_REFUSAL).waitFor();
  const refused = await read();
  note(kit, "offer, pending then refused", { pending, refused });
  kit.check(
    "Offer: pending, the card waits on its button; refused, the hub's reason on the card, the session where it was, no toast, no unhandled rejection",
    pending.busy &&
      (refused.fault ?? "").includes(OFFER_REFUSAL) &&
      refused.label === "Make this session a project" &&
      refused.path === `/session/${loose}` &&
      refused.toasts === 0 &&
      refused.rejections === 0,
    JSON.stringify({ pending, refused })
  );
  answers.open();
  await card.getByRole("button", { name: CREATE_PROJECT }).click();
  await page
    .locator(`section${pane}[aria-label="Joined a project"]`)
    .waitFor({ timeout: 30_000 });
  // The offer it answers leaves as the answer arrives: one card stands.
  await page.waitForFunction(
    (selector) => document.querySelectorAll(selector).length === 1,
    `section${pane}`,
    { timeout: 10_000 }
  );
  const joined = await read();
  const filed = fleet.query<{ project_id: string | null }>(
    "SELECT project_id FROM instances WHERE id = ?",
    loose
  )[0]?.project_id;
  note(kit, "offer, joined", { ...joined, filed });
  kit.check(
    "Offer: joined, the card says what it joined where the offer stood, with the way there; the hub has the session in that project; no toast",
    (joined.words ?? "").includes(`Joined ${project.name}`) &&
      filed === project.id &&
      joined.path === `/session/${loose}` &&
      joined.toasts === 0 &&
      joined.rejections === 0,
    JSON.stringify({ ...joined, filed })
  );
}

/**
 * #18 A project move's Cancel and Retry, in the wait itself. The project's
 * repository has a bun.lock at its root, so a move runs `bun install` on
 * the target (core move.ts `installFor`), and its root `postinstall` takes
 * a while: the job stands in its install step, where Cancel stands. Cancel
 * held, refused (the reason under it, the wait as it was), then let
 * through, the wait turning "Stopped." in place, its tab staying. A second
 * move's install is ended from outside, so the job fails at it, which is
 * when Retry stands: held, refused (the reason under it), then let through,
 * the job running its install again on the hub's word.
 */
async function moveFlows(kit: Kit, fleet: KitFleet, page: Page, base: string) {
  const two = await fleet.launchMachine("probe-two");
  const folder = join(fleet.sandbox, "move-source");
  await mkdir(folder, { recursive: true });
  await writeFile(
    join(folder, "package.json"),
    JSON.stringify({
      name: "probe-move",
      private: true,
      scripts: { postinstall: `sleep ${INSTALL_SECONDS}` },
    })
  );
  // A bun project's lockfile, in bun's text format: a root with no
  // packages (`bun install` writes none for a package with no
  // dependencies, and the move picks its install by the lockfile).
  await writeFile(
    join(folder, "bun.lock"),
    `${JSON.stringify(
      {
        lockfileVersion: 1,
        workspaces: { "": { name: "probe-move" } },
        packages: {},
      },
      null,
      2
    )}\n`
  );
  await Bun.$`git init -q && git add -A && git -c user.email=p@p -c user.name=p commit -q -m probe`
    .cwd(folder)
    .quiet();
  const project = await fleet.api<{ id: string }>("/api/projects", {
    name: "Probe move",
    machineId: MACHINE,
    cwd: folder,
    caw: false,
  });
  const spawn = {
    harness: "claude",
    model: MODEL.claude,
    permissionMode: "bypassPermissions",
  };
  const stageOf = (id: string) =>
    fleet.query<{ stage: string }>(
      "SELECT stage FROM moves WHERE id = ?",
      id
    )[0]?.stage;
  const startMove = async (path: string) => {
    const job = await fleet.api<{ id: string; targetInstanceId: string }>(
      `/api/projects/${project.id}/moves`,
      { machineId: two.machineId, path, spawn }
    );
    await until(
      "the move in its install",
      () => stageOf(job.id),
      (stage) => stage === "install",
      120_000
    ).catch((error: Error) => {
      // What the job was doing instead, in the hub's own row.
      throw new Error(
        `${error.message}: ${JSON.stringify(
          fleet.query("SELECT * FROM moves WHERE id = ?", job.id)
        )}`
      );
    });
    return job;
  };
  const read = (jobId: string) =>
    page.evaluate((id) => {
      const root = document.querySelector(`[data-move="${id}"]`);
      return {
        words: root?.textContent?.replace(/\s+/g, " ").trim() ?? "",
        busy: root?.querySelector('[aria-busy="true"]') !== null,
        fault:
          root
            ?.querySelector(".row-fault")
            ?.textContent?.replace(/\s+/g, " ")
            .trim() ?? null,
        path: location.pathname,
        toasts: document.querySelectorAll("[data-sonner-toast]").length,
        rejections: (window as unknown as { __rejections: string[] })
          .__rejections.length,
      };
    }, jobId);

  // ── Cancel, while the move runs its install ───────────────────────────
  const first = await startMove(join(two.home, "probe-move-one"));
  const cancels = await gate(page, `**/api/moves/${first.id}`, "DELETE");
  await open(page, `${base}/session/${first.targetInstanceId}`, ".foot-button");
  const cancel = page
    .locator(`[data-move="${first.id}"] .foot`)
    .getByRole("button", { name: CANCEL });
  await cancel.click();
  await cancels.waitHeld();
  const cancelPending = await read(first.id);
  await cancels.refuse(409, MOVE_CANCEL_REFUSAL);
  await page.getByText(MOVE_CANCEL_REFUSAL).waitFor();
  const cancelRefused = {
    ...(await read(first.id)),
    stage: stageOf(first.id),
  };
  note(kit, "move cancel, pending then refused", {
    cancelPending,
    cancelRefused,
  });
  kit.check(
    "Move cancel: pending, Cancel waits busy in the install; refused, the hub's reason under it, the wait as it was, no toast, no unhandled rejection",
    cancelPending.busy &&
      (cancelRefused.fault ?? "").includes(MOVE_CANCEL_REFUSAL) &&
      cancelRefused.stage === "install" &&
      cancelRefused.path === `/session/${first.targetInstanceId}` &&
      cancelRefused.toasts === 0 &&
      cancelRefused.rejections === 0,
    JSON.stringify({ cancelPending, cancelRefused })
  );
  cancels.open();
  await cancel.click();
  await page.getByText(STOPPED).first().waitFor({ timeout: 30_000 });
  const cancelled = { ...(await read(first.id)), stage: stageOf(first.id) };
  note(kit, "move cancel, confirmed", cancelled);
  kit.check(
    "Move cancel: confirmed, the wait turns Stopped. in place and its tab stays; the hub holds it cancelled; no toast",
    cancelled.stage === "cancelled" &&
      cancelled.words.includes("Stopped.") &&
      cancelled.path === `/session/${first.targetInstanceId}` &&
      cancelled.fault === null &&
      cancelled.toasts === 0 &&
      cancelled.rejections === 0,
    JSON.stringify(cancelled)
  );

  // ── Retry, once a move's install has failed ───────────────────────────
  const second = await startMove(join(two.home, "probe-move-two"));
  const retries = await gate(page, `**/api/moves/${second.id}/retry`, "POST");
  await open(
    page,
    `${base}/session/${second.targetInstanceId}`,
    ".foot-button"
  );
  // The install ended from outside, as a machine's can be: the step fails.
  await Bun.$`pkill -f ${`sleep ${INSTALL_SECONDS}`}`.nothrow().quiet();
  await until(
    "the second move failing at its install",
    () => stageOf(second.id),
    (stage) => stage === "failed",
    90_000
  );
  const retry = page
    .locator(`[data-move="${second.id}"] .alert-actions`)
    .getByRole("button", { name: RETRY });
  await retry.click();
  await retries.waitHeld();
  const retryPending = await read(second.id);
  await retries.refuse(409, MOVE_RETRY_REFUSAL);
  await page.getByText(MOVE_RETRY_REFUSAL).waitFor();
  const retryRefused = {
    ...(await read(second.id)),
    stage: stageOf(second.id),
  };
  note(kit, "move retry, pending then refused", {
    retryPending,
    retryRefused,
  });
  kit.check(
    "Move retry: pending, Retry waits busy under the failure; refused, the hub's reason under it, the failure as it was, no toast, no unhandled rejection",
    retryPending.busy &&
      (retryRefused.fault ?? "").includes(MOVE_RETRY_REFUSAL) &&
      retryRefused.stage === "failed" &&
      retryRefused.toasts === 0 &&
      retryRefused.rejections === 0,
    JSON.stringify({ retryPending, retryRefused })
  );
  retries.open();
  await retry.click();
  await until(
    "the retried move running its install again",
    () => stageOf(second.id),
    (stage) => stage === "install",
    90_000
  );
  const retried = { ...(await read(second.id)), stage: stageOf(second.id) };
  note(kit, "move retry, confirmed", retried);
  kit.check(
    "Move retry: confirmed, the job runs its install again on the hub's word and the wait follows it, its failure and fault gone; no toast",
    retried.stage === "install" &&
      retried.fault === null &&
      !retried.words.includes("Retry") &&
      retried.toasts === 0 &&
      retried.rejections === 0 &&
      retried.path === `/session/${second.targetInstanceId}`,
    JSON.stringify(retried)
  );
  // Its install would sleep on: the move stops here.
  await fetch(`${fleet.base}/api/moves/${second.id}`, { method: "DELETE" });
}

/** The provider's sign-in page, as the browser sees it (Playwright routes it). */
const PROVIDER_PAGE = "https://provider.probe";
const PROBE_TOKEN = "probe-access-token";

/**
 * A provider and an OAuth-protected MCP server on loopback, for the hub:
 * discovery, client registration and the token exchange. Its sign-in page
 * is advertised over https (the hand-back takes no other), and the browser
 * reaches it through the context's routing (`handBack`). Once the hub holds
 * the token, the server answers it as an MCP server would.
 */
function oauthProvider() {
  return Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: async (request) => {
      const url = new URL(request.url);
      const origin = `http://127.0.0.1:${url.port}`;
      switch (url.pathname) {
        case "/.well-known/oauth-protected-resource":
          return Response.json({
            resource: `${origin}/mcp`,
            authorization_servers: [origin],
          });
        case "/.well-known/oauth-authorization-server":
          return Response.json({
            issuer: origin,
            authorization_endpoint: `${PROVIDER_PAGE}/authorize`,
            token_endpoint: `${origin}/token`,
            registration_endpoint: `${origin}/register`,
            response_types_supported: ["code"],
            grant_types_supported: ["authorization_code", "refresh_token"],
            code_challenge_methods_supported: ["S256"],
            token_endpoint_auth_methods_supported: ["none"],
          });
        case "/register":
          return Response.json(
            {
              ...((await request.json()) as object),
              client_id: "probe-client",
              token_endpoint_auth_method: "none",
            },
            { status: 201 }
          );
        case "/token":
          return Response.json({
            access_token: PROBE_TOKEN,
            token_type: "Bearer",
            expires_in: 3600,
            refresh_token: "probe-refresh-token",
          });
        default:
          break;
      }
      if (request.headers.get("authorization") !== `Bearer ${PROBE_TOKEN}`) {
        return new Response("sign in", {
          status: 401,
          headers: {
            "www-authenticate": `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource"`,
          },
        });
      }
      // Signed in: an MCP server with no tools.
      const call = (await request.json()) as {
        id?: number | string;
        method: string;
        params?: { protocolVersion?: string };
      };
      if (call.id === undefined) {
        return new Response(null, { status: 202 });
      }
      const results: Record<string, object> = {
        initialize: {
          protocolVersion: call.params?.protocolVersion,
          capabilities: { tools: {} },
          serverInfo: { name: "probe-oauth", version: "1" },
        },
        "tools/list": { tools: [] },
      };
      return Response.json({
        jsonrpc: "2.0",
        id: call.id,
        result: results[call.method] ?? {},
      });
    },
  });
}

/**
 * cawco.dev's hand-back, served to this browser from the site's own pages
 * and scripts (`site/oauth/*.html`, `site/src/oauth/*.ts`, bundled now), and
 * the provider's sign-in page, whose Approve sends the code to the
 * hand-back as a provider does. The workspace reaches neither host, so
 * the context's routing stands in for the network, not for the pages.
 */
async function handBack(page: Page) {
  const site = join(ROOT, "site");
  const script = async (name: string) => {
    const built = await Bun.build({
      entrypoints: [join(site, "src", "oauth", `${name}.ts`)],
      target: "browser",
      format: "esm",
    });
    if (!(built.success && built.outputs[0])) {
      throw new Error(
        `site/src/oauth/${name}.ts did not bundle: ${built.logs.join("; ")}`
      );
    }
    return built.outputs[0].text();
  };
  const files: Record<string, { body: string; type: string }> = {
    "/oauth/start": {
      body: await Bun.file(join(site, "oauth", "start.html")).text(),
      type: "text/html",
    },
    "/oauth/callback": {
      body: await Bun.file(join(site, "oauth", "callback.html")).text(),
      type: "text/html",
    },
    "/src/oauth/start.ts": {
      body: await script("start"),
      type: "text/javascript",
    },
    "/src/oauth/callback.ts": {
      body: await script("callback"),
      type: "text/javascript",
    },
  };
  await page.context().route("https://cawco.dev/**", (route) => {
    const file = files[new URL(route.request().url()).pathname];
    return file
      ? route.fulfill({ status: 200, contentType: file.type, body: file.body })
      : route.fulfill({ status: 404, body: "" });
  });
  await page.context().route(`${PROVIDER_PAGE}/**`, (route) => {
    const asked = new URL(route.request().url()).searchParams;
    const back = new URL(asked.get("redirect_uri") ?? "");
    back.searchParams.set("code", "probe-code");
    back.searchParams.set("state", asked.get("state") ?? "");
    return route.fulfill({
      status: 200,
      contentType: "text/html",
      body: `<!doctype html><title>Probe provider</title><p>Let CawCo use probe-oauth?</p><a id="approve" href="${back.href.replaceAll('"', "&quot;")}">Approve</a>`,
    });
  });
}

/**
 * #10 Sign in to an OAuth MCP server, every state on the one button: the
 * provider opens in a tab of its own and this page stays; the start held
 * (Sign in waits), refused (the reason under it, the tab gone), a tab
 * closed at the provider (said under the button), and signed in: approved
 * at the provider, handed back through cawco.dev to this hub, the tab
 * closing itself, and the row turning on the hub's word.
 */
async function mcpSignIn(kit: Kit, fleet: KitFleet, page: Page, base: string) {
  const provider = oauthProvider();
  await handBack(page);
  try {
    await fetch(`${fleet.base}/api/fleet/mcp/probe-oauth`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        config: { type: "http", url: `http://127.0.0.1:${provider.port}/mcp` },
        enabled: true,
        projectId: null,
      }),
    });
    await until(
      "the hub reading probe-oauth as an OAuth server",
      () =>
        fleet
          .api<{
            config: { mcp: { name: string; auth?: { mode?: string } }[] };
          }>("/api/fleet")
          .then(
            (fleetRow) =>
              fleetRow.config.mcp.find((one) => one.name === "probe-oauth")
                ?.auth?.mode
          ),
      (mode) => mode === "oauth",
      60_000
    );
    const starts = await gate(
      page,
      "**/api/fleet/mcp/probe-oauth/sign-in",
      "POST"
    );
    await open(
      page,
      `${base}/config/mcp`,
      'button[aria-label="More for probe-oauth"]'
    );
    const row = page.locator("li", {
      has: page.locator('button[aria-label="More for probe-oauth"]'),
    });
    const read = () =>
      row.evaluate((li) => ({
        words: li.textContent?.replace(/\s+/g, " ").trim() ?? "",
        busy: li.querySelector('[aria-busy="true"]') !== null,
        fault:
          li
            .querySelector(".sign-in-fault")
            ?.textContent?.replace(/\s+/g, " ")
            .trim() ?? null,
        path: location.pathname,
        rejections: (window as unknown as { __rejections: string[] })
          .__rejections.length,
      }));
    /** Presses `button` in the row; resolves with the tab the press opened. */
    const press = async (button: ReturnType<Page["locator"]>) => {
      const [tab] = await Promise.all([
        page.context().waitForEvent("page"),
        button.click(),
      ]);
      return tab;
    };
    const tryAgain = row
      .locator(".sign-in-fault")
      .getByRole("button", { name: TRY_AGAIN });

    // ── Held: the provider's tab is open, this page waits ────────────────
    const first = await press(row.getByRole("button", { name: SIGN_IN }));
    await starts.waitHeld();
    const pending = await read();
    note(kit, "mcp sign-in, before the hub answers", pending);
    kit.check(
      "Sign in: the provider gets a tab of its own and this page stays; Sign in waits busy, naming the server",
      pending.busy &&
        pending.path === "/config/mcp" &&
        !first.isClosed() &&
        pending.words.includes("Waiting for probe-oauth"),
      JSON.stringify(pending)
    );

    // ── Refused: the hub's reason under the button, the tab gone ─────────
    await starts.refuse(409, SIGN_IN_REFUSAL);
    await row.getByText(SIGN_IN_REFUSAL).waitFor();
    const refused = { ...(await read()), tabClosed: first.isClosed() };
    note(kit, "mcp sign-in, refused", refused);
    kit.check(
      "Sign in: refused, the hub's reason under the button with Try again, its tab closed, the page where it was",
      (refused.fault ?? "").includes(SIGN_IN_REFUSAL) &&
        refused.tabClosed &&
        refused.path === "/config/mcp" &&
        refused.rejections === 0,
      JSON.stringify(refused)
    );

    // ── Closed at the provider: said under the button ────────────────────
    starts.open();
    const second = await press(tryAgain);
    await second.waitForURL(`${PROVIDER_PAGE}/**`, { timeout: 30_000 });
    const waiting = await read();
    await second.close();
    await row.getByText(TAB_CLOSED).waitFor({ timeout: 15_000 });
    const unfinished = await read();
    note(kit, "mcp sign-in, at the provider, then its tab closed", {
      waiting,
      unfinished,
    });
    kit.check(
      "Sign in: at the provider the page stays waiting; the tab closed before it finished is said under the button, with Try again",
      waiting.busy &&
        waiting.path === "/config/mcp" &&
        (unfinished.fault ?? "").includes("closed before it finished") &&
        !unfinished.busy &&
        unfinished.rejections === 0,
      JSON.stringify({ waiting, unfinished })
    );

    // ── Signed in: approved, handed back, the row turns ──────────────────
    const third = await press(tryAgain);
    await third.waitForURL(`${PROVIDER_PAGE}/**`, { timeout: 30_000 });
    await third.click("#approve");
    // The hand-back asks before it sends a code to a hub it has not seen.
    await third.waitForURL("https://cawco.dev/oauth/callback**");
    await third.getByRole("button", { name: CONTINUE_TO_HUB }).click();
    await third.waitForEvent("close", { timeout: 30_000 });
    await row.getByText(SIGNED_IN_ROW).waitFor({ timeout: 30_000 });
    const signedIn = await read();
    const hubSays = await fleet
      .api<{
        config: {
          mcp: { name: string; auth?: { state?: string } }[];
        };
      }>("/api/fleet")
      .then(
        (fleetRow) =>
          fleetRow.config.mcp.find((one) => one.name === "probe-oauth")?.auth
            ?.state
      );
    note(kit, "mcp sign-in, signed in", { ...signedIn, hubSays });
    kit.check(
      "Sign in: approved and handed back, the sign-in tab closes itself and the row says signed in on the hub's word, this page where it was, no fault",
      signedIn.words.includes("Signed in for the fleet") &&
        signedIn.fault === null &&
        hubSays === "signed-in" &&
        signedIn.path === "/config/mcp" &&
        signedIn.rejections === 0,
      JSON.stringify({ ...signedIn, hubSays })
    );
  } finally {
    await provider.stop(true);
  }
}

const spec: Spec = {
  name: "stay-in-context",
  run: async (kit) => {
    let respond: (request: Seen) => Reply = () => ({
      everyMs: 5,
      words: ["ok"],
    });
    const fleet: KitFleet = await kit.fleet((request) => respond(request));
    respond = respondIn(fleet.workdir);
    fleet.launch("sessiond");
    await fleet.sessiondUp();
    fleet.launch("hub");
    await fleet.hubUp();
    fleet.fileAccount();
    fleet.launch("agent");
    await fleet.agentUp();
    await fleet.accountSignedIn();

    // One session to stop, rename and delete; one to archive; one asking.
    const kept = await fleet.spawn("claude", "Probe keeper");
    const filed = await fleet.spawn("claude", "Probe filer");
    const asker = await fleet.spawn("claude", "Probe asker", fleet.workdir, {
      permissionMode: "default",
    });
    await fleet.send(kept, "hello");
    await fleet.send(filed, "hello");
    await fleet.send(asker, `${ASK} write the file`);
    const turnEnded = (id: string) =>
      until(
        "the turn ended",
        () => fleet.instance(id),
        (row) => row?.turn_open_at === null,
        120_000
      );
    await turnEnded(kept);
    await turnEnded(filed);

    const base = await fleet.dashboard();
    const page = await kit.page("desk", {
      theme: "light",
      init: [
        () => {
          const seen: string[] = [];
          (window as unknown as { __rejections: string[] }).__rejections = seen;
          addEventListener(
            "unhandledrejection",
            (event: PromiseRejectionEvent) => {
              seen.push(
                event.reason instanceof Error
                  ? (event.reason.stack ?? String(event.reason))
                  : String(event.reason)
              );
            }
          );
        },
      ],
    });
    const socket = wire(page);
    await socket.ready;
    await open(page, base, "[data-needs-caw]");
    await finishedTab(page);
    await page.waitForSelector(`[data-hover-session="${kept}"]`, {
      timeout: 60_000,
    });
    const read = (id: string) => page.evaluate(rowState, id);
    const path = new URL(page.url()).pathname;

    // ── Stop ─────────────────────────────────────────────────────────────
    // A stop's pending word is the hub's own `stopping` status, published
    // the moment the hub records the stop and held until the machine
    // confirms the process ended (session-acts.svelte.ts `stopOnRow`,
    // SessionRow's `pending`): refused at the wire, the stop never reaches
    // the hub; reaching it with the machine frozen, it waits on the machine.
    note(kit, "the keeper on the hub before Stop", fleet.instance(kept));
    socket.hold((frame) => frame.verb === "stop");
    await rightClickRow(page, kept);
    await menuItem(page, STOP_ITEM);
    await until(
      "the stop held at the wire",
      () => socket.held.length,
      (held) => held === 1,
      30_000
    );
    note(kit, "frames the page sent", socket.sent.slice(-20));
    socket.refuseHeld(errorFrame(STOP_REFUSAL));
    await page.waitForSelector(`.row-fault >> text=${STOP_REFUSAL}`);
    const stopRefused = await read(kept);
    note(kit, "stop, refused", stopRefused);
    kit.check(
      "Stop: refused, the reason stands under the row with Try again, the row and page where they were, no unhandled rejection",
      stopRefused.present &&
        stopRefused.doing === null &&
        stopRefused.faults.some((text) => text.includes(STOP_REFUSAL)) &&
        stopRefused.tryAgain &&
        stopRefused.path === path &&
        stopRefused.rejections === 0,
      JSON.stringify(stopRefused)
    );
    socket.passAll();
    // The machine cannot confirm while frozen: the hub holds `stopping`.
    fleet.freeze("agent", true);
    try {
      await page
        .locator(".row-fault", { hasText: STOP_REFUSAL })
        .getByRole("button", { name: TRY_AGAIN })
        .click();
      await page.waitForFunction(
        (id) =>
          document
            .querySelector(`[data-hover-session="${id}"]`)
            ?.closest(".item")
            ?.querySelector(".doing")
            ?.textContent?.includes("Stopping…") ?? false,
        kept
      );
      // The refusal folds away (RowFault's `unfold`) as the stop goes again.
      await page
        .locator(".row-fault", { hasText: STOP_REFUSAL })
        .waitFor({ state: "detached" });
      const stopBefore: RowState = await read(kept);
      note(kit, "stop, before the machine answers", stopBefore);
      kit.check(
        "Stop: before the machine answers, the row says Stopping…, its fault gone, the hub says stopping and nothing says stopped",
        stopBefore.doing === "Stopping…" &&
          stopBefore.busy === "true" &&
          stopBefore.faults.length === 0 &&
          !(stopBefore.title ?? "").startsWith("Stopped") &&
          fleet.instance(kept)?.status === "stopping",
        JSON.stringify({ ...stopBefore, hub: fleet.instance(kept)?.status })
      );
    } finally {
      fleet.freeze("agent", false);
    }
    await until(
      "the session stopped",
      () => fleet.instance(kept)?.status,
      (status) => status === "stopped",
      60_000
    );
    await page.waitForFunction(
      (id) =>
        !document
          .querySelector(`[data-hover-session="${id}"]`)
          ?.closest(".item")
          ?.querySelector(".doing"),
      kept
    );
    await page.waitForTimeout(400);
    const stopDone = await read(kept);
    note(kit, "stop, confirmed", stopDone);
    kit.check(
      "Stop: confirmed by the machine, the row is stopped, its fault gone",
      stopDone.present &&
        stopDone.doing === null &&
        stopDone.faults.length === 0 &&
        (stopDone.title ?? "").startsWith("Stopped") &&
        stopDone.rejections === 0,
      JSON.stringify(stopDone)
    );

    // ── Rename ───────────────────────────────────────────────────────────
    let holdRename = true;
    const renamesHeld: Route[] = [];
    await page.route(`**/api/instances/${kept}`, async (route) => {
      if (route.request().method() === "PATCH" && holdRename) {
        renamesHeld.push(route);
        return;
      }
      await route.continue();
    });
    const named = await page.evaluate(
      (id) =>
        document
          .querySelector(`[data-hover-session="${id}"] .title`)
          ?.lastChild?.textContent?.trim() ?? "",
      kept
    );
    await rightClickRow(page, kept);
    await menuItem(page, RENAME_ITEM);
    await page.waitForSelector('input[aria-label="Session title"]');
    await page.waitForTimeout(300);
    const renameOpen = await read(kept);
    note(kit, "rename, the field in the row", { ...renameOpen, named });
    kit.check(
      "Rename: the title becomes a field where it stands, holding the name, focused",
      renameOpen.field !== null &&
        renameOpen.field.value === named &&
        renameOpen.field.focused &&
        renameOpen.path === path &&
        (await page.locator('[role="dialog"]').count()) === 0,
      JSON.stringify(renameOpen)
    );
    await page.fill('input[aria-label="Session title"]', "Probe renamed");
    await page.press('input[aria-label="Session title"]', "Enter");
    await until(
      "the rename held",
      () => renamesHeld.length,
      (n) => n === 1
    );
    const renameBefore = await read(kept);
    note(kit, "rename, before the hub answers", renameBefore);
    kit.check(
      "Rename: before the hub answers, the field holds the new name, read-only, and the hub still has the old",
      renameBefore.field?.value === "Probe renamed" &&
        renameBefore.field.readonly &&
        fleet.query<{ title: string | null }>(
          "SELECT title FROM instances WHERE id = ?",
          kept
        )[0]?.title !== "Probe renamed",
      JSON.stringify(renameBefore)
    );
    await Promise.all(
      renamesHeld.splice(0).map((route) =>
        route.fulfill({
          status: 409,
          contentType: "text/plain",
          body: RENAME_REFUSAL,
        })
      )
    );
    await page.waitForSelector(`.row-fault >> text=${RENAME_REFUSAL}`);
    const renameRefused = await read(kept);
    note(kit, "rename, refused", renameRefused);
    kit.check(
      "Rename: refused, the field keeps what was typed and the hub's reason stands under the row with Try again",
      renameRefused.field?.value === "Probe renamed" &&
        !renameRefused.field.readonly &&
        renameRefused.faults.some((text) => text.includes(RENAME_REFUSAL)) &&
        renameRefused.tryAgain &&
        renameRefused.path === path &&
        renameRefused.rejections === 0,
      JSON.stringify(renameRefused)
    );
    holdRename = false;
    await page
      .locator(".row-fault", { hasText: RENAME_REFUSAL })
      .getByRole("button", { name: TRY_AGAIN })
      .click();
    await page.waitForFunction(
      () => !document.querySelector('input[aria-label="Session title"]')
    );
    await page.waitForTimeout(400);
    const renameDone = await read(kept);
    note(kit, "rename, confirmed", renameDone);
    kit.check(
      "Rename: confirmed, the field gives way to the name the hub now holds",
      renameDone.field === null &&
        (renameDone.title ?? "").includes("Probe renamed") &&
        renameDone.faults.length === 0 &&
        fleet.query<{ title: string | null }>(
          "SELECT title FROM instances WHERE id = ?",
          kept
        )[0]?.title === "Probe renamed",
      JSON.stringify(renameDone)
    );

    // ── Delete transcript, under the row ────────────────────────────────
    await rowQuestion(kit, page, deleteOnRow(socket, page, kept, "Delete"));

    // ── Archive ─────────────────────────────────────────────────────────
    const seenHeld: Route[] = [];
    /** Whether an archive is held: true until Try again lets it through. */
    const seenRule: { hold: boolean } = { hold: Boolean(filed) };
    await page.route("**/api/seen", async (route) => {
      const body = route.request().postDataJSON() as { kind: string };
      if (seenRule.hold && body.kind === "archive") {
        seenHeld.push(route);
        return;
      }
      await route.continue();
    });
    const filedRow = page
      .locator(`.item:has([data-hover-session="${filed}"])`)
      .first();
    await filedRow.hover();
    await filedRow.locator("button.archive").click();
    await until(
      "the archive held",
      () => seenHeld.length,
      (n) => n === 1
    );
    await page.waitForTimeout(200);
    const archiveBefore = await read(filed);
    note(kit, "archive, before the hub answers", archiveBefore);
    kit.check(
      "Archive: before the hub answers, the row stays, saying Archiving…",
      archiveBefore.present && archiveBefore.doing === "Archiving…",
      JSON.stringify(archiveBefore)
    );
    await Promise.all(
      seenHeld.splice(0).map((route) =>
        route.fulfill({
          status: 409,
          contentType: "text/plain",
          body: ARCHIVE_REFUSAL,
        })
      )
    );
    await page.waitForSelector(".row-fault >> text=it is mid-turn");
    const archiveRefused = await read(filed);
    note(kit, "archive, refused", archiveRefused);
    kit.check(
      "Archive: refused, the row stays with the hub's reason under it and Try again, no unhandled rejection",
      archiveRefused.present &&
        archiveRefused.doing === null &&
        archiveRefused.faults.some((text) => text.includes("it is mid-turn")) &&
        archiveRefused.tryAgain &&
        archiveRefused.path === path &&
        archiveRefused.rejections === 0,
      JSON.stringify(archiveRefused)
    );
    seenRule.hold = false;
    await page
      .locator(".row-fault", { hasText: "it is mid-turn" })
      .getByRole("button", { name: TRY_AGAIN })
      .click();
    await page.waitForFunction(
      (id) => !document.querySelector(`[data-hover-session="${id}"]`),
      filed,
      { timeout: 30_000 }
    );
    const archiveDone = await read(filed);
    const seenAt = fleet.query<{ seen_at: number | null }>(
      "SELECT seen_at FROM instances WHERE id = ?",
      filed
    )[0]?.seen_at;
    note(kit, "archive, confirmed", { ...archiveDone, seenAt });
    kit.check(
      "Archive: confirmed, the row leaves Finished and the hub holds it seen",
      !archiveDone.present && Boolean(seenAt) && archiveDone.rejections === 0,
      JSON.stringify({ ...archiveDone, seenAt })
    );

    // ── Approve, in the Needs panel ─────────────────────────────────────
    await page.click("[data-needs-caw]");
    const ask = page.locator('.caw-pop .row[data-kind="ask"]').first();
    await ask.waitFor({ timeout: 120_000 });
    socket.hold(
      (frame) => frame.type === "command" && frame.kind === "permission.answer"
    );
    await ask.locator(".peers .approve").click();
    await until(
      "the answer held",
      () => socket.held.length,
      (n) => n === 1
    );
    const peers = () =>
      ask.evaluate((row) => ({
        approve: {
          busy: row.querySelector(".approve")?.getAttribute("aria-busy"),
          text: row.querySelector(".approve")?.textContent?.trim(),
        },
        deny: {
          disabled: (row.querySelector(".deny") as HTMLButtonElement | null)
            ?.disabled,
        },
        refusal: row.querySelector(".refusal")?.textContent?.trim() ?? null,
        rejections: (window as unknown as { __rejections: string[] })
          .__rejections.length,
      }));
    const answerBefore = await peers();
    note(kit, "approve, before the hub answers", answerBefore);
    kit.check(
      "Approve: before the hub answers, the row stands, Approve pending and Deny held",
      answerBefore.approve.busy === "true" &&
        answerBefore.deny.disabled === true &&
        answerBefore.refusal === null,
      JSON.stringify(answerBefore)
    );
    socket.refuseHeld((frame) => ({
      type: "command.ack",
      commandId: frame.commandId,
      stage: "failed",
      reason: ANSWER_REFUSAL,
    }));
    await ask.getByText(ANSWER_REFUSAL).waitFor();
    const answerRefused = await peers();
    note(kit, "approve, refused", answerRefused);
    kit.check(
      "Approve: refused, the row stands with the hub's reason, both peers free again, no unhandled rejection",
      (answerRefused.refusal ?? "").includes(ANSWER_REFUSAL) &&
        answerRefused.approve.busy !== "true" &&
        answerRefused.deny.disabled === false &&
        answerRefused.rejections === 0,
      JSON.stringify(answerRefused)
    );
    socket.passAll();
    await ask.locator(".peers .approve").click();
    await page.waitForFunction(
      () => !document.querySelector('.caw-pop .row[data-kind="ask"]'),
      null,
      { timeout: 60_000 }
    );
    kit.check(
      "Approve: confirmed, the row leaves once the hub has taken the answer",
      (await rejectionsOf(page)).length === 0,
      "the row left"
    );
    await page.keyboard.press("Escape");

    await sessionQuestions(kit, fleet, page, base, socket);
    await accountMove(kit, fleet, page, base);
    await workflowCancel(kit, fleet, page, base);
    await projectFlows(kit, fleet, page, base);
    await cawOff(kit, fleet, page, base);
    await configureFlows(kit, fleet, page, base);
    await unlinkMarketplace(kit, fleet, page, base);
    await editorDelete(kit, fleet, page, base);
    await adoptFromMachine(kit, fleet, page, base);
    await mcpSignIn(kit, fleet, page, base);
    await offerJoin(kit, fleet, page, base);
    await moveFlows(kit, fleet, page, base);
    await removeFlows(kit, fleet, page, base);

    const rejections = await rejectionsOf(page);
    kit.check(
      "nothing reached the unhandled-rejection reporter, in any flow",
      rejections.length === 0,
      JSON.stringify(rejections)
    );
    await page.screenshot({ path: `${kit.out}/end.png` });
  },
};

export default spec;
