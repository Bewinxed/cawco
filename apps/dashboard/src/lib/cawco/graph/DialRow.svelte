<script lang="ts">
  /**
   * One control of the Dials face, a subgrid row of its inspector grid
   * (Dials, DialsProps): its name in the leading column, its control from
   * the controls' start edge, and the undo glyph's column last, held in
   * every row. A changed value keeps its own ink: the undo glyph after it,
   * in the edit's ink, stands only while it differs from the value it was
   * (the agent's, or a state's saved prop), and the was-value under it, led
   * by the glyph that puts it back (the owner's pick, graph-dials-questions
   * `changed-mark`). On a phone a colour's picker unfolds under its row,
   * across the face, as a second item of the grid.
   */
  import { bringIntoView } from "@cawco/core/bring-into-view";
  import { graphWords } from "@cawco/core/words/graph";
  import { unfold } from "#lib/cawco/motion/fold.svelte.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { Input } from "#lib/components/ui/input/index.js";
  import * as Select from "#lib/components/ui/select/index.js";
  import { Switch } from "#lib/components/ui/switch/index.js";
  import Tip from "#lib/components/ui/tooltip/tip.svelte";
  import { IconReset } from "#lib/icons.js";
  import ColourPicker from "./ColourPicker.svelte";
  import DialColour from "./DialColour.svelte";
  import DialNumber from "./DialNumber.svelte";
  import { type DialValue, type GraphDial, rangeOf } from "./dials";
  import { figureOf } from "./figures";

  const words = graphWords;
  /** A figure and a unit written together ("36px", "1.5rem", "250 ms"). */
  const FIGURE_UNIT = /^(-?\d+(?:\.\d+)?)\s*([a-z%]+)$/iu;

  let {
    dial,
    value,
    was,
    edited,
    open = false,
    onopenchange,
    held = null,
    lang,
    phone,
    idPrefix = "dial",
    onchange,
    onreset,
  }: {
    dial: GraphDial;
    /** What the control shows: his value, else `was`. */
    value: DialValue | undefined;
    /** The value it was: the agent's as written, or the state's saved prop. */
    was: DialValue | undefined;
    /** It differs from `was`: the undo glyph and the was-value stand. */
    edited: boolean;
    /** Its layer (a select's list, a colour's picker) stands open. */
    open?: boolean;
    onopenchange: (open: boolean) => void;
    /** A number control under the hand: dragged across, or typed into with these words in it. */
    held?: { as: "dragging" } | { as: "typing"; text: string } | null;
    lang: string | undefined;
    /** Under the phone line: a colour's picker unfolds under the row. */
    phone: boolean;
    /** Its field's id's lead, so two lists on one face never share an id. */
    idPrefix?: string;
    onchange: (value: DialValue) => void;
    /** Back to `was`. */
    onreset: () => void;
  } = $props();

  const name = $derived(dial.label ?? dial.name);
  const id = $derived(`${idPrefix}-${dial.name}`);
  /** A select's option said as a figure and its unit, where it is one ("36px": "36" "px"), so every control writes a unit one way; else the words as they are. */
  const splitUnit = (option: string): { figure: string; unit: string } => {
    const match = FIGURE_UNIT.exec(option.trim());
    return match
      ? { figure: match[1] ?? option, unit: match[2] ?? "" }
      : { figure: option, unit: "" };
  };
  /** A value said in words, one form everywhere: a figure, a space and its unit ("10 px", a select's "36px" too), a toggle on or off, words as they are. */
  const said = (one: DialValue | undefined): string => {
    if (typeof one === "number") {
      return `${figureOf(one, lang)}${dial.unit ? ` ${dial.unit}` : ""}`;
    }
    if (typeof one === "boolean") {
      return one ? words.dials.on : words.dials.off;
    }
    const { figure, unit } = splitUnit(String(one ?? ""));
    return unit ? `${figure} ${unit}` : figure;
  };
  /** A figure's control writes its value at its end (a number, a select of figures); the was-value stands under it there. */
  const atEnd = $derived(
    dial.kind === "number" ||
      (dial.kind === "select" &&
        (dial.options ?? []).some((one) => splitUnit(one).unit !== ""))
  );
  /** Presses of an action so far: what its arg is set to. */
  let presses = $state(0);
  const layer = $derived({ open, onOpenChange: onopenchange });
</script>

<div
  class="col-span-full grid min-w-0 grid-cols-subgrid items-start"
  data-dial-row={dial.name}
>
  {#if dial.kind === "action"}
    <!-- An action: its name is its button's, from the controls' edge. -->
    <Button
      class="col-start-2 justify-self-start"
      onclick={() => {
        presses += 1;
        onchange(presses);
      }}
      size="sm"
      variant="outline">{name}</Button
    >
  {:else}
    <label
      class="flex min-h-c-input-h min-w-0 items-center type-label text-ink-row text-pretty wrap-anywhere"
      for={id}>{name}</label
    >
    <div
      class="flex min-h-c-input-h min-w-0 items-center"
      data-dial={dial.name}
    >
      {#if dial.kind === "number"}
        {@const start = Number(was ?? 0)}
        <div class="min-w-0 flex-1" {id}>
          <DialNumber
            {dial}
            dragging={held?.as === "dragging"}
            label={name}
            {lang}
            onchange={(next) => onchange(next)}
            range={rangeOf(dial, start)}
            typing={held?.as === "typing" ? held.text : null}
            value={Number(value ?? start)}
          />
        </div>
      {:else if dial.kind === "color"}
        <div class="min-w-0 flex-1" {id}>
          <DialColour
            inline={phone}
            label={name}
            onchange={(next) => onchange(next)}
            {...layer}
            value={String(value ?? "")}
            was={edited ? String(was ?? "") : null}
          />
        </div>
      {:else if dial.kind === "select"}
        {@const shown = splitUnit(String(value ?? ""))}
        <Select.Root
          onValueChange={(next: string) => onchange(next)}
          type="single"
          value={String(value ?? "")}
          {...layer}
        >
          <Select.Trigger
            align={shown.unit ? "end" : undefined}
            aria-label={name}
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
                  class="ms-space-1 text-ink-muted">{shown.unit}</span
                >{/if}</span
            >
          </Select.Trigger>
          <Select.Content>
            {#each dial.options ?? [] as option (option)}
              {@const shownOption = splitUnit(option)}
              <!-- Each option as the field writes it: its figure, its unit
                   muted; while his differs, the one it was marked by the
                   undo glyph that takes it back. -->
              <Select.Item label={option} value={option}>
                {#snippet children()}
                  {#if edited && option === was}
                    <IconReset
                      aria-hidden="true"
                      class="size-icon-sm text-ink-muted"
                    />
                    <span class="sr-only">{words.dials.agentsValue}</span>
                  {/if}
                  <!-- At the edge the trigger writes it at. -->
                  <span class={["num", shownOption.unit && "flex-1 text-end"]}
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
          onCheckedChange={(next: boolean) => onchange(next)}
        />
      {:else}
        <!-- A line of words; a prop typed with the design system's names
             offers them (a token's colour, size or font). -->
        <Input
          autocomplete="off"
          {id}
          list={dial.options?.length ? `${id}-names` : undefined}
          onchange={(event: Event) =>
            onchange((event.currentTarget as HTMLInputElement).value)}
          value={String(value ?? "")}
        />
        {#if dial.options?.length}
          <datalist id={`${id}-names`}>
            {#each dial.options as option (option)}
              <option value={option}></option>
            {/each}
          </datalist>
        {/if}
      {/if}
    </div>
    <!-- The undo glyph's column, held in every row: a changed
         value's way back, in the edit's ink. -->
    <span class="flex h-c-input-h w-c-btn-h-xs items-center justify-center">
      {#if edited}
        {@const wasSaid = said(was)}
        <Tip label={words.dials.resetTo(wasSaid)}>
          {#snippet children(tip)}
            <Button
              {...tip}
              aria-label={words.dials.resetSaid(name, wasSaid)}
              data-edited={dial.name}
              icon={IconReset}
              onclick={onreset}
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
      <!-- The value it was, written under his where his stands (a figure
           under a figure, at the field's end), led by the glyph that puts
           it back. Its words are the undo glyph's name, so a reader hears
           them once. -->
      <p
        aria-hidden="true"
        class={[
          "mark-line col-start-2 m-0 flex min-w-0 items-center gap-space-1 pt-space-1 type-meta text-ink-muted",
          atEnd && "justify-end",
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
        <span class="min-w-0 overflow-clip text-ellipsis whitespace-nowrap num"
          >{said(was)}</span
        >
      </p>
    {/if}
  {/if}
</div>
{#if phone && dial.kind === "color" && open}
  <!-- On a phone the picker unfolds under its row across the
       face, and is brought into view once it stands. -->
  <div
    class="col-span-full min-w-0 scroll-mb-space-5"
    data-vaul-no-drag
    onintroend={(event) => bringIntoView(event.currentTarget as HTMLElement)}
    transition:unfold
  >
    <ColourPicker
      onchange={(next) => onchange(next)}
      onclose={() => onopenchange(false)}
      value={String(value ?? "")}
      wide
    />
  </div>
{/if}
