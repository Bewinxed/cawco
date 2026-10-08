<script lang="ts" module>
  import { cawco } from "./client.svelte";

  /** How many machines are online: the button's number, and the phone sidebar's. */
  export const machinesOnline = (): number =>
    cawco.machines.filter((machine) => machine.status === "online").length;
</script>

<script lang="ts">
  /**
   * The machines, one click away in the wide bar's icon group rather than
   * always on screen: an item of the group (Shell's `.bar-item`), its glyph
   * and the number online in the bar's one ink (Apple HIG, Toolbars: "Reduce
   * the use of toolbar backgrounds and tinted controls"). A machine down, or
   * one that needs a hand (behind the hub, a stuck sync), is a badge on the
   * glyph's corner, the bar's badge in the fail or attention pair, saying
   * how many, so it is still seen without the list and never by hue alone.
   * The popover is the machines' list (MachinesList). The home's Check
   * machines opens it too (join `machinesPopover`). A phone has no room for
   * it in the bar: the machines are in its sidebar.
   */
  import { mergeProps } from "bits-ui";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte component-group convention
  import * as Popover from "#lib/components/ui/popover/index.js";
  import Tip from "#lib/components/ui/tooltip/tip.svelte";
  import { IconServer } from "#lib/icons.js";
  import { home } from "./home/home-state.svelte";
  import { machinesPopover } from "./join/join.svelte";
  import MachinesList from "./MachinesList.svelte";

  let content = $state<HTMLElement | null>(null);
  /**
   * The last thing that could open the popover was a pointer press, not a
   * key: its own button, or the home's Check machines.
   */
  let byPointer = false;

  const online = $derived(machinesOnline());
  /** What the badge says at a glance: machines down, ones in trouble, or nothing. */
  const trouble = $derived.by(() => {
    const down = cawco.machines.filter(
      (machine) => machine.status !== "online"
    ).length;
    if (down > 0) {
      return { tone: "fail", count: down, words: `${down} offline` } as const;
    }
    const stuck = home.exceptions.length;
    return stuck > 0
      ? ({ tone: "attn", count: stuck, words: `${stuck} need a hand` } as const)
      : null;
  });
  const label = $derived(
    trouble
      ? `Machines, ${online} online, ${trouble.words}`
      : `Machines, ${online} online`
  );
</script>

<svelte:window
  onkeydowncapture={() => {
    byPointer = false;
  }}
  onpointerdowncapture={() => {
    byPointer = true;
  }}
/>

<Popover.Root
  bind:open={
    () => machinesPopover.open,
    (value) => {
    machinesPopover.open = value;
  }
  }
>
  <Tip label="Machines">
    {#snippet children(
      tip
    )}
      <Popover.Trigger>
        {#snippet child({
          props,
        })}
          <button
            {...mergeProps(props, tip)}
            aria-label={label}
            class="bar-item machines touch-hit"
            type="button"
          >
            <span class="glyph">
              <IconServer aria-hidden="true" class="bar-symbol" />
              {#if trouble}
                <span class="bar-badge" data-tone={trouble.tone}
                  >{trouble.count}</span
                >
              {/if}
            </span>
            <span class="num">{online}</span>
          </button>
        {/snippet}
      </Popover.Trigger>
    {/snippet}
  </Tip>
  <Popover.Content
    align="end"
    aria-label="Machines"
    class="machines-pop w-[min(20rem,calc(100vw-16px))] gap-0"
    collisionPadding={8}
    onOpenAutoFocus={(event) => {
      // Opened by a press, focus goes into the list as it does from a key,
      // but without the ring: a script's focus would draw it after a press.
      if (byPointer) {
        event.preventDefault();
        content
          ?.querySelector<HTMLElement>(".row")
          ?.focus({ focusVisible: false } as FocusOptions);
      }
    }}
    side="bottom"
    sideOffset={6}
    bind:ref={content}
  >
    <MachinesList
      onleave={() => {
        machinesPopover.open = false;
      }}
    />
  </Popover.Content>
</Popover.Root>

<style>
  /* The number reads beside its glyph; the badge rides the glyph's corner. */
  .machines {
    gap: var(--space-2);
    padding-inline: var(--space-2) var(--space-3);
  }
  .glyph {
    position: relative;
    display: grid;
  }
  /* Over the glyph's top-trailing corner, its ring inside the glass and
     clear of the number beside it. */
  .glyph > .bar-badge {
    inset-block-start: calc(var(--c-bar-chip-ring) - var(--c-bar-chip) / 2);
    inset-inline-end: calc(-1 * var(--c-bar-chip-ring));
  }
  .num {
    font: var(--type-label);
    font-variant-numeric: tabular-nums;
  }
  /* Opens with a short scale from its corner, closes faster. */
  :global(.kit-pop.machines-pop) {
    --pop-scale: 0.97;
    --pop-rise: 0px;
    transition-timing-function: var(--ease-out);
  }
  :global(.kit-pop.machines-pop:not([data-state="closed"])) {
    transition-duration: var(--dur-menu);
  }
</style>
