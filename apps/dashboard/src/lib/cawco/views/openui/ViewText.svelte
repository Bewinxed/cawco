<script lang="ts">
  /** Words in one of the house text roles; plain text only. */
  import { VIEW_TEXT_ROLES } from "@cawco/core";
  import type { OpenUIRenderProps } from "./OpenUiRenderer.svelte";

  let { props }: OpenUIRenderProps<{ text: unknown; variant?: string }> =
    $props();
  const role = $derived(
    VIEW_TEXT_ROLES.find((one) => one === props.variant) ?? "body"
  );
</script>

<p
  data-slot="text"
  class="type-body text-pretty text-ink-strong role-label:type-label role-meta:type-meta role-meta:text-ink-muted role-title:type-title role-title:text-balance"
  data-role={role}
>
  {String(props.text ?? "")}
</p>
