<script lang="ts">
  /**
   * Caw's panel on a fresh thread, on a sheet: the room his panel gives
   * (`--c-panel-w` docked beside the page, the whole width on a phone),
   * his hero (ThreadPane `.hero`: Caw at 80, "What's next for tidewater?"),
   * his starters, and his Composer at the foot. The starters are the one
   * starter component as cards, every card one size
   * (WorkColumnEmpty, the panel narrower than the column, so it is the
   * panel's own width).
   */
  import Composer from "#lib/cawco/transcript/Composer.svelte";
  import { ComposerDraft } from "#lib/cawco/transcript/composer-draft.svelte.js";
  import { BOARD_STARTERS, PROJECT_NAME } from "../../tasks/preview/tidewater";
  import WorkColumnEmpty from "../WorkColumnEmpty.svelte";

  let {
    phone = false,
  }: {
    /** A phone: his panel is the sheet across the screen. */
    phone?: boolean;
  } = $props();

  const draft = new ComposerDraft();
  let foot = $state(0);
  const title = `What’s next for ${PROJECT_NAME}?`;
</script>

<div
  class={[
    "flex min-h-c-caw-panel-h flex-col overflow-hidden rounded-lg bg-surface-recess shadow-drawer",
    phone ? "w-full" : "w-c-panel-w",
  ]}
  data-caw-panel
>
  <!-- ThreadPane's hero: the empty state's own room above it, on the
       composer's column (the panel is narrower, so --space-3 in). -->
  <div class="flex flex-auto flex-col px-space-3">
    <WorkColumnEmpty
      onpick={() => undefined}
      starters={BOARD_STARTERS}
      {title}
    />
  </div>
  <div
    class="relative flex-none"
    style:block-size="calc({foot}px + var(--space-4))"
  >
    <Composer
      agentName="Caw"
      {draft}
      onfoot={(next) => {
        foot = next.stack;
      }}
      onstop={() => undefined}
      onsubmit={() => undefined}
      placeholder="Message Caw"
    />
  </div>
</div>
