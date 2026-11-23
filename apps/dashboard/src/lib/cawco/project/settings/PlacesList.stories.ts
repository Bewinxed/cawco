/**
 * Run environments, read alone: the project's folders as their card lists them.
 */

import PlacesList from "./PlacesList.svelte";
import { inSettingsCard } from "./section-frame";
import { shellFrame } from "./shell-seed";
import { stageArgs } from "./stage-args";

export default {
  ...shellFrame,
  decorators: [inSettingsCard("places")],
  title: "Run environments",
  component: PlacesList,
  args: stageArgs("At rest"),
};

/** Three folders: atlas where sessions start, kestrel, and the hub's own copy. */
export const AtRest = {};

/** A folder on kestrel is gone and its machine is offline. */
export const FolderNotFound = { args: stageArgs("Two stages in trouble") };

/** Adding a folder: the machine to pick and the path to type, under the folders. */
export const AddingAFolder = {
  args: { ...stageArgs("At rest"), opening: "folder" },
};

/** I chose Stop using on kestrel's folder: it says what goes and what stays first. */
export const StoppingAFolder = {
  args: { ...stageArgs("At rest"), opening: "drop:p-kestrel" },
};

/** Moving kestrel's folder to quarry: what will happen there, and the agent it pauses. */
export const MovingAFolder = {
  args: {
    ...stageArgs("At rest"),
    flow: {
      act: "move",
      placeId: "p-kestrel",
      machineId: "m-quarry",
      path: "/home/mara/code/lantern-web",
      forecast: {
        state: "ready",
        lines: [
          "lantern-web moves to /home/mara/code/lantern-web on quarry, files and history.",
          "The folder on kestrel is removed once quarry has every file.",
        ],
      },
      agents: [
        {
          id: "agent-1",
          name: "Fix the booking flow's date picker",
          replying: true,
          carry: { tool: "Claude Code", way: "same", why: null },
        },
      ],
      sending: false,
      refused: null,
      run: null,
      after: null,
    },
  },
};

/** The move is running: it is copying files to quarry, 1,204 of 8,310. */
export const MoveRunning = {
  args: {
    ...stageArgs("At rest"),
    movingPlaceId: "p-kestrel",
    flow: {
      act: "move",
      placeId: "p-kestrel",
      machineId: "m-quarry",
      path: "/home/mara/code/lantern-web",
      forecast: { state: "none" },
      agents: [],
      sending: false,
      refused: null,
      run: {
        stages: [
          "Pausing agents",
          "Copying files to quarry",
          "Checking every file arrived",
          "Removing the old folder",
        ],
        at: 1,
        callOff: true,
        failed: null,
        progress: "1,204 of 8,310 files",
        waitingFor: null,
      },
      after: null,
    },
  },
};

/** I asked to change kestrel's path and the machine said no folder is there. */
export const ChangePathBlocked = {
  args: {
    ...stageArgs("Two stages in trouble"),
    flow: {
      act: "find",
      placeId: "p-kestrel",
      machineId: "m-kestrel",
      path: "~/Projects/lantern",
      forecast: {
        state: "blocked",
        why: "kestrel has no folder at ~/Projects/lantern.",
        todo: "Type the folder's path as it is on kestrel now.",
      },
      agents: [],
      sending: false,
      refused: null,
      run: null,
      after: null,
    },
  },
};
