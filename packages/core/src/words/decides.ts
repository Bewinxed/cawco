/**
 * Who decides' words (core decides.ts): the built-in members and kinds as
 * they are named, the hub's routed lines, signatures, unreachable reasons
 * and refusals. The page's own words join this object with it (build spec
 * §3.8). Said by the hub and the dashboard only: the app draws none of it,
 * so it is not written into it (scripts/words-swift.ts).
 */
import type { RouteWhere } from "../decides";
import { andList } from "./helpers";

/** A removed member's kinds, coming back to him. */
const kindsBack = (kinds: readonly string[]): string => {
  if (kinds.length === 0) {
    return "";
  }
  if (kinds.length === 1) {
    return `Its one kind, ${kinds[0]}, comes back to you.`;
  }
  return `Its ${kinds.length} kinds, ${andList(kinds)}, come back to you.`;
};

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
    name: "The agent that asked",
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
  /** Where a card's route was read: "on this project", "in this fleet", or a project's setup page, whose cards are his whatever the table says. */
  here: (where: RouteWhere) =>
    ({
      project: "on this project",
      fleet: "in this fleet",
      setup: "on the project's setup page",
    })[where],
  /** A card picked before its route was read. */
  decidedAlready: "decided already.",
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
  /** decides.md can't be read: every kind is his until it does. */
  fileProblems: (problems: string) =>
    `decides.md can't be read: ${problems} Every kind comes to you until it's fixed.`,

  // ── Why a member can't be reached (lower case: the routed line and the signature open it) ──
  /** A person or channel member: no connection carries a question yet. */
  unreachable: (name: string) =>
    `${name} can't be reached until Slack or email is connected`,
  /** An agent member whose harness is on no online machine. */
  cantRun: (name: string, harness: string) =>
    `${name} can't run: no online machine has ${harness}`,
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
  nameMissing: "Give it a name.",
  nameTaken: (name: string) => `There's already a member called ${name}.`,
  kindTaken: (name: string) => `There's already a kind called ${name}.`,
  noMachine: (harness: string) => `${harness} is on no machine yet.`,
  moveToSelf: "Move its decisions to another kind.",
  instructionsMissing: "Give it instructions.",
  kindFields:
    "Give the kind a name and the line agents read to file a choice under it.",
  wearsMark: (name: string) =>
    `${name} wears an identity mark, not one of Caw's poses.`,
  wearsPose: (name: string) =>
    `${name} wears one of Caw's poses, not an identity mark.`,
  fileUnread: (problems: string) =>
    `decides.md can't be read, so it was not changed: ${problems}`,
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
  /** A project's own kind, its way back. */
  giveBack: "Follow the fleet",
  /** The member the fleet names for this kind, at the end of its row. */
  fleetsChoice: "Fleet's choice",
  /** A hand-over the hub is writing, said to a screen reader. */
  handing: (kind: string, member: string) => `Handing ${kind} to ${member}…`,
  /** A put-back the hub is writing, said to a screen reader. */
  givingBack: (kinds: readonly string[]) =>
    `Giving ${andList(kinds)} back to the fleet's choice…`,
  /** A project's hand-over, as its decides.md commit says it. */
  handCommit: (kind: string, member: string) => `${kind} goes to ${member}`,
  /** A project's put-back, as its decides.md commit says it. */
  backCommit: (kinds: readonly string[]) =>
    `${andList(kinds)} ${kinds.length === 1 ? "follows" : "follow"} the fleet again`,

  // ── The page: its bar and head ──────────────────────────────────────────
  /** The fleet, as the bar's first crumb names it until he names it. */
  fleet: "Your fleet",
  /** The bar, as a screen reader names it. */
  crumbs: "Breadcrumb",
  /** The bar's trailing link: the project's Decisions tab. */
  decisions: "Decisions",
  /** The project page's title. */
  title: (project: string) => `Who decides in ${project}`,
  /** Who decides could not be read. */
  unread: (reason: string) => `Who decides didn't load: ${reason}`,
  /** An agent member's facts line: "Claude Code · Opus 5.5 · high effort". */
  runsOn: (harness: string, model: string, effort: string | null) =>
    effort
      ? `${harness} · ${model} · ${effort} effort`
      : `${harness} · ${model}`,

  // ── The page: the team, the kinds' cards ────────────────────────────────
  /** The page, as its fault names it ("Couldn't show Who decides"). */
  pageName: "Who decides",
  /** The team row, as a screen reader names it. */
  teamLabel: "Who decides",
  /** The team row's last chip, and a new agent's card while unnamed. */
  addAgent: "Add an agent",
  /** A new agent's card: its press. */
  addAgentAct: "Add agent",
  /** A kind's face chip, as its control is named. */
  answeredBy: (kind: string, member: string) =>
    `${kind}: ${member} answers. Change who answers`,
  renameItem: "Rename",
  removeItem: "Remove kind",
  /** A member's card: its standing instructions, as their control is named. */
  changeInstructions: (name: string) =>
    `Change ${name}'s standing instructions`,
  /** A member's card: its record, as a screen reader names it. */
  recordLabel: (name: string) => `${name}'s record`,
  /** A member that can't run, in its card: where machines join. */
  joinMachine: "Join a machine",
  /** A member's setting chips, as their controls are named. */
  harnessOf: (name: string) => `${name}'s harness`,
  modelOf: (name: string) => `${name}'s model`,
  effortOf: (name: string) => `${name}'s effort`,
  /** A harness in its menu: how many machines run it. */
  harnessMachines: (count: number) =>
    count === 0
      ? "on no machine"
      : `on ${count} ${count === 1 ? "machine" : "machines"}`,
  /** A new agent's card, as a screen reader names it before it has a name. */
  newAgent: "New agent",
  /** A kind's fields, adding or renaming it. */
  examplesLabel: "Examples",
  /** decides.md that can't be read: its way out. */
  openFile: "Open decides.md",

  // ── A member's settings, and Add a member ───────────────────────────────
  /** A card whose settings were closed before saving, on its facts line. */
  unsaved: "Unsaved changes",
  /** The add card, with a new member's draft closed before adding. */
  resume: (name: string) => (name ? `Resume ${name}` : "Resume the new member"),
  nameLabel: "Name",
  harnessLabel: "Harness",
  modelLabel: "Model",
  effortLabel: "Effort",
  /** A harness tile's note: where it runs. */
  harnessOn: (machines: readonly string[]) => andList(machines),
  /**
   * The names composed for a harness's models where the harness's own
   * would repeat or fall short (packages/core/src/model-names.ts).
   */
  modelNames: {
    /** `model` with what tells it from a row of the same model, in its one trailing parenthetical: "Fable 5.1 (1M context, default)". */
    qualified: (model: string, qualifiers: readonly string[]) =>
      `${model} (${qualifiers.join(", ")})`,
    /** The 1M-token-context variant's qualifier. */
    longContext: "1M context",
    /** The harness's default entry's: the model it runs when none is chosen. */
    harnessDefault: "default",
    /** A model as `provider` offers it, beside another provider's. */
    fromProvider: (provider: string) => `via ${provider}`,
  },
  delegatesLabel: "May start delegates of its own",
  skillsLabel: "Skills",
  /** The skills it may use, folded under its instructions. */
  skillsPicked: (count: number) =>
    `${count} ${count === 1 ? "skill" : "skills"}`,
  noSkills: "The fleet has no skills yet: add them in Configure › Skills.",
  instructionsLabel: "Instructions",
  /** An agent's card with no instructions yet: the press that adds them. */
  addInstructions: "Add instructions",
  /** How you hear, its two ways. */
  hears: {
    each: {
      name: "Tell me when it decides",
      note: "A notification for every answer",
    },
    later: {
      name: "Catch me up later",
      note: "Read them together in Decisions",
    },
  },
  cancel: "Cancel",
  save: "Save",
  saving: "Saving…",
  addingMember: "Adding…",
  /** Removing a member he added. */
  remove: (name: string) => `Remove ${name}`,
  removing: "Removing…",
  keep: "Keep it",
  removeAsk: (name: string) => `Remove ${name}?`,
  removeLine: (kinds: readonly string[], waiting: number) =>
    [
      kindsBack(kinds),
      ...(waiting === 0
        ? []
        : [
            waiting === 1
              ? "1 waiting stays with it until answered."
              : `${waiting} waiting stay with it until answered.`,
          ]),
    ]
      .filter(Boolean)
      .join(" "),
  /** The setup's commit on a project's decides.md. */
  setupCommit: (name: string) => `${name}'s kinds changed`,

  // ── Kinds of choice ─────────────────────────────────────────────────────
  addKind: "Add a kind",
  kindNameMissing: "Give it a name.",
  kindExampleMissing: "Give an example or two.",
  addKindAct: "Add kind",
  addingKind: "Adding…",
  rename: (name: string) => `Rename ${name}`,
  renameDone: "Done",
  renaming: "Saving…",
  removeKindAsk: (name: string) => `Remove ${name}?`,
  /** What waits under a kind being removed, where it goes; nothing when none waits. */
  waitingMove: (count: number, projects: readonly string[]) => {
    if (count === 0) {
      return "";
    }
    const where = projects.length > 0 ? ` in ${andList(projects)}` : "";
    return count === 1
      ? `1 decision waits under it${where}. It moves too.`
      : `${count} decisions wait under it${where}. They move too.`;
  },

  /** The kinds to move them to, as a screen reader names the list. */
  moveToLabel: "Move its choices to",
  pickMoveTo: "Pick a kind.",
  removeAndMove: (count: number) => {
    if (count === 0) {
      return "Remove kind";
    }
    return count === 1
      ? "Remove and move the decision"
      : "Remove and move the decisions";
  },
  removingKind: "Removing…",
  /** What waits under a kind could not be counted. */
  waitingUnread: (reason: string) =>
    `Couldn't count what waits under it: ${reason}`,

  // ── A member's record ───────────────────────────────────────────────────
  /** Its figures, each a link where it has a place; `age` as formatAgeShort says it ("now", "2h"). */
  record: {
    decided: (count: number) => `${count.toLocaleString()} decided`,
    last: (age: string) =>
      age === "now" ? "last one just now" : `last one ${age} ago`,
    takenBack: (count: number) => `${count.toLocaleString()} you overruled`,
    waiting: (count: number) => `${count.toLocaleString()} waiting`,
    spend: (usd: string) => `${usd} this month`,
    nothingYet: "Nothing decided yet",
    threads: (count: number) =>
      `${count.toLocaleString()} ${count === 1 ? "conversation" : "conversations"}`,
    lastTurn: (age: string) =>
      age === "now" ? "last active just now" : `last active ${age} ago`,
    unread: (reason: string) => `The record didn't load: ${reason}`,
  },

  // ── The project's details: its Who decides row ─────────────────────────
  detailsLabel: "Who decides",
  detailsFollows: "Follows the fleet",
  detailsExcept: (count: number) =>
    `Follows the fleet, except ${count} ${count === 1 ? "kind" : "kinds"}`,
  /** decides.md can't be read: every kind is his. */
  detailsUnread: "decides.md can't be read: every kind comes to you",

  // ── Pictures ────────────────────────────────────────────────────────────
  /** The face's button. */
  changePicture: (name: string) => `Change ${name}'s picture`,
  /** The picker's group, as a screen reader names it. */
  pictureFor: (name: string) => `${name}'s picture`,
  /** An identity hue's tile. */
  hueName: (hue: number) => `Mark ${hue}`,
};
