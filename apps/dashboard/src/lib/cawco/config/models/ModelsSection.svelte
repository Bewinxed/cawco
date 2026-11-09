<script lang="ts">
  import { detach } from "@cawco/core/detach";
  import type { FleetWatchSettings } from "@cawco/core/fleet-watch";
  import { hubRequest } from "@cawco/core/hub-request";
  import {
    DEFAULT_IMAGE_SETTINGS,
    type ImageSettings,
  } from "@cawco/core/image-generation";
  import {
    type ImageAccounts,
    type ImageMachine,
    imageReadiness,
  } from "@cawco/core/image-readiness";
  import { imageSettingsWords } from "@cawco/core/words/image-settings";
  import { onMount } from "svelte";
  import { blur } from "svelte/transition";
  import Field from "#lib/cawco/config/Field.svelte";
  import SectionFrame from "#lib/cawco/config/SectionFrame.svelte";
  import SwitchField from "#lib/cawco/config/SwitchField.svelte";
  import { sectionOf } from "#lib/cawco/config/sections.js";
  import { leaveThePage } from "#lib/cawco/leaving.js";
  import { orderMachines } from "#lib/cawco/rail.svelte.js";
  import {
    type JevState,
    type OpenRouterState,
    saveSuggestSetting,
    suggestions,
  } from "#lib/cawco/suggest.svelte.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { Input } from "#lib/components/ui/input/index.js";
  import { LiveDot } from "#lib/components/ui/live-dot/index.js";
  import { SectionHeader } from "#lib/components/ui/section-header/index.js";
  import { IconGlobe, IconJev, IconRules } from "#lib/icons.js";
  import { frameSize } from "#lib/platform/frame-observer.js";
  import {
    failureClause,
    failureWords,
    hubFetch,
    hubRefusal,
    hubSaid,
  } from "#lib/platform/hub-read.js";
  import { dur, easeOut } from "#lib/platform/motion/curves.svelte.js";
  import { unfold } from "#lib/platform/motion/fold.svelte.js";
  import { formatDistanceToNow } from "#lib/utils/time.js";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import ImageDefault from "./ImageDefault.svelte";

  /**
   * The models the hub itself talks to. Jev is reached one of two ways: a
   * TypeSafe key the hub holds (straight to TypeSafe), or OpenRouter,
   * connected by OAuth PKCE: the hub holds the verifier and the key, the
   * browser only carries the operator to OpenRouter and the `code` back here.
   * A held TypeSafe key is the route; neither is Jev off. Fleet watch is the
   * hub's watch over every session for a loop or a stall: its switch, and
   * what opens a signal, as facts. Images is the provider and model
   * `generate_image` goes to when a call names none, and where each provider
   * can make an image, read from the fleet's machines and accounts.
   */
  let {
    machines,
    accounts,
  }: {
    /** The fleet's machines, as the socket last said them. */
    machines: ImageMachine[];
    /** The hub's accounts, their sign-ins and readings; null until read. */
    accounts: ImageAccounts | null;
  } = $props();

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
      const response = await hubFetch(hubRequest("GET /api/openrouter"));
      if (!response.ok) {
        throw await hubRefusal(response);
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
      const response = await hubFetch(hubRequest("GET /api/jev"));
      if (!response.ok) {
        throw await hubRefusal(response);
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
    const response = await hubFetch(
      hubRequest("PUT /api/jev/typesafe-key", {
        body: { key: typesafeKey.trim() },
      })
    );
    if (response.ok) {
      typesafeKey = "";
      takeJev((await response.json()) as JevState);
    } else {
      jevError = `The key was not saved. ${await hubSaid(response)}. Jev's route is unchanged.`;
    }
    savingKey = false;
  }

  async function removeKey() {
    removingKey = true;
    jevError = null;
    const response = await hubFetch(hubRequest("DELETE /api/jev/typesafe-key"));
    if (response.ok) {
      takeJev((await response.json()) as JevState);
    } else {
      jevError = `The key was not removed. ${await hubSaid(response)}. It is still held.`;
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
  /** The key's status lines' height, which their box glides to: read as it mounts, and a change in the next frame (frameSize). */
  let keyHeight = $state(0);
  const measureKey = frameSize(
    (node: HTMLElement) => node.clientHeight,
    (value) => {
      keyHeight = value;
    }
  );

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
    const response = await hubFetch(
      hubRequest("POST /api/openrouter/connect", {
        body: { callbackUrl: `${location.origin}/config/models` },
      })
    );
    if (!response.ok) {
      openrouterError = (await hubRefusal(response)).message;
      connecting = false;
      return;
    }
    const { authUrl } = (await response.json()) as { authUrl: string };
    leaveThePage(() => {
      location.href = authUrl;
    });
  }

  async function exchange(code: string) {
    exchanging = true;
    openrouterError = null;
    const response = await hubFetch(
      hubRequest("POST /api/openrouter/exchange", { body: { code } })
    );
    if (response.ok) {
      // The status line above says so: "Connected just now".
      await readOpenRouter();
    } else {
      openrouterError = (await hubRefusal(response)).message;
    }
    exchanging = false;
  }

  async function disconnect() {
    disconnecting = true;
    openrouterError = null;
    const response = await hubFetch(hubRequest("DELETE /api/openrouter"));
    if (response.ok) {
      await readOpenRouter();
    } else {
      openrouterError = (await hubRefusal(response)).message;
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
      const response = await hubFetch(hubRequest("GET /api/fleet-watch"));
      if (!response.ok) {
        throw await hubRefusal(response);
      }
      watch = (await response.json()) as FleetWatchSettings;
    } catch (error) {
      watchError = `Could not read fleet watch — ${failureClause(error)}.`;
    }
  }

  async function setWatch(on: boolean) {
    savingWatch = true;
    watchError = null;
    const response = await hubFetch(
      hubRequest("PUT /api/fleet-watch", { body: { on } })
    );
    if (response.ok) {
      watch = (await response.json()) as FleetWatchSettings;
    } else {
      watchError = (await hubRefusal(response)).message;
    }
    savingWatch = false;
  }

  // ── images: the fleet's image default ──────────────────────────────────
  /** The hub's saved choice; null until read. */
  let image = $state<ImageSettings | null>(null);
  /** The choice on screen: the hub's, or the one being saved. */
  let imageShown = $state<ImageSettings>(DEFAULT_IMAGE_SETTINGS);
  let imagePhase = $state<"idle" | "saving" | "saved" | "failed">("idle");
  /** Why the image settings couldn't be read. */
  let imageUnread = $state<string | null>(null);
  /** Why the last save didn't hold. */
  let imageFault = $state<string | null>(null);
  /** A pick made while a save was on its way: saved once that one settles. */
  let imageNext: ImageSettings | null = null;
  const readiness = $derived(imageReadiness(orderMachines(machines), accounts));

  const sameImage = (a: ImageSettings, b: ImageSettings) =>
    a.provider === b.provider && a.model === b.model;

  async function readImage() {
    try {
      const response = await hubFetch(hubRequest("GET /api/image-settings"));
      if (!response.ok) {
        throw await hubRefusal(response);
      }
      image = (await response.json()) as ImageSettings;
      imageShown = image;
    } catch (error) {
      imageUnread = imageSettingsWords.unread(failureClause(error));
    }
  }

  /**
   * A pick saves at once. One made while a save is on its way is shown at
   * once and saved when that one settles: the latest pick is the one that
   * holds, so no press is lost.
   */
  function chooseImage(next: ImageSettings) {
    if (!image) {
      return;
    }
    imageShown = next;
    if (imagePhase === "saving") {
      imageNext = next;
      return;
    }
    detach(saveImage(next), "saveImage");
  }

  /**
   * Saves one pick. A refusal is said in the hub's words, a save that never
   * reached it by why; either puts the hub's choice back. (The options are
   * core's IMAGE_PROVIDERS and IMAGE_PROVIDER_MODELS, the list the hub
   * checks a save against, and every hub that answers this route has them
   * all, so no option is one the hub doesn't offer.)
   */
  async function saveImage(next: ImageSettings) {
    const held = image;
    if (!held) {
      return;
    }
    imagePhase = "saving";
    imageFault = null;
    let fault: string | null = null;
    try {
      const response = await hubFetch(
        hubRequest("PUT /api/image-settings", { body: next })
      );
      if (response.ok) {
        image = (await response.json()) as ImageSettings;
      } else {
        fault = imageSettingsWords.refused(
          await hubSaid(response),
          held.provider
        );
      }
    } catch (error) {
      fault = imageSettingsWords.unsent(failureWords(error), held.provider);
    }
    const later = imageNext;
    imageNext = null;
    const settled = image ?? held;
    if (later && !sameImage(later, settled)) {
      await saveImage(later);
      return;
    }
    imageShown = settled;
    imageFault = fault;
    imagePhase = fault ? "failed" : "saved";
  }

  /**
   * The section shows once its reads and the hub's accounts are in (or the OAuth code is being
   * exchanged), so its first paint is the state it keeps: the header's button,
   * the switches' hints and the status line are already their final size.
   */
  const ready = $derived(
    watch !== null &&
      image !== null &&
      accounts !== null &&
      ((openrouter !== null && jev !== null) || exchanging)
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
  /** OpenRouter's status lines' height, which their box glides to: read as it mounts, and a change in the next frame (frameSize). */
  let openrouterHeight = $state(0);
  const measureOpenrouter = frameSize(
    (node: HTMLElement) => node.clientHeight,
    (value) => {
      openrouterHeight = value;
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
      detach(finishConnect(code), "finishConnect");
      detach(readJev(), "readJev");
    } else {
      detach(readOpenRouter(), "readOpenRouter");
    }
    detach(readWatch(), "readWatch");
    detach(readImage(), "readImage");
  });
  /** A status line's swap: each line blurs in over the panel tier and out over the exit's. */
  const lineBlur = (tier: "--dur-panel" | "--dur-exit") => ({
    duration: dur(tier),
    easing: easeOut,
    amount: 2,
  });
</script>

<!-- A status line's done mark: the check drawn on its done disc. -->
{#snippet doneCheck()}
  <svg
    aria-hidden="true"
    class="size-icon-md flex-none self-center fill-none"
    data-slot="check"
    viewBox="0 0 20 20"
  >
    <circle cx="10" cy="10" r="10" class="fill-status-done-bg stroke-none"
    ></circle>
    <path
      d="M6.2 10.4l2.5 2.5 5.1-5.6"
      class="stroke-status-done-glyph motion-safe:animate-check-draw motion-safe:dash-unit"
      pathLength="1"
      stroke-linecap="round"
      stroke-linejoin="round"
      stroke-width="1.8"
    ></path>
  </svg>
{/snippet}

<SectionFrame
  problem={ready
    ? null
    : (openrouterError ?? jevError ?? watchError ?? imageUnread)}
  {ready}
  {section}
>
  <div data-slot="group" class="flex flex-col gap-space-2">
    <SectionHeader level={2} hue={HUE} icon={IconGlobe} label="OpenRouter">
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
            variant="outline"
          />
        {/if}
      {/snippet}
    </SectionHeader>
    <p data-slot="note" class="type-meta max-w-c-measure text-ink-muted">
      One way to reach Jev. A TypeSafe key held in Jev below takes over from it.
    </p>
    <div
      class="overflow-hidden motion-safe:transition-[block-size] motion-safe:duration-(--dur-morph) motion-safe:ease-drawer"
      style:block-size={openrouterHeight ? `${openrouterHeight}px` : undefined}
    >
      <!-- A status line that swaps: the lines cross-fade over each other in one grid cell. -->
      <div data-slot="stack" class="grid" {@attach measureOpenrouter}>
        {#key phase}
          <p
            data-slot="num"
            aria-live="polite"
            class="num mark-line group type-body col-start-1 row-start-1 flex items-center gap-space-2 text-ink-muted tone-ok:text-ink-strong"
            data-tone={phase === "connected" ? "ok" : "off"}
            in:blur={lineBlur("--dur-panel")}
            out:blur={lineBlur("--dur-exit")}
          >
            {#if phase === "exchanging"}
              <LiveDot data-pulse data-slot="dot" size="row" tone="muted" />
              <span>Finishing the connection with OpenRouter…</span>
            {:else if phase === "connected" && openrouter?.connectedAt}
              {@render doneCheck()}
              <span
                >Connected {formatDistanceToNow(
                  new Date(openrouter.connectedAt)
                )}</span
              >
            {:else}
              <span
                data-slot="dot"
                aria-hidden="true"
                class="size-space-2 flex-none rounded-pill bg-ink-muted opacity-50 group-tone-ok:bg-status-done-glyph group-tone-ok:opacity-100"
                data-box
              ></span>
              <span>Not connected</span>
            {/if}
          </p>
        {/key}
      </div>
    </div>
    {#if openrouterError}
      <p
        class="type-meta wrap-anywhere whitespace-pre-wrap text-status-fail-ink"
        role="alert"
        transition:unfold
      >
        {openrouterError}
      </p>
    {/if}
  </div>

  <form
    data-slot="group"
    class="flex flex-col gap-space-2 border-t border-border-hairline pt-space-5"
    data-group="jev"
    onsubmit={saveKey}
  >
    <SectionHeader level={2} hue={HUE} icon={IconJev} label="Jev">
      {#snippet right()}
        <div data-slot="actions" class="flex gap-space-2">
          {#if jev?.typesafe}
            <Button
              disabled={savingKey}
              label="Remove key"
              onclick={removeKey}
              pending={removingKey}
              pendingLabel="Removing…"
              size="sm"
              variant="destructive"
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
    <p data-slot="note" class="type-meta max-w-c-measure text-ink-muted">
      Answers the hub's yes/no questions: meaning rules, fleet watch,
      suggestions and its own judgments. It goes straight to TypeSafe while a
      key is held here, otherwise through OpenRouter.
    </p>
    <p
      aria-live="polite"
      class="mark-line group type-body flex items-center gap-space-2 text-ink-muted tone-ok:text-ink-strong"
      data-testid="jev-route"
      data-tone={jev?.route ? "ok" : "off"}
    >
      <span
        data-slot="dot"
        aria-hidden="true"
        class="size-space-2 flex-none rounded-pill bg-ink-muted opacity-50 group-tone-ok:bg-status-done-glyph group-tone-ok:opacity-100"
        data-box
      ></span>
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
      class="overflow-hidden motion-safe:transition-[block-size] motion-safe:duration-(--dur-morph) motion-safe:ease-drawer"
      style:block-size={keyHeight ? `${keyHeight}px` : undefined}
    >
      <div data-slot="stack" class="grid" {@attach measureKey}>
        {#key keyPhase}
          <p
            data-slot="num"
            aria-live="polite"
            class="num mark-line group type-body col-start-1 row-start-1 flex items-center gap-space-2 text-ink-muted tone-ok:text-ink-strong"
            data-testid="typesafe-key-state"
            data-tone={keyPhase === "held" ? "ok" : "off"}
            in:blur={lineBlur("--dur-panel")}
            out:blur={lineBlur("--dur-exit")}
          >
            {#if jev?.typesafe}
              {@render doneCheck()}
              <span>Held, ends …{jev.typesafe.ends}</span>
            {:else}
              <span
                data-slot="dot"
                aria-hidden="true"
                class="size-space-2 flex-none rounded-pill bg-ink-muted opacity-50 group-tone-ok:bg-status-done-glyph group-tone-ok:opacity-100"
                data-box
              ></span>
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
      <p
        class="type-meta wrap-anywhere whitespace-pre-wrap text-status-fail-ink"
        role="alert"
        transition:unfold
      >
        {jevError}
      </p>
    {/if}
  </form>

  <div
    data-slot="group"
    class="flex flex-col gap-space-2 border-t border-border-hairline pt-space-5"
  >
    <SectionHeader level={2} hue={HUE} icon={IconRules} label="Fleet watch" />
    <p data-slot="note" class="type-meta max-w-c-measure text-ink-muted">
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
      <ul
        data-slot="num"
        class="num type-meta flex flex-col gap-space-1 text-ink-muted"
      >
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
      <p
        class="type-meta wrap-anywhere whitespace-pre-wrap text-status-fail-ink"
        role="alert"
        transition:unfold
      >
        {watchError}
      </p>
    {/if}
  </div>

  <ImageDefault
    fault={imageFault}
    hue={HUE}
    onchoose={chooseImage}
    phase={imagePhase}
    {readiness}
    value={imageShown}
  />
</SectionFrame>
