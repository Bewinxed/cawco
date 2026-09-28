<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  /**
   * The env-vars and headers editor: a key and a value per line, with a blank
   * line always waiting at the bottom so adding one is typing, not clicking.
   * A line that arrives or is removed goes through reflow: it opens and
   * fades in, or closes and fades out, the lines after it sliding.
   */
  import { IconClose } from "$lib/icons";
  import { reflow } from "$lib/whiffle/motion/rows.svelte";

  let {
    rows = $bindable(),
    legend,
    keyPlaceholder,
    valuePlaceholder,
  }: {
    rows: { key: string; value: string }[];
    legend: string;
    keyPlaceholder: string;
    valuePlaceholder: string;
  } = $props();

  /** Keeps exactly one empty line at the end, however the lines were edited. */
  function settle() {
    const last = rows.at(-1);
    if (!last || last.key.trim() || last.value.trim()) {
      rows.push({ key: "", value: "" });
    }
  }
</script>

<fieldset class="flex flex-col gap-1.5" {@attach reflow()}>
  <legend class="mb-1 text-label text-muted-foreground">{legend}</legend>
  <!-- Keyed by the line itself, so removing one removes that line rather
       than shifting every value after it up a box. -->
  {#each rows as row, index (row)}
    <div class="flex items-center gap-1.5" data-flip>
      <Input
        aria-label="{legend} name"
        autocomplete="off"
        class="h-8 flex-1 font-mono text-meta md:text-meta"
        oninput={settle}
        placeholder={keyPlaceholder}
        spellcheck="false"
        bind:value={row.key}
      />
      <Input
        aria-label="{legend} value"
        autocomplete="off"
        class="h-8 flex-[2] font-mono text-meta md:text-meta"
        oninput={settle}
        placeholder={valuePlaceholder}
        spellcheck="false"
        bind:value={row.value}
      />
      <Button
        aria-label="Remove {row.key || 'this line'}"
        class="text-muted-foreground"
        disabled={index === rows.length - 1}
        onclick={() => rows.splice(index, 1)}
        size="icon-sm"
        variant="ghost"
      >
        <IconClose />
      </Button>
    </div>
  {/each}
</fieldset>
