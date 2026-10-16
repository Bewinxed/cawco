/**
 * What a permission prompt says, in plain words, on every surface: the
 * dashboard's composer card, the iOS parked prompt, the Telegram message and
 * the attention rails. The hub reads each ask once, as it parks it, and stamps
 * the result on the `permission_request` frame ({@link PermissionPresentation});
 * every surface renders that and reads nothing of the tool's input itself, so
 * no two of them can word the same ask two ways.
 *
 * The hub supplies what only it knows ({@link PresentationContext}): who asked,
 * the fleet's current memory text (so a memory write carries the change it
 * makes, not only the text it ends with), and which named settings already
 * exist (so a put says whether it adds or replaces).
 */
import { type MemoryScope, scopeWords } from "./fleet";
import { commonEnds, editScript, linesOf } from "./line-diff";
import { questionsOf } from "./question";

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
  /** The session that asked, by the name the board gives it ("Caw" for a project's lead). */
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
   * What will happen and why, in one line: "Change the fleet's CLAUDE.md";
   * for a shell call, the session's own reason for it ("Check whether the
   * two commits are on origin/main"), its command under it in `command`.
   */
  summary: string;
}

/** Who asks and where, as an ask's head names them: "Caw · cockpit". */
export const askerLine = (presentation: PermissionPresentation): string =>
  presentation.project
    ? `${presentation.asker} · ${presentation.project}`
    : presentation.asker;

/** The settings groups an admin write names things in. */
export type AdminGroup =
  | "connections"
  | "delegate_types"
  | "hooks"
  | "mcp_servers"
  | "plugins"
  | "previews"
  | "rules"
  | "skills";

/**
 * Where an install fetches from, as the hub read it when the call was
 * proposed (hub source-facts.ts): a skill's source, a marketplace's.
 */
export interface SourceFacts {
  /** The source as read: `github.com/owner/repo`, `npm package`. */
  at: string;
  /** When it first came out: the repository's creation, the package's first publish (ISO). */
  since?: string;
  /** The repository's GitHub stars. */
  stars?: number;
  /** Why there are no facts: a source that carries none, or the registry's answer. */
  unknown?: string;
  /** The package's npm downloads in the last week. */
  weeklyDownloads?: number;
}

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
}

// ── line changes ─────────────────────────────────────────────────────────

const HEADING = /^#{1,6}\s+(.+?)\s*#*\s*$/;

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
export function lineStat(before: string, after: string): LineStat {
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

/** The short form Telegram carries: "+3 −1". */
export const changeStat = (changes: PermissionChange[]): string => {
  const added = changes.reduce((sum, each) => sum + each.added, 0);
  const removed = changes.reduce((sum, each) => sum + each.removed, 0);
  return `+${added} −${removed}`;
};

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

/** A field whose name says it carries a credential. */
const SECRET_KEY =
  /secret|token|passw|api[-_]?key|apikey|auth|credential|cookie|private[-_]?key|^key$|bearer|session[-_]?id/i;
/** A value that reads as a credential whatever its field is called. */
const SECRET_VALUE = [
  /^(?:sk|pk|rk)[-_][A-Za-z0-9_-]{16,}/,
  /^gh[pousr]_[A-Za-z0-9]{20,}/,
  /^github_pat_[A-Za-z0-9_]{20,}/,
  /^xox[abprs]-[A-Za-z0-9-]{10,}/,
  /^AKIA[0-9A-Z]{16}$/,
  /^eyJ[\w-]{8,}\.[\w-]{8,}\.[\w-]{8,}$/,
  /^bearer\s+\S{8,}/i,
];
/** Maps whose every value is private by nature: a server's environment, a request's headers. */
const KEYS_ONLY = new Set(["env", "headers", "environment"]);

export const HIDDEN = "(hidden)";

const looksSecret = (value: string): boolean =>
  SECRET_VALUE.some((pattern) => pattern.test(value.trim()));

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
export function fieldsOf(
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

const MCP_NAME = /^mcp__(.+?)__(.+)$/;
const CAWCO_ADMIN_WRITE = /^(?:mcp__cawco__|cawco_)?admin_([a-z_]+)_write$/;
const WORD_BREAK = /[_-]+/g;
const CAMEL = /([a-z\d])([A-Z])/g;
const SPACES = /\s+/g;
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
export function toolDisplayName(toolName: string): string {
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

const DAY_MS = 86_400_000;
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
      const source = text(input.source) ?? "(no source)";
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
  const config = record(input.config) ?? {};
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
  if (!before) {
    const route = [text(input.harness), text(input.model), text(input.effort)]
      .filter(Boolean)
      .join(" · ");
    return only(
      `Add delegate type ${name}${route ? ` (${route})` : ""}`,
      fieldsOf(input, ["action", "name", "harness", "model", "effort"])
    );
  }
  // A put replaces the type: a field it leaves out is cleared.
  const after = Object.fromEntries(
    DELEGATE_TYPE_FIELDS.map((key) => [key, input[key] ?? null])
  );
  const kept = Object.fromEntries(
    DELEGATE_TYPE_FIELDS.map((key) => [key, before[key] ?? null])
  );
  const changed = changedFields(kept, after, context);
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
  "canDelegate",
  "cawcoTodos",
  "connections",
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
 * A memory proposal (Projects spec §5.4): a change to the project's AGENTS.md
 * or a knowledge file, as the curator or Caw proposed it, citing the inbox
 * notes it comes from. The hub puts the file as it stood (`before`) beside
 * the proposed text (`content`) as it parks it.
 */
function memoryProposal(input: Record<string, unknown>): Presented {
  const path = text(input.path) ?? "(no path)";
  const before = typeof input.before === "string" ? input.before : "";
  const content = typeof input.content === "string" ? input.content : "";
  const { change: made, stat } = changeOf(path, before, content);
  const notes = Array.isArray(input.notes)
    ? input.notes.filter((note): note is string => typeof note === "string")
    : [];
  return {
    summary: before === "" ? `Add ${path}` : `Change ${path}`,
    detail: statWords(stat),
    changes: [made],
    fields: [
      ...fieldsOf(input, ["path", "before", "content", "notes", "project"]),
      ...(notes.length > 0
        ? [{ key: "from notes", value: notes.join(", ") }]
        : []),
    ],
  };
}

/** The tool name a project's Caw changes his own project's settings by (hub project-settings.ts). */
export const PROJECT_SETTINGS_TOOL = "mcp__cawco__project_settings";

/** Where a project's work lands, as a project setting can set it. */
export type ProjectLands = "main" | "branch" | "pr";

/**
 * One change `project_settings` makes, as the hub stores it on the ask and
 * the thread note: a connection carries the account it signs in as.
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
  /** The Apple build gate (hub apple-gate.ts): on, work touching the iOS app lands only once it compiles. */
  | { appleGate: boolean; kind: "set_apple_gate" }
  | {
      /** The account the GitHub connection signs in as: the repository's owner. */
      account?: string;
      /** What the project's place publishes: its tree's files and bytes. */
      bytes: number;
      connection: string;
      files: number;
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

/** What one project setting change does, in the card's and the thread's words. */
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
      return `Publish this project to a ${change.private ? "private" : "public"} GitHub repository, ${change.account ? `${change.account}/` : ""}${change.name}`;
    case "set_runs_on":
      return change.runsOn
        ? `Run this project's attempts only on ${change.runsOn}`
        : "Run this project's attempts on any machine with a checkout";
    case "rename":
      return `Rename this project to ${change.name}`;
    case "set_review":
      return change.review
        ? "Review every task before done: only you close one"
        : "Stop reviewing before done: the lead and sessions close finished tasks";
    case "set_apple_gate":
      return change.appleGate
        ? "Land work that changes the iOS app only once it compiles on a Mac"
        : "Land work that changes the iOS app without compiling it on a Mac";
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
      [
        "grant_connection",
        "link_repo",
        "set_lands",
        "set_runs_on",
        "create_repo",
        "rename",
        "set_review",
        "set_apple_gate",
      ].includes((one as { kind?: unknown }).kind as string)
  );

/** A project setting change Caw asked about: each change in plain words, what a publish takes, and why. */
function projectSettings(input: Record<string, unknown>): Presented {
  const changes = settingChanges(input);
  const published = changes.find(
    (one): one is Extract<ProjectSettingChange, { kind: "create_repo" }> =>
      one.kind === "create_repo"
  );
  const linked = changes.some((one) => one.kind === "link_repo");
  let detail: string | undefined;
  if (published) {
    detail = publishedWords(published);
  } else if (linked) {
    detail =
      "Linking sets the repository GitHub events and pull requests use; no file in the project changes.";
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

/** The harnesses' own tools, by their lower-cased name. */
function builtIn(
  toolName: string,
  input: Record<string, unknown>
): Presented | undefined {
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
    // Claude Code's and pi's `bash`; OpenCode 2.0's `shell`.
    case "bash":
    case "shell":
      return shellCall(input);
    case "webfetch":
      return only(
        `Fetch ${text(input.url) ?? "a web page"}`,
        fieldsOf(input, ["url"])
      );
    case "websearch":
      return only(
        `Search the web for “${text(input.query) ?? ""}”`,
        fieldsOf(input, ["query"])
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
 * A workspace boundary's rewrite of a shell call (agent boundary-judge.ts):
 * the command run through the place's executor, the directory it ended in
 * carried out. Claude Code runs the boundary's PreToolUse hook before it
 * asks, so a bounded session's ask carries the rewrite (a project's Caw's,
 * every time).
 */
const BOUNDED =
  /^'[^']+' --cwd-out '[^']+' '((?:[^']|'\\'')*)'; __cawco_status=\$\?; /;

/**
 * The command a shell call runs, out of the boundary's rewrite once when it
 * is in one: what an ask shows and what the hub's gate judges. The call's
 * own input keeps the rewrite, so an answer never runs it unbounded.
 */
export const unboundedCommand = (command: string): string => {
  const inner = BOUNDED.exec(command)?.[1];
  return inner === undefined ? command : inner.replaceAll("'\\''", "'");
};

/**
 * A shell call, presented: the session's own reason for it as the summary
 * ("Run a command" when it gave none), and the command whole, out of a
 * boundary's rewrite, as `command`. Every surface draws `command` under the
 * summary, the peek and Caw's panel too, since what runs is what the
 * person approves.
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
export const commandOf = (input: Record<string, unknown>): string | null =>
  typeof input.command === "string" ? unboundedCommand(input.command) : null;

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
  const who = {
    asker: context.asker,
    ...(context.project ? { project: context.project } : {}),
  };
  const questions = questionsOf(toolName, input);
  if (questions) {
    return {
      ...who,
      summary: questions.map((question) => question.question).join(" · "),
      changes: [],
      fields: [],
    };
  }
  if (toolName === MEMORY_PROPOSAL_TOOL) {
    return { ...who, ...memoryProposal(input) };
  }
  if (toolName === PROJECT_SETTINGS_TOOL) {
    return { ...who, ...projectSettings(input) };
  }
  const admin = CAWCO_ADMIN_WRITE.exec(toolName);
  // An MCP tool is never a harness's own, whatever it is called.
  const presented =
    (admin ? adminWrite(admin[1], input, context) : undefined) ??
    (MCP_NAME.test(toolName) ? undefined : builtIn(toolName, input)) ??
    only(toolDisplayName(toolName), fieldsOf(input));
  return { ...who, ...presented };
}
