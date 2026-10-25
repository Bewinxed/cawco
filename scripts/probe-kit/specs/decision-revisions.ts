/**
 * A project's decision pages stay whole across sessions and revisions
 * (Projects spec §5.8: read from the programs the project's folder
 * keeps), on a scratch fleet: a real hub, agent and sessiond, two Claude
 * Code sessions of one project against the mock model, their pages made
 * and revised through the hub's artifact routes as artifact_create and
 * artifact_update make them. Read from the hub: its answers, the
 * Decisions list, the artifact's state and the project's folder.
 *
 *   bun scripts/probe-kit/run.ts decision-revisions
 *
 * (a) A page whose `after` names a card its other page lacks is told so
 *     on create (`broken.unlinked`, naming that page and card). A statement
 *     whose string never closes is refused, on create and on revision,
 *     naming the statement and where the string opens.
 * (b) A second session of the project reads the first's page with its
 *     program, and revises it: one statement drops a picked decision that
 *     the other page comes after, one drops a picked option. Its answer
 *     names all three (`broken.picked`, `broken.options`, `broken.after`,
 *     which also names the decision the other page wants and it never had);
 *     the folder's page.oui is the revised program.
 * (c) The picks are kept: the list counts no pick on the card whose
 *     option went, its state still holds both picks, and artifact_list
 *     counts no pick made there.
 * (g) The page drawn on its session's origin: the card whose picked option
 *     went stands open, its head its question alone, nothing marked; a pick on
 *     an option it offers marks it, the card open.
 * (d) artifact_delete of a project's page takes its page.oui out of the
 *     folder with it, and the list holds no row for it.
 * (e) A project's page outlives its writing session: the session deleted,
 *     its row stays with no session, the list counts its card picked, and
 *     the later page that comes after it names it as words both ways
 *     (rollout's `after`, pricing's `unlocks`).
 * (f) A later session's create of the page's name in the project is a
 *     revision of that page: the same artifact, its picks kept.
 * (h) An old drag of the decision graph's, kept in a sent page's state under
 *     `graph.places` after its send, reads the page as not sent; migration
 *     0317, run again by a hub start that finds it unapplied, takes it out:
 *     the page reads as sent, its pick kept, its state (what artifact_read's
 *     value lines list) holds no `graph.places`, and no change row names it.
 */
import type { Page } from "playwright-core";
import { GRAPH_PLACES_MIGRATION_WHEN } from "../../../packages/hub/src/db/drop-graph-places";
import { MACHINE, type Reply, type Seen, until } from "../../scratch-fleet";
import type { Kit, Spec } from "../kit";

const respond = (request: Seen): Reply => ({
  everyMs: 5,
  words: [request.tools ? "ok" : "Probe title"],
});

const PRICING = `root = Decisions("Price the hosted plan", [shape, trial])
shape = Decision("shape", "What does a customer pay for?", [seat, machine], "A machine is what the fleet costs to run.")
seat = Option("seat", "Per seat", "Each person on the team pays.", false, [], "A solo builder with five machines pays once.")
machine = Option("machine", "Per machine", "Each machine that joins the fleet pays.", true, [], "A team on one machine pays once.")
trial = Decision("trial", "How long is the trial?", [week, month], "A month covers a whole project.", [], ["shape"])
week = Option("week", "A week", "People decide fast.", false, [], "Too short to finish a real project.")
month = Option("month", "A month", "Thirty days, then pay.", true, [], "Revenue starts a month later.")`;

const LAUNCH = `root = Decisions("Plan the launch", [date, promo])
date = Decision("date", "When does the launch go out?", [soon, later], "The trial sets how long the first wave waits.", [], ["pricing#trial"])
soon = Option("soon", "This month", "Ships with the trial.", true, [], "Less time to polish.")
later = Option("later", "Next month", "More time to polish.", false, [], "The waitlist waits.")
promo = Decision("promo", "Is there a launch discount?", [none, half], "Price is the pitch.", [], ["pricing#discount"])
none = Option("none", "No discount", "The price stands.", true, [], "Fewer sign-ups the first week.")
half = Option("half", "Half off", "The first month at half.", false, [], "A month of half revenue.")`;

/** A page whose last Diagram's string never closes (its `")` lost), as a leaf once published it. */
const OPEN_STRING = `root = Decisions("Pick the link", [link])
link = Decision("link", "Does the link open?", [yes, no], "It opens in place.", [linkyesd])
yes = Option("yes", "Yes", "It opens.", true, [], "One more page to keep.")
no = Option("no", "No", "It stays shut.", false, [], "The reader goes elsewhere.")
linkyesd = Diagram("flowchart LR\\nTap --> Open`;

/** The same lost `")` in a revision of a kept page. */
const OPEN_TAIL = `shape = Decision("shape", "What does a customer pay for?", [seat, machine], "A machine is what the fleet costs to run.", [linkyesd])
linkyesd = Diagram("flowchart LR\\nSeat --> Machine`;

/** The second session's revision: the trial taken out, the seat option replaced by a team one. */
const REVISION = `root = Decisions("Price the hosted plan", [shape])
shape = Decision("shape", "What does a customer pay for?", [team, machine], "A machine is what the fleet costs to run.")
team = Option("team", "Per team", "One price for the whole team.", false, [], "A big team pays what a small one does.")`;

/** A later session's page that comes after the pricing card left standing: the link once launch is gone. */
const ROLLOUT = `root = Decisions("Plan the rollout", [go])
go = Decision("go", "Does the rollout start now?", [ship, hold], "The price is set first.", [], ["pricing#shape"])
ship = Option("ship", "Ship it", "Goes out this week.", true, [], "Less time to polish.")
hold = Option("hold", "Hold it", "Waits for the next release.", false, [], "The waitlist waits.")`;

/**
 * A card as the page draws it: how many things stand in its head beside
 * the question (a card's head is its question alone), whether it stands
 * open (every option showing: a card never folds), and its options marked.
 */
const cardHead = (page: Page, id: string) =>
  page.evaluate((card) => {
    const root = document.getElementById(`decision-${card}`);
    const head = root?.querySelector("header");
    const options = [
      ...(root?.querySelectorAll<HTMLElement>("[data-option]") ?? []),
    ];
    return {
      beside: head ? head.children.length - 1 : -1,
      open:
        options.length > 0 &&
        options.every((one) => one.checkVisibility({ opacityProperty: true })),
      marked: options
        .filter((one) => one.hasAttribute("data-cawco-picked"))
        .map((one) => one.dataset.option ?? ""),
    };
  }, id);

interface Broken {
  after?: Record<string, string[]>;
  options?: Record<string, string[]>;
  picked?: string[];
  unlinked?: string[];
}

interface ListRead {
  pages: {
    after: { name: string; title: string }[];
    artifactId: string | null;
    cards: number;
    name: string;
    picked: number;
    unlocks: { name: string; title: string }[];
  }[];
}

interface Read {
  program?: string;
  state: Record<string, { options: string[] }>;
}

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
  const dir = `${fleet.sandbox}/pricing-site`;
  await Bun.$`mkdir -p ${dir} && git init -q -b main ${dir}`.quiet();
  const { id: projectId } = await fleet.api<{ id: string }>("/api/projects", {
    name: "Pricing",
    machineId: MACHINE,
    cwd: dir,
    caw: false,
  });
  const writer = await fleet.spawn("claude", "Price the plan", dir, {
    projectId,
  });
  const later = await fleet.spawn("claude", "Plan the launch", dir, {
    projectId,
  });
  const at = (session: string) => `/api/instances/${session}/artifacts`;
  const page = (name: string, program: string) =>
    fleet.api<{ broken?: Broken; id: string }>(at(writer), {
      kind: "page",
      does: "pick",
      ask: "Pick one option on each card",
      name,
      program,
    });
  const pricing = await page("pricing", PRICING);
  const launch = await page("launch", LAUNCH);
  kit.check(
    "(a) an after naming a card its page lacks is told on create, with that page and card",
    JSON.stringify(launch.broken) ===
      JSON.stringify({
        unlinked: [
          "promo after pricing#discount: pricing has no decision discount",
        ],
      }),
    JSON.stringify(launch.broken)
  );
  const answered = (made: unknown) => `kept ${JSON.stringify(made)}`;
  const refusal = (error: unknown) => String(error);
  const unclosedCreate = await page("open", OPEN_STRING).then(
    answered,
    refusal
  );
  const unclosedRevision = await fleet
    .api(`${at(writer)}/${pricing.id}/statements`, { statements: OPEN_TAIL })
    .then(answered, refusal);
  kit.check(
    "(a) a statement whose string never closes is refused on create and on revision, 422, naming the statement and where it opens",
    unclosedCreate.includes(
      ` 422 linkyesd: the string opened at line 5, column 20 is never closed: end it with ".`
    ) &&
      unclosedRevision.includes(
        ` 422 linkyesd: the string opened at line 2, column 20 is never closed: end it with ".`
      ),
    `${unclosedCreate.slice(0, 300)} | ${unclosedRevision.slice(0, 300)}`
  );
  const picked = await fetch(`${fleet.base}${at(writer)}/${pricing.id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      patch: [
        { op: "add", path: "/shape", value: { options: ["seat"], note: "" } },
        { op: "add", path: "/trial", value: { options: ["week"], note: "" } },
      ],
    }),
  });
  kit.check("the person's picks are kept", picked.ok, await picked.text());

  const seen = await fleet.api<Read>(`${at(later)}/${pricing.id}`);
  kit.check(
    "(b) another session of the project reads the page with its program",
    seen.program === `${PRICING.trim()}\n`,
    (seen.program ?? "no program").slice(0, 200)
  );
  const revised = await fleet.api<{
    broken?: Broken;
    moved: { removed: string[] };
  }>(`${at(later)}/${pricing.id}/statements`, { statements: REVISION });
  kit.check(
    "(b) its revision answers the orphaned picks and the broken after",
    JSON.stringify(revised.moved.removed) === JSON.stringify(["trial"]) &&
      JSON.stringify(revised.broken) ===
        JSON.stringify({
          picked: ["trial"],
          options: { shape: ["seat"] },
          after: { trial: ["launch#date"], discount: ["launch#promo"] },
        }),
    JSON.stringify(revised)
  );
  const kept = await fleet.api<{ content: string }>(
    `/api/projects/${projectId}/folder/file?path=decisions/pricing/page.oui`
  );
  const now = await fleet.api<Read>(`${at(writer)}/${pricing.id}`);
  kit.check(
    "(b) the folder's page.oui is the revised program",
    kept.content === now.program && kept.content.includes('"team"'),
    kept.content.slice(0, 200)
  );

  const listOf = () =>
    fleet.api<ListRead>(`/api/projects/${projectId}/decisions`);
  const listed = await listOf();
  const pricingRow = listed.pages.find((each) => each.name === "pricing");
  kit.check(
    "(c) the list counts no pick on the card whose option went; both picks are kept in its state",
    pricingRow?.picked === 0 &&
      pricingRow.cards === 1 &&
      JSON.stringify(now.state.shape?.options) === JSON.stringify(["seat"]) &&
      JSON.stringify(now.state.trial?.options) === JSON.stringify(["week"]),
    JSON.stringify({ pricingRow, state: now.state })
  );
  const status = (
    await fleet.api<{ id: string; picks?: { asked: number; made: number } }[]>(
      `${at(writer)}/status`
    )
  ).find((each) => each.id === pricing.id);
  kit.check(
    "(c) artifact_list counts no pick made on the card whose option went",
    status?.picks?.asked === 1 && status.picks.made === 0,
    JSON.stringify(status?.picks)
  );
  kit.check(
    "(c) an after naming a decision the page no longer has links nothing: launch names no page, pricing unlocks none",
    listed.pages.find((each) => each.name === "launch")?.after.length === 0 &&
      pricingRow?.unlocks.length === 0,
    JSON.stringify(listed.pages)
  );

  // (g) The page itself, on its project's origin, as the panel loads it.
  const { port } = await fleet.api<{ port: number }>(
    `/api/projects/${projectId}/preview-address`,
    {}
  );
  const tab = await kit.page("desk", { theme: "light" });
  await tab.goto(
    `http://${new URL(fleet.base).hostname}:${port}/__cawco/page/${pricing.id}/`
  );
  await tab.waitForSelector("#decision-shape header h2");
  const goneHead = await cardHead(tab, "shape");
  kit.check(
    '(g) the card whose picked option went stands open, its head its question alone (no "Not picked"), nothing marked',
    goneHead.beside === 0 && goneHead.open && goneHead.marked.length === 0,
    JSON.stringify(goneHead)
  );
  const repicked = await fetch(`${fleet.base}${at(writer)}/${pricing.id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      patch: [
        {
          op: "replace",
          path: "/shape",
          value: { options: ["machine"], note: "" },
        },
      ],
    }),
  });
  // The page as it is served again: the doc's picks as the hub keeps them now.
  await tab.reload();
  await tab.waitForSelector("#decision-shape header h2");
  const pickedHead = await cardHead(tab, "shape");
  kit.check(
    "(g) a pick on an option the card offers marks it, the card open, its head its question alone",
    repicked.ok &&
      pickedHead.open &&
      pickedHead.beside === 0 &&
      JSON.stringify(pickedHead.marked) === '["machine"]',
    JSON.stringify(pickedHead)
  );
  await tab.close();

  const folderFile = (path: string) =>
    fleet
      .api<{ content: string }>(
        `/api/projects/${projectId}/folder/file?path=${path}`
      )
      .then(
        () => "there",
        (error: unknown) => String(error)
      );
  const gone = await fetch(`${fleet.base}${at(writer)}/${launch.id}?by=agent`, {
    method: "DELETE",
  });
  const launchFile = await folderFile("decisions/launch/page.oui");
  const after = await listOf();
  kit.check(
    "(d) artifact_delete of a project's page takes its page.oui out of the folder, and the list holds no row for it",
    gone.ok &&
      launchFile.includes(" 404") &&
      !after.pages.some((each) => each.name === "launch"),
    `${gone.status} | ${launchFile} | ${JSON.stringify(after.pages.map((each) => each.name))}`
  );

  // (e) The rollout comes after the pricing card; then the writer goes.
  await fleet.api(at(later), {
    kind: "page",
    does: "pick",
    ask: "Pick when the rollout starts",
    name: "rollout",
    program: ROLLOUT,
  });
  // The person stops the writing session, then deletes it.
  await fleet.post({
    verb: "stop",
    machineId: MACHINE,
    instanceId: writer,
    requestId: crypto.randomUUID(),
    payload: { instanceId: writer },
  });
  const stopped = await until(
    "the writing session stopped",
    () =>
      fleet.query<{ status: string }>(
        "SELECT status FROM instances WHERE id = ?",
        writer
      )[0],
    (row) => row.status === "stopped",
    60_000
  ).catch(() => undefined);
  // Its machine says it holds the session no more a beat after the stop.
  let deleteSaid = "";
  await until(
    "the stopped writing session deleted",
    async () => {
      const deleted = await fetch(`${fleet.base}/api/instances/${writer}`, {
        method: "DELETE",
      });
      deleteSaid = `${deleted.status} ${await deleted.text()}`;
      return deleted.ok;
    },
    Boolean,
    60_000
  ).catch(() => undefined);
  const dropped = await until(
    "the writing session's row gone from the hub",
    () =>
      fleet.query<{ n: number }>(
        "SELECT count(*) AS n FROM instances WHERE id = ?",
        writer
      )[0],
    (row) => row.n === 0,
    120_000
  ).catch(() => undefined);
  const [ending] = fleet.query<{
    end_confirmed_at: number | null;
    end_intent: string | null;
    status: string;
  }>(
    "SELECT status, end_intent, end_confirmed_at FROM instances WHERE id = ?",
    writer
  );
  const [stayed] = fleet.query<{ instance_id: string | null }>(
    "SELECT instance_id FROM artifacts WHERE id = ?",
    pricing.id
  );
  const outlived = await listOf();
  const pricingNow = outlived.pages.find((each) => each.name === "pricing");
  const rolloutNow = outlived.pages.find((each) => each.name === "rollout");
  kit.check(
    "(e) the writing session deleted, its project's page stays with no session, the list counts its card picked, and the rollout names it both ways",
    !!dropped &&
      stayed?.instance_id === null &&
      pricingNow?.picked === 1 &&
      JSON.stringify(rolloutNow?.after) ===
        JSON.stringify([{ name: "pricing", title: "Price the hosted plan" }]) &&
      JSON.stringify(pricingNow?.unlocks) ===
        JSON.stringify([{ name: "rollout", title: "Plan the rollout" }]),
    JSON.stringify({
      dropped: !!dropped,
      writer: {
        stopped: !!stopped,
        deleted: deleteSaid,
        ending: ending ?? null,
      },
      stayed: stayed ?? null,
      pages: outlived.pages,
    })
  );

  // (f) A later session makes the page of that name again.
  const remade = await fleet
    .api<{ id: string }>(at(later), {
      kind: "page",
      does: "pick",
      ask: "Pick one option on each card",
      name: "pricing",
      program: now.program,
    })
    .catch((error: unknown) => ({ id: String(error) }));
  const reread = await fleet
    .api<Read>(`${at(later)}/${pricing.id}`)
    .catch(() => undefined);
  const [owner] = fleet.query<{ instance_id: string | null }>(
    "SELECT instance_id FROM artifacts WHERE id = ?",
    pricing.id
  );
  const [pages] = fleet.query<{ n: number }>(
    "SELECT count(*) AS n FROM artifacts WHERE project_id = ? AND name = 'pricing' AND kind = 'page'",
    projectId
  );
  kit.check(
    "(f) a later session's create of the page's name is a revision of that page: the same artifact, now its panel's, its pick kept",
    remade.id === pricing.id &&
      owner?.instance_id === later &&
      pages?.n === 1 &&
      JSON.stringify(reread?.state.shape?.options) ===
        JSON.stringify(["machine"]),
    JSON.stringify({
      remade: remade.id,
      owner: owner ?? null,
      pages: pages?.n,
      shape: reread?.state.shape ?? null,
    })
  );

  // (h) The rollout picked and sent; then a drag of the graph's kept after the send.
  const rolloutId =
    (await listOf()).pages.find((each) => each.name === "rollout")
      ?.artifactId ?? "";
  const patch = (body: unknown) =>
    fetch(`${fleet.base}${at(later)}/${rolloutId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ patch: body }),
    });
  const standing = () =>
    fleet
      .api<{ state: string }>(`/api/projects/${projectId}/decisions/rollout`)
      .then((read) => read.state);
  const pickedGo = await patch([
    { op: "add", path: "/go", value: { options: ["ship"], note: "" } },
  ]);
  await fleet.api(`/api/projects/${projectId}/decisions/rollout/send`, {});
  const sentFirst = await standing();
  const dragged = await patch([
    {
      op: "add",
      path: "/graph.places",
      value: { options: [], note: "", value: { go: { x: 640, y: 320 } } },
    },
  ]);
  const drifted = await standing();
  const seeded = await fleet.api<Read>(`${at(later)}/${rolloutId}`);
  kit.check(
    "(h) seeded: a sent page whose state takes a graph.places entry after its send reads as not sent",
    pickedGo.ok &&
      dragged.ok &&
      sentFirst === "sent" &&
      drifted === "picking" &&
      "graph.places" in seeded.state,
    JSON.stringify({
      picked: pickedGo.status,
      dragged: dragged.status,
      sentFirst,
      drifted,
      keys: Object.keys(seeded.state),
    })
  );
  // The hub stopped, 0317 marked unapplied, the hub started: it runs again.
  await fleet.stop("hub");
  fleet.write(
    "DELETE FROM __drizzle_migrations WHERE created_at = ?",
    GRAPH_PLACES_MIGRATION_WHEN
  );
  fleet.launch("hub");
  await fleet.hubUp();
  const migrated = await standing();
  const cleaned = await fleet.api<Read>(`${at(later)}/${rolloutId}`);
  const [applied] = fleet.query<{ n: number }>(
    "SELECT count(*) AS n FROM __drizzle_migrations WHERE created_at = ?",
    GRAPH_PLACES_MIGRATION_WHEN
  );
  const [changeRows] = fleet.query<{ n: number }>(
    "SELECT count(*) AS n FROM artifact_changes WHERE key = 'graph.places'"
  );
  kit.check(
    "(h) migration 0317 takes graph.places out: the page reads as sent, its pick kept, its state holds no graph.places, no change row names it",
    migrated === "sent" &&
      !("graph.places" in cleaned.state) &&
      JSON.stringify(cleaned.state.go?.options) === JSON.stringify(["ship"]) &&
      applied?.n === 1 &&
      changeRows?.n === 0,
    JSON.stringify({
      migrated,
      keys: Object.keys(cleaned.state),
      applied: applied?.n,
      changeRows: changeRows?.n,
    })
  );
};

const spec: Spec = { name: "decision-revisions", run };
export default spec;
