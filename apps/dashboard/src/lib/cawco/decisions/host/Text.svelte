<!--
  Words in one of the house text roles, plain text only: the view library's
  Text by name and shape, drawn by the host page on its own scoped styles,
  so a decision page draws the same whatever the dashboard's styling is.
-->
<script lang="ts">
  import type { OpenUIRenderProps } from "../../views/openui/OpenUiRenderer.svelte";

  let { props }: OpenUIRenderProps<{ text: unknown; variant?: unknown }> =
    $props();
  const role = $derived(
    ["title", "label", "body", "meta"].includes(String(props.variant))
      ? String(props.variant)
      : "body"
  );
</script>

<p class="text" data-role={role}>{String(props.text ?? "")}</p>

<style>
  /* tailwind: this folder is bundled by Bun with no Tailwind build (core decision-host.ts), and Tailwind only generates CSS where it scans the source, so a utility here would draw nothing — https://tailwindcss.com/docs/detecting-classes-in-source-files */
  .text {
    font: var(--type-body);
    color: var(--ink-strong);
    text-wrap: pretty;
    overflow-wrap: anywhere;
    &[data-role="title"] {
      font: var(--type-title);
      text-wrap: balance;
    }
    &[data-role="label"] {
      font: var(--type-label);
    }
    &[data-role="meta"] {
      font: var(--type-meta);
      color: var(--ink-muted);
    }
  }
</style>
