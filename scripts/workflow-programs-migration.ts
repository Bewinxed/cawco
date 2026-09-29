#!/usr/bin/env bun
/**
 * Carries editor-authored workflows across the program cutover (§13).
 *
 *   bun scripts/workflow-programs-migration.ts dump <db path> <file>
 *   bun scripts/workflow-programs-migration.ts restore <hub url> <file>
 *
 * `dump` reads the graphs out of the pre-migration database; `restore` posts
 * them back once the hub has migrated, so each one is recompiled to a program
 * by the same code path a save uses.
 */
import { Database } from "bun:sqlite";

const [command, target, file] = process.argv.slice(2);

if (command === "dump") {
  const db = new Database(target, { readonly: true });
  const rows = db
    .query(
      "select id, name, slug, description, graph from workflows order by name"
    )
    .all() as { description: string; graph: string; name: string }[];
  await Bun.write(
    file,
    JSON.stringify(
      rows.map((row) => ({
        name: row.name,
        description: row.description,
        graph: JSON.parse(row.graph),
      })),
      null,
      2
    )
  );
  process.stdout.write(`dumped ${rows.length} workflows to ${file}\n`);
} else if (command === "restore") {
  const saved = (await Bun.file(file).json()) as {
    description: string;
    graph: unknown;
    name: string;
  }[];
  for (const workflow of saved) {
    // biome-ignore lint/performance/noAwaitInLoops: one save at a time, so a workflow that calls another finds it already saved and the log reads in order.
    const response = await fetch(`${target}/api/workflows`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(workflow),
    });
    process.stdout.write(
      `${workflow.name}: ${response.status} ${(await response.text()).slice(0, 200)}\n`
    );
  }
} else {
  process.stdout.write("usage: dump <db> <file> | restore <hub url> <file>\n");
  process.exit(1);
}
