/**
 * `bun run session-plans <database>` in packages/hub: what migration 0418
 * will do to a hub database's session plans (`session_plans.steps` and
 * `session_plans.orphaned_comments`, JSON, which 0418 moves to the rows of
 * `session_plan_steps` and `session_plan_step_comments`), read before it
 * runs. Opens the database read-only (a copy of a live hub's, or a fixture
 * unpacked) and counts its plans as placed (it reads whole and moves to rows
 * as it is), never set (it reads whole and holds no step and no comment: a
 * spec written alone, nothing to place) and restrictive (it does not read
 * whole: kept as stored, none of it placed, and the plan says it holds
 * steps that do not read), with the steps and comments placed, and names
 * each restrictive plan. Read with 0418's own predicates
 * (db/session-plans-unread.ts); on a database 0418 has run on it says so
 * and counts nothing.
 */
import { Database } from "bun:sqlite";
import { plansKept } from "../src/db/session-plans-unread";

const [path] = process.argv.slice(2);
if (!path) {
  console.error(
    "session-plans: name the database: bun run session-plans <path>"
  );
  process.exit(2);
}
const client = new Database(path, { readonly: true });
const ran =
  client
    .query<{ found: number }, []>(
      "SELECT count(*) AS found FROM pragma_table_info('session_plans') WHERE name = 'steps'"
    )
    .get()?.found !== 1;
if (ran) {
  console.log(
    `session_plans.steps, session_plans.orphaned_comments: 0418 has run on ${path}; read a copy taken before it`
  );
} else {
  const plans = plansKept(client);
  const placed = plans.flatMap((plan) =>
    plan.reading.kind === "placed" ? [plan.reading] : []
  );
  const never = plans.filter((plan) => plan.reading.kind === "never");
  const unread = plans.filter((plan) => plan.reading.kind === "unread");
  const steps = placed.reduce((sum, one) => sum + one.steps, 0);
  const comments = placed.reduce((sum, one) => sum + one.comments, 0);
  console.log(
    `session_plans: ${plans.length} read, ${placed.length} placed, ${never.length} never set, ${unread.length} restrictive; ${steps} steps and ${comments} comments placed`
  );
  /** A value as this shows it: cut short, on one line. */
  const shown = (raw: string | null): string => JSON.stringify(raw ?? "");
  for (const plan of unread) {
    if (plan.reading.kind === "unread") {
      console.log(
        `  restrictive: ${plan.instanceId}: steps ${shown(plan.steps)}, orphaned comments ${shown(plan.orphans)}: ${plan.reading.why}`
      );
    }
  }
}
client.close();
