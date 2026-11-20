<script lang="ts">
  /**
   * Group 2b of the Project Passport: the task mirror row under a hairline.
   * Shows an external tracker (GitHub Issues or Linear) with target link,
   * linked count, live sync state, connection, GitHub Project or reason, and
   * Sync now; or the quiet CawCo-files line with Connect tracker.
   */
  import { TRACKER_NAMES } from "@cawco/core/trackers";
  import { Button } from "#lib/components/ui/button/index.js";
  import { LiveDot } from "#lib/components/ui/live-dot/index.js";
  import MorphText from "#lib/components/ui/morph-text/morph-text.svelte";
  import { Skeleton } from "#lib/components/ui/skeleton/index.js";
  import {
    IconRefreshLinear,
    IconSuccess,
    IconWarningTriangle,
  } from "#lib/icons.js";
  import type { PassportActs, PassportReading } from "./records";
  import { passportWords as words } from "./words";

  let {
    reading,
    acts,
    hubAway,
  }: {
    reading: PassportReading;
    acts: PassportActs;
    hubAway: boolean;
  } = $props();
</script>

<div class="border-t border-border-hairline pt-space-2">
  {#if reading.tracker.state === "reading"}
    <div aria-busy="true" class="flex items-center justify-between gap-space-2">
      <div class="flex min-w-0 flex-1 flex-col gap-space-1">
        <Skeleton line="label" radius="line" width="title" />
        <Skeleton line="meta" radius="line" width="name" />
      </div>
      <Skeleton height="badge" radius="chip" width="word" />
    </div>
  {:else if reading.tracker.state === "failed"}
    <!-- mark-line: glyph aligns to first line of stacked failure copy -->
    <div
      class="grid grid-cols-mark-fluid items-start gap-x-space-2"
      role="alert"
    >
      <span class="mark-cell" data-box>
        <IconWarningTriangle
          aria-hidden="true"
          class="size-icon-sm text-status-fail-glyph"
        />
      </span>
      <div class="flex min-w-0 flex-col gap-space-1">
        <p class="m-0 type-label text-status-fail-ink">
          {words.tracker.readFailed}
        </p>
        <p class="m-0 type-meta break-word text-ink-muted">
          {reading.tracker.words}
        </p>
        <div>
          <Button
            disabled={hubAway}
            onclick={() => acts.retry("tracker")}
            size="xs"
            variant="outline"
          >
            {words.common.tryAgain}
          </Button>
        </div>
      </div>
    </div>
  {:else if reading.tracker.value.tracker === "cawco" || reading.tracker.value.binding === null}
    <div class="flex flex-wrap items-center justify-between gap-space-2">
      <span class="type-meta text-ink-muted">
        {words.tracker.staysInFiles}
      </span>
      <Button
        disabled={hubAway}
        onclick={() => acts.editRules("taskHome")}
        size="xs"
        variant="ghost"
      >
        {words.tracker.connectTracker}
      </Button>
    </div>
  {:else}
    {@const binding = reading.tracker.value.binding}
    <div class="flex flex-col gap-space-1">
      <div class="flex flex-wrap items-center justify-between gap-space-2">
        <div
          class="flex min-w-0 flex-wrap items-baseline gap-x-space-2 gap-y-space-row"
        >
          <span class="type-label text-ink-strong">
            {TRACKER_NAMES[binding.provider]}
          </span>
          <a
            class="min-w-0 break-word type-code text-ink-strong underline decoration-border-control underline-offset-(--underline-offset) transition-colors duration-(--duration-control) ease-out hover:decoration-ink-strong"
            href={binding.targetUrl}
            rel="noopener noreferrer"
            target="_blank"
          >
            {binding.targetName}
          </a>
          <span class="type-meta num text-ink-muted">
            · {words.tracker.linked(binding.linked)}
          </span>
        </div>

        <Button
          disabled={hubAway || binding.state === "syncing"}
          icon={IconRefreshLinear}
          label={words.tracker.syncNow}
          onclick={() => acts.sync()}
          size="xs"
          variant="outline"
        />
      </div>

      <div
        aria-live="polite"
        class="flex flex-wrap items-center gap-x-space-2 gap-y-space-row"
      >
        {#if binding.state === "syncing"}
          <span
            class="mark-line inline-flex items-center gap-space-1 type-meta text-status-live-ink"
          >
            <LiveDot />
            <span><MorphText text={words.tracker.syncing} /></span>
          </span>
        {:else if binding.state === "refused"}
          <span
            class="mark-line inline-flex items-center gap-space-1 type-meta font-medium text-status-fail-ink"
          >
            <IconWarningTriangle
              aria-hidden="true"
              class="size-icon-sm text-status-fail-glyph"
            />
            <span><MorphText text={words.tracker.refused} /></span>
          </span>
        {:else}
          <span
            class="mark-line inline-flex items-center gap-space-1 type-meta text-ink-muted"
          >
            <IconSuccess
              aria-hidden="true"
              class="size-icon-sm text-status-done-glyph"
            />
            <span class="num">
              <MorphText text={words.tracker.inStep(binding.polledAt)} />
            </span>
          </span>
        {/if}

        <span class="type-meta text-ink-muted">· {binding.connection}</span>

        {#if binding.provider === "github" && binding.githubProject}
          <span class="type-meta text-ink-muted">
            ·
            <a
              class="text-ink-strong underline decoration-border-control underline-offset-(--underline-offset) transition-colors duration-(--duration-control) ease-out hover:decoration-ink-strong"
              href={binding.githubProject.url}
              rel="noopener noreferrer"
              target="_blank"
            >
              {binding.githubProject.title}
            </a>
          </span>
        {/if}
      </div>

      {#if binding.provider === "github" && !binding.githubProject && binding.githubProjectReason}
        <p class="m-0 type-meta break-word text-ink-muted">
          {binding.githubProjectReason}
        </p>
      {/if}

      {#if binding.state === "refused" && binding.reason}
        <div
          class="rounded-well bg-status-fail-bg px-space-2 py-space-1"
          role="alert"
        >
          <p class="m-0 type-meta break-word text-status-fail-ink">
            {binding.reason}
          </p>
          <div class="mt-space-1">
            <Button
              onclick={() => acts.configure("connections")}
              size="xs"
              variant="ghost"
            >
              {words.common.configure}
            </Button>
          </div>
        </div>
      {/if}
    </div>
  {/if}
</div>
