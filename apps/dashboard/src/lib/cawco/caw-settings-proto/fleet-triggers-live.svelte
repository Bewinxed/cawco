<script lang="ts">
  /**
   * The fleet's trigger defaults to use (FleetTriggers.stories): the
   * section on a stand-in hub (caw-stand-in) that answers each change after
   * its wait as the `answer` dial says, with the fleet setting comments to
   * Sonnet in Accept edits and routine results' mode, the rest unset.
   * `cleared` starts with nothing set; `again` starts over.
   */
  import { UNSET } from "./caw-settings";
  import { INSTALLED, MACHINE } from "./caw-settings-seed";
  import { type HubAnswer, StandInCaw } from "./caw-stand-in.svelte";
  import FleetTriggers from "./FleetTriggers.svelte";

  let {
    answer = "accepts",
    cleared = false,
    reading = false,
    again = 0,
  }: {
    /** What the hub does with a change. */
    answer?: HubAnswer;
    /** The fleet sets nothing: every kind falls to each project's Caw. */
    cleared?: boolean;
    /** The fleet's settings not read yet. */
    reading?: boolean;
    /** Start over: each press makes the hub again. */
    again?: number;
  } = $props();

  // A press of the dial's action starts the hub over.
  const hub = $derived.by(
    () =>
      new StandInCaw({
        round: again,
        projectId: "fleet",
        on: true,
        answer: () => answer,
        running: () => false,
        fleet: cleared
          ? {
              comments: UNSET,
              "routine-results": UNSET,
              "task-moves": UNSET,
              "inbound-events": UNSET,
            }
          : undefined,
      })
  );
</script>

<!-- The Settings pane as the config layout holds a section: edge to edge,
     the section's own frame bringing its padding and recess. -->
<div class="flex min-w-0">
  <FleetTriggers
    installed={INSTALLED}
    kinds={reading ? null : hub.fleet}
    machine={MACHINE}
    onkind={(kind, patch) => hub.setFleetKind(kind, patch)}
    refusedKind={hub.refusedFleetKind}
  />
</div>
