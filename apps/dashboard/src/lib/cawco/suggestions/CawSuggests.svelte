<script lang="ts">
  /**
   * Caw's suggestion: the way Caw offers the person something they could
   * switch on (a routine he would run, a set he would trim). Caw himself
   * stands at its lead, then what he suggests, why in one line, and its
   * one act; a second, quiet act waves it away where the place lets it be
   * waved away.
   *
   * Its edge is the suggestion's own: coral, dotted. Solid coral is where
   * the person acts now (DESIGN.md, The Coral Is Where You Act Rule); the
   * dotted coral is an offer, something that is not there until they take
   * it. So its act is the kit's outline button, never the coral one: the
   * page keeps its one coral for what it is for.
   *
   * Taken, it is gone: the place draws the real thing where it stood (the
   * routine as a row among the routines). This component holds no state of
   * its own.
   */
  import type { CawStatus } from "@cawco/core/project-conversation";
  import Caw from "#lib/cawco/home/Caw.svelte";
  import { Button } from "#lib/components/ui/button/index.js";

  /** Side of Caw's still: three lines of the offer beside him. */
  const CAW_SIZE = 48;

  let {
    title,
    reason,
    act,
    onaccept,
    dismiss,
    ondismiss,
    label,
    caw = "ready",
  }: {
    /** What he suggests, as the thing is named once it exists. */
    title: string;
    /** Why, and what it would do: one plain sentence or two. */
    reason: string;
    /** The act that takes it ("Turn on"). */
    act: string;
    onaccept: () => void;
    /** The act that waves it away ("Not now"); left out, it cannot be waved away. */
    dismiss?: string;
    ondismiss?: () => void;
    /** Its accessible name ("Caw suggests a routine"). */
    label: string;
    /** How Caw stands while he offers it. */
    caw?: CawStatus;
  } = $props();
</script>

<section
  data-slot="caw-suggests"
  aria-label={label}
  class="@container w-full min-w-0"
>
  <div
    class="flex flex-col gap-space-3 rounded-lg border-2 border-dotted border-brand-solid p-space-3 @phone:flex-row @phone:items-center"
  >
    <div class="flex min-w-0 flex-1 items-center gap-space-3">
      <div aria-hidden="true" class="shrink-0">
        <Caw size={CAW_SIZE} status={caw} still />
      </div>
      <div class="flex min-w-0 flex-col gap-space-row">
        <p class="m-0 type-label text-ink-strong">{title}</p>
        <p class="m-0 type-meta text-pretty text-ink-muted">{reason}</p>
      </div>
    </div>
    <div class="flex shrink-0 items-center justify-end gap-space-2">
      {#if dismiss && ondismiss}
        <Button onclick={ondismiss} size="sm" variant="ghost">{dismiss}</Button>
      {/if}
      <Button onclick={onaccept} size="sm" variant="outline">{act}</Button>
    </div>
  </div>
</section>
