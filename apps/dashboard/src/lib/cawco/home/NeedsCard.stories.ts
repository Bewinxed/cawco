/**
 * Needs you's row for a project past its budget (Component Story Format 3,
 * live components), in words. The meta's args are every story's; a story's
 * own args are what it changes.
 */
import type { NeedsItem } from "./home-state.svelte";
import NeedsCard from "./NeedsCard.svelte";
import { reachedCap } from "./reached-cap";

export default {
  title: "Needs you/Budget",
  component: NeedsCard,
  args: { stale: false, onchoose: () => undefined },
  parameters: { viewport: 400 },
};

/** A project past its spend cap, as home-state lists it. */
export const Budget = {
  args: {
    item: {
      kind: "cap",
      key: "cap:probe-project",
      cap: reachedCap(),
      title: "cockpit",
      place: "Budget reached",
      href: "/usage?project=probe-project",
      raisedAt: undefined,
    } as NeedsItem,
  },
};
