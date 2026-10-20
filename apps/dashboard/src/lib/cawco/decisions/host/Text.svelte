<!--
  Words in one of the house text roles, plain text only: the view library's
  Text by name and shape, each role its type utility (DESIGN.md, The Role,
  Not Size Rule), a title balanced and running text pretty.
-->
<script lang="ts">
  import type { OpenUIRenderProps } from "../../views/openui/OpenUiRenderer.svelte";

  let { props }: OpenUIRenderProps<{ text: unknown; variant?: unknown }> =
    $props();

  const ROLES = {
    title: "type-title text-balance text-ink-strong",
    label: "type-label text-pretty text-ink-strong",
    body: "type-body text-pretty text-ink-strong",
    meta: "type-meta text-pretty text-ink-muted",
  } as const;
  const role = $derived(
    String(props.variant) in ROLES
      ? (String(props.variant) as keyof typeof ROLES)
      : "body"
  );
</script>

<p class={["wrap-anywhere", ROLES[role]]} data-role={role} data-slot="text">
  {String(props.text ?? "")}
</p>
