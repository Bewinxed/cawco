<script lang="ts">
  /**
   * A tray's actions: on a desk one row at its end, the primary last; on a
   * phone a column of full-width 44px buttons. `center`: a failure's, on a
   * desk. Further attributes go to the row.
   */
  import type { HTMLAttributes } from "svelte/elements";
  import TrayPress from "./TrayPress.svelte";
  import type { Form, Press } from "./words";

  let {
    form,
    primary,
    secondary,
    center = false,
    ...rest
  }: HTMLAttributes<HTMLDivElement> & {
    form: Form;
    primary: Press;
    secondary?: Press;
    center?: boolean;
  } = $props();

  const size = $derived(form === "phone" ? "lg" : "default");
</script>

<div
  {...rest}
  class={[
    form === "desk"
      ? "flex flex-wrap justify-end gap-space-2"
      : "grid gap-space-2",
    center && form === "desk" && "justify-center",
  ]}
>
  {#if secondary}
    <TrayPress press={secondary} {size} variant="outline" />
  {/if}
  <TrayPress press={primary} primary {size} />
</div>
