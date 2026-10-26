/**
 * `bun scripts/seed-stand-ins.ts`: one-shot migration, run once on each
 * machine before its agent is replaced by the build that reads the stand-ins
 * record. For every workspace in the agent's state dir whose folder is its
 * own clone, as the agent lists them (boundary.ts `readWorkspaces`:
 * `create.json`'s path), it writes `stand-ins.json`
 * (stand-ins.ts `listedFileOf`) from CawCo's block in that clone's
 * `info/exclude` as it stands; a clone with no block gets an empty record.
 * One line per workspace. Run again, it writes the same records. Delete this
 * script once it has run.
 */
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  infoExcludeOf,
  readExclude,
} from "../packages/agent/src/checkout-exclude";
import { ownFolderSync } from "../packages/agent/src/layer";
import { listedFileOf } from "../packages/agent/src/stand-ins";
import { workspaceStateDir, workspacesDir } from "../packages/core/src/paths";
import { writeStateFile } from "../packages/core/src/state-file";
import { isPlace } from "../packages/core/src/workspace-policy";

const ids = await readdir(workspacesDir()).catch(() => [] as string[]);
for (const id of ids.sort()) {
  if (isPlace(id)) {
    console.log(`${id}: a place, no stand-ins`);
    continue;
  }
  const created = await readFile(
    join(workspaceStateDir(id), "create.json"),
    "utf8"
  )
    .then((text) => JSON.parse(text) as { path?: string })
    .catch(() => undefined);
  const path = created?.path;
  if (!path) {
    console.log(`${id}: no create.json path, skipped`);
    continue;
  }
  if (!ownFolderSync(id, path)) {
    console.log(`${id}: ${path} is not its own clone, skipped`);
    continue;
  }
  const exclude = await infoExcludeOf(path);
  if (!exclude) {
    console.log(`${id}: ${path} is no git checkout, skipped`);
    continue;
  }
  const listed = (await readExclude(exclude)).listed.filter(Boolean);
  const record = JSON.stringify(listed);
  const file = listedFileOf(id);
  const before = await readFile(file, "utf8").catch(() => undefined);
  if (before === record) {
    console.log(`${id}: ${listed.length} stand-ins, record unchanged`);
    continue;
  }
  await writeStateFile(file, record);
  console.log(`${id}: ${listed.length} stand-ins written to ${file}`);
}
