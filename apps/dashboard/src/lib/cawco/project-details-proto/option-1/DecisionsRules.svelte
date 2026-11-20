<script lang="ts">
  /**
   * Decisions view inline rule header: unifies all 6 Who decides kinds
   * (showing fleet defaults subtly marked, project overrides active, 1-click
   * Reset per overridden row) and Review before done in one card above the
   * project's decisions list.
   */
  import type { BuiltInKind } from "@cawco/core/decides";
  import {
    Alert,
    AlertAction,
    AlertDescription,
    AlertTitle,
  } from "#lib/components/ui/alert/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import {
    OptionGroup,
    OptionGroupItem,
  } from "#lib/components/ui/option-group/index.js";
  import { Skeleton } from "#lib/components/ui/skeleton/index.js";
  import { Spinner } from "#lib/components/ui/spinner/index.js";
  import {
    IconExternalLinear,
    IconReset,
    IconRules,
    IconWarningTriangle,
  } from "#lib/icons.js";
  import {
    BUILT_IN_KIND_ORDER,
    decidesChangeId,
    hubReading,
    isPending,
    refusalFor,
  } from "./format";
  import HubAwayNote from "./HubAwayNote.svelte";
  import RefusalNote from "./RefusalNote.svelte";
  import {
    type Change,
    type Changes,
    type GovernedRecord,
    MEMBERS,
    type Member,
  } from "./records";
  import { words } from "./words";

  let {
    record,
    changes,
    now: _now,
    onchange,
    onreread,
  }: {
    record: GovernedRecord;
    changes: Changes;
    now: number;
    onchange: (change: Change) => void;
    onreread: (what: "decides" | "tracker" | "connections") => void;
  } = $props();

  let lastDecidesAttempt = $state<Partial<Record<BuiltInKind, Member | null>>>(
    {}
  );
  let lastReviewAttempt = $state<boolean | null>(null);

  const { asOfTime, reachable } = $derived(hubReading(record));

  const ownCount = $derived(
    record.decides.state === "read"
      ? Object.values(record.decides.value).filter((r) => r.own).length
      : 0
  );

  const reviewPending = $derived(isPending(changes, "review"));
  const reviewRefusal = $derived(refusalFor(changes, "review"));

  function sendDecides(kind: BuiltInKind, member: Member | null) {
    const id = decidesChangeId(kind);
    if (!reachable || isPending(changes, id)) {
      return;
    }
    lastDecidesAttempt = { ...lastDecidesAttempt, [kind]: member };
    onchange({ key: "decides", kind, member });
  }

  function retryDecides(kind: BuiltInKind) {
    const id = decidesChangeId(kind);
    if (!reachable || isPending(changes, id)) {
      return;
    }
    const target = lastDecidesAttempt[kind];
    if (target === undefined) {
      return;
    }
    onchange({ key: "decides", kind, member: target });
  }

  function pickReview(value: "on" | "off") {
    const next = value === "on";
    if (!reachable || reviewPending || next === record.project.review) {
      return;
    }
    lastReviewAttempt = next;
    onchange({ key: "review", review: next });
  }

  function retryReview() {
    if (!reachable || reviewPending || lastReviewAttempt === null) {
      return;
    }
    onchange({ key: "review", review: lastReviewAttempt });
  }
  const REVIEW_PICKS = ["on", "off"] as const;
</script>

<section
  aria-label={words.decisions.heading}
  class="@container/rules grid max-w-decisions-900px gap-space-3 rounded-well border border-border-well bg-surface-well p-space-4"
  data-slot="decisions-rules"
>
  <!-- Card header -->
  <div class="flex flex-wrap items-center justify-between gap-space-2">
    <div class="mark-line flex flex-wrap items-center gap-space-2">
      <IconRules aria-hidden="true" class="size-icon-md text-ink-strong" />
      <h2 class="m-0 type-label text-ink-strong">{words.decisions.heading}</h2>
      {#if record.decides.state === "reading"}
        <Skeleton data-box line="meta" width="name" />
      {:else if record.decides.state === "failed"}
        <span class="type-meta text-status-fail-ink">
          {words.waiting.rulesUnreadable}
        </span>
      {:else}
        <span class="type-meta text-ink-muted">
          {ownCount === 0
            ? words.decisions.followingFleet
            : words.decisions.projectRules(ownCount)}
        </span>
      {/if}
    </div>

    <a
      class="mark-line inline-flex items-center gap-space-1 type-meta text-link-ink underline-offset-3 hover:underline"
      href="#configure-decides"
    >
      <span>{words.decisions.fleetDefaultsLink}</span>
      <IconExternalLinear aria-hidden="true" class="size-icon-sm" />
    </a>
  </div>

  <HubAwayNote asOf={asOfTime} />

  <!-- Six kinds grid -->
  {#if record.decides.state === "reading"}
    <div class="grid gap-space-2" role="status">
      {#each BUILT_IN_KIND_ORDER as kind (kind)}
        <div
          class="grid items-center gap-space-2 py-space-1 @kinds/rules:grid-cols-(--row-cols)"
          style:--row-cols="var(--spacing-c-kind-col-w) minmax(0, 1fr)"
        >
          <Skeleton line="label" width="name" />
          <div class="flex flex-wrap gap-space-2">
            <Skeleton height="control-sm" radius="chip" width="short" />
            <Skeleton height="control-sm" radius="chip" width="short" />
            <Skeleton height="control-sm" radius="chip" width="label" />
            <Skeleton height="control-sm" radius="chip" width="title" />
          </div>
        </div>
      {/each}
    </div>
  {:else if record.decides.state === "failed"}
    <Alert aria-live="assertive" variant="destructive">
      <IconWarningTriangle aria-hidden="true" />
      <AlertTitle>{words.decisions.unreadableTitle}</AlertTitle>
      <AlertDescription>
        {record.decides.reason}
      </AlertDescription>
      <AlertAction>
        <Button
          disabled={!reachable}
          onclick={() => onreread("decides")}
          size="xs"
          variant="outline"
        >
          {words.hub.tryAgain}
        </Button>
      </AlertAction>
    </Alert>
  {:else}
    <div class="grid">
      {#each BUILT_IN_KIND_ORDER as kind (kind)}
        {@const route = record.decides.value[kind]}
        {@const kindCopy = words.decisions.kinds[kind]}
        {@const changeId = decidesChangeId(kind)}
        {@const rowPending = isPending(changes, changeId)}
        {@const rowRefusal = refusalFor(changes, changeId)}
        {@const attempt = lastDecidesAttempt[kind]}
        <div
          class="grid gap-space-2 border-t border-border-hairline py-space-2 first:border-t-0 first:pt-0 last:pb-0"
        >
          <div
            class="grid items-start gap-space-2 @kinds/rules:grid-cols-(--row-cols)"
            style:--row-cols="var(--spacing-c-kind-col-w) minmax(0, 1fr) auto"
          >
            <div class="min-w-0 pt-space-1">
              <div class="type-label text-ink-strong">{kindCopy.name}</div>
              <div class="type-meta text-ink-subtle text-pretty">
                {kindCopy.example}
              </div>
            </div>

            <OptionGroup
              aria-label={kindCopy.name}
              disabled={!reachable || rowPending}
              layout="chips"
              bind:value={
                () => [route.member],
                (next) => {
                  const picked = MEMBERS.find((member) => member === next[0]);
                  if (picked && picked !== route.member) {
                    sendDecides(kind, picked);
                  }
                }
              }
            >
              {#each MEMBERS as member (member)}
                {@const isFleet = member === route.fleet}
                {@const spinning = rowPending && attempt === member}
                <OptionGroupItem value={member}>
                  <span
                    class="inline-flex min-w-0 items-center gap-space-2 mark-line"
                  >
                    <span>{words.decisions.members[member]}</span>
                    {#if isFleet}
                      <span class="type-meta text-ink-subtle">
                        · {words.decisions.fleetTag}
                      </span>
                    {/if}
                    {#if spinning}
                      <Spinner box="small" tone="muted" />
                    {/if}
                  </span>
                </OptionGroupItem>
              {/each}
            </OptionGroup>

            <div class="flex items-center @kinds/rules:justify-end">
              {#if route.own}
                <Button
                  aria-label={words.decisions.resetKindAria(kindCopy.name)}
                  disabled={!reachable || rowPending}
                  icon={IconReset}
                  label={words.decisions.reset}
                  onclick={() => sendDecides(kind, null)}
                  pending={rowPending && attempt === null}
                  size="xs"
                  tone="quiet"
                  variant="ghost"
                />
              {:else}
                <span aria-hidden="true" class="hidden w-16 @kinds/rules:block"
                ></span>
              {/if}
            </div>
          </div>

          {#if rowRefusal}
            <RefusalNote
              disabled={!reachable || rowPending}
              onretry={() => retryDecides(kind)}
              said={rowRefusal}
            />
          {/if}
        </div>
      {/each}
    </div>
  {/if}

  <!-- Hairline + Review before done inside the same card -->
  <div class="grid gap-space-2 border-t border-border-hairline pt-space-3">
    <div
      class="grid items-start gap-space-2 @kinds/rules:grid-cols-(--row-cols)"
      style:--row-cols="var(--spacing-c-kind-col-w) minmax(0, 1fr)"
    >
      <div class="min-w-0 pt-space-1">
        <div class="type-label text-ink-strong">
          {words.decisions.reviewHeading}
        </div>
        <div class="type-meta text-ink-subtle">
          {words.decisions.reviewNote}
        </div>
      </div>

      <OptionGroup
        aria-label={words.decisions.reviewHeading}
        disabled={!reachable || reviewPending}
        layout="chips"
        bind:value={
          () => [record.project.review ? "on" : "off"],
          (next) => {
            const picked = REVIEW_PICKS.find((pick) => pick === next[0]);
            if (picked) {
              pickReview(picked);
            }
          }
        }
      >
        <OptionGroupItem value="on">
          <span class="inline-flex min-w-0 items-center gap-space-2 mark-line">
            <span>{words.decisions.reviewOptions.on}</span>
            {#if reviewPending && lastReviewAttempt === true}
              <Spinner box="small" tone="muted" />
            {/if}
          </span>
        </OptionGroupItem>
        <OptionGroupItem value="off">
          <span class="inline-flex min-w-0 items-center gap-space-2 mark-line">
            <span>{words.decisions.reviewOptions.off}</span>
            {#if reviewPending && lastReviewAttempt === false}
              <Spinner box="small" tone="muted" />
            {/if}
          </span>
        </OptionGroupItem>
      </OptionGroup>
    </div>

    {#if reviewRefusal}
      <RefusalNote
        disabled={!reachable || reviewPending}
        onretry={retryReview}
        said={reviewRefusal}
      />
    {/if}
  </div>
</section>
