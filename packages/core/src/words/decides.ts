/**
 * Who decides' words (core decides.ts): the built-in members and kinds as
 * they are named, the hub's routed lines, signatures, unreachable reasons
 * and refusals. The page's own words join this object with it (build spec
 * §3.8). Said by the hub and the dashboard only: the app draws none of it,
 * so it is not written into it (scripts/words-swift.ts).
 */
import { andList } from "./helpers";

/** A removed member's kinds, coming back to him. */
const kindsBack = (kinds: readonly string[]): string => {
  if (kinds.length === 0) {
    return "It decides no kind now.";
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
    `${kind} goes to ${member} ${here}: one is on it, and the work that depends on it waits on the card.`,
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
    `${kind} goes to ${member} here: only ${member}'s session for this card settles it, and the work that depends on it waits on the card.`,
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
  /** A member's card with no kind, on the fleet's page. */
  holdsNothingFleet: "Holds nothing in your fleet.",
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
  /** The lede, every kind following the fleet. */
  follows: (project: string) =>
    `${project} follows the fleet on every kind of choice.`,
  /** The lede, with kinds it handed over itself. */
  except: (project: string, count: number) =>
    `${project} follows the fleet, except for ${count} ${count === 1 ? "kind" : "kinds"} it handed over.`,
  /** The lede's way back for every kind it handed over. */
  putAllBack: (count: number) =>
    count === 1 ? "Put it back" : "Put them all back",
  /** The legend: a kind following the fleet. */
  followsFleet: "Follows the fleet",
  /** The legend: a kind this project set itself. */
  own: (project: string) => `${project}'s own`,
  /** Who decides could not be read. */
  unread: (reason: string) => `Who decides didn't load: ${reason}`,
  /** An agent member's facts line: "Claude Code · Opus 5.5 · high effort". */
  runsOn: (harness: string, model: string, effort: string | null) =>
    effort
      ? `${harness} · ${model} · ${effort} effort`
      : `${harness} · ${model}`,

  // ── A member's settings, and Add a member ───────────────────────────────
  /** A card's pencil, as its control is named. */
  edit: (name: string) => `Change ${name}'s settings`,
  /** A card whose settings were closed before saving, on its facts line. */
  unsaved: "Unsaved changes",
  /** The add card, with a new member's draft closed before adding. */
  resume: (name: string) => (name ? `Resume ${name}` : "Resume the new member"),
  /** The add card's title, and the settings' head while adding. */
  addMember: "Add a member",
  /** Under it: what can be added now. */
  addMemberNote:
    "An agent that runs on your fleet. People and channels come with a Slack or email connection.",
  /** The settings' close button. */
  closeSetup: (name: string) => `Close ${name}'s settings`,
  /** The settings' line under the name, by who it is. */
  headBuiltIn: "Built in",
  headAgent: "Your agent",
  headLead: (project: string) => `Lead of ${project}`,
  headPractice:
    "Built in · Picks what established practice does and names at least one source.",
  /** Caw's on the fleet's page: his harness and model are each project's. */
  headCawFleet: "Built in · Leads each project he's switched on in",
  /** The kinds of member Add a member offers. */
  memberTypes: {
    agent: { name: "An agent", note: "Runs on your fleet" },
    person: { name: "A person", note: "Needs a Slack or email connection" },
    channel: { name: "A channel", note: "Needs a Slack or email connection" },
  },
  /** The row labels, in their order. */
  rows: {
    does: "What it does",
    doesCaw: "What he does",
    lead: "Leads this project",
    runs: "Runs on",
    knows: "Knows",
    decides: "Decides",
    hear: "How you hear",
    record: "Record",
  },
  /** A folded row's way back in. */
  change: "Change",
  changeRow: (row: string) => `Change ${row.toLowerCase()}`,
  nameLabel: "Name",
  namePlaceholder: "Release checker",
  jobLabel: "What it does with a decision",
  jobPlaceholder: "Checks the changelog and the build, then picks.",
  /** An added member's name, which can't change. */
  nameKept: "Its name is its delegate type's, so it stays.",
  /** Caw's status, under his job. */
  cawNow: (status: string) => `Now: ${status}`,
  /** Caw's Runs on, on the fleet's page. */
  cawRunsFleet:
    "His harness and model are each project's: change them on its Who decides.",
  harnessLabel: "Harness",
  modelLabel: "Model",
  effortLabel: "Effort",
  /** A harness tile's note: where it runs. */
  harnessOn: (machines: readonly string[]) => andList(machines),
  /** A harness on no online machine. */
  notOnMachine: "Not on any machine yet",
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
  noSkills: "The fleet has no skills yet: add them in Configure › Skills.",
  /** No skill picked, in a folded row. */
  noSkillsPicked: "No skills",
  instructionsLabel: "Standing instructions",
  instructionsHint: "What it reads before every decision.",
  instructionsPlaceholder:
    "Read the changelog and the last build's checks. Pick the option that ships safely, and say which check decided it.",
  /** A folded Knows row: how many skills and the instructions' first line. */
  knowsLine: (skills: number, instructions: string) =>
    `${skills === 0 ? "No skills" : `${skills} ${skills === 1 ? "skill" : "skills"}`} · ${instructions || "No standing instructions"}`,
  /** Caw's Knows. */
  cawInstructions: (project: string) =>
    `His instructions are ${project}'s AGENTS.md`,
  cawSkills: "Change his skills in Configure › Skills",
  /** Decides' hint; on a project's page its second sentence follows. */
  decidesHint: "For choices raised from now on.",
  decidesHintProject: "A kind you clear goes back to the fleet's choice.",
  /** A kind another member holds now, beside it. */
  nowHeld: (name: string) => `now ${name}`,
  /** A folded Decides row that holds nothing. */
  decidesNothing: "No kind yet",
  /** How you hear, its two ways. */
  hears: {
    each: {
      name: "Tell me each time",
      note: "A notification for every answer",
    },
    later: {
      name: "Catch me up later",
      note: "Read them together in Decisions",
    },
  },
  hearHint: "Every answer is signed with its name either way.",
  answersIn: "Answers appear in Decisions",
  /** The foot. */
  fromNowOn: "Changes apply to choices raised from now on.",
  toFix: (count: number) =>
    count === 1 ? "One thing to fix." : `${count} things to fix.`,
  cancel: "Cancel",
  save: "Save",
  saving: "Saving…",
  continue: "Continue",
  addMemberAct: "Add member",
  addingMember: "Adding…",
  openType: "Open in Delegate types",
  /** Removing a member he added. */
  remove: "Remove member",
  removing: "Removing…",
  keep: "Keep it",
  removeAsk: (name: string) => `Remove ${name}?`,
  removeLine: (kinds: readonly string[], waiting: number) =>
    [
      kindsBack(kinds),
      "Decisions it already settled stay as they are.",
      ...(waiting === 0
        ? []
        : [
            waiting === 1
              ? "The one waiting on it stays with it until answered."
              : `The ${waiting} waiting on it stay with it until answered.`,
          ]),
    ].join(" "),
  /** Kinds named in a line: "Look and words, Scope and Approach". */
  kindsList: (names: readonly string[]) => andList(names),
  /** The setup's commit on a project's decides.md. */
  setupCommit: (name: string) => `${name}'s kinds changed`,

  // ── Kinds of choice ─────────────────────────────────────────────────────
  /** The head's button, and the popover's head. */
  kindsHead: "Kinds of choice",
  /** The button's count, as a screen reader hears it after the name. */
  kindsCount: (count: number) => `${count} ${count === 1 ? "kind" : "kinds"}`,
  /** A kind half added and closed before adding, beside the button. */
  kindUnsaved: "Unsaved kind",
  closeKinds: "Close Kinds of choice",
  kindsIntro:
    "Agents file every choice under one of these kinds, by the examples under its name. Beside each is who decides it across the fleet.",
  /** The key for the pen glyph a kind he added wears. */
  addedKey: "A kind you added",
  addKind: "Add a kind",
  /** Add a kind's steps, in their order. */
  kindSteps: {
    name: "Name",
    example: "What agents read",
    to: "Who decides it",
  },
  kindNamePlaceholder: "Data and migrations",
  kindExamplePlaceholder: "a schema change, a backfill, a data fix",
  kindNameMissing: "Give it a name; agents file choices under it.",
  kindExampleMissing: "Say what agents file under it, as a few examples.",
  addKindAct: "Add kind",
  addingKind: "Adding…",
  /** A kind's row: who decides it, as a screen reader hears it. */
  whoAcrossFleet: (member: string) =>
    `Who decides it across the fleet: ${member}`,
  rename: (name: string) => `Rename ${name}`,
  renameDone: "Done",
  renaming: "Saving…",
  removeKind: (name: string) => `Remove ${name}`,
  removeKindAsk: (name: string) => `Remove ${name}?`,
  /** What waits under a kind being removed, and the projects it waits in. */
  waitingUnder: (count: number, projects: readonly string[]) => {
    if (count === 0) {
      return "No decisions are waiting under it.";
    }
    const where = projects.length > 0 ? ` (${andList(projects)})` : "";
    return count === 1
      ? `1 decision is waiting under it${where}.`
      : `${count} decisions are waiting under it${where}.`;
  },
  fileUnder: (count: number) =>
    count === 0
      ? "From now on agents file these choices under the kind you pick."
      : `From now on agents file these choices under the kind you pick, and the waiting ${count === 1 ? "decision moves" : "decisions move"} there too.`,
  /** The kinds to move them to, as a screen reader names the list. */
  moveToLabel: "The kind they go to",
  pickMoveTo: "Pick the kind they go to.",
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
      age === "now" ? "last just now" : `last ${age} ago`,
    takenBack: (count: number) => `${count.toLocaleString()} taken back`,
    waiting: (count: number) => `${count.toLocaleString()} waiting`,
    spend: (usd: string) => `${usd} this month`,
    nothingYet: "Nothing decided yet",
    threads: (count: number) =>
      `${count.toLocaleString()} ${count === 1 ? "thread" : "threads"}`,
    lastTurn: (age: string) =>
      age === "now" ? "last turn just now" : `last turn ${age} ago`,
    unread: (reason: string) => `The record didn't load: ${reason}`,
  },

  // ── The project's details: its Who decides row ─────────────────────────
  detailsLabel: "Who decides",
  detailsFollows: "Follows the fleet",
  detailsExcept: (count: number) =>
    `Follows the fleet, except ${count} ${count === 1 ? "kind" : "kinds"}`,
  /** decides.md doesn't read: every kind is his. */
  detailsUnread: "decides.md doesn't read: every choice comes to you",

  // ── Pictures ────────────────────────────────────────────────────────────
  /** The face's button. */
  changePicture: (name: string) => `Change ${name}'s picture`,
  /** The picker's group, as a screen reader names it. */
  pictureFor: (name: string) => `${name}'s picture`,
  posesNote: "Caw's poses, drawn from his files.",
  /** An identity hue's tile. */
  hueName: (hue: number) => `Mark ${hue}`,
};
