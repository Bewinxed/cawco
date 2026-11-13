<!--
  A page's words, each `cawco:` reference in them drawn as the dashboard
  draws it (Reference.svelte) and every other character as written
  (words.ts). `still`: in a control that is pressed for itself (an option's
  chip), a reference stands as its face alone, the press the control's.
-->
<script lang="ts">
  import Reference from "./Reference.svelte";
  import { runsOf } from "./words";

  let { text, still = false }: { text: string; still?: boolean } = $props();

  const runs = $derived(runsOf(text));
</script>

{#each runs as run, at (at)}{#if "href" in run}<Reference
      href={run.href}
      label={run.label}
      {still}
    />{:else}{run.text}{/if}{/each}
