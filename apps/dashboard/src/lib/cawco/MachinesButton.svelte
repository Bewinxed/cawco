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
   * and what is wrong are words in the tooltip, the label and the card
   * (DESIGN.md, The Glyph, Word, Hue Rule). A press shows the machines'
   * list (MachinesList) in the glass's one card (GlassCard): it comes down
   * out of the glass, or the card hanging there changes to it in place. The
   * home's Check machines opens it too (bar-glass `open`). A phone has no
   * room for it in the bar: the machines are in its sidebar.
   */
  import { machineLabel } from "@cawco/core";
  import { mergeProps } from "bits-ui";
  import Tip from "#lib/components/ui/tooltip/tip.svelte";
  import { IconServer } from "#lib/icons.js";
  import { barGlass } from "./bar-glass.svelte";
  import { home } from "./home/home-state.svelte";

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

<Tip label={tip}>
  {#snippet children(tipProps)}
    <button
      {...mergeProps(tipProps, { onclick: () => barGlass.toggle("machines") })}
      aria-expanded={barGlass.open === "machines"}
      aria-haspopup="dialog"
      aria-label={label}
      class="bar-item machines touch-hit press-tint"
      data-tone={tone}
      type="button"
    >
      <IconServer aria-hidden="true" class="bar-symbol" />
      <span class="num">{count}</span>
    </button>
  {/snippet}
</Tip>

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
</style>
