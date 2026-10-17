<script lang="ts">
  /**
   * The session card (SessionDetails) as it hangs from its tab, with the one
   * thing that changes: a Files chip at the end of the settings group, the
   * group's own chip recipe (ns-chip-btn), which opens Files and puts the
   * card away. The head, the other chips, the meter and the action are
   * drawn as the card draws them for a working Claude session.
   */
  import "#lib/cawco/spawn/ns-theme.css";
  import Down from "~icons/solar/alt-arrow-down-linear";
  import IconToolFiles from "~icons/solar/folder-with-files-bold-duotone";
  import Link from "~icons/solar/link-minimalistic-2-bold-duotone";
  import IconWorking from "~icons/solar/refresh-circle-bold-duotone";
  import Shield from "~icons/solar/shield-check-bold-duotone";
  import Tuning from "~icons/solar/tuning-2-bold-duotone";
  import ClaudeIcon from "~icons/logos/claude-icon";
  import LimitBar from "#lib/cawco/usage/LimitBar.svelte";

  let { count }: { count: number } = $props();
</script>

<div class="card kit-pop ns-theme" data-session-card>
  <div class="head">
    <div class="identity">
      <div class="title">
        <h2>Orchestrate cockpit fleet work</h2>
        <button aria-label="Copy link" class="icon-action touch-hit" type="button">
          <Link />
        </button>
      </div>
      <span aria-label="Claude Code" class="harness" role="img"><ClaudeIcon /></span>
    </div>
    <p class="meta">
      <span class="status mark-line"><IconWorking aria-hidden="true" /><span>Working</span></span>
      <span aria-hidden="true" class="sep">·</span>
      <span>obelisk-of-light</span>
      <span aria-hidden="true" class="sep">·</span>
      <span class="cwd">~/cockpit</span>
    </p>
  </div>
  <div class="configuration">
    <div class="settings">
      <button class="ns-chip-btn tool model-chip" type="button">
        <ClaudeIcon aria-hidden="true" />
        <span class="chip-label">Opus 5.5</span>
        <Down class="chevron" />
      </button>
      <button class="ns-chip-btn tool" type="button">
        <Tuning aria-hidden="true" style="color:var(--hue-orange-500)" />
        <span class="chip-label">high</span>
        <Down class="chevron" />
      </button>
      <button class="ns-chip-btn tool" type="button">
        <Shield aria-hidden="true" style="color:var(--hue-green-500)" />
        <span class="chip-label">Ask</span>
        <Down class="chevron" />
      </button>
      <button class="ns-chip-btn tool account-chip" type="button">
        <span aria-hidden="true" class="dot"></span>
        <span class="chip-label">bewinxed</span>
        <Down class="chevron" />
      </button>
      <button
        aria-label={count > 0 ? `Files, ${count}` : "Files"}
        class="ns-chip-btn tool files-chip"
        data-files-chip
        type="button"
      >
        <IconToolFiles aria-hidden="true" />
        <span class="chip-label">Files</span>
        {#if count > 0}
          <span aria-hidden="true" class="sep">·</span>
          <span class="num">{count}</span>
        {/if}
      </button>
    </div>
    <div class="feedback-slot"></div>
  </div>
  <div class="stats">
    <div class="context">
      <span class="stat-label">Context</span>
      <span class="stat-bar">
        <LimitBar elapsed={null} label="Context" reads="used" size={4} state="calm" used={62} />
      </span>
      <span class="figure num">62% · 124k/200k</span>
    </div>
  </div>
  <div class="footer">
    <button class="ns-btn primary xs" type="button">Continue in new session…</button>
  </div>
</div>

<style>
  .card {
    inline-size: min(416px, 100%);
    padding: 0;
    overflow: clip;
    font-size: var(--text-body);
  }
  .head {
    background: var(--surface-recess);
  }
  .identity {
    display: flex;
    align-items: flex-start;
    gap: var(--space-3);
    padding: var(--space-4) var(--space-5) var(--space-1);
  }
  .title {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: flex-start;
    gap: var(--space-1);
  }
  h2 {
    min-width: 0;
    margin: 0;
    color: var(--ink-strong);
    font-size: var(--text-title);
    font-weight: var(--weight-strong);
    line-height: var(--leading-body);
    text-wrap: pretty;
    overflow-wrap: anywhere;
  }
  .harness {
    display: inline-flex;
    align-items: center;
    flex: none;
    height: 28px;
  }
  .meta {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    margin: 0;
    padding: 0 var(--space-5) var(--space-3);
    flex-wrap: wrap;
    font-size: var(--text-meta);
    line-height: var(--leading-body);
    color: var(--ink-muted);
  }
  .status {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    color: var(--ink-strong);

    & :global(svg) {
      inline-size: var(--icon-md);
      block-size: var(--icon-md);
      color: var(--status-live-glyph);
    }
  }
  .cwd {
    font-family: var(--font-mono);
    font-size: var(--text-label);
  }
  .icon-action {
    display: grid;
    place-items: center;
    flex: none;
    width: 28px;
    height: 28px;
    border: 0;
    border-radius: var(--radius-sm);
    color: var(--ink-muted);
    background: transparent;

    & :global(svg) {
      width: 16px;
      height: 16px;
    }
  }
  .configuration {
    position: relative;
    border-top: 1px solid var(--border-hairline);
    padding: var(--space-4) var(--space-5) 0;
  }
  .settings {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-1);
    min-width: 0;
  }
  .settings :global(.ns-chip-btn) {
    gap: var(--space-1);
    height: 28px;
  }
  .settings :global(.model-chip) {
    flex: 0 1 auto;
    min-width: 0;
  }
  .settings :global(.model-chip > svg:first-child) {
    width: 15px;
    height: 15px;
  }
  .dot {
    inline-size: 8px;
    block-size: 8px;
    border-radius: var(--radius-pill);
    background: var(--hue-amber-500);
  }
  .files-chip .sep {
    color: var(--ink-subtle);
  }
  .feedback-slot {
    min-block-size: calc(var(--space-2) + 1lh);
    line-height: var(--leading-body);
  }
  .stats {
    display: flex;
    align-items: center;
    gap: var(--space-4);
    padding: var(--space-3) var(--space-5) 0;
    border-top: 1px solid var(--border-hairline);
    font-size: var(--text-meta);
    line-height: var(--leading-body);
    color: var(--ink-strong);
  }
  .context {
    --row-paint: var(--surface-raised);
    display: flex;
    flex: auto;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-1) var(--space-2);
  }
  .stat-label {
    color: var(--ink-muted);
    white-space: nowrap;
  }
  .stat-bar {
    flex: 1;
    min-width: 48px;
    max-width: 96px;
  }
  .figure {
    white-space: nowrap;
  }
  .footer {
    display: flex;
    justify-content: flex-end;
    padding: var(--space-4) var(--space-5);
  }
  @media (max-width: 640px) {
    .footer .ns-btn {
      flex: 1;
      height: 44px;
    }
    .settings :global(.ns-chip-btn) {
      height: 44px;
      padding-inline: 6px;
    }
    .settings :global(.ns-chip-btn:not(.account-chip) > svg.chevron) {
      display: none;
    }
  }
</style>
