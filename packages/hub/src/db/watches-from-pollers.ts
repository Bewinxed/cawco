/**
 * Before migration 0486's SQL runs, the hub's log names what 0486 cannot
 * carry as it stood, one line each, read with 0486's own predicates over
 * the tables as they stand before it:
 *
 * - a project whose GitHub poller and tracker binding name different
 *   connections for one repository: 0486 makes one watch of it, which reads
 *   with the binding's connection (provider spec §4: the person chose it at
 *   binding; the poller's was followed automatically). The poller's is
 *   kept to read with once the binding goes: set aside here in
 *   {@link STASH}, which 0486 leaves alone, and placed on the watch as
 *   `settings.pollerConnection` once the migrations have run
 *   ({@link placePollerConnections});
 * - a GitHub poller whose project links no repository on github.com and
 *   whose cursors name none: 0486 makes it no watch. Its connection is
 *   named, with the one a repository the project links later is followed by
 *   (the first connection by name that reads GitHub's API and names the
 *   project, as the poll derived it), or none.
 */
import type { Database } from "bun:sqlite";
import { WatchSettingsSchema } from "./stored-shapes";

/** Where the step before 0486 sets aside each poller's connection a binding's replaces, until it is placed on the watch. */
const STASH = "__watch_poller_connections";

/** A poller's repositories as 0486 reads them: its project's github.com links and its cursors' repositories. */
const POLLER_REPOS = `SELECT project_id, repo FROM (
  SELECT l.project_id, substr(l.remote, 12) AS repo
  FROM project_links l JOIN github_pollers p ON p.project_id = l.project_id
  WHERE l.remote GLOB 'github.com/?*/?*' AND l.remote NOT GLOB 'github.com/*/*/*'
  UNION SELECT project_id, repo FROM github_poll_cursors
)`;

/** Projects whose poller and binding read one repository with different connections. */
const SPLIT = `SELECT DISTINCT p.project_id AS project, b.target AS repo, p.connection AS poller, b.connection AS binding
FROM (${POLLER_REPOS}) r
JOIN github_pollers p ON p.project_id = r.project_id
JOIN tracker_bindings b ON b.project_id = r.project_id AND b.provider = 'github' AND lower(b.target) = lower(r.repo)
WHERE p.connection <> b.connection
ORDER BY p.project_id`;

/** Pollers 0486 makes no watch of, with the connection the project follows GitHub by from then. */
const REPOLESS = `SELECT p.project_id AS project, p.connection AS poller, (
  SELECT c.name FROM connections c JOIN connection_projects cp ON cp.connection_id = c.id
  WHERE cp.project_id = p.project_id AND lower(trim(c.service)) = 'github' AND c.auth IN ('bearer', 'app', 'gh', 'device')
  ORDER BY c.name LIMIT 1
) AS derived
FROM github_pollers p
WHERE NOT EXISTS (SELECT 1 FROM (${POLLER_REPOS}) r WHERE r.project_id = p.project_id)
ORDER BY p.project_id`;

/**
 * Logs each, one line, `[migrations] 0486: …`, and sets aside the poller's
 * connection of each repository a binding reads with another. Run only in
 * a start that applies 0486 (db/migrate.ts).
 */
export const logWatchesFromPollers = (client: Database): void => {
  client.run(`DROP TABLE IF EXISTS ${STASH}`);
  client.run(
    `CREATE TABLE ${STASH} AS SELECT project, repo, poller FROM (${SPLIT})`
  );
  for (const row of client
    .query<
      { project: string; repo: string; poller: string; binding: string },
      []
    >(SPLIT)
    .all()) {
    console.info(
      `[migrations] 0486: project ${row.project}: its GitHub poller read ${row.repo} with ${row.poller} and its tracker binding with ${row.binding}; its watch reads it with ${row.binding}, the binding's, and keeps ${row.poller} to read it with once the binding goes`
    );
  }
  for (const row of client
    .query<{ project: string; poller: string; derived: string | null }, []>(
      REPOLESS
    )
    .all()) {
    console.info(
      `[migrations] 0486: project ${row.project}: its GitHub poller read with ${row.poller} and it links no repository on github.com, so it keeps no watch; ${row.derived ? `a repository it links later is followed with ${row.derived}` : "no connection that reads GitHub's API names it, so a repository it links later is not followed until one does"}`
    );
  }
};

/**
 * After the migrations, on every start: each poller's connection the step
 * before 0486 set aside goes on its repository's watch as
 * `settings.pollerConnection` (db/watches.ts `stopSyncing` reads it), the
 * settings written as the hub writes them, and the table set aside goes.
 * Nothing on a start with none.
 */
export const placePollerConnections = (client: Database): void => {
  const stashed = client
    .query<{ name: string }, [string]>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?"
    )
    .get(STASH);
  if (!stashed) {
    return;
  }
  const rows = client
    .query<{ id: string; settings: string; poller: string }, []>(
      `SELECT w.id, w.settings, s.poller FROM ${STASH} s JOIN watches w ON w.project_id = s.project AND w.provider = 'github' AND lower(w.container) = lower(s.repo) AND w.sync != 'off'`
    )
    .all();
  const write = client.query<unknown, [string, string]>(
    "UPDATE watches SET settings = ? WHERE id = ?"
  );
  client.transaction(() => {
    for (const row of rows) {
      const settings = WatchSettingsSchema.parse({
        ...JSON.parse(row.settings),
        pollerConnection: row.poller,
      });
      write.run(JSON.stringify(settings), row.id);
      console.info(
        `[migrations] 0486: watch ${row.id} reads with ${row.poller} again once its binding goes`
      );
    }
    client.run(`DROP TABLE ${STASH}`);
  })();
};
