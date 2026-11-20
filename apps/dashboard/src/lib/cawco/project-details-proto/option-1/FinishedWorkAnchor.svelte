<script lang="ts">
  /**
   * Finished work anchor on the Views strip (code projects only): states the
   * project's landing mode at zero clicks and opens its 4-chip glide-popover.
   * No header repeats the settled value; the settled chip stays selected until
   * the hub confirms a change.
   */
  import { LANDS_MODES, type LandsMode } from "@cawco/core/injected";
  import NsPopover from "#lib/cawco/spawn/NsPopover.svelte";
  import { chipVariants } from "#lib/components/ui/chip/index.js";
  import MorphText from "#lib/components/ui/morph-text/morph-text.svelte";
  import {
    OptionGroup,
    OptionGroupItem,
  } from "#lib/components/ui/option-group/index.js";
  import { Spinner } from "#lib/components/ui/spinner/index.js";
  import { IconChevronDown, IconGitRepo } from "#lib/icons.js";
  import { hubReading, isPending, landingLabel, refusalFor } from "./format";
  import HubAwayNote from "./HubAwayNote.svelte";
  import RefusalNote from "./RefusalNote.svelte";
  import type { SubjectProps } from "./records";
  import { words } from "./words";

  let { record, changes, onchange }: SubjectProps = $props();

  let open = $state(false);
  let lastAttempt = $state<LandsMode | null>(null);

  const { asOfTime, reachable, staleMeta } = $derived(hubReading(record));
  const label = $derived(landingLabel(record.project.lands));
  const pending = $derived(isPending(changes, "landing"));
  const refusal = $derived(refusalFor(changes, "landing"));

  function pick(mode: LandsMode) {
    if (!reachable || pending || mode === record.project.lands) {
      return;
    }
    lastAttempt = mode;
    onchange({ key: "landing", lands: mode });
  }

  function retry() {
    if (!reachable || pending) {
      return;
    }
    const mode = lastAttempt ?? record.project.lands;
    onchange({ key: "landing", lands: mode });
  }
</script>

<NsPopover
  id="project-finished-work"
  align="end"
  label={words.finishedWork.triggerAria(label, staleMeta)}
  onchange={(next) => {
    open = next;
  }}
  {open}
  triggerClass={chipVariants({ variant: "setting" })}
  width="var(--container-field-group)"
>
  {#snippet trigger()}
    <IconGitRepo aria-hidden="true" class="text-ink-muted" />
    <span data-slot="chip-label">
      <MorphText text={label} />
    </span>
    <IconChevronDown aria-hidden="true" data-slot="chevron" />
  {/snippet}

  <div class="grid gap-space-3 p-space-1">
    <HubAwayNote asOf={asOfTime} />

    <OptionGroup
      aria-label={words.finishedWork.groupLabel}
      disabled={!reachable || pending}
      layout="tiles"
      style="--tiles-cols: repeat(2, minmax(0, 1fr)); --tiles-cols-phone: repeat(1, minmax(0, 1fr))"
      bind:value={
        () => [record.project.lands],
        (next) => {
          const picked = LANDS_MODES.find((mode) => mode === next[0]);
          if (picked) {
            pick(picked);
          }
        }
      }
    >
      {#each LANDS_MODES as mode (mode)}
        {@const copy = words.finishedWork.modes[mode]}
        {@const spinning = pending && lastAttempt === mode}
        <OptionGroupItem value={mode}>
          <span class="mark-line flex w-full items-center gap-space-2">
            <span class="type-label font-medium text-ink-strong wrap-anywhere">
              {copy.name}
            </span>
            {#if spinning}
              <Spinner box="small" class="ms-auto shrink-0" tone="muted" />
            {/if}
          </span>
          <span
            class="mt-space-1 type-meta text-ink-muted text-pretty wrap-anywhere"
          >
            {copy.note}
          </span>
        </OptionGroupItem>
      {/each}
    </OptionGroup>

    {#if refusal}
      <RefusalNote
        disabled={!reachable || pending}
        onretry={retry}
        said={refusal}
      />
    {/if}

    <p class="m-0 type-meta text-ink-muted text-pretty">
      {words.finishedWork.footer}
    </p>
  </div>
</NsPopover>
