<script lang="ts" module>
  import type { HTMLAttributes } from "svelte/elements";

  /**
   * What a kit content hands a `child` snippet: bits-ui's (its static part's
   * open state and props) and the layer's own box (`wrapperProps`,
   * anchored.svelte.ts `layerProps`), which the snippet spreads on the
   * element round its surface.
   */
  export interface FloatingSnippet {
    open: boolean;
    props: Record<string, unknown>;
    wrapperProps: HTMLAttributes<HTMLDivElement>;
  }
</script>

<script lang="ts">
  /**
   * A floating surface's own elements, drawn through its static Content
   * primitive's `child` (the popover's, the dropdown and context menus' and
   * their submenus', the select's): its layer's box (`wrapper`,
   * anchored.svelte.ts `layerProps`), which stands it on its anchor, round
   * the surface, drawn while bits-ui's presence says so, and closing, it
   * takes no press (floating-presence). A surface under bits-ui's
   * forceMount hands its presence among its props (`shouldRender`); a
   * submenu, mounted by bits-ui only while it is drawn (`mounted`), hands
   * none. A
   * caller's own `child` stands in for them, handed the box as
   * `wrapperProps`. `inertClosed`: closing, it takes no focus either (a
   * menu whose item gave the focus away). `attach`: what the surface itself
   * carries.
   */
  import type { Snippet } from "svelte";
  import type { Attachment } from "svelte/attachments";
  import { drawn, own, pressable } from "./floating-presence.js";

  let {
    snippet,
    wrapper,
    forceMount,
    mounted = false,
    callerChild,
    children,
    inertClosed = false,
    attach,
  }: {
    snippet: { open: boolean; props: Record<string, unknown> };
    wrapper: HTMLAttributes<HTMLDivElement>;
    forceMount?: boolean;
    mounted?: boolean;
    callerChild?: Snippet<[FloatingSnippet]>;
    children?: Snippet;
    inertClosed?: boolean;
    attach?: Attachment<HTMLElement>;
  } = $props();

  /** Kept drawn by its site, mounted only while drawn, or drawn while bits-ui's presence says so. */
  const shown = $derived(forceMount || mounted || drawn(snippet.props));
</script>

{#if shown}
  {#if callerChild}
    {@render callerChild({ ...snippet, wrapperProps: wrapper })}
  {:else}
    <div {...wrapper} style:pointer-events={pressable(snippet.open)}>
      <div
        {...own(snippet.props)}
        inert={inertClosed ? !snippet.open : undefined}
        style:pointer-events={pressable(snippet.open)}
        {@attach attach}
      >
        {@render children?.()}
      </div>
    </div>
  {/if}
{/if}
