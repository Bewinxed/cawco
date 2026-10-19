/**
 * The project's decision graph stays whole across sessions and revisions
 * (Projects spec §5.8: derived from the programs the project's folder
 * keeps), on a scratch fleet: a real hub, agent and sessiond, two Claude
 * Code sessions of one project against the mock model, their pages made
 * and revised through the hub's artifact routes as artifact_create and
 * artifact_update make them. Read from the hub: its answers, the graph,
 * the artifact's state and the project's folder.
 *
 *   bun scripts/probe-kit/run.ts decision-graph
 *
 * (a) A page whose `after` names a card its other page lacks is told so
 *     on create (`broken.unlinked`, naming that page and card).
 * (b) A second session of the project reads the first's page with its
 *     program, and revises it: one statement drops a picked decision that
 *     the other page comes after, one drops a picked option. Its answer
 *     names all three (`broken.picked`, `broken.options`, `broken.after`,
 *     which also names the decision the other page wants and it never had);
 *     the folder's page.oui is the revised program.
 * (c) The graph keeps the picks: the card whose option went is not drawn
 *     picked and names the option gone; its state still holds both picks;
 *     its problems say the broken `after`s with their page and card, and
 *     both orphaned picks.
 * (d) A page whose artifact is deleted still draws its cards, unpicked,
 *     said under the graph.
 */
import { MACHINE, type Reply, type Seen } from "../../scratch-fleet";
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

/** The second session's revision: the trial taken out, the seat option replaced by a team one. */
const REVISION = `root = Decisions("Price the hosted plan", [shape])
shape = Decision("shape", "What does a customer pay for?", [team, machine], "A machine is what the fleet costs to run.")
team = Option("team", "Per team", "One price for the whole team.", false, [], "A big team pays what a small one does.")`;

interface Broken {
  after?: Record<string, string[]>;
  options?: Record<string, string[]>;
  picked?: string[];
  unlinked?: string[];
}

interface GraphRead {
  cards: { gone: string[]; id: string; picked: boolean }[];
  edges: [string, string][];
  problems: string[];
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

  const graphOf = () =>
    fleet.api<GraphRead>(`/api/projects/${projectId}/decisions/graph`);
  const graph = await graphOf();
  const shape = graph.cards.find((card) => card.id === "pricing#shape");
  kit.check(
    "(c) the card whose picked option went is not drawn picked, and names the option gone; both picks are kept",
    shape?.picked === false &&
      JSON.stringify(shape.gone) === JSON.stringify(["seat"]) &&
      JSON.stringify(now.state.shape?.options) === JSON.stringify(["seat"]) &&
      JSON.stringify(now.state.trial?.options) === JSON.stringify(["week"]),
    JSON.stringify({ shape, state: now.state })
  );
  const said = [
    "launch#date comes after pricing#trial: pricing has no decision trial.",
    "launch#promo comes after pricing#discount: pricing has no decision discount.",
    "pricing#shape was picked as seat, which the page no longer offers; the pick is kept.",
    "pricing#trial was picked, and the page no longer asks it; the pick is kept.",
  ];
  kit.check(
    "(c) the graph's problems say each broken after with its page and card, and each orphaned pick",
    said.every((line) => graph.problems.includes(line)) &&
      graph.edges.length === 0,
    JSON.stringify(graph.problems)
  );

  const gone = await fetch(`${fleet.base}${at(writer)}/${launch.id}?by=agent`, {
    method: "DELETE",
  });
  const after = await graphOf().catch((error: unknown) => String(error));
  kit.check(
    "(d) a page whose artifact is gone still draws its cards, unpicked, said under the graph",
    gone.ok &&
      typeof after !== "string" &&
      ["launch#date", "launch#promo"].every((id) =>
        after.cards.some((card) => card.id === id && !card.picked)
      ) &&
      after.problems.some((line) =>
        line.startsWith("decisions/launch/ has no artifact on this hub")
      ),
    typeof after === "string" ? after : JSON.stringify(after.problems)
  );
};

const spec: Spec = { name: "decision-graph", run };
export default spec;
