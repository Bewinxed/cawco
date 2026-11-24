<script lang="ts">
  /**
   * The kit Textarea as a form holds it (Textarea.stories.ts): a routine's
   * prompt with the fields a form stands under it, so a line the prompt
   * grows or gives up moves what stands below it.
   */
  import { Input } from "#lib/components/ui/input/index.js";
  import { Textarea } from "#lib/components/ui/textarea/index.js";

  let { prompt }: { prompt: string } = $props();
  let value = $derived(prompt);
</script>

<div class="flex w-full max-w-c-measure flex-col gap-space-4 p-space-5">
  <Input aria-label="Name" value="Triage new onboarding issues" />
  <Textarea
    aria-label="What each run does"
    data-testid="prompt"
    rows={3}
    bind:value
  />
  <Input
    aria-label="Runs until"
    value="Every issue has an area and a severity"
  />
  <Input aria-label="Stops checking on" value="31 December" />
</div>
