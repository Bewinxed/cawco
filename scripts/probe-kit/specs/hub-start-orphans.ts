/**
 * The hub starts on a database holding what a deleted project or session
 * left behind (nightly 4627, 2026-10-20: the hub died at every start,
 * "SQLiteError: FOREIGN KEY constraint failed … at keepPort … at address",
 * and was rolled back). On a scratch fleet:
 *
 *   bun scripts/probe-kit/run.ts hub-start-orphans
 *
 * A project's two pages, one with a Preview embed of a dev server, each
 * shown in its session's panel; the hub stopped; then, as an older hub left
 * them: one shown page naming a project that is no longer there (a project
 * deleted while its pages stayed), and a shown preview of a session that is
 * no longer there. The artifacts' project key migration is made to run again over them.
 *
 * (a) The hub starts, and answers.
 * (b) No artifact names a missing project, and no preview port is kept for
 *     an owner the hub does not hold.
 * (c) The healthy page is served on its project's origin with its embed.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MACHINE, type Reply, type Seen } from "../../scratch-fleet";
import type { Kit, Spec } from "../kit";
import { passedFetch } from "../preview-pass";

const respond = (request: Seen): Reply => ({
  everyMs: 5,
  words: [request.tools ? "ok" : "Probe title"],
});

const KEPT = (site: string) => `root = Decisions("Pair the code", [leave])
leave = Decision("leave", "When you approve, how does the code leave?", [swallow, fly], "Both drawn live.")
swallow = Option("swallow", "Caw swallows the code", "It goes in one gulp.", true, [desk], "Less to watch.")
fly = Option("fly", "The code flies up to Caw", "It travels up the page.", false, [], "More motion to follow.")
desk = Preview("${site}", "Desk · Caw swallows the code")`;

const ORPHAN = `root = Decisions("Name the plan", [plan])
plan = Decision("plan", "What is the plan called?", [short, long], "One word reads faster.")
short = Option("short", "Short", "One word.", true, [], "Less to say.")
long = Option("long", "Long", "A phrase.", false, [], "Harder to say.")`;

/** A project id no project holds: what a deleted project's page still named. */
const GONE_PROJECT = "a0a0a0a0-dead-4000-8000-000000000000";
/** A session id no session holds: what a gone session's shown preview still named. */
const GONE_SESSION = "b0b0b0b0-dead-4000-8000-000000000000";

const DRIZZLE = join(import.meta.dir, "../../../packages/hub/drizzle");

/**
 * The artifacts' project key migration's own statements, when this tree has
 * it (main before it does not). Run again by hand over what an older hub
 * left: the migrator runs only what is newer than the newest migration it
 * recorded, so with a later one recorded (0280) dropping this one's row no
 * longer runs it, and running the later ones again fails (0280 drops a
 * column already gone).
 */
const cleanupStatements = (): string[] | undefined => {
  const journal = JSON.parse(
    readFileSync(join(DRIZZLE, "meta/_journal.json"), "utf8")
  ) as { entries: { tag: string }[] };
  const entry = journal.entries.find((one) =>
    one.tag.endsWith("_artifacts_project_key")
  );
  if (!entry) {
    return;
  }
  return readFileSync(join(DRIZZLE, `${entry.tag}.sql`), "utf8")
    .split("--> statement-breakpoint")
    .map((statement) => statement.trim())
    .filter(Boolean);
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
  const dir = `${fleet.sandbox}/orphans-site`;
  await Bun.$`mkdir -p ${dir} && git init -q -b main ${dir}`.quiet();
  const { id: projectId } = await fleet.api<{ id: string }>("/api/projects", {
    name: "Orphans",
    machineId: MACHINE,
    cwd: dir,
    caw: false,
  });
  const writer = await fleet.spawn("claude", "Pair the code", dir, {
    projectId,
  });
  const other = await fleet.spawn("claude", "Name the plan", dir, {
    projectId,
  });
  const at = (session: string) => `/api/instances/${session}/artifacts`;
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: () =>
      new Response("<!doctype html><h1>The live site</h1>", {
        headers: { "content-type": "text/html" },
      }),
  });
  const site = await fleet.api<{ id: string }>(at(writer), {
    kind: "preview",
    does: "try",
    ask: "Try this page and say whether it works",
    name: "orphans-site",
    port: server.port,
    machine: MACHINE,
  });
  const kept = await fleet.api<{ id: string }>(at(writer), {
    kind: "page",
    does: "pick",
    ask: "Pick how the code leaves",
    name: "pairing",
    program: KEPT(site.id),
  });
  const orphan = await fleet.api<{ id: string }>(at(other), {
    kind: "page",
    does: "pick",
    ask: "Pick the plan's name",
    name: "plan-name",
    program: ORPHAN,
  });
  for (const [session, id] of [
    [writer, kept.id],
    [other, orphan.id],
  ] as const) {
    await (
      await fetch(`${fleet.base}${at(session)}/${id}/show`, { method: "POST" })
    ).text();
  }

  // As an older hub left them, written with no keys enforced.
  await fleet.stop("hub");
  fleet.write(
    "UPDATE artifacts SET project_id = ? WHERE id = ?",
    GONE_PROJECT,
    orphan.id
  );
  fleet.write(
    "INSERT INTO shown_previews (instance_id, artifact_id) VALUES (?, ?)",
    GONE_SESSION,
    kept.id
  );
  const cleanup = cleanupStatements();
  if (cleanup) {
    fleet.script(cleanup);
  }
  fleet.launch("hub");
  const started = await fleet.hubUp().then(
    () => "answering",
    (error: unknown) => String(error).slice(0, 1500)
  );
  kit.check(
    "(a) the hub starts on a shown page of a missing project and a shown preview of a missing session, and answers",
    started === "answering",
    started
  );
  if (started !== "answering") {
    server.stop(true);
    return;
  }

  const [named] = fleet.query<{ n: number }>(
    "SELECT count(*) AS n FROM artifacts WHERE project_id IS NOT NULL AND project_id NOT IN (SELECT id FROM projects)"
  );
  const ports = fleet.query<{
    instance_id: string | null;
    project_id: string | null;
  }>(
    `SELECT instance_id, project_id FROM preview_ports
     WHERE (instance_id IS NOT NULL AND instance_id NOT IN (SELECT id FROM instances))
        OR (project_id IS NOT NULL AND project_id NOT IN (SELECT id FROM projects))`
  );
  kit.check(
    "(b) no artifact names a missing project, and no preview port is kept for an owner the hub does not hold",
    named?.n === 0 && ports.length === 0,
    JSON.stringify({ named: named?.n, ports })
  );

  const { port } = await fleet.api<{ port: number }>(
    `/api/projects/${projectId}/preview-address`,
    {}
  );
  const page = await passedFetch(
    fleet,
    `http://127.0.0.1:${port}/__cawco/page/${kept.id}/`
  );
  const html = await page.text();
  kit.check(
    "(c) the healthy page is served on its project's origin, its Preview embed with an address",
    page.status === 200 && html.includes('"embed":"http'),
    `${page.status} ${html.slice(html.indexOf("cawco-media"), html.indexOf("cawco-media") + 300)}`
  );
  server.stop(true);
};

const spec: Spec = {
  group: "The hub and machines",
  name: "hub-start-orphans",
  run,
};
export default spec;
