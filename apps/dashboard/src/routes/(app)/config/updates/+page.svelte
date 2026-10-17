<script lang="ts">
  import { onMount } from "svelte";
  import { blur } from "svelte/transition";
  import { cawco } from "#lib/cawco/client.svelte.js";
  import SectionFrame from "#lib/cawco/config/SectionFrame.svelte";
  import SwitchField from "#lib/cawco/config/SwitchField.svelte";
  import { sectionOf } from "#lib/cawco/config/sections.js";
  import { dur, easeOut } from "#lib/cawco/motion/curves.svelte.js";
  import { unfold } from "#lib/cawco/motion/fold.svelte.js";
  import { morph } from "#lib/cawco/motion/morph.svelte.js";
  import { notices } from "#lib/cawco/notices.svelte.js";
  import { orderMachines } from "#lib/cawco/rail.svelte.js";
  import ChannelCards from "#lib/cawco/updates/ChannelCards.svelte";
  import {
    displayVersion,
    installable,
    landingId,
    releaseNotes,
  } from "#lib/cawco/updates/model.js";
  import ReleaseNotes from "#lib/cawco/updates/ReleaseNotes.svelte";
  import UpdateTable from "#lib/cawco/updates/UpdateTable.svelte";
  import { updates } from "#lib/cawco/updates/updates.svelte.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { SectionHeader } from "#lib/components/ui/section-header/index.js";
  import { IconChevronRight, IconDownload, IconMonitor } from "#lib/icons.js";

  /**
   * The builds the fleet runs and when machines install them. The channel is
   * one choice for the whole fleet; each machine row says what it is doing
   * from the update state it reports on the socket.
   */
  const section = sectionOf("updates");

  const machines = $derived(orderMachines(cawco.machines));
  const policy = $derived(updates.policy);

  let chosen = $state<"stable" | "nightly">(
    updates.policy?.channel ?? "stable"
  );
  $effect(() => {
    if (updates.policy) {
      chosen = updates.policy.channel;
    }
  });

  const name = (channel: "stable" | "nightly") =>
    channel === "nightly" ? "Nightly" : "Stable";

  const differs = $derived(policy !== null && chosen !== policy.channel);
  let switching = $state(false);
  let switchFailed = $state(false);
  /** The tick the button holds after a switch, before the button leaves. */
  let holding = $state(false);

  async function switchChannel() {
    if (!policy) {
      return;
    }
    switching = true;
    switchFailed = false;
    const ok = await updates.savePolicy({
      channel: chosen,
      autoUpdate: policy.autoUpdate,
    });
    switching = false;
    switchFailed = !ok;
    if (ok) {
      holding = true;
      setTimeout(() => {
        holding = false;
      }, dur("--dur-hold"));
    }
  }

  const release = $derived(updates.channels?.channels[chosen]);
  const pendingText = $derived.by(() => {
    if (!(differs && policy)) {
      return "";
    }
    if (updates.channels !== null && release === null) {
      return `${name(chosen)} has no release yet. Machines keep the build they run.`;
    }
    if (chosen === "nightly") {
      return policy.autoUpdate
        ? "Switching moves each machine to Nightly's latest build once its work in flight ends."
        : "Switching moves each machine to Nightly's latest build when you install it.";
    }
    return "Switching keeps each machine on the build it runs until Stable has a newer one.";
  });

  const notes = $derived(release ? releaseNotes(release.notes) : null);
  let foldOpen = $state(false);

  // The switch shows the stored value again when a save is refused.
  let switchKey = $state(0);
  async function setAuto(next: boolean) {
    if (!policy) {
      return;
    }
    const ok = await updates.savePolicy({
      channel: policy.channel,
      autoUpdate: next,
    });
    if (!ok) {
      switchKey += 1;
    }
  }

  const ready = $derived(policy !== null);
  const waiting = $derived(policy ? installable(machines, policy) : []);

  let checking = $state(false);
  let checkFailed = $state(false);
  async function check() {
    checking = true;
    checkFailed = !(await updates.refreshChannels());
    checking = false;
  }

  // A person on this page has seen what landed: each landing is acknowledged for every tab and device.
  $effect(() => {
    const landings = machines.flatMap((machine) =>
      machine.binaryUpdate?.landed
        ? [landingId(machine.machineId, machine.binaryUpdate.landed)]
        : []
    );
    if (notices.known && landings.length > 0) {
      // biome-ignore lint/complexity/noVoid: the hub's record comes back on the next board frame
      void notices.acknowledge(landings);
    }
  });

  onMount(() => {
    // biome-ignore lint/complexity/noVoid: the read reports its own outcome in page state
    void updates.loadChannels();
  });

  /** Reset of a damaged policy record: pending until the hub answers, failed with its words. */
  let resetting = $state(false);
  let resetFailed = $state(false);
  async function resetPolicy() {
    resetting = true;
    resetFailed = false;
    try {
      await updates.resetPolicy();
    } catch (error) {
      resetFailed = true;
      updates.problem = error instanceof Error ? error.message : String(error);
    } finally {
      resetting = false;
    }
  }
</script>

{#snippet resetAction(_down: string | null)}
  {#if updates.damaged}
    <Button
      failed={resetFailed}
      label="Reset"
      onclick={resetPolicy}
      pending={resetting}
      pendingLabel="Resetting…"
      size="sm"
    />
  {/if}
{/snippet}

<SectionFrame
  actions={resetAction}
  problem={ready ? null : updates.problem}
  purpose={section.purpose}
  {ready}
  title={section.label}
>
  {#if policy}
    <!-- literal: 8px -->
    <div data-slot="group" class="flex flex-col gap-(--gap)" style:--gap="8px">
      <SectionHeader
        hue="var(--hue-blue-500)"
        icon={IconDownload}
        label="Channel"
      >
        {#snippet right()}
          {#if differs || switching || holding}
            <Button
              failed={switchFailed}
              label="Switch to {name(chosen)}"
              onclick={switchChannel}
              pending={switching}
              pendingLabel="Switching…"
              size="sm"
            />
          {/if}
        {/snippet}
      </SectionHeader>
      <ChannelCards
        channels={updates.channels}
        current={policy.channel}
        bind:chosen
      />
      <div class="overflow-hidden" {@attach morph()}>
        {#key pendingText}
          {#if pendingText}
            <!-- literal: 72ch -->
            <p
              aria-live="polite"
              class="type-meta max-w-(--measure) text-ink-muted"
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
              style:--measure="72ch"
            >
              {pendingText}
            </p>
          {/if}
        {/key}
      </div>
      {#if release && notes}
        <div data-slot="fold" class="type-label">
          <button
            aria-expanded={foldOpen}
            class="group mark-line inline-flex cursor-pointer items-center gap-space-1 text-ink-muted"
            onclick={() => {
              foldOpen = !foldOpen;
            }}
            type="button"
          >
            <IconChevronRight
              data-chev
              class="size-icon-sm transition-[rotate] dur-control ease-out group-aria-expanded:rotate-90"
            />
            <span>What's new in {displayVersion(release.version)}</span>
          </button>
          {#if foldOpen}
            <!-- literal: 6px -->
            <div
              class="type-body pt-(--pt) text-ink-strong"
              style:--pt="6px"
              transition:unfold
            >
              <ReleaseNotes source={notes.full} />
            </div>
          {/if}
        </div>
      {/if}
    </div>

    <!-- literal: 8px -->
    <div
      data-slot="group"
      class="flex flex-col gap-(--gap) border-t border-t-border-hairline pt-space-5"
      style:--gap="8px"
    >
      <SectionHeader
        hue="var(--hue-green-500)"
        icon={IconMonitor}
        label="Machines"
      >
        {#snippet right()}
          <div data-slot="actions" class="flex items-center gap-space-2">
            {#if waiting.length >= 2}
              <Button
                label="Install on all {waiting.length}"
                onclick={() => updates.installAll(machines, policy)}
                size="sm"
              />
            {/if}
            <Button
              failed={checkFailed}
              label="Check for updates"
              onclick={check}
              pending={checking}
              pendingLabel="Checking…"
              size="sm"
              variant="outline"
            />
          </div>
        {/snippet}
      </SectionHeader>
      {#key switchKey}
        <SwitchField
          checked={policy.autoUpdate}
          hint={policy.autoUpdate
            ? "Each machine installs a new build once its work in flight ends, within 30 minutes. Turns keep running through it."
            : "Off — a new build waits until you install it."}
          id="auto-update"
          label="Install updates automatically"
          onchange={setAuto}
        />
      {/key}
      <UpdateTable {machines} {policy} />
    </div>
  {/if}
</SectionFrame>
