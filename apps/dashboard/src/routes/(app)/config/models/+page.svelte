<script lang="ts">
  import type { FleetWatchSettings } from "@cawco/core";
  import { onMount } from "svelte";
  import { blur } from "svelte/transition";
  import Field from "#lib/cawco/config/Field.svelte";
  import SectionFrame from "#lib/cawco/config/SectionFrame.svelte";
  import SwitchField from "#lib/cawco/config/SwitchField.svelte";
  import { sectionOf } from "#lib/cawco/config/sections.js";
  import { failureClause, failureWords } from "#lib/cawco/hub-read.js";
  import { dur, easeOut } from "#lib/cawco/motion/curves.svelte.js";
  import { unfold } from "#lib/cawco/motion/fold.svelte.js";
  import {
    type JevState,
    type OpenRouterState,
    saveSuggestSetting,
    suggestions,
  } from "#lib/cawco/suggest.svelte.js";
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
   * A held TypeSafe key is the route; neither is Jev off. Fleet watch is the
   * hub's watch over every session for a loop or a stall: its switch, and
   * what opens a signal, as facts.
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
      openrouterError = `Could not read the OpenRouter connection — ${failureClause(error)}.`;
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
      jevError = `Could not read Jev's settings — ${failureClause(error)}.`;
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
      case null:
      case undefined:
        break;
    }
    return "Jev is off. Save a TypeSafe key here, or connect OpenRouter above.";
  });
  let keyHeight = $state(0);

  /**
   * OpenRouter returns only to https (its OAuth `callback_url` takes "https
   * URLs and localhost/127.0.0.1 URLs"), and the callback is this page's own
   * origin: on plain http nothing starts, and the group says why.
   */
  const NEEDS_HTTPS =
    "OpenRouter signs in only through the dashboard's https address. Open the dashboard there once, then connect.";

  async function connect() {
    openrouterError = null;
    if (location.protocol !== "https:") {
      openrouterError = NEEDS_HTTPS;
      return;
    }
    connecting = true;
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
      jevError = failureWords(error);
    }
    savingSuggest = false;
  }

  // ── fleet watch ────────────────────────────────────────────────────────
  let watch = $state<FleetWatchSettings | null>(null);
  let watchError = $state<string | null>(null);
  let savingWatch = $state(false);

  async function readWatch() {
    try {
      const response = await fetch("/api/fleet-watch");
      if (!response.ok) {
        throw new Error(`the hub answered ${response.status}`);
      }
      watch = (await response.json()) as FleetWatchSettings;
    } catch (error) {
      watchError = `Could not read fleet watch — ${failureClause(error)}.`;
    }
  }

  async function setWatch(on: boolean) {
    savingWatch = true;
    watchError = null;
    const response = await fetch("/api/fleet-watch", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ on }),
    });
    if (response.ok) {
      watch = (await response.json()) as FleetWatchSettings;
    } else {
      watchError = `${response.status} ${await response.text()}`;
    }
    savingWatch = false;
  }

  /**
   * The section shows once both reads are in (or the OAuth code is being
   * exchanged), so its first paint is the state it keeps: the header's button,
   * the switches' hints and the status line are already their final size.
   */
  const ready = $derived(
    watch !== null && ((openrouter !== null && jev !== null) || exchanging)
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
    void readWatch();
  });
</script>

<SectionFrame
  problem={ready ? null : (openrouterError ?? jevError ?? watchError)}
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
            class="status num mark-line"
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
              <span aria-hidden="true" class="dot pulse" data-box></span>
              <span>Finishing the connection with OpenRouter…</span>
            {:else if phase === "connected" && openrouter?.connectedAt}
              <svg aria-hidden="true" class="check" viewBox="0 0 20 20">
                <circle cx="10" cy="10" r="10"></circle>
                <path d="M6.2 10.4l2.5 2.5 5.1-5.6"></path>
              </svg>
              <span
                >Connected {formatDistanceToNow(
                  new Date(openrouter.connectedAt)
                )}</span
              >
            {:else}
              <span aria-hidden="true" class="dot" data-box></span>
              <span>Not connected</span>
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
      Answers the hub's yes/no questions: meaning rules, fleet watch,
      suggestions and its own judgments. It goes straight to TypeSafe while a
      key is held here, otherwise through OpenRouter.
    </p>
    <p
      aria-live="polite"
      class="status mark-line"
      data-testid="jev-route"
      data-tone={jev?.route ? "ok" : "off"}
    >
      <span aria-hidden="true" class="dot" data-box></span>
      <span>{routeLine}</span>
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
            class="status num mark-line"
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
              <span>Held, ends …{jev.typesafe.ends}</span>
            {:else}
              <span aria-hidden="true" class="dot" data-box></span>
              <span>Not set</span>
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

  <div class="group">
    <SectionHeader hue={HUE} icon={IconRules} label="Fleet watch" />
    <p class="note">
      Reads every session's stream for a loop or a stall. A yes from Jev, or a
      second signal while Jev is off, starts one triage that tells the session's
      lead. In a project whose Caw is off, it tells you instead.
    </p>
    <SwitchField
      checked={watch?.on ?? false}
      disabled={!watch || savingWatch}
      hint={watch?.on
        ? "Every session is watched. Nothing spends until a signal opens."
        : "Off — no session is watched."}
      id="fleet-watch"
      label="Enabled"
      onchange={setWatch}
    />
    {#if watch}
      <ul class="facts num">
        <li>
          Same error {watch.limits.sameError} times in
          {watch.limits.errorTurns}
          turns
        </li>
        <li>Same tool call {watch.limits.sameCall} times in a row</li>
        <li>No file changed in {watch.limits.quietTurns} turns</li>
        <li>No output for {watch.limits.stallMinutes} min in a running turn</li>
        <li>
          {watch.jev
            ? "Jev answers whether a session is stuck before triage starts."
            : "Jev is off: a second signal starts triage."}
        </li>
      </ul>
    {/if}
    {#if watchError}
      <p class="problem" role="alert" transition:unfold>{watchError}</p>
    {/if}
  </div>
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
  /* Fleet watch's limits: read-only facts, one per line, in the note's face. */
  .facts {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin: 0;
    padding: 0;
    list-style: none;
    font: var(--type-meta);
    color: var(--ink-muted);
  }
  .status {
    display: flex;
    align-items: center;
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
  }
  [data-tone="ok"] .dot {
    background: var(--status-live-glyph);
    opacity: 1;
  }
</style>
