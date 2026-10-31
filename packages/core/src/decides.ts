/**
 * Who decides (PRD §5.8): a choice an agent can't make alone is a decision
 * card with a kind, and the hub settles it by the member Who decides names
 * for that kind: the project's table (`decides.md` in its hub folder, hub
 * decides-file.ts) over the fleet's. Members and kinds are fleet-wide. The
 * five built-in members are constants here ({@link BUILT_IN}); the members
 * the person adds and every kind are rows at the hub (`decides_members`,
 * `decides_kinds`). A card with no kind is the person's.
 *
 * A settled card's pick is signed by its member (choices.ts `SettledBy`); a
 * pick by the person is his, its why his note.
 */
import type { SettledBy } from "./choices";
import { unhandled } from "./unhandled";
import { decidesWords } from "./words/decides";

/** Who decides a kind. The five built in are constants; the rest are rows. */
export type MemberType =
  | "you"
  | "caw"
  | "advisor"
  | "practice"
  | "asker"
  | "agent"
  | "person"
  | "channel";
export const BUILT_IN_MEMBERS = [
  "you",
  "caw",
  "advisor",
  "practice",
  "asker",
] as const;
export type BuiltInMember = (typeof BUILT_IN_MEMBERS)[number];
/** The members with a picture of Caw's flock: every built-in but You. */
export type FlockMember = Exclude<BuiltInMember, "you">;
/** How he hears about a member's answers: a push each time, or the catch-up. */
export const HEARS = ["each", "later"] as const;
export type Hear = (typeof HEARS)[number];

/**
 * Caw's poses a flock member may wear: each its `.riv` file (the dashboard's
 * `lib/assets/caw/`) and the box, in artboard units, framing his head and
 * what he holds (`[x, y, side]`).
 */
export const CAW_POSES = [
  { id: "ready", name: "Ready", file: "ready", box: [90, 110, 450] },
  { id: "idle", name: "Idle", file: "idle", box: [110, 70, 400] },
  { id: "asleep", name: "Asleep", file: "sleeping", box: [130, 140, 400] },
  { id: "head", name: "Head", file: "compacted", box: [44, 50, 520] },
  { id: "smiling", name: "Smiling", file: "head-smile", box: [44, 40, 520] },
  {
    id: "chart",
    name: "With a chart",
    file: "template-seo",
    box: [123, 106, 420],
  },
  {
    id: "sheets",
    name: "With reference sheets",
    file: "template-brand",
    box: [147, 93, 456],
  },
  {
    id: "easel",
    name: "At an easel",
    file: "template-design",
    box: [80, 130, 490],
  },
  {
    id: "laptop",
    name: "With a laptop",
    file: "template-code",
    box: [76, 110, 490],
  },
  {
    id: "rocket",
    name: "With a rocket",
    file: "template-launch",
    box: [60, 24, 540],
  },
  {
    id: "heart",
    name: "With a heart",
    file: "template-social",
    box: [100, 150, 470],
  },
  { id: "working", name: "At work", file: "working", box: [70, 140, 470] },
  { id: "done", name: "Done", file: "done", box: [76, 130, 440] },
  {
    id: "trying",
    name: "Against the wind",
    file: "trying",
    box: [70, 120, 470],
  },
] as const;
export type CawPoseId = (typeof CAW_POSES)[number]["id"];
export const CAW_POSE_IDS = CAW_POSES.map((pose) => pose.id) as [
  CawPoseId,
  ...CawPoseId[],
];

/** One member of Who decides: built in, or one he added. */
export interface Member {
  /** `you`, `caw`, `advisor`, `practice`, `asker`, or the slug of a member he added (a delegate type's name). */
  builtIn: boolean;
  /** An agent (built-in Advisor and Common practice included): the fleet delegate type it runs as. */
  delegateType: string | null;
  /** How he hears about its answers; null for You, Caw and The agent, which have none. */
  hear: Hear | null;
  /** One of the eight identity marks (1–8); null for Caw's flock and You. */
  hue: number | null;
  id: string;
  /** One line under the name: what it does with a decision. */
  job: string;
  name: string;
  /** Caw's flock: the pose it wears; null for the rest. */
  pose: CawPoseId | null;
  /** A person or channel: how it is reached. Null until that slice. */
  reach: {
    address: string;
    via: "slack" | "email";
    wait: "4h" | "1d" | "wait";
  } | null;
  /** In a sentence: "Roost iOS sends scope to the advisor". */
  subject: string;
  type: MemberType;
}

/** A kind of choice: built in, or one he added. */
export interface Kind {
  builtIn: boolean;
  /** The one line agents read to file a choice. */
  example: string;
  /** `look`, `behaviour`, `scope`, `approach`, `rules`, `tools`, or the slug of one he added. */
  id: string;
  name: string;
  position: number;
}

/** The fleet's Who decides, whole: what `GET /api/decides` answers and the dashboard holds. */
export interface FleetDecides {
  kinds: Kind[];
  members: Member[];
  /** Caw's chosen pose, and each flock member's; absent: the default pose. */
  pictures: Partial<Record<FlockMember, CawPoseId>>;
  /** Every kind's member across the fleet, by kind id. */
  routes: Record<string, string>;
}

/** A project's table as the hub reads it. */
export interface DecidesTable {
  from: Record<string, "project" | "fleet">;
  /** decides.md's problems; the table is then every kind → `you`. */
  problems: string[];
  routes: Record<string, string>;
  /** Paths whose change needs a card the person picked (enforced later); empty when none. */
  yours: string[];
}

/** What a project's decides.md sets itself: the kinds it hands to a member, and its own paths. */
export interface DecidesOwn {
  /** Kind id → member id. */
  routes: Record<string, string>;
  yours: string[];
}

/** The six kinds every fleet starts with, in the order they are listed. */
export const BUILT_IN_KINDS = [
  "look",
  "behaviour",
  "scope",
  "approach",
  "rules",
  "tools",
] as const;
export type BuiltInKind = (typeof BUILT_IN_KINDS)[number];
/** A kind's id: a built-in one or the slug of one he added. */
export type DecisionKind = string;

/** The kinds' seed rows. */
export const KIND_SEED: Kind[] = BUILT_IN_KINDS.map((id, position) => ({
  id,
  name: decidesWords.kinds[id].name,
  example: decidesWords.kinds[id].example,
  builtIn: true,
  position,
}));

/** The fleet routes' seed: where each built-in kind goes until he says. */
export const DEFAULT_ROUTES: Record<BuiltInKind, BuiltInMember> = {
  look: "you",
  behaviour: "you",
  scope: "you",
  approach: "advisor",
  rules: "advisor",
  tools: "practice",
};

/** Each flock member's pose until he picks one. */
export const DEFAULT_POSES: Record<FlockMember, CawPoseId> = {
  caw: "ready",
  advisor: "chart",
  practice: "sheets",
  asker: "working",
};

const builtIn = (
  id: BuiltInMember,
  rest: Pick<Member, "delegateType" | "hear">
): Member => ({
  id,
  type: id,
  ...decidesWords[id],
  builtIn: true,
  hue: null,
  pose: id === "you" ? null : DEFAULT_POSES[id],
  reach: null,
  ...rest,
});

/** The built-in members as they stand until he changes them (the hub overlays `decides_settings`). */
export const BUILT_IN: Record<BuiltInMember, Member> = {
  you: builtIn("you", { delegateType: null, hear: null }),
  caw: builtIn("caw", { delegateType: null, hear: null }),
  advisor: builtIn("advisor", { delegateType: "advisor", hear: "each" }),
  practice: builtIn("practice", { delegateType: "research", hear: "later" }),
  asker: builtIn("asker", { delegateType: null, hear: null }),
};

/** A member's or kind's id: lowercase, digits and dashes, a letter first (a delegate type's name). */
export const DECIDES_ID = /^[a-z][a-z0-9-]{0,62}$/u;
const NOT_SLUG = /[^a-z0-9]+/gu;
const EDGE_DASHES = /^-+|-+$/gu;
const LEADING_DIGITS = /^[0-9-]+/u;

/** A name as its id: "Release checker" → `release-checker`; "" when nothing is left. */
export const slugOf = (name: string): string =>
  name
    .normalize("NFKD")
    .toLowerCase()
    .replace(NOT_SLUG, "-")
    .replace(EDGE_DASHES, "")
    .replace(LEADING_DIGITS, "")
    .slice(0, 63)
    .replace(EDGE_DASHES, "");

/** The member `id` names among `fleet`'s, undefined when none. */
export const memberOf = (
  fleet: Pick<FleetDecides, "members">,
  id: string
): Member | undefined => fleet.members.find((member) => member.id === id);

/** The kind `id` names among `fleet`'s, undefined when none. */
export const kindOf = (
  fleet: Pick<FleetDecides, "kinds">,
  id: string | null
): Kind | undefined =>
  id === null ? undefined : fleet.kinds.find((kind) => kind.id === id);

/** A kind's name as a line says it; a card with none says so. */
export const kindName = (
  fleet: Pick<FleetDecides, "kinds">,
  id: string | null
): string => kindOf(fleet, id)?.name ?? id ?? decidesWords.noKind;

/** One sentence every session is told: what CawCo's MCP instructions and the decision-page skill say. */
export const DECIDES_RULE =
  "A choice that is not yours to make is a decision card with its kind; wait on the card — the hub settles it by the project's Who decides. A choice already made stays made: before a card, search for it with find (in a project, its decided pages' logs are decisions/<page>/log.md, by folder_read) and apply what you find.";

/** The fleet's kinds as every session's instructions list them: `Kinds: look (layout, copy, …) · …`. */
export const kindsLine = (kinds: readonly Kind[]): string =>
  decidesWords.kindsLine(
    kinds.map((kind) => `${kind.id} (${kind.example})`).join(" · ")
  );

/**
 * A member's answer in words: "Decided by Advisor · Claude Code · Opus 5.5
 * · why · 2 sources"; the person's own pick says nothing more than it does.
 */
export const decidedByLine = (
  settled: Pick<SettledBy, "name" | "runs" | "sources" | "why">
): string =>
  [
    decidesWords.decidedBy(settled.name, settled.runs),
    settled.why,
    ...(settled.sources.length > 0
      ? [decidesWords.sources(settled.sources.length)]
      : []),
  ].join(" · ");

/** How a card's member stands for its writer's line: on it, could not start, settled by the writer, the person's, or unreachable. */
export type RouteState =
  | { state: "you" }
  | { state: "asker" }
  | { state: "running" }
  | { state: "failed"; why: string }
  | { state: "unreachable"; reason: string };

/** Where a card goes, said to the session that wrote it, after the card's link (one line per card). */
export const routeLine = (
  kind: string,
  member: string,
  where: "project" | "fleet",
  state: RouteState
): string => {
  const here = decidesWords.here(where === "project");
  switch (state.state) {
    case "you":
      return decidesWords.routedYou(kind, here);
    case "asker":
      return decidesWords.routedAsker(kind, here);
    case "failed":
      return decidesWords.routedFailed(kind, member, here, state.why);
    case "unreachable":
      return decidesWords.routedUnreachable(kind, member, here, state.reason);
    case "running":
      return decidesWords.routedMember(kind, member, here);
    default:
      return unhandled("route state", state);
  }
};

const DECIDES_FENCE = /^---\s*$/u;
const DECIDES_LINES = /\r?\n/u;
const INDENTED = /^\s/u;
const LINE = /^([^:]+):\s*(.*)$/u;
const LEADING = /^\.\//u;
/** The asker's name in a decides.md written before members: read as `asker`. */
const ASKER_ALIAS = "agent";

/** decides.md's block lines and what stood after it; no block, undefined. */
const decidesBlock = (
  content: string
): { block: string[] | undefined; notes: string } => {
  const lines = content.split(DECIDES_LINES);
  const start = lines.findIndex((line) => line.trim() !== "");
  const end =
    start >= 0 && DECIDES_FENCE.test(lines[start] ?? "")
      ? lines.findIndex((line, at) => at > start && DECIDES_FENCE.test(line))
      : -1;
  return end < 0
    ? { block: undefined, notes: content.trim() }
    : {
        block: lines.slice(start + 1, end),
        notes: lines
          .slice(end + 1)
          .join("\n")
          .trim(),
      };
};

/** What reading decides.md answers: the kinds it hands over and its own paths; or every problem it has. */
export type DecidesReading =
  | { ok: true; routes: Record<string, string>; yours: string[] }
  | { ok: false; problems: string[] };

/** What reading the block holds so far. */
interface BlockRead {
  /** The indented lines now are `Yours:` paths. */
  inYours: boolean;
  problems: string[];
  routes: Record<string, string>;
  yours?: string[];
}

/** One `Yours:` path as the diff names paths: from the repository's root. */
const yoursPath = (raw: string): { path: string } | { problem: string } => {
  const path = raw.trim().replace(LEADING, "");
  if (path.startsWith("/")) {
    return {
      problem: `Yours: ${path} is absolute; name it from the repository's root, like DESIGN.md.`,
    };
  }
  if (path.split("/").includes("..")) {
    return {
      problem: `Yours: ${path} climbs out of the repository with “..”.`,
    };
  }
  return { path };
};

/** One line at the margin: a kind's member, or `Yours:`. */
const marginLine = (
  read: BlockRead,
  text: string,
  fleet: Pick<FleetDecides, "kinds" | "members">
): void => {
  read.inYours = false;
  const line = LINE.exec(text);
  const name = line?.[1]?.trim() ?? "";
  const value = line?.[2]?.trim() ?? "";
  if (!line) {
    read.problems.push(
      `“${text}” is not a line of decides.md: a kind and its member (Approach: advisor), or Yours:.`
    );
    return;
  }
  if (name.toLowerCase() === "yours") {
    if (read.yours) {
      read.problems.push("Yours: is given twice; list every path under one.");
    } else if (value) {
      read.problems.push(
        `Yours: takes its paths on the indented lines under it, one each, not “${value}” beside it.`
      );
    }
    read.yours ??= [];
    read.inYours = true;
    return;
  }
  const kind = fleet.kinds.find(
    (each) => each.name.toLowerCase() === name.toLowerCase()
  );
  if (!kind) {
    read.problems.push(
      `“${name}” is not a kind; the kinds are ${fleet.kinds.map((each) => each.name).join(", ")}.`
    );
    return;
  }
  const said = value.toLowerCase();
  const id = said === ASKER_ALIAS ? "asker" : said;
  if (read.routes[kind.id] !== undefined) {
    read.problems.push(`${kind.name} is given twice.`);
  } else if (memberOf(fleet, id)) {
    read.routes[kind.id] = id;
  } else {
    read.problems.push(
      `“${value}” is not a member; a kind goes to ${fleet.members.map((member) => member.id).join(", ")}.`
    );
  }
};

/**
 * decides.md's block as the kinds it hands over and its paths, or every
 * problem it has: a kind's line is its name (any case) and a member's id;
 * `agent`, the asker's name before members, reads as `asker`. `Yours:`
 * opens the paths, one per indented line.
 */
export const readDecides = (
  content: string,
  fleet: Pick<FleetDecides, "kinds" | "members">
): DecidesReading => {
  const { block } = decidesBlock(content);
  if (!block) {
    return {
      ok: false,
      problems: [
        "decides.md holds no block: its lines go between a --- line and the next --- line.",
      ],
    };
  }
  const read: BlockRead = { inYours: false, problems: [], routes: {} };
  for (const line of block) {
    const text = line.trim();
    if (!text || text.startsWith("#")) {
      continue;
    }
    if (!INDENTED.test(line)) {
      marginLine(read, text, fleet);
    } else if (read.inYours) {
      const path = yoursPath(text);
      if ("problem" in path) {
        read.problems.push(path.problem);
      } else {
        read.yours?.push(path.path);
      }
    } else {
      read.problems.push(
        `“${text}” is indented outside Yours:; only Yours: takes lines under it.`
      );
    }
  }
  return read.problems.length > 0
    ? { ok: false, problems: read.problems }
    : { ok: true, routes: read.routes, yours: read.yours ?? [] };
};

/** Why `content` may not be a project's decides.md, every reason; empty when it may. The one check every write of it passes. */
export const decidesFileProblems = (
  content: string,
  fleet: Pick<FleetDecides, "kinds" | "members">
): string[] => {
  const reading = readDecides(content, fleet);
  return reading.ok ? [] : reading.problems;
};

/**
 * decides.md with `own` as its block: each kind it hands over in the kinds'
 * order, then `Yours:` and its paths. What stood after the block in `was`
 * (notes for people) is kept; a file with no block takes one at its head.
 */
export const decidesFileOf = (
  own: DecidesOwn,
  kinds: readonly Kind[],
  was: string | null
): string => {
  const block = [
    "---",
    ...kinds.flatMap((kind) => {
      const member = own.routes[kind.id];
      return member ? [`${kind.name}: ${member}`] : [];
    }),
    ...(own.yours.length > 0
      ? ["Yours:", ...own.yours.map((path) => `  ${path}`)]
      : []),
    "---",
  ].join("\n");
  const { notes } = decidesBlock(was ?? "");
  return notes ? `${block}\n${notes}\n` : `${block}\n`;
};
