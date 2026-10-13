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
import type { Page, Route, WebSocketRoute } from "playwright-core";
import { MACHINE, type Reply, type Seen, until } from "../../../scratch-fleet";
import { type Kit, type KitFleet, open, type Spec } from "../../kit";

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

/** Words for a turn; a tool call that needs a permission for the ask. */
const respondIn =
  (dir: string) =>
  (request: Seen): Reply =>
    request.tools && request.last.includes(ASK)
      ? {
          everyMs: 5,
          words: [],
          tool: {
            name: "Write",
            input: { file_path: `${dir}/probe.txt`, content: "probe" },
          },
        }
      : { everyMs: 5, words: ["ok"] };

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
              seen.push(String(event.reason));
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
    note(kit, "the keeper on the hub before Stop", fleet.instance(kept));
    socket.hold((frame) => frame.verb === "stop");
    await rightClickRow(page, kept);
    await menuItem(page, STOP_ITEM);
    await page.waitForFunction(
      (id) =>
        document
          .querySelector(`[data-hover-session="${id}"]`)
          ?.closest(".item")
          ?.querySelector(".doing")
          ?.textContent?.includes("Stopping…") ?? false,
      kept
    );
    const stopBefore: RowState = await read(kept);
    note(kit, "stop, before the machine answers", stopBefore);
    note(kit, "frames the page sent", socket.sent.slice(-20));
    kit.check(
      "Stop: before the machine answers, the row says Stopping… and nothing says stopped",
      stopBefore.doing === "Stopping…" &&
        stopBefore.busy === "true" &&
        socket.held.length === 1 &&
        fleet.instance(kept)?.status === "running",
      JSON.stringify({ ...stopBefore, hub: fleet.instance(kept)?.status })
    );
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
    await page
      .locator(".row-fault", { hasText: STOP_REFUSAL })
      .getByRole("button", { name: TRY_AGAIN })
      .click();
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

    // ── Delete transcript ───────────────────────────────────────────────
    socket.hold(
      (frame) =>
        frame.verb === "control" &&
        (frame.payload as { method?: string } | undefined)?.method ===
          "deleteSession"
    );
    await rightClickRow(page, kept);
    await menuItem(page, DELETE_ITEM);
    const dialog = page.getByRole("alertdialog");
    await dialog.waitFor();
    await dialog.getByRole("button", { name: DELETE_ITEM }).click();
    await until(
      "the delete held",
      () => socket.held.length,
      (n) => n === 1
    );
    const deleteBefore = {
      ...(await read(kept)),
      dialog: await dialog.isVisible(),
      // Its label morphs to "Deleting…"; the busy state is the engine's word.
      busy: await dialog
        .getByRole("button", { name: DELETE_ITEM })
        .or(dialog.locator('[aria-busy="true"]'))
        .first()
        .getAttribute("aria-busy"),
    };
    note(kit, "delete, before the machine answers", deleteBefore);
    kit.check(
      "Delete: before the machine answers, the question stays open, Deleting…, the row in its place",
      deleteBefore.dialog &&
        deleteBefore.busy === "true" &&
        deleteBefore.present,
      JSON.stringify(deleteBefore)
    );
    socket.refuseHeld(errorFrame(DELETE_REFUSAL));
    await dialog.getByText(DELETE_REFUSAL).waitFor();
    const deleteRefused = {
      ...(await read(kept)),
      dialog: await dialog.isVisible(),
    };
    note(kit, "delete, refused", deleteRefused);
    kit.check(
      "Delete: refused, the question stays with the machine's reason under it, the row in its place, no unhandled rejection",
      deleteRefused.dialog &&
        deleteRefused.present &&
        deleteRefused.rejections === 0,
      JSON.stringify(deleteRefused)
    );
    socket.passAll();
    await dialog.getByRole("button", { name: DELETE_ITEM }).click();
    await dialog.waitFor({ state: "hidden", timeout: 60_000 });
    // The row leaves when the hub drops it on the machine's word.
    const gone = await page
      .waitForFunction(
        (id) => !document.querySelector(`[data-hover-session="${id}"]`),
        kept,
        { timeout: 30_000 }
      )
      .then(
        () => true,
        () => false
      );
    const deleteDone = await read(kept);
    note(kit, "delete, confirmed", deleteDone);
    kit.check(
      "Delete: confirmed by the machine, the question closes and the row leaves; no unhandled rejection",
      gone && !deleteDone.present && deleteDone.rejections === 0,
      JSON.stringify(deleteDone)
    );

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
    const rejections = await page.evaluate(
      () => (window as unknown as { __rejections: string[] }).__rejections
    );
    kit.check(
      "Approve: confirmed, the row leaves once the hub has taken the answer",
      rejections.length === 0,
      JSON.stringify({ rejections })
    );
    kit.check(
      "nothing reached the unhandled-rejection reporter, in any flow",
      rejections.length === 0,
      JSON.stringify(rejections)
    );
    await page.screenshot({ path: `${kit.out}/end.png` });
  },
};

export default spec;
