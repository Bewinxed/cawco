<script lang="ts">
  /**
   * A tray's surface: on a desk the dialog's recess tray holding its raised
   * body, concentric (--tray-pad); on a phone the drawer's bottom sheet,
   * full-bleed. The body's props are TrayBody's.
   */
  import type { ComponentProps } from "svelte";
  import TrayBody from "./TrayBody.svelte";

  let { form, ...body }: ComponentProps<typeof TrayBody> = $props();
</script>

<div
  style:--tray-pad="calc(var(--radius-modal) - var(--radius-lg))"
  class={[
    "relative min-w-0",
    form === "desk"
      ? "rounded-modal bg-surface-recess p-(--tray-pad) shadow-overlay"
      : "rounded-t-lg border-t border-border-hairline bg-surface-raised shadow-drawer",
  ]}
  data-slot="surface"
>
  <TrayBody {form} {...body} />
</div>
