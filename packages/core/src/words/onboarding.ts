/**
 * The two onboardings' words, written to DESIGN.md's Voice: New project's
 * ask and the examples its field types once; a project's first minutes
 * (Caw at work in his panel, the board before setup, his questions as he
 * drafts, the Assistant and Preview tabs); a stage's look; and the
 * first-run row on the fleet board. The person's picks on the decision
 * page `onboarding-design` set each.
 */
import type { StageColor, StageIcon, StageKind } from "../views";

export const onboardingWords = {
  /** New project's one question, over the field. */
  ask: "What are we working on?",
  /** The field's placeholder at rest, where the typed examples land. */
  placeholder: "A repo, a launch, a job hunt…",
  /**
   * The examples the placeholder types once (card `describe-hint`, option
   * `once`), spanning the work CawCo takes: code, a launch, posts, and work
   * no template holds.
   */
  examples: [
    "A personal PR team for my job hunt",
    "Land the open pull requests on cockpit",
    "Visa renewal and the move to Lisbon",
    "Plan the app's launch for March",
    "Grant applications for a small lab",
    "Three posts a week on X",
  ],
  /** No machine registered: Caw's conversation runs on a machine. */
  noMachine: "No machine has joined yet, so Caw can't start.",
  /** Machines registered, none online. */
  noneOnline: "No machine is online, so Caw can't start.",
  addMachine: "Add machine",
  checkMachines: "Check machines",
} as const;

/**
 * A project's first minutes, from New project's Send until its setup page
 * is sent: the rail and head while Caw names it, his setup element in his
 * panel (him at work, what he is on, the setup's four steps), the board
 * before setup, and his questions on it.
 */
export const setupWords = {
  /** Beside the unnamed project (words/project `placeholderName`) while Caw names it. */
  naming: "Naming…",
  /** The setup element's four steps, ticked from his own calls. */
  steps: {
    read: "Read what you wrote",
    name: "Name it",
    named: (name: string) => `Named it ${name}`,
    draft: "Draft the stages and who does the work",
    page: "Open the setup page",
  },
  /** Said before a done step's label, for a screen reader. */
  stepDone: "Done:",
  /** What he is on now, under him in his setup element. */
  doing: {
    reading: "Reading what you wrote",
    naming: "Naming it",
    drafting: "Drafting the stages",
    asking: "Drafting the rest while you decide",
    waiting: "Waiting on your answer",
    page: "The setup page is open",
  },
  /** His element's name, for a screen reader. */
  element: "Caw setting up the project",
  /** The board before setup: his scene's claim. */
  notSetUp: "Not set up yet",
  /** Under the claim: what fills the board, and when. */
  notSetUpLine: "Its stages show here once you set it up.",
  /** The board's one action: the setup page, once it is there. */
  openPage: "Open the setup page",
  /** Over the held action while he drafts the page. */
  drafting: "Caw is drafting it.",
  /** The board's one action with no setup under way (Caw off, or a setup left unsent long ago). */
  askSetup: "Set it up with Caw",
  /** What that action sends him. */
  askSetupWords: "Set this project up with me.",
  /** The head's ⋯ while the project is not set up. */
  finishSetup: "Finish setting it up",
  /** The head's ⋯ once it is: the same page, to change how it runs. */
  changeSetup: "Change how it runs",
  changeSetupWords: "I want to change how this project runs.",
  /** His questions on the board: their region's name. */
  questions: "Caw's questions",
  /** One of several, on a phone where they stand one at a time. */
  questionAt: (at: number, of: number) => `${at} of ${of}`,
  /** An answer on its way. */
  answering: "Answering…",
} as const;

/**
 * A project's setup page (the decision library's `Setup`, drawn by the
 * decision host): its parts' names, said or read, as a product names them.
 */
export const setupPageWords = {
  /** The name's field, for a screen reader: the title stands with no label. */
  name: "Project name",
  /** The description's field, for a screen reader: under the title it needs no label. */
  aim: "What it's for",
  stages: "Stages",
  stageName: (at: number) => `Stage ${at} name`,
  addStage: "Add a stage",
  newStage: "New stage",
  kinds: {
    todo: "To do",
    active: "Active",
    waiting: "Waiting",
    you: "Needs you",
    done: "Done",
    dropped: "Dropped",
  } satisfies Record<StageKind, string>,
  kindOf: (name: string) => `Kind of ${name}`,
  lookOf: (name: string) => `Look of ${name}`,
  glyph: "Glyph",
  color: "Colour",
  noColor: "No colour",
  moreFor: (name: string) => `More for ${name}`,
  earlier: "Move earlier",
  later: "Move later",
  remove: (name: string) => `Remove ${name}`,
  delegates: "Delegate types",
  removed: "Removed",
  addBack: "Add back",
  /** The page's Send: what it does, to the project by name. */
  send: (name: string) => `Set up ${name}`,
} as const;

/**
 * Caw's panel's two tabs (card `artifact-open`): his conversation, and what
 * he has to show (a preview, a canvas, a component), which widens the panel
 * as it opens.
 */
export const cawPanelWords = {
  tabs: "Caw's panel",
  assistant: "Assistant",
  preview: "Preview",
} as const;

/**
 * A stage's look (stages.md `color:` and `icon:`), as a screen reader and
 * the setup page's pickers name it.
 */
export const stageLookWords = {
  colors: {
    cyan: "Cyan",
    amber: "Amber",
    orange: "Orange",
    green: "Green",
  } satisfies Record<StageColor, string>,
  icons: {
    inbox: "Inbox",
    idea: "Idea",
    search: "Search",
    pen: "Pen",
    chat: "Chat",
    eye: "Eye",
    clock: "Clock",
    hourglass: "Hourglass",
    calendar: "Calendar",
    send: "Send",
    rocket: "Rocket",
    code: "Code",
    palette: "Palette",
    graph: "Graph",
    user: "Person",
    globe: "Globe",
    book: "Book",
    pin: "Pin",
    bolt: "Bolt",
    list: "List",
    lab: "Lab",
    map: "Map",
    phone: "Phone",
    money: "Money",
    done: "Done",
    archive: "Archive",
    trash: "Bin",
  } satisfies Record<StageIcon, string>,
} as const;

/**
 * The first-run row on the fleet board: the steps to a first project, each
 * ticking as the hub finds it done, in the shape of the tailnet HTTPS row.
 */
export const firstRunWords = {
  title: "Your first project",
  /** Said before a done step's label, for a screen reader. */
  stepDone: "Done:",
  meta: (done: number, total: number) =>
    `Onboarding · ${done} of ${total} done`,
  machine: "Add a machine",
  machineNote: "Caw and every session run on a machine you add.",
  machineOnline: (name: string) => `${name} is online`,
  machineOffline: (name: string) =>
    `${name} is offline. Start its agent there.`,
  harness: "Sign in to a harness on it",
  harnessNote: (name: string) => `Claude Code, OpenCode or pi on ${name}.`,
  harnessDone: (harness: string, name: string) =>
    `${harness} is signed in on ${name}`,
  signIn: "Sign in",
  relay: "Watch a project's browser from your phone",
  relayNote:
    "The stream relay carries a project's Chrome to your phone when you're off the tailnet.",
  relayLater: "Later",
  relaySetUp: "Set up",
  relayAnswered: "Kept for later in Settings › Browsers",
  relayLive: "The stream relay is set up",
  project: "Make your first project",
  newProject: "New project",
  /** Caw's line when the first machine registers (his arrival). */
  arrived: (name: string) => `${name} joined. Caw runs here now.`,
} as const;
