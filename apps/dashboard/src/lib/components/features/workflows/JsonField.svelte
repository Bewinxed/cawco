<script lang="ts">
  import { unfold } from "#lib/cawco/motion/fold.svelte.js";
  import { Alert } from "#lib/components/ui/alert/index.js";
  import { Textarea } from "#lib/components/ui/textarea/index.js";

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

<label class="flex flex-col gap-space-2 type-label text-ink-muted"
  >{label}
  <Textarea
    aria-invalid={!!errorMessage}
    face="mono"
    oninput={(event) => change(event.currentTarget.value)}
    rows={7}
    text="label"
    value={JSON.stringify(value, null, 2)}
  /></label
>
{#if errorMessage}
  <div in:unfold out:unfold>
    <Alert variant="destructive">
      {errorMessage}
      Changes are not applied until the JSON is valid.
    </Alert>
  </div>
{/if}
