/**
 * Every row a hub wrote under an earlier build still reads at this one.
 *
 * Each stored JSON column (hub stored-json.ts `storedJson`) is parsed
 * against its zod schema on every read, and the hub stops at boot on the
 * first row that fails (`StoredShapeError`). So a change that makes a
 * column's shape narrower than it was (a value the old shape took that the
 * new one does not) must rewrite that column's rows in a migration added in
 * the same change.
 *
 * `bun stored-compat.ts` writes {@link RECORD}: every stored column's shape
 * as JSON Schema, by `table.column`, made by `z.toJSONSchema` from the
 * schema the column was declared with. The record at a commit is what a hub
 * built there reads.
 *
 * `bun stored-compat.ts --check [--base <ref>]` fails when the record is not
 * what the code makes, when a {@link REWRITES} entry names no column or no
 * journal tag, or when a column is narrower than it was at a base and no
 * entry covers it. Two bases: the merge-base with origin/main (or
 * `--base`), which gates a change, and the newest published nightly, which
 * gates a release. A base older than the record compares nothing and says
 * so. Each base's shape is the writer and the head's the reader: every
 * difference fails unless a rule in {@link narrowings} proves it wider.
 *
 * What this does not see, left to migrations:check on real rows:
 * - the code inside a refine, custom type, transform or coerce: the record
 *   marks where one is (`x-code`), and one added fails, but a change inside
 *   one changes nothing here;
 * - a key a row holds that its type never declared, or declared once with
 *   another type (stored-rows.ts reports these as `undeclared`);
 * - a plain text column that becomes a stored JSON one: it reads as new;
 * - a union whose first option reads a row as the wrong member.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { z } from "zod";
import { baseRefOf } from "./openapi-inputs";
import { newestNightly } from "./shipped";
import { storedColumns } from "./stored-rows";
import {
  extraKinds,
  git,
  isObject,
  kindsOf,
  quoted,
  valuesOf,
} from "./wire-compat";

// Read at run time beyond its imports; check.ts keys the check on them.
export const checkReads = ["packages/hub/"];

const HUB = resolve(import.meta.dir, "..");
const ROOT = resolve(HUB, "../..");
const RECORD = "packages/hub/stored/columns.json";
const JOURNAL = "packages/hub/drizzle/meta/_journal.json";
const SNAPSHOTS = "packages/hub/drizzle/meta";
const SCRIPT = "packages/hub/scripts/stored-compat.ts";

/**
 * A stored column narrowed on purpose: the migration that rewrites its rows
 * to the narrower shape, by its tag in drizzle's journal (its own SQL, or the
 * db/migrate.ts step `before` it), and what it does to them. An entry covers
 * its column against a base whose journal lacks the tag; it stays after its
 * change lands, inert against every later base.
 */
interface Rewrite {
  /** `table.column`, a key of the record. */
  column: string;
  /** A tag in packages/hub/drizzle/meta/_journal.json. */
  migration: string;
  why: string;
}

const REWRITES: readonly Rewrite[] = [];

type Schema = Record<string, unknown>;

/** The zod kinds whose rule is code: the record marks where one is. */
const codeMarks = (def: {
  checks?: { _zod: { def: { check: string } } }[];
  coerce?: boolean;
  in?: z.ZodType;
  out?: z.ZodType;
  transform?: unknown;
  type: string;
}): string[] => [
  ...(def.checks?.some((check) => check._zod.def.check === "custom")
    ? ["refine"]
    : []),
  ...(def.coerce === true ? ["coerce"] : []),
  ...((def.type === "pipe" &&
    [def.in, def.out].some((side) => side?._zod.def.type === "transform")) ||
  typeof def.transform === "function"
    ? ["transform"]
    : []),
];
const marksOf = (schema: Schema): string[] =>
  typeof schema["x-code"] === "string" ? schema["x-code"].split(",") : [];

/** Every stored JSON column's shape as JSON Schema, by `table.column`, keys sorted. */
const columnShapes = async (): Promise<Record<string, Schema>> => {
  const shapes: Record<string, Schema> = {};
  for (const { table, column, shape } of await storedColumns()) {
    const { $schema: _, ...json }: Schema = z.toJSONSchema(shape.schema, {
      // What a read accepts: a row is anything the base's read took.
      io: "input",
      // JSON holds no undefined: a schema of it admits no stored value. Any
      // other kind JSON Schema cannot say (a custom type, a date) is marked
      // by its zod kind, a rule that is code.
      unrepresentable: ({ zodSchema }) =>
        zodSchema._zod.def.type === "undefined"
          ? { not: {} }
          : { "x-code": zodSchema._zod.def.type },
      override: ({ zodSchema, jsonSchema }) => {
        const marks = [
          ...marksOf(jsonSchema),
          ...codeMarks(zodSchema._zod.def as Parameters<typeof codeMarks>[0]),
        ];
        if (marks.length > 0) {
          jsonSchema["x-code"] = [...new Set(marks)].join(",");
        }
      },
    });
    shapes[`${table}.${column}`] = json;
  }
  return Object.fromEntries(
    Object.entries(shapes).sort(([a], [b]) => a.localeCompare(b))
  );
};

const same = (a: unknown, b: unknown): boolean => Bun.deepEquals(a, b, true);
const NEVER: Schema = { not: {} };
const TEXT_KEYS: Schema = { type: "string" };
/** A schema as an object: `true` admits everything, `false` nothing. */
const schemaOf = (value: unknown): Schema => {
  if (value === false) {
    return NEVER;
  }
  return isObject(value) ? value : {};
};
const isNever = (value: unknown): boolean =>
  value === false ||
  (isObject(value) &&
    isObject(value.not) &&
    Object.keys(value.not).length === 0);

/** Said of a value, never of what it admits. */
const ANNOTATIONS = new Set([
  "default",
  "description",
  "title",
  "readOnly",
  "examples",
  "deprecated",
]);
/** Each may only fall. */
const LOWER = [
  "minLength",
  "minItems",
  "minimum",
  "exclusiveMinimum",
  "minProperties",
];
/** Each may only rise. */
const UPPER = [
  "maxLength",
  "maxItems",
  "maximum",
  "exclusiveMaximum",
  "maxProperties",
];
/** Each may only stay or go. */
const EXACT = ["pattern", "format", "multipleOf"];
const JUDGED = new Set([
  "type",
  "enum",
  "const",
  "not",
  "anyOf",
  "oneOf",
  "properties",
  "required",
  "additionalProperties",
  "propertyNames",
  "items",
  "x-code",
  ...LOWER,
  ...UPPER,
  ...EXACT,
]);

const branchesOf = (schema: Schema): Schema[] | undefined => {
  for (const key of ["anyOf", "oneOf"]) {
    const list = schema[key];
    if (Array.isArray(list)) {
      return list.map(schemaOf);
    }
  }
  return undefined;
};
const propertiesOf = (schema: Schema): Schema =>
  isObject(schema.properties) ? schema.properties : {};
/** A branch by what tells it apart: its first const property, or its values or kinds. */
const shown = (schema: Schema): string => {
  const tag = Object.entries(propertiesOf(schema)).find(
    ([, value]) => isObject(value) && value.const !== undefined
  );
  if (tag) {
    return `{ ${tag[0]}: ${JSON.stringify((tag[1] as Schema).const)} }`;
  }
  const values = valuesOf(schema);
  return values ? quoted(values) : [...kindsOf(schema)].join(" or ");
};
/** Whether a oneOf's branches are told apart by one required property's const: then one branch reads a value, as anyOf. */
const tagged = (branches: Schema[]): boolean =>
  Object.keys(propertiesOf(branches[0] ?? {})).some((key) => {
    const tags = branches.map((branch) => {
      const property = propertiesOf(branch)[key];
      return isObject(property) &&
        Array.isArray(branch.required) &&
        branch.required.includes(key)
        ? JSON.stringify(property.const)
        : undefined;
    });
    return (
      tags.every((tag) => tag !== undefined) &&
      new Set(tags).size === tags.length
    );
  });

/** A shape that lists several values or several kinds, as the shapes each one alone makes. */
const membersOf = (was: Schema): Schema[] | undefined => {
  const values = valuesOf(was);
  if (values && values.length > 1) {
    const { enum: _all, ...rest } = was;
    return values.map((value) => ({ ...rest, const: value }));
  }
  if (Array.isArray(was.type) && was.type.length > 1) {
    return was.type.map((kind) => ({ ...was, type: kind }));
  }
  return undefined;
};

/**
 * A value `was` took against a union `now`: a row holds one value of one
 * kind, so each of `was`'s values and kinds needs one branch that takes it,
 * and anything else one branch that takes all of it.
 */
const unionNarrowings = (
  was: Schema,
  now: Schema,
  branches: Schema[],
  at: string
): string[] => {
  const said = `${at || "(the value)"}: `;
  if (Array.isArray(now.oneOf) && !tagged(branches)) {
    return [
      `${said}is now exactly one of several shapes no key tells apart, which this check does not judge`,
    ];
  }
  const members = membersOf(was);
  if (members) {
    return members.flatMap((member) => narrowings(member, now, at));
  }
  const tries = branches.map((branch) => narrowings(was, branch, at));
  if (tries.some((reasons) => reasons.length === 0)) {
    return [];
  }
  // The branch with `was`'s tag is the one its rows were meant for: say why it fails them.
  const meant = tries.find((_, i) => shown(branches[i] ?? {}) === shown(was));
  const closest = tries.toSorted((a, b) => a.length - b.length)[0] ?? [];
  return [
    `${said}no longer takes ${shown(was)}`,
    ...(meant ?? (branches.length > 1 && closest.length > 3 ? [] : closest)),
  ];
};

const requiredOf = (schema: Schema): string[] =>
  Array.isArray(schema.required) ? schema.required.map(String) : [];
const strict = (at: string): string =>
  `${at || "(the value)"}: other keys are no longer read (a strict object)`;

/** An object's named keys: each one a row could hold is still read as wide. */
const keyNarrowings = (was: Schema, now: Schema, at: string): string[] => {
  const wasProperties = propertiesOf(was);
  const nowProperties = propertiesOf(now);
  const nowRest = now.additionalProperties;
  const wasRequired = new Set(requiredOf(was));
  return [
    ...requiredOf(now)
      .filter((key) => !wasRequired.has(key))
      .map((key) => `${at}.${key}: is now required`),
    ...Object.entries(wasProperties).flatMap(([key, schema]) => {
      if (key in nowProperties) {
        return narrowings(schema, nowProperties[key], `${at}.${key}`);
      }
      if (isNever(nowRest)) {
        return [`${at}.${key}: the key is no longer read (a strict object)`];
      }
      return nowRest === undefined
        ? []
        : narrowings(schema, nowRest, `${at}.${key}`);
    }),
  ];
};

/** An object's other keys and a record's keys and values: any a row held is still read as wide. */
const restNarrowings = (was: Schema, now: Schema, at: string): string[] => {
  const wasProperties = propertiesOf(was);
  const wasRest = was.additionalProperties;
  const nowRest = now.additionalProperties;
  const out: string[] = [];
  if (isNever(nowRest) && !isNever(wasRest)) {
    out.push(strict(at));
  }
  if (wasRest !== undefined && !isNever(wasRest)) {
    // Any other key a row holds had this shape: each key now named, and the rest, must read it.
    for (const [key, schema] of Object.entries(propertiesOf(now))) {
      if (!(key in wasProperties)) {
        out.push(...narrowings(wasRest, schema, `${at}.${key}`));
      }
    }
    if (nowRest !== undefined && !isNever(nowRest)) {
      out.push(...narrowings(wasRest, nowRest, `${at}{}`));
    }
  }
  if (now.propertyNames !== undefined) {
    out.push(
      ...narrowings(
        was.propertyNames ?? TEXT_KEYS,
        now.propertyNames,
        `${at}{key}`
      )
    );
  }
  return out;
};

/** An enum or const: every value `was` took is still taken. */
const valueNarrowings = (was: Schema, now: Schema, said: string): string[] => {
  const nowValues = valuesOf(now);
  if (!nowValues) {
    return [];
  }
  const wasValues = valuesOf(was);
  if (!wasValues) {
    return [`${said}now takes only ${quoted(nowValues)}`];
  }
  const removed = wasValues.filter(
    (value) => !nowValues.some((kept) => same(kept, value))
  );
  return removed.length > 0 ? [`${said}no longer takes ${quoted(removed)}`] : [];
};

/** What `now` asks of a value beyond what `was` did, on its bounds, patterns and code. */
const keywordNarrowings = (was: Schema, now: Schema, said: string): string[] => {
  const bound = (key: string, holds: (old: number, next: number) => boolean) => {
    const [old, next] = [was[key], now[key]];
    return typeof next === "number" && !(typeof old === "number" && holds(old, next));
  };
  const added = marksOf(now).filter((mark) => !marksOf(was).includes(mark));
  return [
    ...LOWER.filter((key) => bound(key, (old, next) => old >= next)).map(
      (key) => `${said}\`${key}\` rose to ${now[key]}`
    ),
    ...UPPER.filter((key) => bound(key, (old, next) => old <= next)).map(
      (key) => `${said}\`${key}\` fell to ${now[key]}`
    ),
    ...EXACT.filter(
      (key) => now[key] !== undefined && !same(was[key], now[key])
    ).map(
      (key) => `${said}must now match \`${key}\` ${JSON.stringify(now[key])}`
    ),
    ...(added.length > 0
      ? [
          `${said}now passes a ${added.join(" and a ")} too, whose rule is code this check cannot read`,
        ]
      : []),
  ];
};

/**
 * Each way a value `was` accepted may fail `now`; none when `now` accepts
 * all of it. Whatever differs and no rule proves wider is said: nothing
 * passes by not being looked at. `at` is the path inside the column's
 * value: `.key`, `[]` an array's element, `{}` a record's value, `{key}` a
 * record's key.
 */
const narrowings = (wasValue: unknown, nowValue: unknown, at = ""): string[] => {
  const was = schemaOf(wasValue);
  const now = schemaOf(nowValue);
  if (same(was, now) || isNever(was)) {
    return [];
  }
  const said = `${at || "(the value)"}: `;
  // Every branch a row could be is still read.
  const wasBranches = branchesOf(was);
  if (wasBranches) {
    return wasBranches.flatMap((branch) => narrowings(branch, now, at));
  }
  const nowBranches = branchesOf(now);
  if (nowBranches) {
    return unionNarrowings(was, now, nowBranches, at);
  }
  const out: string[] = [];
  for (const key of new Set([...Object.keys(was), ...Object.keys(now)])) {
    if (!(JUDGED.has(key) || ANNOTATIONS.has(key) || same(was[key], now[key]))) {
      out.push(`${said}its \`${key}\` changed, which this check does not judge`);
    }
  }
  if (isNever(now)) {
    return [...out, `${said}now takes no value`];
  }
  if (now.not !== undefined && !same(was.not, now.not)) {
    out.push(`${said}its \`not\` changed, which this check does not judge`);
  }
  const lost = extraKinds(kindsOf(was), kindsOf(now));
  if (lost.length > 0) {
    out.push(
      lost.includes("any")
        ? `${said}was any value, now only ${[...kindsOf(now)].join(" or ")}`
        : `${said}no longer takes ${lost.join(" or ")}`
    );
    return out;
  }
  out.push(
    ...valueNarrowings(was, now, said),
    ...keywordNarrowings(was, now, said),
    ...keyNarrowings(was, now, at),
    ...restNarrowings(was, now, at)
  );
  if (now.items !== undefined) {
    out.push(...narrowings(was.items ?? {}, now.items, `${at}[]`));
  }
  return out;
};

const journalTags = (text: string): string[] =>
  z
    .object({ entries: z.array(z.object({ tag: z.string() })) })
    .parse(JSON.parse(text))
    .entries.map((entry) => entry.tag);

const RenamesSchema = z.object({
  _meta: z
    .object({
      tables: z.record(z.string(), z.string()).optional(),
      columns: z.record(z.string(), z.string()).optional(),
    })
    .optional(),
});
/** `"a"."b"` as `a.b`: drizzle-kit's rename keys. */
const unquote = (name: string): string => name.replaceAll('"', "");

/**
 * A base's key under the name it has now: every table and column rename the
 * migrations in `tags` made, in order, as each one's snapshot records it
 * (drizzle-kit's `_meta`). A tag with no snapshot renamed nothing.
 */
const renamed = (key: string, tags: readonly string[]): string => {
  let [table = "", column = ""] = key.split(".");
  for (const tag of tags) {
    let text: string;
    try {
      text = readFileSync(
        join(ROOT, SNAPSHOTS, `${tag.slice(0, 4)}_snapshot.json`),
        "utf8"
      );
    } catch {
      continue;
    }
    const meta = RenamesSchema.parse(JSON.parse(text))._meta;
    for (const [from, to] of Object.entries(meta?.tables ?? {})) {
      if (unquote(from) === table) {
        table = unquote(to);
      }
    }
    for (const [from, to] of Object.entries(meta?.columns ?? {})) {
      if (unquote(from) === `${table}.${column}`) {
        const [toTable, toColumn] = unquote(to).split(".");
        table = toTable ?? table;
        column = toColumn ?? column;
      }
    }
  }
  return `${table}.${column}`;
};

const exists = (commit: string, path: string): boolean =>
  Bun.spawnSync(["git", "cat-file", "-e", `${commit}:${path}`], {
    cwd: ROOT,
    env: process.env,
  })
    .exitCode === 0;

const shapes = await columnShapes();
const record = `${JSON.stringify(shapes, null, 2)}\n`;
const recordPath = join(ROOT, RECORD);

if (!process.argv.includes("--check")) {
  writeFileSync(recordPath, record);
  console.log(`stored-compat: wrote ${RECORD}`);
  process.exit(0);
}

const problems: string[] = [];
let current = "";
try {
  current = readFileSync(recordPath, "utf8");
} catch {
  // Not written yet.
}
if (current !== record) {
  problems.push(
    `stored-compat: ${RECORD} is not what the stored columns make; run \`bun run stored-shapes\` in packages/hub`
  );
}

const tagsNow = journalTags(readFileSync(join(ROOT, JOURNAL), "utf8"));
for (const entry of REWRITES) {
  if (!(entry.column in shapes)) {
    problems.push(
      `stored-compat: REWRITES names ${entry.column}, which is no stored JSON column (${SCRIPT})`
    );
  }
  if (!tagsNow.includes(entry.migration)) {
    problems.push(
      `stored-compat: REWRITES names the migration ${entry.migration} for ${entry.column}, which ${JOURNAL} does not hold (${SCRIPT})`
    );
  }
}

// One compare per commit: the nightly can be the base itself.
const byCommit = new Map<string, string>();
for (const base of [
  { label: "the base", commit: baseRefOf(process.argv) },
  newestNightly(HUB),
]) {
  const commit = git("rev-parse", `${base.commit}^{commit}`).trim();
  if (!byCommit.has(commit)) {
    byCommit.set(
      commit,
      base.label === "the base" ? `the base ${commit.slice(0, 12)}` : base.label
    );
  }
}

const compared: string[] = [];
const unrecorded: string[] = [];
const rewritten: string[] = [];
const narrowed: string[] = [];
for (const [commit, label] of byCommit) {
  if (!exists(commit, RECORD)) {
    unrecorded.push(
      `${label} keeps no record of its stored columns (the record begins after it): nothing compared`
    );
    continue;
  }
  compared.push(label);
  const was = z
    .record(z.string(), z.unknown())
    .parse(JSON.parse(git("show", `${commit}:${RECORD}`)));
  const tagsThen = new Set(journalTags(git("show", `${commit}:${JOURNAL}`)));
  const added = tagsNow.filter((tag) => !tagsThen.has(tag));
  const failed: string[] = [];
  for (const [key, shape] of Object.entries(was)) {
    const column = renamed(key, added);
    if (!(column in shapes)) {
      // Dropped, or no longer stored JSON: no read parses it.
      continue;
    }
    const reasons = narrowings(shape, shapes[column]);
    if (reasons.length === 0) {
      continue;
    }
    const rewrite = REWRITES.find(
      (entry) => entry.column === column && added.includes(entry.migration)
    );
    if (rewrite) {
      rewritten.push(`${column} (${rewrite.migration})`);
      continue;
    }
    narrowed.push(column);
    failed.push(
      column === key ? column : `${column} (was ${key})`,
      ...reasons.map((reason) => `  ${reason}`)
    );
  }
  if (failed.length > 0) {
    problems.push(
      `stored-compat: rows a hub wrote before this change would no longer read. Against ${label}:`,
      ...failed.map((line) => `  ${line}`)
    );
  }
}

if (narrowed.length > 0) {
  problems.push(
    `The hub stops at boot on the first such row (StoredShapeError, packages/hub/src/stored-json.ts). Keep each shape as wide as it was, or add a migration that rewrites the rows (\`bun run db:generate --custom --name <name>\` in packages/hub makes an empty one for an UPDATE) and list it in REWRITES (${SCRIPT}): { column: "${narrowed[0]}", migration: "<its journal tag>", why: "<what it does to the rows>" }.`
  );
}

if (problems.length > 0) {
  console.error(problems.join("\n"));
  process.exit(1);
}

const code = Object.entries(shapes)
  .filter(([, shape]) => JSON.stringify(shape).includes('"x-code"'))
  .map(([column]) => column);
console.log(
  [
    `stored-compat: ${Object.keys(shapes).length} stored JSON columns${compared.length > 0 ? ` read every row ${compared.join(" and ")} could hold` : ""}`,
    ...unrecorded,
    ...(rewritten.length > 0
      ? [`${rewritten.length} narrowed and rewritten: ${rewritten.join(", ")}`]
      : []),
    ...(code.length > 0
      ? [
          `${code.length} pass a rule that is code, unread (migrations:check reads their rows): ${code.join(", ")}`,
        ]
      : []),
  ].join("; ")
);
