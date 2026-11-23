<script lang="ts">
  /**
   * Caw's seat on the project head to use (CawSeatSwitch.stories): his seat
   * and switch at the head's leading edge, the head's own inset round it,
   * on a stand-in hub (caw-stand-in) that answers the switch after its wait
   * as the `answer` dial says. With `running` on, turning him off asks
   * through the Caw-off confirm hung from the switch's glass, answered at the
   * hub's route. `again` starts over.
   */
  import CawSeatSwitch from "./CawSeatSwitch.svelte";
  import { type HubAnswer, StandInCaw } from "./caw-stand-in.svelte";

  let {
    projectId,
    projectName = "cockpit",
    on = true,
    answer = "accepts",
    running = false,
    asked = null,
    height = 0,
    hubWait = 900,
    again = 0,
  }: {
    /** The project, one per story: its Caw-off job is kept by it. */
    projectId: string;
    projectName?: string;
    /** He is awake as the head is drawn. */
    on?: boolean;
    /** What the hub does with the switch. */
    answer?: HubAnswer;
    /** What his chat started still runs as he is turned off. */
    running?: boolean;
    /**
     * The person has just flipped him, as the frame opens: off asks
     * through the Caw-off confirm while what he started runs, on wakes him;
     * either waits on the hub's answer.
     */
    asked?: "on" | "off" | null;
    /** How long the hub takes to answer, ms. */
    hubWait?: number;
    /** The frame's least height, px: room for the confirm under the switch. */
    height?: number;
    /** Start over: each press makes the hub again. */
    again?: number;
  } = $props();

  // A press of the dial's action starts the hub over.
  const caw = $derived.by(
    () =>
      new StandInCaw({
        round: again,
        projectId,
        on,
        answer: () => answer,
        running: () => running,
        waitMs: hubWait,
      })
  );
  $effect(() => caw.stand());
  // The flip the frame opens on, as the person just made it.
  $effect(() => caw.opensOn(asked, projectName));
</script>

<div
  class="min-h-(--frame-h) bg-surface-page px-space-4 py-space-3"
  style:--frame-h={`${height}px`}
>
  <div class="w-full max-w-c-panel-w">
    <CawSeatSwitch lead={caw} {projectId} {projectName} />
  </div>
</div>
