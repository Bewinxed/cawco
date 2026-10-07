<script lang="ts">
  /** Words in one of the house text roles; plain text only. */
  import type { A2uiComponentProps } from "svelte-a2ui";

  let { text, variant }: A2uiComponentProps = $props();
  const role = $derived(
    ["title", "label", "body", "meta"].includes(String(variant))
      ? String(variant)
      : "body"
  );
</script>

<p class="text" data-role={role}>{String(text ?? "")}</p>

<style>
  .text {
    font: var(--type-body);
    color: var(--ink-strong);
    text-wrap: pretty;
  }
  .text[data-role="title"] {
    font: var(--type-title);
    text-wrap: balance;
  }
  .text[data-role="label"] {
    font: var(--type-label);
  }
  .text[data-role="meta"] {
    font: var(--type-meta);
    color: var(--ink-muted);
  }
</style>
