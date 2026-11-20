<script lang="ts">
  /**
   * Stage 3 ("What waits for you"): the strongest-framed gate on the rail,
   * unifying Who decides (all six kinds standing open against the fleet's
   * defaults, with per-row Reset and unreadable-file blocker alert) and
   * Review before done in one place.
   */
  import {
    Alert,
    AlertAction,
    AlertDescription,
    AlertTitle,
  } from "#lib/components/ui/alert/index.js";
  import { Badge } from "#lib/components/ui/badge/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import {
    OptionGroup,
    OptionGroupItem,
  } from "#lib/components/ui/option-group/index.js";
  import { Spinner } from "#lib/components/ui/spinner/index.js";
  import {
    IconAlert,
    IconChevronRight,
    IconRefresh,
    IconReset,
  } from "#lib/icons.js";
  import ChoiceChip from "./ChoiceChip.svelte";
  import ControlRefusal from "./ControlRefusal.svelte";
  import type { Change, ChangeKey } from "./changes";
  import {
    CHOICE_KINDS,
    type ChoiceKind,
    type Decider,
    type HowItRunsRecord,
  } from "./records";
  import { howItRunsWords as words } from "./words";

  let {
    record,
    pending,
    refused,
    onchange,
    onretry,
    onreread,
    hrefOf,
  }: {
    record: HowItRunsRecord;
    pending: ChangeKey[];
    refused: Partial<Record<ChangeKey, string>>;
    onchange: (change: Change) => void;
    onretry: (key: ChangeKey) => void;
    /** Re-read Who decides when its rule file could not be read. */
    onreread: () => void;
    hrefOf: (page: "accounts" | "connections" | "fleetDecides") => string;
  } = $props();

  const DECIDERS: readonly Decider[] = ["you", "caw", "advisor", "practice"];

  /** UI-local state: which decider chip (or Reset) was pressed per kind, and which review option was pressed. */
  let pressedKind = $state<Partial<Record<ChoiceKind, Decider | "reset">>>({});
  let pressedReview = $state<boolean | null>(null);

  const disabled = $derived(!record.hubReachable);
  const reviewPending = $derived(pending.includes("review"));

  const ownCount = $derived.by(() => {
    if (!record.whoDecides.ok) {
      return 0;
    }
    const { rules } = record.whoDecides;
    return CHOICE_KINDS.filter((kind) => rules[kind].own).length;
  });

  function keyFor(kind: ChoiceKind): ChangeKey {
    return `decides.${kind}`;
  }

  function pickDecider(kind: ChoiceKind, decider: Decider) {
    if (disabled || !record.whoDecides.ok) {
      return;
    }
    if (record.whoDecides.rules[kind].by === decider) {
      return;
    }
    pressedKind = { ...pressedKind, [kind]: decider };
    onchange({ key: "decides", kind, value: decider });
  }

  function resetKind(kind: ChoiceKind) {
    if (disabled || !record.whoDecides.ok) {
      return;
    }
    pressedKind = { ...pressedKind, [kind]: "reset" };
    onchange({ key: "decidesReset", kind });
  }

  function pickReview(value: boolean) {
    if (disabled || value === record.reviewBeforeDone) {
      return;
    }
    pressedReview = value;
    onchange({ key: "review", value });
  }
</script>

<div
  class="flex min-w-0 flex-col rounded-well border border-border-contrast bg-surface-well px-space-3 py-space-2 @setup:px-space-4"
  data-slot="well"
>
  <!-- Who decides header: title, standing against fleet, and link to fleet defaults. -->
  <div
    class="flex flex-wrap items-center justify-between gap-x-space-3 gap-y-space-1"
  >
    <h3 class="m-0 type-label text-ink-strong">{words.waits.heading}</h3>
    <div class="flex flex-wrap items-center gap-x-space-3 gap-y-space-1">
      {#if record.whoDecides.ok}
        <span class="type-meta text-ink-muted num">
          {ownCount === 0
            ? words.waits.followingFleet
            : words.waits.projectRules(ownCount)}
        </span>
      {/if}
      <a
        class="mark-line inline-flex items-center gap-space-1 type-meta text-link-ink hover:underline"
        href={hrefOf("fleetDecides")}
      >
        <span>{words.waits.fleetDefaults}</span>
        <IconChevronRight aria-hidden="true" class="size-icon-sm flex-none" />
      </a>
    </div>
  </div>

  <!-- Unreadable rule file alert, or the six-kind open chip matrix. -->
  {#if !record.whoDecides.ok}
    <Alert class="mt-space-2" variant="destructive">
      <IconAlert aria-hidden="true" />
      <AlertTitle>{words.waits.unreadTitle}</AlertTitle>
      <AlertDescription
        ><span class="wrap-anywhere">{record.whoDecides.error}</span
        ></AlertDescription
      >
      <AlertAction class="row-span-2 self-center">
        <Button
          {disabled}
          icon={IconRefresh}
          label={words.tryAgain}
          onclick={onreread}
          size="xs"
          variant="outline"
        />
      </AlertAction>
    </Alert>
  {:else}
    {@const rules = record.whoDecides.rules}
    <div
      class="mt-space-1 grid grid-cols-1 gap-y-space-row @wide:grid-cols-2 @wide:gap-x-space-5 coarse:gap-y-space-3"
    >
      {#each CHOICE_KINDS as kind (kind)}
        {@const rule = rules[kind]}
        {@const kindLabel = words.waits.kinds[kind]}
        {@const changeKey = keyFor(kind)}
        {@const rowPending = pending.includes(changeKey)}
        {@const pressed = pressedKind[kind]}
        <div class="flex min-w-0 flex-col">
          <div
            class="flex min-w-0 flex-col gap-space-1 @kinds:flex-row @kinds:items-center @kinds:gap-space-2"
            data-kind={kind}
            data-slot="row"
          >
            <span class="type-label text-ink-row @kinds:w-18 @kinds:flex-none">
              {kindLabel}
            </span>

            <OptionGroup
              aria-label={words.waits.kindGroupLabel(kindLabel)}
              class="min-w-0 flex-1"
              {disabled}
              value={[rule.by]}
            >
              {#each DECIDERS as decider (decider)}
                {@const showFleet = rule.own && decider === rule.fleet}
                {@const showSpin =
                  rowPending &&
                  (pressed === decider ||
                    (pressed === undefined && rule.by === decider))}
                <OptionGroupItem
                  onclick={(event) => {
                    event.preventDefault();
                    pickDecider(kind, decider);
                  }}
                  value={decider}
                >
                  <span class="mark-line inline-flex items-center gap-space-1">
                    <span>{words.waits.deciders[decider]}</span>
                    {#if showFleet}
                      <Badge data-box kind="meta"
                        ><span>{words.waits.fleetMark}</span></Badge
                      >
                    {/if}
                    {#if showSpin}
                      <Spinner
                        aria-label={words.saving}
                        box="small"
                        class="flex-none"
                        tone="muted"
                      />
                    {/if}
                  </span>
                </OptionGroupItem>
              {/each}
            </OptionGroup>

            {#if rule.own}
              <Button
                aria-label={words.waits.resetKind(kindLabel)}
                class="self-start @kinds:self-center"
                {disabled}
                icon={IconReset}
                label={words.waits.reset}
                onclick={() => resetKind(kind)}
                pending={rowPending && pressed === "reset"}
                size="xs"
                tone="quiet"
                variant="ghost"
              />
            {/if}
          </div>

          <ControlRefusal
            {disabled}
            onretry={() => onretry(changeKey)}
            reason={refused[changeKey]}
          />
        </div>
      {/each}
    </div>
  {/if}

  <!-- Hairline divider + Review before done (the second half of "What waits for you"). -->
  <div
    class="mt-space-2 flex flex-col gap-space-1 border-t border-border-hairline pt-space-2"
  >
    <div
      class="flex min-w-0 flex-col gap-space-1 @setup:flex-row @setup:items-center @setup:justify-between @setup:gap-space-3"
    >
      <div
        class="flex min-w-0 flex-col @wide:flex-row @wide:items-baseline @wide:gap-space-2"
      >
        <span class="type-label text-ink-strong"
          >{words.waits.reviewHeading}</span
        >
        <span class="type-meta text-ink-muted">{words.waits.reviewNote}</span>
      </div>

      <OptionGroup
        aria-label={words.waits.reviewGroupLabel}
        class="min-w-0 max-w-full @setup:flex-none"
        {disabled}
        value={[record.reviewBeforeDone ? "on" : "off"]}
      >
        <ChoiceChip
          label={words.waits.reviewOn}
          onpick={() => pickReview(true)}
          sending={reviewPending &&
            (pressedReview === true ||
              (pressedReview === null && record.reviewBeforeDone))}
          value="on"
        />
        <ChoiceChip
          label={words.waits.reviewOff}
          onpick={() => pickReview(false)}
          sending={reviewPending &&
            (pressedReview === false ||
              (pressedReview === null && !record.reviewBeforeDone))}
          value="off"
        />
      </OptionGroup>
    </div>

    <ControlRefusal
      {disabled}
      onretry={() => onretry("review")}
      reason={refused.review}
    />
  </div>
</div>
