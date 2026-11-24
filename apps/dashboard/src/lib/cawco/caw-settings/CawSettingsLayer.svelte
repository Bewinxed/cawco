<script lang="ts">
  /**
   * Where Caw's settings open from the project head's `⋯ › Caw settings…`:
   * on a desk a popover hung from More with no padding of its own (the
   * panel's hero reaches its edges), as wide as the panel and as tall as
   * the room under More, scrolling past it; under the phone line the
   * drawer's bottom sheet, titled with the panel's name.
   *
   * `frame`: a states frame holds it (CawSettings.stories): it opens in
   * that box, its portals off, taking no focus and leaving the page under
   * it live, so the frame and its moves hold it.
   */
  import { cawSettingsWords as words } from "@cawco/core/words/caw-settings";
  import type { Snippet } from "svelte";
  import { MediaQuery } from "svelte/reactivity";
  import * as Drawer from "#lib/components/ui/drawer/index.js";
  import * as Popover from "#lib/components/ui/popover/index.js";
  import { PHONE_QUERY } from "#lib/hooks/is-mobile.svelte.js";

  let {
    open = $bindable(false),
    anchor,
    projectName,
    frame = null,
    panel,
  }: {
    open?: boolean;
    /** More, which it hangs from on a desk. */
    anchor: HTMLElement | null;
    projectName: string;
    /** The states frame it opens in; null on the page. */
    frame?: HTMLElement | null;
    /** The panel, told whether it stands in the sheet. */
    panel: Snippet<[boolean]>;
  } = $props();

  const phone = new MediaQuery(PHONE_QUERY);
  const framed = $derived(frame !== null);
  /** A frame's layer takes no focus from the page that holds it. */
  const keepFocus = (event: Event) => {
    if (framed) {
      event.preventDefault();
    }
  };
</script>

{#if phone.current}
  <Drawer.Root
    container={frame ?? undefined}
    dismissible={!framed}
    modal={!framed}
    bind:open
    shouldScaleBackground={!framed}
  >
    <Drawer.Content
      contained={framed}
      modal={!framed}
      onOpenAutoFocus={keepFocus}
      portalProps={{ disabled: framed }}
      title={words.panel(projectName)}
      trapFocus={!framed}
    >
      {@render panel(true)}
    </Drawer.Content>
  </Drawer.Root>
{:else}
  <Popover.Root bind:open>
    <Popover.Content
      align="end"
      aria-label={words.panel(projectName)}
      collisionPadding={12}
      customAnchor={anchor}
      height="available"
      onOpenAutoFocus={keepFocus}
      overflow="scroll"
      pad="none"
      portalProps={{ disabled: framed }}
      side="bottom"
      sideOffset={4}
      style="--pop-w: max-content"
      trapFocus={!framed}
      width="room"
    >
      {@render panel(false)}
    </Popover.Content>
  </Popover.Root>
{/if}
