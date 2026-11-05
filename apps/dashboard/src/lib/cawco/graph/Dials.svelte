<script lang="ts">
  /**
   * The agent's dials (its canvas spec's `dials`): the values it lets the
   * person tune on the drawing, one row each, every row read down the
   * graph's one grid, as the Animation face's rows are: the dial's name in
   * the leading column (`c-graph-move-name-w`, the move's names' column),
   * its control in the next, one field high, and a changed value's restore
   * glyph in a column of its own at the end, so every control starts and
   * ends on one edge. A number (DialNumber, in the form the owner picks), a
   * colour (DialColour), a select (the kit's Select), a toggle (the kit's
   * Switch, at the controls' trailing edge), a line of words (the kit's
   * Input), an action (an outline button across the row). Dials the agent
   * puts under a heading stand under it, as the states stand under their
   * machine (the section head).
   *
   * Once he turned anything, the head holds what the move's timing holds,
   * in the same place: As written | Yours (Yours counting the dials he
   * changed; As written draws the agent's values, read-only), Copy values
   * (the values as set, with what the agent is to do with them, for a
   * chat or a file), and Reset all, which leaves Undo reset in its place
   * until anything changes again.
   *
   * Narrower than `--container-timeline` (the phone's drawer, a room at
   * its least), each dial's name stands over its control, the control the
   * face's full width.
   */
  import { graphWords } from "@cawco/core/words/graph";
  import { Button } from "#lib/components/ui/button/index.js";
  import { CopyButton } from "#lib/components/ui/copy-button/index.js";
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
    valuesAsSet,
  } from "./dials";
  import { figureOf } from "./figures";
  import VersionSwitch from "./VersionSwitch.svelte";

  const words = graphWords;

  let {
    dials,
    written,
    values,
    version = "yours",
    undoable = false,
    numberForm = "field",
    component,
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
    numberForm?: "field" | "slider";
    /** The component's name, for what Copy writes. */
    component: string;
    lang: string | undefined;
    onchange: (name: string, value: DialValue) => void;
    /** These dials back to as written. */
    onreset: (names: string[]) => void;
    onundo?: () => void;
    onversion: (version: "yours" | "written") => void;
  } = $props();

  const changed = $derived(changedOf(dials, written, values));
  const asWritten = $derived(version === "written" && changed.length > 0);
  /** What the face shows of a dial: his value, or as written in As written. */
  const shownOf = (dial: GraphDial): DialValue | undefined =>
    asWritten ? written[dial.name] : (values[dial.name] ?? written[dial.name]);
  const nameOf = (dial: GraphDial) => dial.label ?? dial.name;
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

  /** What Copy values writes: the values as set, then what the agent is to do with them. */
  const copied = $derived(
    words.dials.copiedText(
      component,
      JSON.stringify(valuesAsSet(dials, written, values), null, 2)
    )
  );
  /** The graph's one grid: the move's names' column, the control, the restore glyph's column. */
  const COLUMNS =
    "minmax(var(--c-graph-move-name-w), 38%) minmax(0, 1fr) var(--c-btn-h-xs)";
  /** Narrow: the name over its control, the control and its restore glyph on one line. */
  const NARROW_COLUMNS = "minmax(0, 1fr) var(--c-btn-h-xs)";
  /** Presses of each action so far, by name: what its arg is set to. */
  let presses = $state<Record<string, number>>({});
</script>

<TooltipProvider>
  <div
    class="@container/dials flex min-h-0 min-w-0 flex-1 flex-col gap-space-3"
    data-slot="dials"
  >
    {#if changed.length > 0 || undoable}
      <!-- The head: what the move's timing holds once changed, in the same
           place, one line of one height. -->
      <header
        class="flex h-c-btn-h min-w-0 flex-none items-center justify-end gap-x-space-2"
        data-slot="dials-head"
      >
        {#if changed.length === 0}
          <Button
            data-slot="undo-reset"
            onclick={onundo}
            size="sm"
            variant="ghost">{words.undoReset}</Button
          >
        {:else}
          <VersionSwitch
            changed={changed.length}
            label={words.dials.versions}
            {lang}
            {onversion}
            {version}
          />
          <Tip label={words.dials.copy}>
            {#snippet children(tip)}
              <CopyButton
                {...tip}
                aria-label={words.dials.copy}
                data-slot="copy-values"
                size="icon-sm"
                text={copied}
              />
            {/snippet}
          </Tip>
          <Tip label={words.dials.resetAllSaid}>
            {#snippet children(tip)}
              <Button
                {...tip}
                aria-label={words.dials.resetAllSaid}
                data-slot="reset-all"
                onclick={() => onreset(changed)}
                size="sm"
                variant="ghost"
              >
                <IconReset
                  aria-hidden="true"
                  class="hidden size-icon-md @max-timeline/dials:block"
                />
                <span class="@max-timeline/dials:sr-only">{words.resetAll}</span
                >
              </Button>
            {/snippet}
          </Tip>
        {/if}
      </header>
    {/if}

    <!-- Its scroller clips: it stands a step out and pads the step back, so
         a focus ring on its edge is drawn whole (The One Ring Rule). -->
    <div
      class="kit-edge-fade-block -m-space-1 min-h-0 min-w-0 flex-1 overflow-y-auto p-space-1"
    >
      {#each sections as section (section.head)}
        <section
          aria-label={section.head ?? undefined}
          class="flex min-w-0 flex-col pb-space-4 last:pb-0"
        >
          {#if section.head}
            <h3 class={sectionHeadVariants({ class: "m-0 mb-space-2" })}>
              <span
                class="min-w-0 overflow-clip text-ellipsis whitespace-nowrap"
                >{section.head}</span
              >
            </h3>
          {/if}
          <div
            class="grid min-w-0 grid-cols-(--cols) items-center gap-x-space-3 gap-y-space-3 @max-timeline/dials:grid-cols-(--narrow) @max-timeline/dials:gap-y-space-2"
            style:--cols={COLUMNS}
            style:--narrow={NARROW_COLUMNS}
          >
            {#each section.dials as dial (dial.name)}
              {@const value = shownOf(dial)}
              {@const edited = !asWritten && changed.includes(dial.name)}
              {@const id = `dial-${dial.name}`}
              {#if dial.kind === "action"}
                <!-- An action: its name is its button's, across the row. -->
                <Button
                  class="col-span-2 justify-self-start @max-timeline/dials:col-span-full"
                  disabled={asWritten}
                  onclick={() => {
                    const next = (presses[dial.name] ?? 0) + 1;
                    presses = { ...presses, [dial.name]: next };
                    onchange(dial.name, next);
                  }}
                  size="sm"
                  variant="outline">{nameOf(dial)}</Button
                >
                <span></span>
              {:else}
                <label
                  class="min-w-0 type-label text-ink-row text-pretty wrap-anywhere @max-timeline/dials:col-span-full"
                  for={id}>{nameOf(dial)}</label
                >
                <div
                  class={[
                    "flex min-w-0 items-center",
                    dial.kind === "toggle" && "justify-end",
                    asWritten && "pointer-events-none",
                  ]}
                  data-dial={dial.name}
                  inert={asWritten || undefined}
                >
                  {#if dial.kind === "number"}
                    {@const start = Number(written[dial.name] ?? 0)}
                    <div class="min-w-0 flex-1" {id}>
                      <DialNumber
                        changed={edited}
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
                        changed={edited}
                        label={nameOf(dial)}
                        onchange={(next) => onchange(dial.name, next)}
                        value={String(value ?? "")}
                      />
                    </div>
                  {:else if dial.kind === "select"}
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
                      >
                        <span class="min-w-0 truncate"
                          >{String(value ?? "")}</span
                        >
                      </Select.Trigger>
                      <Select.Content>
                        {#each dial.options ?? [] as option (option)}
                          <Select.Item label={option} value={option} />
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
                      tone={edited ? "edited" : undefined}
                      value={String(value ?? "")}
                    />
                  {/if}
                </div>
                <!-- The restore glyph's own column: a changed value's way back. -->
                <span class="flex size-c-btn-h-xs items-center justify-center">
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
                          onclick={() => onreset([dial.name])}
                          press="pressable"
                          size="icon-xs"
                          variant="ghost"
                        />
                      {/snippet}
                    </Tip>
                  {/if}
                </span>
              {/if}
            {/each}
          </div>
        </section>
      {/each}
      {#if asWritten}
        <p class="m-0 mt-space-3 type-meta text-ink-muted">
          {words.dials.readOnly}
        </p>
      {/if}
    </div>
  </div>
</TooltipProvider>
