/**
 * The project's Decisions tab is one list of its decision pages on live hub
 * data (the owner's pick of 10-24: "A list, links as words on the cards"),
 * on a scratch fleet: a real hub, agent and sessiond, the pages published by
 * Claude Code sessions against the mock model as artifact_create makes them,
 * and the built dashboard. Read from the hub's answers and the engine.
 *
 *   bun scripts/probe-kit/run.ts decisions-list
 *
 * Three projects: the three seeded pages (decisions-preview/seed.ts:
 * landing, picking, comes after onboarding; onboarding, picking; pricing,
 * decided), one page alone, and forty pages, the first titled and asking in
 * forty words. On Chromium and WebKit, at 390, 680 and 1440:
 *
 * (a) the hub lists each page with the pages it links to: landing's `after`
 *     names onboarding, onboarding's `unlocks` names landing;
 * (b) the list draws one row per page in its group (Needs you, Sent,
 *     Decided), each picking row with its open count (cards less picks);
 * (c) the link reads as words on both rows ("After: Shape onboarding",
 *     "Unlocks: Landing page hero"), and pressing it opens its target in
 *     the tab, whose facts name the link back;
 * (d) the overflow sweep (journeys/scan.ts: nothing spills, no control
 *     covers text) totals zero over every project, size and engine;
 * (e) no console error on any page.
 */
// biome-ignore-all lint/performance/noAwaitInLoops: one page, one size at a time
import type { Page } from "playwright-core";
import { decisionsWords } from "../../../packages/core/src/words/decisions";
import {
  LANDING,
  ONBOARDING,
  seedDecisions,
} from "../../decisions-preview/seed";
import { MACHINE, type Reply, type Seen } from "../../scratch-fleet";
import { HouseRules } from "../house-rules";
import { scan } from "../journeys/scan";
import {
  type Engine,
  type Kit,
  type KitFleet,
  kitsOwnMessage,
  open,
  type Spec,
  settle,
  type View,
} from "../kit";

const respond = (request: Seen): Reply => ({
  everyMs: 5,
  words: [request.tools ? "ok" : "Probe title"],
});

interface Row {
  after: { name: string; title: string }[];
  cards: number;
  name: string;
  picked: number;
  state: string;
  title: string;
  unlocks: { name: string; title: string }[];
}

/** Forty words, as the longest question a writer asks. */
const FORTY = Array.from(
  { length: 40 },
  (_, i) =>
    [
      "Should",
      "the",
      "release",
      "train",
      "hold",
      "every",
      "delegate",
      "workspace",
      "until",
      "its",
    ][i % 10]
).join(" ");

/** A one-card page's program, as artifact_create takes it. */
const program = (title: string, question: string) =>
  `root = Decisions(${JSON.stringify(title)}, [pick])
pick = Decision("pick", ${JSON.stringify(question)}, [yes, no], "Holding keeps every change in one place.")
yes = Option("yes", "Hold them", "Every change waits for the train.", true, [], "Changes land later.")
no = Option("no", "Let them go", "Each change lands on its own.", false, [], "Changes land out of step.")`;

/** A project of `count` one-card pages from one writer; the first titled and asking in forty words. */
const project = async (
  fleet: KitFleet,
  name: string,
  count: number
): Promise<string> => {
  const dir = `${fleet.sandbox}/${name.toLowerCase().replaceAll(" ", "-")}`;
  await Bun.$`mkdir -p ${dir} && git init -q -b main ${dir}`.quiet();
  const { id } = await fleet.api<{ id: string }>("/api/projects", {
    name,
    machineId: MACHINE,
    cwd: dir,
    caw: false,
  });
  const writer = await fleet.spawn("claude", `Write ${name}`, dir, {
    projectId: id,
  });
  for (let n = 1; n <= count; n += 1) {
    await fleet.api(`/api/instances/${writer}/artifacts`, {
      kind: "page",
      does: "pick",
      ask: "Pick one option",
      name: `page-${n}`,
      program:
        n === 1
          ? program(FORTY, FORTY)
          : program(`Release question ${n}`, `Does release ${n} wait?`),
    });
  }
  return id;
};

/** What the list draws, read off the engine. */
const drawn = (page: Page) =>
  page.evaluate(() => {
    const rows = [
      ...document.querySelectorAll<HTMLElement>(
        '[data-slot="decisions-list"] [data-slot="decision-row"]'
      ),
    ];
    return rows.map((row) => ({
      name: row.dataset.page ?? "",
      group: row.closest<HTMLElement>("[data-group]")?.dataset.group ?? "none",
      open: row.querySelector<HTMLElement>("[data-open]")?.dataset.open ?? null,
      fact: row.querySelector('[data-slot="fact"]')?.textContent?.trim() ?? "",
      after: [
        ...row.querySelectorAll<HTMLAnchorElement>(
          '[data-links="after"] a[data-link-to]'
        ),
      ].map((a) => `${a.dataset.linkTo}:${a.textContent?.trim()}`),
      unlocks: [
        ...row.querySelectorAll<HTMLAnchorElement>(
          '[data-links="unlocks"] a[data-link-to]'
        ),
      ].map((a) => `${a.dataset.linkTo}:${a.textContent?.trim()}`),
      linkWords:
        row
          .querySelector('[data-slot="links"]')
          ?.textContent?.replace(/\s+/g, " ") ?? "",
    }));
  });

const groupOf = (state: string) => {
  if (state === "picking") {
    return "open";
  }
  return state === "sent" ? "sent" : "decided";
};

const SIZES: View[] = ["phone", "narrowDesk", "desk"];
const ENGINES: Engine[] = ["chromium", "webkit"];

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
  const seeded = await seedDecisions(fleet, {
    name: "Launch",
    machineId: MACHINE,
    cwd: fleet.repo,
  });
  const lone = await project(fleet, "One page", 1);
  const forty = await project(fleet, "Forty pages", 40);
  const base = await fleet.dashboard();

  const listOf = (id: string) =>
    fleet.api<{ pages: Row[] }>(`/api/projects/${id}/decisions`);
  const hubRows = (await listOf(seeded.projectId)).pages;
  const landing = hubRows.find((row) => row.name === LANDING.name);
  const onboarding = hubRows.find((row) => row.name === ONBOARDING.name);
  kit.check(
    "(a) the hub lists three pages; landing comes after onboarding, onboarding unlocks landing",
    hubRows.length === 3 &&
      JSON.stringify(landing?.after) ===
        JSON.stringify([{ name: ONBOARDING.name, title: ONBOARDING.title }]) &&
      JSON.stringify(onboarding?.unlocks) ===
        JSON.stringify([{ name: LANDING.name, title: LANDING.title }]),
    JSON.stringify(
      hubRows.map(({ name, state, after, unlocks }) => ({
        name,
        state,
        after,
        unlocks,
      }))
    )
  );
  const fortyRows = (await listOf(forty)).pages;
  const loneRows = (await listOf(lone)).pages;
  kit.check(
    "(a) the other projects list one page and forty",
    loneRows.length === 1 && fortyRows.length === 40,
    `${loneRows.length} and ${fortyRows.length}`
  );

  let spilled = 0;
  const errors: string[] = [];
  for (const engine of ENGINES) {
    const house = new HouseRules(kit, engine, {
      except: [
        {
          rule: "made-up",
          text: ".cawco/tmp/",
          reason:
            "the scratch fleet's own repository, which lives under the workspace's TMPDIR: the place the hub really holds",
        },
      ],
    });
    for (const view of SIZES) {
      const tag = `${engine} ${view}`;
      const page = await kit.page(view, { engine, theme: "light" });
      page.on("console", (message) => {
        if (message.type() === "error" && !kitsOwnMessage(message.text())) {
          errors.push(`${tag}: ${message.text().slice(0, 300)}`);
        }
      });
      page.on("pageerror", (error) =>
        errors.push(`${tag}: ${error.message.slice(0, 300)}`)
      );
      for (const [id, rows] of [
        [seeded.projectId, hubRows],
        [lone, loneRows],
        [forty, fortyRows],
      ] as const) {
        await open(
          page,
          `${base}/project/${id}?view=decisions`,
          '[data-slot="decisions-list"] [data-slot="decision-row"]'
        );
        await settle(page, 400);
        const seen = await drawn(page);
        const wrong = rows.filter((row) => {
          const one = seen.filter((each) => each.name === row.name);
          const want =
            row.state === "picking" ? String(row.cards - row.picked) : null;
          return (
            one.length !== 1 ||
            one[0].group !== groupOf(row.state) ||
            one[0].open !== want
          );
        });
        kit.check(
          `(b) ${tag} ${rows.length} page(s): one row per page in its group, each waiting page with its open count`,
          wrong.length === 0 && seen.length === rows.length,
          JSON.stringify({
            wrong: wrong.map((row) => row.name),
            seen: seen.slice(0, 4),
            rows: seen.length,
          })
        );
        await settle(page);
        await house.at(page, `${tag} ${rows.length} page(s)`);
        const found = await page.evaluate(scan);
        spilled += found.length;
        kit.check(
          `(d) ${tag} ${rows.length} page(s): nothing spills, no control covers text`,
          found.length === 0,
          found.join(" | ")
        );
      }

      // The link, as words on both rows, and pressed.
      await open(
        page,
        `${base}/project/${seeded.projectId}?view=decisions`,
        '[data-slot="decisions-list"] [data-slot="decision-row"]'
      );
      const rows = await drawn(page);
      const from = rows.find((row) => row.name === LANDING.name);
      const to = rows.find((row) => row.name === ONBOARDING.name);
      kit.check(
        `(c) ${tag}: the link reads as words on both rows`,
        JSON.stringify(from?.after) ===
          JSON.stringify([`${ONBOARDING.name}:${ONBOARDING.title}`]) &&
          (from?.linkWords.trim() ?? "") ===
            `${decisionsWords.after} ${ONBOARDING.title}` &&
          JSON.stringify(to?.unlocks) ===
            JSON.stringify([`${LANDING.name}:${LANDING.title}`]) &&
          (to?.linkWords.trim() ?? "") ===
            `${decisionsWords.unlocks} ${LANDING.title}`,
        JSON.stringify({ from, to })
      );
      await page
        .locator(
          `[data-slot="decision-row"][data-page="${LANDING.name}"] a[data-link-to="${ONBOARDING.name}"]`
        )
        .click();
      const opened = await page
        .waitForFunction(
          (title) =>
            document
              .querySelector('[data-slot="page-view"] [data-slot="title"]')
              ?.textContent?.trim() === title,
          ONBOARDING.title,
          { timeout: 20_000 }
        )
        .then(
          () => true,
          () => false
        );
      const back = await page.evaluate(() => ({
        url: location.search,
        unlocks: [
          ...document.querySelectorAll<HTMLAnchorElement>(
            '[data-slot="page-facts"] [data-links="unlocks"] a[data-link-to]'
          ),
        ].map((a) => a.dataset.linkTo),
        title:
          document
            .querySelector('[data-slot="page-view"] [data-slot="title"]')
            ?.textContent?.trim() ?? null,
      }));
      kit.check(
        `(c) ${tag}: pressing "${ONBOARDING.title}" opens it in the tab, its facts naming the link back`,
        opened &&
          back.url.includes(`page=${ONBOARDING.name}`) &&
          JSON.stringify(back.unlocks) === JSON.stringify([LANDING.name]),
        JSON.stringify(back)
      );
      await settle(page);
      await house.at(page, `${tag} the opened page`);
      const found = await page.evaluate(scan);
      spilled += found.length;
      kit.check(
        `(d) ${tag} the opened page: nothing spills, no control covers text`,
        found.length === 0,
        found.join(" | ")
      );
      await page.close();
    }
    house.report();
  }
  kit.check(
    "(d) the overflow sweep at 390, 680 and 1440 on Chromium and WebKit totals zero",
    spilled === 0,
    `${spilled} found`
  );
  kit.check(
    "(e) no console error on any page",
    errors.length === 0,
    errors.slice(0, 6).join(" | ")
  );
};

const spec: Spec = { name: "decisions-list", run };
export default spec;
