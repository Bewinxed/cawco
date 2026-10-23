/**
 * A decision card's pick is only ever what the person means (the owner: "i
 * didn't pick anything yet, i'm still commenting and discussing with you
 * and i have no way to deselect"), on a scratch fleet (real hub, agent and
 * sessiond; the writer a Claude Code session against the mock model) and
 * the built dashboard, read from the hub: its read of the artifact, which
 * `artifact_read` presents (hub presenters/artifacts.ts `artifactReadWords`,
 * applied here to the same read), and its journal.
 *
 *   bun scripts/probe-kit/run.ts decision-unpick
 *
 * On Chromium and WebKit, at 1440×900 (a mouse) and 390×844 (a finger), each
 * leg on a page of its own, three cards (lint, types, gate):
 * (a) Commenting records nothing: a press in Comment on the gate card, the
 *     comment written and sent with Comment, it reaching the session by
 *     itself, its thread opened from its pill in Interact and a reply sent:
 *     the read holds no pick and no Send. A note from the Decisions tab's
 *     composer is said to the session and is no Send either.
 * (b) A pointer's un-pick: a press on lint's option picks it, a press on it
 *     again clears it (no Continue, "Cleared …" said); a pick let go by the
 *     card's Clear the same. The read: picked, then cleared, nothing picked.
 * (c) Reading picks nothing (a mouse): words dragged over on an option's
 *     line select them, and the card holds no pick.
 * (d) The keyboard's un-pick: Space picks the focused option and Space
 *     again clears it; its digit picks, and Enter on Clear clears.
 * (e) After Send: lint picked, Continue, the page's Send (the journal names
 *     it: the page's Send, through the page's own route); Change opens the
 *     card with its pick, a press on it clears it, and the read says picked,
 *     then cleared, the Send's time standing.
 * (f) Once: a Send from the panel head's route and the Decisions tab's I'm
 *     done picking each leave one journal line naming its route and control.
 */
// biome-ignore-all lint/performance/noAwaitInLoops: one step at a time, as a person takes them
import type { Frame, Page } from "playwright-core";
import { SEND_CONTROLS } from "../../../packages/core/src/comments";
import { artifactToolWords } from "../../../packages/core/src/words/artifact-tools";
import { commentWords } from "../../../packages/core/src/words/comments";
import { decisionHostWords } from "../../../packages/core/src/words/decision-host";
import type { ArtifactRead } from "../../../packages/hub/src/artifacts/service";
import { artifactReadWords } from "../../../packages/hub/src/presenters/artifacts";
import { MACHINE, type Reply, type Seen, until } from "../../scratch-fleet";
import {
  type Engine,
  type Kit,
  type KitFleet,
  open,
  pressAt,
  pressIn,
  type Spec,
  settle,
} from "../kit";

const PANE = ':is([data-slot="preview-pane"], [data-side-card="preview"])';
const FRAME = `${PANE} iframe[title="Preview"]`;

const respond = (request: Seen): Reply => ({
  everyMs: 5,
  words: [request.tools ? "ok" : "Probe title"],
});

/** Three cards, the page's title naming its leg, so the panel's frame is told apart from the last leg's. */
const programOf = (
  title: string
) => `root = Decisions("${title}", [lint, types, gate])
lint = Decision("lint", "How should lint stop redoing work?", [cache, biome], "Lint runs the whole tree today.")
cache = Option("cache", "Cache the heavy checks", "Three caches cut most of the time.", true, [], "Three caches to keep keyed right.")
biome = Option("biome", "Move the rules into Biome", "One linter instead of two.", false, [], "Two rules have no Biome version.")
types = Decision("types", "How should type checking run?", [single, golar], "Every tsc uses four threads today.")
single = Option("single", "One thread per tsc", "No false errors, half the CPU.", true, [], "1.7 s more wall per full run.")
golar = Option("golar", "Golar in one pass", "One native pass over every file.", false, [], "16 false errors on our tree today.")
gate = Decision("gate", "Should the gate run the checks again?", [again, count], "Every gate run passed for three days.")
again = Option("again", "Run both again", "A second look at the same tree.", false, [], "About 470 CPU-s per landing.")
count = Option("count", "Count an earlier pass", "The same tree passed already.", true, [], "A wrong pass isn't caught again.")`;

type Read = ArtifactRead & { pageHash: string };

/** One entry of a read's state, or none. */
const entryOf = (read: Read, key: string) =>
  (read.state as Record<string, Read["state"][string] | undefined>)[key];

/** artifact_read's line for a lint card cleared: "picked, then cleared". */
const CLEARED = /- lint [^\n]*: picked, then cleared/;
const CLEARED_NOW =
  /- lint [^\n]*: picked, then cleared [^\n]*; nothing picked now/;

/** The artifact as the hub reads it for `artifact_read`, and the words that tool answers with. */
interface Heard {
  answers: Record<string, string>;
  read: Read;
  sentAt: string | null;
  words: string;
}

interface On {
  base: string;
  fleet: KitFleet;
  kit: Kit;
  projectId: string;
  writer: string;
}

/** The fleet up, a project, its writer. */
const standUp = async (kit: Kit): Promise<On> => {
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
  const dir = `${fleet.sandbox}/devtools`;
  await Bun.$`mkdir -p ${dir} && git init -q -b main ${dir}`.quiet();
  const { id: projectId } = await fleet.api<{ id: string }>("/api/projects", {
    name: "Devtools",
    machineId: MACHINE,
    cwd: dir,
    caw: false,
  });
  const writer = await fleet.spawn("claude", "Make the checks cheap", dir, {
    projectId,
  });
  return { base, fleet, kit, projectId, writer };
};

/** The page's read, and what `artifact_read` says of it. */
const hear = async (on: On, page: string): Promise<Heard> => {
  const read = await on.fleet.api<Read>(
    `/api/instances/${on.writer}/artifacts/${page}`
  );
  const said = artifactReadWords(read);
  return {
    read,
    sentAt: read.sentAt,
    words: typeof said === "string" ? said : said.text,
    answers: Object.fromEntries(
      (read.decisions ?? []).map((one) => [one.id, one.answer])
    ),
  };
};

/** Waits for the hub's read to answer `card` with `answer`; the last read either way. */
const answered = async (
  on: On,
  page: string,
  card: string,
  answer: string
): Promise<Heard> =>
  until(
    `${card} ${answer} on the hub`,
    () => hear(on, page),
    (now) => now.answers[card] === answer,
    10_000
  ).catch(() => hear(on, page));

/** A card as the page draws it: its options picked, whether its foot (Clear, Continue) stands, folded or not. */
const cardOf = (frame: Frame, id: string) =>
  frame.evaluate((card) => {
    const root = document.getElementById(`decision-${card}`);
    return {
      picked: [
        ...(root?.querySelectorAll<HTMLElement>("[data-cawco-picked]") ?? []),
      ].map((one) => one.dataset.option ?? ""),
      next: !!root?.querySelector("[data-continue]"),
      clear: !!root?.querySelector("[data-clear]"),
      decided: !!root?.hasAttribute("data-decided"),
      said:
        document.querySelector("[data-slot=page-said]")?.textContent?.trim() ??
        "",
    };
  }, id);

/** The panel's frame once it draws the page titled `title`. */
const frameOf = async (page: Page, title: string): Promise<Frame> =>
  (await until(
    `the panel drawing “${title}”`,
    async () => {
      const handle = await page
        .locator(FRAME)
        .first()
        .elementHandle()
        .catch(() => null);
      const frame = await handle?.contentFrame();
      const heading = await frame
        ?.locator("h1")
        .first()
        .textContent()
        .catch(() => null);
      return heading?.trim() === title ? frame : null;
    },
    Boolean,
    60_000
  )) as Frame;

/**
 * The pane's mode, as the head stands it: its segment (V, C) where the head
 * has room, else the one mode button's menu, else More's; once the page has
 * heard it.
 */
const mode = async (page: Page, frame: Frame, key: "V" | "C") => {
  const segment = page
    .locator(`${PANE} [role='tab'][aria-keyshortcuts='${key}']`)
    .first();
  if (await segment.isVisible().catch(() => false)) {
    await segment.click();
  } else {
    const compact = page
      .locator(`${PANE} button[aria-label^="Mode: "]`)
      .first();
    const opener = (await compact.isVisible().catch(() => false))
      ? compact
      : page.locator(`${PANE} [data-slot="more"]`).first();
    await opener.click();
    await page
      .getByRole("menuitemradio", {
        name: key === "C" ? "Comment" : "Interact",
      })
      .click();
  }
  await until(
    `the page's mode ${key}`,
    () =>
      frame.evaluate(
        () =>
          !!document
            .querySelector("cawco-overlay")
            ?.shadowRoot?.querySelector(".layer.comment")
      ),
    (comment) => comment === (key === "C"),
    5000
  );
};

/** The pins as the page's doc holds them. */
const pinsOf = (frame: Frame) =>
  frame.evaluate(() => {
    const { doc } = (
      window as unknown as {
        cawcoArtifact: {
          doc: { getMap: (name: string) => { toJSON: () => unknown } };
        };
      }
    ).cawcoArtifact;
    return Object.values(
      doc.getMap("pins").toJSON() as Record<
        string,
        { number: number; thread: { sentAt?: string }[] }
      >
    );
  });

/** (a) A comment written, sent, delivered, its thread opened and replied to: no pick, no Send; a Decisions tab note no Send either. */
const commentLeg = async (
  on: On,
  page: Page,
  frame: Frame,
  id: string,
  name: string,
  label: string,
  tap: boolean
) => {
  const { kit } = on;
  await mode(page, frame, "C");
  // In Comment the overlay's layer takes the press: pressed where the card's question stands.
  const question = frame.locator("#decision-gate h2");
  await question.scrollIntoViewIfNeeded();
  const at = await question.boundingBox();
  if (at) {
    await pressAt(
      frame,
      { x: at.x + Math.min(40, at.width / 2), y: at.y + at.height / 2 },
      { how: tap ? "tap" : "click" }
    );
  }
  const composer = page.locator('[data-slot="pin-composer"]');
  await composer.waitFor({ timeout: 8000 });
  await composer.getByRole("combobox").fill("Why not check only what changed?");
  await composer.getByRole("button", { name: "Comment", exact: true }).click();
  await composer
    .waitFor({ state: "detached", timeout: 8000 })
    .catch(() => undefined);
  const delivered = await until(
    "the comment heard by the session",
    () => pinsOf(frame),
    (pins) => pins.some((pin) => pin.thread.every((entry) => !!entry.sentAt)),
    30_000
  ).catch(() => null);
  await mode(page, frame, "V");
  // Its thread opened from its pill, in Interact, and a reply sent.
  const face = frame
    .locator(
      ':is(svg[data-cawco-pins], svg[data-cawco-pins-fixed]) g[data-pin="1"] [data-face]'
    )
    .first();
  const pill = await face.boundingBox({ timeout: 5000 }).catch(() => null);
  if (pill) {
    await pressAt(frame, {
      x: pill.x + pill.width / 2,
      y: pill.y + pill.height / 2,
    });
  }
  const card = page.locator('[data-slot="pin-card"][data-pin-card="1"]');
  const opened = await card
    .waitFor({ timeout: 8000 })
    .then(() => true)
    .catch(() => false);
  if (opened) {
    await card.getByRole("combobox").fill("And Biome's --changed?");
    await card.getByRole("button", { name: "Reply" }).click();
  }
  const replied = await until(
    "the reply in pin 1's thread",
    () => pinsOf(frame),
    (pins) => pins.some((pin) => pin.thread.length === 2),
    10_000
  ).catch(() => null);
  // The thread closes by its Close (a press on the page closes nothing).
  const closeError = await card
    .getByRole("button", { name: commentWords.close, exact: true })
    .first()
    .click({ timeout: 5000 })
    .then(
      () => "",
      (error: unknown) => String(error).slice(0, 300)
    );
  const closed = await card
    .waitFor({ state: "detached", timeout: 5000 })
    .then(() => true)
    .catch(() => false);
  if (!closed) {
    console.log(`thread not closed: ${closeError}`);
  }
  await settle(page, 4000);
  const after = await hear(on, id);
  kit.check(
    `(a) ${label}: a comment written and sent, heard by the session, its thread opened from its pill, replied to and closed: the hub holds no pick and no Send, and artifact_read says so`,
    !!delivered &&
      opened &&
      !!replied &&
      closed &&
      Object.values(after.answers).every((one) => one === "open") &&
      after.sentAt === null &&
      after.words.includes("(0 of 3 picked)"),
    JSON.stringify({
      delivered: !!delivered,
      opened,
      replied: !!replied,
      closed,
      answers: after.answers,
      sentAt: after.sentAt,
      words: after.words.split("\n").slice(0, 6),
    })
  );
  const noted = await on.fleet
    .api(`/api/projects/${on.projectId}/decisions/${name}/send`, {
      text: "Keep the gate card open for now.",
    })
    .then(
      () => "",
      (error: unknown) => String(error)
    );
  const note = await hear(on, id);
  kit.check(
    `(a) ${label}: a note from the Decisions tab's composer goes to the session and is no Send: no pick, no Send`,
    noted === "" &&
      note.sentAt === null &&
      Object.values(note.answers).every((one) => one === "open"),
    JSON.stringify({ noted, sentAt: note.sentAt, answers: note.answers })
  );
};

/** (b) A pointer's pick, pressed again, cleared; then Clear. */
const pointerLeg = async (
  on: On,
  frame: Frame,
  id: string,
  label: string,
  tap: boolean
) => {
  const { kit } = on;
  await pressIn(frame, '#decision-lint [data-option="biome"]', { tap });
  const picked = await answered(on, id, "lint", "picked");
  const drawn = await cardOf(frame, "lint");
  await settle(frame.page(), 600);
  // The foot as drawn: Clear and Continue on one line, one height, Clear the
  // ghost before the coral Continue, each reaching its pointer's area.
  const foot = await frame.evaluate(() => {
    const box = (el: Element | null) => el?.getBoundingClientRect();
    const reach = (el: Element | null) => {
      const after = el ? getComputedStyle(el, "::after") : null;
      const own = box(el);
      const w = Number.parseFloat(after?.width ?? "") || own?.width || 0;
      const h = Number.parseFloat(after?.height ?? "") || own?.height || 0;
      return {
        w: Math.round(Math.max(w, own?.width ?? 0)),
        h: Math.round(Math.max(h, own?.height ?? 0)),
      };
    };
    const clear = document.querySelector("#decision-lint [data-clear]");
    const next = document.querySelector("#decision-lint [data-continue]");
    const a = box(clear);
    const b = box(next);
    return {
      words: clear?.textContent?.trim() ?? "",
      sameLine: !!a && !!b && Math.abs(a.top - b.top) < 0.5,
      sameHeight: !!a && !!b && Math.abs(a.height - b.height) < 0.5,
      before: !!a && !!b && a.right <= b.left,
      gap: a && b ? Math.round(b.left - a.right) : -1,
      clearReach: reach(clear),
      clearBg: clear ? getComputedStyle(clear).backgroundColor : "",
      nextBg: next ? getComputedStyle(next).backgroundImage : "",
    };
  });
  const least = tap ? 44 : 24;
  on.kit.check(
    `(b) ${label}: a pick's foot stands Clear pick, the ghost, before the coral Continue on one line at one height, Clear reaching ${least}px`,
    foot.words === decisionHostWords.clearPick(false) &&
      foot.sameLine &&
      foot.sameHeight &&
      foot.before &&
      foot.clearReach.w >= least &&
      foot.clearReach.h >= least,
    JSON.stringify(foot)
  );
  await pressIn(frame, '#decision-lint [data-option="biome"]', { tap });
  const cleared = await answered(on, id, "lint", "cleared");
  const gone = await cardOf(frame, "lint");
  kit.check(
    `(b) ${label}: a press on the picked option clears it: the hub's record cleared, artifact_read saying picked, then cleared, the card open with no Clear or Continue, "Cleared Move the rules into Biome" said`,
    picked.answers.lint === "picked" &&
      JSON.stringify(drawn.picked) === '["biome"]' &&
      drawn.next &&
      drawn.clear &&
      cleared.answers.lint === "cleared" &&
      CLEARED_NOW.test(cleared.words) &&
      !cleared.words.includes("picked biome") &&
      gone.picked.length === 0 &&
      !(gone.next || gone.clear || gone.decided) &&
      gone.said === "Cleared Move the rules into Biome",
    JSON.stringify({ drawn, gone, words: cleared.words.split("\n") })
  );
  await pressIn(frame, '#decision-lint [data-option="cache"]', { tap });
  await answered(on, id, "lint", "picked");
  await pressIn(frame, "#decision-lint [data-clear]", { tap });
  const byClear = await answered(on, id, "lint", "cleared");
  const after = await cardOf(frame, "lint");
  const focused = await frame.evaluate(
    () => (document.activeElement as HTMLElement | null)?.dataset.option ?? ""
  );
  kit.check(
    `(b) ${label}: Clear lets the pick go: cleared on the hub, nothing marked, focus on the option that held it, "Cleared Cache the heavy checks" said`,
    byClear.answers.lint === "cleared" &&
      after.picked.length === 0 &&
      !after.next &&
      focused === "cache" &&
      after.said === "Cleared Cache the heavy checks",
    JSON.stringify({ answer: byClear.answers.lint, after, focused })
  );
};

/** (c) Words dragged over on an option's line: selected, and no pick. */
const readingLeg = async (
  on: On,
  page: Page,
  frame: Frame,
  id: string,
  label: string,
  engine: Engine
) => {
  const line = frame
    .locator('#decision-types [data-option-for="golar"]')
    .first();
  await line.scrollIntoViewIfNeeded();
  const box = await line.boundingBox();
  if (box) {
    const y = box.y + Math.min(box.height / 2, 8);
    await page.mouse.move(box.x + 2, y);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.6, y, { steps: 8 });
    await page.mouse.up();
  }
  await settle(page, 1200);
  const selected = await frame.evaluate(
    () => getSelection()?.toString().trim() ?? ""
  );
  const now = await hear(on, id);
  const card = await cardOf(frame, "types");
  // WebKit selects no words dragged over on a label: its drag picks nothing all the same.
  on.kit.check(
    `(c) ${label}: words dragged over on an option's line pick nothing${engine === "webkit" ? "" : ", the words selected"}`,
    (engine === "webkit" || selected.length > 0) &&
      now.answers.types === "open" &&
      card.picked.length === 0,
    JSON.stringify({ selected, answer: now.answers.types, card })
  );
  await frame.evaluate(() => getSelection()?.removeAllRanges());
};

/** (d) Space picks and Space clears; the digit picks and Enter on Clear clears. */
const keyLeg = async (
  on: On,
  page: Page,
  frame: Frame,
  id: string,
  label: string
) => {
  const { kit } = on;
  await frame.locator('#decision-types [data-option="single"]').focus();
  await page.keyboard.press("Space");
  const picked = await answered(on, id, "types", "picked");
  await page.keyboard.press("Space");
  const cleared = await answered(on, id, "types", "cleared");
  const card = await cardOf(frame, "types");
  kit.check(
    `(d) ${label}: Space picks the focused option and Space again clears it, on the hub and on the card`,
    picked.answers.types === "picked" &&
      cleared.answers.types === "cleared" &&
      card.picked.length === 0 &&
      !card.next &&
      card.said === "Cleared One thread per tsc",
    JSON.stringify({ picked: picked.answers, cleared: cleared.answers, card })
  );
  await page.keyboard.press("2");
  const digit = await answered(on, id, "types", "picked");
  await frame.locator("#decision-types [data-clear]").focus();
  await page.keyboard.press("Enter");
  const byKey = await answered(on, id, "types", "cleared");
  const after = await cardOf(frame, "types");
  await settle(page, 400);
  const thread = await page
    .locator('[data-slot="pin-card"]')
    .count()
    .catch(() => 0);
  kit.check(
    `(d) ${label}: the digit 2 picks golar; Enter on Clear clears it, on the hub and on the card, and opens no comment's thread`,
    JSON.stringify(entryOf(digit.read, "types")?.options) === '["golar"]' &&
      byKey.answers.types === "cleared" &&
      after.picked.length === 0 &&
      after.said === "Cleared Golar in one pass" &&
      thread === 0,
    JSON.stringify({ digit: entryOf(digit.read, "types"), after, thread })
  );
};

/** The hub's journal lines of the page Sends on artifact `id`. */
const sendsIn = async (on: On, id: string) =>
  (await on.fleet.logs("hub"))
    .split("\n")
    .filter((line) => line.includes(`[artifacts] ${id} `));

/** The start of a page Send's journal line: the page, the control named, the route that took it. */
const sendLine = (
  id: string,
  name: string,
  control: keyof typeof SEND_CONTROLS,
  route: string
) =>
  artifactToolWords.pageSent(
    `${id} (page "${name}")`,
    SEND_CONTROLS[control],
    route,
    ""
  );

/** (e) Picked, Continue, the page's Send; Change, and a press on the pick clears it. */
const sentLeg = async (
  on: On,
  frame: Frame,
  id: string,
  name: string,
  label: string,
  tap: boolean
) => {
  const { kit } = on;
  await pressIn(frame, '#decision-lint [data-option="cache"]', { tap });
  await answered(on, id, "lint", "picked");
  await pressIn(frame, "#decision-lint [data-continue]", { tap });
  await until(
    "the lint card folded",
    () => cardOf(frame, "lint"),
    (now) => now.decided,
    10_000
  ).catch(() => null);
  await settle(frame.page(), 800);
  await pressIn(frame, "[data-send]", { tap });
  const sent = await until(
    "the page's Send on the hub",
    () => hear(on, id),
    (now) => now.sentAt !== null,
    15_000
  ).catch(() => hear(on, id));
  const journal = await sendsIn(on, id);
  const pageLine = sendLine(
    id,
    name,
    "page-send",
    `POST /__cawco/artifact/${id}/send`
  );
  kit.check(
    `(e) ${label}: the page's Send stamps the record, and the journal names it: the page's Send, through the page's own route`,
    sent.sentAt !== null &&
      sent.answers.lint === "picked" &&
      journal.some((line) => line.includes(pageLine)),
    JSON.stringify({ sentAt: sent.sentAt, journal })
  );
  await pressIn(frame, "#decision-lint [data-change]", { tap });
  const reopened = await until(
    "the lint card open again with its pick",
    () => cardOf(frame, "lint"),
    (now) => !now.decided && now.next,
    10_000
  ).catch(() => cardOf(frame, "lint"));
  await settle(frame.page(), 600);
  await pressIn(frame, '#decision-lint [data-option="cache"]', { tap });
  const cleared = await answered(on, id, "lint", "cleared");
  const card = await cardOf(frame, "lint");
  kit.check(
    `(e) ${label}: after Send, Change reopens the card with its pick standing; a press on it clears it: the record cleared, artifact_read saying picked, then cleared, the Send's time standing`,
    JSON.stringify(reopened.picked) === '["cache"]' &&
      cleared.answers.lint === "cleared" &&
      CLEARED.test(cleared.words) &&
      cleared.sentAt !== null &&
      cleared.sentAt === sent.sentAt &&
      card.picked.length === 0 &&
      !card.decided,
    JSON.stringify({
      reopened,
      card,
      sentAt: [sent.sentAt, cleared.sentAt],
      words: cleared.words.split("\n"),
    })
  );
};

/** (f) The dashboard's route and the Decisions tab each leave their journal line. */
const routesLeg = async (on: On, id: string, name: string) => {
  const { fleet, kit, projectId, writer } = on;
  const head = await fetch(
    `${fleet.base}/api/instances/${writer}/artifacts/${id}/send`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ control: "panel-head" }),
    }
  );
  const done = await fetch(
    `${fleet.base}/api/projects/${projectId}/decisions/${name}/send`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    }
  );
  const journal = await sendsIn(on, id);
  const headLine = sendLine(
    id,
    name,
    "panel-head",
    `POST /api/instances/${writer}/artifacts/${id}/send`
  );
  const doneLine = sendLine(
    id,
    name,
    "decisions-done",
    `POST /api/projects/${projectId}/decisions/${name}/send`
  );
  kit.check(
    "(f) a Send from the panel head and the Decisions tab's I'm done picking each leave one journal line naming its route and control",
    journal.some((line) => line.includes(headLine)) &&
      journal.some((line) => line.includes(doneLine)),
    JSON.stringify({ head: head.status, done: done.status, journal })
  );
};

/** One card, no pick: a note written on it is the card's own, kept once. */
const NOTE_TITLE = "Pick the pods";
const NOTE_PROGRAM = `root = Decisions("${NOTE_TITLE}", [pods])
pods = Decision("pods", "Which runs the pods on the Mac?", [podman, orb], "Podman runs them today.")
podman = Option("podman", "Keep Podman", "Nothing new to run.", true, [], "Slow to start a machine.")
orb = Option("orb", "OrbStack", "Starts in a second.", false, [], "A licence per seat.")`;

/** A plain HTML page with a named field of its own beside a choice. */
const NAMED_PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Budget</title></head>
<body><main><h1>Set the budget</h1>
<div data-cawco-choice="cap" role="group" aria-label="How is spend capped?"><button type="button" data-option="hard">A hard cap</button><button type="button" data-option="soft">A soft cap</button></div>
<label>Monthly budget <input name="budget" value=""></label></main></body></html>`;

/**
 * (g) A note on a card with no pick, then Send: the read, whole and since a
 * seq, lists the card once with its note under its Choices, nothing beside
 * it, no `note-<id>` value; a plain page's named field is still kept.
 */
const noteLeg = async (on: On) => {
  const { fleet, kit, writer } = on;
  const made = await fleet.api<{ id: string }>(
    `/api/instances/${writer}/artifacts`,
    {
      kind: "page",
      does: "pick",
      ask: "Pick one option on each card",
      name: "pods",
      program: NOTE_PROGRAM,
    }
  );
  const page = await kit.page("desk", { theme: "light" });
  await open(page, `${on.base}/session/${writer}`, '[data-slot="pane"]');
  const frame = await frameOf(page, NOTE_TITLE);
  await settle(page, 800);
  const before = await hear(on, made.id);
  const words = "is there a better thing than Podman, like OrbStack?";
  await pressIn(frame, "#decision-pods [data-slot=note] button >> nth=0");
  await frame.locator("#decision-pods textarea:not([aria-hidden])").fill(words);
  await until(
    "the note on the hub",
    () => hear(on, made.id),
    (now) => entryOf(now.read, "pods")?.note === words,
    10_000
  ).catch(() => null);
  await settle(page, 1200);
  await pressIn(frame, "[data-send]");
  await until(
    "the page's Send on the hub",
    () => hear(on, made.id),
    (now) => now.sentAt !== null,
    15_000
  ).catch(() => null);
  const whole = await hear(on, made.id);
  const sinceRead = await fleet.api<Read>(
    `/api/instances/${writer}/artifacts/${made.id}?since=${before.read.seq}`
  );
  const sinceSaid = artifactReadWords(sinceRead);
  const sinceWords = typeof sinceSaid === "string" ? sinceSaid : sinceSaid.text;
  // The card once, under its Choices, with its note; no line past them.
  const once = (read: Read, said: string) => {
    const lines = said.split("\n");
    const at = lines.findIndex((line) => line.includes("(0 of 1 picked)"));
    const card = lines[at + 1] ?? "";
    return (
      at !== -1 &&
      card.startsWith("- pods ") &&
      card.includes(JSON.stringify(words)) &&
      !lines[at + 2]?.startsWith("- ") &&
      !said.includes("note-pods") &&
      JSON.stringify(read.decisions?.map((one) => [one.id, one.answer])) ===
        '[["pods","open"]]'
    );
  };
  kit.check(
    "(g) a note on a card with no pick, then Send: the read lists the card once with its note (0 of 1 picked), no note-<id> value, nothing beside it; the same read since a seq",
    Object.keys(whole.read.state).join(",") === "pods" &&
      whole.sentAt !== null &&
      once(whole.read, whole.words) &&
      once(sinceRead, sinceWords),
    JSON.stringify({
      state: Object.keys(whole.read.state),
      whole: whole.words.split("\n"),
      since: sinceWords.split("\n"),
    })
  );
  const named = await fleet.api<{ id: string }>(
    `/api/instances/${writer}/artifacts`,
    {
      kind: "page",
      does: "pick",
      ask: "Set the budget",
      name: "budget",
      html: NAMED_PAGE,
    }
  );
  const budget = (await until(
    "the budget page in the panel",
    async () => {
      const handle = await page
        .locator(FRAME)
        .first()
        .elementHandle()
        .catch(() => null);
      const inner = await handle?.contentFrame();
      return (await inner?.locator('input[name="budget"]').count())
        ? inner
        : null;
    },
    Boolean,
    60_000
  )) as Frame;
  await budget.locator('input[name="budget"]').fill("60");
  const kept = await until(
    "the budget field on the hub",
    () => hear(on, named.id),
    (now) => String(entryOf(now.read, "budget")?.value) === "60",
    10_000
  ).catch(() => hear(on, named.id));
  kit.check(
    "(g) a plain page's named field is still kept as its own value, beside the page's choices",
    String(entryOf(kept.read, "budget")?.value) === "60" &&
      kept.words
        .split("\n")
        .some((line) => line.startsWith("- budget: ") && line.includes('"60"')),
    JSON.stringify({ state: kept.read.state, words: kept.words.split("\n") })
  );
  await page.close();
};

const LEGS: readonly { engine: Engine; view: "desk" | "phone" }[] = [
  { engine: "chromium", view: "desk" },
  { engine: "chromium", view: "phone" },
  { engine: "webkit", view: "desk" },
  { engine: "webkit", view: "phone" },
];

const run = async (kit: Kit) => {
  const on = await standUp(kit);
  let first = true;
  for (const { engine, view } of LEGS) {
    const label = `${engine} ${view === "desk" ? "1440" : "390"}`;
    const name = `unpick-${engine}-${view}`;
    const title = `Make the checks cheap (${label})`;
    const made = await on.fleet.api<{ id: string }>(
      `/api/instances/${on.writer}/artifacts`,
      {
        kind: "page",
        does: "pick",
        ask: "Pick one option on each card",
        name,
        program: programOf(title),
      }
    );
    const page = await kit.page(view, { engine, theme: "light" });
    const said: string[] = [];
    page.on("pageerror", (error) => said.push(String(error)));
    await open(page, `${on.base}/session/${on.writer}`, '[data-slot="pane"]');
    const frame = await frameOf(page, title);
    await settle(page, 800);
    const tap = view === "phone";
    await commentLeg(on, page, frame, made.id, name, label, tap);
    await pointerLeg(on, frame, made.id, label, tap);
    if (view === "desk") {
      await readingLeg(on, page, frame, made.id, label, engine);
    }
    await keyLeg(on, page, frame, made.id, label);
    await sentLeg(on, frame, made.id, name, label, tap);
    if (first) {
      await routesLeg(on, made.id, name);
      first = false;
    }
    kit.check(
      `${label}: the page said no error`,
      said.length === 0,
      said.slice(0, 4).join(" | ") || "none"
    );
    await page.close();
  }
  await noteLeg(on);
};

const spec: Spec = { name: "decision-unpick", run };
export default spec;
