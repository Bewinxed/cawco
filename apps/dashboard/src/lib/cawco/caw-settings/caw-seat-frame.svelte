<script lang="ts">
  /**
   * Caw's seat on the project head in a states frame (CawSeatSwitch.stories):
   * his seat and switch at the head's leading edge, the head's own inset
   * round them, fed the page's Caw of the fixtures ({@link FixtureCaw}). A
   * flip the person has just made is `asked`, made through the switch's own
   * path (`flipCaw`) as the frame opens: off, with what he started
   * running, asks through the Caw-off confirm hung from the switch's glass.
   */
  import { untrack } from "svelte";
  import { flipCaw } from "#lib/cawco/project/CawLeadSwitch.svelte";
  import { cawSeatAt } from "#lib/cawco/stop-work.svelte.js";
  import CawSeatSwitch from "./CawSeatSwitch.svelte";
  import { FixtureCaw } from "./caw-settings.fixtures.svelte";

  let {
    projectId,
    projectName = "cockpit",
    on = true,
    running = false,
    asked = null,
    height = 0,
  }: {
    /** The project, one per story: its Caw-off job is kept by it. */
    projectId: string;
    projectName?: string;
    /** He is awake as the head is drawn. */
    on?: boolean;
    /** What his chat started still runs as he is turned off. */
    running?: boolean;
    /** The person has just flipped him, as the frame opens. */
    asked?: "on" | "off" | null;
    /** The frame's least height, px: room for the confirm under the switch. */
    height?: number;
  } = $props();

  const caw = $derived(new FixtureCaw({ on, running, refuses: false }));
  // The flip the frame opens on, as the person just made it.
  $effect(() => {
    if (asked) {
      const flipped = { id: projectId, name: projectName };
      untrack(() =>
        flipCaw(caw, flipped, asked === "on", cawSeatAt(projectId))
      );
    }
  });
</script>

<div
  class="min-h-(--frame-h) bg-bg px-space-4 py-space-3"
  style:--frame-h={`${height}px`}
>
  <div class="w-full max-w-95">
    <CawSeatSwitch lead={caw} {projectId} {projectName} />
  </div>
</div>
