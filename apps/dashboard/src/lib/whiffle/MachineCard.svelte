<script lang="ts">
  /**
   * One machine's convergence, in one row (leaf C2 — `.unlazy-liveness/gates/c2.md`):
   * whether its build is level with the hub's, whether its fleet sync is
   * stuck on a conflict nobody was told to resolve, and whether its deploy
   * clone is caught up, waiting, or refusing outright. Every fact here was
   * already sitting in the frame the hub sends on every move — nothing this
   * card renders is fetched, and nothing it renders resolves anything: the
   * adopt/overwrite affordance for a failed sync stays a click on Configure.
   */
  import type { BuildInfo } from "@whiffle/core";
  import { machineLabel } from "@whiffle/core";
  import { TextMorph } from "torph/svelte";
  import { Badge } from "$lib/components/ui/badge";
  import { Spinner } from "$lib/components/ui/spinner";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte component-group convention
  import * as Tooltip from "$lib/components/ui/tooltip";
  import { IconCheck, IconWarningTriangle } from "$lib/icons";
  import { formatDistanceToNow } from "$lib/utils/time";
  import { MACHINE_UNREACHABLE_HINT } from "./activity";
  import type { Machine } from "./client.svelte";
  import {
    buildConvergence,
    type DeployKind,
    deployInfoOf,
    fleetSyncAgeMs,
    isDeployDiverged,
  } from "./convergence";
  import { CAUSE, faultHref, machineFaults } from "./fleet-faults";
  import { isUpdating, machineUpdates } from "./MachineMenu.svelte";
  import { CURVE, dur } from "./motion/curves.svelte";
  import OsMark from "./OsMark.svelte";

  let {
    machine,
    hubBuild,
  }: { machine: Machine; hubBuild: BuildInfo | undefined } = $props();

  const online = $derived(machine.status === "online");
  const build = $derived(buildConvergence(machine.build, hubBuild));
  const failures = $derived(machineFaults(machine.machineId, machine.fleet));
  const syncAge = $derived(fleetSyncAgeMs(machine.fleet));
  // Structural read (convergence.ts's own doc): `deploy` does not exist on
  // AgentRow yet, so this is `undefined` on every board today and lights up
  // the moment whichever leaf wires C1's DeployWatcher onto the hub frame.
  const deploy = $derived(
    deployInfoOf((machine as unknown as { deploy?: unknown }).deploy)
  );
  const diverged = $derived(isDeployDiverged(deploy));

  const DEPLOY_LABEL: Record<DeployKind, string> = {
    unmarked: "",
    current: "",
    behind: "Update pending",
    ahead: "Local commits on deploy clone",
    unreachable: "Deploy check failed",
    diverged: "Diverged — refusing to deploy",
  };

  // Same recipe as Sidebar.svelte's pillClass (A5): a tint carries a fact this
  // reader has, an outline carries the admission that it only has an absence.
  const pillBase =
    "inline-flex h-[var(--c-pill-h)] items-center rounded-[var(--radius-pill)] gap-1 px-2.5 text-label font-medium leading-none no-underline";
  const warnPill = `${pillBase} border-transparent bg-[var(--warning-3)] text-[var(--warning-11)]`;
  const failPill = `${pillBase} border-transparent bg-[var(--status-fail-bg)] text-[var(--status-fail-ink)]`;

  const commitOf = (info: BuildInfo | undefined) => info?.commit ?? "?";

  /** What the build chip says: an update this tab started, then the build. */
  const update = $derived(machineUpdates.get(machine.machineId));
  const chip = $derived(isUpdating(machine) ? "updating" : build);
  const CHIP_LABEL = {
    updating: "Updating…",
    unknown: "Build unknown",
    behind: "Behind hub",
    current: "Up to date",
  } as const;
  const chipHint = $derived.by(() => {
    switch (chip) {
      case "updating":
        return `Updating from ${commitOf(machine.build)}. This clears when the machine reports its new build.`;
      case "unknown":
        return machine.build?.commit
          ? "The hub hasn't reported its own build yet, so there is nothing to compare against."
          : "This machine has never reported a commit — treat it as stale, not as up to date.";
      case "behind":
        return `${commitOf(machine.build)} on this machine, hub is on ${commitOf(hubBuild)}.`;
      default:
        return `On ${commitOf(machine.build)}, the same build as the hub.`;
    }
  });

  /**
   * TextMorph draws its text only in the browser, so the server draws the
   * words as plain text and the morph takes over once the card is live.
   */
  let morphMs = $state(0);
  $effect(() => {
    morphMs = dur("--dur-morph");
  });
</script>

<!-- A row per machine, keyed by its id where it is listed: one that drops
     and re-registers keeps its row, and only its dot and badges change, each
     badge popping in or out while the others slide aside (motion/rows). The
     list item is the board's, around the machine menu that wraps this. -->
<div class="row">
  <span class="who" class:off={!online}>
    <OsMark class="size-4 shrink-0" os={machine.os} />
    <span class="nm">{machineLabel(machine.hostname)}</span>
    <span
      class="dot {online ? 'up' : ''}"
      title={online ? 'Online' : 'Offline'}
    ></span>
  </span>

  <span class="badges" data-flip>
    {#if !online}
      <!-- The fact every "unknown" session on this box used to repeat on its
           own row, said once here instead (leaf Y1 — 176 identical copies of
           this on one board, measured). -->
      <Tooltip.Root>
        <Tooltip.Trigger>
          {#snippet child({ props })}
            <Badge {...props} class={warnPill} data-flip="pop">
              <IconWarningTriangle class="size-3" />
              Unreachable
            </Badge>
          {/snippet}
        </Tooltip.Trigger>
        <Tooltip.Content>{MACHINE_UNREACHABLE_HINT}</Tooltip.Content>
      </Tooltip.Root>
    {/if}

    <!-- One chip for the build, whatever it says: its tint, icon and words
         cross-fade in place and its width follows the words, so a machine
         that falls behind, starts updating or catches up changes one thing
         rather than swapping chips. -->
    <Tooltip.Root>
      <Tooltip.Trigger>
        {#snippet child({ props })}
          <Badge
            {...props}
            class="{pillBase} build-chip"
            data-build={chip}
            data-flip="pop"
          >
            <span class="icon-swap" style="--icon-swap-dur: var(--dur-control)">
              <span data-active={chip === 'updating'}
                ><Spinner
                  aria-hidden="true"
                  class="size-3"
                  role="presentation"
                /></span
              >
              <span data-active={chip === 'current'}
                ><IconCheck class="size-3" /></span
              >
              <span data-active={chip === 'behind' || chip === 'unknown'}
                ><IconWarningTriangle class="size-3" /></span
              >
            </span>
            {#if morphMs}
              <TextMorph
                as="span"
                duration={morphMs}
                ease={CURVE.out}
                text={CHIP_LABEL[chip]}
              />
            {:else}
              <span>{CHIP_LABEL[chip]}</span>
            {/if}
          </Badge>
        {/snippet}
      </Tooltip.Trigger>
      <Tooltip.Content class="max-w-72">
        <div class="flex flex-col gap-1">
          <span>{chipHint}</span>
          {#if update?.said}
            <span class="text-label opacity-80"
              >Last update: {update.said}</span
            >
          {/if}
        </div>
      </Tooltip.Content>
    </Tooltip.Root>

    {#if deploy && DEPLOY_LABEL[deploy.kind]}
      <Tooltip.Root>
        <Tooltip.Trigger>
          {#snippet child({ props })}
            <Badge
              {...props}
              class={diverged ? failPill : warnPill}
              data-flip="pop"
            >
              <IconWarningTriangle class="size-3" />
              {DEPLOY_LABEL[deploy.kind]}
            </Badge>
          {/snippet}
        </Tooltip.Trigger>
        <Tooltip.Content class={diverged ? 'max-w-72' : undefined}>
          {deploy.detail ?? DEPLOY_LABEL[deploy.kind]}
        </Tooltip.Content>
      </Tooltip.Root>
    {/if}

    {#if failures.length > 0}
      {@const first = failures[0]}
      <Tooltip.Root>
        <Tooltip.Trigger>
          {#snippet child({ props })}
            <!-- Lands on the section that owns the first failure, where the
                 row carries its fault and its remedy. -->
            <a
              {...props}
              class="{warnPill} touch-hit"
              data-flip="pop"
              href={faultHref(first)}
            >
              <IconWarningTriangle class="size-3" />
              Fleet sync failed{failures.length > 1 ? ` (${failures.length})` : ''}
            </a>
          {/snippet}
        </Tooltip.Trigger>
        <Tooltip.Content class="max-w-72">
          <div class="flex flex-col gap-1">
            <!-- The named cause, not the raw string: `unknown option
                 '--scope'` in a tooltip is what sent an operator to a terminal
                 for an afternoon. -->
            <span>{CAUSE[first.cause].title}.</span>
            {#if syncAge !== undefined}
              <span class="text-label opacity-80">
                Last synced
                {formatDistanceToNow(new Date(Date.now() - syncAge))}
                — resolve on Tools.
              </span>
            {/if}
          </div>
        </Tooltip.Content>
      </Tooltip.Root>
    {/if}
  </span>
</div>

<style>
  /* Both sides stand at least one pill tall and hang from the top, so a
     badge that comes, goes or wraps never re-centres the machine's name. */
  .row {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    gap: var(--space-3);
    padding: var(--space-3) var(--space-4);
  }
  .who {
    display: flex;
    min-width: 0;
    min-height: 24px;
    flex: 0 0 auto;
    align-items: center;
    gap: var(--space-2);
  }
  /* An offline machine's name dims rather than changing shape. */
  .who {
    @media (prefers-reduced-motion: no-preference) {
      transition: opacity var(--dur-panel) var(--ease-out);
    }
  }
  .who.off {
    opacity: 0.6;
  }
  .nm {
    max-width: 14ch;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font: var(--type-label);
    color: var(--ink-strong);
  }
  .dot {
    width: 6px;
    height: 6px;
    flex: 0 0 auto;
    border-radius: var(--radius-pill);
    background: var(--ink-muted);
    opacity: 0.5;

    /* Going offline and coming back is a change of colour, not a new dot. */
    @media (prefers-reduced-motion: no-preference) {
      transition:
        background-color var(--dur-pop) var(--ease-out),
        opacity var(--dur-pop) var(--ease-out);
    }
  }
  .dot.up {
    background: var(--status-live-ink);
    opacity: 1;
  }
  .badges {
    display: flex;
    min-width: 0;
    min-height: 24px;
    flex: 1 1 auto;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
  }
  /* The build chip's tint, per what it says; it turns over --dur-control. */
  .badges :global(.build-chip) {
    border: 1px solid transparent;
    transition:
      background-color var(--dur-control) var(--ease-out),
      border-color var(--dur-control) var(--ease-out),
      color var(--dur-control) var(--ease-out);
  }
  .badges :global(.build-chip[data-build="current"]) {
    background: transparent;
    color: var(--ink-muted);
  }
  .badges :global(.build-chip[data-build="unknown"]),
  .badges :global(.build-chip[data-build="updating"]) {
    border-color: var(--border);
    background: transparent;
    color: var(--ink-muted);
  }
  .badges :global(.build-chip[data-build="behind"]) {
    background: var(--warning-3);
    color: var(--warning-11);
  }
</style>
