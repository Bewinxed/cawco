<script lang="ts" module>
  /** The dialog's description, under its title while the form shows. */
  export const JOIN_DESCRIPTION =
    "Install the CawCo agent on a machine and it joins this fleet.";
</script>

<script lang="ts">
  /**
   * Connect a machine's tray: one piece of content or one primary act at a
   * time (the rework's states A to I), the same element from the first
   * sign-in to the join. Props in, events out: the live dialog
   * (AddMachineDialog) and the states file (preview/JoinTrayFrame) feed it.
   *
   * The form (the two ways in as fluid tabs; the SSH target, or the
   * command and what checked in) gives way to the status card once a run
   * starts: the outgoing body fades over --dur-exit as the incoming one
   * fades in over --dur-fade, one cell, while the dialog's own `morph()`
   * tweens the tray's height on the drawer curve.
   *
   * The join is the one moment that spends motion on meaning: seen
   * running and then done in this mount, the tray says `data-moment="join"`
   * and the card's parts take its beats, each a token or a sum of them:
   * the gaps close at --dur-pop, the check and the sentence at --dur-pop +
   * --dur-toggle, Caw and the two ways on at twice --dur-pop.
   */
  import type { WaitingMachine } from "@cawco/core/hub-auth";
  import type { JoinAddress } from "@cawco/core/join";
  import { untrack } from "svelte";
  import { fade } from "svelte/transition";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte component-group convention
  import * as Alert from "#lib/components/ui/alert/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte component-group convention
  import * as Collapsible from "#lib/components/ui/collapsible/index.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte component-group convention
  import * as Dialog from "#lib/components/ui/dialog/index.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte component-group convention
  import * as Drawer from "#lib/components/ui/drawer/index.js";
  import {
    TabItem,
    Tabs,
    TabsList,
  } from "#lib/components/ui/fluid-tabs/index.js";
  import { Input } from "#lib/components/ui/input/index.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte component-group convention
  import * as InputGroup from "#lib/components/ui/input-group/index.js";
  import { Label } from "#lib/components/ui/label/index.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte component-group convention
  import * as NativeSelect from "#lib/components/ui/native-select/index.js";
  import IconChevronRight from "~icons/solar/alt-arrow-right-linear";
  import IconError from "~icons/solar/close-circle-bold-duotone";
  import IconEye from "~icons/solar/eye-bold-duotone";
  import IconEyeClosed from "~icons/solar/eye-closed-bold-duotone";
  import { dur, easeOut, motionOk } from "../motion/curves.svelte";
  import { arriveAt } from "./arrive";
  import CheckInStatus from "./CheckInStatus.svelte";
  import CopyBox from "./CopyBox.svelte";
  import { type CardView, type JoinTaste, TASTE } from "./join-view";
  import StatusCard from "./StatusCard.svelte";
  import { installCommand, JOIN_WAYS, type JoinWay } from "./ways";

  let {
    way,
    card,
    phone = false,
    taste = TASTE,
    target = $bindable(""),
    port = $bindable(""),
    password = $bindable(""),
    formAlert = null,
    retry = false,
    starting = false,
    stopping = false,
    sshKey = null,
    hubHostname = null,
    addresses = [],
    hubUrl = $bindable(""),
    joinError = null,
    waiting = [],
    admitting = null,
    admitRefused = null,
    arrival = null,
    passwordFirstOpen = false,
    onway,
    onstart,
    onstop,
    onretry,
    onchange,
    onclose,
    onadmit,
    onopenmachine,
    onstartsession,
  }: {
    way: JoinWay;
    /** The status card, or null while the form shows. */
    card: CardView | null;
    /** The phone's sheet: actions full width in its foot, no Cancel or Close. */
    phone?: boolean;
    taste?: JoinTaste;
    target?: string;
    port?: string;
    password?: string;
    /** A failure or a stop brought back to the form by Change details, or a refused start. */
    formAlert?: { text: string; tone: "fail" | "status" } | null;
    /** The form's act reads Retry: it is brought back from a failure or a stop. */
    retry?: boolean;
    starting?: boolean;
    stopping?: boolean;
    sshKey?: string | null;
    hubHostname?: string | null;
    addresses?: JoinAddress[];
    hubUrl?: string;
    joinError?: string | null;
    /** Machines that checked in and wait to be admitted (Require paired devices). */
    waiting?: WaitingMachine[];
    admitting?: string | null;
    admitRefused?: string | null;
    /** The add's id: Caw's done loop plays once for it. */
    arrival?: string | null;
    /** "Sign in with a password" stands open as the form first draws. */
    passwordFirstOpen?: boolean;
    onway?: (way: JoinWay) => void;
    onstart?: () => void;
    onstop?: () => void;
    onretry?: () => void;
    onchange?: () => void;
    onclose?: () => void;
    onadmit?: (machineId: string) => void;
    onopenmachine?: () => void;
    onstartsession?: () => void;
  } = $props();

  const id = $props.id();

  /** The join, seen as it happened: running, then done, in this mount. */
  let moment = $state(false);
  let lastTone = untrack(() => card?.tone ?? null);
  $effect.pre(() => {
    const tone = card?.tone ?? null;
    if (tone !== lastTone) {
      moment = lastTone === "running" && tone === "done";
      lastTone = tone;
    }
  });
  /** The join's beats, ms, read off the tokens (`--join-*` below says the same in CSS). */
  const beat = $derived.by(() => {
    if (!(moment && motionOk.current)) {
      return { sentence: 0, caw: 0 };
    }
    return {
      sentence: dur("--dur-pop") + dur("--dur-toggle"),
      caw: dur("--dur-pop") * 2,
    };
  });

  const portNumber = $derived(port.trim() === "" ? undefined : Number(port));
  const portValid = $derived(
    portNumber === undefined ||
      (Number.isInteger(portNumber) && portNumber >= 1 && portNumber <= 65_535)
  );
  const canStart = $derived(target.trim() !== "" && portValid && !starting);
  let passwordOpen = $state(untrack(() => passwordFirstOpen));
  let passwordShown = $state(false);
  let keyOpen = $state(false);

  const body = $derived(card ? "card" : "form");
  const settled = $derived(
    card !== null &&
      (card.tone === "fail" || card.tone === "attn" || card.tone === "stopped")
  );

  /**
   * The foot is a new one once joined, so the two ways on enter as one:
   * seen joining, they fade in on the third beat (twice --dur-pop).
   */
  const joinedFoot = $derived(card?.tone === "done");
  const footBeat = $derived(joinedFoot ? beat.caw : 0);

  /**
   * The body swaps under the press that started it (Add machine, Retry,
   * Change details go as the card or the form comes): focus goes to the
   * new foot's first act, never to the page.
   */
  let trayEl = $state<HTMLElement | null>(null);
  let lastBody = untrack(() => (card ? "card" : "form"));
  $effect(() => {
    const now = body;
    if (now === lastBody) {
      return;
    }
    lastBody = now;
    const tray = trayEl;
    const active = document.activeElement;
    if (tray && (!active || active === document.body || !active.isConnected)) {
      tray
        .querySelector<HTMLElement>('[data-slot="join-actions"] button')
        ?.focus({ preventScroll: true });
    }
  });

  function submit(event: SubmitEvent) {
    event.preventDefault();
    if (canStart) {
      onstart?.();
    }
  }
</script>

{#snippet passwordField()}
  <div class="flex min-w-0 flex-col gap-space-2 text-ink-strong">
    {#if taste.password === "shown"}
      <Label for="{id}-password">Password (optional)</Label>
    {/if}
    <InputGroup.Root>
      <InputGroup.Input
        aria-describedby="{id}-password-hint"
        aria-label={taste.password === "shown" ? undefined : "Password"}
        autocapitalize="off"
        autocomplete="current-password"
        id="{id}-password"
        spellcheck="false"
        type={passwordShown ? "text" : "password"}
        bind:value={password}
      />
      <InputGroup.Addon align="inline-end">
        <InputGroup.Button
          aria-controls="{id}-password"
          aria-label={passwordShown ? "Hide password" : "Show password"}
          aria-pressed={passwordShown}
          onclick={() => {
            passwordShown = !passwordShown;
          }}
          size="icon-xs"
        >
          {#if passwordShown}
            <IconEyeClosed />
          {:else}
            <IconEye />
          {/if}
        </InputGroup.Button>
      </InputGroup.Addon>
    </InputGroup.Root>
    <span id="{id}-password-hint" class="type-meta text-ink-subtle">
      Used once to add this hub's key to the machine, and not kept. Leave it
      empty if the machine already accepts the key.
    </span>
  </div>
{/snippet}

{#snippet disclosure(label: string, open: boolean, toggle: () => void)}
  <Button
    aria-expanded={open}
    class="justify-self-start"
    onclick={toggle}
    pad="none"
    size="xs"
    tone="quiet"
    variant="link"
  >
    <span
      data-slot="chev"
      aria-hidden="true"
      class="inline-grid motion-safe:transition-[rotate] motion-safe:duration-(--dur-control) motion-safe:ease-out data-open:rotate-90"
      data-open={open || undefined}
      data-box><IconChevronRight class="size-icon-sm" /></span
    >
    <span>{label}</span>
  </Button>
{/snippet}

{#snippet sshForm()}
  <form
    class="flex min-w-0 flex-col gap-space-4"
    id="{id}-ssh"
    onsubmit={submit}
  >
    {#if formAlert}
      <Alert.Root
        role={formAlert.tone === "fail" ? "alert" : "status"}
        variant={formAlert.tone === "fail" ? "destructive" : "default"}
      >
        {#if formAlert.tone === "fail"}<IconError aria-hidden="true" />{/if}
        <Alert.Description>{formAlert.text}</Alert.Description>
      </Alert.Root>
    {/if}
    <div
      data-slot="grid"
      data-phone={phone || undefined}
      class="grid grid-cols-(--grid-cols) gap-space-3 data-phone:grid-cols-1"
      style:--grid-cols="minmax(0, 1fr) var(--c-port-field-w)"
    >
      <div class="flex min-w-0 flex-col gap-space-2 text-ink-strong">
        <Label for="{id}-target">SSH target</Label>
        <Input
          autocapitalize="off"
          autocomplete="off"
          id="{id}-target"
          placeholder="user@host or SSH alias"
          spellcheck="false"
          bind:value={target}
        />
      </div>
      <div
        data-phone={phone || undefined}
        class="flex min-w-0 flex-col gap-space-2 text-ink-strong data-phone:max-w-c-port-field-w"
      >
        <Label for="{id}-port">Port</Label>
        <Input
          aria-invalid={portValid ? undefined : "true"}
          id="{id}-port"
          inputmode="numeric"
          placeholder="22"
          bind:value={port}
        />
      </div>
    </div>

    {#if taste.password === "shown"}
      {@render passwordField()}
    {:else if taste.password === "line"}
      <div class="grid min-w-0 gap-space-2">
        {@render disclosure("Sign in with a password", passwordOpen, () => {
          passwordOpen = !passwordOpen;
        })}
        <Collapsible.Root open={passwordOpen}>
          <Collapsible.Content fade reveal>
            {@render passwordField()}
          </Collapsible.Content>
        </Collapsible.Root>
      </div>
    {/if}

    <div class="grid min-w-0 gap-space-2">
      {@render disclosure("This hub's SSH key", keyOpen, () => {
        keyOpen = !keyOpen;
      })}
      <Collapsible.Root open={keyOpen}>
        <Collapsible.Content fade reveal>
          <div class="flex min-w-0 flex-col gap-space-2">
            {#if sshKey}
              <p class="m-0 type-meta text-ink-subtle">
                The machine has to accept this key: it goes in
                ~/.ssh/authorized_keys for the user you sign in as.
              </p>
              <CopyBox label="This hub's SSH public key" text={sshKey} />
            {:else if hubHostname}
              <p class="m-0 type-meta text-ink-subtle">
                This hub has no SSH key yet. Create one on {hubHostname} with ssh-keygen
                -t ed25519, then reopen this.
              </p>
            {/if}
          </div>
        </Collapsible.Content>
      </Collapsible.Root>
    </div>
  </form>
{/snippet}

{#snippet commandWay()}
  <div class="flex min-w-0 flex-col gap-space-3">
    <div class="flex min-w-0 flex-col gap-space-2 text-ink-strong">
      <Label for="{id}-address">Hub address this machine should use</Label>
      <NativeSelect.Root
        class="w-full"
        disabled={addresses.length === 0}
        id="{id}-address"
        bind:value={hubUrl}
      >
        {#each addresses as address (address.url)}
          <NativeSelect.Option value={address.url}
            >{address.label} · {address.url}</NativeSelect.Option
          >
        {/each}
      </NativeSelect.Root>
      <span class="type-meta text-ink-subtle">
        The machine downloads the install script from here, so it has to be able
        to reach it. The .local name reaches machines on the same network, or on
        a VPN that carries it like ZeroTier; Tailscale and WireGuard don't.
      </span>
    </div>
    <p class="m-0 type-body text-ink-muted">
      Run this on the machine you want to add.
    </p>
    {#if hubUrl}
      <CopyBox
        label="Install command"
        text={installCommand(hubUrl)}
        wrap={phone}
      />
    {/if}
    {#if waiting.length > 0}
      <!-- What checked in, in the waiting line's slot: this hub requires
           paired devices, so it waits for its Admit (hub hub-auth.ts). -->
      <ul
        aria-label="Machines waiting to be admitted"
        class="m-0 flex list-none flex-col gap-space-3 rounded-md bg-surface-recess p-space-3"
      >
        {#each waiting as machine (machine.machineId)}
          {@const name = machine.hostname ?? machine.machineId}
          <li
            class="flex min-w-0 flex-wrap items-center gap-x-space-3 gap-y-space-2"
          >
            <span class="flex min-w-0 flex-auto flex-col gap-space-row">
              <span class="type-body text-ink-strong wrap-anywhere"
                >{name} asked to join{machine.address
                  ? ` from ${machine.address}`
                  : ""}</span
              >
              {#if admitRefused && admitting === null}
                <span class="type-meta text-status-fail-ink"
                  >{admitRefused}</span
                >
              {/if}
            </span>
            {#if !(phone && waiting.length === 1)}
              <Button
                aria-label="Admit {name}"
                class="ms-auto"
                disabled={admitting !== null}
                label="Admit"
                onclick={() => onadmit?.(machine.machineId)}
                pending={admitting === machine.machineId}
                size="sm"
              />
            {/if}
          </li>
        {/each}
      </ul>
    {:else}
      <CheckInStatus />
    {/if}
  </div>
{/snippet}

{#snippet actions()}
  {#if card === null && way === "ssh"}
    {#if !phone}
      <Button onclick={onclose} variant="outline">Cancel</Button>
    {/if}
    <Button
      disabled={!canStart}
      form="{id}-ssh"
      label={retry ? "Retry" : "Add machine"}
      pending={starting}
      type="submit"
    />
  {:else if card === null}
    {#if phone && waiting.length === 1}
      {@const machine = waiting[0]}
      <Button
        aria-label="Admit {machine.hostname ?? machine.machineId}"
        disabled={admitting !== null}
        label="Admit"
        onclick={() => onadmit?.(machine.machineId)}
        pending={admitting === machine.machineId}
      />
    {:else if !phone}
      <Button onclick={onclose} variant="outline">Close</Button>
    {/if}
  {:else if card.tone === "running"}
    <Button
      label="Stop"
      onclick={onstop}
      pending={stopping}
      variant="outline"
    />
    {#if !phone}
      <Button onclick={onclose} variant="outline">Close</Button>
    {/if}
  {:else if card.tone === "done"}
    {#if phone}
      <Button onclick={onstartsession}>Start session</Button>
      <Button onclick={onopenmachine} variant="outline">Open machine</Button>
    {:else}
      <Button onclick={onopenmachine} variant="outline">Open machine</Button>
      <Button onclick={onstartsession}>Start session</Button>
    {/if}
  {:else if settled}
    {#if phone}
      <Button label="Retry" onclick={onretry} pending={starting} />
    {:else}
      <Button onclick={onchange} variant="outline">Change details</Button>
      <Button label="Retry" onclick={onretry} pending={starting} />
    {/if}
  {/if}
{/snippet}

<div
  bind:this={trayEl}
  data-slot="join-tray"
  data-moment={moment ? "join" : undefined}
  data-body={body}
  class="flex min-w-0 flex-col gap-space-6"
  style:--join-close="var(--dur-pop)"
  style:--join-check="calc(var(--dur-pop) + var(--dur-toggle))"
  style:--join-caw="calc(var(--dur-pop) * 2)"
>
  {#if card === null && joinError}
    <Alert.Root variant="destructive">
      <Alert.Description>{joinError}</Alert.Description>
    </Alert.Root>
  {/if}
  <div data-slot="join-body" class="grid min-w-0 *:col-start-1 *:row-start-1">
    {#key body}
      <div
        class="flex min-w-0 flex-col gap-space-4"
        in:fade={{ duration: dur("--dur-fade"), easing: easeOut }}
        out:fade={{ duration: dur("--dur-exit"), easing: easeOut }}
      >
        {#if card}
          <StatusCard
            {arrival}
            caw={taste.done === "caw"}
            cawDelay={beat.caw}
            {card}
            names={taste.names}
            {onretry}
            {phone}
            sentenceDelay={beat.sentence}
            bind:password
          />
        {:else}
          <Tabs
            onValueChange={(value) => onway?.(value as JoinWay)}
            value={way}
          >
            <TabsList aria-label="How to connect the machine">
              {#each JOIN_WAYS as each (each.way)}
                <TabItem icon={each.icon} label={each.name} value={each.way} />
              {/each}
            </TabsList>
          </Tabs>
          {#if way === "ssh"}
            {@render sshForm()}
          {:else}
            {@render commandWay()}
          {/if}
        {/if}
      </div>
    {/key}
  </div>

  {#if phone && card === null && way === "command" && waiting.length !== 1}
    <!-- The sheet's head Close is its way out: the command has no act here. -->
  {:else if phone}
    {#if settled}
      <!-- On the sheet Retry takes the foot; Change details stands over it as words. -->
      <Button
        class="self-center"
        onclick={onchange}
        size="sm"
        tone="quiet"
        variant="link">Change details</Button
      >
    {/if}
    {#key joinedFoot}
      <Drawer.Footer
        data-slot="join-actions"
        pad="flush"
        {@attach arriveAt(footBeat)}
      >
        {@render actions()}
      </Drawer.Footer>
    {/key}
  {:else}
    {#key joinedFoot}
      <Dialog.Footer data-slot="join-actions" {@attach arriveAt(footBeat)}>
        {@render actions()}
      </Dialog.Footer>
    {/key}
  {/if}
</div>
