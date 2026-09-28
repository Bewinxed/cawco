<script lang="ts">
  /**
   * Per-session autopilot toggle — a button in the composer's control row that
   * opens a popover (desktop) or drawer (mobile) with the standing-prompt
   * textarea and enable switch. State reads from the instance row in the store;
   * writes go through `PUT /api/autopilot/:id` via autopilot.ts.
   */
  import type { InstanceRow } from "@whiffle/core";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for importing a component group
  import * as Drawer from "$lib/components/ui/drawer";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for importing a component group
  import * as Popover from "$lib/components/ui/popover";
  import Switch from "$lib/components/ui/switch/switch.svelte";
  import { IsMobile } from "$lib/hooks/is-mobile.svelte";
  import { IconSkill } from "$lib/icons";
  import { setAutopilot } from "./autopilot";
  import { whiffle } from "./client.svelte";

  let {
    instanceId,
    instance,
  }: {
    instanceId: string;
    instance: InstanceRow | undefined;
  } = $props();

  const narrow = new IsMobile(900);

  let open = $state(false);
  let saving = $state(false);
  let refused = $state<string | null>(null);

  /** Local draft — seeded from the instance row each time the popover opens. */
  let draft = $state("");
  let enabled = $state(false);

  const active = $derived(instance?.autopilot?.enabled === true);

  /**
   * The supervisor's live presence: `evaluating` spins a halo around this
   * button while the verdict model deliberates; `settled` pulses the halo
   * once in the verdict's color, then the accessor times it out. The tick
   * below re-reads after the pulse window so the halo actually leaves the
   * DOM instead of lingering until the next unrelated update.
   */
  let activityTick = $state(0);
  const activity = $derived.by(() => {
    // biome-ignore lint/complexity/noVoid: fire-and-forget read to force re-evaluation after the pulse window closes
    void activityTick;
    return whiffle.supervisorActivityOf(instanceId);
  });
  $effect(() => {
    if (activity?.phase !== "settled") {
      return;
    }
    const remaining = Math.max(100, 2600 - (Date.now() - activity.at));
    const timer = setTimeout(() => {
      activityTick += 1;
    }, remaining + 50);
    return () => clearTimeout(timer);
  });
  const evaluating = $derived(activity?.phase === "evaluating");
  const settled = $derived(
    activity?.phase === "settled" ? activity.verdict : null
  );
  const verdictInk = $derived.by(() => {
    if (settled === "reply") {
      return "var(--accent-solid)";
    }
    if (settled === "escalate" || settled === "ask") {
      return "var(--status-attn-ink)";
    }
    if (settled === "error") {
      return "var(--error-11)";
    }
    return "var(--ink-muted)";
  });
  const presence = $derived.by(() => {
    if (evaluating) {
      return "The supervisor is reading this turn…";
    }
    if (settled === "silent") {
      return "Supervisor: let it pass";
    }
    if (settled === "reply") {
      return "Supervisor: replied";
    }
    if (settled === "escalate" || settled === "ask") {
      return "Supervisor: escalated to you";
    }
    if (settled === "error") {
      return "Supervisor: errored";
    }
    return null;
  });

  function seed() {
    draft = instance?.autopilot?.prompt ?? "";
    enabled = instance?.autopilot?.enabled ?? false;
    refused = null;
  }

  function onOpenChange(next: boolean) {
    if (next) {
      seed();
    }
    open = next;
  }

  async function save() {
    if (saving) {
      return;
    }
    if (enabled && draft.trim().length < 10) {
      refused = "The standing prompt needs at least 10 characters.";
      return;
    }
    saving = true;
    refused = null;
    try {
      await setAutopilot(instanceId, { enabled, prompt: draft.trim() });
      open = false;
    } catch (e) {
      refused = e instanceof Error ? e.message : String(e);
    } finally {
      saving = false;
    }
  }
</script>

{#snippet body()}
  <div class="ap-body">
    <!-- biome-ignore lint/a11y/noLabelWithoutControl: Switch renders a native <button>, a labelable element the linter can't see through -->
    <label class="ap-row">
      <span class="ap-label">Autopilot</span>
      <Switch size="sm" bind:checked={enabled} />
    </label>

    <textarea
      aria-label="Standing prompt"
      class="ap-prompt"
      placeholder="What should the autopilot watch for and how should it respond?"
      rows="4"
      bind:value={draft}
    ></textarea>

    {#if refused}
      <p class="ap-error">{refused}</p>
    {/if}

    <button class="ap-save" disabled={saving} onclick={save} type="button">
      {saving ? 'Saving…' : 'Save'}
    </button>
  </div>
{/snippet}

{#if narrow.current}
  <Drawer.Root {onOpenChange} bind:open>
    <Drawer.Trigger>
      {#snippet child({ props })}
        <button
          {...props}
          aria-label={active ? 'Autopilot enabled' : 'Autopilot'}
          aria-pressed={active}
          class="ap-trigger touch-hit"
          title={presence ?? (active ? 'Autopilot enabled' : 'Autopilot')}
          type="button"
          class:ap-active={active}
        >
          {#if evaluating}
            <span aria-hidden="true" class="ap-halo ap-halo-spin"></span>
          {:else if settled}
            {#key activity}
              <span
                aria-hidden="true"
                class="ap-halo ap-halo-pulse"
                style:--verdict-ink={verdictInk}
              ></span>
            {/key}
          {/if}
          <IconSkill />
        </button>
      {/snippet}
    </Drawer.Trigger>
    <Drawer.Content
      class="max-h-[85vh] pb-[calc(1rem+env(safe-area-inset-bottom))]"
    >
      <Drawer.Header class="p-0 pb-3 text-left">
        <Drawer.Title class="text-left">Autopilot</Drawer.Title>
      </Drawer.Header>
      {@render body()}
    </Drawer.Content>
  </Drawer.Root>
{:else}
  <Popover.Root {onOpenChange} bind:open>
    <Popover.Trigger>
      {#snippet child({ props })}
        <button
          {...props}
          aria-label={active ? 'Autopilot enabled' : 'Autopilot'}
          aria-pressed={active}
          class="ap-trigger touch-hit"
          title={presence ?? (active ? 'Autopilot enabled' : 'Autopilot')}
          type="button"
          class:ap-active={active}
        >
          {#if evaluating}
            <span aria-hidden="true" class="ap-halo ap-halo-spin"></span>
          {:else if settled}
            {#key activity}
              <span
                aria-hidden="true"
                class="ap-halo ap-halo-pulse"
                style:--verdict-ink={verdictInk}
              ></span>
            {/key}
          {/if}
          <IconSkill />
        </button>
      {/snippet}
    </Popover.Trigger>
    <Popover.Content align="start" class="w-72 p-0" side="top" sideOffset={8}>
      <div class="ap-popover-inner">
        <p class="ap-title">Autopilot</p>
        {@render body()}
      </div>
    </Popover.Content>
  </Popover.Root>
{/if}

{#if presence}
  <span aria-live="polite" class="sr-only" role="status">{presence}</span>
{/if}

<style>
  .ap-trigger {
    position: relative;
    width: var(--cin-ctl, 34px);
    height: var(--cin-ctl, 34px);
    flex: 0 0 auto;
    display: grid;
    place-items: center;
    cursor: pointer;
    border-radius: calc(var(--radius-lg) - var(--cin-pad, var(--space-2)));
    border: 1px solid var(--border-control);
    background: var(--surface-raised);
    color: var(--ink-muted);
    transition:
      background-color var(--dur-control) var(--ease-out),
      color var(--dur-control) var(--ease-out),
      transform var(--dur-control) var(--ease-out);
  }
  /* The supervisor's halo: a hairline ring floating just outside the control.
     Deliberating = a short arc orbiting (conic gradient, masked to a ring);
     settled = one full-ring pulse in the verdict's ink, then gone. */
  .ap-halo {
    position: absolute;
    inset: -3px;
    border-radius: calc(
      var(--radius-lg) -
      var(--cin-pad, var(--space-2)) +
      3px
    );
    pointer-events: none;
    padding: 1.5px;
    -webkit-mask:
      linear-gradient(#000 0 0) content-box,
      linear-gradient(#000 0 0);
    mask:
      linear-gradient(#000 0 0) content-box,
      linear-gradient(#000 0 0);
    -webkit-mask-composite: xor;
    mask-composite: exclude;
  }
  .ap-halo-spin {
    background: conic-gradient(
      from 0deg,
      transparent 0 62%,
      oklch(from var(--accent-solid) l c h / 0.6) 78%,
      var(--accent-solid) 92%,
      transparent 100%
    );
    animation: ap-halo-orbit 1400ms linear infinite;
  }
  @keyframes ap-halo-orbit {
    to {
      transform: rotate(1turn);
    }
  }
  .ap-halo-pulse {
    background: var(--verdict-ink, var(--ink-muted));
    animation: ap-halo-fade 2400ms var(--ease-out) both;
  }
  @keyframes ap-halo-fade {
    0% {
      opacity: 0.9;
    }
    100% {
      opacity: 0;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .ap-halo-spin {
      animation: none;
      background: oklch(from var(--accent-solid) l c h / 0.45);
    }
    .ap-halo-pulse {
      animation: none;
      opacity: 0.5;
    }
  }
  .ap-trigger :global(svg) {
    width: 16px;
    height: 16px;
  }
  @media (hover: hover) and (pointer: fine) {
    .ap-trigger:hover {
      background: var(--surface-hover);
      color: var(--ink-strong);
    }
  }
  .ap-trigger:active {
    transform: scale(0.96);
  }
  .ap-trigger:focus-visible {
    outline: 2px solid var(--focus-ring);
    outline-offset: 1px;
  }
  /* Active state: accent-colored glyph, no solid fill. */
  .ap-active {
    color: var(--accent-text);
    border-color: var(--accent-text);
  }

  .ap-popover-inner {
    padding: var(--space-4);
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }
  .ap-title {
    font-size: var(--text-label);
    font-weight: 500;
    color: var(--ink-strong);
    margin: 0;
  }
  .ap-body {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }
  .ap-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    cursor: pointer;
  }
  .ap-label {
    font-size: var(--text-label);
    color: var(--ink-strong);
    font-weight: 500;
  }
  .ap-prompt {
    border: 1px solid var(--border-control);
    border-radius: var(--radius-sm);
    background: var(--surface-recess);
    color: var(--ink-strong);
    font-family: var(--font-body);
    font-size: var(--text-body);
    font-weight: var(--weight-body);
    line-height: var(--leading-ui);
    padding: var(--space-2) var(--space-3);
    resize: vertical;
    min-height: 80px;
    outline: none;
  }
  .ap-prompt:focus {
    border-color: var(--ring);
    box-shadow: 0 0 0 2px oklch(from var(--ring) l c h / 0.15);
  }
  .ap-prompt::placeholder {
    color: var(--ink-muted);
  }
  .ap-error {
    font-size: var(--text-meta, 12px);
    color: var(--error);
    margin: 0;
    line-height: var(--leading-ui);
  }
  .ap-save {
    align-self: flex-end;
    height: 30px;
    padding: 0 var(--space-4);
    font-size: var(--text-label);
    font-weight: 500;
    border: 0;
    border-radius: var(--radius-sm);
    background: var(--brand-solid);
    color: var(--on-brand);
    cursor: pointer;
    transition:
      var(--transition-control),
      transform 160ms var(--ease-out);
  }
  .ap-save:hover {
    background: var(--ink-hover);
  }
  .ap-save:active {
    transform: scale(var(--press-scale));
  }
  .ap-save:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .ap-save:focus-visible {
    outline: 2px solid var(--focus-ring);
    outline-offset: 1px;
  }
</style>
