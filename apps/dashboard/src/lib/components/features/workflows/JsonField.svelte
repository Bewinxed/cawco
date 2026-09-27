<script lang="ts">
  import { unfold } from "$lib/whiffle/motion/fold.svelte";

  let {
    label,
    value,
    onchange,
    objectOnly = false,
  }: {
    label: string;
    value: unknown;
    onchange: (value: unknown) => void;
    objectOnly?: boolean;
  } = $props();
  let errorMessage = $state("");
  function change(text: string) {
    try {
      const parsed: unknown = JSON.parse(text);
      if (
        objectOnly &&
        (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      ) {
        throw new Error("Enter a JSON object.");
      }
      onchange(parsed);
      errorMessage = "";
    } catch (caught) {
      errorMessage = caught instanceof Error ? caught.message : String(caught);
    }
  }
</script>
<label
  >{label}
  <textarea
    aria-invalid={!!errorMessage}
    class="wf-mono"
    oninput={(event) => change(event.currentTarget.value)}
    rows="7"
    value={JSON.stringify(value, null, 2)}
  ></textarea></label
>
{#if errorMessage}
  <p class="wf-error" role="alert" transition:unfold>
    {errorMessage}
    Changes are not applied until the JSON is valid.
  </p>
{/if}
