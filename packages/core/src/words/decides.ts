/**
 * Who decides' words (core decides.ts): the built-in members and kinds as
 * they are named, the hub's routed lines, signatures, unreachable reasons
 * and refusals. The page's own words join this object with it (build spec
 * §3.8). Said by the hub and the dashboard only: the app draws none of it,
 * so it is not written into it (scripts/words-swift.ts).
 */
import { andList } from "./helpers";

export const decidesWords = {
  // ── The built-in members ────────────────────────────────────────────────
  /** Each built-in member's name, its job (the line under the name) and its subject (in a sentence). */
  you: {
    name: "You",
    job: "Decides it yourself: the card waits on you.",
    subject: "you",
  },
  caw: {
    name: "Caw",
    job: "Leads the project and settles it in its conversation.",
    subject: "Caw",
  },
  advisor: {
    name: "Advisor",
    job: "Reads the code, the docs and the brief, then picks.",
    subject: "the advisor",
  },
  practice: {
    name: "Common practice",
    job: "Picks what established practice does and names at least one source.",
    subject: "common practice",
  },
  asker: {
    name: "The agent",
    job: "The session that asked settles it itself.",
    subject: "the agent that asked",
  },

  // ── The built-in kinds (the seed of `decides_kinds`) ────────────────────
  kinds: {
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
  },
  /** A card filed under no kind, as a routed line names it. */
  noKind: "A card with no kind",

  // ── Where a card goes, said to the session that wrote it ────────────────
  /** "on this project" or "in this fleet". */
  here: (project: boolean) => (project ? "on this project" : "in this fleet"),
  /** A kind that is the person's. */
  routedYou: (kind: string, here: string) =>
    `${kind} is his ${here}: the card waits on him.`,
  /** A kind the writer settles. */
  routedAsker: (kind: string, here: string) =>
    `${kind} is yours to decide ${here}: call settle on the card with your why.`,
  /** A kind a member is on. */
  routedMember: (kind: string, member: string, here: string) =>
    `${kind} goes to ${member} ${here}: one is on it; wait on the card.`,
  /** A kind whose member could not start. */
  routedFailed: (kind: string, member: string, here: string, why: string) =>
    `${kind} goes to ${member} ${here}, but none could start: ${why} The card stays open; update the page to try again.`,
  /** A kind whose member can't be reached: the card came to him. */
  routedUnreachable: (
    kind: string,
    member: string,
    here: string,
    reason: string
  ) =>
    `${kind} goes to ${member} ${here}, but ${reason}, so the card waits on him.`,
  /** decides.md doesn't read: every kind is his until it does. */
  fileProblems: (problems: string) => `decides.md doesn't read: ${problems}`,

  // ── Why a member can't be reached (lower case: the routed line and the signature open it) ──
  /** A person or channel member: no connection carries a question yet. */
  unreachable: (name: string) =>
    `${name} can't be reached until Slack or email is connected`,
  /** An agent member whose harness is on no online machine. */
  cantRun: (name: string, harness: string) =>
    `${name} can't run: ${harness} is on no machine`,
  /** Caw, while his lead switch is off for the project. */
  notLeading: (project: string) => `Caw isn't leading ${project}`,
  /** Caw, for a card in no project. */
  noProject: "Caw leads projects only, and this card is in none",

  // ── Signatures ──────────────────────────────────────────────────────────
  /** A member's answer: "Decided by Advisor · Claude Code · Opus 5.5". */
  decidedBy: (name: string, runs: string | null) =>
    runs ? `Decided by ${name} · ${runs}` : `Decided by ${name}`,
  /** "2 sources". */
  sources: (count: number) => `${count} ${count === 1 ? "source" : "sources"}`,
  /** A card that came to him, and why. */
  cameToYou: (reason: string) => `Came to you · ${reason}.`,
  /** Caw's runs-on line: "Claude Code · Opus 5.5 · leads Roost iOS". */
  leads: (runs: string, project: string) => `${runs} · leads ${project}`,

  // ── Settling ────────────────────────────────────────────────────────────
  /** Why `settle` is refused on a card the person decides. */
  settleYours: (kind: string, here: string) =>
    `${kind} is his ${here}: only he picks it, and the card waits on him.`,
  /** Why `settle` is refused to anyone but the card's writer. */
  settleAsker: (kind: string, writer: string) =>
    `${kind} is the agent's to decide here, and only the session that wrote the card settles it${writer ? `: ${writer}` : ""}.`,
  /** Why `settle` is refused to anyone but the member's session. */
  settleMember: (kind: string, member: string) =>
    `${kind} goes to ${member} here: only ${member}'s session for this card settles it; wait on the card.`,
  /** Common practice settles with no https source. */
  practiceCites:
    "Common practice cites: name at least one https link in sources.",
  /** The push for a member's answer: its title. */
  pushTitle: (member: string, question: string) =>
    `${member} decided: ${question}`,
  /** Its visible body, under the member's name: what it did. */
  pushShown: "Decided a card",
  /** Its body: the pick's label and why. */
  pushBody: (label: string, why: string) => `${label}. ${why}`,

  // ── Refusals ────────────────────────────────────────────────────────────
  unknownKind: (name: string) => `“${name}” is not a kind of choice here.`,
  unknownMember: (name: string) => `“${name}” is not a member of Who decides.`,
  builtInKind: "A built-in kind can be renamed but not removed.",
  builtInMember: "A built-in member can't be removed.",
  cawRunsOn:
    "Caw's harness and model are the project's: change them in the project's Caw settings.",
  nameMissing: "Give it a name; it's shown on every decision it makes.",
  nameTaken: (name: string) => `There's already a member called ${name}.`,
  kindTaken: (name: string) => `There's already a kind called ${name}.`,
  noMachine: (harness: string) => `${harness} is on no machine yet.`,
  moveToSelf: "Move its decisions to another kind.",
  instructionsMissing:
    "Give it standing instructions: what it reads before every decision.",
  kindFields:
    "Give the kind a name and the line agents read to file a choice under it.",
  wearsMark: (name: string) =>
    `${name} wears an identity mark, not one of Caw's poses.`,
  wearsPose: (name: string) =>
    `${name} wears one of Caw's poses, not an identity mark.`,
  fileUnread: (problems: string) =>
    `decides.md doesn't read, so it was not changed: ${problems}`,
  /** A member removed: the decides.md commit. */
  removedCommit: (name: string, kinds: readonly string[]) =>
    `${name} removed: ${andList(kinds.map((kind) => kind.toLowerCase()))} ${kinds.length === 1 ? "comes" : "come"} back to you`,
  /** A kind removed: the decides.md commit. */
  kindRemovedCommit: (name: string) => `${name} removed from Who decides`,
  /** The project's table written from the page. */
  tableCommit: "Who decides changed",
  /** The kinds line appended to every session's instructions. */
  kindsLine: (kinds: string) => `Kinds: ${kinds}.`,
  /** A decision card for Caw: the event's trigger. */
  decisionTrigger: (page: string) => `a decision card on ${page} is yours`,

  // ── The page's words: the roster, its tiles and the hand-over ───────────
  /** A member's card with no kind. */
  holdsNothing: (project: string) => `Holds nothing in ${project}.`,
  /** A kind's tile, as its control is named. */
  handOverKind: (kind: string) => `Hand over ${kind}`,
  /** The tile's press, in its tooltip. */
  handOver: "Hand over",
  /** A kind following the fleet, in its scope glyph's tooltip. */
  followsFleetTip: (subject: string) =>
    `Follows the fleet, which sends it to ${subject}`,
  /** A kind this project set itself, in its scope glyph's tooltip. */
  ownTip: (project: string, subject: string) =>
    `${project}'s own. The fleet sends it to ${subject}`,
  /** A project's own kind, its way back. */
  giveBack: "Give it back to the fleet's choice",
  /** The hand-over's head. */
  handTo: (kind: string) =>
    `Hand ${kind.toLowerCase()} to, for choices raised from now on`,
  /** The member the fleet names for this kind, at the end of its row. */
  fleetsChoice: "Fleet's choice",
};
