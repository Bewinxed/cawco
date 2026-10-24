<script lang="ts" module>
  import { getContext, setContext } from "svelte";

  const HOST = Symbol("msgrow-sheet-host");

  /**
   * Where the drawings' bottom sheets stand: the phone frame they belong
   * to (msgrow-frame), which is the box its fixed layers are placed in, so
   * the sheet rises from that frame's foot and not the canvas window's.
   */
  export const hostSheets = (host: () => HTMLElement | undefined) =>
    setContext(HOST, host);
  const sheetHost = () =>
    getContext<(() => HTMLElement | undefined) | undefined>(HOST);
</script>

<script lang="ts">
  /**
   * A touch screen's way to a message's actions, where nothing hovers: one
   * 24px handle (menu-dots) standing at rest, its finger's 44px area the
   * kit's, opening the kit's bottom sheet with Copy, Edit and Fork from here
   * as the kit's rows, 44px each under a finger.
   */
  import { Button } from "#lib/components/ui/button/index.js";
  // biome-ignore lint/performance/noNamespaceImport: the kit's compound sheet, as every sheet of the app imports it
  import * as Drawer from "#lib/components/ui/drawer/index.js";
  import { menuItemVariants } from "#lib/components/ui/menu-item/index.js";
  import { IconCopy, IconFork, IconMore, IconPenLine } from "#lib/icons.js";

  let { open = false, class: extra }: { open?: boolean; class?: string } =
    $props();

  const ACTS = [
    { label: "Copy", icon: IconCopy },
    { label: "Edit", icon: IconPenLine },
    { label: "Fork from here", icon: IconFork },
  ];

  const host = sheetHost();
  let shown = $state(false);
  $effect.pre(() => {
    shown = open;
  });
</script>

<Drawer.Root bind:open={shown} modal={false} shouldScaleBackground={false}>
  <Drawer.Trigger>
    {#snippet child({ props })}
      <Button
        {...props}
        aria-label="Message actions"
        class={extra}
        data-slot="handle"
        size="icon-xs"
        variant="ghost"
      >
        <IconMore aria-hidden="true" />
      </Button>
    {/snippet}
  </Drawer.Trigger>
  {#if host?.()}
    <!-- Placed at its frame's foot: the frame is the box its fixed layers
         stand in, and the visible area the kit measures is the canvas
         window's, not the frame's. -->
    <Drawer.Content
      class="top-full"
      modal={false}
      portalProps={{ to: host() }}
      title="Message"
    >
      <div data-slot="message-sheet" class="flex flex-col">
        {#each ACTS as act (act.label)}
          <button
            class={[
              menuItemVariants(),
              "flex items-center gap-space-3 px-space-3 text-label text-ink-strong can-hover:hover:bg-surface-hover",
            ]}
            data-menu-item
            type="button"
            ><act.icon aria-hidden="true" data-box /><span>{act.label}</span
            ></button
          >
        {/each}
      </div>
    </Drawer.Content>
  {/if}
</Drawer.Root>
