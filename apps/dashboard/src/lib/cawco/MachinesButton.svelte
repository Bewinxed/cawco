<script lang="ts" module>
  /** How many machines are online: the phone sidebar's count. */
  export const machinesOnline = (): number =>
    boardStore.machines.filter((machine) => machine.status === "online").length;
</script>

<script lang="ts">
  /**
   * The machines, one click away in the wide bar's glass group rather than
   * always on screen: a BarItem of the group, its glyph
   * and the number of machines. The number is said once. Machines in
   * trouble (down, behind the hub, a stuck sync) tint the glyph in the
   * status hue, fail when any is down and attention otherwise; which ones
   * and what is wrong are words in the tooltip, the label and the card
   * (DESIGN.md, The Glyph, Word, Hue Rule). A press shows the machines'
   * list (MachinesList) in the glass's one card (GlassCard): it comes down
   * out of the glass, or the card hanging there changes to it in place. The
   * home's Check machines opens it too (bar-glass `open`). A phone has no
   * room for it in the bar: the machines are in its sidebar. A machine being
   * added counts as soon as its install runs, and an install that failed
   * turns the glyph to attention until the person acts on it (connect/).
   */
  import { machineLabel } from "@cawco/core/machine-names";
  import { BarItem } from "#lib/components/ui/bar-glass/index.js";
  import { IconServerLinear } from "#lib/icons.js";
  import { barGlass } from "./bar-glass.svelte";
  import { connect } from "./connect/installs.svelte";
  import { home } from "./home/home-state.svelte";
  import { boardStore } from "./stores/board.svelte";

  /**
   * Machines being added that the fleet does not list yet: counted with
   * the machines, which are drawn from the first paint (the board the
   * server read for this page, then the live one).
   */
  const adding = $derived(
    connect.installs.filter(
      (one) =>
        one.state === "running" &&
        !boardStore.machines.some(
          (machine) => machine.machineId === one.returning
        )
    ).length
  );
  /** Installs that ended badly and wait on the person. */
  const unsettled = $derived(
    connect.band.filter((one) => one.state !== "running").length
  );
  const count = $derived(boardStore.machines.length + adding);
  /** The glyph's hue: fail when a machine is down, attention when one is in trouble. */
  const tone = $derived.by(() => {
    if (home.exceptions.length === 0) {
      return unsettled > 0 ? "attn" : undefined;
    }
    return boardStore.machines.some((machine) => machine.status !== "online")
      ? "fail"
      : "attn";
  });
  const label = $derived.by(() => {
    /* The number only above 0 (DESIGN.md, The Earned Count Rule). */
    const machines =
      count > 0
        ? `${count} ${count === 1 ? "machine" : "machines"}`
        : "Machines";
    const stuck = home.exceptions.length + unsettled;
    const added = adding > 0 ? `, ${adding} being added` : "";
    return stuck > 0
      ? `${machines}${added}, ${stuck} ${stuck === 1 ? "needs" : "need"} attention`
      : `${machines}${added}`;
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
        const machine = boardStore.machines.find(
          (entry) => entry.machineId === machineId
        );
        return machine ? machineLabel(machine.hostname) : machineId;
      });
      return `${names.format(who)} ${text}`;
    });
    return `Machines: ${clauses.join("; ")}`;
  });
</script>

<!-- Its tip stands down while the machines card hangs under it: the card says
     it all, and a tip left over the card's first rows covered them. Gone
     from the phone's glass, which holds Caw alone. -->
<BarItem
  aria-haspopup="dialog"
  {count}
  data-glass-opens="machines"
  data-machines
  expanded={barGlass.open === "machines"}
  icon={IconServerLinear}
  {label}
  layout="desk"
  onclick={() => barGlass.toggle("machines")}
  {tip}
  tipOff={barGlass.open === "machines"}
  {tone}
/>
