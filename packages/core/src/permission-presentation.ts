/**
 * What a permission prompt says, in plain words, on every surface: the
 * dashboard's composer card, the iOS parked prompt, the push and the
 * attention rails. The hub reads each ask once, as it parks it, and stamps
 * the result on the `permission_request` frame ({@link PermissionPresentation});
 * every surface renders that and reads nothing of the tool's input itself, so
 * no two of them can word the same ask two ways.
 *
 * The hub supplies what only it knows ({@link PresentationContext}): who asked,
 * the fleet's current memory text (so a memory write carries the change it
 * makes, not only the text it ends with), and which named settings already
 * exist (so a put says whether it adds or replaces).
 */

import type { ProjectAtLimit } from "./accounts";
import { BROWSER_ASK_TOOL, CONNECT_ASK_TOOL } from "./ask-tools";
import type { SourceFacts } from "./asks";
import type { StartingSet } from "./delegate-types";
import {
  SHELL_TOOLS,
  WEB_FETCH_TOOLS,
  WEB_SEARCH_TOOLS,
} from "./delegate-types";
import type { MemoryScope } from "./fleet";
import { cardOfMcpWrite } from "./fleet-secrets";
import type { LandsMode } from "./injected";
import { commonEnds, editScript, linesOf } from "./line-diff";
import { questionsOf } from "./question";
import { looksSecret, SECRET_KEY } from "./secret-shapes";
import { DAY_MS } from "./time";
import { areaWords } from "./words/areas";
import { askStanceLine } from "./words/ask-lines";
import { scopeWords } from "./words/memory-scope";
import { projectAccountWords } from "./words/project-account";
import {
  projectSettingsWords,
  type SettingsBudget,
} from "./words/project-settings";
import { routinesWords } from "./words/routines";

/** One file or document the call changes: both sides, for the diff renderers. */
export interface PermissionChange {
  /** Lines the proposed side adds. */
  added: number;
  /** The text the proposed side ends with. */
  after: string;
  /** The text as it stands now ("" when there is none yet, or the call does not say). */
  before: string;
  /** What changes, named as the person knows it: `CLAUDE.md`, a memory path, a file path. */
  path: string;
  /** Lines the proposed side removes. */
  removed: number;
}

/** One input field, as shown: its value written out, secrets already hidden. */
export interface PermissionField {
  key: string;
  value: string;
}

export interface PermissionPresentation {
  /** The session that asked, by the name the board gives it ("Caw" for a project's conversation). */
  asker: string;
  /** The changes the call makes, each drawn as a diff. Empty when it changes no text. */
  changes: PermissionChange[];
  /**
   * The shell command a shell call runs, whole and out of a boundary's
   * rewrite: shown under the summary on every surface, one line until
   * opened. Absent for any other call.
   */
  command?: string;
  /** The line under the summary: how much changes and where ("3 lines changed in Working style"). */
  detail?: string;
  /** The rest of the input worth reading, secrets hidden. What the summary and the diffs already say is left out. */
  fields: PermissionField[];
  /** The project the asker works in, by name; absent for a session in none. The card's head reads "Caw · cockpit". */
  project?: string;
  /**
   * What a change to a starting set does to it, each side a table the hub
   * fills from the count of calls (hub unused-trim.ts `standing`): what
   * joins it (a set that is new or gains items), then what leaves it (a
   * trim). Absent when the call changes no starting set, or moves nothing
   * in or out of one.
   */
  setTables?: SetChangeTable[];
  /**
   * What will happen and why, in one line: "Change the fleet's CLAUDE.md";
   * for a shell call, the session's own reason for it ("Check whether the
   * two commits are on origin/main"), its command under it in `command`.
   */
  summary: string;
}

/** One skill or server a change moves into or out of a starting set, with the calls behind it. */
export interface SetItemRow {
  kind: "skill" | "server";
  /** Its last call in the window, ms epoch; null when no session counted called it. */
  lastAt: number | null;
  /** A skill as a listing names it (`plugin:skill`), a server by its fleet name. */
  name: string;
  /** How many of the sessions counted called it in the window. */
  sessions: number;
}

/**
 * One side of a change to a starting set, row by row, the never-called
 * first, then the longest unused. What joins is drawn with every session's
 * calls on the fleet; what leaves, with the set's own sessions' calls.
 */
export interface SetChangeTable {
  change: "joins" | "leaves";
  /** The window the count covers, in days. */
  days: number;
  rows: SetItemRow[];
  /** The set, as the person knows it: "Cawco-Dev's starting set", "the build type's starting set". */
  set: string;
}

/** A skill or server some session called: its last call and how many sessions. */
export type CalledItem = SetItemRow & { lastAt: number };

/** Whose starting set a change writes: the asker's project's own, or a delegate type's. */
export type SetOwner = { kind: "project" } | { kind: "type"; name: string };

/** A starting set as the hub reads it now, and the calls a change to it is drawn with. */
export interface SetStanding {
  /** Its sessions' calls in the window, of the items they called. */
  calls: CalledItem[];
  days: number;
  /** `items`' calls by every session on the fleet in the window, of the items called. */
  fleetCalls: (items: StartingSet) => CalledItem[];
  /** The set, as the person knows it. */
  label: string;
  /** The set; null when there is none, and its sessions start with everything. */
  set: StartingSet | null;
}

type SetItem = Pick<SetItemRow, "kind" | "name">;

const itemsOf = (set: StartingSet): SetItem[] => [
  ...set.skills.map((name) => ({ kind: "skill" as const, name })),
  ...set.servers.map((name) => ({ kind: "server" as const, name })),
];

/** What `set` names that `other` does not; all of it when `other` is null. */
const beyond = (set: StartingSet, other: StartingSet | null): SetItem[] =>
  itemsOf(set).filter(
    (item) =>
      !(
        other &&
        (item.kind === "skill" ? other.skills : other.servers).includes(
          item.name
        )
      )
  );

/** `items` as one side's rows, each with its calls, the never-called first. */
const rowsWith = (items: SetItem[], calls: CalledItem[]): SetItemRow[] =>
  items
    .map((item) => {
      const called = calls.find(
        (call) => call.kind === item.kind && call.name === item.name
      );
      return {
        ...item,
        lastAt: called?.lastAt ?? null,
        sessions: called?.sessions ?? 0,
      };
    })
    .sort(
      (a, b) =>
        (a.lastAt ?? 0) - (b.lastAt ?? 0) ||
        a.kind.localeCompare(b.kind) ||
        a.name.localeCompare(b.name)
    );

/**
 * What going from `standing`'s set to `after` moves, as its tables: what
 * joins (all of `after` when there was no set) with the fleet's calls, then
 * what leaves with the set's own sessions' calls. Empty when the hub read no
 * standing, or `after` is null (everything installed: no set to draw).
 */
export const setTablesOf = (
  standing: SetStanding | undefined,
  after: StartingSet | null | undefined
): SetChangeTable[] => {
  if (!(standing && after)) {
    return [];
  }
  const before = standing.set;
  const joining = beyond(after, before);
  const leaving = before ? beyond(before, after) : [];
  const table = (
    change: SetChangeTable["change"],
    items: SetItem[],
    calls: () => CalledItem[]
  ): SetChangeTable[] =>
    items.length === 0
      ? []
      : [
          {
            change,
            set: standing.label,
            days: standing.days,
            rows: rowsWith(items, calls()),
          },
        ];
  return [
    ...table("joins", joining, () => standing.fleetCalls(after)),
    ...table("leaves", leaving, () => standing.calls),
  ];
};

/** "3 skills and 1 server", as a set change's lines count them. */
const kindsOf = (rows: SetItemRow[]): string => {
  const skills = rows.filter((row) => row.kind === "skill").length;
  return routinesWords.setKinds(skills, rows.length - skills);
};

/**
 * A set change's own lines: how many items join or leave which set, and of
 * what kinds; `fresh` when there was no set before.
 */
const setChangeWords = (
  tables: SetChangeTable[],
  fresh: boolean
): Pick<PermissionPresentation, "detail" | "setTables" | "summary"> => {
  const joins = tables.find((one) => one.change === "joins");
  const leaves = tables.find((one) => one.change === "leaves");
  const set = (joins ?? leaves)?.set ?? "";
  if (joins && leaves) {
    return {
      summary: routinesWords.changeSetSummary(
        joins.rows.length,
        leaves.rows.length,
        set
      ),
      detail: routinesWords.changeSetDetail(
        kindsOf(joins.rows),
        kindsOf(leaves.rows)
      ),
      setTables: tables,
    };
  }
  if (joins) {
    return {
      summary: routinesWords.listSummary(joins.rows.length, set),
      detail: fresh
        ? routinesWords.newSetDetail(kindsOf(joins.rows))
        : routinesWords.listDetail(
            kindsOf(joins.rows),
            joins.rows.length === 1
          ),
      setTables: tables,
    };
  }
  const rows = leaves?.rows ?? [];
  return {
    summary: routinesWords.unlistSummary(rows.length, set),
    detail: routinesWords.unlistDetail(kindsOf(rows), rows.length === 1),
    setTables: tables,
  };
};

/** The settings groups an admin write names things in. */
export type AdminGroup =
  | "connections"
  | "delegate_types"
  | "hooks"
  | "mcp_servers"
  | "plugins"
  | "previews"
  | "rules"
  | "skills"
  | "subagents";

export interface PresentationContext {
  /** The asking session's name. */
  asker: string;
  /**
   * A setting as the fleet keeps it now, by the key the write names it with
   * (a preview setting's key is ""): its fields as the write's own input
   * names them, secrets included (they are hidden as shown); undefined when
   * it does not exist. What a write's before → after is read against.
   */
  current: (
    group: AdminGroup,
    key: string
  ) => Record<string, unknown> | undefined;
  /** The fleet's current text: the CLAUDE.md for `null`, else the memory document at that path. Undefined when there is none. */
  memory: (path: string | null) => string | undefined;
  /** The asking session's project, by name; undefined when it is in none. */
  project?: string;
  /** A project's name by its id; undefined when the hub keeps no such project. */
  projectName: (id: string) => string | undefined;
  /** An install's or a link's source, read when it was proposed; undefined for any other call. */
  source?: SourceFacts;
  /**
   * A starting set as it stands and its sessions' calls (hub
   * unused-trim.ts): what a change to it is drawn against. Undefined where
   * the hub reads none.
   */
  startingSet?: (owner: SetOwner) => SetStanding | undefined;
}

// ── line changes ─────────────────────────────────────────────────────────

const HEADING = /^#{1,6}\s+(.+?)\s*#*\s*$/u;

/** Each line's markdown section: the nearest heading at or above it. */
const sectionsOf = (lines: string[]): (string | undefined)[] => {
  let current: string | undefined;
  return lines.map((line) => {
    const [, heading] = HEADING.exec(line) ?? [];
    if (heading) {
      current = heading;
    }
    return current;
  });
};

interface LineStat {
  added: number;
  removed: number;
  /** The sections the changed lines stand in, in order, each once. */
  sections: string[];
}

/** The line diff of two texts (line-diff.ts), counted, and the markdown sections it touches. */
function lineStat(before: string, after: string): LineStat {
  const a = linesOf(before);
  const b = linesOf(after);
  const { removedAt, addedAt } = editScript(a, b);
  const beforeSections = sectionsOf(a);
  const afterSections = sectionsOf(b);
  const touched = [
    ...removedAt.map((at) => beforeSections[at]),
    ...addedAt.map((at) => afterSections[at]),
  ].filter((section): section is string => section !== undefined);
  return {
    added: addedAt.length,
    removed: removedAt.length,
    sections: [...new Set(touched)],
  };
}

const plural = (count: number, word: string): string =>
  `${count} ${word}${count === 1 ? "" : "s"}`;

/** "3 lines changed in Working style": how much a text change moves, and where. */
function statWords(stat: LineStat): string {
  const { added, removed, sections } = stat;
  if (added === 0 && removed === 0) {
    return "No lines change";
  }
  let amount: string;
  if (removed === 0) {
    amount = `${plural(added, "line")} added`;
  } else if (added === 0) {
    amount = `${plural(removed, "line")} removed`;
  } else {
    amount = `${plural(Math.max(added, removed), "line")} changed`;
  }
  if (sections.length === 1) {
    return `${amount} in ${sections[0]}`;
  }
  return sections.length > 1
    ? `${amount} across ${plural(sections.length, "section")}`
    : amount;
}

const changeOf = (
  path: string,
  before: string,
  after: string
): { change: PermissionChange; stat: LineStat } => {
  const stat = lineStat(before, after);
  return {
    change: {
      path,
      before,
      after,
      added: stat.added,
      removed: stat.removed,
    },
    stat,
  };
};

/** Unchanged lines kept around a document's changed lines, so a hunk reads in place. */
const HUNK_CONTEXT = 3;

/**
 * A document's change as only its changed lines and a few around them: the
 * span from the first changed line to the last, on each side, counted over
 * the whole document. A memory write's card carries this, never the file.
 */
const hunkOf = (
  path: string,
  before: string,
  after: string
): { change: PermissionChange; detail: string } => {
  const { change, stat } = changeOf(path, before, after);
  const a = linesOf(before);
  const b = linesOf(after);
  const { head, tail } = commonEnds(a, b);
  const from = Math.max(0, head - HUNK_CONTEXT);
  const keep = Math.max(0, tail - HUNK_CONTEXT);
  const words = statWords(stat);
  return {
    change: {
      ...change,
      // Each line keeps its own line ending (line-diff.ts `linesOf`).
      before: a.slice(from, a.length - keep).join(""),
      after: b.slice(from, b.length - keep).join(""),
    },
    detail:
      stat.added + stat.removed === 0
        ? words
        : `${words} (+${stat.added} −${stat.removed}), shown from line ${from + 1} of ${b.length}`,
  };
};

// ── fields and secrets ───────────────────────────────────────────────────

/** Maps whose every value is private by nature: a server's environment, a request's headers. */
const KEYS_ONLY = new Set(["env", "headers", "environment"]);

const HIDDEN = "(hidden)";

/** A value with every credential in it replaced by {@link HIDDEN}, at any depth. */
export function redact(key: string, value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }
  if (typeof value === "string") {
    return SECRET_KEY.test(key) || looksSecret(value) ? HIDDEN : value;
  }
  if (typeof value !== "object") {
    // A number or a flag is a setting, never a credential.
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => redact(key, item));
  }
  const entries = Object.entries(value as Record<string, unknown>);
  if (KEYS_ONLY.has(key.toLowerCase())) {
    return Object.fromEntries(entries.map(([name]) => [name, HIDDEN]));
  }
  return Object.fromEntries(
    entries.map(([name, inner]) => [name, redact(name, inner)])
  );
}

const written = (value: unknown): string =>
  typeof value === "string" ? value : JSON.stringify(value, null, 2);

/** One field as shown: an environment or a header map by its keys alone, anything else with its secrets hidden. */
const shown = (key: string, value: unknown): string => {
  if (
    KEYS_ONLY.has(key.toLowerCase()) &&
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  ) {
    const keys = Object.keys(value);
    return keys.length > 0 ? `${keys.join(", ")} (values hidden)` : "(none)";
  }
  return written(redact(key, value));
};

/** The input's fields as shown, secrets hidden, `skip` and empty ones left out. */
function fieldsOf(
  input: Record<string, unknown>,
  skip: readonly string[] = []
): PermissionField[] {
  return Object.entries(input)
    .filter(
      ([key, value]) =>
        !skip.includes(key) &&
        value !== undefined &&
        value !== null &&
        value !== ""
    )
    .map(([key, value]) => ({ key, value: shown(key, value) }));
}

// ── the tools ────────────────────────────────────────────────────────────

const MCP_NAME = /^mcp__(.+?)__(.+)$/u;
const CAWCO_ADMIN_WRITE = /^(?:mcp__cawco__|cawco_)?admin_([a-z_]+)_write$/u;
const WORD_BREAK = /[_-]+/gu;
const CAMEL = /([a-z\d])([A-Z])/gu;
const SPACES = /\s+/gu;
const COMMAND_CAP = 120;

const text = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() ? value : undefined;

const cut = (value: string, max: number): string =>
  value.length > max ? `${value.slice(0, max - 1)}…` : value;

/** `list_sessions` → `List sessions`. */
const humanize = (name: string): string => {
  const words = name
    .replace(WORD_BREAK, " ")
    .replace(CAMEL, "$1 $2")
    .replace(SPACES, " ")
    .trim()
    .toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
};

/** A tool as a person reads it: an MCP tool by its server, then its name in words. */
function toolDisplayName(toolName: string): string {
  const mcp = MCP_NAME.exec(toolName);
  if (!mcp) {
    return toolName;
  }
  const server = mcp[1] === "cawco" ? "CawCo" : mcp[1];
  return `${server}: ${humanize(mcp[2])}`;
}

type Presented = Omit<PermissionPresentation, "asker">;

const only = (summary: string, fields: PermissionField[] = []): Presented => ({
  summary,
  changes: [],
  fields,
});

/**
 * `admin_memory_write`: the fleet's CLAUDE.md and its linked documents, with
 * the change each makes as its changed lines alone ({@link hunkOf}), never
 * the whole file.
 */
function memoryWrite(
  input: Record<string, unknown>,
  context: PresentationContext
): Presented {
  const path = text(input.path);
  const content = typeof input.content === "string" ? input.content : "";
  switch (input.action) {
    case "set": {
      const now = context.memory(null);
      const { change: made, detail } = hunkOf("CLAUDE.md", now ?? "", content);
      return {
        summary:
          now === undefined
            ? "Create the fleet's CLAUDE.md"
            : "Change the fleet's CLAUDE.md",
        detail,
        changes: [made],
        fields: [{ key: "loads in", value: "every session" }],
      };
    }
    case "set_doc": {
      const name = path ?? "(no path)";
      const now = path ? context.memory(path) : undefined;
      const { change: made, detail } = hunkOf(name, now ?? "", content);
      const scope = input.scope as MemoryScope | undefined;
      return {
        summary: now === undefined ? `Create ${name}` : `Change ${name}`,
        detail,
        changes: [made],
        // Named only when the write sets it; left out, the scope stays.
        fields:
          typeof scope === "object" && scope !== null
            ? [
                {
                  key: "loaded into",
                  value: scopeWords(
                    scope,
                    (id) => context.projectName(id) ?? `project ${id}`
                  ),
                },
              ]
            : [],
      };
    }
    case "remove_doc": {
      const name = path ?? "(no path)";
      const now = path ? context.memory(path) : undefined;
      if (now === undefined) {
        return only(`Remove ${name}`, [
          { key: "note", value: "The fleet keeps no document at this path." },
        ]);
      }
      const { change: made, detail } = hunkOf(name, now, "");
      return {
        summary: `Remove ${name}`,
        detail,
        changes: [made],
        fields: [],
      };
    }
    default:
      return only(
        `Change the fleet's memory (${String(input.action)})`,
        fieldsOf(input)
      );
  }
}

/** How a stdio server starts, or where a remote one answers. */
function mcpTarget(config: Record<string, unknown>): string | undefined {
  const url = text(config.url);
  if (url) {
    return url;
  }
  const command = text(config.command);
  if (!command) {
    return undefined;
  }
  const args = Array.isArray(config.args)
    ? config.args.filter((arg): arg is string => typeof arg === "string")
    : [];
  return cut([command, ...args].join(" "), COMMAND_CAP);
}

const COUNT = new Intl.NumberFormat("en");
const DAY = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

/** How long ago `iso` was, in its largest whole unit: "today", "3 days ago", "5 months ago", "2 years ago". */
const agoWords = (iso: string): string => {
  const days = Math.floor((Date.now() - Date.parse(iso)) / DAY_MS);
  if (days < 1) {
    return "today";
  }
  if (days < 60) {
    return `${plural(days, "day")} ago`;
  }
  const months = Math.floor(days / 30.44);
  return months < 24
    ? `${plural(months, "month")} ago`
    : `${plural(Math.floor(days / 365.25), "year")} ago`;
};

/**
 * An install's source as the card shows it: how old, how many use it, and
 * where, unless the summary already names it (`named`).
 */
function sourceFields(
  source: SourceFacts | undefined,
  named = false
): PermissionField[] {
  if (!source) {
    return [];
  }
  const npm = source.weeklyDownloads !== undefined;
  const fields: PermissionField[] = named
    ? []
    : [{ key: "from", value: source.at }];
  if (source.unknown) {
    fields.push({ key: "age", value: `Unknown: ${source.unknown}` });
  }
  if (source.since) {
    fields.push({
      key: "age",
      value: `${npm ? "First published" : "Created"} ${DAY.format(new Date(source.since))}, ${agoWords(source.since)}`,
    });
  }
  if (source.stars !== undefined) {
    fields.push({ key: "stars", value: COUNT.format(source.stars) });
  }
  if (source.weeklyDownloads !== undefined) {
    fields.push({
      key: "downloads",
      value: `${COUNT.format(source.weeklyDownloads)} last week`,
    });
  }
  if (source.skill) {
    fields.push(
      { key: "skill", value: source.skill.name },
      { key: "description", value: source.skill.description },
      {
        key: "files",
        value: `${plural(source.skill.files.length, "file")}: ${source.skill.files.map((file) => file.path).join(", ")}`,
      },
      { key: "content", value: source.skill.hash.slice(0, 12) }
    );
  }
  return fields;
}

// ── before → after ───────────────────────────────────────────────────────

/** Where a setting applies, in the person's words: one project's checkouts and workspaces, or every machine. */
const bindingWords = (projectId: unknown, context: PresentationContext) =>
  typeof projectId === "string" && projectId
    ? `${context.projectName(projectId) ?? projectId} project only`
    : "every machine";

/** Which sessions load a setting: one project's, or every session. */
const loadsIn = (projectId: unknown, context: PresentationContext) =>
  typeof projectId === "string" && projectId
    ? `sessions in ${context.projectName(projectId) ?? projectId}`
    : "every session";

/** "Loads in": where it loads after the write, and where it loaded before when that moves. */
const loadsInField = (
  before: unknown,
  after: unknown,
  context: PresentationContext
): PermissionField => {
  const now = loadsIn(after, context);
  const was = loadsIn(before, context);
  return {
    key: "loads in",
    value: now === was ? now : `${now} (was: ${was})`,
  };
};

/** A setting's field as a person reads it: a project binding as its scope, a flag as on or off, a list joined, secrets hidden. */
const settingWords = (
  key: string,
  value: unknown,
  context: PresentationContext
): string => {
  if (key === "projectId") {
    return bindingWords(value, context);
  }
  if (key === "enabled") {
    return value === false ? "off" : "on";
  }
  if (value === undefined || value === null || value === "") {
    return "(none)";
  }
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return "(none)";
    }
    return value
      .map((one) => {
        if (key === "projects" && typeof one === "string") {
          return context.projectName(one) ?? one;
        }
        return typeof one === "string" ? one : JSON.stringify(one);
      })
      .join(", ");
  }
  return shown(key, value);
};

/** The name a field reads under: a project binding is its scope. */
const fieldName = (key: string) => (key === "projectId" ? "scope" : key);

const same = (a: unknown, b: unknown) =>
  JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/**
 * What a write changes, against what the fleet keeps now: each field of
 * `after` that differs, as "before → after" with names resolved; with
 * nothing kept yet, each field it sets. A field `after` leaves undefined
 * keeps its value and is not shown; one it sets null is cleared.
 */
function changedFields(
  before: Record<string, unknown> | undefined,
  after: Record<string, unknown>,
  context: PresentationContext
): PermissionField[] {
  return Object.entries(after).flatMap(([key, value]) => {
    if (value === undefined) {
      return [];
    }
    if (!before) {
      return value === null || value === "" || same(value, [])
        ? []
        : [{ key: fieldName(key), value: settingWords(key, value, context) }];
    }
    const was = before[key];
    if (same(was, value)) {
      return [];
    }
    const from = settingWords(key, was, context);
    const to = settingWords(key, value, context);
    return [
      {
        key: fieldName(key),
        // Hidden values (an env's, a header's) moved under the same keys.
        value: from === to ? `${to}, its values change` : `${from} → ${to}`,
      },
    ];
  });
}

/** Every key either side names, each with the new side's value (null where it drops one): a whole replacement's `after`. */
const replacing = (
  before: Record<string, unknown> | undefined,
  after: Record<string, unknown>
): Record<string, unknown> =>
  Object.fromEntries(
    [...new Set([...Object.keys(before ?? {}), ...Object.keys(after)])].map(
      (key) => [key, after[key] ?? null]
    )
  );

/** The line under a change's summary: which settings move, or that none does. */
const changeDetail = (fields: PermissionField[]): string =>
  fields.length === 0
    ? "Nothing changes: the fleet already keeps it this way."
    : `Changes ${fields.map((field) => field.key).join(", ")}; nothing else.`;

/** The setting kept now, as a record, or undefined. */
const record = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;

/** The input's own fields, minus what names the call. */
const given = (input: Record<string, unknown>, skip: readonly string[]) =>
  Object.fromEntries(
    Object.entries(input).filter(
      ([key]) => !(skip.includes(key) || key === "action" || key === "reason")
    )
  );

/**
 * A skill's source as the card says it: a folder on a machine
 * (`file://<machine>/<path>`, hub skills.ts) as `<path> on <machine>`, any
 * other as written.
 */
const skillSourceWords = (source: string): string => {
  const url = source.startsWith("file://") ? URL.parse(source) : null;
  return url?.hostname
    ? `${decodeURIComponent(url.pathname)} on ${url.hostname}`
    : source;
};

function skillsWrite(
  input: Record<string, unknown>,
  context: PresentationContext
): Presented {
  const name = text(input.name) ?? "(unnamed)";
  const before = context.current("skills", name);
  const projectId =
    input.projectId === undefined ? before?.projectId : input.projectId;
  switch (input.action) {
    case "install": {
      const asked = text(input.source);
      const source = asked ? skillSourceWords(asked) : "(no source)";
      // The summary names the source.
      const facts = sourceFields(context.source, true);
      if (!before) {
        return only(`Install skill ${name} from ${source}`, [
          { key: "scope", value: bindingWords(projectId, context) },
          loadsInField(projectId, projectId, context),
          ...facts,
        ]);
      }
      const changed = changedFields(
        before,
        { source: input.source, enabled: true, projectId: projectId ?? null },
        context
      );
      return {
        summary: `Reinstall skill ${name} from ${source}`,
        detail: changeDetail(changed),
        changes: [],
        fields: [
          ...changed,
          loadsInField(before.projectId, projectId, context),
          ...facts,
        ],
      };
    }
    case "enable":
    case "disable": {
      const changed = changedFields(
        before,
        { enabled: input.action === "enable" },
        context
      );
      return {
        summary: `${input.action === "enable" ? "Enable" : "Disable"} skill ${name}`,
        detail: before
          ? changeDetail(changed)
          : "The fleet keeps no skill of this name.",
        changes: [],
        fields: [...changed, loadsInField(projectId, projectId, context)],
      };
    }
    case "remove":
      return only(`Remove skill ${name}`, [
        {
          key: "loads in",
          value: `no session (was: ${loadsIn(before?.projectId, context)})`,
        },
      ]);
    default:
      return only(`Change skill ${name}`, fieldsOf(input));
  }
}

function mcpServersWrite(
  input: Record<string, unknown>,
  context: PresentationContext
): Presented {
  const name = text(input.name) ?? "(unnamed)";
  const before = context.current("mcp_servers", name);
  if (input.action === "remove") {
    return only(`Remove MCP server ${name}`, [
      {
        key: "loads in",
        value: `no session (was: ${loadsIn(before?.projectId, context)})`,
      },
    ]);
  }
  // The write as the server would stand after it, its secrets said as the
  // hub reads them (fleet-secrets.ts): none of a held or a typed one shown.
  const config = cardOfMcpWrite(
    record(input.config) ?? {},
    record(before?.config)
  );
  // As the hub stores a put: `enabled` left out is on, `projectId` left out
  // keeps the binding it has.
  const enabled = input.enabled ?? true;
  const projectId =
    input.projectId === undefined
      ? (before?.projectId ?? null)
      : input.projectId;
  if (!before) {
    const target = mcpTarget(config);
    // The summary carries where it answers; the command line is repeated
    // whole only when the summary had to cut it.
    const whole = target !== undefined && !target.endsWith("…");
    return only(`Add MCP server ${name}${target ? ` (${target})` : ""}`, [
      ...fieldsOf(config, whole ? ["url", "command", "args"] : ["url"]),
      { key: "scope", value: bindingWords(projectId, context) },
      ...(enabled === false ? [{ key: "enabled", value: "off" }] : []),
      loadsInField(projectId, projectId, context),
    ]);
  }
  const keptConfig = record(before.config);
  const changed = [
    ...changedFields(keptConfig, replacing(keptConfig, config), context),
    ...changedFields(
      { enabled: before.enabled, projectId: before.projectId ?? null },
      { enabled, projectId },
      context
    ),
  ];
  return {
    summary: `Change MCP server ${name}`,
    detail: changeDetail(changed),
    changes: [],
    fields: [...changed, loadsInField(before.projectId, projectId, context)],
  };
}

function hooksWrite(
  input: Record<string, unknown>,
  context: PresentationContext
): Presented {
  const id = text(input.id);
  const before = id ? context.current("hooks", id) : undefined;
  const name = text(input.name) ?? text(before?.name) ?? id ?? "(unnamed)";
  const event = text(input.event);
  switch (input.action) {
    case "create":
      return only(
        `Add hook ${name}${event ? ` on ${event}` : ""}`,
        fieldsOf(input, ["action", "id", "name", "event"])
      );
    case "update": {
      // The hub lays the given fields over the stored hook.
      const changed = changedFields(before, given(input, ["id"]), context);
      return {
        summary: `Change hook ${name}`,
        detail: before
          ? changeDetail(changed)
          : "The fleet keeps no hook of this id.",
        changes: [],
        fields: changed,
      };
    }
    case "remove":
      return only(`Remove hook ${name}`);
    default:
      return only(`Change hook ${name}`, fieldsOf(input));
  }
}

/**
 * `admin_subagents_write`: a subagent's file, its change as the changed lines
 * alone ({@link hunkOf}), as a memory document's is.
 */
function subagentsWrite(
  input: Record<string, unknown>,
  context: PresentationContext
): Presented {
  const name = text(input.name) ?? "(unnamed)";
  const now = text(input.name)
    ? text(context.current("subagents", name)?.content)
    : undefined;
  const file = `${name}.md`;
  if (input.action === "remove") {
    if (now === undefined) {
      return only(`Remove subagent ${name}`, [
        { key: "note", value: "The fleet keeps no subagent of this name." },
      ]);
    }
    const { change: made, detail } = hunkOf(file, now, "");
    return {
      summary: `Remove subagent ${name}`,
      detail,
      changes: [made],
      fields: [
        {
          key: "machines",
          value: "keep their copy until their next sync",
        },
      ],
    };
  }
  const content = typeof input.content === "string" ? input.content : "";
  const { change: made, detail } = hunkOf(file, now ?? "", content);
  return {
    summary:
      now === undefined ? `Add subagent ${name}` : `Change subagent ${name}`,
    detail,
    changes: [made],
    fields: [{ key: "loads in", value: "every machine's Claude Code" }],
  };
}

function rulesWrite(
  input: Record<string, unknown>,
  context: PresentationContext
): Presented {
  const id = text(input.id);
  const before = id ? context.current("rules", id) : undefined;
  const name = text(input.name) ?? text(before?.name) ?? id ?? "(unnamed)";
  const pattern = text(input.pattern);
  switch (input.action) {
    case "create":
      return only(
        `Add rule ${name}${pattern ? ` (watches “${cut(pattern, 60)}”)` : ""}`,
        fieldsOf(input, ["action", "name"])
      );
    case "update": {
      // The tool lays the given fields over the stored rule.
      const changed = changedFields(before, given(input, ["id"]), context);
      return {
        summary: `Change rule ${name}`,
        detail: before
          ? changeDetail(changed)
          : "The fleet keeps no rule of this id.",
        changes: [],
        fields: changed,
      };
    }
    case "remove":
      return only(`Remove rule ${name}`);
    default:
      return only(`Change rule ${name}`, fieldsOf(input));
  }
}

function pluginsWrite(
  input: Record<string, unknown>,
  context: PresentationContext
): Presented {
  const id = text(input.id) ?? "(no id)";
  const name = text(input.name) ?? "(unnamed)";
  const before = text(input.id) ? context.current("plugins", id) : undefined;
  switch (input.action) {
    case "link":
      return only(`Link marketplace ${text(input.source) ?? "(no source)"}`, [
        {
          key: "loads in",
          value: "nothing yet: a plugin from it loads once installed",
        },
        ...sourceFields(context.source),
      ]);
    case "unlink":
      return only(`Unlink marketplace ${name}`);
    case "install":
      return only(before ? `Reinstall plugin ${id}` : `Install plugin ${id}`, [
        ...(before?.enabled === false
          ? [{ key: "enabled", value: "off → on" }]
          : []),
        { key: "loads in", value: loadsIn(before?.projectId, context) },
        ...sourceFields(context.source),
      ]);
    case "enable":
    case "disable": {
      const changed = changedFields(
        before,
        { enabled: input.action === "enable" },
        context
      );
      return {
        summary: `${input.action === "enable" ? "Enable" : "Disable"} plugin ${id}`,
        detail: before
          ? changeDetail(changed)
          : "The fleet keeps no plugin of this id.",
        changes: [],
        fields: [
          ...changed,
          { key: "loads in", value: loadsIn(before?.projectId, context) },
        ],
      };
    }
    case "refresh":
      return only(`Refresh plugin ${id} from its marketplace`);
    case "remove":
      return only(`Remove plugin ${id}`);
    default:
      return only(`Change plugin ${id}`, fieldsOf(input));
  }
}

function delegateTypesWrite(
  input: Record<string, unknown>,
  context: PresentationContext
): Presented {
  const name = text(input.name) ?? "(unnamed)";
  if (input.action === "delete") {
    return only(`Remove delegate type ${name}`);
  }
  const before = context.current("delegate_types", name);
  // What joins its starting set and what leaves it, each a table of calls.
  const proposed = (input.startingSet as StartingSet | undefined) ?? null;
  const tables = setTablesOf(
    context.startingSet?.({ kind: "type", name }),
    proposed
  );
  /** Its fields as shown: a set its tables draw is not written out again. */
  const besides = (fields: PermissionField[]) =>
    tables.length > 0
      ? fields.filter((field) => field.key !== "startingSet")
      : fields;
  if (!before) {
    const route = [text(input.harness), text(input.model), text(input.effort)]
      .filter(Boolean)
      .join(" · ");
    const added = only(
      `Add delegate type ${name}${route ? ` (${route})` : ""}`,
      besides(fieldsOf(input, ["action", "name", "harness", "model", "effort"]))
    );
    return tables.length > 0
      ? {
          ...added,
          detail: setChangeWords(tables, true).detail,
          setTables: tables,
        }
      : added;
  }
  // A put replaces the type: a field it leaves out is cleared.
  const after = Object.fromEntries(
    DELEGATE_TYPE_FIELDS.map((key) => [key, input[key] ?? null])
  );
  const kept = Object.fromEntries(
    DELEGATE_TYPE_FIELDS.map((key) => [key, before[key] ?? null])
  );
  const changed = changedFields(kept, after, context);
  if (tables.length > 0) {
    return {
      ...setChangeWords(tables, !before.startingSet),
      changes: [],
      fields: besides(changed),
    };
  }
  return {
    summary: `Change delegate type ${name}`,
    detail: changeDetail(changed),
    changes: [],
    fields: changed,
  };
}

/** What a delegate type's put sets (hub admin-tools.ts). */
const DELEGATE_TYPE_FIELDS = [
  "description",
  "harness",
  "model",
  "effort",
  "skills",
  "denyTools",
  "mayStart",
  "connections",
  "startingSet",
] as const;

/** `admin_connections_write`: a service the hub signs in to, never its key. */
function connectionsWrite(
  input: Record<string, unknown>,
  context: PresentationContext
): Presented {
  const name = text(input.name) ?? "(unnamed)";
  const before = context.current("connections", name);
  switch (input.action) {
    case "create":
      return only(
        `Add connection ${name}${text(input.service) ? ` (${text(input.service)}${text(input.account) ? ` as ${text(input.account)}` : ""})` : ""}`,
        changedFields(
          undefined,
          given(input, ["name", "service", "account"]),
          context
        )
      );
    case "update": {
      const changed = changedFields(
        before,
        given(input, ["name", "origin"]),
        context
      );
      return {
        summary: `Change connection ${name}`,
        detail: before
          ? changeDetail(changed)
          : "The hub keeps no connection of this name.",
        changes: [],
        fields: changed,
      };
    }
    case "sign_in":
      return only(`Sign connection ${name} in`);
    case "remove":
      return only(`Remove connection ${name}`, [
        {
          key: "used by",
          value: `no session (was: ${settingWords("projects", before?.projects, context)})`,
        },
      ]);
    default:
      return only(`Change connection ${name}`, fieldsOf(input));
  }
}

/** `admin_previews_write`: how every preview on the fleet is reached. */
function previewsWrite(
  input: Record<string, unknown>,
  context: PresentationContext
): Presented {
  const changed = changedFields(
    context.current("previews", ""),
    { mode: input.mode, pattern: input.pattern ?? null },
    context
  );
  return {
    summary: "Change how previews are reached",
    detail: changeDetail(changed),
    changes: [],
    fields: [...changed, { key: "affects", value: "every session's previews" }],
  };
}

/**
 * An admin write as its card reads it: the session's `reason` first, as
 * "why", then what changes and what it affects, as each group says them.
 */
function adminWrite(
  group: string,
  input: Record<string, unknown>,
  context: PresentationContext
): Presented | undefined {
  const presented = adminGroupWrite(group, input, context);
  if (!presented) {
    return;
  }
  const why = text(input.reason);
  return {
    ...presented,
    fields: [
      ...(why ? [{ key: "why", value: why }] : []),
      ...presented.fields.filter((field) => field.key !== "reason"),
    ],
  };
}

function adminGroupWrite(
  group: string,
  input: Record<string, unknown>,
  context: PresentationContext
): Presented | undefined {
  switch (group) {
    case "memory":
      return memoryWrite(input, context);
    case "skills":
      return skillsWrite(input, context);
    case "mcp_servers":
      return mcpServersWrite(input, context);
    case "hooks":
      return hooksWrite(input, context);
    case "rules":
      return rulesWrite(input, context);
    case "subagents":
      return subagentsWrite(input, context);
    case "plugins":
      return pluginsWrite(input, context);
    case "delegate_types":
      return delegateTypesWrite(input, context);
    case "connections":
      return connectionsWrite(input, context);
    case "previews":
      return previewsWrite(input, context);
    default:
      return undefined;
  }
}

/** The tool name a project memory proposal is parked under (hub memory.ts). */
export const MEMORY_PROPOSAL_TOOL = "mcp__cawco__memory_propose";

/**
 * The name Caw's delegate type is parked under as a proposal (hub memory.ts,
 * from his `folder_write` of a `delegates/` file): no tool's, so his own
 * `folder_write` call is never drawn as one.
 */
export const DELEGATE_TYPE_PROPOSAL_TOOL = "mcp__cawco__delegate_type_proposal";

/**
 * A proposal's `files`, each a path, the file as it stood (`before`) and its
 * proposed text under `proposed`: the well-formed ones, each drawn as a
 * change, and their lines added and removed together.
 */
function proposedFiles(
  input: Record<string, unknown>,
  proposed: "after" | "content"
): {
  changes: PermissionChange[];
  files: { before: string; path: string }[];
  stat: LineStat;
} {
  const files = Array.isArray(input.files)
    ? input.files.filter(
        (
          file
        ): file is { before: string; path: string } & Record<
          typeof proposed,
          string
        > =>
          typeof file === "object" &&
          file !== null &&
          typeof (file as { path?: unknown }).path === "string" &&
          typeof (file as { before?: unknown }).before === "string" &&
          typeof (file as Record<string, unknown>)[proposed] === "string"
      )
    : [];
  const made = files.map((file) =>
    changeOf(file.path, file.before, file[proposed])
  );
  const stat = made.reduce<LineStat>(
    (sum, each) => ({
      added: sum.added + each.stat.added,
      removed: sum.removed + each.stat.removed,
      sections: [],
    }),
    { added: 0, removed: 0, sections: [] }
  );
  return { files, changes: made.map((each) => each.change), stat };
}

/**
 * A memory proposal (Projects spec §5.4): a change to the project's AGENTS.md
 * or its knowledge files, as the curator, Jev's sort, the hub's archive or
 * withdrawal, or Caw proposed it, citing the inbox notes it comes from; and
 * Caw's delegate type (§5.1, "a file diff you approve"), drawn the same. The
 * hub puts each file as it stood (`before`) beside its proposed text
 * (`content`) as it parks it: a fact moving between files is one card.
 */
function memoryProposal(input: Record<string, unknown>): Presented {
  const { files, changes, stat } = proposedFiles(input, "content");
  const notes = Array.isArray(input.notes)
    ? input.notes.filter((note): note is string => typeof note === "string")
    : [];
  const [first] = files;
  let summary = `Change ${plural(files.length, "memory file")}`;
  if (files.length === 1 && first) {
    summary =
      first.before === "" ? `Add ${first.path}` : `Change ${first.path}`;
  }
  return {
    summary,
    detail: statWords(stat),
    changes,
    fields: [
      ...fieldsOf(input, ["files", "notes", "project"]),
      ...(notes.length > 0
        ? [{ key: "from notes", value: notes.join(", ") }]
        : []),
    ],
  };
}

/**
 * The name an agent's change to a project's design system is parked under
 * (hub design-system.ts): no tool's, so a session's own `design_write` call
 * is never drawn as one.
 */
export const DESIGN_PROPOSAL_TOOL = "mcp__cawco__design_proposal";

/**
 * A design proposal (Projects spec §5.7, "Changes arrive as proposals"): an
 * agent's change to its project's design system, every file it writes as it
 * stood (`before`) beside what it would hold (`after`), drawn as the memory
 * proposal's card draws its file.
 */
function designProposal(input: Record<string, unknown>): Presented {
  const { files, changes, stat } = proposedFiles(input, "after");
  return {
    summary:
      files.length === 1
        ? `Change ${files[0]?.path}`
        : `Change ${plural(files.length, "design system file")}`,
    detail: statWords(stat),
    changes,
    fields: fieldsOf(input, ["files", "project"]),
  };
}

/** The tool name a project's Caw changes his own project's settings by (hub project-settings.ts). */
export const PROJECT_SETTINGS_TOOL = "mcp__cawco__project_settings";

/** Where a project's work lands, as a project setting can set it: every way but `none`. */
export const PROJECT_LANDS = [
  "main",
  "branch",
  "pr",
] as const satisfies readonly LandsMode[];
export type ProjectLands = (typeof PROJECT_LANDS)[number];

/** Every change `project_settings` makes, by its kind. */
export const PROJECT_SETTING_KINDS = [
  "grant_connection",
  "link_repo",
  "set_lands",
  "set_runs_on",
  "create_repo",
  "rename",
  "set_review",
  "set_dispatch",
  "set_max_attempts",
  "set_review_limit",
  "set_budget",
  "set_events",
  "set_hears_tasks",
  "set_attempts_hear_comments",
  "set_account",
  "set_account_at_limit",
  "set_area",
  "set_starting_set",
] as const;

/**
 * One change `project_settings` makes, as the hub stores it on the ask and
 * the project note: a connection carries the account it signs in as.
 */
export type ProjectSettingChange =
  | {
      account?: string;
      connection: string;
      kind: "grant_connection";
      service?: string;
    }
  | { github: string; kind: "link_repo" }
  | { kind: "set_lands"; lands: ProjectLands }
  /** Where its attempts run (hub runs-on.ts): a machine or a capability; null: any machine. */
  | { kind: "set_runs_on"; runsOn: string | null }
  | { kind: "rename"; name: string }
  /** Review before done: on, only you move a task to done. */
  | { kind: "set_review"; review: boolean }
  /** Whether the hub starts attempts at ready tasks on its own (hub dispatch.ts). */
  | { dispatch: boolean; kind: "set_dispatch" }
  | { kind: "set_max_attempts"; maxAttempts: number }
  /** Dispatch pauses at this many tasks waiting for review. */
  | { kind: "set_review_limit"; reviewLimit: number }
  /** What one attempt may spend where its task says nothing; null: no limit. */
  | { budget: SettingsBudget | null; kind: "set_budget" }
  /** Whether the project's events reach its conversation, as its switch flips it (hub caw.ts `configure`). */
  | { events: boolean; kind: "set_events" }
  /** Whether the conversation reads what the person writes on its tasks (hub task-input.ts). */
  | { hearsTasks: boolean; kind: "set_hears_tasks" }
  /** Whether the person's comment on a task reaches its attempt (hub jev-tasks.ts). */
  | { attemptsHearComments: boolean; kind: "set_attempts_hear_comments" }
  /**
   * The account the project's sessions start on (hub project-edit.ts
   * `account`), by id, with its name as the change was checked; null: the
   * fleet's routing.
   */
  | { account: string | null; kind: "set_account"; name: string | null }
  /** What its sessions on its account do at that account's limit (core `ProjectAtLimit`). */
  | { atLimit: ProjectAtLimit; kind: "set_account_at_limit" }
  /**
   * The area it sits in (core areas.ts), by id, with its name as the change
   * was checked; null: none.
   */
  | { area: string | null; kind: "set_area"; name: string | null }
  /**
   * What the project's sessions start with when their delegate type names
   * no set (hub project-starting-set.ts): its `starting-set.md`; null: none,
   * everything installed.
   */
  | { kind: "set_starting_set"; startingSet: StartingSet | null }
  | {
      /** The account the GitHub connection signs in as: the repository's owner. */
      account?: string;
      /** What the project's place publishes: its tree's files and bytes. */
      bytes: number;
      connection: string;
      files: number;
      /**
       * The checkout published, absolute on its machine. Absent on an ask
       * stored before a publish named its folder: the project's only one.
       */
      folder?: string;
      kind: "create_repo";
      /** What CawCo's first commit of the place left out, and why (agent place-repo.ts). */
      leftOut: { path: string; why: string }[];
      name: string;
      private: boolean;
    };

const LANDS_WORDS: Record<ProjectLands, string> = {
  main: "Land this project's work on its default branch",
  branch: "Land this project's work on a branch of its own",
  pr: "Land this project's work as pull requests",
};

/** What one project setting change does, in the card's and the project note's words. */
export const projectSettingWords = (change: ProjectSettingChange): string => {
  switch (change.kind) {
    case "grant_connection":
      return `Let this project's sessions use ${change.connection}${
        change.service && change.account
          ? ` (${change.service} as ${change.account})`
          : ""
      }`;
    case "link_repo":
      return `Link this project to github.com/${change.github}`;
    case "create_repo":
      return `Publish ${change.folder ?? "this project"} to a ${change.private ? "private" : "public"} GitHub repository, ${change.account ? `${change.account}/` : ""}${change.name}`;
    case "set_runs_on":
      return change.runsOn
        ? `Run this project's attempts only on ${change.runsOn}`
        : "Run this project's attempts on any machine with a checkout";
    case "rename":
      return `Rename this project to ${change.name}`;
    case "set_review":
      return change.review
        ? "Review every task before done: only you close one"
        : "Stop reviewing before done: the project's conversation and sessions close finished tasks";
    case "set_dispatch":
      return projectSettingsWords.dispatchOn(change.dispatch);
    case "set_max_attempts":
      return projectSettingsWords.maxAttempts(change.maxAttempts);
    case "set_review_limit":
      return projectSettingsWords.reviewLimit(change.reviewLimit);
    case "set_budget":
      return projectSettingsWords.budget(change.budget);
    case "set_events":
      return projectSettingsWords.eventsOn(change.events);
    case "set_hears_tasks":
      return projectSettingsWords.hearsTasks(change.hearsTasks);
    case "set_attempts_hear_comments":
      return projectSettingsWords.attemptsHearComments(
        change.attemptsHearComments
      );
    case "set_account":
      return projectAccountWords.change(change.name);
    case "set_account_at_limit":
      return projectAccountWords.atLimit.change(change.atLimit);
    case "set_area":
      return areaWords.change(change.name);
    case "set_starting_set":
      return projectSettingsWords.startingSet(change.startingSet);
    case "set_lands":
      break;
  }
  return LANDS_WORDS[change.lands];
};

const MB = 1024 * 1024;

/** What a `create_repo` publishes and leaves out, in the card's words. */
export const publishedWords = (
  change: Extract<ProjectSettingChange, { kind: "create_repo" }>
): string => {
  const size = `${change.files} ${change.files === 1 ? "file" : "files"}, ${(change.bytes / MB).toFixed(1)} MB`;
  if (change.leftOut.length === 0) {
    return `${size}. Nothing was left out.`;
  }
  return `${size}. Left out, ${change.leftOut.length} ${change.leftOut.length === 1 ? "path" : "paths"}: ${change.leftOut
    .map((each) => `${each.path} (${each.why})`)
    .join("; ")}.`;
};

/** The changes a parked `project_settings` ask carries, those that read as one. */
const settingChanges = (input: Record<string, unknown>) =>
  (Array.isArray(input.changes) ? input.changes : []).filter(
    (one): one is ProjectSettingChange =>
      typeof one === "object" &&
      one !== null &&
      (PROJECT_SETTING_KINDS as readonly string[]).includes(
        (one as { kind?: unknown }).kind as string
      )
  );

/** A project setting change Caw asked about: each change in plain words, what a publish takes, and why. */
function projectSettings(
  input: Record<string, unknown>,
  context: PresentationContext
): Presented {
  const changes = settingChanges(input);
  // A change to its starting set alone is drawn as its tables of calls.
  const alone = changes.length === 1 ? changes[0] : undefined;
  if (alone?.kind === "set_starting_set") {
    const standing = context.startingSet?.({ kind: "project" });
    const tables = setTablesOf(standing, alone.startingSet);
    if (tables.length > 0) {
      return {
        ...setChangeWords(tables, !standing?.set),
        changes: [],
        fields: fieldsOf(input, ["changes", "ask", "project"]),
      };
    }
  }
  const published = changes.find(
    (one): one is Extract<ProjectSettingChange, { kind: "create_repo" }> =>
      one.kind === "create_repo"
  );
  const linked = changes.some((one) => one.kind === "link_repo");
  let detail: string | undefined;
  if (published) {
    detail = publishedWords(published);
  } else if (linked) {
    detail = "Its GitHub events and pull requests reach the project.";
  }
  return {
    summary:
      changes.map(projectSettingWords).join(" · ") ||
      "Change this project's settings",
    ...(detail ? { detail } : {}),
    changes: [],
    fields: fieldsOf(input, ["changes", "ask", "project"]),
  };
}

/** A file path, however the harness keys it (Claude Code, OpenCode, pi). */
const filePathOf = (input: Record<string, unknown>): string | undefined =>
  text(input.file_path) ??
  text(input.filePath) ??
  text(input.filepath) ??
  text(input.path);

const FILE_KEYS = ["file_path", "filePath", "filepath", "path"];
const EDIT_KEYS = [
  "old_string",
  "new_string",
  "oldString",
  "newString",
  "oldText",
  "newText",
  "edits",
];

/** An edit's replacements, each as the change it makes to the file. */
function editChanges(
  path: string,
  input: Record<string, unknown>
): PermissionChange[] {
  const edits: unknown[] = Array.isArray(input.edits) ? input.edits : [input];
  return edits.flatMap((edit) => {
    const each = (edit ?? {}) as Record<string, unknown>;
    const before = each.old_string ?? each.oldString ?? each.oldText;
    const after = each.new_string ?? each.newString ?? each.newText;
    // OpenCode asks with a `diff` instead; it stays a field.
    if (typeof before !== "string" && typeof after !== "string") {
      return [];
    }
    return [
      changeOf(
        path,
        typeof before === "string" ? before : "",
        typeof after === "string" ? after : ""
      ).change,
    ];
  });
}

const replaced = (changes: PermissionChange[]): string => {
  const added = changes.reduce((sum, each) => sum + each.added, 0);
  const removed = changes.reduce((sum, each) => sum + each.removed, 0);
  return statWords({ added, removed, sections: [] });
};

/** The harnesses' own tools: shells and web tools by every harness's name (core `HARNESS_TOOLS`), the rest by their lower-cased name. */
function builtIn(
  toolName: string,
  input: Record<string, unknown>
): Presented | undefined {
  if (SHELL_TOOLS.has(toolName)) {
    return shellCall(input);
  }
  if (WEB_FETCH_TOOLS.has(toolName)) {
    return only(
      `Fetch ${text(input.url) ?? "a web page"}`,
      fieldsOf(input, ["url"])
    );
  }
  if (WEB_SEARCH_TOOLS.has(toolName)) {
    return only(
      `Search the web for “${text(input.query) ?? ""}”`,
      fieldsOf(input, ["query"])
    );
  }
  const name = toolName.toLowerCase();
  const path = filePathOf(input);
  switch (name) {
    case "edit":
    case "multiedit": {
      const file = path ?? "a file";
      const changes = path ? editChanges(path, input) : [];
      return {
        summary: `Edit ${file}`,
        ...(changes.length > 0 ? { detail: replaced(changes) } : {}),
        changes,
        fields: fieldsOf(input, [...FILE_KEYS, ...EDIT_KEYS]),
      };
    }
    case "write": {
      const file = path ?? "a file";
      const content = typeof input.content === "string" ? input.content : "";
      const made = changeOf(file, "", content).change;
      return {
        summary: `Write ${file}`,
        detail: `${plural(made.added, "line")} written; whatever the file held is replaced`,
        changes: [made],
        fields: fieldsOf(input, [...FILE_KEYS, "content"]),
      };
    }
    case "read":
      return only(`Read ${path ?? "a file"}`, fieldsOf(input, FILE_KEYS));
    case "notebookedit":
      return only(
        `Edit notebook ${text(input.notebook_path) ?? path ?? "(no path)"}`,
        fieldsOf(input, ["notebook_path", ...FILE_KEYS])
      );
    case "glob":
      return only(
        `Find files matching ${text(input.pattern) ?? "(no pattern)"}`,
        fieldsOf(input, ["pattern"])
      );
    case "grep":
      return only(
        `Search files for ${text(input.pattern) ?? "(no pattern)"}`,
        fieldsOf(input, ["pattern"])
      );
    case "task":
    case "agent":
      return only(
        `Start a subagent: ${text(input.description) ?? "(no description)"}`,
        fieldsOf(input, ["description"])
      );
    case "exitplanmode":
      return only("Leave plan mode and start on the plan", fieldsOf(input));
    default:
      return undefined;
  }
}

/**
 * A shell call, presented: the session's own reason for it as the summary
 * ("Run a command" when it gave none), and the command whole, as `command`.
 * Every surface draws `command` under the summary, the peek and Caw's panel
 * too, since what runs is what the person approves.
 */
const shellCall = (input: Record<string, unknown>): Presented => {
  const whole = commandOf(input);
  return {
    summary: text(input.description)?.trim() ?? "Run a command",
    changes: [],
    ...(whole?.trim() ? { command: whole } : {}),
    fields: fieldsOf(input, ["command", "description"]),
  };
};

/** The shell command a permission is about, said whole under the summary. */
const commandOf = (input: Record<string, unknown>): string | null =>
  typeof input.command === "string" ? input.command : null;

/** Who asks, and where, as every ask's head says. */
const whoOf = (
  context: PresentationContext
): Pick<PermissionPresentation, "asker" | "project"> => ({
  asker: context.asker,
  ...(context.project ? { project: context.project } : {}),
});

/** A CawCo `ask`'s line under its questions: whether work waits on it (asks.ts `askStanceLine`); nothing for a harness's question. */
const stanceOf = (
  input: Record<string, unknown>
): Pick<PermissionPresentation, "detail"> => {
  const { blocks, waiting, meanwhile } = input;
  if (typeof blocks !== "boolean") {
    return {};
  }
  return {
    detail: askStanceLine({
      blocks,
      ...(typeof waiting === "string" ? { waiting } : {}),
      ...(typeof meanwhile === "string" ? { meanwhile } : {}),
    }),
  };
};

/**
 * What a parked tool call will do, for every surface that shows the ask. A
 * question names itself (its questions, joined); an admin write says the
 * setting it changes and, for memory, the change itself; a harness tool says
 * its act and object; any other tool is its display name over its fields.
 */
export function presentPermission(
  toolName: string,
  input: Record<string, unknown>,
  context: PresentationContext
): PermissionPresentation {
  const who = whoOf(context);
  const questions = questionsOf(toolName, input);
  if (questions) {
    return {
      ...who,
      summary: questions.map((question) => question.question).join(" · "),
      ...stanceOf(input),
      changes: [],
      fields: [],
    };
  }
  if (
    toolName === MEMORY_PROPOSAL_TOOL ||
    toolName === DELEGATE_TYPE_PROPOSAL_TOOL
  ) {
    return { ...who, ...memoryProposal(input) };
  }
  if (toolName === DESIGN_PROPOSAL_TOOL) {
    return { ...who, ...designProposal(input) };
  }
  if (toolName === PROJECT_SETTINGS_TOOL) {
    return { ...who, ...projectSettings(input, context) };
  }
  // A browser ask reads as its reason, the page's origin under it.
  if (toolName === BROWSER_ASK_TOOL) {
    return {
      ...who,
      summary: typeof input.reason === "string" ? input.reason : "",
      changes: [],
      fields:
        typeof input.origin === "string"
          ? [{ key: "origin", value: input.origin }]
          : [],
    };
  }
  // A connect ask reads as its reason, the server it signs in to under it.
  if (toolName === CONNECT_ASK_TOOL) {
    return {
      ...who,
      summary: typeof input.reason === "string" ? input.reason : "",
      changes: [],
      fields:
        typeof input.server === "string"
          ? [{ key: "server", value: input.server }]
          : [],
    };
  }
  const admin = CAWCO_ADMIN_WRITE.exec(toolName);
  // An MCP tool is never a harness's own, whatever it is called.
  const presented =
    (admin ? adminWrite(admin[1], input, context) : undefined) ??
    (MCP_NAME.test(toolName) ? undefined : builtIn(toolName, input)) ??
    only(toolDisplayName(toolName), fieldsOf(input));
  return { ...who, ...presented };
}
