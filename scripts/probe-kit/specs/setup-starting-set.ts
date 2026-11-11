/**
 * Caw proposes a project's starting set while he sets it up (tsk-348, the
 * project-setup skill's starting set), on a scratch fleet (real hub, agent,
 * sessiond and Claude Code against the mock model, with the skills and
 * servers of `starting-set` installed). The session that proposes is a
 * session of a project not set up yet, whose tools the probe calls through
 * the hub's tool door, as Caw calls them: a worker in the project, Caw's
 * role. Every leg reads the ask as every screen reads it (`GET
 * /api/pending`, what Needs you and the setup board draw) and answers it
 * as the person's Approve and Deny do (`permission.answer`).
 *
 * - c1. The proposer reads the fleet's count, `calls_by_role` with project
 *   "all", as the skill's step tells him to.
 * - c2. `project_settings` with `set_starting_set` and `ask: true` parks one
 *   ask for the person and writes nothing yet: no `starting-set.md`. The ask
 *   is drawn as what joins a new set (core `setTables`, change `joins`), one
 *   row per item proposed, each with the fleet's calls of it, under "List 2
 *   items in Bakery's starting set".
 * - c3. Approved, the project's `starting-set.md` holds the set, and the
 *   next session the person starts in the project lists exactly that set's
 *   skills and CawCo's own.
 * - c4. In a second project, the same proposal denied leaves no
 *   `starting-set.md`, and the settings read says it has none.
 * - c5. Later, a proposal to add one skill to Bakery's set reaches the person
 *   the same way, drawn as the one item that joins it.
 *
 *   bun scripts/probe-kit/run.ts setup-starting-set
 */

import { realpathSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { RESOLVE_PERMISSION } from "../../../packages/core/src/ask-tools";
import type { StartingSet } from "../../../packages/core/src/delegate-types";
import { hubRequest } from "../../../packages/core/src/hub-request";
import type { PermissionPresentation } from "../../../packages/core/src/permission-presentation";
import { BUNDLED_SKILLS } from "../../../packages/hub/src/bundled-skills";
import { type ToolSession, toolWords } from "../../lib/tool-call";
import { MACHINE, type Seen, until } from "../../scratch-fleet";
import type { Kit, KitFleet, Spec } from "../kit";
import { awaitTurns, listingOf, same, setUp, wordsOf } from "./starting-set";

/** What Caw proposes: one of the account's skills and one of the plugin's. */
const PROPOSED: StartingSet = {
  skills: ["probe-set-beta", "probe-plug:plug-outside"],
  servers: [],
};
/** Bakery's set once a later proposal adds a skill. */
const GROWN: StartingSet = {
  skills: [...PROPOSED.skills, "probe-set-gamma"],
  servers: [],
};

interface Parked {
  payload?: {
    input?: Record<string, unknown>;
    instanceId?: string;
    presentation?: PermissionPresentation;
    toolName?: string;
  };
  requestId?: string;
}

const SETTINGS = "mcp__cawco__project_settings";

/** A project not set up yet, at a folder of its own, and a session of it: the proposer. */
const projectWithProposer = async (fleet: KitFleet, name: string) => {
  const root = join(fleet.sandbox, name.toLowerCase());
  await mkdir(root, { recursive: true });
  const cwd = realpathSync(root);
  const project = await fleet.api<{ id: string }>(
    hubRequest("POST /api/projects", {
      body: { name, machineId: MACHINE, cwd, caw: false },
    })
  );
  const session = await fleet.spawn("claude", `${name} setup`, cwd, {
    projectId: project.id,
  });
  const as = {
    base: fleet.base,
    id: session,
    credential: await fleet.sessionCredential(session),
  };
  return { cwd, id: project.id, session, as };
};

/** The proposal, as the skill's step writes it. */
const propose = (as: ToolSession, set: StartingSet, project: string) =>
  toolWords(as, "project_settings", {
    changes: [{ kind: "set_starting_set", starting_set: set }],
    reason: "Sessions doing this kind of work on the fleet called these.",
    ask: true,
    project,
  });

/** The settings ask `session` has parked for the person, once every screen holds it. */
const parkedOf = (fleet: KitFleet, session: string, after: Set<string>) =>
  until(
    `${session}'s starting set parked for the person`,
    async () =>
      (await fleet.api<Parked[]>(hubRequest("GET /api/pending"))).find(
        (one) =>
          one.payload?.instanceId === session &&
          one.payload.toolName === SETTINGS &&
          !after.has(one.requestId ?? "")
      ),
    Boolean,
    60_000
  ).catch(() => undefined);

/** The person's Approve or Deny on `parked`, then its leaving every screen. */
const answer = async (
  fleet: KitFleet,
  parked: Parked,
  allow: boolean
): Promise<boolean> => {
  const instanceId = parked.payload?.instanceId as string;
  await fleet.post({
    type: "command",
    commandId: crypto.randomUUID(),
    kind: "permission.answer",
    machineId: MACHINE,
    sessionId: instanceId,
    payload: {
      instanceId,
      requestId: parked.requestId,
      method: RESOLVE_PERMISSION,
      args: [
        parked.requestId,
        allow
          ? { behavior: "allow", updatedInput: parked.payload?.input ?? {} }
          : { behavior: "deny", message: "Not this set" },
      ],
    },
  });
  return until(
    `${parked.requestId} answered`,
    async () =>
      !(await fleet.api<Parked[]>(hubRequest("GET /api/pending"))).some(
        (one) => one.requestId === parked.requestId
      ),
    Boolean,
    60_000
  ).catch(() => false);
};

/** The project's `starting-set.md`, or null when it has none. */
const setFile = async (
  fleet: KitFleet,
  projectId: string
): Promise<string | null> =>
  fleet
    .api<{ content: string }>(
      hubRequest("GET /api/projects/:id/folder/file", {
        path: { id: projectId },
        query: { path: "starting-set.md" },
      })
    )
    .then(
      (file) => file.content,
      () => null
    );

/** The ask's tables as the screens draw them: change, item count, set, and its line. */
const drawn = (parked: Parked | undefined) => {
  const presentation = parked?.payload?.presentation;
  return {
    summary: presentation?.summary,
    tables: (presentation?.setTables ?? []).map((table) => ({
      change: table.change,
      set: table.set,
      items: table.rows.map((row) => `${row.kind}:${row.name}`),
    })),
  };
};

const itemsOf = (set: StartingSet) => [
  ...set.skills.map((name) => `skill:${name}`),
  ...set.servers.map((name) => `server:${name}`),
];

const run = async (kit: Kit) => {
  const fleet = await setUp(kit, () => ({ everyMs: 5, words: ["ok"] }));
  const bakery = await projectWithProposer(fleet, "Bakery");

  // c1: the count the proposal is drawn from.
  const count = await toolWords(bakery.as, "calls_by_role", { project: "all" });
  kit.check(
    "c1: the proposer reads the fleet's count, calls_by_role with project all",
    !count.refused && count.text.length > 0,
    count.text.slice(0, 200)
  );

  // c2: asked, parked, nothing written yet.
  const asked = await propose(bakery.as, PROPOSED, "Bakery");
  const first = await parkedOf(fleet, bakery.session, new Set());
  const before = await setFile(fleet, bakery.id);
  const firstDrawn = drawn(first);
  kit.check(
    "c2: project_settings with set_starting_set and ask: true parks one ask for the person, writes no starting-set.md, and is drawn as what joins a new set, one row per item, under its line",
    !asked.refused &&
      first !== undefined &&
      before === null &&
      firstDrawn.summary === "List 2 items in Bakery's starting set" &&
      firstDrawn.tables.length === 1 &&
      firstDrawn.tables[0]?.change === "joins" &&
      same(firstDrawn.tables[0]?.items ?? [], itemsOf(PROPOSED)),
    `the call said: ${asked.text.slice(0, 160)}; file before: ${before === null ? "none" : before}; drawn: ${JSON.stringify(firstDrawn)}`
  );

  // c3: approved, the file holds it, and the next session lists it.
  const approved = first ? await answer(fleet, first, true) : false;
  const written = await until(
    "Bakery's starting-set.md written",
    () => setFile(fleet, bakery.id),
    (file) => file !== null,
    60_000
  ).catch(() => null);
  const tag = "PROBE-BAKERY-NEXT";
  const next = await fleet.spawn("claude", tag, bakery.cwd, {
    projectId: bakery.id,
  });
  await fleet.send(next, `${tag}: say ok.`);
  const [turn] = await awaitTurns(fleet, tag);
  const listed = listingOf(wordsOf((turn as Seen).body));
  const expected = [...new Set([...PROPOSED.skills, ...BUNDLED_SKILLS])];
  kit.check(
    "c3: approved, the project's starting-set.md holds the set, and the next session started in the project lists exactly its skills and CawCo's own",
    approved &&
      written !== null &&
      PROPOSED.skills.every((name) => written.includes(name)) &&
      same(listed, expected),
    `approved: ${approved}; file: ${JSON.stringify(written)}; listed ${listed.join(", ")}`
  );

  // c4: in a second project, denied, no set.
  const mill = await projectWithProposer(fleet, "Mill");
  await propose(mill.as, PROPOSED, "Mill");
  const millAsk = await parkedOf(fleet, mill.session, new Set());
  const denied = millAsk ? await answer(fleet, millAsk, false) : false;
  const millFile = await setFile(fleet, mill.id);
  const read = await toolWords(mill.as, "project_settings", {});
  const noneLine = read.text
    .split("\n")
    .find((line) => line.includes("Starting set"));
  kit.check(
    "c4: denied, the project has no starting-set.md and its settings read says it has no set",
    denied &&
      millFile === null &&
      noneLine?.includes("Starting set: none") === true,
    `denied: ${denied}; file: ${JSON.stringify(millFile)}; read: ${noneLine}`
  );

  // c5: later, a set changed the same way.
  const again = await propose(bakery.as, GROWN, "Bakery");
  const later = await parkedOf(
    fleet,
    bakery.session,
    new Set([first?.requestId ?? ""])
  );
  const laterDrawn = drawn(later);
  kit.check(
    "c5: a later set_starting_set with ask: true reaches the person the same way, drawn as the one item that joins the set",
    !again.refused &&
      later !== undefined &&
      laterDrawn.summary === "List 1 item in Bakery's starting set" &&
      laterDrawn.tables.length === 1 &&
      laterDrawn.tables[0]?.change === "joins" &&
      same(laterDrawn.tables[0]?.items ?? [], ["skill:probe-set-gamma"]),
    `the call said: ${again.text.slice(0, 160)}; drawn: ${JSON.stringify(laterDrawn)}`
  );
};

const spec: Spec = {
  group: "Workspaces and what agents may touch",
  name: "setup-starting-set",
  run,
};
export default spec;
