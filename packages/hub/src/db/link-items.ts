/**
 * Before migration 0487's SQL runs: the item each task link names, read by
 * the parser the hub reads every URL with (providers registry.ts
 * `itemOfUrl`), so the mirror rows 0487 makes are keyed as the hub keys
 * them from then on. SQL alone cannot read a URL so.
 *
 * `__link_items` gets one row per link 0487 keeps:
 *
 * - each `task_links` row, its item read off its URL (`src_rowid` its
 *   row). A URL the parser no longer reads keeps the item its own columns
 *   name (its source, kind, and number or ref), under no repository, and
 *   is logged: nothing else would ever read it;
 * - each Actions run a task's `waits_on:` or a plan step's wait names
 *   (`project_task_edges`, `session_plan_steps`), a `related` link of its
 *   task or plan (db task-links.ts `planLinkOwner`) with no `src_rowid`:
 *   a wait on a run is a link from 0487 on, so it has its row before the
 *   first poll. A pull request's wait has its row already.
 *
 * It also logs each item two tasks held as their record under URLs written
 * differently: 0487 keeps one record per item, the task the tracker sync
 * links to it, else the first linked, and makes the other `related`.
 */
import type { Database } from "bun:sqlite";
import { linkTarget } from "@cawco/core/wait-targets";
import { itemOfUrl } from "@cawco/providers/registry";

interface LinkRow {
  kind: string;
  mode: string;
  number: number | null;
  project_id: string;
  ref: string;
  rowid: number;
  source: string;
  task_id: string;
  url: string;
}

/** Where a source's items live when a URL names none. */
const HOSTS: Readonly<Record<string, string>> = {
  github: "github.com",
  linear: "linear.app",
  gitlab: "gitlab.com",
};

const CREATE = `CREATE TABLE __link_items (
  project_id text NOT NULL,
  task_id text NOT NULL,
  url text NOT NULL,
  mode text NOT NULL,
  provider text NOT NULL,
  host text NOT NULL,
  container text NOT NULL,
  kind text NOT NULL,
  key text NOT NULL,
  ref text NOT NULL,
  item_url text,
  src_rowid integer,
  PRIMARY KEY (project_id, task_id, url)
)`;

const INSERT = `INSERT OR IGNORE INTO __link_items
  (project_id, task_id, url, mode, provider, host, container, kind, key, ref, item_url, src_rowid)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

/** The run waits of tasks and plans, by the task or plan that waits. */
const RUN_WAITS = `SELECT t.project_id AS project_id, t.id AS task_id, e.other_id AS wait
FROM project_task_edges e
JOIN project_tasks t ON t.project_id = e.project_id AND t.path = e.path
WHERE e.kind = 'waits_on' AND e.other_id LIKE '%/actions/runs/%'
UNION
SELECT i.project_id AS project_id, 'plan:' || s.instance_id AS task_id, s.waits_on AS wait
FROM session_plan_steps s
JOIN instances i ON i.id = s.instance_id
WHERE i.project_id IS NOT NULL AND s.waits_on LIKE '%/actions/runs/%'`;

/** Items two tasks hold as their record, as 0487 groups them. */
const RECORDS_TWICE = `SELECT project_id, provider, host, container, kind, key, group_concat(task_id, ', ') AS tasks
FROM __link_items WHERE mode = 'record'
GROUP BY project_id, provider, host, container, kind, key
HAVING count(*) > 1`;

/** Makes and fills `__link_items` for 0487 (which drops it). Run only in a start that applies 0487 (db/migrate.ts). */
export const placeLinkItems = (client: Database): void => {
  client.run(CREATE);
  const insert = client.prepare(INSERT);
  for (const row of client
    .query<LinkRow, []>(
      "SELECT rowid, project_id, task_id, url, mode, source, kind, number, ref FROM task_links ORDER BY rowid"
    )
    .all()) {
    const item = itemOfUrl(row.url);
    if (!item) {
      console.info(
        `[migrations] 0487: project ${row.project_id} ${row.task_id}: ${row.url} names no item the hub reads; its mirror row is the ${row.source} ${row.kind} ${row.ref} its link kept`
      );
    }
    insert.run(
      row.project_id,
      row.task_id,
      row.url,
      row.mode,
      item?.provider ?? row.source,
      item?.host ?? HOSTS[row.source] ?? "",
      item?.container ?? "",
      item?.kind ?? row.kind,
      item?.key ?? (row.number === null ? row.ref : String(row.number)),
      item?.ref ?? row.ref,
      item?.url ?? row.url,
      row.rowid
    );
  }
  for (const wait of client
    .query<{ project_id: string; task_id: string; wait: string }, []>(RUN_WAITS)
    .all()) {
    const run = linkTarget(wait.wait);
    const item = run && itemOfUrl(run.url);
    if (run?.kind === "run" && item) {
      insert.run(
        wait.project_id,
        wait.task_id,
        wait.wait,
        "related",
        item.provider,
        item.host,
        item.container,
        item.kind,
        item.key,
        item.ref,
        item.url,
        null
      );
    }
  }
  for (const row of client
    .query<
      {
        container: string;
        key: string;
        kind: string;
        project_id: string;
        provider: string;
        tasks: string;
      },
      []
    >(RECORDS_TWICE)
    .all()) {
    console.info(
      `[migrations] 0487: project ${row.project_id}: ${row.tasks} each held ${row.provider} ${row.container} ${row.kind} ${row.key} as their record; one keeps it (the task the tracker sync links, else the first linked) and the others link it as related`
    );
  }
};
