<script lang="ts">
  /**
   * A setting's save, said in its group's head: Saving… with a pulse, Saved
   * with a tick, or Not saved with the fail glyph, nothing while idle. One
   * grid cell the words cross-fade in, so the head keeps its height whatever
   * it says. Models › Images and Helpers & step lists draw it.
   */
  import { blur } from "svelte/transition";
  import { LiveDot } from "#lib/components/ui/live-dot/index.js";
  import { IconError, IconTick } from "#lib/icons.js";
  import { dur, easeOut } from "#lib/platform/motion/curves.svelte.js";

  let {
    phase,
    words,
  }: {
    phase: "idle" | "saving" | "saved" | "failed";
    words: { saving: string; saved: string; notSaved: string };
  } = $props();

  const lineBlur = (tier: "--duration-slow" | "--duration-base") => ({
    duration: dur(tier),
    easing: easeOut,
    amount: 2,
  });
</script>

<p
  aria-live="polite"
  class="mark-line m-0 grid min-h-control-sm items-center type-meta text-tx-2"
  data-slot="save"
>
  {#key phase}
    <span
      class="mark-line col-start-1 row-start-1 flex items-center gap-space-2"
      in:blur={lineBlur("--duration-slow")}
      out:blur={lineBlur("--duration-base")}
    >
      {#if phase === "saving"}
        <LiveDot data-pulse size="row" tone="muted" />
        <span>{words.saving}</span>
      {:else if phase === "saved"}
        <IconTick class="size-icon-md flex-none text-green" />
        <span class="text-tx">{words.saved}</span>
      {:else if phase === "failed"}
        <IconError aria-hidden="true" class="size-icon-md flex-none text-red" />
        <span class="text-red">{words.notSaved}</span>
      {/if}
    </span>
  {/key}
</p>
