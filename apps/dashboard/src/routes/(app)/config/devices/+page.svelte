<script lang="ts">
  /**
   * Who may run the fleet (hub hub-auth.ts): the one setting, "Require
   * paired devices", off unless the person turns it on; the paired devices,
   * each removable; and what waits on the person: devices asking to pair,
   * machines waiting to be admitted (also in Needs you).
   *
   * Turning it on or off asks first, in place, and says plainly what each
   * other device will see: nobody is locked out by surprise.
   */
  import type { OwnerDevice } from "@cawco/core";
  import { onMount } from "svelte";
  import SectionFrame from "#lib/cawco/config/SectionFrame.svelte";
  import SwitchField from "#lib/cawco/config/SwitchField.svelte";
  import { sectionOf } from "#lib/cawco/config/sections.js";
  import {
    answerMachine,
    answerPairing,
    hubAuth,
    readAuth,
    setPairingRequired,
  } from "#lib/cawco/hub-auth.svelte.js";
  import { failureClause, failureWords } from "#lib/cawco/hub-read.js";
  import { unfold } from "#lib/cawco/motion/fold.svelte.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { SectionHeader } from "#lib/components/ui/section-header/index.js";
  import { IconClock, IconLaptop, IconLock } from "#lib/icons.js";
  import { formatDistanceToNow } from "#lib/utils/time.js";

  const section = sectionOf("devices");
  const HUE = section.hue;

  let devices = $state<OwnerDevice[]>([]);
  let current = $state<string | null>(null);
  let loaded = $state(false);
  let readError = $state<string | null>(null);
  /** The change the person is about to confirm, if any. */
  let confirming = $state<"on" | "off" | null>(null);
  let saving = $state(false);
  let problem = $state<string | null>(null);
  /** A pairing, machine or device answer on its way, by its key. */
  let busy = $state<string | null>(null);

  const required = $derived(hubAuth.mode === "pairing");

  async function read() {
    try {
      await readAuth();
      const response = await fetch("/api/devices");
      if (!response.ok) {
        throw new Error(await response.text());
      }
      ({ devices, current } = (await response.json()) as {
        current: string | null;
        devices: OwnerDevice[];
      });
      loaded = true;
    } catch (error) {
      readError = `Could not read the paired devices — ${failureClause(error)}.`;
    }
  }

  async function confirm() {
    if (!confirming) {
      return;
    }
    saving = true;
    problem = null;
    try {
      await setPairingRequired(confirming === "on");
      confirming = null;
      await read();
    } catch (error) {
      problem = failureWords(error);
    } finally {
      saving = false;
    }
  }

  async function act(key: string, work: () => Promise<void>) {
    busy = key;
    problem = null;
    try {
      await work();
      await read();
    } catch (error) {
      problem = failureWords(error);
    } finally {
      busy = null;
    }
  }

  async function remove(device: OwnerDevice) {
    await act(`device:${device.id}`, async () => {
      const response = await fetch(
        `/api/devices/${encodeURIComponent(device.id)}`,
        { method: "DELETE" }
      );
      if (!response.ok) {
        throw new Error(await response.text());
      }
    });
  }

  const KINDS: Record<OwnerDevice["kind"], string> = {
    browser: "Browser",
    app: "CawCo app",
    cli: "Command line",
  };

  onMount(() => {
    // biome-ignore lint/complexity/noVoid: the read reports its own outcome in page state
    void read();
  });
</script>

<SectionFrame
  problem={loaded ? null : readError}
  purpose={section.purpose}
  ready={loaded}
  title={section.label}
>
  <!-- literal: 72ch -->
  <!-- literal: 8px -->
  <div
    data-slot="group"
    class="flex flex-col gap-(--group-gap)"
    style:--group-gap="8px"
    style:--note-measure="72ch"
  >
    <SectionHeader hue={HUE} icon={IconLock} label="Pairing" />
    <!-- The switch shows the change while it is confirmed, and goes back on Cancel. -->
    <SwitchField
      checked={confirming === null ? required : confirming === "on"}
      disabled={saving || confirming !== null}
      hint={required
        ? "On: the fleet answers paired devices, admitted machines and your Telegram chat. Anything else sees a code to approve."
        : "Off: every device on your network reaches the fleet, as it does now."}
      id="require-paired-devices"
      label="Require paired devices"
      onchange={(next) => {
        confirming = next ? "on" : "off";
      }}
    />
    {#if confirming === "on"}
      <div
        class="flex max-w-(--note-measure) flex-col gap-space-3 rounded-md bg-surface-recess p-space-4"
        transition:unfold
      >
        <p data-slot="lead" class="type-body text-ink-strong">
          Require paired devices? From the moment you confirm:
        </p>
        <ul
          class="type-body m-0 flex list-disc flex-col gap-space-1 ps-space-5 text-ink-muted"
        >
          <li>This browser is the first paired device.</li>
          <li>
            The machines connected now are admitted and keep running their
            sessions.
          </li>
          <li>
            Every other browser shows a code until you approve it here, in Needs
            you, or in Telegram. Each address it opens the dashboard at pairs
            once.
          </li>
          <li>A new machine waits until you admit it on the Machines list.</li>
          <li>
            The CawCo app on your phone can't pair yet: it stops reaching the
            hub until its update arrives.
          </li>
          <li>
            Each run of <code class="type-code text-ink-strong"
              >cawco connections</code
            >, <code class="type-code text-ink-strong">relay</code> or
            <code class="type-code text-ink-strong">jev</code> asks you to approve
            it once.
          </li>
          <li>Sessions keep their tools. Telegram keeps working as it does.</li>
        </ul>
        <div class="flex justify-end gap-space-2">
          <Button
            disabled={saving}
            label="Cancel"
            onclick={() => {
              confirming = null;
            }}
            size="sm"
            variant="ghost"
          />
          <Button
            label="Require paired devices"
            onclick={confirm}
            pending={saving}
            pendingLabel="Pairing this browser…"
            size="sm"
          />
        </div>
      </div>
    {:else if confirming === "off"}
      <div
        class="flex max-w-(--note-measure) flex-col gap-space-3 rounded-md bg-surface-recess p-space-4"
        transition:unfold
      >
        <p data-slot="lead" class="type-body text-ink-strong">
          Stop requiring paired devices? Every device on your network reaches
          the fleet again. The paired devices and machine keys are forgotten:
          turning it on again starts from the device that does.
        </p>
        <div class="flex justify-end gap-space-2">
          <Button
            disabled={saving}
            label="Cancel"
            onclick={() => {
              confirming = null;
            }}
            size="sm"
            variant="ghost"
          />
          <Button
            label="Stop requiring paired devices"
            onclick={confirm}
            pending={saving}
            pendingLabel="Stopping…"
            size="sm"
            variant="grant"
          />
        </div>
      </div>
    {/if}
  </div>

  {#if required && (hubAuth.requests.length > 0 || hubAuth.waiting.length > 0)}
    <!-- literal: 8px -->
    <div
      data-slot="group"
      class="mt-space-6 flex flex-col gap-(--group-gap)"
      style:--group-gap="8px"
      transition:unfold
    >
      <SectionHeader hue={HUE} icon={IconClock} label="Waiting for you" />
      <ul class="flex flex-col">
        {#each hubAuth.requests as request (request.userCode)}
          <!-- literal: 12px, 10px -->
          <li
            data-slot="row"
            class="grid items-center gap-(--row-gap) not-first:border-t not-first:border-t-border-hairline py-(--row-pad-y)"
            style:--row-gap="12px"
            style:--row-pad-y="10px"
          >
            <div data-slot="who" class="flex min-w-0 flex-col">
              <span data-slot="name" class="type-body text-ink-strong"
                >{request.name}</span
              >
              <span
                data-num
                data-slot="meta"
                class="num type-meta wrap-anywhere text-ink-muted"
              >
                Code <span data-slot="code" class="type-code text-ink-strong"
                  >{request.userCode}</span
                >{request.address ? ` · ${request.address}` : ""} · asked {formatDistanceToNow(
                  new Date(request.at)
                )}
              </span>
              <span
                data-slot="meta"
                class="type-meta wrap-anywhere text-ink-muted"
              >
                Approve only if this is the code on the device in front of you.
              </span>
            </div>
            <Button
              aria-label="Deny {request.name}, code {request.userCode}"
              disabled={busy !== null}
              label="Deny"
              onclick={() =>
                act(`pair:${request.userCode}`, () =>
                  answerPairing(request.userCode, false)
                )}
              size="sm"
              variant="ghost"
            />
            <Button
              aria-label="Approve {request.name}, code {request.userCode}"
              disabled={busy !== null}
              label="Approve"
              onclick={() =>
                act(`pair:${request.userCode}`, () =>
                  answerPairing(request.userCode, true)
                )}
              pending={busy === `pair:${request.userCode}`}
              size="sm"
              variant="secondary"
            />
          </li>
        {/each}
        {#each hubAuth.waiting as machine (machine.machineId)}
          <!-- literal: 12px, 10px -->
          <li
            data-slot="row"
            class="grid items-center gap-(--row-gap) not-first:border-t not-first:border-t-border-hairline py-(--row-pad-y)"
            style:--row-gap="12px"
            style:--row-pad-y="10px"
          >
            <div data-slot="who" class="flex min-w-0 flex-col">
              <span data-slot="name" class="type-body text-ink-strong"
                >{machine.hostname ?? machine.machineId}</span
              >
              <span
                data-num
                data-slot="meta"
                class="num type-meta wrap-anywhere text-ink-muted"
              >
                Machine{machine.platform
                  ? ` · ${machine.platform}`
                  : ""}{machine.address ? ` · ${machine.address}` : ""} · waiting
                {formatDistanceToNow(new Date(machine.since))}
              </span>
            </div>
            <Button
              aria-label="Deny {machine.hostname ?? machine.machineId}"
              disabled={busy !== null}
              label="Deny"
              onclick={() =>
                act(`machine:${machine.machineId}`, () =>
                  answerMachine(machine.machineId, false)
                )}
              size="sm"
              variant="ghost"
            />
            <Button
              aria-label="Admit {machine.hostname ?? machine.machineId}"
              disabled={busy !== null}
              label="Admit"
              onclick={() =>
                act(`machine:${machine.machineId}`, () =>
                  answerMachine(machine.machineId, true)
                )}
              pending={busy === `machine:${machine.machineId}`}
              size="sm"
              variant="secondary"
            />
          </li>
        {/each}
      </ul>
    </div>
  {/if}

  {#if required}
    <!-- literal: 72ch -->
    <!-- literal: 8px -->
    <div
      data-slot="group"
      class="mt-space-6 flex flex-col gap-(--group-gap)"
      style:--group-gap="8px"
      style:--note-measure="72ch"
      transition:unfold
    >
      <SectionHeader hue={HUE} icon={IconLaptop} label="Paired devices" />
      <ul class="flex flex-col">
        {#each devices as device (device.id)}
          <!-- literal: 12px, 10px -->
          <li
            data-slot="row"
            data-devices
            class="grid items-center gap-(--row-gap) not-first:border-t not-first:border-t-border-hairline py-(--row-pad-y)"
            style:--row-gap="12px"
            style:--row-pad-y="10px"
          >
            <div data-slot="who" class="flex min-w-0 flex-col">
              <span data-slot="name" class="type-body text-ink-strong"
                >{device.name}{device.id === current
                  ? " · this browser"
                  : ""}</span
              >
              <span
                data-num
                data-slot="meta"
                class="num type-meta wrap-anywhere text-ink-muted"
              >
                {KINDS[device.kind]} · paired {formatDistanceToNow(
                  new Date(device.createdAt)
                )}{device.lastUsedAt
                  ? ` · last used ${formatDistanceToNow(new Date(device.lastUsedAt))}`
                  : ""}{device.lastAddress ? ` · ${device.lastAddress}` : ""}
              </span>
            </div>
            <Button
              aria-label="Remove {device.name}"
              disabled={busy !== null || devices.length === 1}
              label="Remove"
              onclick={() => remove(device)}
              pending={busy === `device:${device.id}`}
              size="sm"
              variant="ghost"
            />
          </li>
        {/each}
      </ul>
      {#if devices.length === 1}
        <p
          data-slot="note"
          class="type-meta max-w-(--note-measure) wrap-anywhere text-ink-muted"
        >
          The only paired device stays until you pair another or turn pairing
          off, so the fleet always has someone who can approve.
        </p>
      {/if}
    </div>
  {/if}

  {#if problem}
    <p
      class="type-meta mt-space-4 wrap-anywhere whitespace-pre-wrap text-status-fail-ink"
      role="alert"
      transition:unfold
    >
      {problem}
    </p>
  {/if}
</SectionFrame>

<style>
  /* residual: unmapped */
  [data-slot="row"] {
    grid-template-columns: minmax(0, 1fr) auto auto;
  }
  /* residual: unmapped */
  [data-slot="row"][data-devices] {
    grid-template-columns: minmax(0, 1fr) auto;
  }
</style>
