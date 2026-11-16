/**
 * `bun run forgotten-names-places <database> [<trash>]` in packages/hub:
 * how a hub's Forgotten projects name their projects, and where its live
 * projects' checkouts stand, read off a copy of its database (opened
 * read-only) and of its trash (`<data>/projects/.trash`, read as the list
 * reads it, project-trash.ts `trashNaming`). Nothing is written. The
 * database is one this build's hub has migrated (a live hub's): a fixture
 * still at an older schema has no `agents.home`.
 *
 * Names, by trash entry:
 * - named: its record reads, and names its project;
 * - read alone: its record does not read whole, but its name does: listed
 *   under it since the list reads the name alone (it was listed unnamed);
 * - none held: a folder with no record (forgotten before the hub kept
 *   records, or a fold of then the list may hide), or a record whose name
 *   does not read either. The hub holds its name nowhere: it stays listed
 *   as an unnamed project (core words project-ends.ts `unnamed`).
 *
 * Checkouts of live projects, by rule:
 * - machine gone: on a machine no longer in the fleet, which a machine's
 *   removal deletes (db machines.ts `deleteMachine`);
 * - scratch: under a machine's CawCo scratch root (`<home>/.cawco/tmp`,
 *   core paths/roots.ts `workspaceScratchRoot`), a delegate's own dir,
 *   removed when its session ends (agent host-scratch.ts);
 * - workspace clone: a workspace's clone, or inside one;
 * - same folder: one another live project holds too;
 * - within: inside another live project's wider checkout, as the list's
 *   `within` names them (core place-nesting.ts): those projects hold the
 *   folder's parent, never the folder as their place.
 */
import { Database } from "bun:sqlite";
import { join } from "node:path";
import { placeNesting } from "@cawco/core/place-nesting";
import { type EntryNaming, trashNaming } from "../src/project-trash";

const [database, trash] = process.argv.slice(2);
if (!database) {
  console.error(
    "forgotten-names-places: name the database: bun run forgotten-names-places <database> [<trash dir>]"
  );
  process.exit(2);
}

// ── Names ──
if (trash) {
  const entries = await trashNaming(trash);
  const listed = entries.filter(
    (one) => one.folder && (one.record === "none" || one.record === "unread")
  );
  const named = entries.filter((one) => one.record === "forgotten");
  const alone = listed.filter((one) => one.name !== null);
  const none = listed.filter((one) => one.name === null);
  const rest = entries.length - named.length - listed.length;
  console.log(
    `trash: ${entries.length} entries, ${named.length} named by their record, ${alone.length} named by their record's name read alone, ${none.length} with no name held, ${rest} not listed as forgotten (held rows, folds, records with no folder that do not read)`
  );
  const line = (one: EntryNaming) =>
    `${one.entry}${one.folder ? "/" : ""} record=${one.record}`;
  for (const one of alone) {
    console.log(`  read alone: ${line(one)} name=${JSON.stringify(one.name)}`);
  }
  for (const one of none) {
    console.log(`  no name held: ${line(one)}`);
  }
} else {
  console.log("trash: no trash dir named, so no entry is counted");
}

// ── Checkouts ──
const client = new Database(database, { readonly: true });
const places = client
  .query<
    {
      id: string;
      projectId: string;
      name: string;
      machineId: string;
      path: string;
      kind: string;
    },
    []
  >(
    "SELECT pl.id AS id, pl.project_id AS projectId, p.name AS name, pl.machine_id AS machineId, pl.path AS path, pl.kind AS kind FROM project_places pl JOIN projects p ON p.id = pl.project_id ORDER BY p.name, pl.path"
  )
  .all();
const machines = new Map(
  client
    .query<{ machineId: string; home: string | null }, []>(
      "SELECT machine_id AS machineId, home FROM agents"
    )
    .all()
    .map((one) => [one.machineId, one.home])
);
const clones = client
  .query<{ machineId: string; path: string }, []>(
    "SELECT machine_id AS machineId, path FROM workspaces"
  )
  .all();
client.close();

const slash = (path: string): string =>
  path.endsWith("/") ? path : `${path}/`;
/** Whether `path` is `folder` or inside it. */
const inside = (path: string, folder: string): boolean =>
  slash(path).startsWith(slash(folder));

const projects = [
  ...new Map(places.map((one) => [one.projectId, one.name])).entries(),
].map(([id, name]) => ({
  id,
  name,
  places: places.filter((one) => one.projectId === id),
}));
const checkouts = places.filter((one) => one.kind === "checkout");
const rules = {
  "machine gone": checkouts.filter((one) => !machines.has(one.machineId)),
  scratch: checkouts.filter((one) => {
    const home = machines.get(one.machineId);
    return home ? inside(one.path, join(home, ".cawco", "tmp")) : false;
  }),
  "workspace clone": checkouts.filter((one) =>
    clones.some(
      (clone) =>
        clone.machineId === one.machineId && inside(one.path, clone.path)
    )
  ),
  "same folder": checkouts.filter((one) =>
    checkouts.some(
      (other) =>
        other.projectId !== one.projectId &&
        other.machineId === one.machineId &&
        slash(other.path) === slash(one.path)
    )
  ),
  within: checkouts.filter(
    (one) => placeNesting(one.projectId, one, projects).within.length > 0
  ),
};
console.log(
  `checkouts: ${checkouts.length} across ${projects.length} live projects, ${Object.entries(
    rules
  )
    .map(([rule, found]) => `${found.length} ${rule}`)
    .join(", ")}`
);
for (const [rule, found] of Object.entries(rules)) {
  for (const one of found) {
    const within =
      rule === "within"
        ? ` in ${placeNesting(one.projectId, one, projects)
            .within.map((other) => other.name)
            .join(", ")}`
        : "";
    console.log(
      `  ${rule}: ${one.name} (${one.projectId}) ${one.machineId}:${one.path}${within}`
    );
  }
}
