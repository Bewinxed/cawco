/**
 * An agent's usability feedback on a CawCo tool (the hub's
 * `usability_feedback`, hub usability-feedback.ts), as it reaches CawCo's
 * public repository: scrubbed of what the hub knows to be private (CawCo's
 * own names kept), grouped by a fingerprint of the tool and the refusal's
 * identity ({@link feedbackFingerprint}), and written so
 * nothing in it reaches anyone on the forge (no mention, no reference, no
 * markup runs).
 *
 * A person allows it once for their fleet ({@link FeedbackConsent}); until
 * then, and while no machine is signed in to GitHub, no agent is listed the
 * tool and no refusal names it.
 */

/** CawCo's own repository, where usability feedback is filed. The hub's `CAWCO_FEEDBACK_REPO` names another, to try it without posting here. */
export const FEEDBACK_REPO = "github.com/Bewinxed/cawco";

/** The forge host feedback goes to: a machine is a sender while it signs in there. */
export const FEEDBACK_HOST = "github.com";

/** The person's answer to the consent question: null until they give one. */
export type FeedbackConsent = boolean | null;

/** What the hub answers the dashboard of feedback (`/api/usability-feedback`). */
export interface FeedbackState {
  /** The person's answer: null until they give one, so the dashboard asks. */
  consent: FeedbackConsent;
  /** Whether a machine of the fleet is signed in to GitHub, which files the issues. */
  signedIn: boolean;
}

/** What the hub knows to be private, each kind replaced by its own placeholder ({@link scrubPrivate}). */
export interface PrivateKnown {
  /** Account emails (any address-shaped text goes too). */
  readonly emails: readonly string[];
  /** Machines' home folders. */
  readonly homes: readonly string[];
  /** Machines' hostnames. */
  readonly hostnames: readonly string[];
  /** Where the hub and its previews are reached: the dashboard's host, the previews' domain. */
  readonly hosts: readonly string[];
  /** Projects, by name and each folder they hold on a machine. */
  readonly projects: readonly {
    readonly name: string;
    readonly paths: readonly string[];
  }[];
  /** The repository the reporting session works in (its folder): a path inside it stays, relative. */
  readonly repository?: string;
}

/** Each placeholder, as an issue reads it. */
const PLACEHOLDER = {
  email: "<email>",
  machine: "<machine>",
  host: "<host>",
  address: "<address>",
  project: "<project>",
  path: "<path>",
} as const;

const SPECIAL = /[.*+?^${}()|[\]\\]/gu;
const escaped = (text: string): string => text.replace(SPECIAL, "\\$&");

/** Separators at a folder's end. */
const TRAILING_SEPARATORS = /[/\\]+$/u;

/** A project name shorter than this is a common word as often as a name, so it stays. */
const NAME_MIN = 3;

/**
 * CawCo's own names, in any case: the product's (its `cawco:` link scheme
 * among them) and, beside them, its tools' ({@link scrubPrivate}'s `ours`).
 * A project or machine named one of them is not taken out by its name, so
 * an issue still reads `cawco:session/…` and `artifact_read`.
 */
const CAWCO_NAMES = ["cawco", "caw&co", "caw"] as const;

/** Address-shaped text: `someone@example.com`. */
const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/gu;
/** An IPv4 address. */
const IPV4 = /\b(?:\d{1,3}\.){3}\d{1,3}\b/gu;
/** An IPv6 address: four groups or more, or any with `::` (`fe80::1c2b`, `fd7a:115c:a1e0:ab12::1`). */
const IPV6 =
  /(?<![\w:])(?:(?:[0-9a-f]{1,4}:){3,7}[0-9a-f]{1,4}|(?:[0-9a-f]{1,4}:)*[0-9a-f]{1,4}::(?:[0-9a-f]{1,4}:)*[0-9a-f]{0,4})(?![\w:])/giu;
/** A name on a tailnet (`host.tail1234.ts.net`) or the local network (`host.local`, `host.lan`). */
const PRIVATE_NAME =
  /\b[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9-]+)*\.(?:ts\.net|local|lan|internal|home\.arpa)\b/giu;
/** A home folder of any user: `/home/name`, `/Users/name`, `C:\Users\name`. */
const ANY_HOME = /(?:\/home\/|\/Users\/|[A-Za-z]:\\Users\\)[^/\\\s"'`]+/gu;
/**
 * A path outside the repository: absolute (or from `~`), with a folder and
 * a name at least, never a URL's path (the lookbehind keeps a host or a
 * scheme in front of it out), nor the rest of one a placeholder already
 * stands for (`<path>/src/a.ts`).
 */
const PATH =
  /(?<!<path>)(?<![\w.:/~-])(?:~|[A-Za-z]:)?[/\\](?:[\w.@+-]+[/\\])+[\w.@+-]*/gu;

/** `text` with every `values` (longest first, case aside) replaced by `placeholder`. */
const replaceAll = (
  text: string,
  values: readonly string[],
  placeholder: string,
  bounded = false
): string => {
  const kept = [...new Set(values.map((value) => value.trim()))]
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);
  return kept.reduce((into, value) => {
    const pattern = bounded
      ? `(?<![\\w-])${escaped(value)}(?![\\w-])`
      : escaped(value);
    return into.replace(new RegExp(pattern, "giu"), placeholder);
  }, text);
};

/** `names` less every one of CawCo's own (`ours`, case aside): a name of CawCo's is never taken out as private. */
const notOurs = (
  names: readonly string[],
  ours: ReadonlySet<string>
): string[] => names.filter((name) => !ours.has(name.trim().toLowerCase()));

/**
 * `text` with what the hub knows to be private taken out, before it is
 * posted where anyone reads it: the repository's own folder made relative,
 * project folders and names, home folders (the reporting machines' and any
 * user's), every other path outside the repository, hostnames and the
 * hub's and previews' hosts, addresses, and emails. CawCo's own names (the
 * product's and `ours`, its tools') stay: a project or machine of that name
 * keeps it, and a name is taken out only as a whole word.
 */
export const scrubPrivate = (
  text: string,
  known: PrivateKnown,
  ours: readonly string[]
): string => {
  const kept = new Set(
    [...CAWCO_NAMES, ...ours].map((name) => name.toLowerCase())
  );
  let out = text;
  const repository = known.repository?.replace(TRAILING_SEPARATORS, "");
  if (repository) {
    out = out.replace(
      new RegExp(`${escaped(repository)}(?:[/\\\\]|(?![\\w.-]))`, "gu"),
      ""
    );
  }
  out = replaceAll(
    out,
    known.projects.flatMap((project) => project.paths),
    PLACEHOLDER.path
  );
  out = replaceAll(out, known.homes, "~");
  out = out.replace(ANY_HOME, "~");
  out = out.replace(PATH, PLACEHOLDER.path);
  out = replaceAll(out, known.emails, PLACEHOLDER.email);
  out = out.replace(EMAIL, PLACEHOLDER.email);
  out = replaceAll(out, known.hosts, PLACEHOLDER.host);
  out = out.replace(PRIVATE_NAME, PLACEHOLDER.host);
  out = replaceAll(
    out,
    notOurs(known.hostnames, kept),
    PLACEHOLDER.machine,
    true
  );
  out = out.replace(IPV4, PLACEHOLDER.address);
  out = out.replace(IPV6, PLACEHOLDER.address);
  out = replaceAll(
    out,
    notOurs(
      known.projects.map((project) => project.name),
      kept
    ).filter((name) => name.trim().length >= NAME_MIN),
    PLACEHOLDER.project,
    true
  );
  return out;
};

/** What varies between two reports of one refusal: numbers, ids, quoted values, placeholders. */
const VARYING = [
  /<[a-z]+>/gu,
  /"[^"]*"|'[^']*'|`[^`]*`|“[^”]*”/gu,
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/giu,
  /\b[a-z]+[-#_][0-9a-z]*\d[0-9a-z]*\b/giu,
  /\b[0-9a-f]{7,}\b/giu,
  /\d+(?:[.,:]\d+)*/gu,
];
const NOT_A_WORD = /[^\p{L}\p{N}#]+/gu;
/**
 * Where a refusal's first clause ends: a sentence's or a clause's mark
 * before a space or the end, a dash between spaces, a line. What
 * follows (the lists, counts and names it offers) changes between two
 * reports of one refusal.
 */
const CLAUSE_END = /[.!?;:](?=\s|$)|\s[—–-]\s|\n/u;

/** `words` with what varies between two reports of one refusal taken out, lowercased and spaced alike. */
const shapeOf = (words: string): string =>
  VARYING.reduce((into, pattern) => into.replace(pattern, "#"), words)
    .toLowerCase()
    .replace(NOT_A_WORD, " ")
    .trim();

/**
 * A refusal's first clause, shaped ({@link shapeOf}): the part that says
 * which refusal it is, the same each time it is reported (`no artifact is
 * #` of `No artifact is "cawco:session/…". Yours: …, and 978 more`).
 */
export const firstClause = (words: string): string => {
  const varied = VARYING.reduce(
    (into, pattern) => into.replace(pattern, "#"),
    words.trim()
  );
  const end = CLAUSE_END.exec(varied)?.index;
  return shapeOf(end === undefined ? varied : varied.slice(0, end));
};

/**
 * A refusal the hub sent a session: the code its problem carries
 * (`problem(status, { code, detail })`), when it carries one, and the words
 * the agent read.
 */
export interface HeardRefusal {
  readonly code?: string;
  readonly words: string;
}

/**
 * Which problem a report is about. The refusal it quotes, when `heard` holds
 * one whose first clause its words carry: the code the hub refused with,
 * or that refusal's first clause when it carried none. Else (the hub sent
 * none it quotes, as with a tool that answered and left no route) the first
 * clause of what the agent says it got. `heard` and `got` are compared
 * scrubbed alike; the newest refusal heard wins.
 */
export const refusalIdentity = (
  got: string,
  heard: readonly HeardRefusal[]
): string => {
  // Spaced at both ends, so a clause is found as whole words.
  const quoted = ` ${shapeOf(got)} `;
  for (const refusal of heard.toReversed()) {
    const clause = firstClause(refusal.words);
    if (clause && quoted.includes(` ${clause} `)) {
      return refusal.code ? `code ${refusal.code}` : `clause ${clause}`;
    }
  }
  return `clause ${firstClause(got)}`;
};

/** A fingerprint's length in hex digits. */
const FINGERPRINT_DIGITS = 12;

/** One problem's fingerprint: the tool and its {@link refusalIdentity}, hashed. */
export const feedbackFingerprint = (tool: string, identity: string): string =>
  new Bun.CryptoHasher("sha256")
    .update(`${tool}\n${identity}`)
    .digest("hex")
    .slice(0, FINGERPRINT_DIGITS);

/** The mark an issue's body carries, which a repeat finds it by. */
export const feedbackMarker = (fingerprint: string): string =>
  `<!-- cawco-feedback:${fingerprint} -->`;

/** One report, as an agent gave it, scrubbed. */
export interface FeedbackReport {
  readonly got: string;
  /** The harness the agent runs in: `claude`, `opencode`, `pi`, `codex`. */
  readonly harness: string;
  readonly tool: string;
  readonly wanted: string;
  readonly workaround?: string;
}

/** A title's most characters. GitHub takes 256; the list shows about this many. */
const TITLE_MAX = 90;
const SPACES = /\s+/gu;
const BACKTICKS = /`+/gu;

/**
 * Agent text as a fenced block a backtick longer than any run in it: shown
 * as written, and nothing in it runs (a mention, a reference, an image,
 * HTML).
 */
const fenced = (text: string): string => {
  const longest = Math.max(
    2,
    ...(text.match(BACKTICKS) ?? []).map((run) => run.length)
  );
  const fence = "`".repeat(longest + 1);
  return `${fence}text\n${text.trim()}\n${fence}`;
};

/** The issue's title: the tool, then what the agent wanted, cut at a word. */
export const feedbackTitle = (report: FeedbackReport): string => {
  const whole = `${report.tool}: ${report.wanted.replace(SPACES, " ").trim()}`;
  if (whole.length <= TITLE_MAX) {
    return whole;
  }
  const cut = whole.slice(0, TITLE_MAX - 1);
  const space = cut.lastIndexOf(" ");
  return `${space > report.tool.length + 2 ? cut.slice(0, space) : cut}…`;
};

/**
 * An issue's body, and a repeat's comment: the tool, what was wanted, what
 * came back, the workaround, the harness, then the fingerprint, seen and
 * marked, which the hub's next report of it searches for.
 */
export const feedbackBody = (
  report: FeedbackReport,
  fingerprint: string
): string =>
  [
    `**Tool:** \`${report.tool}\` · **Harness:** ${report.harness}`,
    "",
    "**Wanted**",
    "",
    fenced(report.wanted),
    "",
    "**Got**",
    "",
    fenced(report.got),
    ...(report.workaround?.trim()
      ? ["", "**Workaround**", "", fenced(report.workaround)]
      : []),
    "",
    `<sub>Filed by an agent through CawCo's usability_feedback · fingerprint ${fingerprint}</sub>`,
    feedbackMarker(fingerprint),
  ].join("\n");
