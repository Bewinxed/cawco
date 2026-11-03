/**
 * The two onboardings' words: New project's ask, what says the person can
 * just describe the work (each wording an option of the decision page
 * `onboarding-design`, card `describe-hint`), its no-machine line, and the
 * first-run row on the fleet board. Written to DESIGN.md's Voice.
 */
export const onboardingWords = {
  /** New project's one question, over the field. */
  ask: "What are we working on?",
  /** The field's placeholder at rest, and where `once` lands. */
  placeholder: "A repo, a launch, a job hunt…",
  /**
   * The examples the placeholder types (card `describe-hint`), spanning the
   * work CawCo takes: code, a launch, posts, and work no template holds.
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
  relay: "Watch a project's browser from your phone",
  relayNote:
    "The stream relay carries a project's Chrome to your phone when you're off the tailnet.",
  relayLater: "Later",
  relaySetUp: "Set up",
  relayAnswered: "Kept for later in Settings › Browsers",
  project: "Make your first project",
  newProject: "New project",
  /** Caw's line when the first machine registers (his arrival). */
  arrived: (name: string) => `${name} joined. Caw runs here now.`,
} as const;
