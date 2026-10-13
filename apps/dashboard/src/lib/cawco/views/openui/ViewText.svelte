<script lang="ts">
  /** Words in one of the house text roles; plain text only. */
  import type { OpenUIRenderProps } from "./OpenUiRenderer.svelte";

  let { props }: OpenUIRenderProps<{ text: unknown; variant?: string }> =
    $props();
  const role = $derived(
    ["title", "label", "body", "meta"].includes(String(props.variant))
      ? String(props.variant)
      : "body"
  );
</script>

<p class="text" data-role={role}>{String(props.text ?? "")}</p>

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
