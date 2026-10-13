<script lang="ts">
  import { onMount } from "svelte";
  import { blur } from "svelte/transition";
  import Field from "#lib/cawco/config/Field.svelte";
  import SectionFrame from "#lib/cawco/config/SectionFrame.svelte";
  import SwitchField from "#lib/cawco/config/SwitchField.svelte";
  import { sectionOf } from "#lib/cawco/config/sections.js";
  import { dur, easeOut } from "#lib/cawco/motion/curves.svelte.js";
  import { unfold } from "#lib/cawco/motion/fold.svelte.js";
  import {
    type JevState,
    type OpenRouterState,
    saveSuggestSetting,
    suggestions,
  } from "#lib/cawco/suggest.svelte.js";
  import {
    loadSupervisor,
    type SupervisorStatus,
    saveSupervisorConfig,
  } from "#lib/cawco/supervisor.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { Input } from "#lib/components/ui/input/index.js";
  import { SectionHeader } from "#lib/components/ui/section-header/index.js";
  import { IconGlobe, IconJev, IconRules } from "#lib/icons.js";
  import { formatDistanceToNow } from "#lib/utils/time.js";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";

  /**
   * The models the hub itself talks to. Jev is reached one of two ways: a
   * TypeSafe key the hub holds (straight to TypeSafe), or OpenRouter,
   * connected by OAuth PKCE: the hub holds the verifier and the key, the
   * browser only carries the operator to OpenRouter and the `code` back here.
   * A held TypeSafe key is the route; neither is Jev off. The supervisor is
   * the OpenAI-compatible server that judges turns for LLM rules and
   * autopilot.
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
    } catch (error) {
      openrouterError = `Could not read the OpenRouter connection — ${error instanceof Error ? error.message : String(error)}.`;
    }
    await readJev();
  }

  // ── Jev: its route and the TypeSafe key ────────────────────────────────
  let jev = $state<JevState | null>(null);
  let jevError = $state<string | null>(null);
  let typesafeKey = $state("");
  let savingKey = $state(false);
  let removingKey = $state(false);

  /** Takes the hub's view of Jev: its route, the key's state and the switch. */
  function takeJev(next: JevState) {
    jev = next;
    suggestions.enabled = next.route !== null && next.suggestWhileTyping;
  }

  async function readJev() {
    try {
      const response = await fetch("/api/jev");
      if (!response.ok) {
        throw new Error(`the hub answered ${response.status}`);
      }
      takeJev((await response.json()) as JevState);
    } catch (error) {
      jevError = `Could not read Jev's settings — ${error instanceof Error ? error.message : String(error)}.`;
    }
  }

  async function saveKey(event: SubmitEvent) {
    event.preventDefault();
    if (typesafeKey.trim() === "") {
      jevError =
        "Paste a TypeSafe API key first. Nothing was saved, and Jev's route is unchanged.";
      return;
    }
    savingKey = true;
    jevError = null;
    const response = await fetch("/api/jev/typesafe-key", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: typesafeKey.trim() }),
    });
    if (response.ok) {
      typesafeKey = "";
      takeJev((await response.json()) as JevState);
    } else {
      jevError = `The hub did not save the key (${response.status}): ${await response.text()}. Jev's route is unchanged.`;
    }
    savingKey = false;
  }

  async function removeKey() {
    removingKey = true;
    jevError = null;
    const response = await fetch("/api/jev/typesafe-key", { method: "DELETE" });
    if (response.ok) {
      takeJev((await response.json()) as JevState);
    } else {
      jevError = `The hub did not remove the key (${response.status}): ${await response.text()}. It is still held.`;
    }
    removingKey = false;
  }

  /** The key's state line: held (and how it ends) or not set. */
  const keyPhase = $derived(jev?.typesafe ? "held" : "unset");

  /** Which route Jev takes now, in words. */
  const routeLine = $derived.by((): string => {
    switch (jev?.route) {
      case "typesafe":
        return "Jev goes to TypeSafe directly with the key held here.";
      case "openrouter":
        return "Jev goes through OpenRouter. A key saved here takes over from it.";
      default:
        return "Jev is off. Save a TypeSafe key here, or connect OpenRouter above.";
    }
  });
  let keyHeight = $state(0);

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
    if (!jev) {
      return;
    }
    savingSuggest = true;
    jevError = null;
    try {
      await saveSuggestSetting(on);
      jev.suggestWhileTyping = on;
    } catch (error) {
      jevError = error instanceof Error ? error.message : String(error);
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
    supervisor !== null && ((openrouter !== null && jev !== null) || exchanging)
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
    const url = new URL(page.url.href);
    url.searchParams.delete("code");
    goto(url, { shallow: true, replace: true, state: page.state });
  }

  onMount(() => {
    const code = page.url.searchParams.get("code");
    if (code) {
      // biome-ignore lint/complexity/noVoid: the exchange reports its own outcome in page state
      void finishConnect(code);
      // biome-ignore lint/complexity/noVoid: the read reports its own outcome in page state
      void readJev();
    } else {
      // biome-ignore lint/complexity/noVoid: the read reports its own outcome in page state
      void readOpenRouter();
    }
    // biome-ignore lint/complexity/noVoid: the read reports its own outcome in page state
    void readSupervisor();
  });
</script>

<SectionFrame
  problem={ready ? null : (openrouterError ?? jevError ?? supervisorError)}
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
      One way to reach Jev. A TypeSafe key held in Jev below takes over from it.
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
            data-tone={phase === "connected" ? "ok" : "off"}
            in:blur={{
              duration: dur("--dur-panel"),
              easing: easeOut,
              amount: 2,
            }}
            out:blur={{
              duration: dur("--dur-exit"),
              easing: easeOut,
              amount: 2,
            }}
          >
            {#if phase === "exchanging"}
              <span aria-hidden="true" class="dot pulse"></span>
              Finishing the connection with OpenRouter…
            {:else if phase === "connected" && openrouter?.connectedAt}
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
    {#if openrouterError}
      <p class="problem" role="alert" transition:unfold>{openrouterError}</p>
    {/if}
  </div>

  <form class="group" data-group="jev" onsubmit={saveKey}>
    <SectionHeader hue={HUE} icon={IconJev} label="Jev">
      {#snippet right()}
        <div class="actions">
          {#if jev?.typesafe}
            <Button
              disabled={savingKey}
              label="Remove key"
              onclick={removeKey}
              pending={removingKey}
              pendingLabel="Removing…"
              size="sm"
              variant="outline"
            />
          {/if}
          <Button
            disabled={removingKey}
            failed={jevError !== null}
            label="Save key"
            pending={savingKey}
            pendingLabel="Saving…"
            size="sm"
            type="submit"
          />
        </div>
      {/snippet}
    </SectionHeader>
    <p class="note">
      Answers the hub's yes/no questions: meaning rules, suggestions and its own
      judgments. It goes straight to TypeSafe while a key is held here,
      otherwise through OpenRouter.
    </p>
    <p
      aria-live="polite"
      class="status"
      data-testid="jev-route"
      data-tone={jev?.route ? "ok" : "off"}
    >
      <span aria-hidden="true" class="dot"></span>
      {routeLine}
    </p>
    <Field id="typesafe-key" label="TypeSafe key">
      <Input
        autocomplete="off"
        id="typesafe-key"
        placeholder={jev?.typesafe
          ? "Paste a new key to replace the held one"
          : "Paste your TypeSafe API key"}
        type="password"
        bind:value={typesafeKey}
      />
    </Field>
    <div
      class="morph"
      style:block-size={keyHeight ? `${keyHeight}px` : undefined}
    >
      <div class="stack" bind:clientHeight={keyHeight}>
        {#key keyPhase}
          <p
            aria-live="polite"
            class="status num"
            data-testid="typesafe-key-state"
            data-tone={keyPhase === "held" ? "ok" : "off"}
            in:blur={{
              duration: dur("--dur-panel"),
              easing: easeOut,
              amount: 2,
            }}
            out:blur={{
              duration: dur("--dur-exit"),
              easing: easeOut,
              amount: 2,
            }}
          >
            {#if jev?.typesafe}
              <svg aria-hidden="true" class="check" viewBox="0 0 20 20">
                <circle cx="10" cy="10" r="10"></circle>
                <path d="M6.2 10.4l2.5 2.5 5.1-5.6"></path>
              </svg>
              Held, ends …{jev.typesafe.ends}
            {:else}
              <span aria-hidden="true" class="dot"></span>
              Not set
            {/if}
          </p>
        {/key}
      </div>
    </div>
    <SwitchField
      checked={jev?.suggestWhileTyping ?? false}
      disabled={!jev?.route || savingSuggest}
      hint={jev?.route
        ? "Jev reads the message as you write it and offers chips you can add to it. The session's tools are not changed."
        : "Needs Jev — save a TypeSafe key above, or connect OpenRouter."}
      id="suggest-while-typing"
      label="Suggest skills and MCP servers while typing"
      onchange={setSuggest}
    />
    {#if jevError}
      <p class="problem" role="alert" transition:unfold>{jevError}</p>
    {/if}
  </form>

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
        ? "LLM rules and autopilot are judged by this server."
        : "Off — LLM rules and autopilot do nothing."}
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
            in:blur={{
              duration: dur("--dur-panel"),
              easing: easeOut,
              amount: 2,
            }}
            out:blur={{
              duration: dur("--dur-exit"),
              easing: easeOut,
              amount: 2,
            }}
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
  .actions {
    display: flex;
    gap: 8px;
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
      transition: block-size var(--dur-morph) var(--ease-drawer);
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
    stroke: var(--status-live-glyph);
    stroke-width: 1.8;
    stroke-dasharray: 12;
    stroke-dashoffset: 0;
    @media (prefers-reduced-motion: no-preference) {
      animation: draw var(--dur-toggle) var(--ease-out) var(--dur-ghost) both;
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
    @media (prefers-reduced-motion: no-preference) {
      animation: breathe var(--breath) var(--ease-in-out) infinite;
    }
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
    background: var(--status-live-glyph);
    opacity: 1;
  }
  [data-tone="bad"] .dot {
    background: var(--status-attn-glyph);
    opacity: 1;
  }
</style>
