<script lang="ts">
  /**
   * A routine made by hand: what `POST /api/routines` takes, as Caw's own
   * `routine_create` sends it (routines-api `routineFormHub`), so the
   * routine is the same one: a delegate run each time, run once at once as
   * a test. It opens in the Routines block, over the ledger it lands in
   * (DESIGN.md, The Open Page Rule), and blocks nothing.
   *
   * Its fields, on Configure's editor parts (Field, Input, Textarea, the
   * kit NativeSelect): a name, what each run does, when (five cron fields
   * and the time zone they are read in), and the delegate type. The
   * schedule is read back by the hub's own cron as it is typed: its runs
   * drawn on the strip the ledger draws (ScheduleStrip), in words, and its
   * next run on your clock; a schedule the hub refuses says so in the
   * hub's words under When. A refused create keeps every word where it was
   * typed and says why over the commit row.
   *
   * The hub is a prop (`hub`), and so is the state it opens in (`draft`,
   * `saving`, `failure`), so its states file draws each state with no hub.
   */
  import { routinesWords as words } from "@cawco/core";
  import { untrack } from "svelte";
  import Field from "#lib/cawco/config/Field.svelte";
  import { failureWords } from "#lib/cawco/hub-read.js";
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
    /** What its fields hold when it opens. */
    draft?: Partial<RoutineDraft>;
    /** It opens with a create going (its states file). */
    saving?: boolean;
    /** It opens with a create refused, in these words (its states file). */
    failure?: string | null;
    /** Its name field takes the focus as it opens. */
    focus?: boolean;
  } = $props();

  /** The hub's limit on a name (hub work-items `SESSION_TITLE_MAX`). */
  const NAME_MAX = 48;
  /** How long typing rests before the schedule is read back. */
  const PREVIEW_SETTLE_MS = 250;

  let draft = $state<RoutineDraft>(
    untrack(() => ({
      name: "",
      prompt: "",
      cron: "",
      timeZone: readerZone(),
      delegateType: null,
      ...opening,
    }))
  );
  let saving = $state(untrack(() => openSaving));
  let failure = $state<string | null>(untrack(() => openFailure));
  /** Create was pressed: every blank field says what it needs. */
  let attempted = $state(false);
  let touched = $state<Record<"name" | "prompt" | "cron", boolean>>({
    name: false,
    prompt: false,
    cron: false,
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

  /** The hub's read of the schedule as it stands, or why it refused it. */
  let scheduleRead = $state<
    | { key: string; preview: SchedulePreview }
    | { key: string; problem: string }
    | null
  >(null);
  const cron = $derived(draft.cron.trim());
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
          if (live) {
            scheduleRead = { key, problem: failureWords(error) };
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

  /** The read-back: the strip's runs, its words (the ledger's, else the hub's), the next run. */
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
      words: said.raw ? preview.words : said.words,
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
  const cronProblem = $derived.by(() => {
    if (cron === "") {
      return shown("cron") ? words.needsWhen : undefined;
    }
    return current && "problem" in current ? current.problem : undefined;
  });
  const ready = $derived(
    draft.name.trim() !== "" &&
      draft.name.trim().length <= NAME_MAX &&
      draft.prompt.trim() !== "" &&
      cron !== "" &&
      !(current && "problem" in current)
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

  /** The first field that still needs something, for the focus. */
  let form = $state<HTMLFormElement | null>(null);

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
      oncreated(await hub.create(projectId, draft));
    } catch (error) {
      failure = words.createFailed(failureWords(error));
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

  <!-- When: the cron and the zone it is read in side by side where both
       hold, stacked under a field group's width; the hub's read-back under
       both, the strip the ledger draws. The fields' format is said until the
       hub reads the schedule back, which then says it better. -->
  <div data-slot="when" class="flex min-w-0 flex-col gap-space-2">
    <div class="grid min-w-0 gap-space-3 @field-group:grid-cols-2">
      <Field
        hint={readBack ? undefined : words.whenHint}
        id="routine-cron"
        label={words.whenLabel}
        problem={cronProblem}
      >
        <Input
          aria-invalid={cronProblem ? "true" : undefined}
          autocomplete="off"
          face="mono"
          id="routine-cron"
          onblur={() => {
            touched.cron = true;
          }}
          placeholder={words.whenPlaceholder}
          spellcheck="false"
          bind:value={draft.cron}
        />
      </Field>
      <Field id="routine-zone" label={words.zoneLabel}>
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
    {#if readBack && cronProblem === undefined}
      <div
        data-slot="read-back"
        class="flex min-w-0 flex-col gap-space-1"
        in:unfold
        out:unfold
      >
        {#if readBack.runs.length > 0}
          <ScheduleStrip label={readBack.words} {now} runs={readBack.runs} />
        {/if}
        <p class="m-0 type-meta text-pretty text-ink-muted">
          <span class="text-ink-strong">{readBack.words}</span>
          · <span class="num">{readBack.next}</span>
        </p>
      </div>
    {/if}
  </div>

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

  {#if failure}
    <p
      data-slot="form-failure"
      class="m-0 max-w-c-measure type-meta text-pretty wrap-anywhere text-status-fail-ink"
      role="alert"
      in:unfold
      out:unfold
    >
      {failure}
    </p>
  {/if}

  <!-- The commit row: what making it does at once, then Cancel and
       Create; the sentence takes its own line over the buttons when the
       three don't fit. -->
  <div
    data-slot="commit"
    class="flex min-w-0 flex-wrap items-center justify-end gap-x-space-3 gap-y-space-2"
  >
    <p
      class="m-0 min-w-0 flex-auto basis-c-measure-short type-meta text-pretty text-ink-muted"
    >
      {words.testRun}
    </p>
    <div class="flex flex-none gap-space-2">
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
