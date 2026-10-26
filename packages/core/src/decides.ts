/**
 * Who decides (PRD §5.8): a choice an agent can't make alone is a decision
 * card with a kind, and the hub settles it by the project's Who decides
 * table (`decides.md` in its hub folder, hub decides-file.ts), else the
 * fleet's, else {@link DEFAULT_ROUTES}. Each kind routes to the person, an
 * advisor, common practice, or the agent that wrote the card. A card with
 * no kind is the person's.
 *
 * A settled card's pick says who made it, why and its sources (choices.ts
 * `SettledBy`); a pick by the person is his, its why his note.
 */

/** The kinds a card may carry, in the order the table lists them. */
export const DECISION_KINDS = [
  "look",
  "behaviour",
  "scope",
  "approach",
  "rules",
  "tools",
] as const;
export type DecisionKind = (typeof DECISION_KINDS)[number];

/** Who settles a kind: the person, an advisor, common practice, or the agent that wrote the card. */
export const DECIDES_ROUTES = ["you", "advisor", "practice", "agent"] as const;
export type DecidesRoute = (typeof DECIDES_ROUTES)[number];

/** Each kind's name in decides.md and in words, and the one-line example an agent and the table read. */
export const DECISION_KIND_WORDS: Record<
  DecisionKind,
  { example: string; name: string }
> = {
  look: {
    name: "Look and words",
    example: "layout, copy, colour, motion, a name on screen",
  },
  behaviour: {
    name: "Behaviour",
    example:
      "what the product or the fleet does: a flow, a notice, a rule for agents",
  },
  scope: {
    name: "Scope",
    example: "how much to cut or defer against the brief",
  },
  approach: {
    name: "Approach",
    example: "how it is built when several ways meet the brief",
  },
  rules: {
    name: "Rules and checks",
    example:
      "a lint rule off, a suppression, a check skipped, a design deviation accepted",
  },
  tools: {
    name: "Tools and conventions",
    example: "a library, a version, a format, a config value, a name in code",
  },
};

/** Where each kind goes when neither the project nor the fleet says. */
export const DEFAULT_ROUTES: Record<DecisionKind, DecidesRoute> = {
  look: "you",
  behaviour: "you",
  scope: "you",
  approach: "advisor",
  rules: "advisor",
  tools: "practice",
};

/** The delegate type an advisor runs as when neither the project nor the fleet names one. */
export const DEFAULT_ADVISOR = "advisor";

/** The delegate type common practice runs as: it reads the web, and its pick must cite. */
export const PRACTICE_TYPE = "research";

/** The fleet's Who decides: each kind it routes, and its advisor type; what it leaves out is {@link DEFAULT_ROUTES}'s. */
export interface FleetDecides {
  advisor: string | null;
  routes: Partial<Record<DecisionKind, DecidesRoute>>;
}

/** A project's Who decides as the hub reads it: every kind routed, where each came from, its advisor and its own paths. */
export interface DecidesTable {
  /** The delegate type an advisor runs as. */
  advisor: string;
  /** Where each kind's route came from. */
  from: Record<DecisionKind, "project" | "fleet" | "default">;
  /** Problems in decides.md; the table then is the fleet's. */
  problems: string[];
  routes: Record<DecisionKind, DecidesRoute>;
  /** Paths whose change needs a card the person picked (enforced later); empty when none. */
  yours: string[];
}

/** A kind by its name in decides.md, any case; undefined when it names none. */
export const kindNamed = (name: string): DecisionKind | undefined =>
  DECISION_KINDS.find(
    (kind) =>
      DECISION_KIND_WORDS[kind].name.toLowerCase() === name.trim().toLowerCase()
  );

/** One sentence every session is told: what CawCo's MCP instructions and the decision-page skill say. */
export const DECIDES_RULE =
  "A choice that is not yours to make is a decision card with its kind; wait on the card — the hub settles it by the project's Who decides.";

const SETTLERS: Record<Exclude<DecidesRoute, "you">, string> = {
  advisor: "the advisor",
  practice: "common practice",
  agent: "the agent",
};

/**
 * A settled pick in words: "Decided by the advisor · why · 2 sources"; the
 * person's own pick says nothing more than it does today.
 */
export const decidedByLine = (settled: {
  by: Exclude<DecidesRoute, "you">;
  sources: readonly string[];
  why: string;
}): string =>
  [
    `Decided by ${SETTLERS[settled.by]}`,
    settled.why,
    ...(settled.sources.length > 0
      ? [
          `${settled.sources.length} ${settled.sources.length === 1 ? "source" : "sources"}`,
        ]
      : []),
  ].join(" · ");

/** Where a card goes, said to the session that wrote it, after the card's link (one line per card). */
export const routeLine = (
  kind: DecisionKind | null,
  route: DecidesRoute,
  where: "project" | "fleet",
  started: { failed: string } | "started" | "running" | null
): string => {
  const name = kind ? DECISION_KIND_WORDS[kind].name : "A card with no kind";
  const here = where === "project" ? "on this project" : "in this fleet";
  if (route === "you") {
    return `${name} is his ${here}: the card waits on him.`;
  }
  if (route === "agent") {
    return `${name} is yours to decide ${here}: call settle on the card with your why.`;
  }
  const who = route === "advisor" ? "an advisor" : "common practice";
  return started && typeof started === "object"
    ? `${name} goes to ${who} ${here}, but none could start: ${started.failed} The card stays open; update the page to try again.`
    : `${name} goes to ${who} ${here}: one is on it; wait on the card.`;
};

/** Why `settle` is refused on a card the person decides, in one sentence. */
export const settleYours = (
  kind: DecisionKind | null,
  where: "project" | "fleet"
): string =>
  `${kind ? DECISION_KIND_WORDS[kind].name : "A card with no kind"} is his ${where === "project" ? "on this project" : "in this fleet"}: only he picks it, and the card waits on him.`;

/** Each route as Who decides names it: its segment's label, and in a line of the table's summary. */
export const ROUTE_WORDS: Record<
  DecidesRoute,
  { label: string; line: string }
> = {
  you: { label: "You", line: "you" },
  advisor: { label: "An advisor", line: "an advisor" },
  practice: { label: "Common practice", line: "common practice" },
  agent: { label: "The agent", line: "the agent" },
};

/** Each kind's route where the fleet's table says nothing, core's default. */
export const fleetRoutes = (
  fleet: FleetDecides
): Record<DecisionKind, DecidesRoute> =>
  Object.fromEntries(
    DECISION_KINDS.map((kind) => [
      kind,
      fleet.routes[kind] ?? DEFAULT_ROUTES[kind],
    ])
  ) as Record<DecisionKind, DecidesRoute>;

/**
 * A table in one line, its kinds grouped by route in the routes' order:
 * "Look and words, Behaviour, Scope: you · Approach, Rules and checks: an
 * advisor · Tools and conventions: common practice".
 */
export const decidesSummary = (
  routes: Record<DecisionKind, DecidesRoute>
): string =>
  DECIDES_ROUTES.flatMap((route) => {
    const kinds = DECISION_KINDS.filter((kind) => routes[kind] === route);
    return kinds.length > 0
      ? [
          `${kinds.map((kind) => DECISION_KIND_WORDS[kind].name).join(", ")}: ${ROUTE_WORDS[route].line}`,
        ]
      : [];
  }).join(" · ");

/** What a project's decides.md sets itself: the kinds it routes, its advisor, its own paths. */
export interface DecidesOwn {
  advisor: string | null;
  routes: Partial<Record<DecisionKind, DecidesRoute>>;
  yours: string[];
}

const DECIDES_FENCE = /^---\s*$/u;
const DECIDES_LINES = /\r?\n/u;

/**
 * decides.md with `own` as its block (hub decides-file.ts reads it): the
 * kinds it routes in the table's order, `Advisor:`, then `Yours:` and its
 * paths. What stood after the block in `was` (notes for people) is kept; a
 * file with no block takes one at its head.
 */
export const decidesFileOf = (own: DecidesOwn, was: string | null): string => {
  const block = [
    "---",
    ...DECISION_KINDS.flatMap((kind) => {
      const route = own.routes[kind];
      return route ? [`${DECISION_KIND_WORDS[kind].name}: ${route}`] : [];
    }),
    ...(own.advisor ? [`Advisor: ${own.advisor}`] : []),
    ...(own.yours.length > 0
      ? ["Yours:", ...own.yours.map((path) => `  ${path}`)]
      : []),
    "---",
  ].join("\n");
  const lines = (was ?? "").split(DECIDES_LINES);
  const start = lines.findIndex((line) => line.trim() !== "");
  const end =
    start >= 0 && DECIDES_FENCE.test(lines[start] ?? "")
      ? lines.findIndex((line, at) => at > start && DECIDES_FENCE.test(line))
      : -1;
  const notes = (end >= 0 ? lines.slice(end + 1) : lines).join("\n").trim();
  return notes ? `${block}\n${notes}\n` : `${block}\n`;
};
