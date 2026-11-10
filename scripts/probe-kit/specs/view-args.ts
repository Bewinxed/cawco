/**
 * A view tool's arguments are held to one schema at every door (core
 * views-library `viewToolInput`, a `z.strictObject` per tool), so a view
 * that passes its check never meets a 422 when it draws. Before, the draft
 * check (hub openui.ts `toolProblems`) read only a Query's tool name, the
 * in-process `view_query` stripped a key its tool doesn't take, and the
 * route (strict since the hub's `normalize: false`) refused it: the same
 * call passed one door and failed another.
 *
 * On a scratch fleet (real hub, agent and sessiond), a project with one
 * session, whose tools the probe calls through the hub's tool door, and the
 * same call, `Query("tasks", { limit: 5 })` (`tasks` takes stage, kind and
 * label):
 * 1. `view_draft` of a view holding it is refused, naming the statement and
 *    `limit`; the same view with `{ stage: "Doing" }` is drafted.
 * 2. `POST /api/projects/:id/view-tools/tasks` with `{ limit: 5 }` answers
 *    422 naming `limit` (hub unknown-fields.ts); with `{}` it answers rows.
 * 3. `view_query` of `tasks` with `{ limit: 5 }` is refused, naming
 *    `limit`; with no arguments it answers rows.
 *
 *   bun scripts/probe-kit/run.ts view-args
 */

import { hubFailureWords } from "../../../packages/core/src/words/hub-failure";
import { toolWords } from "../../lib/tool-call";
import { MACHINE, type Reply } from "../../scratch-fleet";
import type { Kit, Spec } from "../spec";

const respond = (): Reply => ({ everyMs: 5, words: ["ok"] });

/** The prompt's own example view (core views-library `EXAMPLE`), its tasks Query's arguments `args` as written. */
const viewWith = (args: string) => `root = Column([title, board])
tasks = Query("tasks", ${args}, {rows: []})
stages = Query("stages", {}, {stages: [], byKind: {you: 0, done: 0}, total: 0})
title = Text("Doing", "title")
board = Board(@Each(stages.stages, "s", StageColumn(s, tasks.rows, ["type"])), "By stage")`;

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

  const project = await fleet.api((hub) =>
    hub.api.projects.post({
      name: "Garden views",
      machineId: MACHINE,
      cwd: fleet.repo,
      caw: false,
    })
  );
  const session = await fleet.spawn("claude", "Garden views", fleet.repo, {
    projectId: project.id,
  });
  const as = {
    base: fleet.base,
    id: session,
    credential: await fleet.sessionCredential(session),
  };
  const unknown = hubFailureWords.unknownArguments(
    'tasks = Query("tasks", …)',
    "tasks",
    ["limit"]
  );

  // 1. The draft check.
  const refusedDraft = await toolWords(as, "view_draft", {
    name: "doing",
    source: viewWith("{limit: 5}"),
  });
  const drafted = await toolWords(as, "view_draft", {
    name: "doing",
    source: viewWith('{stage: "Doing"}'),
  });
  kit.check(
    '1: the draft check refuses Query("tasks", { limit: 5 }), naming the statement and `limit`, and drafts it with `stage`',
    refusedDraft.refused &&
      refusedDraft.text.includes(unknown) &&
      !drafted.refused,
    JSON.stringify({ refusedDraft, drafted: drafted.text.slice(0, 200) })
  );

  // 2. The route.
  // A variable, not a literal: TypeScript refuses an extra property only on
  // a fresh object literal, so this reaches the route through Eden. `stage: undefined` is what JSON leaves out.
  const tooMuch = { limit: 5, stage: undefined };
  const routeRefused = await fleet
    .api((hub) =>
      hub.api.projects({ id: project.id })["view-tools"].tasks.post(tooMuch)
    )
    .then(
      (answer) => `answered ${JSON.stringify(answer)}`,
      (error: unknown) =>
        error instanceof Error ? error.message : String(error)
    );
  const routeTaken = await fleet
    .api((hub) =>
      hub.api.projects({ id: project.id })["view-tools"].tasks.post({})
    )
    .catch((error: unknown) => ({
      refused: error instanceof Error ? error.message : String(error),
    }));
  kit.check(
    "2: the tasks route refuses { limit: 5 } with a 422 naming `limit`, and answers {} with rows",
    routeRefused.includes(": 422 ") &&
      routeRefused.endsWith(hubFailureWords.unknownFields("body", ["limit"])) &&
      "rows" in routeTaken &&
      Array.isArray(routeTaken.rows),
    JSON.stringify({ routeRefused, routeTaken })
  );

  // 3. view_query, the in-process path.
  const queryRefused = await toolWords(as, "view_query", {
    tool: "tasks",
    args: { limit: 5 },
  });
  const queried = await toolWords(as, "view_query", { tool: "tasks" });
  kit.check(
    "3: view_query refuses tasks with { limit: 5 }, naming `limit`, and answers it with none",
    queryRefused.refused &&
      queryRefused.text.includes(
        hubFailureWords.unknownArguments('Query("tasks", …)', "tasks", [
          "limit",
        ])
      ) &&
      !queried.refused &&
      queried.text.includes('"rows"'),
    JSON.stringify({ queryRefused, queried: queried.text.slice(0, 200) })
  );
};

const spec: Spec = {
  group: "Previews, pages and comments",
  name: "view-args",
  run,
};

export default spec;
