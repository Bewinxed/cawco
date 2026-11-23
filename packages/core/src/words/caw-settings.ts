/**
 * The words of Caw's settings panel (the dashboard's caw-settings-proto,
 * a prototype on the design graph): Caw awake or asleep and the switch
 * under him, what on and off mean, what his chat runs as, and what each
 * kind of trigger runs as.
 */
export const cawSettingsWords = {
  /** The panel's name, for a screen reader and the phone sheet's title. */
  panel: (project: string) => `Caw settings for ${project || "this project"}`,
  /** The switch's word while he is on. */
  awake: "Awake",
  /** The switch's word while he is off. */
  asleep: "Asleep",
  /** The switch's words while he is on. */
  switchOn: "Caw is awake",
  /** The switch's words while he is off. */
  switchOff: "Caw is asleep",
  /** What it means while he is awake, in one line on the hero. */
  awakeLine: "Each trigger starts a short session that reports where it acted.",
  /** What it means while he is asleep, in one line on the hero. */
  asleepLine: "Triggers wait on their task, routine or page until Caw wakes.",
  /** The hub has not said whether he is on yet. */
  reading: "Reading…",
  /** The hub is out of reach: what shows is what it said last, and the controls are sunk. */
  hubAway:
    "The hub isn't answering, so these are its last settings and can't be changed yet.",
  /** His chat's settings: the heading. */
  chat: "Your chat with Caw",
  /** Whether Caw may propose changes to Who decides: the switch's label. */
  proposes: "Caw can propose who decides changes",
  /** What it means while on. */
  proposesOn:
    "Caw can propose a change to who decides. It reaches you to approve or decline.",
  /** What it means while off. */
  proposesOff: "Caw only reads who decides.",
  /** What stands when the switch's change was refused. */
  proposesUnchanged: (on: boolean) =>
    on ? "Caw can still propose changes" : "Caw still only reads who decides",
  /** The triggers' settings: the heading. */
  triggers: "Triggers",
  // triggersMean: cut. The line under the heading comes off the panel.
  /** A trigger row's fields, as a reset names them. */
  fields: { account: "account", model: "harness and model", mode: "mode" },
  /** A field's reset on a project's row: back to what it inherits. */
  reset: (field: string) => `Use the inherited ${field}`,
  /** A field's reset on the fleet's row: back to each project's own. */
  resetFleet: (field: string) => `Leave the ${field} to each project`,
  /** An inherited picker's tooltip: where its value comes from. */
  inheritedFrom: (source: string) => `Inherited from ${source}`,
  /** A field of a kind's own that is unset: its chip says where its value comes from. */
  from: {
    caw: "your chat",
    fleet: "fleet",
    eachCaw: "each project",
    default: "default",
  },
  /** A trigger kind's mode nothing sets: its tooltip. */
  triggerModeDefault: "Default for triggers",
  /**
   * The hub refused a change: why, in the hub's own sentence with its status
   * and no closing stop (hub-read.ts `hubSaid`), then what stands, then the
   * next step.
   */
  refused: (what: string, why: string) => `${why}. ${what}. Try again.`,
  /** What stands when turning him off was refused. */
  stillAwake: "Caw is still awake",
  /** What stands when waking him was refused. */
  stillAsleep: "Caw is still asleep",
  /** What stands when his chat's change was refused. */
  chatUnchanged: "Your chat with Caw kept its settings",
  /** What stands when a kind's change was refused; every kind's name is a plural. */
  kindUnchanged: (kind: string) => `${kind} kept their settings`,
  /** The fleet's section: its title and its one line. */
  fleetSection: "Caw's triggers",
  fleetPurpose: "Projects use these unless they set their own in Caw settings.",
} as const;

/** Each kind of trigger: its name and what reaches it. */
export const triggerKindWords = {
  comments: {
    name: "Comments",
    what: "Your comments on tasks and pins on pages",
  },
  "routine-results": {
    name: "Routine results",
    what: "A routine's runs and its reports",
  },
  "task-moves": {
    name: "Task moves",
    what: "A task moved or created",
  },
  "inbound-events": {
    name: "Inbound events",
    what: "GitHub, connected services and fleet watch",
  },
} as const;
