<script lang="ts">
  /**
   * The agent's controls (its canvas spec's `dials`): the values it lets the
   * person tune on the drawing, read down one inspector grid as a tool's
   * properties panel is (Storybook's Controls, Framer's and Leva's panels):
   * each control one row, its name in the leading column
   * (`c-graph-move-name-w`, the Animation face's names' column, so the two
   * faces read down one edge), its control in the next from one start edge,
   * one field high, and the undo glyph's column last, held in every row so
   * no control changes width as its value changes. Controls the agent puts
   * under a heading stand under it (the section head). A number is a field
   * with its fill (DialNumber), a colour a swatch and its words with a
   * maintained picker (DialColour), a select the kit's Select, a toggle the
   * kit's Switch at the controls' start edge beside its name, a line of
   * words the kit's Input, an action an outline button.
   *
   * A changed value keeps its own ink: the undo glyph after it, in the
   * edit's ink, stands only while it differs from the agent's (the owner's
   * pick, graph-dials-questions `changed-mark`), and takes it back. Under
   * the rows, once anything changed, Reset all takes every value back and
   * leaves Undo reset in its place until anything changes again: what comes
   * and goes stands after the rows, so no row moves. His values are the
   * artifact's answer and go to the agent by themselves.
   *
   * Narrower than `--container-timeline` (the phone's drawer, a room at its
   * least) the name's column shares the row with its control, two to three.
   */
  import { bringIntoView } from "@cawco/core/bring-into-view";
  import { graphWords } from "@cawco/core/words/graph";
  import { MediaQuery } from "svelte/reactivity";
  import { Button } from "#lib/components/ui/button/index.js";
  import { Input } from "#lib/components/ui/input/index.js";
  import { sectionHeadVariants } from "#lib/components/ui/section-header/index.js";
  import * as Select from "#lib/components/ui/select/index.js";
  import { Switch } from "#lib/components/ui/switch/index.js";
  import { TooltipProvider } from "#lib/components/ui/tooltip/index.js";
  import Tip from "#lib/components/ui/tooltip/tip.svelte";
  import { IconReset } from "#lib/icons.js";
  import { unfold } from "#lib/platform/motion/fold.svelte.js";
  import ColourPicker from "./ColourPicker.svelte";
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

  const words = graphWords;
  /** A figure and a unit written together ("36px", "1.5rem", "250 ms"). */
  const FIGURE_UNIT = /^(-?\d+(?:\.\d+)?)\s*([a-z%]+)$/iu;

  let {
    dials,
    written,
    values,
    undoable = false,
    open = $bindable(null),
    held = null,
    lang,
    onchange,
    onreset,
    onundo,
  }: {
    dials: readonly GraphDial[];
    /** Each control's value as the agent wrote it (read off the drawing), by name. */
    written: DialValues;
    /** His values, by name: each control he turned. */
    values: DialValues;
    /** Reset all was just pressed, and nothing has changed since: Undo reset stands. */
    undoable?: boolean;
    /** The control whose layer stands open (a select's list, a colour's picker), by name; null while none is. */
    open?: string | null;
    /** A number control held under the hand, by name: dragged across, or typed into with these words in it. */
    held?:
      | { name: string; as: "dragging" }
      | { name: string; as: "typing"; text: string }
      | null;
    lang: string | undefined;
    onchange: (name: string, value: DialValue) => void;
    /** These controls back to as written; `all`: Reset all, which Undo reset takes back. */
    onreset: (names: string[], all: boolean) => void;
    onundo?: () => void;
  } = $props();

  const changed = $derived(changedOf(dials, written, values));
  /** What the face shows of a control: his value, else as written. */
  const shownOf = (dial: GraphDial): DialValue | undefined =>
    values[dial.name] ?? written[dial.name];
  const nameOf = (dial: GraphDial) => dial.label ?? dial.name;
  /** A select's option said as a figure and its unit, where it is one ("36px": "36" "px"), so every control writes a unit one way; else the words as they are. */
  const splitUnit = (option: string): { figure: string; unit: string } => {
    const match = FIGURE_UNIT.exec(option.trim());
    return match
      ? { figure: match[1] ?? option, unit: match[2] ?? "" }
      : { figure: option, unit: "" };
  };
  /** A value said in words, one form everywhere: a figure, a space and its unit ("10 px", a select's "36px" too), a toggle on or off, words as they are. */
  const said = (dial: GraphDial, value: DialValue | undefined): string => {
    if (typeof value === "number") {
      return `${figureOf(value, lang)}${dial.unit ? ` ${dial.unit}` : ""}`;
    }
    if (typeof value === "boolean") {
      return value ? words.dials.on : words.dials.off;
    }
    const { figure, unit } = splitUnit(String(value ?? ""));
    return unit ? `${figure} ${unit}` : figure;
  };
  /** A figure's control writes its value at its end (a number, a select of figures); the agent's stands under it there. */
  const atEnd = (dial: GraphDial): boolean =>
    dial.kind === "number" ||
    (dial.kind === "select" &&
      (dial.options ?? []).some((one) => splitUnit(one).unit !== ""));
  /** Under the phone line a colour's picker unfolds under its row, across the face. */
  const phone = new MediaQuery("(width < 640px)");
  /** The controls in their headings' order: those under none first, then each heading's. */
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

  /**
   * The inspector grid: the Animation face's names' column, the control
   * (`c-graph-control-w` at most, the grid standing at the face's start, so
   * on a wide room the undo glyph stays beside what it marks), and the undo
   * glyph's column held in every row, so every control starts on one edge
   * and ends on another.
   */
  const COLUMNS =
    "minmax(0, var(--c-graph-move-name-w)) minmax(0, var(--c-graph-control-w)) var(--c-btn-h-xs)";
  /** Narrow: the name takes what it needs up to two fifths, its control the rest. */
  const NARROW_COLUMNS =
    "fit-content(40%) minmax(0, var(--c-graph-control-w)) var(--c-btn-h-xs)";
  /** Presses of each action so far, by name: what its arg is set to. */
  let presses = $state<Record<string, number>>({});
  const layer = (name: string) => ({
    open: open === name,
    onOpenChange: (next: boolean) => {
      if (next) {
        open = name;
      } else if (open === name) {
        open = null;
      }
    },
  });
</script>

<TooltipProvider>
  <div
    class="@container/dials flex min-h-0 min-w-0 flex-1 flex-col"
    data-slot="dials"
  >
    <!-- Its scroller clips: it stands a step out and pads the step back, so
         a focus ring on its edge is drawn whole (The One Ring Rule); under a
         finger its foot holds the last row's touch areas too (The 44 Touch
         Rule's `::after` reaches past a switch), so nothing scrolls short. -->
    <div
      class="kit-edge-fade-block -m-space-1 min-h-0 min-w-0 flex-1 overflow-y-auto p-space-1 scroll-timeline-transcript-head coarse:pb-space-4"
      data-slot="dials-rows"
    >
      <!-- One grid for every section, so each control starts on one edge
           whatever its heading; each section a subgrid of it, each control
           its own subgrid row, its name beside it, rows a step apart as a
           panel's are. -->
      <!-- Under a floating head the rows clear it at rest (`--face-top`). -->
      <div aria-hidden="true" class="h-(--face-top,0px)"></div>
      <div
        class="grid min-w-0 grid-cols-(--cols) justify-start gap-x-space-3 gap-y-space-5 @max-timeline/dials:grid-cols-(--narrow)"
        data-slot="dials-grid"
        style:--cols={COLUMNS}
        style:--narrow={NARROW_COLUMNS}
      >
        {#each sections as section (section.head)}
          <section
            aria-label={section.head ?? undefined}
            class="col-span-full grid min-w-0 grid-cols-subgrid gap-y-space-2"
          >
            {#if section.head}
              <h3
                class={sectionHeadVariants({
                  inset: "flush",
                  class: "col-span-full",
                })}
              >
                <span
                  class="min-w-0 overflow-clip text-ellipsis whitespace-nowrap"
                  >{section.head}</span
                >
              </h3>
            {/if}
            {#each section.dials as dial (dial.name)}
              {@const value = shownOf(dial)}
              {@const edited = changed.includes(dial.name)}
              {@const id = `dial-${dial.name}`}
              <div
                class="col-span-full grid min-w-0 grid-cols-subgrid items-start"
                data-dial-row={dial.name}
              >
                {#if dial.kind === "action"}
                  <!-- An action: its name is its button's, from the controls' edge. -->
                  <Button
                    class="col-start-2 justify-self-start"
                    onclick={() => {
                      const next = (presses[dial.name] ?? 0) + 1;
                      presses = { ...presses, [dial.name]: next };
                      onchange(dial.name, next);
                    }}
                    size="sm"
                    variant="outline">{nameOf(dial)}</Button
                  >
                {:else}
                  <label
                    class="flex min-h-c-input-h min-w-0 items-center type-label text-ink-row text-pretty wrap-anywhere"
                    for={id}>{nameOf(dial)}</label
                  >
                  <div
                    class="flex min-h-c-input-h min-w-0 items-center"
                    data-dial={dial.name}
                  >
                    {#if dial.kind === "number"}
                      {@const start = Number(written[dial.name] ?? 0)}
                      {@const hand = held?.name === dial.name ? held : null}
                      <div class="min-w-0 flex-1" {id}>
                        <DialNumber
                          {dial}
                          dragging={hand?.as === "dragging"}
                          label={nameOf(dial)}
                          {lang}
                          onchange={(next) => onchange(dial.name, next)}
                          range={rangeOf(dial, start)}
                          typing={hand?.as === "typing" ? hand.text : null}
                          value={Number(value ?? start)}
                        />
                      </div>
                    {:else if dial.kind === "color"}
                      <div class="min-w-0 flex-1" {id}>
                        <DialColour
                          inline={phone.current}
                          label={nameOf(dial)}
                          onchange={(next) => onchange(dial.name, next)}
                          {...layer(dial.name)}
                          value={String(value ?? "")}
                          was={edited ? String(written[dial.name] ?? "") : null}
                        />
                      </div>
                    {:else if dial.kind === "select"}
                      {@const shown = splitUnit(String(value ?? ""))}
                      <Select.Root
                        onValueChange={(next: string) =>
                          onchange(dial.name, next)}
                        type="single"
                        value={String(value ?? "")}
                        {...layer(dial.name)}
                      >
                        <Select.Trigger
                          align={shown.unit ? "end" : undefined}
                          aria-label={nameOf(dial)}
                          class="w-full min-w-0"
                          {id}
                        >
                          <!-- Its value in the fields' own size, the 16px floor
                               a field takes on a phone and under a finger
                               (design.css), so every control's value reads alike;
                               a figure at the field's end, as a number's is. -->
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
                            {@const shownOption = splitUnit(option)}
                            <!-- Each option as the field writes it: its figure, its unit
                                 muted; while his differs, the agent's marked by the undo
                                 glyph that takes it back. -->
                            <Select.Item label={option} value={option}>
                              {#snippet children()}
                                {#if edited && option === written[dial.name]}
                                  <IconReset
                                    aria-hidden="true"
                                    class="size-icon-sm text-ink-muted"
                                  />
                                  <span class="sr-only"
                                    >{words.dials.agentsValue}</span
                                  >
                                {/if}
                                <!-- At the edge the trigger writes it at. -->
                                <span
                                  class={[
                                    "num",
                                    shownOption.unit && "flex-1 text-end",
                                  ]}
                                  >{shownOption.figure}{#if shownOption.unit}<span
                                      class="ms-space-1 text-ink-muted"
                                      >{shownOption.unit}</span
                                    >{/if}</span
                                >
                              {/snippet}
                            </Select.Item>
                          {/each}
                        </Select.Content>
                      </Select.Root>
                    {:else if dial.kind === "toggle"}
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
                        value={String(value ?? "")}
                      />
                    {/if}
                  </div>
                  <!-- The undo glyph's column, held in every row: a changed
                       value's way back, in the edit's ink. -->
                  <span
                    class="flex h-c-input-h w-c-btn-h-xs items-center justify-center"
                  >
                    {#if edited}
                      {@const was = said(dial, written[dial.name])}
                      <Tip label={words.dials.resetTo(was)}>
                        {#snippet children(tip)}
                          <Button
                            {...tip}
                            aria-label={words.dials.resetSaid(
                              nameOf(dial),
                              was
                            )}
                            data-edited={dial.name}
                            icon={IconReset}
                            onclick={() => onreset([dial.name], false)}
                            press="pressable"
                            size="icon-xs"
                            tone="edited"
                            variant="ghost"
                          />
                        {/snippet}
                      </Tip>
                    {/if}
                  </span>
                  {#if edited}
                    <!-- The agent's value, written under his where his
                         stands (a figure under a figure, at the field's end),
                         led by the glyph that puts it back. Its words are the
                         undo glyph's name, so a reader hears them once. -->
                    {@const was = written[dial.name]}
                    <p
                      aria-hidden="true"
                      class={[
                        "mark-line col-start-2 m-0 flex min-w-0 items-center gap-space-1 pt-space-1 type-meta text-ink-muted",
                        atEnd(dial) && "justify-end",
                      ]}
                      data-slot="dial-was"
                    >
                      <IconReset class="size-icon-sm flex-none" data-box />
                      {#if dial.kind === "color"}
                        <span
                          data-box
                          class="checker block size-space-3 flex-none overflow-clip rounded-hair border border-border-control"
                          ><span
                            class="block size-full bg-(--was)"
                            style:--was={String(was ?? "")}
                          ></span></span
                        >
                      {/if}
                      <span
                        class="min-w-0 overflow-clip text-ellipsis whitespace-nowrap num"
                        >{said(dial, was)}</span
                      >
                    </p>
                  {/if}
                {/if}
              </div>
              {#if phone.current && dial.kind === "color" && open === dial.name}
                <!-- On a phone the picker unfolds under its row across the
                     face, and is brought into view once it stands. -->
                <div
                  class="col-span-full min-w-0 scroll-mb-space-5"
                  data-vaul-no-drag
                  onintroend={(event) =>
                    bringIntoView(event.currentTarget as HTMLElement)}
                  transition:unfold
                >
                  <ColourPicker
                    onchange={(next) => onchange(dial.name, next)}
                    onclose={() => {
                      open = null;
                    }}
                    value={String(value ?? "")}
                    wide
                  />
                </div>
              {/if}
            {/each}
          </section>
        {/each}
        {#if changed.length > 0 || undoable}
          <!-- After the rows, at the controls' end, so nothing above it moves
             as it comes and goes. -->
          <div
            class="col-span-2 col-start-2 flex min-w-0 justify-end"
            data-slot="dials-foot"
          >
            {#if changed.length > 0}
              <Button
                aria-label={words.dials.resetAllSaid}
                data-slot="reset-all"
                icon={IconReset}
                label={words.resetAll}
                onclick={() => onreset(changed, true)}
                size="sm"
                variant="ghost"
              />
            {:else}
              <Button
                data-slot="undo-reset"
                onclick={onundo}
                size="sm"
                variant="ghost">{words.undoReset}</Button
              >
            {/if}
          </div>
        {/if}
      </div>
    </div>
  </div>
</TooltipProvider>
