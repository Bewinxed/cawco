/**
 * Every skeleton swap the cutover fixed, held to DESIGN.md's Claim Of
 * Nothing and Real Wait Rules on the built dashboard (skeleton-swap.ts):
 * for each site, its read held back past the grace, then let go,
 *
 *  - nothing seen inside `--dur-wait-grace`, the skeleton seen past it;
 *  - the skeleton's box is what replaces it (inline within 2 px, block
 *    within 2 px or the row pitch where the count is the read's);
 *  - the arrival is one cross-fade over `--dur-control`, one clock;
 *  - no empty state while the read is held.
 *
 *   bun scripts/probe-kit/run.ts web skeleton-swaps
 *
 * A scratch fleet; one project, Caw off, with the three decision pages a
 * session publishes (decisions-preview/seed.ts: a graph among them) and
 * three routines (target Caw, so each run is skipped, never a session).
 * At 1440, light:
 *
 *  1. Routines (ViewRoutines): the page's blocks stand as they will, the
 *     Routines block's body three skeleton rows at the ledger's pitch,
 *     against the three routines read.
 *  2. Decisions, the list (DecisionsView): tiles at a tile's size in the
 *     grid's columns, against the pages read, on a cold first visit and on a
 *     second one:
 *     a. the graphed project, cold: under the List | Graph segment's room,
 *        from the project's row (`decisionsGraphed`, hub decisions.ts);
 *     b. a project whose one page forms no graph, cold: at the list's top;
 *     c. the graphed project read a second time in one browser.
 *  3. Decisions, the graph: the graph's own box.
 *  4. A decision page opened (DecisionPage): its opening line, the page's
 *     box, against what its read brings (its frame).
 *  5. Its frame (PageFrame): its opening line, against the page's frame.
 *  6. An artifact in a tab of its own (routes/artifact/[id]): the panel's
 *     card, against the pane.
 *  7. A task's review stage (ArtifactStage): the well, against the pane,
 *     the task's reads answered with one finished attempt that presented
 *     the page.
 *  8a. Routines read a second time in the same browser: every block's body,
 *     Sources and Actions too, stands at the height it last drew at
 *     (kept-bodies.ts): the whole page's box is the read's.
 */
// biome-ignore-all lint/performance/noAwaitInLoops: one leg at a time, in order
import type { Page } from "playwright-core";
import {
  PRICING,
  pageProgram,
  seedDecisions,
} from "../../../decisions-preview/seed";
import { MACHINE, type Reply } from "../../../scratch-fleet";
import type { Kit, KitFleet, Spec } from "../../kit";
import {
  type HeldRead,
  holdRead,
  proveSwap,
  type SwapSite,
  watchSwaps,
} from "../../skeleton-swap";

const respond = (): Reply => ({ everyMs: 5, words: ["ok"] });

/** The reads each leg holds. */
const ROUTINES_READ = /\/api\/routines\?projectId=/;
const DECISIONS_READ = /\/api\/projects\/[^/]+\/decisions$/;
const GRAPH_READ = /\/api\/projects\/[^/]+\/decisions\/graph$/;
const PAGE_READ = /\/api\/projects\/[^/]+\/decisions\/landing$/;
const ADDRESS_READ = /\/api\/instances\/[^/]+\/preview-(address|ticket)/;
const ARTIFACT_READ = /\/api\/artifacts\/[^/?]+$/;
/** A project's tasks, and one task, as the board and the pane read them. */
const TASK_READS = /\/api\/projects\/[^/]+\/tasks(\/[^/?]+)?(\?.*)?$/;

/** As many routines as the Routines block's skeleton has rows (BlockPage `READING_ROWS`). */
const ROUTINES = ["Morning triage", "Weekly digest", "Nightly sweep"];

/** Opens `url` on a desk with `read` held, its site watched from the first script. */
const heldPage = async (
  kit: Kit,
  url: string,
  read: RegExp,
  site: SwapSite
): Promise<{ page: Page; held: HeldRead }> => {
  const page = await kit.page("desk", { theme: "light" });
  page.setDefaultTimeout(60_000);
  await watchSwaps(page, [site]);
  const held = await holdRead(page, read);
  await page.goto(url, { waitUntil: "domcontentloaded" });
  return { page, held };
};

const leg = async (kit: Kit, url: string, read: RegExp, site: SwapSite) => {
  const { page, held } = await heldPage(kit, url, read, site);
  await proveSwap(kit, page, site, held);
  await page.close();
};

/**
 * The same page read a second time in one browser: drawn once whole (what
 * it drew is kept), then opened again with the read held.
 */
const revisit = async (kit: Kit, url: string, read: RegExp, site: SwapSite) => {
  const page = await kit.page("desk", { theme: "light" });
  page.setDefaultTimeout(60_000);
  await watchSwaps(page, [site]);
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(site.content);
  await page.waitForTimeout(800);
  const held = await holdRead(page, read);
  await page.reload({ waitUntil: "domcontentloaded" });
  await proveSwap(kit, page, site, held);
  await page.close();
};

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
  const base = await fleet.dashboard();

  const seeded = await seedDecisions(fleet, {
    name: "skeleton-swaps",
    machineId: MACHINE,
    cwd: fleet.repo,
  });
  const project = seeded.projectId;
  for (const name of ROUTINES) {
    await fleet.api("/api/routines", {
      projectId: project,
      name,
      cron: "0 9 * * 1-5",
      timeZone: "UTC",
      target: "lead",
      prompt: `${name}.`,
      keep: true,
    });
  }
  const at = (query: string) => `${base}/project/${project}?${query}`;

  // 1. Routines.
  await leg(kit, at("view=routines"), ROUTINES_READ, {
    name: "1 routines",
    skeleton: '[data-routines-reading] [data-block="routines"]',
    content: '[data-routines-read] [data-block="routines"]',
    empty: '[data-routines-read] [data-slot="empty"]',
  });

  // 8a. Routines read again: every block's body where it last stood.
  await revisit(kit, at("view=routines"), ROUTINES_READ, {
    name: "8a routines again",
    skeleton: '[data-routines-reading] [data-slot="blocks"]',
    content: '[data-routines-read] [data-slot="blocks"]',
    empty: '[data-routines-read] [data-slot="empty"]',
  });

  // 2. Decisions, the list: cold on the graphed project and on one with no
  // graph, then the graphed one read a second time.
  const listSite = (name: string): SwapSite => ({
    name,
    skeleton: '[data-decisions-reading="list"]',
    content: '[data-slot="decisions"] [data-slot="grid"]',
    empty: '[data-slot="decisions"] [data-slot="empty"]',
  });
  await leg(
    kit,
    at("view=decisions"),
    DECISIONS_READ,
    listSite("2a decisions list, graphed, cold")
  );
  const flat = await flatProject(fleet);
  await leg(
    kit,
    `${base}/project/${flat}?view=decisions`,
    DECISIONS_READ,
    listSite("2b decisions list, no graph, cold")
  );
  await revisit(
    kit,
    at("view=decisions"),
    DECISIONS_READ,
    listSite("2c decisions list, graphed, again")
  );

  // 3. Decisions, the graph.
  await leg(kit, at("view=decisions&mode=graph"), GRAPH_READ, {
    name: "3 decisions graph",
    skeleton: '[data-decisions-reading="graph"]',
    content: "[data-decisions-graph-read]",
    empty: '[data-slot="decisions"] [data-slot="empty"]',
  });

  // 4. A decision page, its read held: its opening line, then its frame.
  await leg(kit, at("view=decisions&page=landing"), PAGE_READ, {
    name: "4 decision page",
    skeleton: "[data-decision-opening]",
    content: '[data-page-frame-opening], [data-slot="decisions"] iframe',
  });

  // 5. Its frame, the page's address held.
  await leg(kit, at("view=decisions&page=landing"), ADDRESS_READ, {
    name: "5 decision page frame",
    skeleton: "[data-page-frame-opening]",
    content: '[data-slot="decisions"] iframe',
  });

  // 6. An artifact in a tab of its own.
  const artifact = seeded.artifacts.landing;
  await leg(kit, `${base}/artifact/${artifact}`, ARTIFACT_READ, {
    name: "6 artifact tab",
    skeleton: "[data-artifact-opening]",
    content: '[data-slot="artifact-tab"] > [data-artifact-arrived]',
    empty: '[data-slot="artifact-tab"] [data-slot="empty"]',
  });

  // 7. A task's review stage, drawing what its session presented.
  const task = await fleet.api<{ id: string }>(
    `/api/projects/${project}/tasks`,
    { title: "Make the landing page" }
  );
  const stageSite: SwapSite = {
    name: "7 task review stage",
    skeleton: "[data-artifact-stage-opening]",
    content: "[data-artifact-stage-arrived]",
  };
  const page = await kit.page("desk", { theme: "light" });
  page.setDefaultTimeout(60_000);
  await watchSwaps(page, [stageSite]);
  await presented(page, task.id, {
    artifactId: artifact,
    instanceId: seeded.writers.landing,
  });
  const held = await holdRead(page, ARTIFACT_READ);
  await page.goto(at(`task=${task.id}`), { waitUntil: "domcontentloaded" });
  await proveSwap(kit, page, stageSite, held);
  await page.close();
};

/**
 * A second project, Caw off, whose one decision page forms no graph (the
 * pricing page: no card names another in `after`, none in a Section),
 * published by a session of its own: its id.
 */
const flatProject = async (fleet: KitFleet): Promise<string> => {
  const { id } = await fleet.api<{ id: string }>("/api/projects", {
    name: "skeleton-swaps-flat",
    caw: false,
  });
  const writer = await fleet.spawn("claude", PRICING.writer, fleet.repo, {
    projectId: id,
  });
  await fleet.api(`/api/instances/${writer}/artifacts`, {
    kind: "page",
    name: PRICING.name,
    program: pageProgram(PRICING),
  });
  return id;
};

/**
 * The task's reads, as the hub answers them, with one finished attempt
 * that presented `artifactId` (`task_result`): what puts a task's review
 * stage on it, here without a delegate (which a workspace cannot start).
 */
const presented = (
  page: Page,
  taskId: string,
  by: { artifactId: string; instanceId: string }
) => {
  const now = Date.now();
  const attempt = {
    endedAt: now,
    endedHow: null,
    headline: "Made the landing page",
    instanceId: by.instanceId,
    result: {
      artifacts: [{ kind: "artifact", artifactId: by.artifactId }],
      at: now,
      check: [],
      summary: "Made the landing page.",
    },
    startedAt: now - 60_000,
    state: "done",
    workItemId: "probe-skeleton-swaps",
  };
  const withAttempt = (task: { id: string; attempts?: unknown[] }) =>
    task.id === taskId ? { ...task, attempts: [attempt] } : task;
  return page.route(TASK_READS, async (route) => {
    const answer = await route.fetch();
    const body = (await answer.json()) as
      | { id: string; attempts?: unknown[] }
      | { tasks: { id: string; attempts?: unknown[] }[] };
    const told =
      "tasks" in body
        ? { ...body, tasks: body.tasks.map(withAttempt) }
        : withAttempt(body);
    await route.fulfill({ response: answer, json: told });
  });
};

const spec: Spec = { name: "skeleton-swaps", run };
export default spec;
