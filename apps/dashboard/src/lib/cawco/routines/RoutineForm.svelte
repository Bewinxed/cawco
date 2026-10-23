<script lang="ts">
  /**
   * A routine made by hand: what `POST /api/routines` takes, as Caw's own
   * `routine_create` sends it (routines-api `routineFormHub`), so the
   * routine is the same one: each run a delegate, or an orchestrator that
   * delegates the work, run once at once as a test. It opens in the Routines block, over the ledger it lands in
   * (DESIGN.md, The Open Page Rule), and blocks nothing.
   *
   * Its fields, on Configure's editor parts (Field, Input, Textarea, the
   * kit NativeSelect): a name, what each run does, when, what each run
   * starts (a delegate or an orchestrator), and the delegate type. When is a choice of common schedules, as a calendar's repeat
   * picker offers them (every hour; every day, every weekday or every week
   * on a day, at a time), or Custom, its five values typed (when.ts); each
   * writes the expression the API takes. The hub reads the schedule back as
   * it changes, by its own parser: the sentence right under When says it
   * on your clock with its next run, and the strip the ledger draws shows
   * its week. A custom schedule the hub can't read says so in the form's
   * own sentence; the hub's words are for agents. A refused create keeps
   * every word where it was written, and says why and what to do over the
   * commit row.
   *
   * The hub is a prop (`hub`), and so is the state it opens in (`draft`,
   * `saving`, `failure`), so its states file draws each state with no hub.
   */
  import { routinesWords as words } from "@cawco/core";
  import { untrack } from "svelte";
  import Field from "#lib/cawco/config/Field.svelte";
  import { failureWords, unreachable } from "#lib/cawco/hub-read.js";
  import { unfold } from "#lib/cawco/motion/fold.svelte.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { Input } from "#lib/components/ui/input/index.js";
  import {
    NativeSelect,
    NativeSelectOption,
  } from "#lib/components/ui/native-select/index.js";
  import { Textarea } from "#lib/components/ui/textarea/index.js";
  import {
    type Routine,
    type RoutineDraft,
    type RoutineFormHub,
    routineFormHub,
    type SchedulePreview,
    type TypeChoice,
  } from "./routines-api";
  import ScheduleStrip from "./ScheduleStrip.svelte";
  import { readerZone, scheduleOf, whenOf } from "./schedule";
  import {
    choiceOf,
    expressionOf,
    FIRST_WHEN,
    REPEATS,
    type Repeat,
    WEEK_DAYS,
    type When,
  } from "./when";

  let {
    projectId,
    oncreated,
    oncancel,
    hub = routineFormHub,
    draft: opening = {},
    saving: openSaving = false,
    failure: openFailure = null,
    focus = true,
  }: {
    projectId: string;
    /** The routine the hub made: the form goes, the ledger shows it. */
    oncreated: (routine: Routine) => void;
    oncancel: () => void;
    hub?: RoutineFormHub;
    /** What its fields hold when it opens; its `cron` opens as the choice that writes it. */
    draft?: Partial<RoutineDraft>;
    /** It opens with a create going (its states file). */
    saving?: boolean;
    /** It opens with a create refused, in these words (its states file). */
    failure?: string | null;
    /** Its name field takes the focus as it opens. */
    focus?: boolean;
  } = $props();

  /** What a run can start, in the order the form offers them. */
  const TARGETS = ["delegate", "orchestrator"] as const;

  /** The hub's limit on a name (hub work-items `SESSION_TITLE_MAX`). */
  const NAME_MAX = 48;
  /** How long typing rests before the schedule is read back. */
  const PREVIEW_SETTLE_MS = 250;

  let draft = $state(
    untrack(() => ({
      name: opening.name ?? "",
      prompt: opening.prompt ?? "",
      timeZone: opening.timeZone ?? readerZone(),
      delegateType: opening.delegateType ?? null,
      target: opening.target ?? "delegate",
    }))
  );
  let when = $state<When>(
    untrack(() => (opening.cron ? choiceOf(opening.cron) : { ...FIRST_WHEN }))
  );
  let saving = $state(untrack(() => openSaving));
  let failure = $state<string | null>(untrack(() => openFailure));
  /** Create was pressed: every blank field says what it needs. */
  let attempted = $state(false);
  let touched = $state<Record<"name" | "prompt" | "time" | "custom", boolean>>({
    name: false,
    prompt: false,
    time: false,
    custom: false,
  });

  // --- the project's delegate types -------------------------------------------

  let types = $state<TypeChoice[]>([]);
  let typesProblem = $state<string | null>(null);
  $effect(() => {
    const id = projectId;
    let live = true;
    hub.types(id).then(
      (catalog) => {
        if (live) {
          types = catalog;
          typesProblem = null;
        }
      },
      (error: unknown) => {
        if (live) {
          typesProblem = words.typesUnread(failureWords(error));
        }
      }
    );
    return () => {
      live = false;
    };
  });
  const chosenType = $derived(
    types.find((type) => type.name === draft.delegateType) ?? null
  );

  // --- the schedule, read back by the hub ---------------------------------------

  const cron = $derived(expressionOf(when));
  const custom = $derived(when.repeat === "custom");
  const timed = $derived(
    when.repeat === "day" ||
      when.repeat === "weekdays" ||
      when.repeat === "week"
  );

  /** The hub's read of the schedule as it stands, or that it can't read it. */
  let scheduleRead = $state<
    | { key: string; preview: SchedulePreview }
    | { key: string; unread: true }
    | null
  >(null);
  const scheduleKey = $derived(`${cron}\u0000${draft.timeZone}`);
  $effect(() => {
    const key = scheduleKey;
    const [expression, zone] = [cron, draft.timeZone];
    if (expression === "") {
      scheduleRead = null;
      return;
    }
    let live = true;
    const settle = setTimeout(() => {
      hub.preview(expression, zone).then(
        (answer) => {
          if (live) {
            scheduleRead = { key, preview: answer };
          }
        },
        (error: unknown) => {
          // A hub that didn't answer read nothing: Create checks it again.
          if (live) {
            scheduleRead = unreachable(error) ? null : { key, unread: true };
          }
        }
      );
    }, PREVIEW_SETTLE_MS);
    return () => {
      live = false;
      clearTimeout(settle);
    };
  });
  /** The read for what the fields hold now; an older one says nothing. */
  const current = $derived(
    scheduleRead?.key === scheduleKey ? scheduleRead : null
  );
  const preview = $derived(
    current && "preview" in current ? current.preview : null
  );
  const unread = $derived(current !== null && "unread" in current);

  /** The read-back: its words on your clock (the ledger's, else the hub's), its next run, the strip's runs. */
  const readBack = $derived.by(() => {
    if (!preview) {
      return null;
    }
    const [next] = preview.nextRuns;
    if (next === undefined) {
      return { runs: [], words: preview.words, next: words.noRunThisWeek };
    }
    const said = scheduleOf(cron, draft.timeZone, next);
    return {
      runs: preview.nextRuns,
      words: said.raw
        ? preview.words
        : [said.words, said.local].filter(Boolean).join(" · "),
      next: words.nextRunAt(whenOf(next)),
    };
  });
  /** The strip's now, taken with each read. */
  const now = $derived(preview ? Date.now() : 0);

  // --- what each field still needs ---------------------------------------------------

  const shown = (field: keyof typeof touched) => attempted || touched[field];
  const nameProblem = $derived.by(() => {
    const name = draft.name.trim();
    if (name.length > NAME_MAX) {
      return words.nameTooLong(name.length, NAME_MAX);
    }
    return name === "" && shown("name") ? words.needsName : undefined;
  });
  const promptProblem = $derived(
    draft.prompt.trim() === "" && shown("prompt")
      ? words.needsPrompt
      : undefined
  );
  const timeProblem = $derived(
    timed && cron === "" && shown("time") ? words.needsTime : undefined
  );
  const customProblem = $derived.by((): string | undefined => {
    if (!custom) {
      return;
    }
    if (cron === "") {
      return shown("custom") ? words.needsCustom : undefined;
    }
    return unread ? words.customUnread : undefined;
  });
  /** A common schedule is always readable: a refusal is its zone's. */
  const zoneProblem = $derived(
    unread && !custom ? words.zoneUnread : undefined
  );
  const ready = $derived(
    draft.name.trim() !== "" &&
      draft.name.trim().length <= NAME_MAX &&
      draft.prompt.trim() !== "" &&
      cron !== "" &&
      !unread
  );

  /** The zones a schedule may be read in, yours among them. */
  const zones = (() => {
    const all = new Set(Intl.supportedValuesOf("timeZone"));
    all.add(readerZone());
    return [...all].sort();
  })();

  let nameField = $state<HTMLInputElement | null>(null);
  $effect(() => {
    if (focus) {
      nameField?.focus();
    }
  });

  /** The form, for the first field that still needs something. */
  let form = $state<HTMLFormElement | null>(null);

  /** What a refused create says to do: try again, or the field to change. */
  function refusal(error: unknown): string {
    if (unreachable(error)) {
      return words.createFailed(failureWords(error), words.fixTryAgain);
    }
    const said = failureWords(error);
    const lower = said.toLowerCase();
    if (lower.includes("schedule") || lower.includes("time zone")) {
      return words.createFailed(words.scheduleUnread, words.fixWhen);
    }
    if (lower.includes("delegate type")) {
      return words.createFailed(said, words.fixType);
    }
    if (lower.startsWith("name")) {
      return words.createFailed(said, words.fixName);
    }
    if (lower.startsWith("prompt")) {
      return words.createFailed(said, words.fixPrompt);
    }
    return words.createFailed(said, words.fixTryAgain);
  }

  async function create(event: SubmitEvent) {
    event.preventDefault();
    attempted = true;
    if (!ready) {
      form?.querySelector<HTMLElement>("[aria-invalid='true']")?.focus();
      return;
    }
    if (saving) {
      return;
    }
    saving = true;
    failure = null;
    try {
      oncreated(await hub.create(projectId, { ...draft, cron }));
    } catch (error) {
      failure = refusal(error);
    } finally {
      saving = false;
    }
  }
</script>

<form
  bind:this={form}
  data-slot="routine-form"
  aria-label={words.newRoutine}
  class="@container flex w-full max-w-c-measure min-w-0 flex-col gap-space-4"
  novalidate
  onsubmit={create}
>
  <Field id="routine-name" label={words.nameLabel} problem={nameProblem}>
    <Input
      bind:ref={nameField}
      aria-invalid={nameProblem ? "true" : undefined}
      autocomplete="off"
      id="routine-name"
      onblur={() => {
        touched.name = true;
      }}
      placeholder={words.namePlaceholder}
      bind:value={draft.name}
    />
  </Field>

  <Field id="routine-prompt" label={words.promptLabel} problem={promptProblem}>
    <Textarea
      aria-invalid={promptProblem ? "true" : undefined}
      id="routine-prompt"
      onblur={() => {
        touched.prompt = true;
      }}
      placeholder={words.promptPlaceholder}
      rows={3}
      bind:value={draft.prompt}
    />
  </Field>

  <!-- When: its choice, then what that choice asks (the day, the time, or
       the custom schedule's five values), and the time zone it is read in,
       two to a row where they hold and one where they don't; right under
       them, the hub's read-back in words, then its week on the strip. -->
  <div data-slot="when" class="flex min-w-0 flex-col gap-space-2">
    <div class="grid min-w-0 gap-space-3 @field-group:grid-cols-2">
      <Field id="routine-repeat" label={words.whenLabel}>
        <NativeSelect
          id="routine-repeat"
          class="w-full"
          bind:value={
            () => when.repeat,
            (next: Repeat) => {
              when.repeat = next;
            }
          }
        >
          {#each REPEATS as repeat (repeat)}
            <NativeSelectOption value={repeat}
              >{words.repeats[repeat]}</NativeSelectOption
            >
          {/each}
        </NativeSelect>
      </Field>
      {#if when.repeat === "week"}
        <Field id="routine-day" label={words.dayLabel}>
          <NativeSelect
            id="routine-day"
            class="w-full"
            bind:value={
              () => String(when.day),
              (next: string) => {
                when.day = Number(next);
              }
            }
          >
            {#each WEEK_DAYS as day (day)}
              <NativeSelectOption value={String(day)}
                >{words.dayNames[day]}</NativeSelectOption
              >
            {/each}
          </NativeSelect>
        </Field>
      {/if}
      {#if timed}
        <Field id="routine-time" label={words.timeLabel} problem={timeProblem}>
          <Input
            aria-invalid={timeProblem ? "true" : undefined}
            id="routine-time"
            onblur={() => {
              touched.time = true;
            }}
            step={60}
            type="time"
            bind:value={when.time}
          />
        </Field>
      {/if}
      {#if custom}
        <div class="min-w-0 @field-group:col-span-2">
          <Field
            hint={words.customHint}
            id="routine-custom"
            label={words.customLabel}
            problem={customProblem}
          >
            <Input
              aria-invalid={customProblem ? "true" : undefined}
              autocomplete="off"
              face="mono"
              id="routine-custom"
              onblur={() => {
                touched.custom = true;
              }}
              placeholder={words.customPlaceholder}
              spellcheck="false"
              bind:value={when.custom}
            />
          </Field>
        </div>
      {/if}
      <Field id="routine-zone" label={words.zoneLabel} problem={zoneProblem}>
        <NativeSelect
          id="routine-zone"
          class="w-full"
          bind:value={draft.timeZone}
        >
          {#each zones as zone (zone)}
            <NativeSelectOption value={zone}>{zone}</NativeSelectOption>
          {/each}
        </NativeSelect>
      </Field>
    </div>
    {#if readBack}
      <div
        data-slot="read-back"
        class="flex min-w-0 flex-col gap-space-2"
        in:unfold
        out:unfold
      >
        <p class="m-0 type-body text-pretty text-ink-strong">
          {readBack.words} · <span class="num">{readBack.next}</span>
        </p>
        {#if readBack.runs.length > 0}
          <ScheduleStrip label={readBack.words} {now} runs={readBack.runs} />
        {/if}
      </div>
    {/if}
  </div>

  <Field
    hint={words.runsHint[draft.target]}
    id="routine-target"
    label={words.runsLabel}
  >
    <NativeSelect id="routine-target" class="w-full" bind:value={draft.target}>
      {#each TARGETS as target (target)}
        <NativeSelectOption value={target}
          >{words.runs[target]}</NativeSelectOption
        >
      {/each}
    </NativeSelect>
  </Field>

  <Field
    hint={typesProblem ?? chosenType?.description}
    id="routine-type"
    label={words.typeLabel}
  >
    <NativeSelect
      id="routine-type"
      class="w-full"
      bind:value={
        () => draft.delegateType ?? "",
        (next: string) => {
          draft.delegateType = next === "" ? null : next;
        }
      }
    >
      <NativeSelectOption value="">{words.typeHubPick}</NativeSelectOption>
      {#each types as type (type.name)}
        <NativeSelectOption value={type.name}>{type.name}</NativeSelectOption>
      {/each}
    </NativeSelect>
  </Field>

  <!-- The commit row: what creating it does at once, in plain words; why
       a create was refused and what to do; then Cancel and Create. -->
  <div data-slot="commit" class="flex min-w-0 flex-col gap-space-3">
    <p class="m-0 max-w-c-measure type-body text-pretty text-ink-row">
      {words.testRun}
    </p>
    {#if failure}
      <p
        data-slot="form-failure"
        class="m-0 max-w-c-measure type-body text-pretty wrap-anywhere text-status-fail-ink"
        role="alert"
        in:unfold
        out:unfold
      >
        {failure}
      </p>
    {/if}
    <div class="flex min-w-0 flex-wrap justify-end gap-space-2">
      <Button
        disabled={saving}
        onclick={oncancel}
        type="button"
        variant="outline">{words.cancel}</Button
      >
      <Button
        failed={failure !== null}
        label={words.createRoutine}
        pending={saving}
        pendingLabel={words.creating}
        type="submit"
      />
    </div>
  </div>
</form>
