<!--
  The planted mistake (outro-reads-check.ts): `onhold`, which Card calls as
  it is torn down, reads `{@const pin}`, null by then. Caught alone: `ondone`
  reads the holder's own state, and `onpick` is called only while it stands.
-->
<script lang="ts">
  import Card from "./Card.svelte";

  let open = $state<{ id: string } | null>(null);
  const held: Record<string, boolean> = {};
  let done = $state(false);
</script>

<button
  onclick={() => {
    open = open ? null : { id: "a" };
  }}
  type="button">{done}</button
>
{#if open}
  {@const pin = open}
  <Card
    ondone={() => {
      done = true;
    }}
    onhold={(holding) => {
      held[pin.id] = holding;
    }}
    onpick={() => {
      held[pin.id] = true;
    }}
  />
{/if}
