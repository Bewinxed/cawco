<script lang="ts">
  /**
   * A context menu for a row in a long list: its machinery (the kit's Root,
   * Trigger and whatever the menu holds) is built the first time a pointer
   * or the focus reaches its trigger, then kept. Built for every row as the
   * row was drawn, the menu was half of what a session row cost to draw, and
   * a tree of 140 rows opened in one task of 80ms.
   *
   * The trigger is the caller's element, drawn once: `trigger` is handed the
   * props to spread on it. At rest they are what the kit's trigger puts on
   * an element whose menu is shut (`REST`), so it looks, focuses and answers
   * a held finger (utils/longpress, by `data-slot`) the same before and
   * after; once built, they are the kit trigger's own, handed over by
   * `context-menu-lazy-props`. A pointer is over the trigger, or the focus
   * in it, before it can be right-clicked, held or sent the menu key, so the
   * kit's handlers are on it by then.
   *
   *   <ContextMenu.Lazy>
   *     {#snippet trigger(props)}<a {...props} href="…">…</a>{/snippet}
   *     <ContextMenu.Content>…</ContextMenu.Content>
   *   </ContextMenu.Lazy>
   */
  import type { Snippet } from "svelte";
  import { cn } from "#lib/utils.js";
  import ContextMenu from "./context-menu.svelte";
  import LazyProps from "./context-menu-lazy-props.svelte";
  import ContextMenuTrigger from "./context-menu-trigger.svelte";

  type TriggerProps = Record<string, unknown>;

  let {
    class: className,
    trigger,
    children,
  }: {
    /** The trigger's own classes, beside the kit's. */
    class?: string;
    /** The element the menu opens from, spreading these props. */
    trigger: Snippet<[TriggerProps]>;
    /** The menu: its Content, built with the rest. */
    children: Snippet;
  } = $props();

  /** A pointer or the focus has reached the trigger: the menu is built. */
  let asked = $state(false);
  /** The kit trigger's props, once it is built. */
  let live = $state.raw<(() => TriggerProps) | null>(null);

  const ask = () => {
    asked = true;
  };

  /**
   * What the kit's trigger (ContextMenuTrigger over bits-ui's) puts on its
   * element while its menu is shut, less its id. `data-state` is here so
   * that building the menu changes no attribute a list's reflow listens for
   * (motion/rows).
   */
  const rest = $derived<TriggerProps>({
    class: cn("cn-context-menu-trigger select-none", className),
    "data-slot": "context-menu-trigger",
    "data-state": "closed",
    "data-context-menu-trigger": "",
    tabindex: -1,
    style: "pointer-events: auto;",
    onpointerover: ask,
    onfocusin: ask,
  });
</script>

{@render trigger(live?.() ?? rest)}
{#if asked}
  <ContextMenu>
    <ContextMenuTrigger class={className}>
      {#snippet child({
        props,
      })}
        <LazyProps
          {props}
          to={(read) => {
            live = read;
          }}
        />
      {/snippet}
    </ContextMenuTrigger>
    {@render children()}
  </ContextMenu>
{/if}
