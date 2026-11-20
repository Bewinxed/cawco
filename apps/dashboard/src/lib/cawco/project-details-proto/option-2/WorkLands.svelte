<script lang="ts">
  /**
   * Stage 4 ("Work lands", code projects only): the four landing options as
   * equal tiles in one row of four at @setup and wider, two columns at
   * @field-group, and one column below it, followed by the task-override and
   * CI/CD footer note.
   */
  import { OptionGroup } from "#lib/components/ui/option-group/index.js";
  import ChoiceTile from "./ChoiceTile.svelte";
  import ControlRefusal from "./ControlRefusal.svelte";
  import type { Change, ChangeKey } from "./changes";
  import type { HowItRunsRecord, Landing } from "./records";
  import { howItRunsWords as words } from "./words";

  let {
    record,
    pending,
    refused,
    onchange,
    onretry,
  }: {
    record: HowItRunsRecord;
    pending: ChangeKey[];
    refused: Partial<Record<ChangeKey, string>>;
    onchange: (change: Change) => void;
    onretry: (key: ChangeKey) => void;
  } = $props();

  const LANDINGS: readonly Landing[] = ["default", "branch", "pr", "nowhere"];

  let pressedLanding = $state<Landing | null>(null);

  const disabled = $derived(!record.hubReachable);
  const landingPending = $derived(pending.includes("landing"));

  function pickLanding(landing: Landing) {
    if (disabled || landing === record.landing) {
      return;
    }
    pressedLanding = landing;
    onchange({ key: "landing", value: landing });
  }
</script>

<div
  class="flex min-w-0 flex-col rounded-well border border-border-well bg-surface-well px-space-3 py-space-2 @setup:px-space-4"
  data-slot="well"
>
  <OptionGroup
    aria-label={words.lands.groupLabel}
    {disabled}
    layout="tiles"
    style="--tiles-cols: repeat(auto-fit, minmax(var(--spacing-c-decision-option-min), 1fr)); --tiles-cols-phone: minmax(0, 1fr)"
    value={[record.landing]}
  >
    {#each LANDINGS as landing (landing)}
      {@const info = words.lands.options[landing]}
      {@const showSpin =
        landingPending &&
        (pressedLanding === landing ||
          (pressedLanding === null && record.landing === landing))}
      <ChoiceTile
        name={info.name}
        note={info.note}
        onpick={() => pickLanding(landing)}
        sending={showSpin}
        value={landing}
      />
    {/each}
  </OptionGroup>

  <ControlRefusal
    {disabled}
    onretry={() => onretry("landing")}
    reason={refused.landing}
  />

  <p class="m-0 mt-space-1 type-meta text-ink-muted">
    {words.lands.footer}
  </p>
</div>
