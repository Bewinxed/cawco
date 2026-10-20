<script lang="ts">
  import { TooltipProvider } from "#lib/components/ui/tooltip/index.js";
  /**
   * The top bar's trailing group (Shell `.tools`, DESIGN.md "Top bar's
   * trailing edge") with its state as props, for its states files: the
   * glass capsule and its items as Shell draws them on a conversation, with
   * only the open choices switchable and the counts gone (Apple HIG,
   * Toolbars). Shell lays the group out by media query; the canvas draws
   * every frame in one window, so here the form is a prop and the phone's
   * rules hang off `data-form="phone"` instead of `width < 900px`.
   *
   * - Desk: the bar's trailing end on a conversation (the hosting bar's
   *   shelf), Files, Jump, the machines, then Caw's head at the edge.
   * - Phone: Caw alone on his own glass, a tab tucked into the screen's
   *   trailing edge (Files, Jump and the machines live in the sidebar).
   *
   * The three choice points: `mark` (how a machine problem shows), `files`
   * (whether Files marks new files) and `jump` (the search glyph's size).
   * `hover` draws one item under the pointer, as `.bar-item:hover` does:
   * the canvas forces hover on a whole frame, which would light every item.
   */
  import Tip from "#lib/components/ui/tooltip/tip.svelte";
  import { IconSearch } from "#lib/icons.js";
  import FilesItem from "../files/FilesItem.svelte";
  import NeedsCaw from "../NeedsCaw.svelte";
  import FilesDot from "./FilesDot.svelte";
  import { AT_REST, type FleetMachine } from "./fixtures";
  import MachinesItem from "./MachinesItem.svelte";

  type Item = "files" | "jump" | "machines" | "caw";

  let {
    form,
    machines = AT_REST,
    mark = "badge",
    files = "none",
    fresh = false,
    jump = 20,
    hover = null,
  }: {
    form: "desk" | "phone";
    machines?: readonly FleetMachine[];
    mark?: "badge" | "tint";
    files?: "none" | "dot";
    /** New files since Files was last opened (the dot option draws it). */
    fresh?: boolean;
    jump?: 20 | 16;
    hover?: Item | null;
  } = $props();

  const ITEMS: Record<Item, string> = {
    files: "[data-files-control]",
    jump: ".jump",
    machines: "[data-machines]",
    caw: "[data-needs-caw]",
  };

  let group = $state<HTMLElement | null>(null);
  $effect(() => {
    if (!group) {
      return;
    }
    for (const [item, selector] of Object.entries(ITEMS)) {
      group
        .querySelector(selector)
        ?.toggleAttribute("data-hovered", item === hover);
    }
  });
</script>

<TooltipProvider>
  <div data-slot="bar" class="bar" data-form={form}>
    <div bind:this={group} data-slot="tools" class="tools" data-bar-group>
      {#if form === "desk"}
        {#if files === "dot"}
          <FilesDot {fresh} />
        {:else}
          <FilesItem count={null} />
        {/if}
        <Tip keys="⌘K" label="Jump to session">
          {#snippet children(tip)}
            <button
              data-bar-item
              {...tip}
              aria-haspopup="dialog"
              aria-label="Jump to session"
              class="bar-item jump touch-hit press-tint"
              data-glyph={jump}
              type="button"
            >
              <IconSearch aria-hidden="true" />
            </button>
          {/snippet}
        </Tip>
        <MachinesItem {machines} {mark} />
      {/if}
      <NeedsCaw />
    </div>
  </div>
</TooltipProvider>

<style>
  /* The bar's trailing end on a conversation (Shell `.top.hosting`): its
     shelf and bottom hairline, the group the content's right pad in. */
  .bar {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    block-size: var(--c-top-bar-h);
    padding-inline-end: var(--space-6);
    /* The hairline in the bar's bottom pixel, as Shell's gradient lays it,
       drawn as a border so the ground is one colour the probe kit can read
       its paint from; a pixel of padding on top keeps the group centred on
       the bar's 44px, where Shell's stands. */
    padding-block-start: 1px;
    border-block-end: 1px solid var(--border-hairline);
    background: var(--surface-shelf);
  }
  /* Shell `.tools`: one container of the panel's glass, a capsule on the
     bar's control height whose items sit concentric inside it. */
  .tools {
    position: relative;
    display: flex;
    align-items: center;
    gap: var(--c-bar-group-pad);
    block-size: var(--c-btn-h);
    padding: var(--c-bar-group-pad);
    border-radius: var(--radius-pill);
  }
  .tools::before {
    content: "";
    position: absolute;
    inset: 0;
    border: 1px solid var(--border-hairline);
    border-radius: inherit;
    background: var(--material-panel);
    box-shadow: var(--shadow-tile);
    backdrop-filter: blur(calc(var(--material-blur) * 1.4))
      saturate(var(--material-saturate));
    pointer-events: none;

    @media (prefers-contrast: more), (prefers-reduced-transparency: reduce) {
      background: var(--surface-raised);
      backdrop-filter: none;
      border-color: var(--border-contrast);
    }
  }
  /* Shell `.tools .bar-item`: borderless, on the glass, one height and one
     symbol size, in the bar's one ink. */
  .tools :global(.bar-item) {
    position: relative;
    display: inline-flex;
    flex: none;
    align-items: center;
    justify-content: center;
    min-inline-size: var(--c-bar-item);
    block-size: var(--c-bar-item);
    border: 0;
    border-radius: var(--radius-pill);
    background: none;
    color: var(--ink-strong);
    cursor: pointer;
    transition: var(--transition-control);
  }
  .tools :global(.bar-symbol) {
    inline-size: var(--c-bar-symbol);
    block-size: var(--c-bar-symbol);
    color: var(--ink-muted);
  }
  @media (hover: hover) and (pointer: fine) {
    .tools :global(.bar-item:hover) {
      background: var(--surface-hover);
    }
  }
  /* One item under the pointer (`hover`). */
  .tools :global(.bar-item[data-hovered]) {
    background: var(--surface-hover);
  }
  /* Jump's search glyph in the group's muted ink: at the group's symbol
     size (proposed), or today's 16px (`--icon-md`). */
  .tools :global(.jump > svg) {
    inline-size: var(--c-bar-symbol);
    block-size: var(--c-bar-symbol);
    color: var(--ink-muted);
  }
  .tools :global(.jump[data-glyph="16"] > svg) {
    inline-size: var(--icon-md);
    block-size: var(--icon-md);
  }

  /* Shell's phone row (`width < 900px`): the bar floats over the tab row's
     shelf, Caw's glass a tab tucked into the screen's trailing edge, square
     on that side, topping with the tabs. */
  .bar[data-form="phone"] {
    align-items: flex-start;
    padding-block-start: 0;
    padding-inline-end: 0;
    border-block-end: 0;
  }
  .bar[data-form="phone"] .tools {
    block-size: var(--c-bar-caw-glass-phone);
    margin-block-start: calc(var(--c-top-bar-h) - var(--c-tab-row-h));
    padding: 0;
    border-radius: calc(var(--c-bar-caw-glass-phone) / 2) 0 0
      calc(var(--c-bar-caw-glass-phone) / 2);
  }
  .bar[data-form="phone"] .tools::before {
    border-inline-end-width: 0;
  }
  .bar[data-form="phone"] .tools :global(.bar-item) {
    inline-size: var(--c-bar-caw-glass-phone);
    min-inline-size: var(--c-bar-caw-glass-phone);
    block-size: var(--c-bar-caw-glass-phone);
  }
</style>
