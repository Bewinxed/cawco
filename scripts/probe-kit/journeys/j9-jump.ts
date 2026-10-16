/**
 * J9, Jump: find a moment and open the conversation at that line.
 *
 * A session where the person once said something, followed by a long run
 * of the agent's words since, so that line is far above the conversation's
 * end. The person opens Jump, types a word of what was said, and opens the
 * moment it finds: the dashboard opens that session at `?at=<id>`, where
 * the id is the machine's own record of that line (the Claude transcript
 * record holding those words, read from the machine's disk), and the line
 * stands in view on the page.
 */
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Locator, Page } from "playwright-core";
import type { Seen } from "../../scratch-fleet";
import type { KitFleet } from "../kit";
import { eventually, expect, type Journey, type Leg, shows } from "./suite";

const SAID = "JOURNEY-SAID";
const MORE = "JOURNEY-MORE";
const JUMP = /^Jump to session$/;
const OPEN_NAVIGATION = "Open navigation";
const SHEET_SEARCH = "Search sessions, projects, machines";
const FIND = "Find a session, or a task, preview, decision";
/** How many turns of the agent's words follow the line, each a long answer. */
const AFTER = 4;
const LONG = Array.from(
  { length: 40 },
  (_, i) =>
    `Step ${i + 1} of the reconciliation: compared the invoices against the bank feed and noted every difference.\n`
);

/** The record ids and texts of every Claude transcript record holding `words`, read from the machine. */
async function recordsHolding(
  fleet: KitFleet,
  words: string
): Promise<string[]> {
  const files = (
    await Promise.all(
      [fleet.home, fleet.sandbox].map(async (root) =>
        (await readdir(root, { recursive: true }).catch(() => []))
          .map(String)
          .filter(
            (path) => path.includes("projects/") && path.endsWith(".jsonl")
          )
          .map((path) => join(root, path))
      )
    )
  ).flat();
  const texts = await Promise.all(
    files.map((file) => readFile(file, "utf8").catch(() => ""))
  );
  return texts
    .flatMap((text) => text.split("\n"))
    .filter((line) => line.includes(words))
    .map((line) => {
      const { uuid } = JSON.parse(line) as { uuid?: string };
      return uuid ?? "";
    })
    .filter(Boolean);
}

/** Whether `locator`'s box stands inside the page's viewport. */
async function inView(page: Page, locator: Locator): Promise<string | null> {
  const box = await locator.boundingBox();
  const size = page.viewportSize();
  if (!(box && size)) {
    return "it has no box";
  }
  const within =
    box.y >= 0 &&
    box.y + Math.min(box.height, 24) <= size.height &&
    box.x >= 0 &&
    box.x < size.width;
  return within
    ? null
    : `its box ${Math.round(box.x)},${Math.round(box.y)} ${Math.round(box.width)}×${Math.round(box.height)} in a ${size.width}×${size.height} screen`;
}

async function walk(leg: Leg): Promise<void> {
  const { fleet, page, base } = leg;
  // One word no other leg's conversation holds.
  const nonce = `heron${crypto.randomUUID().slice(0, 8).replaceAll("-", "")}`;
  const line = `The ${nonce} ledger balanced on Tuesday, after the second pass.`;
  const id = await fleet.spawn("claude", leg.title("Reconcile the ledger"));
  await fleet.send(id, `${SAID} ${line}`);
  for (let at = 0; at < AFTER; at += 1) {
    // biome-ignore lint/performance/noAwaitInLoops: one turn after another, as a conversation runs
    await eventually(
      "the session's turn ended",
      () => fleet.instance(id),
      (row) => row?.turn_open_at === null,
      60_000
    );
    await fleet.send(id, `${MORE} carry on with the next pass.`);
  }
  await eventually(
    "the session's last turn ended",
    () => fleet.instance(id),
    (row) => row?.turn_open_at === null,
    60_000
  );
  const finder = page.getByRole("combobox", { name: FIND });
  const moment = page.getByRole("option", { name: new RegExp(nonce) });

  await leg.step(
    "Open the dashboard",
    () => page.goto(base, { waitUntil: "domcontentloaded" }),
    () =>
      shows(
        page
          .getByRole("button", { name: JUMP })
          .or(page.getByRole("button", { name: OPEN_NAVIGATION })),
        "a way to Jump"
      )
  );

  await leg.step(
    "Open Jump",
    async () => {
      // The bar's Jump on a wide screen; a phone keeps it in its sheet,
      // as the sheet's search (Shell, Sidebar `onsearch`).
      const bar = page
        .getByRole("button", { name: JUMP })
        .filter({ visible: true });
      if ((await bar.count()) > 0) {
        await bar.first().click();
        return;
      }
      await page.getByRole("button", { name: OPEN_NAVIGATION }).click();
      await page.getByRole("button", { name: SHEET_SEARCH }).click();
    },
    () => shows(finder, "the Jump field")
  );

  await leg.step(
    "Type a word of what was said",
    async () => {
      await finder.click();
      await page.keyboard.type(nonce);
    },
    () => shows(moment, `the moment where “${nonce}” was said`, 60_000)
  );

  await leg.step(
    "Open that moment",
    () => moment.filter({ visible: true }).first().click(),
    async () => {
      const opened = await eventually(
        "the session opened at a moment",
        () => new URL(page.url()),
        (url) => url.pathname === `/session/${id}` && url.searchParams.has("at")
      );
      const at = opened.searchParams.get("at") ?? "";
      const records = await recordsHolding(fleet, nonce);
      expect(
        "the moment it opens at is the machine's own record of that line",
        records.includes(at),
        `opened at ${at}; the transcript holds the words in ${records.join(", ") || "no record"}`
      );
      const said = page
        .getByRole("log", { name: "Session transcript" })
        .getByText(nonce)
        .filter({ visible: true })
        .first();
      await shows(said, "the line that was said");
      await eventually(
        "the line that was said stands in view",
        () => inView(page, said),
        (outside) => outside === null
      );
    }
  );
}

const journey: Journey = {
  name: "j9-jump",
  flow: "Jump: find a moment and open the conversation at that line",
  respond: (seen: Seen) => {
    if (seen.tools && seen.last.includes(MORE)) {
      return { everyMs: 5, words: LONG };
    }
    return { everyMs: 20, words: ["Noted."] };
  },
  leg: walk,
};

export default journey;
