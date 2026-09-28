<script lang="ts">
  import { onMount } from "svelte";
  import { blur } from "svelte/transition";
  import { replaceState } from "$app/navigation";
  import { page } from "$app/state";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { SectionHeader } from "$lib/components/ui/section-header";
  import { IconGlobe, IconRules } from "$lib/icons";
  import { formatDistanceToNow } from "$lib/utils/time";
  import Field from "$lib/whiffle/config/Field.svelte";
  import SectionFrame from "$lib/whiffle/config/SectionFrame.svelte";
  import SwitchField from "$lib/whiffle/config/SwitchField.svelte";
  import { sectionOf } from "$lib/whiffle/config/sections";
  import { unfold } from "$lib/whiffle/motion/fold.svelte";
  import {
    type OpenRouterState,
    saveSuggestSetting,
    suggestions,
  } from "$lib/whiffle/suggest.svelte";
  import {
    loadSupervisor,
    type SupervisorStatus,
    saveSupervisorConfig,
  } from "$lib/whiffle/supervisor";

  /**
   * The models the hub itself talks to. OpenRouter is connected by OAuth
   * PKCE: the hub holds the verifier and the key, the browser only carries the
   * operator to OpenRouter and the `code` back here. The supervisor is the
   * OpenAI-compatible server that judges turns for LLM rules and autopilot.
   */
  const section = sectionOf("models");
  const HUE = section.hue;

  let openrouter = $state<OpenRouterState | null>(null);
  let openrouterError = $state<string | null>(null);
  let exchanging = $state(false);
  let connecting = $state(false);
  let disconnecting = $state(false);
  let savingSuggest = $state(false);

  async function readOpenRouter() {
    try {
      const response = await fetch("/api/openrouter");
      if (!response.ok) {
        throw new Error(`the hub answered ${response.status}`);
      }
      openrouter = (await response.json()) as OpenRouterState;
      suggestions.enabled =
        openrouter.connected && openrouter.suggestWhileTyping;
    } catch (error) {
      openrouterError = `Could not read the OpenRouter connection — ${error instanceof Error ? error.message : String(error)}.`;
    }
  }

  async function connect() {
    connecting = true;
    openrouterError = null;
    const response = await fetch("/api/openrouter/connect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ callbackUrl: `${location.origin}/config/models` }),
    });
    if (!response.ok) {
      openrouterError = `${response.status} ${await response.text()}`;
      connecting = false;
      return;
    }
    const { authUrl } = (await response.json()) as { authUrl: string };
    location.href = authUrl;
  }

  async function exchange(code: string) {
    exchanging = true;
    openrouterError = null;
    const response = await fetch("/api/openrouter/exchange", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    if (response.ok) {
      // The status line above says so: "Connected just now".
      await readOpenRouter();
    } else {
      openrouterError = `${response.status} ${await response.text()}`;
    }
    exchanging = false;
  }

  async function disconnect() {
    disconnecting = true;
    openrouterError = null;
    const response = await fetch("/api/openrouter", { method: "DELETE" });
    if (response.ok) {
      await readOpenRouter();
    } else {
      openrouterError = `${response.status} ${await response.text()}`;
    }
    disconnecting = false;
  }

  async function setSuggest(on: boolean) {
    if (!openrouter) {
      return;
    }
    savingSuggest = true;
    openrouterError = null;
    try {
      await saveSuggestSetting(on);
      openrouter.suggestWhileTyping = on;
    } catch (error) {
      openrouterError = error instanceof Error ? error.message : String(error);
    }
    savingSuggest = false;
  }

  // ── supervisor ─────────────────────────────────────────────────────────
  let supervisor = $state<SupervisorStatus | null>(null);
  let supervisorError = $state<string | null>(null);
  let enabled = $state(false);
  let baseUrl = $state("");
  let model = $state("");
  let apiKey = $state("");
  let saving = $state(false);

  async function readSupervisor() {
    try {
      supervisor = await loadSupervisor();
      const { config } = supervisor;
      ({ enabled } = config);
      baseUrl = config.baseUrl ?? "";
      model = config.model ?? "";
    } catch (error) {
      supervisorError = error instanceof Error ? error.message : String(error);
    }
  }

  async function saveSupervisor(event: SubmitEvent) {
    event.preventDefault();
    saving = true;
    supervisorError = null;
    try {
      await saveSupervisorConfig({
        enabled,
        baseUrl: baseUrl.trim(),
        model: model.trim(),
        ...(apiKey === "" ? {} : { apiKey }),
      });
      apiKey = "";
      await readSupervisor();
    } catch (error) {
      supervisorError = error instanceof Error ? error.message : String(error);
    }
    saving = false;
  }

  /**
   * The section shows once both reads are in (or the OAuth code is being
   * exchanged), so its first paint is the state it keeps: the header's button,
   * the switch's hint and both status lines are already their final size.
   */
  const ready = $derived(
    supervisor !== null && (openrouter !== null || exchanging)
  );

  /**
   * Which line the OpenRouter status shows. Each change cross-fades in place
   * (300ms in, 100ms out) while the box tweens to the new line's height.
   */
  const phase = $derived.by((): "exchanging" | "connected" | "off" => {
    if (exchanging) {
      return "exchanging";
    }
    return openrouter?.connected && openrouter.connectedAt !== null
      ? "connected"
      : "off";
  });
  /** A problem fades in over 300ms on the settle-in curve. */
  let openrouterHeight = $state(0);
  let reachHeight = $state(0);

  const reach = $derived.by(
    (): { tone: "off" | "bad" | "ok"; text: string } => {
      if (!supervisor?.status.configured) {
        return {
          tone: "off",
          text: "Not configured. Set a server URL and a model to turn it on.",
        };
      }
      const { status } = supervisor;
      if (!status.reachable) {
        return {
          tone: "bad",
          text: `The server at ${supervisor.config.baseUrl} did not answer.`,
        };
      }
      return {
        tone: "ok",
        text: status.resolvedModel
          ? `The server answers, and runs ${status.resolvedModel}.`
          : "The server answers.",
      };
    }
  );

  /**
   * OpenRouter's redirect lands here with `?code=`: exchange it, then strip it
   * from the URL once the router is up to accept a replaceState.
   */
  async function finishConnect(code: string) {
    await exchange(code);
    const url = new URL(page.url);
    url.searchParams.delete("code");
    replaceState(url, page.state);
  }

  onMount(() => {
    const code = page.url.searchParams.get("code");
    if (code) {
      // biome-ignore lint/complexity/noVoid: the exchange reports its own outcome in page state
      void finishConnect(code);
    } else {
      // biome-ignore lint/complexity/noVoid: the read reports its own outcome in page state
      void readOpenRouter();
    }
    // biome-ignore lint/complexity/noVoid: the read reports its own outcome in page state
    void readSupervisor();
  });
</script>

<SectionFrame
  problem={ready ? null : (openrouterError ?? supervisorError)}
  purpose={section.purpose}
  {ready}
  title={section.label}
>
  <div class="group">
    <SectionHeader hue={HUE} icon={IconGlobe} label="OpenRouter">
      {#snippet right()}
        {#if openrouter?.connected}
          <Button
            failed={openrouterError !== null}
            label="Disconnect"
            onclick={disconnect}
            pending={disconnecting}
            pendingLabel="Disconnecting…"
            size="sm"
            variant="outline"
          />
        {:else}
          <Button
            disabled={exchanging}
            failed={openrouterError !== null}
            label="Connect OpenRouter"
            onclick={connect}
            pending={connecting}
            pendingLabel="Opening OpenRouter…"
            size="sm"
          />
        {/if}
      {/snippet}
    </SectionHeader>
    <p class="note">
      Used to ask Jev yes/no questions for meaning-based rules.
    </p>
    <div
      class="morph"
      style:block-size={openrouterHeight ? `${openrouterHeight}px` : undefined}
    >
      <div class="stack" bind:clientHeight={openrouterHeight}>
        {#key phase}
          <p
            aria-live="polite"
            class="status num"
            data-tone={phase === 'connected' ? 'ok' : 'off'}
            in:blur={{ duration: 300, amount: 2 }}
            out:blur={{ duration: 100, amount: 2 }}
          >
            {#if phase === 'exchanging'}
              <span aria-hidden="true" class="dot pulse"></span>
              Finishing the connection with OpenRouter…
            {:else if phase === 'connected' && openrouter?.connectedAt}
              <svg aria-hidden="true" class="check" viewBox="0 0 20 20">
                <circle cx="10" cy="10" r="10"></circle>
                <path d="M6.2 10.4l2.5 2.5 5.1-5.6"></path>
              </svg>
              Connected {formatDistanceToNow(new Date(openrouter.connectedAt))}
            {:else}
              <span aria-hidden="true" class="dot"></span>
              Not connected
            {/if}
          </p>
        {/key}
      </div>
    </div>
    <SwitchField
      checked={openrouter?.suggestWhileTyping ?? false}
      disabled={!openrouter?.connected || savingSuggest}
      hint={openrouter?.connected
        ? "Jev reads the message as you write it and offers chips you can add to it. The session's tools are not changed."
        : 'Needs OpenRouter — connect it above.'}
      id="suggest-while-typing"
      label="Suggest skills and MCP servers while typing"
      onchange={setSuggest}
    />
    {#if openrouterError}
      <p class="problem" role="alert" transition:unfold>{openrouterError}</p>
    {/if}
  </div>

  <form class="group" onsubmit={saveSupervisor}>
    <SectionHeader hue={HUE} icon={IconRules} label="Supervisor">
      {#snippet right()}
        <Button
          failed={supervisorError !== null}
          label="Save supervisor"
          pending={saving}
          pendingLabel="Saving…"
          size="sm"
          type="submit"
        />
      {/snippet}
    </SectionHeader>
    <p class="note">
      The OpenAI-compatible server that judges turns for LLM rules and
      autopilot.
    </p>
    <SwitchField
      hint={enabled
        ? 'LLM rules and autopilot are judged by this server.'
        : 'Off — LLM rules and autopilot do nothing.'}
      id="supervisor-enabled"
      label="Enabled"
      bind:checked={enabled}
    />
    <div class="fields">
      <Field id="supervisor-url" label="Server URL">
        <Input
          autocomplete="off"
          class="font-mono"
          id="supervisor-url"
          placeholder="http://localhost:8080/v1"
          spellcheck="false"
          bind:value={baseUrl}
        />
      </Field>
      <Field id="supervisor-model" label="Model">
        <Input
          autocomplete="off"
          class="font-mono"
          id="supervisor-model"
          placeholder="qwen3"
          spellcheck="false"
          bind:value={model}
        />
      </Field>
    </div>
    <Field id="supervisor-key" label="API key">
      <Input
        autocomplete="off"
        id="supervisor-key"
        placeholder="Leave blank to keep the stored key"
        type="password"
        bind:value={apiKey}
      />
    </Field>
    <div
      class="morph"
      style:block-size={reachHeight ? `${reachHeight}px` : undefined}
    >
      <div class="stack" bind:clientHeight={reachHeight}>
        {#key reach.text}
          <p
            aria-live="polite"
            class="status num"
            data-tone={reach.tone}
            in:blur={{ duration: 300, amount: 2 }}
            out:blur={{ duration: 100, amount: 2 }}
          >
            <span aria-hidden="true" class="dot"></span>
            {reach.text}
          </p>
        {/key}
      </div>
    </div>
    {#if supervisorError}
      <p class="problem" role="alert" transition:unfold>{supervisorError}</p>
    {/if}
  </form>
</SectionFrame>

<style>
  .group {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .group + .group {
    padding-top: 18px;
    border-top: 1px solid var(--border-hairline);
  }
  .note {
    max-width: 72ch;
    font: var(--type-meta);
    color: var(--ink-muted);
  }
  .problem {
    font: var(--type-meta);
    color: var(--status-fail-ink);
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  /* A status line that swaps: the box tweens to the new line's height while
     the lines cross-fade over each other in one grid cell. */
  .morph {
    overflow: hidden;
    @media (prefers-reduced-motion: no-preference) {
      transition: block-size 300ms cubic-bezier(0.16, 1, 0.3, 1);
    }
  }
  .stack {
    display: grid;
  }
  .stack > :global(*) {
    grid-area: 1 / 1;
  }
  /* Connected: the tick draws itself in. */
  .check {
    width: 16px;
    height: 16px;
    flex: none;
    align-self: center;
    fill: none;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .check circle {
    fill: var(--status-live-bg);
    stroke: none;
  }
  .check path {
    stroke: var(--status-live-ink);
    stroke-width: 1.8;
    stroke-dasharray: 12;
    stroke-dashoffset: 0;
    @media (prefers-reduced-motion: no-preference) {
      animation: draw 500ms cubic-bezier(0.16, 1, 0.3, 1) 100ms both;
    }
  }
  @keyframes draw {
    from {
      stroke-dashoffset: 12;
    }
  }
  /* Finishing the connection: the dot breathes while the hub works. */
  .pulse {
    opacity: 0.6;
    animation: breathe 2000ms cubic-bezier(0.65, 0, 0.35, 1) infinite;
  }
  @keyframes breathe {
    50% {
      opacity: 0.2;
    }
  }
  .fields {
    display: grid;
    gap: 8px 12px;
  }
  @media (min-width: 640px) {
    .fields {
      grid-template-columns: 1fr 1fr;
    }
  }
  .status {
    display: flex;
    align-items: baseline;
    gap: 8px;
    font: var(--type-body);
    color: var(--ink-muted);
  }
  .status[data-tone="ok"] {
    color: var(--ink-strong);
  }
  .dot {
    width: 7px;
    height: 7px;
    flex: none;
    border-radius: 50%;
    background: var(--ink-muted);
    opacity: 0.5;
    translate: 0 -1px;
  }
  [data-tone="ok"] .dot {
    background: var(--status-live-ink);
    opacity: 1;
  }
  [data-tone="bad"] .dot {
    background: var(--status-attn-ink);
    opacity: 1;
  }
</style>
