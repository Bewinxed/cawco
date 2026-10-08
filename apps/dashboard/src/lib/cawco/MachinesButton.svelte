<script lang="ts" module>
  import { cawco } from "./client.svelte";

  /** How many machines are online: the button's number, and the phone sidebar's. */
  export const machinesOnline = (): number =>
    cawco.machines.filter((machine) => machine.status === "online").length;
</script>

<script lang="ts">
  /**
   * The machines, one click away beside Jump on a wide bar rather than
   * always on screen. The button says how many are online; its glyph takes
   * the fail ink when one has dropped and the attention ink when one needs a
   * hand (behind the hub, a stuck sync), so a dropped machine is still seen
   * without the list. The popover is the machines' list (MachinesList). The
   * home's Check machines opens it too (join `machinesPopover`). A phone has
   * no room for it in the bar: the machines are in its sidebar.
   */
  import { mergeProps } from "bits-ui";
  import { Button } from "#lib/components/ui/button/index.js";
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
  /** What the glyph says at a glance: a machine down, one in trouble, or nothing. */
  const tone = $derived.by(() => {
    if (cawco.machines.some((machine) => machine.status !== "online")) {
      return "fail";
    }
    return home.exceptions.length > 0 ? "attn" : null;
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
  <Tip label="Machines">
    {#snippet children(
      tip
    )}
      <Popover.Trigger>
        {#snippet child({
          props,
        })}
          <Button
            {...mergeProps(props, tip)}
            aria-label="Machines"
            class="jump machines"
            data-tone={tone ?? undefined}
            size="sm"
            variant="outline"
          >
            <IconServer />
            <span class="num">{online}</span>
          </Button>
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
  /* The glyph alone carries a machine in trouble; it crosses over
     --dur-fade, never pulses. */
  :global(.machines svg) {
    transition: color var(--dur-fade) var(--ease-out);
  }
  :global(.machines[data-tone="fail"] svg) {
    color: var(--status-fail-glyph);
  }
  :global(.machines[data-tone="attn"] svg) {
    color: var(--status-attn-glyph);
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
