<!--
  The planted mistake's component (outro-reads-check.ts): its teardown calls
  `onhold` (wrapped in `untrack`) and, through a local function, `ondone`;
  `onpick` it calls only on a press.
-->
<script lang="ts">
  import { untrack } from "svelte";

  const {
    onhold,
    ondone,
    onpick,
  }: {
    onhold: (holding: boolean) => void;
    ondone: () => void;
    onpick: () => void;
  } = $props();

  function finish() {
    ondone();
  }

  $effect(() => {
    onhold(true);
    return () => {
      untrack(() => onhold)?.(false);
      finish();
    };
  });
</script>

<button onclick={onpick} type="button">Pick</button>
