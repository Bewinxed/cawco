/**
 * A project's landing checks in its details (ProjectDetails, the row
 * `data-detail="gate"`; the owner: "Settings show it"): the steps the hub
 * runs before work lands, read from the project folder's gate.md
 * (`GET /api/projects/:id/gate`), in every state the hub reports. On a
 * scratch fleet, the dashboard's dev server against its hub, project Pier's
 * gate.md written through `PUT /api/projects/:id/folder/file`, in turn:
 *
 * 1. no gate.md, then a block naming no step: the none line;
 * 2. two steps, the second with `name:`, `on:`, `needs:`, `timeout:` and
 *    `on-fail: stop`: both in order, the command only where it differs from
 *    the name, the meta line exact; at 320px the command's `<code>` fits;
 * 3. a malformed block: each problem a fault in the hub's words, then the
 *    note that nothing lands;
 * 4. a read the hub refuses (routed): its words with Try again, which reads
 *    again and draws the steps.
 *
 * In each, the row's DOM: its state, elements and text, the list's
 * `role="list"`, and Edit gate.md's `href`.
 *
 *   bun scripts/probe-kit/run.ts gate-row
 */
// biome-ignore-all lint/performance/noAwaitInLoops: one page, one state at a time
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { Page } from "playwright-core";
import { MACHINE, type Reply } from "../../scratch-fleet";
import { type Kit, type KitFleet, open, type Spec, settle } from "../kit";

const respond = (): Reply => ({ everyMs: 5, words: ["ok"] });

const ROW = '[data-project-details] [data-detail="gate"]';
const LINE = "[data-place-line]";

const NONE = "Landed with no checks: this project declares none.";
const READING = "Reading gate.md…";
const UNTIL = "Until gate.md is fixed, nothing in this project lands.";

const INSTALL = "bun install --frozen-lockfile";
const LINT_NAME = "Lint the changed files";
/** Long enough to wrap at 320px: its `<code>` must break, never overflow. */
const LINT =
  "bun run lint:changed -- --reporter=github --max-diagnostics=none apps/dashboard/src/lib/cawco/project/ProjectDetails.svelte";
const LINT_FACTS =
  "on apps/dashboard, packages/core · needs linux · within 10m · stops the rest if it fails";

const DECLARED = [
  "---",
  INSTALL,
  LINT,
  `  name: ${LINT_NAME}`,
  "  on: apps/dashboard, packages/core",
  "  needs: linux",
  "  timeout: 10m",
  "  on-fail: stop",
  "---",
  "Notes for people.",
  "",
].join("\n");

const MALFORMED = [
  "---",
  "bun run typecheck",
  "  timeout: soon",
  "  colour: blue",
  "---",
  "",
].join("\n");

const REFUSAL = "The probe refused this read.";

/** What the row shows, from its DOM. */
const readRow = (page: Page) =>
  page.evaluate((selector) => {
    const row = document.querySelector(selector);
    const words = (el: Element | null | undefined) =>
      el?.textContent?.replace(/\s+/g, " ").trim() ?? null;
    const list = row?.querySelector("ol");
    return {
      state: row?.getAttribute("data-gate") ?? null,
      label: words(row?.querySelector('[data-slot="project-details-label"]')),
      notes: [...(row?.querySelectorAll('[data-slot="note"]') ?? [])].map(
        (one) => words(one)
      ),
      role: list?.getAttribute("role") ?? null,
      steps: [...(list?.querySelectorAll(":scope > li") ?? [])].map((li) => ({
        name: words(li.querySelector(".gate-name")),
        code: words(li.querySelector("code")),
        facts: words(li.querySelector(".gate-facts")),
      })),
      faults: [
        ...(row?.querySelectorAll('[data-row-fault] [data-slot="reason"]') ??
          []),
      ].map((one) => words(one)),
      again: row?.querySelector("[data-row-fault] [data-again]") !== null,
      edit: {
        tag: row?.querySelector("[data-gate-edit]")?.tagName ?? null,
        href:
          row?.querySelector("[data-gate-edit]")?.getAttribute("href") ?? null,
        words: words(row?.querySelector("[data-gate-edit]")),
      },
    };
  }, ROW);

async function writeGate(fleet: KitFleet, project: string, content: string) {
  const put = await fetch(`${fleet.base}/api/projects/${project}/folder/file`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ path: "gate.md", content }),
  });
  if (!put.ok) {
    throw new Error(`gate.md: ${put.status} ${await put.text()}`);
  }
}

/** The project page, its details open, the gate row past reading. */
async function openRow(page: Page, url: string): Promise<void> {
  await open(page, url, LINE);
  await page.locator(LINE).click();
  await page.waitForFunction(
    (selector) => {
      const state = document.querySelector(selector)?.getAttribute("data-gate");
      return state !== undefined && state !== null && state !== "reading";
    },
    ROW,
    { timeout: 30_000 }
  );
  await settle(page, 300);
}

async function probe(kit: Kit) {
  const fleet = await kit.fleet(respond);
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.launch("agent");
  await fleet.agentUp();

  const repo = join(fleet.sandbox, "pier");
  await mkdir(repo, { recursive: true });
  await Bun.$`git init -q -b main && echo Pier > README.md && git add -A && git -c user.name=Owner -c user.email=owner@probe.test commit -qm Pier`
    .cwd(repo)
    .env({ ...process.env, HOME: fleet.env.HOME as string })
    .quiet();
  const { id } = await fleet.api<{ id: string }>("/api/projects", {
    name: "Pier",
    machineId: MACHINE,
    cwd: repo,
    caw: false,
  });
  const href = `/project/${encodeURIComponent(id)}?file=gate.md`;
  const editOk = (row: Awaited<ReturnType<typeof readRow>>) =>
    row.edit.tag === "A" &&
    row.edit.href === href &&
    row.edit.words === "Edit gate.md";
  const gateOf = () =>
    fleet.api<{ file: string; gate: { kind: string; problems?: string[] } }>(
      `/api/projects/${id}/gate`
    );

  const base = await fleet.devDashboard();
  const url = `${base}/project/${encodeURIComponent(id)}`;
  const page = await kit.page("desk");

  // 1. No gate.md, then a block naming no step.
  const absent = await gateOf();
  await openRow(page, url);
  const none = await readRow(page);
  kit.note(
    `1 no gate.md: hub ${JSON.stringify(absent)}; row ${JSON.stringify(none)}`
  );
  kit.check(
    "1: with no gate.md the row, Landing checks, says the project lands with no checks, and links Edit gate.md to the file's address",
    absent.gate.kind === "none" &&
      none.state === "none" &&
      none.label === "Landing checks" &&
      none.notes.length === 1 &&
      none.notes[0] === NONE &&
      none.steps.length === 0 &&
      none.faults.length === 0 &&
      editOk(none),
    JSON.stringify(none)
  );

  await writeGate(fleet, id, "---\n# nothing yet\n---\n");
  const emptyHub = await gateOf();
  await openRow(page, url);
  const empty = await readRow(page);
  kit.note(
    `1 empty block: hub ${JSON.stringify(emptyHub)}; row ${JSON.stringify(empty)}`
  );
  kit.check(
    "1: a block naming no step reads as none too",
    emptyHub.gate.kind === "declared" &&
      empty.state === "none" &&
      empty.notes.length === 1 &&
      empty.notes[0] === NONE &&
      empty.steps.length === 0 &&
      editOk(empty),
    JSON.stringify(empty)
  );

  // 2. Two steps.
  await writeGate(fleet, id, DECLARED);
  await openRow(page, url);
  const declared = await readRow(page);
  kit.note(`2 declared: row ${JSON.stringify(declared)}`);
  const [first, second] = declared.steps;
  kit.check(
    '2: both steps in the file\'s order, in an <ol role="list">',
    declared.state === "declared" &&
      declared.role === "list" &&
      declared.steps.length === 2 &&
      first?.name === INSTALL &&
      second?.name === LINT_NAME,
    JSON.stringify(declared.steps.map((step) => step.name))
  );
  kit.check(
    "2: the command shows only where it differs from the name; a step with no facts has no meta line",
    first?.code === null && first?.facts === null && second?.code === LINT,
    JSON.stringify(declared.steps)
  );
  kit.check(
    "2: the second step's meta line is exact",
    second?.facts === LINT_FACTS,
    `“${second?.facts}”`
  );
  kit.check(
    "2: no note or fault beside the steps, and Edit gate.md links the file",
    declared.notes.length === 0 &&
      declared.faults.length === 0 &&
      editOk(declared),
    JSON.stringify({
      notes: declared.notes,
      faults: declared.faults,
      edit: declared.edit,
    })
  );

  const lineUp = await page.evaluate((selector) => {
    const row = document.querySelector(selector);
    const left = (el: Element | null | undefined) =>
      el ? Math.round(el.getBoundingClientRect().left * 10) / 10 : null;
    /** Where an element's own text starts: its first text node's box. */
    const textLeft = (el: Element | null | undefined) => {
      if (!el) {
        return null;
      }
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      let node = walker.nextNode();
      while (node && !node.textContent?.trim()) {
        node = walker.nextNode();
      }
      if (!node) {
        return null;
      }
      const range = document.createRange();
      range.selectNodeContents(node);
      return Math.round(range.getBoundingClientRect().left * 10) / 10;
    };
    const style = (el: Element | null | undefined) =>
      el ? getComputedStyle(el) : null;
    const name = row?.querySelector(".gate-name");
    const code = row?.querySelector("code");
    const facts = row?.querySelector(".gate-facts");
    return {
      value: left(row?.querySelector('[data-slot="value"]')),
      name: textLeft(name),
      code: textLeft(code),
      facts: textLeft(facts),
      edit: textLeft(row?.querySelector("[data-gate-edit]")),
      type: [name, code, facts, row?.querySelector("[data-gate-edit]")].map(
        (el) =>
          `${style(el)?.fontSize} ${style(el)?.fontWeight} ${style(el)?.fontFamily.split(",")[0]} ${style(el)?.color}`
      ),
    };
  }, ROW);
  kit.note(`2 line-up at 1440: ${JSON.stringify(lineUp)}`);
  kit.check(
    "2: each step's name, command and meta line, and Edit gate.md's words, start on the value column",
    [lineUp.name, lineUp.code, lineUp.facts, lineUp.edit].every(
      (x) =>
        x !== null && lineUp.value !== null && Math.abs(x - lineUp.value) <= 1
    ),
    JSON.stringify(lineUp)
  );

  const narrow = await kit.page("phone");
  await narrow.setViewportSize({ width: 320, height: 844 });
  await openRow(narrow, url);
  const fit = await narrow.evaluate((selector) => {
    const code = document.querySelector(`${selector} code`);
    const row = document.querySelector(selector);
    return {
      vw: document.documentElement.clientWidth,
      pageScroll: document.documentElement.scrollWidth,
      code: code
        ? {
            scroll: code.scrollWidth,
            client: code.clientWidth,
            right: code.getBoundingClientRect().right,
            lines: Math.round(
              code.getBoundingClientRect().height /
                Number.parseFloat(getComputedStyle(code).lineHeight)
            ),
          }
        : null,
      rowRight: row?.getBoundingClientRect().right ?? null,
    };
  }, ROW);
  kit.check(
    "2 at 320px: the command's <code> fits its box (scrollWidth <= clientWidth), wrapping inside the page",
    fit.vw === 320 &&
      fit.code !== null &&
      fit.code.scroll <= fit.code.client &&
      fit.code.right <= fit.vw &&
      fit.code.lines > 1,
    JSON.stringify(fit)
  );
  await narrow.close();

  // 3. A malformed block.
  await writeGate(fleet, id, MALFORMED);
  const broken = await gateOf();
  await openRow(page, url);
  const unreadable = await readRow(page);
  kit.note(
    `3 malformed: hub ${JSON.stringify(broken)}; row ${JSON.stringify(unreadable)}`
  );
  const problems = broken.gate.problems ?? [];
  kit.check(
    "3: each problem the hub reports is a fault in its words, in order, then the note that nothing lands",
    broken.gate.kind === "unreadable" &&
      problems.length === 2 &&
      unreadable.state === "unreadable" &&
      JSON.stringify(unreadable.faults) === JSON.stringify(problems) &&
      !unreadable.again &&
      unreadable.notes.length === 1 &&
      unreadable.notes[0] === UNTIL &&
      unreadable.steps.length === 0 &&
      editOk(unreadable),
    JSON.stringify({ hub: problems, row: unreadable })
  );

  // 4. A refused read, then Try again.
  await writeGate(fleet, id, DECLARED);
  await page.route("**/api/projects/*/gate", (route) =>
    route.fulfill({
      status: 500,
      contentType: "text/plain",
      body: REFUSAL,
    })
  );
  await openRow(page, url);
  const failed = await readRow(page);
  kit.note(`4 refused: row ${JSON.stringify(failed)}`);
  kit.check(
    "4: a refused read shows the hub's words with Try again, and Edit gate.md",
    failed.state === "failed" &&
      failed.faults.length === 1 &&
      failed.faults[0] === REFUSAL &&
      failed.again &&
      failed.steps.length === 0 &&
      editOk(failed),
    JSON.stringify(failed)
  );
  await page.unroute("**/api/projects/*/gate");
  await page.locator(`${ROW} [data-again]`).click();
  await page.waitForFunction(
    (selector) =>
      document.querySelector(selector)?.getAttribute("data-gate") ===
      "declared",
    ROW,
    { timeout: 30_000 }
  );
  const again = await readRow(page);
  kit.check(
    "4: Try again reads gate.md again and draws its two steps",
    again.steps.length === 2 && again.faults.length === 0,
    JSON.stringify(again.steps)
  );

  // Reading: held in flight, the note says so.
  let release: () => void = () => undefined;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/projects/*/gate", async (route) => {
    await held;
    await route.continue();
  });
  await open(page, url, LINE);
  await page.locator(LINE).click();
  await page.waitForSelector(`${ROW}[data-gate="reading"]`, {
    timeout: 30_000,
  });
  const reading = await readRow(page);
  kit.check(
    "while the read is in flight the row says Reading gate.md…, with Edit gate.md under it",
    reading.notes.length === 1 &&
      reading.notes[0] === READING &&
      editOk(reading),
    JSON.stringify(reading)
  );
  release();
  await page.waitForFunction(
    (selector) =>
      document.querySelector(selector)?.getAttribute("data-gate") ===
      "declared",
    ROW,
    { timeout: 30_000 }
  );
  await page.unrouteAll({ behavior: "wait" });
  await page.close();
}

const spec: Spec = { name: "gate-row", run: probe };
export default spec;
