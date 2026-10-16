/**
 * Three things a thread with a project's Caw draws, as decided and built
 * on 2026-10-16, on the built dashboard against a scratch fleet, at the
 * desk (1440) and the phone (390):
 *
 * 1. A routine notice's Open goes to the routines view: pressed, the page
 *    is the project's Routines tab (`?view=routines&routine=<id>`) with that
 *    routine's row open and in the viewport.
 * 2. Caw's task cards say what they are (the owner, 10-14: "dont' have
 *    matching heights, and there's no indication what they mean"): the head
 *    reads "Filed 3 tasks · <stage>", every card is one height
 *    (getBoundingClientRect), the title over the mono id, and "Open the
 *    board" under them.
 * 3. A folder file opens in the page (DESIGN.md, The Open Page Rule): no
 *    scrim or overlay is drawn, the file shows beside the thread on the desk
 *    and on the sheet over the composer on the phone, and the thread under
 *    it still takes a press (elementFromPoint reaches the transcript) and
 *    scrolls (a wheel there moves its scroller).
 *
 * The thread, its notice, the replies naming the tasks and the file are
 * written to the hub's store as the hub keeps them; the tasks, the routine's
 * schedule and the file go through the hub.
 */
// biome-ignore-all lint/performance/noAwaitInLoops: one page, one width at a time
import type { Page } from "playwright-core";
import { type Fleet, MACHINE, type Seen } from "../../../scratch-fleet";
import { type Kit, open, type Spec, settle, type View } from "../../kit";

const DAY = 24 * 60 * 60 * 1000;
const ROUTINE = "routine-weekly-digest";
const FILE = "notes/plan.md";
const FILLER = 30;
/** Titles of three lengths: one line, two lines clamped, and between. */
const TITLES = [
  "Fix the login redirect",
  "Write the migration that moves every stored session's account into the new accounts table, then drop the old column once nothing reads it",
  "Add a retry to the relay's reconnect",
];

const spread = (values: number[]) =>
  values.length === 0 || values.some(Number.isNaN)
    ? Number.POSITIVE_INFINITY
    : Math.max(...values) - Math.min(...values);

/** The cards under his reply: their heights, the head's words, the order of title and id. */
const cardsOf = (page: Page) =>
  page.evaluate(() => {
    const block = document.querySelector("[data-thread-tasks]");
    const cards = [...(block?.querySelectorAll(".task-card") ?? [])];
    return {
      head:
        (
          block?.querySelector("[data-tasks-head]") as HTMLElement | null
        )?.innerText
          .replace(/\s+/g, " ")
          .trim() ?? null,
      heights: cards.map((card) => card.getBoundingClientRect().height),
      titleFirst: cards.map(
        (card) =>
          card.firstElementChild?.classList.contains("title") === true &&
          card.querySelector(".head .id") !== null
      ),
      board:
        [...(block?.querySelectorAll("a") ?? [])].find(
          (link) => (link as HTMLElement).innerText.trim() === "Open the board"
        ) !== undefined,
    };
  });

/**
 * With the file open: whether anything blocks the page (a scrim, an
 * overlay, a modal), where the file stands, and what a point in the
 * thread's transcript reaches.
 */
const fileOpenOf = (page: Page) =>
  page.evaluate(() => {
    const shown = (el: Element) => {
      const box = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return (
        box.width > 0 &&
        box.height > 0 &&
        style.visibility !== "hidden" &&
        Number(style.opacity) > 0
      );
    };
    // A scrim or overlay drawn over the page; that the page under the file
    // still takes a press is read by elementFromPoint below.
    const blockers = [
      ...document.querySelectorAll(
        "[data-slot='sheet-overlay'], [data-slot='drawer-overlay'], [data-slot='dialog-overlay'], .kit-scrim, [data-vaul-overlay]"
      ),
    ].filter(shown);
    const file = document.querySelector("[data-folder-file]");
    const fileBox = file?.closest(".side-card")?.getBoundingClientRect();
    // The thread's transcript: its rows' scroller, the one holding his reply.
    const scrolls = (el: HTMLElement) =>
      ["auto", "scroll"].includes(getComputedStyle(el).overflowY) &&
      el.scrollHeight > el.clientHeight;
    let scroller =
      document.querySelector<HTMLElement>("[data-folder-chip]")
        ?.parentElement ?? null;
    while (scroller && !scrolls(scroller)) {
      scroller = scroller.parentElement;
    }
    const box = scroller?.getBoundingClientRect();
    // A point in the transcript the file does not cover: its middle on a
    // desk (the file stands beside it), the room above the sheet on a phone.
    const x = box ? box.left + box.width / 2 : 0;
    const top = box ? box.top : 0;
    const bottom = Math.min(
      box?.bottom ?? 0,
      fileBox && fileBox.left < x && fileBox.right > x
        ? fileBox.top
        : innerHeight
    );
    const y = top + (bottom - top) / 2;
    const hit = document.elementFromPoint(x, y);
    return {
      blockers: blockers.map(
        (el) => el.getAttribute("data-slot") ?? el.className
      ),
      // What a screen reader is told of the sheet the file stands on.
      sheetModal:
        file
          ?.closest("[data-slot='drawer-content']")
          ?.getAttribute("aria-modal") ?? null,
      file: fileBox
        ? {
            left: fileBox.left,
            top: fileBox.top,
            width: fileBox.width,
            height: fileBox.height,
          }
        : null,
      words: file?.textContent?.includes("The plan, in three steps") ?? false,
      point: { x, y },
      reaches: Boolean(hit && scroller?.contains(hit)),
      inert: Boolean(hit?.closest("[inert]")),
      scrollTop: scroller?.scrollTop ?? Number.NaN,
      scrollable: Boolean(scroller),
    };
  });

async function thread(
  kit: Kit,
  view: View,
  base: string,
  ids: { projectId: string; threadId: string; stage: string }
) {
  const leg = `${view === "desk" ? "desk 1440" : "phone 390"}`;
  const page = await kit.page(view);
  await open(
    page,
    `${base}/session/thread:${ids.threadId}`,
    "[data-thread-tasks] .task-card"
  );
  await page.waitForFunction(
    (count) =>
      document.querySelectorAll("[data-thread-tasks] .task-card").length ===
      count,
    TITLES.length
  );
  await settle(page);

  // 2. The task cards.
  const cards = await cardsOf(page);
  kit.check(
    `${leg}: the cards' head reads "Filed ${TITLES.length} tasks · ${ids.stage}"`,
    cards.head === `Filed ${TITLES.length} tasks · ${ids.stage}`,
    JSON.stringify(cards.head)
  );
  kit.check(
    `${leg}: every card is one height (≤ 0.5px)`,
    cards.heights.length === TITLES.length && spread(cards.heights) <= 0.5,
    cards.heights.map((h) => h.toFixed(2)).join(",")
  );
  kit.check(
    `${leg}: each card's title stands over its mono id`,
    cards.titleFirst.length === TITLES.length &&
      cards.titleFirst.every(Boolean),
    JSON.stringify(cards.titleFirst)
  );
  kit.check(`${leg}: "Open the board" stands under the cards`, cards.board);

  // 3. The folder file, opened from its chip.
  await page.locator(`[data-folder-chip="${FILE}"]`).click();
  await page.waitForSelector("[data-folder-file]");
  await page.waitForFunction(() =>
    document
      .querySelector("[data-folder-file]")
      ?.textContent?.includes("The plan, in three steps")
  );
  await settle(page, 400);
  const before = await fileOpenOf(page);
  kit.check(
    `${leg}: the file opens with no scrim, overlay or modal`,
    before.blockers.length === 0,
    JSON.stringify(before.blockers)
  );
  kit.check(
    `${leg}: the file is drawn ${view === "desk" ? "beside the thread" : "on the sheet over the composer"}, its words read`,
    before.file !== null &&
      before.words &&
      (view === "desk"
        ? before.file.left > before.point.x
        : before.file.top > before.point.y),
    JSON.stringify(before.file)
  );
  kit.check(
    `${leg}: a point in the thread's transcript reaches the transcript (elementFromPoint), nothing inert`,
    before.reaches && !before.inert,
    JSON.stringify(before.point)
  );
  if (view === "phone") {
    kit.check(
      `${leg}: the sheet the file stands on is not aria-modal="true" while the page under it takes presses`,
      before.sheetModal !== null &&
        before.sheetModal !== "true" &&
        before.reaches,
      JSON.stringify({ ariaModal: before.sheetModal, reaches: before.reaches })
    );
  }
  await page.mouse.move(before.point.x, before.point.y);
  await page.mouse.wheel(0, -400);
  await settle(page, 300);
  const after = await fileOpenOf(page);
  kit.check(
    `${leg}: the transcript under the open file still scrolls`,
    before.scrollable && Math.abs(after.scrollTop - before.scrollTop) > 50,
    `${before.scrollTop.toFixed(0)} → ${after.scrollTop.toFixed(0)}`
  );
  kit.check(
    `${leg}: the file is still open after the scroll`,
    after.file !== null
  );

  // 1. The routine notice's Open.
  const notice = page.locator(`[data-routine-made="${ROUTINE}"]`);
  await notice.scrollIntoViewIfNeeded();
  await notice.getByRole("link", { name: "Open" }).click();
  await page.waitForURL(
    (url) =>
      url.pathname === `/project/${ids.projectId}` &&
      url.searchParams.get("routine") === ROUTINE
  );
  await page.waitForSelector(
    `tbody.routine[data-routine="${ROUTINE}"][data-state="open"]`
  );
  await settle(page, 300);
  const landed = await page.evaluate((id) => {
    const row = document.querySelector(
      `tbody.routine[data-routine="${id}"][data-state="open"]`
    );
    const box = row?.getBoundingClientRect();
    const url = new URL(location.href);
    return {
      path: url.pathname,
      view: url.searchParams.get("view"),
      routine: url.searchParams.get("routine"),
      open: Boolean(row),
      inView: Boolean(box && box.top < innerHeight && box.bottom > 0),
    };
  }, ROUTINE);
  kit.check(
    `${leg}: the notice's Open lands on /project/<id>?view=routines&routine=<id>`,
    landed.path === `/project/${ids.projectId}` &&
      landed.view === "routines" &&
      landed.routine === ROUTINE,
    JSON.stringify(landed)
  );
  kit.check(
    `${leg}: the routine's row is open and in the viewport`,
    landed.open && landed.inView,
    JSON.stringify(landed)
  );
  await page.close();
}

/**
 * Where the thread has no split (Caw's panel floating over the project page,
 * desk 1440): the file opens in the thread's own place, no scrim, the page
 * around the panel still takes a press, and Close gives back the thread at
 * the scroll it had.
 */
async function inPlace(kit: Kit, base: string, projectId: string) {
  const leg = "desk 1440, Caw's panel";
  const page = await kit.page("desk");
  const seat = ".project-head button.caw-seat";
  await open(page, `${base}/project/${projectId}`, seat);
  await settle(page, 400);
  await page.click(seat);
  const chip = `[data-caw-panel] [data-folder-chip="${FILE}"]`;
  await page.waitForSelector(chip, { timeout: 30_000 });
  await settle(page, 400);
  /** The thread's transcript scroller: its scroll, moved first by `by`. */
  const scrollOf = (by = 0) =>
    page.evaluate((move) => {
      const reply = document.querySelector(
        "[data-caw-panel] [data-folder-chip]"
      );
      let el: HTMLElement | null = reply?.parentElement ?? null;
      while (
        el &&
        !(
          el.scrollHeight > el.clientHeight &&
          getComputedStyle(el).overflowY !== "visible"
        )
      ) {
        el = el.parentElement;
      }
      if (el && move) {
        el.scrollTop += move;
      }
      return el?.scrollTop ?? Number.NaN;
    }, by);
  await page.locator(chip).click();
  await page.waitForFunction(() =>
    document
      .querySelector("[data-file-in-place] [data-folder-file]")
      ?.textContent?.includes("The plan, in three steps")
  );
  await settle(page, 400);
  const opened = await page.evaluate(() => {
    const panel = document
      .querySelector("[data-caw-panel]")
      ?.getBoundingClientRect();
    const place = document
      .querySelector("[data-file-in-place]")
      ?.getBoundingClientRect();
    const blockers = [
      ...document.querySelectorAll(
        "[data-slot='sheet-overlay'], [data-slot='drawer-overlay'], [data-slot='dialog-overlay'], .kit-scrim, [data-vaul-overlay]"
      ),
    ].filter((el) => el.getBoundingClientRect().width > 0);
    // The page around the panel: a point halfway across the wider side it
    // leaves.
    const left = panel?.left ?? 0;
    const right = panel?.right ?? 0;
    const x =
      left > innerWidth - right ? left / 2 : (right + innerWidth) / 2;
    const y = innerHeight / 2;
    const hit = document.elementFromPoint(x, y);
    return {
      blockers: blockers.length,
      inPanel: Boolean(
        panel &&
        place &&
        place.left >= panel.left - 0.5 &&
        place.right <= panel.right + 0.5
      ),
      pageHit: Boolean(
        hit && !hit.closest("[data-caw-panel]") && !hit.closest("[inert]")
      ),
    };
  });
  kit.check(
    `${leg}: the file opens in the thread's own place, inside the panel, with no scrim or overlay`,
    opened.inPanel && opened.blockers === 0,
    JSON.stringify(opened)
  );
  kit.check(
    `${leg}: the page around the panel still takes a press (elementFromPoint reaches it)`,
    opened.pageHit,
    JSON.stringify(opened)
  );
  // The chip is in the newest reply, so it is pressed at the tail; the
  // transcript under the file is put away from it, so the scroll Close
  // must give back is not the tail it would ride to anyway.
  const tail = await scrollOf();
  const scrolled = await scrollOf(-300);
  await settle(page, 300);
  await page.click("[data-file-in-place] .side-head button.close");
  await page.waitForSelector("[data-file-in-place]", { state: "detached" });
  await settle(page, 300);
  const back = await scrollOf();
  kit.check(
    `${leg}: Close gives back the thread at the scroll it had (≤ 1px)`,
    Number.isFinite(scrolled) &&
      tail - scrolled > 100 &&
      Math.abs(back - scrolled) <= 1,
    `tail ${tail}, under the file ${scrolled} → ${back}`
  );
  await page.close();
}

/** The routine, written as the hub keeps it, then given its real schedule through the hub. */
async function seedRoutine(fleet: Fleet, projectId: string) {
  const now = Date.now();
  fleet.write(
    "INSERT INTO routines (id, project_id, name, cron, time_zone, target, prompt, lands, enabled, created_by, keep, expires_at, next_slot, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'none', 1, 'session', 0, ?, ?, ?)",
    ROUTINE,
    projectId,
    "Weekly digest",
    "0 0 1 1 *",
    "UTC",
    "delegate",
    "Write the week's digest.",
    now + 7 * DAY,
    now + 365 * DAY,
    now - DAY
  );
  const response = await fetch(`${fleet.base}/api/routines/${ROUTINE}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ cron: "0 9 * * 1" }),
  });
  if (!response.ok) {
    throw new Error(
      `PATCH routine: ${response.status} ${await response.text()}`
    );
  }
}

const spec: Spec = {
  name: "thread-surfaces",
  async run(kit) {
    const fleet = await kit.fleet((_: Seen) => ({
      everyMs: 20,
      words: ["Ready."],
    }));
    fleet.launch("sessiond");
    await fleet.sessiondUp();
    fleet.launch("hub");
    await fleet.hubUp();
    fleet.fileAccount();
    fleet.launch("agent");
    await fleet.agentUp();
    await fleet.accountSignedIn();
    const project = await fleet.api<{ id: string }>("/api/projects", {
      name: "cawco",
      machineId: MACHINE,
      cwd: fleet.repo,
      caw: false,
      template: "code",
    });
    const taskIds: string[] = [];
    for (const title of TITLES) {
      const made = await fleet.api<{ id: string }>(
        `/api/projects/${project.id}/tasks`,
        { title }
      );
      taskIds.push(made.id);
    }
    const { tasks } = await fleet.api<{
      tasks: { id: string; stage: string }[];
    }>(`/api/projects/${project.id}/tasks`);
    const stageName = tasks.find((task) => task.id === taskIds[0])?.stage ?? "";
    const words = stageName.replace(/[-_]+/g, " ").trim();
    const stage = words ? words[0].toUpperCase() + words.slice(1) : "";
    await seedRoutine(fleet, project.id);
    const put = await fetch(
      `${fleet.base}/api/projects/${project.id}/folder/file`,
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          path: FILE,
          content: "# The plan, in three steps\n\n1. Read\n2. Write\n3. Ship\n",
        }),
      }
    );
    kit.check(
      "hub: the folder file is written",
      put.ok,
      `${put.status} ${put.ok ? "" : await put.text()}`
    );

    // The thread: enough said that its transcript scrolls, then the
    // routine's notice, the reply naming the tasks, the reply naming the file.
    const threadId = crypto.randomUUID();
    const at = Date.now() - 60 * 60 * 1000;
    fleet.write(
      "INSERT INTO project_threads (id, project_id, title, setup, created_at, updated_at) VALUES (?, ?, ?, 0, ?, ?)",
      threadId,
      project.id,
      "Plan the week",
      at,
      at + FILLER + 10
    );
    const message = (
      i: number,
      author: string,
      body: string,
      extra: {
        noteTitle?: string;
        event?: object;
        tasks?: string[];
        files?: string[];
      } = {}
    ) =>
      fleet.write(
        "INSERT INTO thread_messages (id, thread_id, author, body, note_title, event, tasks, files, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        crypto.randomUUID(),
        threadId,
        author,
        body,
        extra.noteTitle ?? null,
        extra.event ? JSON.stringify(extra.event) : null,
        extra.tasks ? JSON.stringify(extra.tasks) : null,
        extra.files ? JSON.stringify(extra.files) : null,
        at + i
      );
    for (let i = 0; i < FILLER; i += 1) {
      message(
        i,
        i % 2 === 0 ? "you" : "caw",
        i % 2 === 0
          ? `What's left on item ${i}?`
          : `Item ${i} has two parts left: the read and the write. Both are small, and neither waits on anything else.`
      );
    }
    message(FILLER, "event", "A session made a routine: Weekly digest.", {
      noteTitle: "Routine made",
      event: {
        kind: "routine-made",
        by: "session",
        expiresAt: Date.now() + 7 * DAY,
        instanceId: "probe-session",
        name: "Weekly digest",
        routineId: ROUTINE,
        schedule: {
          cron: "0 9 * * 1",
          nextAt: Date.now() + DAY,
          timeZone: "UTC",
          words: "At 09:00, on Monday (UTC)",
        },
        why: null,
      },
    });
    message(FILLER + 1, "caw", "I filed the three tasks we talked about.", {
      tasks: taskIds,
    });
    message(FILLER + 2, "caw", "The plan is written down.", {
      files: [FILE],
    });

    const base = await fleet.dashboard();
    const ids = { projectId: project.id, threadId, stage };
    await thread(kit, "desk", base, ids);
    await thread(kit, "phone", base, ids);
    await inPlace(kit, base, project.id);
  },
};
export default spec;
