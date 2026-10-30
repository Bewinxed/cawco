<script lang="ts">
  import type { ClassValue, HTMLAttributes } from "svelte/elements";
  /**
   * Where the address's work stands, in one line: the live dot before it
   * while it waits on something live. `class` places and sets it; further
   * attributes go to the line.
   */
  import { LiveDot } from "#lib/components/ui/live-dot/index.js";
  import { cn } from "#lib/utils.js";
  import Words from "./Words.svelte";

  let {
    line,
    class: look,
    ...rest
  }: HTMLAttributes<HTMLSpanElement> & {
    line: { text: string; live: boolean };
    class: ClassValue;
  } = $props();
</script>

<span
  {...rest}
  class={cn("mark-line flex min-w-0 items-start gap-space-2", look)}
>
  {#if line.live}
    <span class="mark-cell"><LiveDot /></span>
  {/if}
  <span class="mark-text min-w-0"><Words text={line.text} /></span>
</span>
