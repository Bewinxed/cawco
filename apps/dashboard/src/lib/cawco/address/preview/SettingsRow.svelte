<script lang="ts">
  import { Button } from "#lib/components/ui/button/index.js";
  import { LiveDot } from "#lib/components/ui/live-dot/index.js";
  /**
   * The word address in Configure › Devices (beside Require paired
   * devices and the paired devices: how your devices reach the dashboard,
   * the page hub-auth.ts sends a device to be approved on): its name, where it stands in one line,
   * and the one button that becomes the tray (Set up before it has
   * started, Open after). The only way in on a network that can't carry
   * the word, and where it is seen later once live. Its caller says where
   * the work stands, so the kept tray and the flow both stand it.
   */
  import Words from "../Words.svelte";

  let {
    line,
    started,
    hidden = false,
    button = $bindable(null),
    onopen,
  }: {
    /** Where the work stands, in one line. */
    line: { text: string; live: boolean };
    /** The set-up has begun (or is live): its button opens it again. */
    started: boolean;
    /** The tray floats over the button: the button keeps its room unseen. */
    hidden?: boolean;
    button?: HTMLElement | null;
    onopen: () => void;
  } = $props();
</script>

<div
  class="flex min-w-0 flex-wrap items-center gap-x-space-4 gap-y-space-2 py-space-3"
  data-settings-row
>
  <div class="grid min-w-0 flex-1 gap-space-row">
    <span class="type-label text-ink-strong">Word address</span>
    <span
      class="mark-line flex min-w-0 items-start gap-space-2 type-meta text-ink-muted"
    >
      {#if line.live}
        <span class="mark-cell"><LiveDot /></span>
      {/if}
      <span class="mark-text min-w-0"><Words text={line.text} /></span>
    </span>
  </div>
  <span class={["flex-none", hidden && "invisible"]}>
    <Button
      bind:ref={button}
      data-settings-open
      label={started ? "Open" : "Set up"}
      onclick={onopen}
      size="sm"
      variant="outline"
    />
  </span>
</div>
