<script lang="ts">
  import type { Snippet } from "svelte";
  import type { ClassValue } from "svelte/elements";
  /**
   * A tray's raised body: on a desk the inner box of the dialog's recess
   * tray, on a phone the drawer's bottom sheet, which scrolls inside the
   * sheet's room and carries its grabber. `class` lays out what it holds;
   * `deskPad` is its padding on a desk.
   */
  import { grabberVariants } from "#lib/components/ui/drawer/drawer-content.svelte";
  import { cn } from "#lib/utils.js";
  import type { Form } from "./words";

  let {
    form,
    class: layout,
    deskPad,
    children,
  }: {
    form: Form;
    class: ClassValue;
    deskPad: "p-space-4" | "p-space-5";
    children: Snippet;
  } = $props();
</script>

<div
  class={cn(
    "relative grid min-w-0",
    "bg-surface-raised",
    form === "desk"
      ? ["rounded-lg", deskPad]
      : "max-h-(--sheet-room) overflow-y-auto overscroll-contain rounded-t-lg px-space-4 pb-safe-space-4",
    layout
  )}
  data-slot="body"
>
  {#if form === "phone"}
    <div aria-hidden="true" class={grabberVariants()}></div>
  {/if}
  {@render children()}
</div>
