<script lang="ts" module>
  import { cawco } from "./client.svelte";

  /** How many machines are online: the phone sidebar's count. */
  export const machinesOnline = (): number =>
    cawco.machines.filter((machine) => machine.status === "online").length;
</script>

<script lang="ts">
  /**
   * The machines, one click away in the wide bar's glass group rather than
   * always on screen: an item of the group (Shell's `.bar-item`), its glyph
   * and the number of machines. The number is said once. Machines in
   * trouble (down, behind the hub, a stuck sync) tint the glyph in the
   * status hue, fail when any is down and attention otherwise; which ones
   * and what is wrong are words in the tooltip, the label and the popover
   * (DESIGN.md, The Glyph, Word, Hue Rule). The popover is the machines'
   * list (MachinesList). The home's Check machines opens it too (join
   * `machinesPopover`). A phone has no room for it in the bar: the machines
   * are in its sidebar.
   */
  import { machineLabel } from "@cawco/core";
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
  /**
   * The popover is closing on a press outside it: the press keeps its focus.
   * Non-modal (no trap), so a click on the composer or a rail row lands.
   */
  let closedOutside = false;

  const count = $derived(cawco.machines.length);
  /** The glyph's hue: fail when a machine is down, attention when one is in trouble. */
  const tone = $derived.by(() => {
    if (home.exceptions.length === 0) {
      return;
    }
    return cawco.machines.some((machine) => machine.status !== "online")
      ? "fail"
      : "attn";
  });
  const label = $derived.by(() => {
    const machines = `${count} ${count === 1 ? "machine" : "machines"}`;
    const stuck = home.exceptions.length;
    return stuck > 0
      ? `${machines}, ${stuck} ${stuck === 1 ? "needs" : "need"} attention`
      : machines;
  });
  const names = new Intl.ListFormat("en", { type: "conjunction" });
  /**
   * The machines in trouble by name, those with the same fault said
   * together ("Machines: mini and studio sync failed; air unreachable").
   */
  const tip = $derived.by(() => {
    if (home.exceptions.length === 0) {
      return "Machines";
    }
    const byFault = Map.groupBy(home.exceptions, ({ text }) => text);
    const clauses = [...byFault].map(([text, entries]) => {
      const who = entries.map(({ machineId }) => {
        const machine = cawco.machines.find(
          (entry) => entry.machineId === machineId
        );
        return machine ? machineLabel(machine.hostname) : machineId;
      });
      return `${names.format(who)} ${text}`;
    });
    return `Machines: ${clauses.join("; ")}`;
  });
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
  <Tip label={tip}>
    {#snippet children(
      tipProps
    )}
      <Popover.Trigger>
        {#snippet child({
          props,
        })}
          <button
            {...mergeProps(props, tipProps)}
            aria-label={label}
            class="bar-item machines touch-hit press-tint"
            data-tone={tone}
            type="button"
          >
            <IconServer aria-hidden="true" class="bar-symbol" />
            <span class="num">{count}</span>
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
    onCloseAutoFocus={(event) => {
      // Closed by a press elsewhere: the focus stays where that press put
      // it. Escape and its own button bring it back here.
      if (closedOutside) {
        event.preventDefault();
        closedOutside = false;
      }
    }}
    onInteractOutside={() => {
      closedOutside = true;
    }}
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
    trapFocus={false}
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
  /* The number reads beside its glyph, --space-2 apart; the group's next
     item (Caw's circle, his ring on its edge) stands the same --space-2 past
     the number, the group's gap and this trailing pad together, so the
     group reads at one spacing. */
  .machines {
    gap: var(--space-2);
    padding-inline: var(--space-2) calc(var(--space-2) - var(--c-bar-group-pad));
  }
  /* Named under `.machines` to outrank Shell's `.tools .bar-symbol` ink. */
  .machines[data-tone="attn"] :global(.bar-symbol) {
    color: var(--status-attn-glyph);
  }
  .machines[data-tone="fail"] :global(.bar-symbol) {
    color: var(--status-fail-glyph);
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
