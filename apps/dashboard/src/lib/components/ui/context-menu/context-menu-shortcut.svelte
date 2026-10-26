<script lang="ts">
  import type { ComponentProps } from "svelte";
  import MenuShortcut from "../menu-shortcut.svelte";

  let {
    ref = $bindable(null),
    ...restProps
  }: Omit<ComponentProps<typeof MenuShortcut>, "menu"> = $props();
</script>

<MenuShortcut menu="context-menu" bind:ref {...restProps} />
