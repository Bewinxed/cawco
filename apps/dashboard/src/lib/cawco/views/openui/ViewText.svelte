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

<p
  data-slot="text"
  class="type-body text-pretty text-ink-strong role-label:type-label role-meta:type-meta role-meta:text-ink-muted role-title:type-title role-title:text-balance"
  data-role={role}
>
  {String(props.text ?? "")}
</p>
