/**
 * Project details (Component Story Format 3, live components): HyucksField's
 * tray under its head, on two machines with long folders, its tasks synced
 * with GitHub. Every press is answered by the fixture as the hub would; the
 * dials set what no press reaches.
 */
import ProjectDetailsLive from "./project-details-live.svelte";

export default {
  title: "Project/Project details",
  component: ProjectDetailsLive,
  args: {
    machinesJoined: 2,
    tracked: "github",
    account: "routing",
    decides: "fleet",
    again: 0,
  },
  parameters: { viewport: 1440 },
};

/** HyucksField's details, open under its head. */
export const Live = {};
