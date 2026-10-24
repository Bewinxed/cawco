<script lang="ts" module>
  /** This page has a clipboard, which only a secure context does (https or localhost): Copy stands only there; elsewhere the text selects whole on a press. */
  export function hasClipboard(): boolean {
    return typeof window !== "undefined" && window.isSecureContext;
  }
</script>

<script lang="ts">
  /**
   * The one object a state holds under its words (§4.2): NetBird's key
   * field, the admin's command, the address that answers, the phone's QR
   * (or the phone that opened it, in its place), the secure address, and
   * Done's address with its three marks. Every icon is the glyph alone.
   */
  import CopyBox from "#lib/cawco/CopyBox.svelte";
  import { reflow } from "#lib/cawco/motion/rows.svelte.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import CopyButton from "#lib/components/ui/copy-button/copy-button.svelte";
  import { Input } from "#lib/components/ui/input/index.js";
  import { LiveDot } from "#lib/components/ui/live-dot/index.js";
  import {
    IconDot,
    IconExternal,
    IconLock,
    IconMinusCircle,
    IconPhone,
    IconSuccess,
  } from "#lib/icons.js";
  import { arrive, depart } from "../motion";
  import PhoneQr from "../PhoneQr.svelte";
  import Words from "../Words.svelte";
  import { HEADSCALE_USER } from "../words";
  import { type AddressFlow, PEER } from "./flow.svelte";
  import { doneMarks, type Form } from "./flow-words";
  import { PROPOSED_QR } from "./proposed";

  let { flow, form }: { flow: AddressFlow; form: Form } = $props();

  const clipboard = hasClipboard();
  const command = $derived(
    `headscale auth register --user ${HEADSCALE_USER} --auth-id hskey-auth-7f3a9c2e`
  );
  const keyId = $props.id();
</script>

{#if flow.step === "start" && flow.network === "netbird"}
  <div class="grid min-w-0 gap-space-1" data-slot="key-field">
    <label class="type-label text-ink-strong" for={keyId}>Setup key</label>
    <Input
      id={keyId}
      autocomplete="off"
      bind:value={flow.key}
      face="mono"
      onkeydown={(event: KeyboardEvent) => {
        if (event.key === "Enter") {
          flow.useKey();
        }
      }}
      placeholder="A1B2C3D4-…"
      spellcheck={false}
    />
  </div>
{:else if flow.step === "admin"}
  <div class="grid min-w-0" data-slot="admin-command">
    {#if clipboard}
      <div class="flex min-w-0 *:min-w-0 *:flex-auto">
        <CopyBox label="Command for your admin" text={command} wrap />
      </div>
    {:else}
      <code
        class="block min-w-0 rounded-md border border-border-control bg-surface-hover px-space-3 py-space-2 type-code whitespace-pre-wrap text-ink-strong select-all"
        >{command}</code
      >
    {/if}
  </div>
{:else if flow.step === "answers"}
  <p
    class="m-0 min-w-0 rounded-well border border-border-well bg-surface-well px-space-3 py-space-4 text-start type-title font-mono wrap-anywhere text-ink-strong select-all"
    data-slot="answers-address"
  >
    {flow.address}
  </p>
{:else if flow.step === "phone" && form === "desk"}
  <!-- The QR, and once a phone opened it, that phone in its place: the
       QR departs as the name arrives (§4.9, a tick lands). -->
  <!-- The QR at §4.2's 160: proposed; the token moves to 160 if picked (proposed.ts). -->
  <div
    style:--c-address-qr={PROPOSED_QR}
    class="@container relative grid min-w-0"
    data-slot="phone-object"
  >
    {#if flow.phoneOpened}
      <p
        class="mark-line m-0 flex min-w-0 items-center justify-start gap-space-2 py-space-2 type-label text-ink-strong"
        data-slot="phone-name"
        in:arrive
        out:depart
      >
        <IconPhone aria-hidden="true" class="size-icon-md text-ink-muted" />
        <span class="min-w-0">{PEER}</span>
      </p>
    {:else}
      <div class="grid min-w-0" in:arrive out:depart>
        <PhoneQr
          address={flow.address}
          domain={flow.facts.domain}
          name={flow.bareWordWorks ? flow.name : flow.long}
          network={flow.facts.name}
          typed={flow.typed}
        />
      </div>
    {/if}
  </div>
{:else if flow.step === "https" && flow.certs}
  <!-- The secure address, as the answering address stands: its lock beside
       the well, the glyph alone. -->
  <div
    class="mark-line flex min-w-0 items-center gap-space-2"
    data-slot="secure-address"
  >
    <IconLock
      aria-label="Secure"
      class="size-icon-md flex-none text-status-done-ink"
    />
    <p
      class="m-0 min-w-0 flex-1 rounded-well border border-border-well bg-surface-well px-space-3 py-space-4 text-start type-label font-mono wrap-anywhere text-ink-strong select-all"
    >
      {flow.secureAddress}
    </p>
  </div>
{:else if flow.step === "done"}
  <div class="grid min-w-0 gap-space-3">
    <!-- The address, named once, large and mono: Open beside it, and Copy
         only where this page has a clipboard; elsewhere it selects whole. -->
    <div
      class="flex min-w-0 flex-wrap items-center gap-space-2 rounded-well border border-border-well bg-surface-well py-space-2 ps-space-3 pe-space-2"
      data-slot="live-address"
    >
      <code
        class="min-w-0 flex-1 type-title font-mono wrap-anywhere text-ink-strong select-all"
        >{flow.address}</code
      >
      <span class="flex flex-none gap-space-1">
        <Button
          data-icon="inline-end"
          href={flow.address}
          rel="noopener"
          size="xs"
          target="_blank"
          variant="ghost"
        >
          <span>Open</span>
          <IconExternal aria-hidden="true" />
        </Button>
        {#if clipboard}
          <CopyButton size="xs" text={flow.address} variant="ghost"
            >Copy</CopyButton
          >
        {/if}
      </span>
    </div>
    <!-- biome-ignore-start lint/a11y/noRedundantRoles : WebKit drops a list's semantics once its markers are styled away (VoiceOver reads no list). -->
    <ul
      class="m-0 grid min-w-0 list-none gap-space-2 p-0"
      data-slot="done-marks"
      role="list"
      {@attach reflow()}
    >
      <!-- biome-ignore-end lint/a11y/noRedundantRoles: the list above -->
      {#each doneMarks(flow, form) as mark, index (index)}
        <li
          class="mark-line flex min-w-0 flex-wrap items-center gap-x-space-2 type-body text-ink-strong"
          data-mark={mark.kind}
        >
          <span class="mark-cell w-icon-md">
            {#key mark.kind}
              {#if mark.kind === "yes"}
                <span class="grid" data-flip="pop">
                  {#if mark.lock}
                    <IconLock
                      aria-label="Secure"
                      class="size-icon-md text-status-done-ink"
                    />
                  {:else}
                    <IconSuccess
                      aria-label="Done"
                      class="size-icon-md text-status-done-ink"
                    />
                  {/if}
                </span>
              {:else if mark.kind === "wait"}
                <LiveDot />
              {:else if mark.kind === "no"}
                <IconMinusCircle
                  aria-label="No"
                  class="size-icon-md text-ink-muted"
                />
              {:else}
                <IconDot
                  aria-label="Not yet"
                  class="size-icon-sm text-ink-muted"
                />
              {/if}
            {/key}
          </span>
          <span class="mark-text min-w-0"><Words text={mark.text} /></span>
          <!-- In ink, not coral: Done's own button is the tray's one coral act. -->
          {#if mark.action}
            <Button
              data-box
              data-icon={mark.action.away ? "inline-end" : undefined}
              onclick={mark.action.act}
              size="xs"
              tone="quiet"
              variant="link"
            >
              <span>{mark.action.label}</span>
              {#if mark.action.away}
                <IconExternal aria-hidden="true" />
              {/if}
            </Button>
          {/if}
        </li>
      {/each}
    </ul>
  </div>
{/if}
