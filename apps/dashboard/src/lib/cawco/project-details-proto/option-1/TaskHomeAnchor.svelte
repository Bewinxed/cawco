<script lang="ts">
  import type { TrackerSyncState } from "@cawco/core/trackers";
  /**
   * Task home & Sync anchor on the Views strip: shows CawCo files, or the
   * tied tracker's glyph + `owner/repo · 12 · 4m`, or a breathing LiveDot +
   * `Syncing…`, or crimson `Sync refused`, or a Skeleton while reading.
   * Opens its glide-popover directly onto sync standing (when tied), open
   * 3-chip Task home choices, and the connection + target tie controls.
   */
  import {
    type IssueTracker,
    TRACKERS,
    type Tracker,
  } from "@cawco/core/trackers";
  import NsPopover from "#lib/cawco/spawn/NsPopover.svelte";
  import ProviderLogo from "#lib/components/features/ProviderLogo.svelte";
  import { Alert, AlertDescription } from "#lib/components/ui/alert/index.js";
  import { Badge } from "#lib/components/ui/badge/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { chipVariants } from "#lib/components/ui/chip/index.js";
  import { Input } from "#lib/components/ui/input/index.js";
  import { LiveDot } from "#lib/components/ui/live-dot/index.js";
  import MorphText from "#lib/components/ui/morph-text/morph-text.svelte";
  import {
    OptionGroup,
    OptionGroupItem,
  } from "#lib/components/ui/option-group/index.js";
  import { Skeleton } from "#lib/components/ui/skeleton/index.js";
  import { Spinner } from "#lib/components/ui/spinner/index.js";
  import {
    IconChevronDown,
    IconDocument,
    IconExternalLinear,
    IconRefresh,
    IconWarningTriangle,
  } from "#lib/icons.js";
  import { cn } from "#lib/utils.js";
  import ConnectionPick from "./ConnectionPick.svelte";
  import {
    formatAge,
    hubReading,
    isPending,
    refusalFor,
    repoShortTarget,
  } from "./format";
  import HubAwayNote from "./HubAwayNote.svelte";
  import RefusalNote from "./RefusalNote.svelte";
  import type { Change, Changes, GovernedRecord } from "./records";
  import { words } from "./words";

  let {
    record,
    changes,
    now,
    onchange,
    onsyncnow,
    onreread,
  }: {
    record: GovernedRecord;
    changes: Changes;
    now: number;
    onchange: (change: Change) => void;
    onsyncnow: () => void;
    onreread: (what: "decides" | "tracker" | "connections") => void;
  } = $props();

  let open = $state(false);
  let configuring = $state<IssueTracker | null>(null);
  let connDraft = $state<string | null>(null);
  let targetDraft = $state<string | null>(null);
  let targetFilter = $state("");
  let lastChange = $state<Extract<Change, { key: "taskHome" }> | null>(null);
  let syncFlash = $state(false);
  let prevSyncState: string | null = null;
  let wasPending = false;

  const { asOfTime, reachable, staleMeta } = $derived(hubReading(record));

  const trackerView = $derived(
    record.tracker.state === "read" ? record.tracker.value : null
  );
  const binding = $derived(trackerView?.binding ?? null);
  const pending = $derived(isPending(changes, "taskHome"));
  const refusal = $derived(refusalFor(changes, "taskHome"));

  // Flash olive briefly only on completion of an explicit sync (syncing -> synced).
  $effect(() => {
    const current = binding?.state ?? null;
    if (prevSyncState === "syncing" && current === "synced") {
      syncFlash = true;
      const timer = setTimeout(() => {
        syncFlash = false;
      }, 600);
      prevSyncState = current;
      return () => clearTimeout(timer);
    }
    prevSyncState = current;
  });

  // Close tie configurator once a pending taskHome save succeeds without refusal.
  $effect(() => {
    if (wasPending && !pending && !refusal) {
      configuring = null;
      connDraft = null;
      targetDraft = null;
      targetFilter = "";
    }
    wasPending = pending;
  });

  const triggerState = $derived.by<{
    kind: "failed" | "cawco" | TrackerSyncState;
    text: string;
    tone: "muted" | "fail" | undefined;
  }>(() => {
    if (record.tracker.state === "failed") {
      return {
        kind: "failed",
        text: words.taskHome.trackerUnreadTrigger,
        tone: "fail",
      };
    }
    if (!trackerView || trackerView.tracker === "cawco" || !binding) {
      return {
        kind: "cawco",
        text: words.taskHome.cawcoFiles,
        tone: "muted",
      };
    }
    if (binding.state === "refused") {
      return {
        kind: "refused",
        text: words.taskHome.syncRefused,
        tone: "fail",
      };
    }
    if (binding.state === "syncing") {
      return {
        kind: "syncing",
        text: words.taskHome.syncing,
        tone: undefined,
      };
    }
    const age = binding.polledAt ? formatAge(binding.polledAt, now) : null;
    const summary = age
      ? `${binding.targetName} · ${binding.linked} · ${age}`
      : `${binding.targetName} · ${binding.linked}`;
    return {
      kind: "synced",
      text: summary,
      tone: undefined,
    };
  });

  const eligibleConnections = $derived.by(() => {
    if (!configuring || record.connections.state !== "read") {
      return [];
    }
    return record.connections.value.filter((c) => c.service === configuring);
  });

  const selectedConnection = $derived.by(() => {
    if (connDraft && eligibleConnections.some((c) => c.name === connDraft)) {
      return connDraft;
    }
    if (
      binding &&
      binding.provider === configuring &&
      eligibleConnections.some((c) => c.name === binding.connection)
    ) {
      return binding.connection;
    }
    return eligibleConnections[0]?.name ?? "";
  });

  // Project's own linked repos first (for GitHub), then current target if any.
  const knownTargets = $derived.by<{ id: string; isProjectRepo: boolean }[]>(
    () => {
      if (!configuring) {
        return [];
      }
      const seen = new Set<string>();
      const list: { id: string; isProjectRepo: boolean }[] = [];
      if (configuring === "github") {
        for (const link of record.project.links) {
          const short = repoShortTarget(link);
          if (short && !seen.has(short)) {
            seen.add(short);
            list.push({ id: short, isProjectRepo: true });
          }
        }
      }
      if (
        binding &&
        binding.provider === configuring &&
        !seen.has(binding.target)
      ) {
        seen.add(binding.target);
        list.push({ id: binding.target, isProjectRepo: false });
      }
      return list;
    }
  );

  const filteredTargets = $derived.by(() => {
    const q = targetFilter.trim().toLowerCase();
    const matched = q
      ? knownTargets.filter((t) => t.id.toLowerCase().includes(q))
      : knownTargets;
    const typed = targetFilter.trim();
    if (
      typed &&
      !matched.some((t) => t.id.toLowerCase() === typed.toLowerCase())
    ) {
      return [
        ...matched.map((t) => ({ ...t, isTyped: false })),
        { id: typed, isProjectRepo: false, isTyped: true },
      ];
    }
    return matched.map((t) => ({ ...t, isTyped: false }));
  });

  const selectedTarget = $derived.by(() => {
    if (targetDraft !== null) {
      return targetDraft;
    }
    if (binding && binding.provider === configuring) {
      return binding.target;
    }
    return knownTargets[0]?.id ?? "";
  });

  const hasYouStage = $derived(record.youStages.length > 0);
  const canSaveTie = $derived(
    reachable &&
      !pending &&
      configuring !== null &&
      hasYouStage &&
      selectedConnection.length > 0 &&
      selectedTarget.trim().length > 0
  );

  function openConfigure(provider: IssueTracker) {
    configuring = provider;
    targetFilter = "";
    if (binding && binding.provider === provider) {
      connDraft = binding.connection;
      targetDraft = binding.target;
    } else {
      connDraft = null;
      targetDraft =
        provider === "github" && record.project.links.length > 0
          ? repoShortTarget(record.project.links[0])
          : "";
    }
  }

  function pickHome(next: Tracker) {
    if (!reachable || pending || !trackerView) {
      return;
    }
    if (next === "cawco") {
      configuring = null;
      if (trackerView.tracker !== "cawco") {
        const change: Extract<Change, { key: "taskHome" }> = {
          key: "taskHome",
          tracker: "cawco",
        };
        lastChange = change;
        onchange(change);
      }
      return;
    }
    openConfigure(next);
  }

  function saveTie() {
    if (!(canSaveTie && configuring)) {
      return;
    }
    const change: Extract<Change, { key: "taskHome" }> = {
      key: "taskHome",
      tracker: configuring,
      connection: selectedConnection,
      target: selectedTarget.trim(),
    };
    lastChange = change;
    onchange(change);
  }

  function cancelConfigure() {
    configuring = null;
    connDraft = null;
    targetDraft = null;
    targetFilter = "";
  }

  function retryTaskHome() {
    if (!reachable || pending || !lastChange) {
      return;
    }
    onchange(lastChange);
  }
</script>

{#if record.tracker.state === "reading"}
  <span
    aria-label={words.taskHome.readingAria}
    class="inline-flex items-center"
    role="status"
  >
    <Skeleton height="control-sm" radius="chip" width="title" />
  </span>
{:else}
  <NsPopover
    id="project-task-home"
    align="end"
    label={words.taskHome.triggerAria(triggerState.text, staleMeta)}
    onchange={(next) => {
      open = next;
    }}
    {open}
    triggerClass={cn(
      chipVariants({ variant: "setting", tone: triggerState.tone }),
      "max-w-72",
      syncFlash && "animate-finish"
    )}
    width="var(--container-details)"
  >
    {#snippet trigger()}
      {#if triggerState.kind === "failed" || triggerState.kind === "refused"}
        <IconWarningTriangle
          aria-hidden="true"
          class="text-status-fail-glyph"
        />
      {:else if triggerState.kind === "syncing"}
        <LiveDot size="row" tone="live" />
      {:else if triggerState.kind === "synced" && binding?.provider === "github"}
        <ProviderLogo provider="github" />
      {:else if triggerState.kind === "synced" && binding?.provider === "linear"}
        <ProviderLogo provider="linear" />
      {:else}
        <IconDocument aria-hidden="true" class="text-ink-muted" />
      {/if}
      <span class="num" data-slot="chip-label">
        <MorphText text={triggerState.text} />
      </span>
      <IconChevronDown aria-hidden="true" data-slot="chevron" />
    {/snippet}

    <div class="grid gap-space-3 p-space-1">
      <HubAwayNote asOf={asOfTime} />

      {#if record.tracker.state === "failed"}
        <RefusalNote
          disabled={!reachable}
          onretry={() => onreread("tracker")}
          said={words.taskHome.unread(record.tracker.reason)}
        />
      {:else if trackerView}
        <!-- Conditional Sync standing well when tied -->
        {#if binding}
          <div
            class={cn(
              "grid gap-space-2 rounded-well border border-border-well bg-surface-well p-space-3",
              binding.state === "refused" &&
                "border-s-2 border-s-status-fail-ink",
              syncFlash && "animate-finish"
            )}
          >
            <div class="flex items-center justify-between gap-space-2">
              <a
                class="mark-line inline-flex min-w-0 items-center gap-space-2 type-label text-ink-strong transition-control hover:text-link-ink"
                href={binding.targetUrl}
                rel="noreferrer"
                target="_blank"
              >
                {#if binding.provider === "github"}
                  <ProviderLogo provider="github" />
                {:else}
                  <ProviderLogo provider="linear" />
                {/if}
                <span class="overflow-clip text-ellipsis whitespace-nowrap"
                  >{binding.targetName}</span
                >
                <IconExternalLinear
                  aria-hidden="true"
                  class="size-icon-sm shrink-0 text-ink-subtle"
                />
              </a>

              <div class="flex shrink-0 items-center gap-space-1">
                <Button
                  disabled={!reachable}
                  onclick={() => openConfigure(binding.provider)}
                  size="xs"
                  tone="quiet"
                  variant="ghost"
                >
                  {words.taskHome.changeTie}
                </Button>
                <Button
                  disabled={!reachable || binding.state === "syncing"}
                  onclick={onsyncnow}
                  size="xs"
                  variant="outline"
                >
                  <IconRefresh aria-hidden="true" />
                  <span>{words.taskHome.syncNow}</span>
                </Button>
              </div>
            </div>

            <div
              class="flex flex-wrap items-center gap-x-space-3 gap-y-space-1 type-meta text-ink-muted num"
            >
              <span>{binding.connection}</span>
              <span>{words.taskHome.linkedCount(binding.linked)}</span>
              {#if binding.state === "syncing"}
                <span
                  class="mark-line inline-flex items-center gap-space-1 text-status-live-ink"
                >
                  <LiveDot tone="live" />
                  <span>
                    {binding.polledAt === null
                      ? words.taskHome.firstSyncRunning
                      : words.taskHome.syncing}
                  </span>
                </span>
              {:else if binding.state === "refused"}
                <span
                  class="mark-line inline-flex items-center gap-space-1 text-status-fail-ink"
                >
                  <IconWarningTriangle
                    aria-hidden="true"
                    class="size-icon-sm text-status-fail-glyph"
                  />
                  <span>{words.taskHome.syncRefused}</span>
                </span>
              {:else}
                <span>
                  {words.taskHome.inStep(
                    binding.polledAt
                      ? formatAge(binding.polledAt, now)
                      : "just now"
                  )}
                </span>
              {/if}
            </div>

            {#if binding.state === "refused" && binding.reason}
              <RefusalNote
                disabled={!reachable}
                onretry={onsyncnow}
                said={binding.reason}
              />
            {/if}

            {#if binding.provider === "github"}
              {#if binding.githubProject}
                <div
                  class="flex items-center justify-between gap-space-2 border-t border-border-hairline pt-space-2 type-meta"
                >
                  <span class="text-ink-muted">
                    {words.taskHome.githubProjectLabel}
                  </span>
                  <a
                    class="mark-line inline-flex min-w-0 items-center gap-space-1 text-ink-strong transition-control hover:text-link-ink"
                    href={binding.githubProject.url}
                    rel="noreferrer"
                    target="_blank"
                  >
                    <span class="overflow-clip text-ellipsis whitespace-nowrap"
                      >{binding.githubProject.title}</span
                    >
                    <IconExternalLinear
                      aria-hidden="true"
                      class="size-icon-sm shrink-0 text-ink-subtle"
                    />
                  </a>
                </div>
              {:else if binding.githubProjectReason}
                <p
                  class="m-0 border-t border-border-hairline pt-space-2 type-meta text-ink-muted text-pretty"
                >
                  {binding.githubProjectReason}
                </p>
              {/if}
            {/if}
          </div>
        {/if}

        <!-- Three task homes as equal open chips -->
        <OptionGroup
          aria-label={words.taskHome.groupLabel}
          disabled={!reachable || pending}
          layout="tiles"
          style="--tiles-cols: 1fr; --tiles-cols-phone: 1fr"
          bind:value={
            () => [trackerView.tracker],
            (next) => {
              const picked = TRACKERS.find((home) => home === next[0]);
              if (picked) {
                pickHome(picked);
              }
            }
          }
        >
          {#each TRACKERS as home (home)}
            {@const copy = words.taskHome.homes[home]}
            {@const spinning = pending && lastChange?.tracker === home}
            <OptionGroupItem
              onclick={() => {
                if (
                  home === "cawco" &&
                  configuring !== null &&
                  trackerView.tracker === "cawco"
                ) {
                  cancelConfigure();
                } else if (
                  home !== "cawco" &&
                  trackerView.tracker === home &&
                  configuring === null
                ) {
                  openConfigure(home);
                }
              }}
              value={home}
            >
              <span class="mark-line flex w-full items-center gap-space-2">
                {#if home === "github"}
                  <ProviderLogo provider="github" />
                {:else if home === "linear"}
                  <ProviderLogo provider="linear" />
                {:else}
                  <IconDocument
                    aria-hidden="true"
                    class="size-icon-md shrink-0 text-ink-muted"
                  />
                {/if}
                <span class="type-label font-medium text-ink-strong">
                  {copy.name}
                </span>
                {#if spinning}
                  <Spinner box="small" class="ms-auto shrink-0" tone="muted" />
                {/if}
              </span>
              <span class="mt-space-1 type-meta text-ink-muted text-pretty">
                {copy.note}
              </span>
            </OptionGroupItem>
          {/each}
        </OptionGroup>

        <!-- Conditional Connection & target tie configuration -->
        {#if configuring}
          <div
            class="grid gap-space-3 rounded-well border border-border-well bg-surface-well p-space-3"
            data-slot="task-home-tie"
          >
            {#if !hasYouStage}
              <Alert variant="warning">
                <IconWarningTriangle aria-hidden="true" />
                <AlertDescription>
                  {words.taskHome.noYouStageAlert}
                </AlertDescription>
              </Alert>
            {/if}

            <!-- Connection chips -->
            <ConnectionPick
              chosen={selectedConnection}
              connections={record.connections}
              disabled={!reachable || pending}
              eligible={eligibleConnections}
              label={words.taskHome.connectionLabel}
              none={configuring === "github"
                ? words.taskHome.noGithubConnections
                : words.taskHome.noLinearConnections}
              onpick={(name) => {
                connDraft = name;
              }}
              onreread={() => onreread("connections")}
              {reachable}
            />

            <!-- Repository / Team picker: project's own first, then filter input -->
            {#if eligibleConnections.length > 0}
              <div class="grid gap-space-2">
                <label
                  class="type-meta text-ink-muted"
                  for="opt1-target-filter"
                >
                  {configuring === "github"
                    ? words.taskHome.repoLabel
                    : words.taskHome.teamLabel}
                </label>

                <Input
                  id="opt1-target-filter"
                  disabled={!reachable || pending}
                  face={configuring === "github" ? "mono" : undefined}
                  placeholder={configuring === "github"
                    ? words.taskHome.filterRepoPlaceholder
                    : words.taskHome.filterTeamPlaceholder}
                  bind:value={targetFilter}
                />

                {#if filteredTargets.length > 0}
                  <div class="max-h-36 overflow-y-auto">
                    <OptionGroup
                      aria-label={configuring === "github"
                        ? words.taskHome.repoLabel
                        : words.taskHome.teamLabel}
                      disabled={!reachable || pending}
                      layout="chips"
                      bind:value={
                        () => (selectedTarget ? [selectedTarget] : []),
                        ([next]) => {
                          if (next) {
                            targetDraft = next;
                          }
                        }
                      }
                    >
                      {#each filteredTargets as item (item.id)}
                        <OptionGroupItem value={item.id}>
                          <span
                            class={configuring === "github" ? "type-code" : ""}
                          >
                            {item.isTyped
                              ? words.taskHome.useTypedTarget(item.id)
                              : item.id}
                          </span>
                          {#if item.isProjectRepo}
                            <Badge kind="meta"
                              ><span>{words.taskHome.projectRepoTag}</span
                              ></Badge
                            >
                          {/if}
                        </OptionGroupItem>
                      {/each}
                    </OptionGroup>
                  </div>
                {/if}
              </div>
            {/if}

            <p class="m-0 type-meta text-ink-muted text-pretty">
              {words.taskHome.unvouchedNote}
            </p>

            <div class="flex items-center justify-end gap-space-2">
              <Button
                disabled={pending}
                onclick={cancelConfigure}
                size="xs"
                variant="ghost"
              >
                {words.hub.cancel}
              </Button>
              <Button
                disabled={!canSaveTie}
                label={words.taskHome.saveTie}
                onclick={saveTie}
                {pending}
                pendingLabel={words.hub.saving}
                size="xs"
                variant="outline"
              />
            </div>
          </div>
        {/if}

        {#if refusal}
          <RefusalNote
            disabled={!reachable || pending}
            onretry={retryTaskHome}
            said={refusal}
          />
        {/if}
      {/if}
    </div>
  </NsPopover>
{/if}
