/**
 * The two onboardings' words: New project's ask, what says the person can
 * just describe the work (each wording an option of the decision page
 * `onboarding-design`, card `describe-hint`), its no-machine line, and the
 * first-run row on the fleet board. Written to DESIGN.md's Voice.
 */
export const onboardingWords = {
  /** New project's one question, over the field. */
  ask: "What are we working on?",
  /** The field's placeholder. */
  placeholder: "A repo, a launch, a brand…",
  /** `describe-hint` option `title`: the line under the question. */
  hintTitle:
    "Describe it in your own words and Caw drafts the stages. Templates are optional.",
  /** `describe-hint` option `head`: the head over the cards. */
  hintHead: "Or start from a template",
  /** `describe-hint` option `head`: the line under that head. */
  hintHeadLine: "Without one, Caw drafts the stages from what you wrote.",
  /** `describe-hint` option `caption`: the caption under the cards (addendum 4's words). */
  hintCaption: "Pick one, or just describe it and Caw proposes the stages.",
  /** No machine registered: Caw's conversation runs on a machine. */
  noMachine:
    "No machine has joined yet, so Caw can't start. Your words stay here.",
  /** Machines registered, none online. */
  noneOnline: "No machine is online, so Caw can't start. Your words stay here.",
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
    `${name} joined and is offline. Start its agent, then it ticks here.`,
  harness: "Sign in to a harness on it",
  harnessNote: (name: string) =>
    `Claude Code, OpenCode or pi on ${name}. One is enough to start.`,
  harnessDone: (harness: string, name: string) =>
    `${harness} is signed in on ${name}`,
  relay: "Watch a project's browser from your phone",
  relayNote:
    "The stream relay carries a project's Chrome to your phone when you're off the tailnet. Later keeps it in Settings › Browsers.",
  relayLater: "Later",
  relaySetUp: "Set up",
  relayAnswered: "Kept for later in Settings › Browsers",
  project: "Make your first project",
  projectNote:
    "Describe the work in your own words. Caw names it and drafts how it runs.",
  newProject: "New project",
  /** Caw's line when the first machine registers (his arrival). */
  arrived: (name: string) => `${name} joined. Caw runs here now.`,
} as const;
