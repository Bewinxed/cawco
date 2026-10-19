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
import { type MemoryScope, scopeWords } from "./fleet";
import { BROWSER_ASK_TOOL } from "./frames";
import { commonEnds, editScript, linesOf } from "./line-diff";
import { questionsOf } from "./question";
import type { ToolKindId } from "./tool-presentation";
import { UPSTREAM_POST_TOOL } from "./upstream-post";

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

/**
 * A thing an ask names that the person can go and look at: a setting's
 * page on the dashboard (`/config/mcp/mobbin-web`), a repository on GitHub.
 * Without `href` it is words only (a file in a checkout, which no page
 * shows).
 */
export interface PermissionTarget {
  /** A dashboard path (`/config/...`) or an `https://` address. */
  href?: string;
  name: string;
}

/**
 * The grant line in parts, so a surface can set its target as a link:
 * "Change" "MCP server" [mobbin-web] "", or "Install" "skill" [better-ui]
 * "from" [github.com/interfaces/skills]. `summary` is these joined.
 */
export interface PermissionSubject {
  /** The tool family whose glyph and hue lead the line (tool-presentation.ts `ToolKindId`). */
  family: ToolKindId;
  /** What kind of thing it acts on: "MCP server", "skill", "the fleet's". */
  kind?: string;
  /** Words after the target, and a second thing named there: "from" [a source], "(http://…)". */
  tail?: { target?: PermissionTarget; text: string };
  /** The thing itself. */
  target?: PermissionTarget;
  /** What it does, capitalised: "Change", "Remove", "Run a command". */
  verb: string;
}

/** One setting a write moves: what it held (absent for one it adds) and what it will hold. */
export interface PermissionSetting {
  after: string;
  /** What it holds now; "nothing" when it is empty; absent when the setting is new. */
  before?: string;
  key: string;
}

/**
 * One run of the count line: words, a fact set as a badge, or the joint
 * between two badges (a comma a surface may draw as a gap).
 */
export type CountPart = { text: string } | { badge: string } | { sep: string };

/** What a removal does after it lands, one sentence each. */
export interface PermissionConsequence {
  /** Which mark leads the row (each surface draws its own glyph for it). */
  glyph:
    | "loads"
    | "named"
    | "settings"
    | "lines"
    | "projects"
    | "trash"
    | "permanent";
  /** A page that shows what the sentence names. */
  href?: string;
  text: string;
}

export interface PermissionPresentation {
  /** The session that asked, by the name the board gives it ("Caw" for a project's lead). */
  asker: string;
  /**
   * What approving covers, and what it does not widen, under the Approve and
   * Deny row (WORDS.md, Permission): "Approving covers this one command. It
   * does not widen what Caw may run later."
   */
  bound: string;
  /** A fact to read before approving, in the serious register: "Age unknown: the source carries no dates." */
  caution?: string;
  /** Each setting a write moves, before and after, in the order the write names them. */
  changed: PermissionSetting[];
  /** The changes the call makes, each drawn as a diff. Empty when it changes no text. */
  changes: PermissionChange[];
  /**
   * The shell command a shell call runs, whole and out of a boundary's
   * rewrite: shown under the summary on every surface, one line until
   * opened. Absent for any other call.
   */
  command?: string;
  /** What a removal does after it lands ("After this:"), one row each. Empty for anything else. */
  consequences: PermissionConsequence[];
  /**
   * The count line as words and badges: "4 settings change: ‹command›,
   * ‹args›; nothing else · loads in ‹every session›". `detail` is the same
   * line as plain words.
   */
  count: CountPart[];
  /** The count line as plain words, for a surface that sets no badges (the push, the peek). */
  detail?: string;
  /** The rest of the input worth reading, secrets hidden. What the lines above and the diffs already say is left out. */
  fields: PermissionField[];
  /** True when nothing brings it back once approved. */
  irreversible: boolean;
  /**
   * A post to another person's repository held for the person: Needs you
   * names it by its own title (a comment's, its body's first line) over
   * where it goes (`owner/repo#12`). Absent for any other ask.
   */
  post?: HeldPostNaming;
  /** The project the asker works in, by name; absent for a session in none. */
  project?: string;
  /** That project's id, for its link. */
  projectId?: string;
  /**
   * Why the session asks, in its own words: an admin write's `reason`, a
   * shell call's `description`. Absent when the call gives none.
   */
  reason?: string;
  /** The markdown sections a text change touches, in order. */
  sections: string[];
  /** The grant line in parts. */
  subject: PermissionSubject;
  /** The grant line as one string: the subject's parts joined ("Change MCP server mobbin-web"). */
  summary: string;
}

/** A held post as Needs you names it: what it is, and where it goes. */
export interface HeldPostNaming {
  /** `owner/repo`, the host too off GitHub, with `#n` for the issue or pull request it is on. */
  target: string;
  /** The post's own title; a comment's first line. */
  title: string;
}

/** Who asks and where, as one line for a surface with no chips: "Caw · cockpit". */
export const askerLine = (presentation: PermissionPresentation): string =>
  presentation.project
    ? `${presentation.asker} · ${presentation.project}`
    : presentation.asker;

/** A subject's parts as one line: what `summary` holds. */
export const subjectWords = (subject: PermissionSubject): string =>
  [
    subject.verb,
    subject.kind,
    subject.target?.name,
    subject.tail?.text,
    subject.tail?.target?.name,
  ]
    .filter((part) => !!part)
    .join(" ");

/** A count line as plain words: a badge by its words, a joint as written. */
export const countWords = (count: CountPart[]): string =>
  count
    .map((part) => {
      if ("badge" in part) {
        return part.badge;
      }
      return "sep" in part ? part.sep : part.text;
    })
    .join("");

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
  /** The delegate types whose `skills` or `connections` name this one, by name: what a removal leaves them without. */
  namedBy: (field: "skills" | "connections", name: string) => string[];
  /** The asking session's project, by name; undefined when it is in none. */
  project?: string;
  /** That project's id. */
  projectId?: string;
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

/** "3 lines changed in ‹Working style›": how much a text change moves, and where. */
function statParts(stat: LineStat): CountPart[] {
  const { added, removed, sections } = stat;
  if (added === 0 && removed === 0) {
    return [{ text: "No lines change" }];
  }
  let amount: string;
  if (removed === 0) {
    amount = `${plural(added, "line")} added`;
  } else if (added === 0) {
    amount = `${plural(removed, "line")} removed`;
  } else {
    amount = `${plural(Math.max(added, removed), "line")} changed`;
  }
  const [only] = sections;
  if (sections.length === 1 && only) {
    return [{ text: `${amount} in ` }, { badge: only }];
  }
  return [
    {
      text:
        sections.length > 1
          ? `${amount} across ${plural(sections.length, "section")}`
          : amount,
    },
  ];
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
): { change: PermissionChange; count: CountPart[]; sections: string[] } => {
  const { change, stat } = changeOf(path, before, after);
  const a = linesOf(before);
  const b = linesOf(after);
  const { head, tail } = commonEnds(a, b);
  const from = Math.max(0, head - HUNK_CONTEXT);
  const keep = Math.max(0, tail - HUNK_CONTEXT);
  const words = statParts(stat);
  return {
    change: {
      ...change,
      // Each line keeps its own line ending (line-diff.ts `linesOf`).
      before: a.slice(from, a.length - keep).join(""),
      after: b.slice(from, b.length - keep).join(""),
    },
    count:
      stat.added + stat.removed === 0
        ? words
        : [
            ...words,
            {
              text: ` (+${stat.added} −${stat.removed}), shown from line ${from + 1} of ${b.length}`,
            },
          ],
    sections: stat.sections,
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
/** An empty setting, in a word the reader knows (WORDS.md, Precise). */
const NOTHING = "nothing";

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
    return keys.length > 0 ? `${keys.join(", ")} (values hidden)` : NOTHING;
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

/** What one tool's presenter says; {@link presentPermission} fills the rest in. */
interface Presented {
  caution?: string;
  changed?: PermissionSetting[];
  changes?: PermissionChange[];
  command?: string;
  consequences?: PermissionConsequence[];
  count?: CountPart[];
  fields?: PermissionField[];
  post?: HeldPostNaming;
  reason?: string;
  sections?: string[];
  subject: PermissionSubject;
}

const only = (
  subject: PermissionSubject,
  fields: PermissionField[] = []
): Presented => ({ subject, fields });

/** A grant line that is one run of words, with nothing in it to go to. */
const plainSubject = (
  verb: string,
  family: ToolKindId = "other"
): PermissionSubject => ({ verb, family });

const PATH_SEGMENTS = /\/+/;
const encodePath = (path: string) =>
  path.split(PATH_SEGMENTS).map(encodeURIComponent).join("/");

/** Where the dashboard shows each thing an ask names (apps/dashboard routes/(app)). */
export const askHref = {
  connections: "/config/connections",
  delegateType: (name: string) =>
    `/config/delegate-types/${encodeURIComponent(name)}`,
  delegateTypes: "/config/delegate-types",
  hook: (id: string) => `/config/hooks/${encodeURIComponent(id)}`,
  mcp: (name: string) => `/config/mcp/${encodeURIComponent(name)}`,
  memory: (path: string | null) =>
    path === null ? "/config/memory" : `/config/memory/${encodePath(path)}`,
  previews: "/config/previews",
  project: (id: string) => `/project/${encodeURIComponent(id)}`,
  rule: (id: string) => `/config/rules/${encodeURIComponent(id)}`,
  session: (id: string) => `/session/${encodeURIComponent(id)}`,
  /** Skills, plugins and marketplaces share one page. */
  skills: "/config/skills",
} as const;

const GITHUB_SOURCE =
  /^(?:github:|(?:https?:\/\/)?(?:www\.)?github\.com\/)([\w.-]+\/[\w.-]+)/i;
const WEB_ADDRESS = /^https?:\/\/\S+$/i;
const GIT_SUFFIX = /\.git$/;

/** A source's page: a GitHub repository at github.com, any other web address as itself. */
const sourceHref = (source: string): string | undefined => {
  const repo = GITHUB_SOURCE.exec(source)?.[1];
  if (repo) {
    return `https://github.com/${repo.replace(GIT_SUFFIX, "")}`;
  }
  return WEB_ADDRESS.test(source) ? source : undefined;
};

/** The last row of an undoable removal (hub db/trash.ts keeps it for `UNDO_MS`). */
const TRASH_ROW: PermissionConsequence = {
  glyph: "trash",
  text: "Undo stays open for a minute after approving. After that, this cannot be undone.",
};

/** Where it loaded before a removal, as one row: "No session loads it after this. Every session did." */
const unloaded = (projectId: unknown, context: PresentationContext) => {
  const was = loadsIn(projectId, context);
  return {
    glyph: "loads",
    text: `No session loads it after this. ${was.charAt(0).toUpperCase()}${was.slice(1)} did.`,
  } satisfies PermissionConsequence;
};

/** The delegate types a removed skill or connection leaves without it, as one row, when there are any. */
const namedByRow = (
  field: "skills" | "connections",
  name: string,
  context: PresentationContext
): PermissionConsequence[] => {
  const types = context.namedBy(field, name);
  if (types.length === 0) {
    return [];
  }
  return [
    {
      glyph: "named",
      text: `Named by ${plural(types.length, "delegate type")}: ${types.join(", ")}.`,
      href:
        types.length === 1 && types[0]
          ? askHref.delegateType(types[0])
          : askHref.delegateTypes,
    },
  ];
};

/** "loads in ‹…›" for a document write that sets its scope; left out, the scope stays, and nothing is said. */
const scopeParts = (
  scope: unknown,
  context: PresentationContext
): CountPart[] =>
  typeof scope === "object" && scope !== null
    ? [
        { text: "loads in " },
        {
          badge: scopeWords(
            scope as MemoryScope,
            (id) => context.projectName(id) ?? `project ${id}`
          ),
        },
      ]
    : [];

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
  const doc = (verb: string): PermissionSubject => ({
    verb,
    family: "memory",
    target: path
      ? { name: path, href: askHref.memory(path) }
      : { name: "(no path)" },
  });
  switch (input.action) {
    case "set": {
      const now = context.memory(null);
      const made = hunkOf("CLAUDE.md", now ?? "", content);
      return {
        subject: {
          verb: now === undefined ? "Create" : "Change",
          kind: "the fleet's",
          family: "memory",
          target: { name: "CLAUDE.md", href: askHref.memory(null) },
        },
        count: counted(made.count, [
          { text: "loads in " },
          { badge: "every session" },
        ]),
        sections: made.sections,
        changes: [made.change],
      };
    }
    case "set_doc": {
      const now = path ? context.memory(path) : undefined;
      const made = hunkOf(path ?? "(no path)", now ?? "", content);
      return {
        subject: doc(now === undefined ? "Create" : "Change"),
        count: counted(made.count, scopeParts(input.scope, context)),
        sections: made.sections,
        changes: [made.change],
      };
    }
    case "remove_doc": {
      const now = path ? context.memory(path) : undefined;
      if (now === undefined) {
        return {
          subject: doc("Remove"),
          count: said("The fleet keeps no document at this path"),
        };
      }
      const made = hunkOf(path ?? "(no path)", now, "");
      return {
        subject: doc("Remove"),
        consequences: [
          {
            glyph: "lines",
            text: `Its ${plural(made.change.removed, "line")} ${made.change.removed === 1 ? "goes" : "go"} with it, shown below.`,
          },
          TRASH_ROW,
        ],
        sections: made.sections,
        changes: [made.change],
      };
    }
    default:
      return only(
        plainSubject(
          `Change the fleet's memory (${String(input.action)})`,
          "memory"
        ),
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
 * An install's source as the card shows it: how old and how many use it, as
 * badges on the count line; that nothing is known of its age, as a caution;
 * and where, unless the grant line already names it (`named`).
 */
function sourceFacts(
  source: SourceFacts | undefined,
  named = false
): { caution?: string; count: CountPart[]; fields: PermissionField[] } {
  if (!source) {
    return { count: [], fields: [] };
  }
  const npm = source.weeklyDownloads !== undefined;
  const badges: string[] = [];
  if (source.since) {
    badges.push(
      `${npm ? "first published" : "created"} ${DAY.format(new Date(source.since))}, ${agoWords(source.since)}`
    );
  }
  if (source.stars !== undefined) {
    badges.push(`${COUNT.format(source.stars)} stars`);
  }
  if (source.weeklyDownloads !== undefined) {
    badges.push(`${COUNT.format(source.weeklyDownloads)} downloads last week`);
  }
  return {
    ...(source.unknown ? { caution: `Age unknown: ${source.unknown}` } : {}),
    count: badges.flatMap((badge, at): CountPart[] =>
      at === 0 ? [{ badge }] : [{ sep: ", " }, { badge }]
    ),
    fields: named ? [] : [{ key: "from", value: source.at }],
  };
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

/** "loads in ‹every session›": where it loads after the write, and where it loaded before when that moves. */
const loadsInParts = (
  before: unknown,
  after: unknown,
  context: PresentationContext
): CountPart[] => {
  const now = loadsIn(after, context);
  const was = loadsIn(before, context);
  return now === was
    ? [{ text: "loads in " }, { badge: now }]
    : [
        { text: "loads in " },
        { badge: now },
        { text: ", was " },
        { badge: was },
      ];
};

/** A count line's runs, each after the last with " · " between them, the first capitalised. */
const counted = (...runs: CountPart[][]): CountPart[] =>
  runs
    .filter((run) => run.length > 0)
    .flatMap((run, at) => {
      if (at > 0) {
        return [{ text: " · " }, ...run];
      }
      const [first, ...rest] = run;
      return first && "text" in first
        ? [
            {
              text: `${first.text.charAt(0).toUpperCase()}${first.text.slice(1)}`,
            },
            ...rest,
          ]
        : run;
    });

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
    return NOTHING;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return NOTHING;
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
 * `after` that differs, before and after, names resolved; with nothing kept
 * yet, each field it sets, with no before. A field `after` leaves undefined
 * keeps its value and is not shown; one it sets null is cleared.
 */
function changedFields(
  before: Record<string, unknown> | undefined,
  after: Record<string, unknown>,
  context: PresentationContext
): PermissionSetting[] {
  return Object.entries(after).flatMap(([key, value]) => {
    if (value === undefined) {
      return [];
    }
    if (!before) {
      return value === null || value === "" || same(value, [])
        ? []
        : [{ key: fieldName(key), after: settingWords(key, value, context) }];
    }
    const was = before[key];
    if (same(was, value)) {
      return [];
    }
    const from = settingWords(key, was, context);
    const to = settingWords(key, value, context);
    // Hidden values (an env's, a header's) moved under the same keys.
    return [
      from === to
        ? { key: fieldName(key), after: `${to}, its values change` }
        : { key: fieldName(key), before: from, after: to },
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

/** The count line's first run: how many settings move and which, or that none does. */
const changeCount = (changed: PermissionSetting[]): CountPart[] =>
  changed.length === 0
    ? [{ text: "nothing changes: the fleet already keeps it this way" }]
    : [
        {
          text: `${plural(changed.length, "setting")} ${changed.length === 1 ? "changes" : "change"}: `,
        },
        ...changed.flatMap((setting, at): CountPart[] =>
          at === 0
            ? [{ badge: setting.key }]
            : [{ sep: ", " }, { badge: setting.key }]
        ),
        { text: "; nothing else" },
      ];

/** A count line of one sentence. */
const said = (words: string): CountPart[] => [{ text: words }];

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
  const skill = (verb: string): PermissionSubject => ({
    verb,
    kind: "skill",
    family: "skill",
    target: { name, href: askHref.skills },
  });
  switch (input.action) {
    case "install": {
      const source = text(input.source) ?? "(no source)";
      const from = sourceHref(source);
      const subject = (verb: string): PermissionSubject => ({
        ...skill(verb),
        tail: {
          text: "from",
          target: { name: source, ...(from ? { href: from } : {}) },
        },
      });
      // The grant line names the source.
      const facts = sourceFacts(context.source, true);
      if (!before) {
        return {
          subject: subject("Install"),
          count: counted(
            facts.count,
            loadsInParts(projectId, projectId, context)
          ),
          ...(facts.caution ? { caution: facts.caution } : {}),
          fields: [{ key: "scope", value: bindingWords(projectId, context) }],
        };
      }
      const changed = changedFields(
        before,
        { source: input.source, enabled: true, projectId: projectId ?? null },
        context
      );
      return {
        subject: subject("Reinstall"),
        changed,
        count: counted(
          changeCount(changed),
          facts.count,
          loadsInParts(before.projectId, projectId, context)
        ),
        ...(facts.caution ? { caution: facts.caution } : {}),
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
        subject: skill(input.action === "enable" ? "Enable" : "Disable"),
        changed,
        count: counted(
          before
            ? changeCount(changed)
            : said("the fleet keeps no skill of this name"),
          loadsInParts(projectId, projectId, context)
        ),
      };
    }
    case "remove":
      return {
        subject: skill("Remove"),
        consequences: [
          unloaded(before?.projectId, context),
          ...namedByRow("skills", name, context),
          TRASH_ROW,
        ],
      };
    default:
      return only(skill("Change"), fieldsOf(input));
  }
}

function mcpServersWrite(
  input: Record<string, unknown>,
  context: PresentationContext
): Presented {
  const name = text(input.name) ?? "(unnamed)";
  const before = context.current("mcp_servers", name);
  const server = (verb: string): PermissionSubject => ({
    verb,
    kind: "MCP server",
    family: "mcp",
    target: { name, href: askHref.mcp(name) },
  });
  if (input.action === "remove") {
    const keys = Object.keys(record(before?.config) ?? {});
    return {
      subject: server("Remove"),
      consequences: [
        unloaded(before?.projectId, context),
        ...(keys.length > 0
          ? [
              {
                glyph: "settings",
                text: `Its settings (${keys.join(", ")}) go with it.`,
              } satisfies PermissionConsequence,
            ]
          : []),
        TRASH_ROW,
      ],
    };
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
    return {
      subject: {
        ...server("Add"),
        ...(target ? { tail: { text: `(${target})` } } : {}),
      },
      count: counted(loadsInParts(projectId, projectId, context)),
      fields: [
        ...fieldsOf(config, whole ? ["url", "command", "args"] : ["url"]),
        { key: "scope", value: bindingWords(projectId, context) },
        ...(enabled === false ? [{ key: "enabled", value: "off" }] : []),
      ],
    };
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
    subject: server("Change"),
    changed,
    count: counted(
      changeCount(changed),
      loadsInParts(before.projectId, projectId, context)
    ),
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
  const hook = (verb: string): PermissionSubject => ({
    verb,
    kind: "hook",
    family: "other",
    target: { name, ...(id ? { href: askHref.hook(id) } : {}) },
  });
  switch (input.action) {
    case "create":
      return only(
        { ...hook("Add"), ...(event ? { tail: { text: `on ${event}` } } : {}) },
        fieldsOf(input, ["action", "id", "name", "event", "reason"])
      );
    case "update": {
      // The hub lays the given fields over the stored hook.
      const changed = changedFields(before, given(input, ["id"]), context);
      return {
        subject: hook("Change"),
        changed,
        count: before
          ? counted(changeCount(changed))
          : said("The fleet keeps no hook of this id"),
      };
    }
    case "remove":
      return {
        subject: hook("Remove"),
        consequences: [
          { glyph: "loads", text: "No session runs it after this." },
          TRASH_ROW,
        ],
      };
    default:
      return only(hook("Change"), fieldsOf(input));
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
  const rule = (verb: string): PermissionSubject => ({
    verb,
    kind: "rule",
    family: "other",
    target: { name, ...(id ? { href: askHref.rule(id) } : {}) },
  });
  switch (input.action) {
    case "create":
      return only(
        {
          ...rule("Add"),
          ...(pattern
            ? { tail: { text: `(watches “${cut(pattern, 60)}”)` } }
            : {}),
        },
        fieldsOf(input, ["action", "name", "reason"])
      );
    case "update": {
      // The tool lays the given fields over the stored rule.
      const changed = changedFields(before, given(input, ["id"]), context);
      return {
        subject: rule("Change"),
        changed,
        count: before
          ? counted(changeCount(changed))
          : said("The fleet keeps no rule of this id"),
      };
    }
    case "remove":
      return {
        subject: rule("Remove"),
        consequences: [
          {
            glyph: "loads",
            text: "It stops at once, for every session it watched.",
          },
          TRASH_ROW,
        ],
      };
    default:
      return only(rule("Change"), fieldsOf(input));
  }
}

function pluginsWrite(
  input: Record<string, unknown>,
  context: PresentationContext
): Presented {
  const id = text(input.id) ?? "(no id)";
  const name = text(input.name) ?? "(unnamed)";
  const before = text(input.id) ? context.current("plugins", id) : undefined;
  const plugin = (verb: string): PermissionSubject => ({
    verb,
    kind: "plugin",
    family: "skill",
    target: { name: id, href: askHref.skills },
  });
  const marketplace = (verb: string, called: string): PermissionSubject => {
    const href = sourceHref(called);
    return {
      verb,
      kind: "marketplace",
      family: "skill",
      target: { name: called, href: href ?? askHref.skills },
    };
  };
  switch (input.action) {
    case "link": {
      const facts = sourceFacts(context.source);
      return {
        subject: marketplace("Link", text(input.source) ?? "(no source)"),
        count: counted(
          facts.count,
          said("loads nothing yet: a plugin from it loads once installed")
        ),
        ...(facts.caution ? { caution: facts.caution } : {}),
        fields: facts.fields,
      };
    }
    case "unlink":
      return {
        subject: marketplace("Unlink", name),
        consequences: [TRASH_ROW],
      };
    case "install": {
      const facts = sourceFacts(context.source);
      return {
        subject: plugin(before ? "Reinstall" : "Install"),
        changed:
          before?.enabled === false
            ? [{ key: "enabled", before: "off", after: "on" }]
            : [],
        count: counted(facts.count, [
          { text: "loads in " },
          { badge: loadsIn(before?.projectId, context) },
        ]),
        ...(facts.caution ? { caution: facts.caution } : {}),
        fields: facts.fields,
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
        subject: plugin(input.action === "enable" ? "Enable" : "Disable"),
        changed,
        count: counted(
          before
            ? changeCount(changed)
            : said("the fleet keeps no plugin of this id"),
          [
            { text: "loads in " },
            { badge: loadsIn(before?.projectId, context) },
          ]
        ),
      };
    }
    case "refresh":
      return only({
        ...plugin("Refresh"),
        tail: { text: "from its marketplace" },
      });
    case "remove":
      return {
        subject: plugin("Remove"),
        consequences: [unloaded(before?.projectId, context), TRASH_ROW],
      };
    default:
      return only(plugin("Change"), fieldsOf(input));
  }
}

function delegateTypesWrite(
  input: Record<string, unknown>,
  context: PresentationContext
): Presented {
  const name = text(input.name) ?? "(unnamed)";
  const type = (verb: string): PermissionSubject => ({
    verb,
    kind: "delegate type",
    family: "task",
    target: { name, href: askHref.delegateType(name) },
  });
  if (input.action === "delete") {
    return {
      subject: type("Remove"),
      consequences: [
        { glyph: "named", text: "No delegate starts as it after this." },
        TRASH_ROW,
      ],
    };
  }
  const before = context.current("delegate_types", name);
  if (!before) {
    const route = [text(input.harness), text(input.model), text(input.effort)]
      .filter(Boolean)
      .join(" · ");
    return only(
      {
        ...type("Add"),
        target: { name, href: askHref.delegateTypes },
        ...(route ? { tail: { text: `(${route})` } } : {}),
      },
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
    subject: type("Change"),
    changed,
    count: counted(changeCount(changed)),
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
  const connection = (verb: string): PermissionSubject => ({
    verb,
    kind: "connection",
    family: "web",
    target: { name, href: askHref.connections },
  });
  switch (input.action) {
    case "create": {
      const service = text(input.service);
      const account = text(input.account);
      return {
        subject: {
          ...connection("Add"),
          ...(service
            ? {
                tail: {
                  text: `(${service}${account ? ` as ${account}` : ""})`,
                },
              }
            : {}),
        },
        changed: changedFields(
          undefined,
          given(input, ["name", "service", "account"]),
          context
        ),
      };
    }
    case "update": {
      const changed = changedFields(
        before,
        given(input, ["name", "origin"]),
        context
      );
      return {
        subject: connection("Change"),
        changed,
        count: before
          ? counted(changeCount(changed))
          : said("The hub keeps no connection of this name"),
      };
    }
    case "sign_in":
      return only({ ...connection("Sign"), tail: { text: "in" } });
    case "remove": {
      const projects = Array.isArray(before?.projects) ? before.projects : [];
      return {
        subject: connection("Remove"),
        consequences: [
          {
            glyph: "projects",
            text:
              projects.length === 0
                ? "No project uses it now."
                : `${settingWords("projects", projects, context)} ${projects.length === 1 ? "loses" : "lose"} it.`,
          },
          ...namedByRow("connections", name, context),
          TRASH_ROW,
        ],
      };
    }
    default:
      return only(connection("Change"), fieldsOf(input));
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
    subject: {
      verb: "Change",
      family: "preview",
      target: { name: "how previews are reached", href: askHref.previews },
    },
    changed,
    count: counted(changeCount(changed), [
      { text: "affects " },
      { badge: "every session's previews" },
    ]),
  };
}

/**
 * An admin write as its card reads it: the session's `reason` as the line
 * under the grant, then what changes and what it affects, as each group
 * says them.
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
  const reason = text(input.reason)?.trim();
  return {
    ...presented,
    ...(reason ? { reason } : {}),
    fields: (presented.fields ?? []).filter((field) => field.key !== "reason"),
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
 * The name Caw's delegate type is parked under as a proposal (hub memory.ts,
 * from his `folder_write` of a `delegates/` file): no tool's, so his own
 * `folder_write` call is never drawn as one.
 */
export const DELEGATE_TYPE_PROPOSAL_TOOL = "mcp__cawco__delegate_type_proposal";

/**
 * A memory proposal (Projects spec §5.4): a change to the project's AGENTS.md
 * or its knowledge files, as the curator, Jev's sort, the hub's archive or
 * withdrawal, or Caw proposed it, citing the inbox notes it comes from; and
 * Caw's delegate type (§5.1, "a file diff you approve"), drawn the same. The
 * hub puts each file as it stood (`before`) beside its proposed text
 * (`content`) as it parks it: a fact moving between files is one card.
 */
function memoryProposal(input: Record<string, unknown>): Presented {
  const files = Array.isArray(input.files)
    ? input.files.filter(
        (file): file is { before: string; content: string; path: string } =>
          typeof file === "object" &&
          file !== null &&
          typeof (file as { path?: unknown }).path === "string" &&
          typeof (file as { before?: unknown }).before === "string" &&
          typeof (file as { content?: unknown }).content === "string"
      )
    : [];
  const made = files.map((file) =>
    changeOf(file.path, file.before, file.content)
  );
  const stat = totalOf(made);
  const notes = Array.isArray(input.notes)
    ? input.notes.filter((note): note is string => typeof note === "string")
    : [];
  const [first] = files;
  const subject: PermissionSubject =
    files.length === 1 && first
      ? {
          verb: first.before === "" ? "Add" : "Change",
          family: "memory",
          target: { name: first.path },
        }
      : {
          verb: "Change",
          kind: plural(files.length, "memory file"),
          family: "memory",
        };
  const reason = text(input.why)?.trim();
  return {
    subject,
    ...(reason ? { reason } : {}),
    count: statParts(stat),
    sections: stat.sections,
    changes: made.map((each) => each.change),
    fields: [
      ...fieldsOf(input, ["files", "notes", "project", "why"]),
      ...(notes.length > 0
        ? [{ key: "from notes", value: notes.join(", ") }]
        : []),
    ],
  };
}

/** Several files' line stats as one: lines summed, sections each once in order. */
const totalOf = (made: { stat: LineStat }[]): LineStat => ({
  added: made.reduce((sum, each) => sum + each.stat.added, 0),
  removed: made.reduce((sum, each) => sum + each.stat.removed, 0),
  sections: [...new Set(made.flatMap((each) => each.stat.sections))],
});

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
  const files = Array.isArray(input.files)
    ? input.files.filter(
        (file): file is { after: string; before: string; path: string } =>
          typeof file === "object" &&
          file !== null &&
          typeof (file as { path?: unknown }).path === "string" &&
          typeof (file as { before?: unknown }).before === "string" &&
          typeof (file as { after?: unknown }).after === "string"
      )
    : [];
  const made = files.map((file) =>
    changeOf(file.path, file.before, file.after)
  );
  const stat = totalOf(made);
  const [first] = files;
  return {
    subject:
      files.length === 1 && first
        ? { verb: "Change", family: "edit", target: { name: first.path } }
        : {
            verb: "Change",
            kind: plural(files.length, "design system file"),
            family: "edit",
          },
    ...(text(input.why)?.trim() ? { reason: text(input.why)?.trim() } : {}),
    count: statParts(stat),
    sections: stat.sections,
    changes: made.map((each) => each.change),
    fields: fieldsOf(input, ["files", "project", "why"]),
  };
}

const VOWEL_FIRST = /^[aeiou]/i;

/** "an issue", "a comment": a kind with its article. */
const withArticle = (kind: string): string =>
  `${VOWEL_FIRST.test(kind) ? "an" : "a"} ${kind}`;

/**
 * A post to another person's repository held for the person (core
 * upstream-post.ts `UpstreamAskInput`): where it lands and what it is as the
 * summary, the account it posts as and its host under it, its title and
 * body as fields,
 * and the post itself, whole, as the command CawCo makes once approved.
 */
function upstreamPost(input: Record<string, unknown>): Presented {
  const kind = text(input.kind) ?? "post";
  const repo = text(input.repo) ?? "another repository";
  const account = text(input.account);
  const title = typeof input.title === "string" ? input.title : undefined;
  const body = typeof input.body === "string" ? input.body : undefined;
  const command = text(input.command);
  const host = text(input.repo)?.split("/")[0];
  const where = host === "github.com" ? "GitHub" : host;
  const href = sourceHref(repo);
  const named =
    title?.trim() ||
    body
      ?.split("\n")
      .map((line) => line.trim())
      .find(Boolean);
  return {
    subject: {
      verb: "Post",
      kind: `${withArticle(kind)} on`,
      family: "web",
      target: { name: repo, ...(href ? { href } : {}) },
    },
    post: {
      title: named ?? `Post ${withArticle(kind)} on ${repo}`,
      target: text(input.target) ?? repo,
    },
    ...(account
      ? { count: said(where ? `As ${account} on ${where}` : `As ${account}`) }
      : {}),
    ...(command ? { command } : {}),
    fields: [
      ...(title === undefined ? [] : [{ key: "title", value: title }]),
      ...(body === undefined ? [] : [{ key: "body", value: body }]),
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
    default:
      return LANDS_WORDS[change.lands];
  }
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
    subject: plainSubject(
      changes.map(projectSettingWords).join(" · ") ||
        "Change this project's settings"
    ),
    ...(detail ? { count: said(detail) } : {}),
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

const replaced = (changes: PermissionChange[]): CountPart[] => {
  const added = changes.reduce((sum, each) => sum + each.added, 0);
  const removed = changes.reduce((sum, each) => sum + each.removed, 0);
  return statParts({ added, removed, sections: [] });
};

/** A grant line on one thing named in words: a file, a pattern, a page. */
const on = (
  verb: string,
  name: string,
  family: ToolKindId,
  href?: string
): PermissionSubject => ({
  verb,
  family,
  target: { name, ...(href ? { href } : {}) },
});

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
      const changes = path ? editChanges(path, input) : [];
      return {
        subject: on("Edit", path ?? "a file", "edit"),
        ...(changes.length > 0 ? { count: replaced(changes) } : {}),
        changes,
        fields: fieldsOf(input, [...FILE_KEYS, ...EDIT_KEYS]),
      };
    }
    case "write": {
      const file = path ?? "a file";
      const content = typeof input.content === "string" ? input.content : "";
      const made = changeOf(file, "", content).change;
      return {
        subject: on("Write", file, "write"),
        count: said(
          `${plural(made.added, "line")} written; whatever the file held is replaced`
        ),
        changes: [made],
        fields: fieldsOf(input, [...FILE_KEYS, "content"]),
      };
    }
    case "read":
      return only(
        on("Read", path ?? "a file", "read"),
        fieldsOf(input, FILE_KEYS)
      );
    case "notebookedit":
      return only(
        {
          ...on(
            "Edit",
            text(input.notebook_path) ?? path ?? "(no path)",
            "notebook"
          ),
          kind: "notebook",
        },
        fieldsOf(input, ["notebook_path", ...FILE_KEYS])
      );
    // Claude Code's and pi's `bash`; OpenCode 2.0's `shell`.
    case "bash":
    case "shell":
      return shellCall(input);
    case "webfetch": {
      const url = text(input.url);
      return only(
        on(
          "Fetch",
          url ?? "a web page",
          "web",
          url && WEB_ADDRESS.test(url) ? url : undefined
        ),
        fieldsOf(input, ["url"])
      );
    }
    case "websearch":
      return only(
        plainSubject(`Search the web for “${text(input.query) ?? ""}”`, "web"),
        fieldsOf(input, ["query"])
      );
    case "glob":
      return only(
        plainSubject(
          `Find files matching ${text(input.pattern) ?? "(no pattern)"}`,
          "glob"
        ),
        fieldsOf(input, ["pattern"])
      );
    case "grep":
      return only(
        plainSubject(
          `Search files for ${text(input.pattern) ?? "(no pattern)"}`,
          "grep"
        ),
        fieldsOf(input, ["pattern"])
      );
    case "task":
    case "agent":
      return only(
        plainSubject(
          `Start a subagent: ${text(input.description) ?? "(no description)"}`,
          "task"
        ),
        fieldsOf(input, ["description"])
      );
    case "exitplanmode":
      return only(
        plainSubject("Leave plan mode and start on the plan"),
        fieldsOf(input)
      );
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
  /^'[^']+' --session --cwd-out '[^']+' '((?:[^']|'\\'')*)'; __cawco_status=\$\?; /;

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
 * A shell call, presented: "Run a command" as the grant line, the session's
 * own reason for it (`description`) as the reason, and the command whole,
 * out of a boundary's rewrite, as `command`. Every surface draws `command`
 * under the grant line, the peek and Caw's panel too, since what runs is
 * what the person approves.
 */
const shellCall = (input: Record<string, unknown>): Presented => {
  const whole = commandOf(input);
  const reason = text(input.description)?.trim();
  return {
    subject: plainSubject("Run a command", "bash"),
    ...(reason ? { reason } : {}),
    ...(whole?.trim() ? { command: whole } : {}),
    fields: fieldsOf(input, ["command", "description"]),
  };
};

/** The shell command a permission is about, said whole under the summary. */
export const commandOf = (input: Record<string, unknown>): string | null =>
  typeof input.command === "string" ? unboundedCommand(input.command) : null;

/** A browser ask reads as its reason, the page's origin under it. */
const browserAskPresented = (
  input: Record<string, unknown>,
  context: PresentationContext
): PermissionPresentation =>
  assembled(
    context,
    plainSubject(typeof input.reason === "string" ? input.reason : "", "web"),
    "",
    {
      fields:
        typeof input.origin === "string"
          ? [{ key: "origin", value: input.origin }]
          : [],
    }
  );

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
  const questions = questionsOf(toolName, input);
  if (questions) {
    return assembled(
      context,
      plainSubject(
        questions.map((question) => question.question).join(" · "),
        "question"
      ),
      ""
    );
  }
  if (toolName === BROWSER_ASK_TOOL) {
    return browserAskPresented(input, context);
  }
  const admin = CAWCO_ADMIN_WRITE.exec(toolName);
  const administered = admin ? adminWrite(admin[1], input, context) : undefined;
  const asker = askerWords(context.asker);
  let presented: Presented;
  let bound: string;
  if (
    toolName === MEMORY_PROPOSAL_TOOL ||
    toolName === DELEGATE_TYPE_PROPOSAL_TOOL ||
    toolName === DESIGN_PROPOSAL_TOOL
  ) {
    presented =
      toolName === DESIGN_PROPOSAL_TOOL
        ? designProposal(input)
        : memoryProposal(input);
    bound = "Approving writes the change shown and nothing else.";
  } else if (toolName === UPSTREAM_POST_TOOL) {
    presented = upstreamPost(input);
    const account = text(input.account);
    bound = account
      ? `Approving posts this once, as ${account}.`
      : "Approving posts this once.";
  } else if (toolName === PROJECT_SETTINGS_TOOL || administered) {
    presented = administered ?? projectSettings(input);
    bound = `Approving makes this one change. It does not let ${asker} change settings without asking.`;
  } else {
    // An MCP tool is never a harness's own, whatever it is called.
    const own = MCP_NAME.test(toolName) ? undefined : builtIn(toolName, input);
    presented =
      own ?? only(plainSubject(toolDisplayName(toolName)), fieldsOf(input));
    bound = boundOf(toolName.toLowerCase(), asker);
  }
  return assembled(context, presented.subject, bound, presented);
}

/** The asker as the bound line names it: its own name while short, else "this session". */
const askerWords = (asker: string): string =>
  asker.length > ASKER_CAP ? "this session" : asker;
const ASKER_CAP = 24;

/** What approving a harness's own call covers (WORDS.md, Permission / approval). */
const boundOf = (tool: string, asker: string): string => {
  if (tool === "bash" || tool === "shell") {
    return `Approving covers this one command. It does not widen what ${asker} may run later.`;
  }
  if (["edit", "multiedit", "write", "notebookedit"].includes(tool)) {
    return "Approving covers this one edit.";
  }
  return `Approving covers this one call. It does not widen what ${asker} may do later.`;
};

/** A presenter's words with every field a surface reads filled in. */
function assembled(
  context: PresentationContext,
  subject: PermissionSubject,
  bound: string,
  presented: Partial<Presented> = {}
): PermissionPresentation {
  const count = presented.count ?? [];
  const consequences = presented.consequences ?? [];
  return {
    asker: context.asker,
    ...(context.project ? { project: context.project } : {}),
    ...(context.projectId ? { projectId: context.projectId } : {}),
    subject,
    summary: subjectWords(subject),
    ...(presented.reason ? { reason: presented.reason } : {}),
    count,
    ...(count.length > 0 ? { detail: countWords(count) } : {}),
    changed: presented.changed ?? [],
    sections: presented.sections ?? [],
    changes: presented.changes ?? [],
    ...(presented.command ? { command: presented.command } : {}),
    consequences,
    irreversible: consequences.some((row) => row.glyph === "permanent"),
    ...(presented.caution ? { caution: presented.caution } : {}),
    fields: presented.fields ?? [],
    ...(presented.post ? { post: presented.post } : {}),
    bound,
  };
}
