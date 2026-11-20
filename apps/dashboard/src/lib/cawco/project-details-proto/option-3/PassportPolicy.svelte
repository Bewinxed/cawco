<script lang="ts">
  /**
   * Group 1 of the Project Passport: standing policy (Who decides + Review
   * before done, Finished work on code projects, Account + at-limit behaviour,
   * and Large-file storage when declared on a code project). Read-only, zero
   * form controls, zero coral.
   */
  import { Button } from "#lib/components/ui/button/index.js";
  import { SectionHeader } from "#lib/components/ui/section-header/index.js";
  import { Skeleton } from "#lib/components/ui/skeleton/index.js";
  import { IconRules, IconSuccess, IconWarningTriangle } from "#lib/icons.js";
  import PassportAlert from "./PassportAlert.svelte";
  import {
    accountHueVar,
    decidesGroups,
    decidesOwnCount,
    decidesTotalCount,
    lfsHostOf,
    type PassportActs,
    type PassportReading,
  } from "./records";
  import { passportWords as words } from "./words";

  let {
    reading,
    acts,
    hubAway,
    narrow,
  }: {
    reading: PassportReading;
    acts: PassportActs;
    hubAway: boolean;
    narrow: boolean;
  } = $props();

  const KIND_LABELS = new Map<string, string>(Object.entries(words.kinds));
  const shortKind = (id: string): string => KIND_LABELS.get(id) ?? id;

  const decidesFault = $derived.by(() => {
    if (reading.decides.state === "failed") {
      return {
        title: words.policy.decidesReadFailed,
        detail: reading.decides.words,
      };
    }
    if (
      reading.decides.state === "read" &&
      reading.decides.value.problems.length > 0
    ) {
      return {
        title: words.policy.ruleFileUnreadable,
        detail: reading.decides.value.problems.join(" "),
      };
    }
    return null;
  });

  const groups = $derived(
    reading.decides.state === "read" && decidesFault === null
      ? decidesGroups(reading.decides.value)
      : []
  );
  const ownCount = $derived(
    reading.decides.state === "read"
      ? decidesOwnCount(reading.decides.value)
      : 0
  );
  const totalCount = $derived(
    reading.decides.state === "read"
      ? decidesTotalCount(reading.decides.value)
      : 6
  );
  const decidesSummary = $derived.by(() => {
    if (ownCount === 0) {
      return words.policy.followsFleetAll(totalCount);
    }
    if (ownCount >= totalCount) {
      return words.policy.ownAll(totalCount);
    }
    return words.policy.ownOverFleet(ownCount, totalCount);
  });
</script>

<section
  aria-labelledby="passport-policy-heading"
  class="flex flex-col gap-space-2"
>
  <SectionHeader
    hue="var(--color-ink-muted)"
    icon={IconRules}
    label={words.policy.heading}
    level={2}
  >
    {#snippet right()}
      <Button
        disabled={hubAway}
        hit={narrow ? "always" : undefined}
        onclick={() => acts.editRules()}
        size="xs"
        variant="outline"
      >
        {words.policy.editRules}
      </Button>
    {/snippet}
  </SectionHeader>

  <div
    class="rounded-well border border-border-well bg-surface-well px-space-3 py-space-2"
    data-slot="well"
  >
    <div
      class="flex flex-wrap items-baseline justify-between gap-x-space-2 gap-y-space-row"
    >
      <h3 class="m-0 type-label text-ink-strong" id="passport-policy-heading">
        {words.policy.whoDecides}
      </h3>
      {#if reading.decides.state === "reading"}
        <Skeleton line="meta" radius="line" width="name" />
      {:else if reading.decides.state === "read" && decidesFault === null}
        <span class="type-meta num text-ink-muted">{decidesSummary}</span>
      {/if}
    </div>

    {#if reading.decides.state === "reading"}
      <div aria-busy="true" class="mt-space-1 flex flex-col gap-space-1">
        <Skeleton line="meta" radius="line" width="title" />
        <Skeleton class="w-4/5" line="meta" radius="line" />
      </div>
    {:else if decidesFault}
      <div class="mt-space-1">
        <PassportAlert
          detail={decidesFault.detail}
          disabled={hubAway}
          {narrow}
          onretry={() => acts.retry("decides")}
          title={decidesFault.title}
        />
      </div>
    {:else}
      <div class="mt-space-1 flex flex-col gap-space-row">
        {#each groups as group (group.memberId)}
          <div class="flex items-baseline gap-space-1 type-meta">
            <span class="flex-none font-medium text-ink-strong">
              {group.memberName}:
            </span>
            <span class="min-w-0 text-ink-muted">
              {group.kindIds.map(shortKind).join(", ")}
            </span>
          </div>
        {/each}
      </div>
    {/if}

    <div
      class="mt-space-2 flex items-center justify-between gap-space-2 border-t border-border-hairline pt-space-1"
    >
      <span class="type-meta text-ink-muted">
        {words.policy.reviewBeforeDone}
      </span>
      {#if reading.project.review}
        <span
          class="mark-line inline-flex items-center gap-space-1 type-meta font-medium text-ink-strong"
        >
          <IconSuccess
            aria-hidden="true"
            class="size-icon-sm text-status-done-glyph"
          />
          <span>{words.policy.on}</span>
        </span>
      {:else}
        <span class="type-meta text-ink-muted">{words.policy.off}</span>
      {/if}
    </div>
  </div>

  <dl
    class="m-0 grid grid-cols-(--passport-fact-cols) items-baseline gap-x-space-3 gap-y-space-1"
  >
    {#if reading.holdsCode}
      <dt class="type-meta text-ink-muted">{words.policy.finishedWork}</dt>
      <dd class="m-0 min-w-0 type-label text-ink-strong">
        {words.landing[reading.project.lands]}
      </dd>
    {/if}

    <dt class="type-meta text-ink-muted">{words.policy.account}</dt>
    <dd class="m-0 min-w-0">
      {#if reading.account.state === "reading"}
        <Skeleton line="label" radius="line" width="title" />
      {:else if reading.account.state === "failed"}
        <PassportAlert
          detail={reading.account.words}
          disabled={hubAway}
          {narrow}
          onretry={() => acts.retry("account")}
          title={words.policy.accountReadFailed}
        />
      {:else if reading.account.value === null}
        <span class="type-label text-ink-strong">
          {words.policy.fleetRouting}
        </span>
      {:else}
        {@const acct = reading.account.value}
        <div
          class="mark-line flex flex-wrap items-center gap-x-space-3 gap-y-space-row"
        >
          <span class="mark-line inline-flex items-center gap-space-2" data-box>
            <span
              aria-hidden="true"
              class="inline-block size-space-2 flex-none rounded-pill bg-(--account-hue)"
              data-box
              style:--account-hue={accountHueVar(acct.hue)}
            ></span>
            <span class="type-label text-ink-strong">{acct.name}</span>
          </span>
          <span class="type-meta text-ink-muted">
            {words.atLimit[reading.project.accountAtLimit]}
          </span>
        </div>

        {#if !acct.signedIn}
          <!-- mark-line: glyph aligns to first line of signed-out notice -->
          <div
            class="mt-space-1 rounded-well bg-status-fail-bg px-space-2 py-space-1"
            role="alert"
          >
            <div class="grid grid-cols-mark-fluid items-start gap-x-space-1">
              <span class="mark-cell" data-box>
                <IconWarningTriangle
                  aria-hidden="true"
                  class="size-icon-sm text-status-fail-glyph"
                />
              </span>
              <div class="flex min-w-0 flex-col gap-space-1">
                <p class="m-0 type-meta font-medium text-status-fail-ink">
                  {words.policy.signedOut}
                </p>
                <div class="flex flex-wrap items-center gap-space-2">
                  <Button
                    hit={narrow ? "always" : undefined}
                    onclick={() => acts.configure("accounts")}
                    size="xs"
                    variant="ghost"
                  >
                    {words.common.configure}
                  </Button>
                  <Button
                    disabled={hubAway}
                    hit={narrow ? "always" : undefined}
                    onclick={() => acts.editRules("account")}
                    size="xs"
                    variant="outline"
                  >
                    {words.policy.switchAccount}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        {/if}
      {/if}
    </dd>

    {#if reading.holdsCode && reading.project.lfsUrl}
      <dt class="type-meta text-ink-muted">{words.policy.largeFiles}</dt>
      <dd
        class="m-0 flex min-w-0 flex-wrap items-baseline gap-x-space-3 gap-y-space-row"
      >
        <span class="min-w-0 break-word type-code text-ink-strong">
          {lfsHostOf(reading.project.lfsUrl)}
        </span>
        {#if reading.project.lfsConnection}
          <span class="type-meta text-ink-muted">
            {reading.project.lfsConnection}
          </span>
        {/if}
      </dd>
    {/if}
  </dl>
</section>
