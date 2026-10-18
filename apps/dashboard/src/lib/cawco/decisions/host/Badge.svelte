<!-- A short label in a status pair: status colours mean status. -->
<script lang="ts">
  import type { OpenUIRenderProps } from "../../views/openui/OpenUiRenderer.svelte";

  let { props }: OpenUIRenderProps<{ text: unknown; tone?: unknown }> =
    $props();
  const tone = $derived(
    ["live", "attn", "done", "fail"].includes(String(props.tone))
      ? String(props.tone)
      : "idle"
  );
</script>

<span class="badge" data-tone={tone}>{String(props.text ?? "")}</span>

<style>
  .badge {
    align-self: start;
    max-inline-size: 100%;
    padding: 0 var(--space-2);
    border-radius: var(--radius-pill);
    font: var(--type-meta);
    overflow-wrap: anywhere;
    background: var(--status-idle-bg);
    color: var(--status-idle-ink);
    &[data-tone="live"] {
      background: var(--status-live-bg);
      color: var(--status-live-ink);
    }
    &[data-tone="attn"] {
      background: var(--status-attn-bg);
      color: var(--status-attn-ink);
    }
    &[data-tone="done"] {
      background: var(--status-done-bg);
      color: var(--status-done-ink);
    }
    &[data-tone="fail"] {
      background: var(--status-fail-bg);
      color: var(--status-fail-ink);
    }
  }
</style>
