<!-- A short label in a status pair: status colours mean status. -->
<script lang="ts">
  import type { OpenUIRenderProps } from "../../views/openui/OpenUiRenderer.svelte";

  let { props }: OpenUIRenderProps<{ text: unknown; tone?: unknown }> =
    $props();
  const tone = $derived(
    ["live", "attn", "done", "fail"].includes(String(props.tone))
      ? String(props.tone)
      : "neutral"
  );
</script>

<span class="badge" data-tone={tone}>{String(props.text ?? "")}</span>

<style>
  /* tailwind: this file is bundled by Bun for the decision host page, which loads only the kit's page.css and tokens.css and has no Tailwind compiler, so a utility class here would have no CSS behind it — https://tailwindcss.com/docs/installation */
  /* DESIGN.md, Badges: 20px (--c-badge-h), label role, recess surface, no border, 5px radius;
     the live, attn, done and fail variants take their status pairs. */
  .badge {
    display: inline-flex;
    align-items: center;
    align-self: start;
    block-size: var(--c-badge-h);
    max-inline-size: 100%;
    overflow: hidden;
    padding: 0 var(--space-2);
    white-space: nowrap;
    text-overflow: ellipsis;
    border-radius: var(--radius-xs);
    font: var(--type-label);
    line-height: 1;
    background: var(--surface-recess);
    color: var(--ink-strong);
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
