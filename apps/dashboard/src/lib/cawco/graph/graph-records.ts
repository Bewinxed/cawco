/**
 * Two real components under review, as the stage would read them from their
 * states files: the routine form (`routines/RoutineForm.stories.ts`) and
 * Who decides' roster (`decides/Roster.stories.ts`). Every state's props are
 * those stories' own args, imported, never copied; the titles and lines are
 * their doc comments; the machines are the `group` the agent gives them; the
 * clips are the moves' real motion, as the stage measures it: the kit
 * button's pending cross-fade (`--dur-morph`, ease-out) and the form's
 * failure line, which unfolds over `--dur-pop` and folds over `--dur-exit`
 * (motion/fold). The data dials range over the same records: the stories'
 * long prompt and a short one, and the fleet's members, from one to all.
 */
import RosterFixture from "../decides/preview/RosterFixture.svelte";
import { added, addedFacts } from "../decides/preview/records";
import roster, * as rosterStories from "../decides/Roster.stories";
import routine, * as routineStories from "../routines/RoutineForm.stories";
import RoutineForm from "../routines/RoutineForm.svelte";
import type { Clip, GraphComponent } from "./graph";

/** A clip on a house token: its length and curve read from the tokens' names. */
const clip = (
  id: string,
  target: string,
  kind: Clip["kind"],
  property: string,
  token: "--dur-exit" | "--dur-morph" | "--dur-pop",
  delay = 0
): Clip => ({
  id,
  target,
  kind,
  property,
  token,
  duration: { "--dur-exit": 160, "--dur-morph": 180, "--dur-pop": 260 }[token],
  delay,
  easing: "var(--ease-out)",
  easingToken: "--ease-out",
});

/** What each run does, said short: the form's own placeholder sentence. */
const SHORT_PROMPT =
  "Read the issues opened since the last run, label each one, and say which need me.";

const prompt = {
  id: "prompt",
  kind: "switch" as const,
  label: "Prompt",
  options: ["Short", "Long"] as [string, string],
  value: 1,
  apply: (props: Record<string, unknown>, value: number) => {
    const draft = props.draft as Record<string, unknown> | undefined;
    return draft && value === 0
      ? { draft: { ...draft, prompt: SHORT_PROMPT } }
      : {};
  },
};

/** A create the hub answered with a refusal: the spinner gives way to the label, the failure line unfolds and the commit row slides under it. */
const refused = [
  clip("spinner-out", "Spinner", "opacity", "opacity", "--dur-morph"),
  clip("label-in", "Create label", "opacity", "opacity", "--dur-morph"),
  clip("line-unfold", "Failure line", "unfold", "height", "--dur-pop"),
  clip("row-slide", "Commit row", "position", "translate", "--dur-pop"),
];

const routineGraph: GraphComponent = {
  name: "Routine form",
  file: "apps/dashboard/src/lib/cawco/routines/RoutineForm.stories.ts",
  component: RoutineForm as GraphComponent["component"],
  args: routine.args,
  /** The Routines block's form: a field's measure and its labels. */
  width: 680,
  machines: ["Filling in", "Creating"],
  dials: [prompt],
  states: [
    {
      id: "Empty",
      title: "Empty",
      line: "Opened by Create routine: every day at 09:00 read back, the rest blank.",
      machine: "Filling in",
      instance: "empty",
      props: {},
    },
    {
      id: "Filled",
      title: "Filled",
      line: "Every weekday at 09:00, read back under When with its week on the strip.",
      machine: "Filling in",
      instance: "filled",
      props: routineStories.Filled.args,
      dials: ["prompt"],
    },
    {
      id: "Weekly",
      title: "Weekly",
      line: "Mondays at 07:30: the day and the time beside the choice.",
      machine: "Filling in",
      instance: "weekly",
      props: routineStories.Weekly.args,
      dials: ["prompt"],
    },
    {
      id: "Custom",
      title: "Custom",
      line: "A schedule the hub reads: its words under When and its week on the strip.",
      machine: "Filling in",
      instance: "custom",
      props: routineStories.Custom.args,
      dials: ["prompt"],
    },
    {
      id: "InvalidSchedule",
      title: "Unreadable schedule",
      line: "A schedule the hub can't read: the five values named in order, no read-back.",
      machine: "Filling in",
      instance: "invalid",
      props: routineStories.InvalidSchedule.args,
      dials: ["prompt"],
    },
    {
      id: "Saving",
      title: "Creating",
      line: "The button keeps its width; a spinner stands over its label.",
      machine: "Creating",
      instance: "filled",
      props: routineStories.Saving.args,
      dials: ["prompt"],
    },
    {
      id: "FailedSave",
      title: "Hub didn't answer",
      line: "Why, and try again, every word kept.",
      machine: "Creating",
      instance: "filled",
      props: routineStories.FailedSave.args,
      dials: ["prompt"],
    },
    {
      id: "FailedType",
      title: "Type refused",
      line: "The hub's words, and choose another type.",
      machine: "Creating",
      instance: "filled",
      props: routineStories.FailedType.args,
      dials: ["prompt"],
    },
  ],
  moves: [
    { from: "Empty", to: "Filled", label: "Type", clips: [] },
    { from: "Filled", to: "Weekly", label: "Every week", clips: [] },
    { from: "Filled", to: "Custom", label: "Custom", clips: [] },
    { from: "Custom", to: "InvalidSchedule", label: "Mistype", clips: [] },
    {
      from: "Filled",
      to: "Saving",
      label: "Create",
      clips: [
        clip("label-out", "Create label", "opacity", "opacity", "--dur-morph"),
        clip("spinner-in", "Spinner", "opacity", "opacity", "--dur-morph"),
        clip("cancel-dim", "Cancel", "colour", "opacity", "--dur-morph"),
      ],
    },
    {
      from: "Saving",
      to: "FailedSave",
      label: "502",
      clips: refused,
    },
    {
      from: "Saving",
      to: "FailedType",
      label: "Refused",
      clips: refused,
    },
    {
      from: "FailedSave",
      to: "Saving",
      label: "Try again",
      clips: [
        clip("line-fold", "Failure line", "unfold", "height", "--dur-exit"),
        clip("label-out", "Create label", "opacity", "opacity", "--dur-morph"),
        clip("spinner-in", "Spinner", "opacity", "opacity", "--dur-morph"),
      ],
    },
  ],
};

/** The fleet's members, one to all nine, the person first. */
const memberCount = {
  id: "members",
  kind: "count" as const,
  label: "Members",
  min: 2,
  max: added.length,
  value: added.length,
  apply: (_props: Record<string, unknown>, value: number) => ({
    members: added.slice(0, value),
    facts: addedFacts,
  }),
};

const rosterGraph: GraphComponent = {
  name: "Who decides",
  file: "apps/dashboard/src/lib/cawco/decides/Roster.stories.ts",
  component: RosterFixture as GraphComponent["component"],
  args: roster.args,
  width: 1440,
  machines: ["Routes", "Handing over"],
  dials: [memberCount],
  states: [
    {
      id: "FollowingDesk",
      title: "Following the fleet",
      line: "Cawco-Dev following the fleet, four across.",
      machine: "Routes",
      instance: "following",
      props: {},
    },
    {
      id: "ChangedDesk",
      title: "Three handed over",
      line: "Washed, with the folder and the way back.",
      machine: "Routes",
      instance: "changed",
      props: rosterStories.ChangedDesk.args,
    },
    {
      id: "OpenManyMembers",
      title: "Approach's list open",
      line: "Agents and a person he added among those to go to.",
      machine: "Handing over",
      instance: "open",
      props: rosterStories.OpenManyMembers.args,
      dials: ["members"],
    },
    {
      id: "Handing",
      title: "Handing over",
      line: "The hub writing Approach's hand-over: its glyph breathes.",
      machine: "Handing over",
      instance: "handing",
      props: rosterStories.Handing.args,
    },
    {
      id: "Refused",
      title: "Hand-over refused",
      line: "Its words under the tile, with Try again.",
      machine: "Handing over",
      instance: "refused",
      props: rosterStories.Refused.args,
    },
  ],
  moves: [
    { from: "FollowingDesk", to: "ChangedDesk", label: "Hand over", clips: [] },
    {
      from: "FollowingDesk",
      to: "OpenManyMembers",
      label: "Press a tile",
      clips: [],
    },
    { from: "OpenManyMembers", to: "Handing", label: "Pick", clips: [] },
    { from: "Handing", to: "Refused", label: "Refused", clips: [] },
    { from: "Handing", to: "ChangedDesk", label: "Written", clips: [] },
  ],
};

/** The canvas the agent opened: both components, the form first. */
export const reviewGraphs = [routineGraph, rosterGraph];
