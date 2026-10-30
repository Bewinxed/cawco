/**
 * `records_fixture` (the primitives spec §3, "The fixture tool"): a module
 * of a project's real records, trimmed to a count and redacted, for a
 * states file to import as a list story's arg, so a preview's list stands
 * on the product's own data and a count dial ranges over it. Each kind keeps
 * an allowlist, the columns a list row draws and nothing else, so what is
 * not named never leaves the hub: a task's body and its `## Comments` (the
 * owner's quoted words live there), a decision's page and log, a session's
 * launch folder and accounts, a machine's addresses and keys. Then core
 * `redactRecords`: secrets, emails, home paths, hosts, ids remapped. Dates
 * are kept as they are: a fixture's ages read from the stage's own clock.
 * Newest first, cut to the count.
 */
import {
  type RedactCounts,
  redactRecords,
  shortIds,
} from "@cawco/core/redact-records";

/** What a fixture may be made of. */
export const FIXTURE_KINDS = [
  "tasks",
  "decisions",
  "sessions",
  "routines",
  "machines",
] as const;
export type FixtureKind = (typeof FIXTURE_KINDS)[number];

/** The most records a fixture holds, and how many by default: the most a list control ranges over. Ours. */
export const FIXTURE_LIMITS = { most: 200, count: 60 } as const;

/** A record as the hub's readers hand it, before its projection. */
type Row = Record<string, unknown>;

/** What a fixture is read from: the hub's own readers of a project's records, and its credential filter. */
export interface FixtureDeps {
  records: (projectId: string, kind: FixtureKind) => Promise<Row[]>;
  secrets: (text: string) => Promise<string>;
}

const text = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value : null;
const time = (value: unknown): number | null => {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  const at = typeof value === "string" ? Date.parse(value) : Number.NaN;
  return Number.isFinite(at) ? at : null;
};

/** Each kind's id prefix in the fixture, its allowlist (the row's columns), and when a record last moved (its order). */
const KINDS: Record<
  FixtureKind,
  { at: (row: Row) => number; keep: (row: Row) => Row; prefix: string }
> = {
  tasks: {
    prefix: "tsk",
    at: (row) => time(row.updatedAt) ?? time(row.createdAt) ?? 0,
    keep: (row) => {
      const fields = (row.fields ?? {}) as Record<string, unknown>;
      const todos = (row.todos ?? {}) as { done?: unknown; total?: unknown };
      return {
        id: String(row.id),
        title: text(row.title) ?? "",
        stage: text(row.stage),
        labels: Array.isArray(row.labels)
          ? row.labels.filter((one) => typeof one === "string")
          : [],
        priority: text(fields.priority) ?? text(row.type),
        createdAt: time(row.createdAt),
        updatedAt: time(row.updatedAt),
        todos: {
          done: typeof todos.done === "number" ? todos.done : 0,
          total: typeof todos.total === "number" ? todos.total : 0,
        },
      };
    },
  },
  decisions: {
    prefix: "dec",
    at: (row) => time(row.settledAt) ?? time(row.askedAt) ?? 0,
    keep: (row) => ({
      id: String(row.id),
      title: text(row.title) ?? "",
      askedAt: time(row.askedAt),
      settledAt: time(row.settledAt),
      picked: text(row.picked),
      who: text(row.who),
    }),
  },
  sessions: {
    prefix: "ses",
    at: (row) => time(row.endedAt) ?? time(row.startedAt) ?? 0,
    keep: (row) => ({
      id: String(row.id),
      title: text(row.title) ?? "",
      harness: text(row.harness),
      status: text(row.status),
      startedAt: time(row.startedAt),
      endedAt: time(row.endedAt),
      machine: text(row.machine),
      project: text(row.project),
      cwd: text(row.project) ? `~/${text(row.project)}` : null,
    }),
  },
  routines: {
    prefix: "rtn",
    at: (row) => time(row.lastRunAt) ?? time(row.nextRunAt) ?? 0,
    keep: (row) => ({
      id: String(row.id),
      name: text(row.name) ?? "",
      schedule: text(row.schedule),
      lastRunAt: time(row.lastRunAt),
      lastRunStatus: text(row.lastRunStatus),
      nextRunAt: time(row.nextRunAt),
    }),
  },
  machines: {
    prefix: "mch",
    at: (row) => (row.online === true ? 1 : 0),
    keep: (row) => ({
      id: String(row.id),
      name: text(row.name) ?? "",
      online: row.online === true,
      harnesses: Array.isArray(row.harnesses)
        ? row.harnesses.filter((one) => typeof one === "string")
        : [],
    }),
  },
};

/** What a fixture holds and what was taken out of it, as the tool says it. */
export interface Fixture {
  available: number;
  fields: string[];
  redacted: RedactCounts;
  text: string;
  written: number;
}

/**
 * The fixture module's text from `rows` of `kind`: each projected through
 * its allowlist, newest first, cut to `count`, redacted, and printed as
 * `export const <exportName> = [...] as const;` under a line saying where
 * it came from. The same text for the same rows.
 */
async function fixtureText(
  kind: FixtureKind,
  rows: Row[],
  count: number,
  exportName: string,
  secrets: (text: string) => Promise<string>
): Promise<Fixture> {
  const shape = KINDS[kind];
  const kept = rows
    .filter((row) => row.id !== undefined && row.id !== null)
    .toSorted((a, b) => shape.at(b) - shape.at(a))
    .slice(0, Math.max(1, Math.min(FIXTURE_LIMITS.most, count)))
    .map(shape.keep);
  const ids = shortIds(
    shape.prefix,
    kept.map((one) => String(one.id))
  );
  const { records, counts } = await redactRecords(kept, ids, secrets);
  const fields = Object.keys(records[0] ?? shape.keep({ id: "" }));
  return {
    available: rows.length,
    written: records.length,
    fields,
    redacted: counts,
    text: [
      `/** ${records.length} of the project's ${kind}, newest first, trimmed and redacted by records_fixture: read-only, refreshed by calling it again. */`,
      `export const ${exportName} = ${JSON.stringify(records, null, 2)} as const;`,
      "",
    ].join("\n"),
  };
}

/** {@link fixtureText} of project `projectId`'s records of `kind`, read through the hub's own readers. */
export async function fixtureOf(
  deps: FixtureDeps,
  projectId: string,
  kind: FixtureKind,
  count: number,
  exportName: string
): Promise<Fixture> {
  return await fixtureText(
    kind,
    await deps.records(projectId, kind),
    count,
    exportName,
    deps.secrets
  );
}
