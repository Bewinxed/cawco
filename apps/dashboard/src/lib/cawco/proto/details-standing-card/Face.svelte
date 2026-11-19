<script lang="ts">
  /**
   * A face of the Standing card: one of the three flows that take the card's
   * whole face (Move, Find folder, Tie tasks), in the same surface the
   * details stood in. Its head is Back and its name; its acts stand at its
   * end, pinned to the sheet's foot on a phone. On a desk what it says
   * stands in two columns that share their top edge, the first read first;
   * on a phone, one column in that order.
   */
  import type { Snippet } from "svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import { IconChevronLeft } from "#lib/icons.js";
  import { standingWords } from "./words";

  let {
    title,
    onback,
    form,
    lead,
    trail,
    wide,
    acts,
    go,
    backLabel,
  }: {
    title: string;
    onback: () => void;
    form: "card" | "sheet";
    /** What it says first. */
    lead: Snippet;
    /** What it says next: the second column on a desk. */
    trail?: Snippet;
    /** What needs the face's whole width, under both columns. */
    wide?: Snippet;
    acts?: Snippet;
    /** The act the face is for, at its end after Back. */
    go?: { label: string; disabled?: boolean; onclick: () => void };
    /** Back's word at the foot, beside `go`. */
    backLabel?: string;
  } = $props();
</script>

<div class="flex min-w-0 flex-col" data-face={title}>
  <!-- On a phone the sheet's own head names the face: Back stands alone. -->
  <div
    class={[
      "flex min-w-0 items-center gap-space-2",
      form === "card" && "px-space-3 pt-space-3",
    ]}
  >
    <Button
      aria-label={standingWords.back}
      onclick={onback}
      size="icon-sm"
      tone="quiet"
      variant="ghost"
    >
      <IconChevronLeft aria-hidden="true" />
    </Button>
    {#if form === "card"}
      <h2 class="m-0 min-w-0 truncate type-label text-ink-strong">{title}</h2>
    {/if}
  </div>
  <div
    class={[
      "grid min-w-0 gap-x-space-8 gap-y-space-5 pt-space-3 pb-space-5",
      form === "card" && "px-space-5",
      form === "card" && trail ? "grid-cols-2" : "grid-cols-1",
    ]}
  >
    <div class="flex min-w-0 flex-col gap-space-5">{@render lead()}</div>
    {#if trail}
      <div class="flex min-w-0 flex-col gap-space-5">{@render trail()}</div>
    {/if}
    {#if wide}
      <div
        class={[
          "flex min-w-0 flex-col gap-space-5",
          form === "card" && trail && "col-span-2",
        ]}
      >
        {@render wide()}
      </div>
    {/if}
  </div>
  {#if acts || go}
    <div
      class={[
        "flex min-w-0 items-center justify-end gap-space-2 pb-space-5",
        form === "card" && "px-space-5",
        form === "sheet" &&
          "sticky bottom-0 border-t border-t-border-hairline bg-surface-raised pt-space-3",
      ]}
    >
      {@render acts?.()}
      {#if go}
        <Button onclick={onback} size="sm" variant="ghost"
          >{backLabel ?? standingWords.move.back}</Button
        >
        <Button disabled={go.disabled} onclick={go.onclick} size="sm"
          >{go.label}</Button
        >
      {/if}
    </div>
  {/if}
</div>
