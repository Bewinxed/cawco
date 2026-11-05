<script lang="ts">
  /**
   * The agent's dials (its canvas spec's `dials`): the values it lets the
   * person tune on the drawing, one row each, every row read down the
   * graph's one grid, as the Animation face's rows are: the dial's name in
   * the leading column (`c-graph-move-name-w`, the move's names' column),
   * its control in the next, one field high, reaching the row's end; a
   * changed value gives its restore glyph a column at the end. Each dial is
   * a subgrid row, so a name stands close to its control and apart from the
   * next dial. A number (DialNumber, in the form the owner picks), a
   * colour (DialColour), a select (the kit's Select), a toggle (the kit's
   * Switch, at the controls' trailing edge), a line of words (the kit's
   * Input), an action (an outline button across the row). Dials the agent
   * puts under a heading stand under it, as the states stand under their
   * machine (the section head).
   *
   * The head's line stands at every moment, so no row moves as he turns
   * the first dial or resets the last: it says what becomes of his values
   * (the artifact keeps them as its doc's `dials`, which answer a component
   * he judges, so the hub sends them to the agent by itself once his
   * changes stand quiet: hub artifacts `sendAnswered`, `artifact_read`'s
   * `dials`; nothing here asks for Send), and once he turned anything it holds what the move's timing
   * holds, in the same place: As written | Yours (Yours counting the dials
   * he changed; As written draws the agent's values on the face, muted and
   * read only, and on the drawing, the line saying so) and Reset all, which
   * leaves Undo reset in its place until anything changes again.
   *
   * Narrower than `--container-timeline` (the phone's drawer, a room at
   * its least), each dial's name stands over its control, the control the
   * face's full width.
   */
  import { graphWords } from "@cawco/core/words/graph";
  import { Button } from "#lib/components/ui/button/index.js";
  import { Input } from "#lib/components/ui/input/index.js";
  import { sectionHeadVariants } from "#lib/components/ui/section-header/index.js";
  import * as Select from "#lib/components/ui/select/index.js";
  import { Switch } from "#lib/components/ui/switch/index.js";
  import { TooltipProvider } from "#lib/components/ui/tooltip/index.js";
  import Tip from "#lib/components/ui/tooltip/tip.svelte";
  import { IconReset } from "#lib/icons.js";
  import DialColour from "./DialColour.svelte";
  import DialNumber from "./DialNumber.svelte";
  import {
    changedOf,
    type DialValue,
    type DialValues,
    type GraphDial,
    rangeOf,
  } from "./dials";
  import { figureOf } from "./figures";
  import VersionSwitch from "./VersionSwitch.svelte";

  const words = graphWords;
  /** A figure and a unit written together ("36px", "1.5rem", "250 ms"). */
  const FIGURE_UNIT = /^(-?\d+(?:\.\d+)?)\s*([a-z%]+)$/iu;

  let {
    dials,
    written,
    values,
    version = "yours",
    undoable = false,
    numberForm = "pill",
    changedMark = "ink",
    sent = null,
    lang,
    onchange,
    onreset,
    onundo,
    onversion,
  }: {
    dials: readonly GraphDial[];
    /** Each dial's value as the agent wrote it (read off the drawing), by name. */
    written: DialValues;
    /** His values, by name: each dial he turned. */
    values: DialValues;
    /** The values on the face and on the drawing: his, or the agent's as written. */
    version?: "yours" | "written";
    /** Reset all was just pressed, and nothing has changed since: Undo reset stands. */
    undoable?: boolean;
    /** How a number dial is drawn (the owner's pick, tsk-193 and tsk-198). */
    numberForm?: "pill" | "field" | "slider";
    /**
     * How a changed value is marked (the owner's pick, graph-dials-questions
     * `changed-mark`): its words in the edit's ink beside the restore glyph
     * (`ink`, the system's edited tone), or its words as they are and the
     * restore glyph alone in the edit's ink (`glyph`).
     */
    changedMark?: "ink" | "glyph";
    /** The values the face shows went to the agent: when, and whether the hub sent them by itself or he did; null while they haven't gone since his last change. */
    sent?: { at: string; by: "hub" | "person" } | null;
    lang: string | undefined;
    onchange: (name: string, value: DialValue) => void;
    /** These dials back to as written; `all`: Reset all, which Undo reset takes back. */
    onreset: (names: string[], all: boolean) => void;
    onundo?: () => void;
    onversion: (version: "yours" | "written") => void;
  } = $props();

  const changed = $derived(changedOf(dials, written, values));
  const asWritten = $derived(version === "written" && changed.length > 0);
  /** What the face shows of a dial: his value, or as written in As written. */
  const shownOf = (dial: GraphDial): DialValue | undefined =>
    asWritten ? written[dial.name] : (values[dial.name] ?? written[dial.name]);
  const nameOf = (dial: GraphDial) => dial.label ?? dial.name;
  /** A select's option said as a figure and its unit, where it is one ("36px": "36" "px"), so every dial writes a unit one way; else the words as they are. */
  const splitUnit = (option: string): { figure: string; unit: string } => {
    const match = FIGURE_UNIT.exec(option.trim());
    return match
      ? { figure: match[1] ?? option, unit: match[2] ?? "" }
      : { figure: option, unit: "" };
  };
  /** A value said in words, for its restore glyph: a figure with its unit, a toggle on or off. */
  const said = (dial: GraphDial, value: DialValue | undefined): string => {
    if (typeof value === "number") {
      return `${figureOf(value, lang)}${dial.unit ? ` ${dial.unit}` : ""}`;
    }
    if (typeof value === "boolean") {
      return value ? words.dials.on : words.dials.off;
    }
    return String(value ?? "");
  };
  /** The dials in their headings' order: the first heading's, then the next's; dials under none first. */
  const sections = $derived.by(() => {
    const heads: (string | null)[] = [];
    for (const dial of dials) {
      const head = dial.group ?? null;
      if (!heads.includes(head)) {
        heads.push(head);
      }
    }
    return [
      ...heads.filter((head) => head === null),
      ...heads.filter((head) => head !== null),
    ].map((head) => ({
      head,
      dials: dials.filter((dial) => (dial.group ?? null) === head),
    }));
  });

  /** The head: its line of words, then its controls. */
  const HEAD_COLUMNS = "minmax(0, 1fr) auto";
  /**
   * The graph's one grid: the move's names' column, the control, and the
   * restore glyph's column held in every row, so no control changes width as
   * its value changes and every control ends on one edge.
   */
  const COLUMNS =
    "minmax(var(--c-graph-move-name-w), 38%) minmax(0, 1fr) var(--c-btn-h-xs)";
  /** Narrow: a name over its control (across the first two columns), a toggle's name and switch on one line, the restore glyph's column last. */
  const NARROW_COLUMNS = "minmax(0, 1fr) auto var(--c-btn-h-xs)";
  /** The time the values went, in the page's language: "14:32". */
  const timeOf = (at: string) =>
    new Intl.DateTimeFormat(lang, {
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(at));
  /** The head's words: read only in As written; else sent, or what will become of them. */
  const line = $derived.by(() => {
    if (asWritten) {
      return words.dials.readOnly;
    }
    if (sent) {
      return words.dials.sent(timeOf(sent.at));
    }
    return words.dials.reachAgent;
  });
  /** Presses of each action so far, by name: what its arg is set to. */
  let presses = $state<Record<string, number>>({});
</script>

{#snippet versions()}
  {#if changed.length > 0}
    <VersionSwitch
      changed={changed.length}
      label={words.dials.versions}
      {lang}
      {onversion}
      {version}
    />
    <Button
      aria-label={words.dials.resetAllSaid}
      data-slot="reset-all"
      onclick={() => onreset(changed, true)}
      size="sm"
      title={words.dials.resetAllSaid}
      variant="ghost">{words.resetAll}</Button
    >
  {:else if undoable}
    <Button data-slot="undo-reset" onclick={onundo} size="sm" variant="ghost"
      >{words.undoReset}</Button
    >
  {/if}
{/snippet}

<TooltipProvider>
  <div
    class="@container/dials flex min-h-0 min-w-0 flex-1 flex-col gap-space-3"
    data-slot="dials"
  >
    <!-- The head. On a desk one line held at every moment, so no row moves:
         what becomes of the values (sent, once they went), then once
         anything changed the two versions and Reset all, or Undo reset.
         Narrow, the head is the words alone, and the versions stand at the
         face's foot once anything changed: nothing in the head is ever
         empty, and nothing above the rows comes or goes. -->
    <header
      class="grid min-h-c-btn-h min-w-0 flex-none grid-cols-(--head) items-center gap-x-space-3 @max-timeline/dials:min-h-0 @max-timeline/dials:grid-cols-1"
      data-slot="dials-head"
      style:--head={HEAD_COLUMNS}
    >
      <p
        aria-live="polite"
        class="m-0 min-w-0 type-meta text-ink-muted text-pretty"
        data-slot="dials-line"
      >
        {line}
      </p>
      <div
        class="flex min-w-0 items-center justify-end gap-space-2 @max-timeline/dials:hidden"
      >
        {@render versions()}
      </div>
    </header>

    <!-- Its scroller clips: it stands a step out and pads the step back, so
         a focus ring on its edge is drawn whole (The One Ring Rule); under a
         finger its foot holds the last row's touch areas too (The 44 Touch
         Rule's `::after` reaches past a switch), so nothing scrolls short. -->
    <div
      class="kit-edge-fade-block -m-space-1 min-h-0 min-w-0 flex-1 overflow-y-auto p-space-1 coarse:pb-space-4"
      data-slot="dials-rows"
    >
      {#each sections as section (section.head)}
        <section
          aria-label={section.head ?? undefined}
          class="flex min-w-0 flex-col pb-space-5 last:pb-0"
        >
          {#if section.head}
            <h3 class={sectionHeadVariants({ class: "m-0 mb-space-2" })}>
              <span
                class="min-w-0 overflow-clip text-ellipsis whitespace-nowrap"
                >{section.head}</span
              >
            </h3>
          {/if}
          <!-- One grid for the section; each dial its own subgrid row, so a
               name stands close to its control (narrow, over it) and apart
               from the next dial. Every row holds the restore glyph's column,
               so no control changes width as its value changes. -->
          <div
            class="grid min-w-0 grid-cols-(--cols) gap-x-space-3 gap-y-space-3 @max-timeline/dials:grid-cols-(--narrow) @max-timeline/dials:gap-y-space-4"
            style:--cols={COLUMNS}
            style:--narrow={NARROW_COLUMNS}
          >
            {#each section.dials as dial (dial.name)}
              {@const value = shownOf(dial)}
              {@const edited = !asWritten && changed.includes(dial.name)}
              {@const inked = edited && changedMark === "ink"}
              {@const id = `dial-${dial.name}`}
              {@const toggle = dial.kind === "toggle"}
              <!-- mark-line: the restore glyph stands in its own column, centred on its control's field, never beside the name's words -->
              <div
                class="col-span-full grid min-w-0 grid-cols-subgrid items-start gap-y-space-1"
                data-dial-row={dial.name}
              >
                {#if dial.kind === "action"}
                  <!-- An action: its name is its button's, across the row. -->
                  <Button
                    class="col-span-2 justify-self-start"
                    disabled={asWritten}
                    onclick={() => {
                      const next = (presses[dial.name] ?? 0) + 1;
                      presses = { ...presses, [dial.name]: next };
                      onchange(dial.name, next);
                    }}
                    size="sm"
                    variant="outline">{nameOf(dial)}</Button
                  >
                {:else}
                  <!-- Its name centred on its control's field on a desk;
                       narrow, over it (a toggle's beside its switch, as the
                       view card's are). -->
                  <label
                    class={[
                      "flex min-h-c-input-h min-w-0 items-center type-label text-ink-row text-pretty wrap-anywhere",
                      !toggle &&
                        "@max-timeline/dials:col-span-full @max-timeline/dials:min-h-0",
                    ]}
                    for={id}>{nameOf(dial)}</label
                  >
                  <!-- Read only in As written, its value drawn as it is: the
                       agent's colour is the agent's. -->
                  <div
                    class={[
                      "flex min-h-c-input-h min-w-0 items-center",
                      toggle ? "justify-end" : "@max-timeline/dials:col-span-2",
                      asWritten && "pointer-events-none",
                    ]}
                    data-dial={dial.name}
                    inert={asWritten || undefined}
                  >
                    {#if dial.kind === "number"}
                      {@const start = Number(written[dial.name] ?? 0)}
                      <div class="min-w-0 flex-1" {id}>
                        <DialNumber
                          changed={inked}
                          {dial}
                          form={numberForm}
                          label={nameOf(dial)}
                          {lang}
                          onchange={(next) => onchange(dial.name, next)}
                          range={rangeOf(dial, start)}
                          value={Number(value ?? start)}
                        />
                      </div>
                    {:else if dial.kind === "color"}
                      <div class="min-w-0 flex-1" {id}>
                        <DialColour
                          changed={inked}
                          label={nameOf(dial)}
                          onchange={(next) => onchange(dial.name, next)}
                          value={String(value ?? "")}
                        />
                      </div>
                    {:else if dial.kind === "select"}
                      {@const shown = splitUnit(String(value ?? ""))}
                      <Select.Root
                        onValueChange={(next: string) =>
                          onchange(dial.name, next)}
                        type="single"
                        value={String(value ?? "")}
                      >
                        <Select.Trigger
                          aria-label={nameOf(dial)}
                          class="w-full min-w-0"
                          {id}
                          tone={inked ? "edited" : undefined}
                        >
                          <!-- Its value in the fields' own size, the 16px floor
                               a field takes on a phone and under a finger
                               (design.css), so every dial's value reads alike. -->
                          <span
                            class="min-w-0 truncate num max-phone:text-(length:--text-field-floor) coarse:text-(length:--text-field-floor)"
                            >{shown.figure}{#if shown.unit}<span
                                class="ms-space-1 text-ink-muted"
                                >{shown.unit}</span
                              >{/if}</span
                          >
                        </Select.Trigger>
                        <Select.Content>
                          {#each dial.options ?? [] as option (option)}
                            <Select.Item label={option} value={option} />
                          {/each}
                        </Select.Content>
                      </Select.Root>
                    {:else if toggle}
                      <Switch
                        checked={value === true}
                        {id}
                        onCheckedChange={(next: boolean) =>
                          onchange(dial.name, next)}
                      />
                    {:else}
                      <Input
                        {id}
                        onchange={(event: Event) =>
                          onchange(
                            dial.name,
                            (event.currentTarget as HTMLInputElement).value
                          )}
                        tone={inked ? "edited" : undefined}
                        value={String(value ?? "")}
                      />
                    {/if}
                  </div>
                  <!-- The restore glyph's column, held in every row, the glyph
                       centred on its control's field (never on a line under
                       it): a changed value's way back. -->
                  <span
                    class="flex h-c-input-h w-c-btn-h-xs items-center justify-center"
                  >
                    {#if edited}
                      {@const back = words.dials.reset(
                        nameOf(dial),
                        said(dial, written[dial.name])
                      )}
                      <Tip label={back}>
                        {#snippet children(tip)}
                          <Button
                            {...tip}
                            aria-label={back}
                            data-edited={dial.name}
                            icon={IconReset}
                            onclick={() => onreset([dial.name], false)}
                            press="pressable"
                            size="icon-xs"
                            tone={changedMark === "glyph"
                              ? "edited"
                              : undefined}
                            variant="ghost"
                          />
                        {/snippet}
                      </Tip>
                    {/if}
                  </span>
                {/if}
              </div>
            {/each}
          </div>
        </section>
      {/each}
    </div>
    {#if changed.length > 0 || undoable}
      <!-- Narrow, the versions stand at the face's foot. -->
      <div
        class="hidden min-w-0 flex-none items-center justify-between gap-space-2 border-t border-border-hairline pt-space-2 @max-timeline/dials:flex"
        data-slot="dials-foot"
      >
        {@render versions()}
      </div>
    {/if}
  </div>
</TooltipProvider>
