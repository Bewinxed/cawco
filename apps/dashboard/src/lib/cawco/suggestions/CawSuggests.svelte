<script lang="ts">
  /**
   * Caw's suggestion: the next row a list would hold, offered (a routine he
   * would run, a set he would trim). It stands on the page where that row
   * would go, under the list's card, never inside it: a suggestion is not
   * there until it is taken, so it has no card of its own, only the
   * suggestion's edge, coral and dotted, where the card's edge would be.
   * Solid coral is where the person acts now (DESIGN.md, The Coral Is
   * Where You Act Rule); the dotted coral is an offer. So its act is the
   * kit's outline button, never the coral one.
   *
   * It is laid on the list's own row grid (DESIGN.md, The Row Grid Rule):
   * Caw, its mark, centred in the 28px lead column; what he suggests and
   * why on the text column `space-3` after it; its acts ending on the
   * trailing edge `space-3` in. The edge is an outline drawn inside the
   * box, so the columns stand where the card's rows put theirs. Under a
   * phone's width its acts move under its words, still on that edge.
   *
   * Taken, it is gone: the place draws the real thing as one of its rows.
   * This component holds no state of its own.
   */
  import type { CawStatus } from "@cawco/core/project-conversation";
  import Caw from "#lib/cawco/home/Caw.svelte";
  import { Button } from "#lib/components/ui/button/index.js";

  /** Caw's still: wider than the lead column, centred on its axis, so it stands on the marks above it. */
  const CAW_SIZE = 40;

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
  class="@container w-full min-w-0 rounded-lg outline-2 -outline-offset-2 outline-brand-solid outline-dotted"
>
  <div
    class="grid min-h-c-ledger-row-h grid-cols-(--row-cols) items-center gap-x-space-3 gap-y-space-2 px-space-3 py-space-2 @max-phone:grid-cols-(--row-cols-phone)"
    style:--row-cols="var(--c-row-lead) minmax(0, 1fr) auto"
    style:--row-cols-phone="var(--c-row-lead) minmax(0, 1fr)"
  >
    <div aria-hidden="true" class="flex w-c-row-lead justify-center *:shrink-0">
      <Caw size={CAW_SIZE} status={caw} still />
    </div>
    <div class="flex min-w-0 flex-col gap-space-row">
      <p class="m-0 type-label text-ink-row">{title}</p>
      <p class="m-0 type-meta text-pretty text-ink-muted">{reason}</p>
    </div>
    <div
      class="flex items-center justify-end gap-space-2 @max-phone:col-start-2"
    >
      {#if dismiss && ondismiss}
        <Button onclick={ondismiss} size="sm" variant="ghost">{dismiss}</Button>
      {/if}
      <Button onclick={onaccept} size="sm" variant="outline">{act}</Button>
    </div>
  </div>
</section>
