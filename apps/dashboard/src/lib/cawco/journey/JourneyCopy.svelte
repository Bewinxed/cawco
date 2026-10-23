<script lang="ts">
  /**
   * Something to paste elsewhere, in a journey step: the house's copy box in
   * a wide card; in a narrow one the text across the card, wrapping between
   * its units (a parenthesis stays whole), or clamped to two lines
   * (`clamp`), and Copy on a full-width row of its own, naming what it
   * copies. Copy takes the whole text, as it reads, either way.
   */
  import CopyBox from "#lib/cawco/CopyBox.svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import { UseClipboard } from "#lib/hooks/use-clipboard.svelte.js";

  let {
    label,
    text,
    copyLabel,
    clamp = false,
  }: {
    /** What the text is, for a screen reader. */
    label: string;
    text: string;
    /** The narrow card's Copy, naming what it copies. */
    copyLabel: string;
    clamp?: boolean;
  } = $props();

  const clipboard = new UseClipboard();
  const said = $derived.by(() => {
    if (clipboard.status === "success") {
      return "Copied";
    }
    return clipboard.status === "failure" ? "Copy failed" : copyLabel;
  });

  /** The words of a copy box, each a unit that never breaks inside: a parenthesis is one ("(DNS only, no proxy)"). */
  const units = $derived(text.match(/\([^)]*\)|\S+/g) ?? [text]);
</script>

<div class="min-w-0 @max-field-group:hidden" data-box>
  <CopyBox {label} {text} wrap />
</div>
<div class="hidden min-w-0 flex-col gap-space-2 @max-field-group:flex" data-box>
  <!-- The box keeps its edge and padding; the clamp is on the words
       inside it, so a third line is cut at the words' edge, never shown
       in the box's padding. -->
  <code
    class="block min-w-0 rounded-md border border-border-control bg-surface-hover px-space-3 py-space-2 font-mono text-meta text-ink-strong"
    title={text}
    ><span class={clamp ? "line-clamp-2" : "block"} data-slot="copy-words"
      ><span class="sr-only">{label}:{" "}</span
      >{#each units as unit, index (index)}{#if index > 0}{" "}{/if}<span
          class={[
            "inline-block max-w-full",
            unit.startsWith("(") ? "whitespace-nowrap" : "wrap-anywhere",
          ]}
          data-unit>{unit}</span
        >{/each}</span
    ></code
  >
  <Button
    class="w-full"
    label={said}
    onclick={() => clipboard.copy(text)}
    size="sm"
    variant="secondary"
  />
</div>
