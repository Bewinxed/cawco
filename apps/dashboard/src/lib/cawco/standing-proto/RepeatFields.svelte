<script lang="ts">
  /**
   * How a task repeats, as New task and a repeating task's Edit ask it:
   * Repeat (never, on a schedule, when something happens); on a schedule,
   * when, as the routine form asks it (when.ts, its words routines.ts), read
   * back in words with its next run; when something happens, which event;
   * and, for one that repeats, an optional Done when: left empty it keeps
   * running, written it stops once that is true.
   */
  import { routinesWords } from "@cawco/core/words/routines";
  import Field from "#lib/cawco/config/Field.svelte";
  import {
    REPEATS,
    type Repeat,
    WEEK_DAYS,
    type When,
  } from "#lib/cawco/routines/when.js";
  import { Input } from "#lib/components/ui/input/index.js";
  import MorphText from "#lib/components/ui/morph-text/morph-text.svelte";
  import {
    NativeSelect,
    NativeSelectOption,
  } from "#lib/components/ui/native-select/index.js";
  import { unfold } from "#lib/platform/motion/fold.svelte.js";
  import {
    dayName,
    EVENTS,
    REPEAT_KINDS,
    REPEAT_WORDS,
    type RepeatKind,
    readBackOf,
  } from "./repeat-draft";

  let {
    id,
    kind = $bindable(),
    when = $bindable(),
    happens = $bindable(),
    doneWhen = $bindable(),
    never = true,
  }: {
    /** What its fields' ids start with. */
    id: string;
    kind: RepeatKind;
    when: When;
    /** The event that starts each run. */
    happens: string;
    doneWhen: string;
    /** Never is offered: a new task's; a repeating task's Edit leaves it out. */
    never?: boolean;
  } = $props();

  const dayOf = () => String(when.day);
  const setDay = (next: string) => {
    when.day = Number(next);
  };

  /** Its schedule choices, as the routine form's When offers them, but a custom schedule's: Caw writes those. */
  const SCHEDULES = REPEATS.filter((each) => each !== "custom");
  const KINDS = $derived(
    REPEAT_KINDS.filter((each) => never || each !== "never")
  );
</script>

<div class="flex min-w-0 flex-col gap-space-3" data-slot="repeat-fields">
  <Field id="{id}-repeat" label="Repeat">
    <NativeSelect id="{id}-repeat" class="w-full" bind:value={kind}>
      {#each KINDS as each (each)}
        <NativeSelectOption value={each}
          >{REPEAT_WORDS[each]}</NativeSelectOption
        >
      {/each}
    </NativeSelect>
  </Field>

  {#if kind === "schedule"}
    <div
      class="flex min-w-0 flex-col gap-space-2"
      data-slot="schedule"
      in:unfold
      out:unfold
    >
      <div class="grid min-w-0 grid-cols-2 gap-space-2">
        <div class="col-span-2">
          <Field id="{id}-when" label={routinesWords.whenLabel}>
            <NativeSelect
              id="{id}-when"
              class="w-full"
              bind:value={
                () => when.repeat,
                (next: Repeat) => {
                  when.repeat = next;
                }
              }
            >
              {#each SCHEDULES as each (each)}
                <NativeSelectOption value={each}
                  >{routinesWords.repeats[each]}</NativeSelectOption
                >
              {/each}
            </NativeSelect>
          </Field>
        </div>
        {#if when.repeat !== "hour"}
          <Field id="{id}-time" label={routinesWords.timeLabel}>
            <Input
              id="{id}-time"
              step={60}
              type="time"
              bind:value={when.time}
            />
          </Field>
        {/if}
        {#if when.repeat === "week"}
          <div>
            <Field id="{id}-day" label={routinesWords.dayLabel}>
              <NativeSelect
                id="{id}-day"
                class="w-full"
                bind:value={dayOf, setDay}
              >
                {#each WEEK_DAYS as day (day)}
                  <NativeSelectOption value={String(day)}
                    >{dayName(day)}</NativeSelectOption
                  >
                {/each}
              </NativeSelect>
            </Field>
          </div>
        {/if}
      </div>
      <!-- The schedule read back in words, changing in place (The Steady Swap Rule). -->
      <p
        class="num m-0 type-meta text-pretty text-ink-strong"
        data-slot="read-back"
      >
        <MorphText text={readBackOf(when)} wrap />
      </p>
    </div>
  {:else if kind === "event"}
    <div in:unfold out:unfold>
      <Field id="{id}-event" label="When">
        <NativeSelect id="{id}-event" class="w-full" bind:value={happens}>
          {#each EVENTS as each (each)}
            <NativeSelectOption value={each}>{each}</NativeSelectOption>
          {/each}
        </NativeSelect>
      </Field>
    </div>
  {/if}

  {#if kind !== "never"}
    <div in:unfold out:unfold>
      <Field
        hint={doneWhen.trim()
          ? "It stops repeating once this is true."
          : "Leave it empty and it keeps running."}
        id="{id}-done-when"
        label="Done when (optional)"
      >
        <Input
          autocomplete="off"
          id="{id}-done-when"
          placeholder="Staging answers its health check"
          bind:value={doneWhen}
        />
      </Field>
    </div>
  {/if}
</div>
