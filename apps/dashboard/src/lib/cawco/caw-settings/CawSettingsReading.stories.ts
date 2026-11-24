/**
 * Every state of Caw's settings, one frame each (Component Story Format 3,
 * live components): the panel open from the head's More
 * (caw-settings-frame) on what each situation leaves it holding; a flip
 * the person has just made is its `asked` arg, made through the switch's
 * own path as the frame opens. Each story keeps a project of its own, so a
 * Caw-off confirm asked in one frame stands in no other.
 */
import CawSettingsFrame from "./caw-settings-frame.svelte";
import {
  askOff,
  askOffThenCancel,
  PANEL_ARGS,
  seedStores,
} from "./caw-settings-play";

export default {
  title: "Caw/Caw settings, every state",
  component: CawSettingsFrame,
  args: { ...PANEL_ARGS, projectId: "cockpit-awake" },
  beforeEach: seedStores,
};

/** Caw awake: triggers start short runs, each kind as it inherits. */
export const Awake = {};

/** Caw asleep: nothing starts on its own. */
export const Asleep = { args: { projectId: "cockpit-asleep", on: false } };

/** Putting him to sleep while what he started still runs: the confirm comes down out of his switch's glass and asks which to stop. */
export const TurningOff = {
  args: { projectId: "cockpit-turning-off", asked: "off" },
};

/** Waking him, and the hub refuses: he stays asleep and the line says why. */
export const Refused = {
  args: {
    projectId: "cockpit-refused",
    on: false,
    answer: "refuses",
    asked: "on",
  },
};

/** Caw may change what his chat and each kind run as. */
export const ChangesAllowed = {
  args: { projectId: "cockpit-changes", changes: true },
};

/** A kind's change refused: it keeps its settings, and its row says why. */
export const KindRefused = {
  args: { projectId: "cockpit-kind-refused", refusedKind: "task-moves" },
};

/** The hub out of reach: what it said last, every control sunk. */
export const HubAway = {
  args: { projectId: "cockpit-hub-away", hub: "away" },
};

/** Routine results set to run on their own harness and model. */
export const KindOverridden = {
  args: { projectId: "cockpit-overridden", overridden: true },
};

/** The kinds not read yet: the section says so where they stand. */
export const Reading = {
  args: { projectId: "cockpit-reading", triggers: "reading" },
};

/** The kinds' read refused: the hub's words where they stand. */
export const Unread = {
  args: { projectId: "cockpit-unread", triggers: "unread" },
};

/** Flipping him off with sessions running: the confirm comes down out of the switch's glass. */
export const ConfirmGrows = { from: "Awake", play: askOff };

/** The confirm cancelled: it goes back up into the switch's glass, and he stays awake. */
export const ConfirmShrinks = { from: "Awake", play: askOffThenCancel };
