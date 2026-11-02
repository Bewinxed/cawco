<!--
  Planted mistakes for house/follows-props (scripts/lint/fixtures/expected.txt):
  a component with a states file beside it (planted-props.stories.ts) that
  seeds its own state from a prop, and beside each the shape the rule must
  leave alone.
-->
<script lang="ts">
  import { untrack } from "svelte";

  let { draft: opening = "", saving = false, label = "" } = $props();

  let copied = $state(untrack(() => opening));
  let busy = $state.raw(saving);
  const followed = $derived(opening);
  let edited = $derived(saving);
  let own = $state({ label: "not the prop" });
  let unrelated = $state(0);
</script>

<p>{copied}{busy}{followed}{edited}{own.label}{unrelated}{label}</p>
