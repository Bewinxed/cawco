<script lang="ts">
  import type { SupervisorEvent } from "@whiffle/core";
  /**
   * The assistant panel — DESKTOP: floating pane per mock shell law (380×899,
   * top 40/right 24, radius 16, header 47); MOBILE (<900px): vaul-svelte
   * drawer. Contents this slice: supervisor status, focused session autopilot
   * state, live intervention log. No chat composer (JOURNEY.md boundary).
   *
   * Shell law source: mocks/v5-assistant.html, PLAN.md §C9.
   * A11y intent: mocks/v3-assistant.html syncModal JS.
   */
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for importing a component group
  import * as Drawer from "$lib/components/ui/drawer";
  import { IconAssistant } from "$lib/icons";
  import { whiffle } from "../client.svelte";
  import { conversationHref } from "../links";
  import {
    loadSupervisor,
    loadSupervisorEvents,
    type SupervisorStatus,
  } from "../supervisor";
  import { workspace } from "../workspace/workspace.svelte";

  const TRAILING_SLASH_RE = /\/$/;

  let {
    open = $bindable(false),
  }: {
    open: boolean;
  } = $props();

  /**
   * Whatever had focus when the panel opened — the rail row, the phone's
   * header button, or the page under ⌘J — so closing hands focus back to it.
   */
  let returnTo: HTMLElement | null = null;
  $effect.pre(() => {
    if (open) {
      const at = document.activeElement;
      returnTo = at instanceof HTMLElement ? at : null;
    }
  });

  let isMobile = $state(false);
  let panelEl: HTMLElement | null = $state(null);

  /** Supervisor config + live probe. */
  let sup: SupervisorStatus | null = $state(null);
  let supError: string | null = $state(null);

  /** Events seeded from REST, then kept live from the client ring. */
  let seededEvents: SupervisorEvent[] = $state([]);
  let seeded = $state(false);

  const events = $derived.by(() => {
    const live = whiffle.supervisorEvents;
    if (!seeded) {
      return [];
    }
    const merged = [...live];
    for (const row of seededEvents) {
      if (!merged.some((e) => e.id === row.id)) {
        merged.push(row);
      }
    }
    merged.sort((a, b) => b.id - a.id);
    return merged.slice(0, 200);
  });

  /** The focused session's autopilot state, when viewing a session. */
  const focusedSession = $derived.by(() => {
    const id = workspace.activeSessionId;
    if (!id) {
      return null;
    }
    const row = whiffle.instanceIndex.byId.get(id);
    return row ?? null;
  });

  const autopilot = $derived(focusedSession?.autopilot ?? null);

  function checkMobile() {
    isMobile = window.matchMedia("(max-width: 899px)").matches;
  }

  onMount(() => {
    checkMobile();
    const mq = window.matchMedia("(max-width: 899px)");
    const handler = () => checkMobile();
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  });

  $effect(() => {
    if (!open) {
      return;
    }
    loadSupervisor()
      .then((s) => {
        sup = s;
        supError = null;
      })
      .catch((e) => {
        supError = e instanceof Error ? e.message : String(e);
      });
    loadSupervisorEvents({ limit: 100 })
      .then((rows) => {
        seededEvents = rows;
        seeded = true;
      })
      .catch(() => {
        seeded = true;
      });
  });

  function close() {
    open = false;
    returnTo?.focus();
  }

  /**
   * Escape closes the desktop pane wherever focus is: it opens from the rail
   * row or ⌘J, which leave focus outside it. The phone's drawer handles its
   * own Escape.
   */
  function onWindowKeydown(event: KeyboardEvent) {
    if (open && !isMobile && event.key === "Escape") {
      event.preventDefault();
      close();
    }
  }

  /** Relative time in the product voice: "3s", "2m", "1h", "2d". */
  function ago(ts: number): string {
    const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
    if (s < 60) {
      return `${s}s`;
    }
    const m = Math.floor(s / 60);
    if (m < 60) {
      return `${m}m`;
    }
    const h = Math.floor(m / 60);
    if (h < 24) {
      return `${h}h`;
    }
    return `${Math.floor(h / 24)}d`;
  }

  /** The cwd's last path segment — the session's label in this log. */
  function cwdLeaf(cwd: string): string {
    const parts = cwd.replace(TRAILING_SLASH_RE, "").split("/");
    return parts.at(-1) || cwd;
  }

  function navigateToSession(instanceId: string) {
    close();
    goto(conversationHref(instanceId, whiffle.instanceIndex));
  }

  const VERDICT_TONE: Record<string, string> = {
    silent: "muted",
    reply: "live",
    escalate: "attn",
    ask: "attn",
    error: "fail",
    skipped: "muted",
  };
</script>

<svelte:window onkeydown={onWindowKeydown} />

{#if isMobile}
  <!-- MOBILE-FIRST: vaul-svelte drawer -->
  <Drawer.Root direction="bottom" shouldScaleBackground={false} bind:open>
    <Drawer.Content class="assistant-drawer">
      <Drawer.Header>
        <Drawer.Title class="sr-only">Whiffle Assistant</Drawer.Title>
      </Drawer.Header>
      <div class="panel-inner">
        <header class="panel-head">
          <span class="a-logo">
            <IconAssistant />
          </span>
          <span class="a-t"><b>Whiffle</b> Assistant</span>
          <span class="a-role">Assistant</span>
        </header>
        {@render panelContents()}
      </div>
    </Drawer.Content>
  </Drawer.Root>
{:else if open}
  <!-- DESKTOP: floating pane per mock shell law -->
  <div
    aria-label="Whiffle Assistant"
    class="panel"
    role="dialog"
    tabindex="-1"
    bind:this={panelEl}
  >
    <header class="panel-head">
      <span class="a-logo">
        <IconAssistant />
      </span>
      <span class="a-t"><b>Whiffle</b> Assistant</span>
      <span class="a-role">Assistant</span>
      <button
        aria-label="Close assistant"
        class="a-x"
        onclick={close}
        type="button"
      >
        <svg
          aria-hidden="true"
          fill="none"
          stroke="currentColor"
          stroke-linecap="round"
          stroke-width="1.9"
          viewBox="0 0 24 24"
        >
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
    </header>
    {@render panelContents()}
  </div>
{/if}

{#snippet panelContents()}
  <div class="body">
    <!-- Supervisor status -->
    <section class="sect">
      <h3 class="sect-h">Supervisor</h3>
      {#if supError}
        <p class="sect-note fail">Could not reach the supervisor. {supError}</p>
      {:else if !sup}
        <p class="sect-note muted">Loading...</p>
      {:else if !sup.status.configured}
        <div class="status-block">
          <span class="dot off"></span>
          <span class="status-label">Not configured</span>
        </div>
        <p class="sect-note">
          Set a supervisor model under fleet settings to enable automated
          session oversight.
        </p>
      {:else if sup.status.reachable}
        <div class="status-block">
          <span class="dot on"></span>
          <span class="status-label"
            >{sup.status.resolvedModel ?? sup.config.model ?? 'Connected'}</span
          >
        </div>
      {:else}
        <div class="status-block">
          <span class="dot off"></span>
          <span class="status-label">Unreachable</span>
        </div>
        {#if sup.status.error}
          <p class="sect-note fail">{sup.status.error}</p>
        {/if}
      {/if}
    </section>

    <!-- Focused session autopilot -->
    {#if focusedSession}
      <section class="sect">
        <h3 class="sect-h">Autopilot</h3>
        {#if autopilot?.enabled}
          <div class="status-block">
            <span class="dot on"></span>
            <span class="status-label">Enabled</span>
          </div>
          {#if autopilot.prompt}
            <p class="sect-note prompt-clip">{autopilot.prompt}</p>
          {/if}
          <p class="sect-hint">
            Edit the standing prompt from the session composer.
          </p>
        {:else if autopilot && !autopilot.enabled}
          <div class="status-block">
            <span class="dot off"></span>
            <span class="status-label">Paused</span>
          </div>
          <p class="sect-hint">Re-enable from the session composer.</p>
        {:else}
          <div class="status-block">
            <span class="dot off"></span>
            <span class="status-label">Off</span>
          </div>
          <p class="sect-hint">
            Enable autopilot from the session composer to let the supervisor
            answer on your behalf.
          </p>
        {/if}
      </section>
    {/if}

    <!-- Intervention log -->
    <section class="sect log-sect">
      <h3 class="sect-h">Interventions</h3>
      {#if events.length === 0}
        <div class="empty">
          <div class="empty-grid"></div>
          <div class="empty-orb">
            <IconAssistant />
          </div>
          <h4 class="empty-h">No interventions yet</h4>
          <p class="empty-p">
            When the supervisor acts on a session, every verdict appears here —
            replies, escalations, and the ones it let pass.
          </p>
        </div>
      {:else}
        <ul class="log">
          {#each events as ev (ev.id)}
            {@const session = whiffle.instanceIndex.byId.get(ev.instanceId)}
            {@const tone = VERDICT_TONE[ev.verdict] ?? 'muted'}
            <li class="log-row">
              <span class="log-time">{ago(ev.createdAt)}</span>
              {#if session}
                <button
                  class="log-session"
                  onclick={() => navigateToSession(ev.instanceId)}
                  title={session.cwd}
                  type="button"
                >
                  {session.title ?? session.derivedTitle ?? cwdLeaf(session.cwd)}
                </button>
              {:else}
                <span class="log-session-gone" title={ev.instanceId}>
                  {ev.instanceId.slice(0, 8)}
                </span>
              {/if}
              <span class="log-source">{ev.source}</span>
              <span class="log-verdict {tone}">{ev.verdict}</span>
              {#if ev.message}
                <span class="log-msg" title={ev.message}>
                  {ev.message.length > 80 ? `${ev.message.slice(0, 77)}...` : ev.message}
                </span>
              {/if}
            </li>
          {/each}
        </ul>
      {/if}
    </section>
  </div>
{/snippet}

<style>
  /* ---- PANEL (DESKTOP) ----
     Non-modal by operator verdict: the panel floats over a page that stays
     fully interactive — no scrim, no inert. It descends from its summon in
     the top bar on the doctrine's entry curve. */
  .panel {
    position: fixed;
    top: 40px;
    right: 24px;
    width: 380px;
    height: min(899px, calc(100dvh - 64px));
    z-index: 60;
    background: var(--surface-raised);
    border-radius: 16px;
    box-shadow: var(--shadow-overlay);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    animation: panel-in var(--dur-panel) var(--ease-out) both;
  }
  @keyframes panel-in {
    from {
      opacity: 0;
      transform: translateY(-8px) scale(0.98);
    }
  }

  /* ---- HEADER (shared mobile + desktop) ---- */
  .panel-head {
    height: 47px;
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 0 12px;
    border-bottom: 1px solid var(--border-hairline);
  }
  .a-logo {
    width: 25px;
    height: 25px;
    flex: 0 0 auto;
    border-radius: var(--radius-sm);
    background: var(--brand-solid);
    color: var(--on-brand);
    display: grid;
    place-items: center;
  }
  .a-logo :global(svg) {
    width: 14px;
    height: 14px;
  }
  .a-t {
    font-size: var(--text-body);
    color: var(--ink-strong);
  }
  .a-t b {
    font-weight: var(--weight-strong);
  }
  .a-role {
    margin-left: 8px;
    display: inline-flex;
    align-items: center;
    height: 19px;
    padding: 0 8px;
    border-radius: var(--radius-pill);
    font-size: var(--text-meta);
    font-weight: var(--weight-strong);
    letter-spacing: 0.03em;
    text-transform: uppercase;
    background: var(--surface-recess);
    color: var(--ink-muted);
  }
  .a-x {
    margin-left: auto;
    width: 28px;
    height: 28px;
    flex: 0 0 auto;
    border: 0;
    background: var(--surface-recess);
    border-radius: var(--radius-sm);
    color: var(--ink-muted);
    display: grid;
    place-items: center;
    cursor: pointer;
    transition: background var(--dur-control) var(--ease-in-out);
  }
  .a-x svg {
    width: 14px;
    height: 14px;
  }
  @media (hover: hover) and (pointer: fine) {
    .a-x:hover {
      background: var(--surface-hover);
      color: var(--ink-strong);
    }
  }
  .a-x:focus-visible {
    outline: 2px solid var(--focus-ring);
    outline-offset: 2px;
  }

  /* ---- BODY ---- */
  .body {
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
    overflow-x: hidden;
    padding: var(--space-4) var(--space-4) var(--space-5);
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
  }

  .sect {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .sect-h {
    font-size: var(--text-label);
    font-weight: var(--weight-strong);
    color: var(--ink-strong);
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
  .sect-note {
    font-size: var(--text-label);
    line-height: var(--leading-body);
    color: var(--ink-muted);
  }
  .sect-note.fail {
    color: var(--status-fail-ink);
  }
  .sect-hint {
    font-size: var(--text-meta);
    color: var(--ink-muted);
    line-height: var(--leading-body);
  }
  .prompt-clip {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .status-block {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }
  .dot {
    width: 7px;
    height: 7px;
    border-radius: var(--radius-pill);
    flex: 0 0 auto;
  }
  .dot.on {
    background: var(--data-ok);
  }
  .dot.off {
    background: var(--neutral-7);
  }
  .status-label {
    font-size: var(--text-label);
    font-weight: var(--weight-medium);
    color: var(--ink-strong);
    font-variant-numeric: tabular-nums;
  }

  /* ---- EMPTY STATE (mock anatomy) ---- */
  .empty {
    flex: 1 1 auto;
    position: relative;
    display: grid;
    place-items: center;
    min-height: 200px;
    padding: var(--space-5);
    text-align: center;
  }
  .empty-grid {
    position: absolute;
    inset: 0;
    background-image:
      linear-gradient(var(--border-hairline) 1px, transparent 1px),
      linear-gradient(90deg, var(--border-hairline) 1px, transparent 1px);
    background-size: 22px 22px;
    opacity: 0.5;
    mask-image: radial-gradient(closest-side, #000, transparent);
    -webkit-mask-image: radial-gradient(closest-side, #000, transparent);
  }
  .empty-orb {
    width: 52px;
    height: 52px;
    border-radius: var(--radius-pill);
    background: var(--surface-recess);
    border: 1px solid var(--border-hairline);
    box-shadow: var(--shadow-tile);
    display: grid;
    place-items: center;
    position: relative;
  }
  .empty-orb :global(svg) {
    width: 22px;
    height: 22px;
    color: var(--ink-strong);
  }
  .empty-h {
    font-size: var(--text-body);
    font-weight: var(--weight-strong);
    color: var(--ink-strong);
    margin-top: var(--space-3);
    position: relative;
  }
  .empty-p {
    font-size: var(--text-label);
    line-height: var(--leading-body);
    color: var(--ink-muted);
    margin-top: var(--space-1);
    max-width: 260px;
    position: relative;
  }

  /* ---- LOG ---- */
  .log-sect {
    flex: 1 1 auto;
    min-height: 0;
  }
  .log {
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 1px;
    overflow-y: auto;
    min-height: 0;
  }
  /* Rows keep their own height and the list scrolls: a shrinkable row in a
     scrolling flex column is squeezed below its text and paints over the
     next one. */
  .log-row {
    flex: 0 0 auto;
    display: flex;
    align-items: baseline;
    gap: var(--space-2);
    padding: var(--space-1) 0;
    font-size: var(--text-label);
    line-height: var(--leading-ui);
  }
  .log-time {
    flex: 0 0 auto;
    width: 28px;
    font-variant-numeric: tabular-nums;
    color: var(--ink-muted);
    font-size: var(--text-meta);
  }
  /* A fixed column, so source and verdict line up down the list. */
  .log-session {
    flex: 0 0 100px;
    min-width: 0;
    text-align: start;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 100px;
    border: 0;
    background: none;
    padding: 0;
    font: inherit;
    color: var(--ink-strong);
    cursor: pointer;
    text-decoration: none;
  }
  @media (hover: hover) and (pointer: fine) {
    .log-session:hover {
      color: var(--ink-strong);
      text-decoration: underline;
      text-underline-offset: 2px;
    }
  }
  .log-session:focus-visible {
    outline: 2px solid var(--focus-ring);
    outline-offset: 1px;
    border-radius: 2px;
  }
  .log-session-gone {
    flex: 0 0 100px;
    font-family: var(--font-mono);
    font-size: var(--text-meta);
    color: var(--ink-muted);
  }
  .log-source {
    flex: 0 0 auto;
    font-size: var(--text-meta);
    color: var(--ink-muted);
  }
  .log-verdict {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    height: 18px;
    padding: 0 6px;
    border-radius: var(--radius-pill);
    font-size: var(--text-meta);
    font-weight: var(--weight-strong);
  }
  .log-verdict.muted {
    background: var(--surface-recess);
    color: var(--ink-muted);
  }
  .log-verdict.live {
    background: var(--status-live-bg);
    color: var(--status-live-ink);
  }
  .log-verdict.attn {
    background: var(--status-attn-bg);
    color: var(--status-attn-ink);
  }
  .log-verdict.fail {
    background: var(--status-fail-bg);
    color: var(--status-fail-ink);
  }
  .log-msg {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: var(--text-meta);
    color: var(--ink-muted);
  }

  /* ---- MOBILE DRAWER OVERRIDES ---- */
  :global(.assistant-drawer) {
    max-height: 85dvh !important;
  }
  .panel-inner {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    overflow: hidden;
  }

  /* ---- REDUCED MOTION ---- */
  @media (prefers-reduced-motion: reduce) {
    .panel {
      animation: none;
    }
  }
</style>
