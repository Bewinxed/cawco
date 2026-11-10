<script lang="ts">
  /**
   * The agent's controls (its canvas spec's `dials`) and, under them, the
   * props of the state on the stage (the owner's pick, 2026-11-10: the
   * artifact panel's Inspect folds into Dials): the values the person tunes
   * on the drawing, read down one inspector grid as a tool's properties
   * panel is (Storybook's Controls, Framer's and Leva's panels): each
   * control one row (DialRow), its name in the leading column
   * (`c-graph-move-name-w`, the Animation face's names' column, so the two
   * faces read down one edge), its control in the next from one start edge,
   * one field high, and the undo glyph's column last, held in every row so
   * no control changes width as its value changes. Controls the agent puts
   * under a heading stand under it (the section head); the props stand
   * under the component's name, one more heading of the same grid, each as
   * the dial of its kind (prop-dials.ts).
   *
   * A changed value keeps its own ink: the undo glyph after it, in the
   * edit's ink, stands only while it differs from what it was (the agent's
   * value, a prop's saved one; the owner's pick, graph-dials-questions
   * `changed-mark`), and takes it back. Under the rows, once anything
   * changed, Reset all takes every value back and leaves Undo reset in its
   * place until anything changes again; once a prop differs from the saved
   * state, Save writes it into the state and Save as new state adds one
   * from it. The foot stands under the scroller, so a long list keeps it in
   * reach and no row moves as it comes and goes. His dial values are the
   * artifact's answer and go to the agent by themselves.
   *
   * Narrower than `--container-timeline` (the phone's drawer, a room at its
   * least) the name's column shares the row with its control, two to three.
   */
  import { graphWords } from "@cawco/core/words/graph";
  import { MediaQuery } from "svelte/reactivity";
  import { Button } from "#lib/components/ui/button/index.js";
  import { sectionHeadVariants } from "#lib/components/ui/section-header/index.js";
  import { TooltipProvider } from "#lib/components/ui/tooltip/index.js";
  import { IconReset } from "#lib/icons.js";
  import DialRow from "./DialRow.svelte";
  import {
    changedOf,
    type DialValue,
    type DialValues,
    type GraphDial,
  } from "./dials";

  const words = graphWords;

  /** The props of the state on the stage, as the face lists them. */
  interface StateProps {
    /** The component the state mounts: its name heads the props. */
    component: string;
    /** His values not saved yet, by name. */
    edits: DialValues;
    onchange: (name: string, value: DialValue) => void;
    /** These props back to as saved; `all`: Reset all, which Undo reset takes back. */
    onreset: (names: string[], all: boolean) => void;
    onsave: () => void;
    onsavenew: () => void;
    /** Its props, each as the dial of its kind (prop-dials.ts `propDials`). */
    props: readonly GraphDial[];
    /** Each prop's value as the state's file mounts it, by name. */
    saved: DialValues;
    /** Save, or Save as new state, under way. */
    saving?: "save" | "new" | null;
  }

  let {
    dials,
    written,
    values,
    state = null,
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
    /** The state's props, under the dials; none where the stage read none. */
    state?: StateProps | null;
    /** Reset all was just pressed, and nothing has changed since: Undo reset stands. */
    undoable?: boolean;
    /** The control whose layer stands open (a select's list, a colour's picker), by name (a prop's as `prop:<name>`); null while none is. */
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
  const propsChanged = $derived(
    state ? changedOf(state.props, state.saved, state.edits) : []
  );
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
  /** A layer's open and close, for the control named `key`. */
  const layerOf = (key: string) => (next: boolean) => {
    if (next) {
      open = key;
    } else if (open === key) {
      open = null;
    }
  };
  function resetAll() {
    if (changed.length > 0) {
      onreset(changed, true);
    }
    if (state && propsChanged.length > 0) {
      state.onreset(propsChanged, true);
    }
  }
</script>

{#snippet head(text: string)}
  <h3 class={sectionHeadVariants({ inset: "flush", class: "col-span-full" })}>
    <span class="min-w-0 overflow-clip text-ellipsis whitespace-nowrap"
      >{text}</span
    >
  </h3>
{/snippet}

<TooltipProvider>
  <div
    class="@container/dials flex min-h-0 min-w-0 flex-1 flex-col"
    data-slot="dials"
    style:--cols={COLUMNS}
    style:--narrow={NARROW_COLUMNS}
  >
    <!-- Its scroller clips: it stands a step out and pads the step back, so
         a focus ring on its edge is drawn whole (The One Ring Rule); under a
         finger its foot holds the last row's touch areas too (The 44 Touch
         Rule's `::after` reaches past a switch), so nothing scrolls short.
         It takes its rows' height, up to what the face has. -->
    <div
      class="kit-edge-fade-block -m-space-1 min-h-0 min-w-0 flex-initial overflow-y-auto p-space-1 scroll-timeline-transcript-head coarse:pb-space-4"
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
      >
        {#each sections as section (section.head)}
          <section
            aria-label={section.head ?? undefined}
            class="col-span-full grid min-w-0 grid-cols-subgrid gap-y-space-2"
          >
            {#if section.head}
              {@render head(section.head)}
            {/if}
            {#each section.dials as dial (dial.name)}
              {@const hand = held?.name === dial.name ? held : null}
              <DialRow
                {dial}
                edited={changed.includes(dial.name)}
                held={hand}
                {lang}
                onchange={(next) => onchange(dial.name, next)}
                onopenchange={layerOf(dial.name)}
                onreset={() => onreset([dial.name], false)}
                open={open === dial.name}
                phone={phone.current}
                value={values[dial.name] ?? written[dial.name]}
                was={written[dial.name]}
              />
            {/each}
          </section>
        {/each}
        {#if state && state.props.length > 0}
          {@const own = state}
          <section
            aria-label={own.component}
            class="col-span-full grid min-w-0 grid-cols-subgrid gap-y-space-2"
            data-slot="dials-props"
          >
            {@render head(own.component)}
            {#each own.props as prop (prop.name)}
              <DialRow
                dial={prop}
                edited={propsChanged.includes(prop.name)}
                idPrefix="prop"
                {lang}
                onchange={(next) => own.onchange(prop.name, next)}
                onopenchange={layerOf(`prop:${prop.name}`)}
                onreset={() => own.onreset([prop.name], false)}
                open={open === `prop:${prop.name}`}
                phone={phone.current}
                value={own.edits[prop.name] ?? own.saved[prop.name]}
                was={own.saved[prop.name]}
              />
            {/each}
          </section>
        {/if}
      </div>
    </div>
    {#if changed.length > 0 || propsChanged.length > 0 || undoable}
      <!-- Under the rows, on the grid's edges: the way back at the names'
           start, the state's saves at the controls' end. -->
      <div
        class="grid min-w-0 flex-none grid-cols-(--cols) justify-start gap-x-space-3 pt-space-3 @max-timeline/dials:grid-cols-(--narrow)"
        data-slot="dials-foot"
      >
        <div class="col-span-full flex min-w-0 items-center gap-space-1">
          {#if changed.length > 0 || propsChanged.length > 0}
            <Button
              aria-label={words.dials.resetAllSaid}
              class="-ms-space-2"
              data-slot="reset-all"
              icon={IconReset}
              label={words.resetAll}
              onclick={resetAll}
              size="sm"
              variant="ghost"
            />
          {:else}
            <Button
              class="-ms-space-3"
              data-slot="undo-reset"
              onclick={onundo}
              size="sm"
              variant="ghost">{words.undoReset}</Button
            >
          {/if}
          {#if state && propsChanged.length > 0}
            <Button
              class="ms-auto"
              data-slot="save-new"
              disabled={!!state.saving}
              label={words.dials.saveNew}
              onclick={state.onsavenew}
              pending={state.saving === "new"}
              pendingLabel={words.dials.saving}
              size="sm"
              variant="ghost"
            />
            <Button
              data-slot="save"
              disabled={!!state.saving}
              label={words.dials.save}
              onclick={state.onsave}
              pending={state.saving === "save"}
              pendingLabel={words.dials.saving}
              size="sm"
            />
          {/if}
        </div>
      </div>
    {/if}
  </div>
</TooltipProvider>
