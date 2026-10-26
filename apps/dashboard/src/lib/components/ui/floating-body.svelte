<script lang="ts" module>
  /** What bits-ui hands a forceMount content's `child` snippet. */
  export interface FloatingSnippet {
    open: boolean;
    props: Record<string, unknown>;
    wrapperProps: Record<string, unknown>;
  }
</script>

<script generics="S extends FloatingSnippet" lang="ts">
  /**
   * A floating surface's own elements, drawn through its Content primitive's
   * `child` under bits-ui's forceMount (the popover's, the dropdown menu's,
   * the context menu's): drawn while its presence says so, and closing, it
   * takes no press (floating-presence). A caller's own `child` stands in
   * for them. `inertClosed`: closing, it takes no focus either (a menu whose
   * item gave the focus away). `attach`: what the surface itself carries.
   */
  import type { Snippet } from "svelte";
  import type { Attachment } from "svelte/attachments";
  import { drawn, own, pressable } from "./floating-presence.js";

  let {
    snippet,
    forceMount,
    callerChild,
    children,
    inertClosed = false,
    attach,
  }: {
    snippet: S;
    forceMount?: boolean;
    callerChild?: Snippet<[S]>;
    children?: Snippet;
    inertClosed?: boolean;
    attach?: Attachment<HTMLElement>;
  } = $props();
</script>

{#if forceMount || drawn(snippet.props)}
  {#if callerChild}
    {@render callerChild(snippet)}
  {:else}
    <div
      {...snippet.wrapperProps}
      style:pointer-events={pressable(snippet.open)}
    >
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
