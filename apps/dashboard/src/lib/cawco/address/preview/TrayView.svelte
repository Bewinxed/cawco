<script lang="ts" module>
  /** The three directions the brief asks for (design 6ddc57c4: A, B, C). */
  export type Direction = "family" | "card" | "stations";
</script>

<script lang="ts">
  /** One direction's tray, as its story names it. */
  import CardTray from "../CardTray.svelte";
  import FamilyTray from "../FamilyTray.svelte";
  import StationsTray from "../StationsTray.svelte";
  import type { AddressTray } from "../tray.svelte";
  import type { Form } from "../words";

  let {
    tray,
    direction,
    form,
    ref = $bindable(null),
  }: {
    tray: AddressTray;
    direction: Direction;
    form: Form;
    ref?: HTMLElement | null;
  } = $props();
</script>

{#if direction === "family"}
  <FamilyTray bind:ref {form} {tray} />
{:else if direction === "card"}
  <CardTray bind:ref {form} {tray} />
{:else}
  <StationsTray bind:ref {form} {tray} />
{/if}
