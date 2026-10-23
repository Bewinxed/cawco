<script lang="ts" module>
  import type { AddressTray } from "./tray.svelte";
  import type { Form } from "./words";

  /** Whether a state holds an object of its own under its words (the status card closes its slot when not). */
  export function hasObject(tray: AddressTray, form: Form): boolean {
    switch (tray.step) {
      case "found":
      case "admin":
      case "key":
      case "keep":
      case "live":
        return true;
      case "secure":
        return tray.certs && tray.issuesCerts;
      case "phone":
        return form === "desk";
      case "finding":
      case "signin":
      case "checking":
      case "failed":
      case "unsupported":
        return false;
    }
  }
</script>

<script lang="ts">
  /**
   * The one object a state of the address tray holds (the advisor's
   * anatomy): the network drawn with the device CawCo adds; the admin's
   * command; NetBird's key field; the secure address; the expiry line; the
   * phone's QR; every address once live, with the optional stations as
   * marks. Each direction places it in its own way; the object is the same.
   *
   * The command's Copy, and every Copy, stand only where this dashboard
   * has a clipboard (https or localhost); at the plain word the command
   * selects whole on a press instead.
   */
  import CopyBox from "#lib/cawco/CopyBox.svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import { Input } from "#lib/components/ui/input/index.js";
  import {
    IconChevronRight,
    IconExternal,
    IconLock,
    IconSuccess,
  } from "#lib/icons.js";
  import AddressList from "./AddressList.svelte";
  import ExpiryLine from "./ExpiryLine.svelte";
  import NetworkStrip from "./NetworkStrip.svelte";
  import PhoneQr from "./PhoneQr.svelte";
  import { HEADSCALE_USER, stationMarks } from "./words";

  let { tray, form }: { tray: AddressTray; form: Form } = $props();

  const command = $derived(
    `headscale auth register --user ${HEADSCALE_USER} --auth-id hskey-auth-7f3a9c2e`
  );
  const keyId = $props.id();
</script>

{#if tray.step === "found"}
  <NetworkStrip
    domain={tray.facts.domain}
    name={tray.name}
    network={tray.facts.name}
  />
{:else if tray.step === "admin"}
  <div class="grid min-w-0 gap-space-2" data-slot="admin-command">
    <p
      class="m-0 flex flex-wrap items-baseline gap-x-space-2 type-meta text-ink-muted"
    >
      <span>Auth ID</span>
      <code class="type-code wrap-anywhere text-ink-strong select-all"
        >hskey-auth-7f3a9c2e</code
      >
    </p>
    {#if tray.overHttps}
      <div class="flex min-w-0 *:min-w-0 *:flex-auto">
        <CopyBox label="Command for your admin" text={command} wrap />
      </div>
    {:else}
      <code
        class="block min-w-0 rounded-md border border-border-control bg-surface-hover px-space-3 py-space-2 type-code wrap-anywhere whitespace-pre-wrap text-ink-strong select-all"
        >{command}</code
      >
    {/if}
  </div>
{:else if tray.step === "key"}
  <div class="grid min-w-0 gap-space-1" data-slot="key-field">
    <label class="type-label text-ink-strong" for={keyId}>Setup key</label>
    <Input
      id={keyId}
      autocomplete="off"
      bind:value={tray.key}
      face="mono"
      onkeydown={(event: KeyboardEvent) => {
        if (event.key === "Enter") {
          tray.useKey();
        }
      }}
      placeholder="A1B2C3D4-…"
      spellcheck={false}
    />
  </div>
{:else if tray.step === "secure" && tray.certs && tray.issuesCerts}
  <p
    class="mark-line m-0 flex min-w-0 items-center gap-space-2 rounded-well border border-border-well bg-surface-well px-space-3 py-space-2"
    data-slot="secure-address"
  >
    <IconLock
      aria-label="Secure"
      class="size-icon-md flex-none text-status-done-ink"
    />
    <code class="min-w-0 type-code wrap-anywhere text-ink-strong select-all"
      >https://{tray.long}</code
    >
  </p>
{:else if tray.step === "keep"}
  <ExpiryLine off={tray.expiryOff} />
{:else if tray.step === "phone" && form === "desk"}
  <div class="grid min-w-0 gap-space-3">
    <PhoneQr
      address={tray.phoneAddress}
      domain={tray.facts.domain}
      name={tray.bareWordWorks ? tray.name : tray.long}
      network={tray.facts.name}
      typed={tray.phoneTyped}
    />
    <span class="flex">
      <Button
        href={tray.phoneAddress}
        icon={IconExternal}
        aria-label="Open {tray.phoneAddress} in this browser too"
        label="Open it in this browser too"
        rel="noopener"
        size="xs"
        target="_blank"
        variant="link"
      />
    </span>
  </div>
{:else if tray.step === "live"}
  <div class="grid min-w-0 gap-space-2">
    <AddressList {tray} />
    <!-- The optional stations, as marks: one done is its tick and words;
         one not done is a text action that reopens its tray. -->
    <p
      class="m-0 flex flex-wrap items-center gap-x-space-3 gap-y-space-1 type-meta text-ink-muted"
      data-slot="station-marks"
    >
      {#each stationMarks(tray) as mark (mark.label)}
        {#if mark.done}
          <span class="mark-line inline-flex items-center gap-space-1">
            <IconSuccess
              aria-hidden="true"
              class="size-icon-sm text-status-done-ink"
            />
            <span>{mark.label}</span>
          </span>
        {:else}
          <Button
            data-icon="inline-end"
            onclick={mark.reopen}
            size="xs"
            variant="link"
          >
            <span>{mark.label}</span>
            <IconChevronRight aria-hidden="true" class="size-icon-sm" />
          </Button>
        {/if}
      {/each}
    </p>
  </div>
{/if}
