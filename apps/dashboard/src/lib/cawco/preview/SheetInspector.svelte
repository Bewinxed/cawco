<script lang="ts" module>
  /** A default's quotes, as docgen writes it (`"neutral"`): the control's value is the bare option. */
  const QUOTES = /^["'`]|["'`]$/g;
  /** Where each control stands in the list. */
  const RANK = {
    segments: 0,
    select: 0,
    switch: 1,
    text: 2,
    number: 2,
    slot: 3,
    code: 3,
  } as const;
  /** Types a field or switch already says by being one. */
  const PLAIN_TYPES = new Set(["string", "number", "boolean"]);
</script>

<script lang="ts">
  /**
   * A sheet's inspector (live components spec §5): the chosen story's
   * props as controls, from the stage's docgen. An enum is the variant
   * control (its segments, or its list past four), a boolean its switch, a
   * string or number its field (a colour, length or font offered the
   * project's token names), a slot "content is a pin", code read-only. A
   * change mounts the story again at once; Save writes its args into the
   * story file. Under the controls, the story buttons: Add story from the
   * controls as they stand, Duplicate, Move up and down, Remove (asked in
   * place). A right panel beside the page on a desk; a sheet over the
   * page's foot on a phone.
   */
  import type { PropMeta } from "@cawco/core/stage";
  import { Button } from "#lib/components/ui/button/index.js";
  import {
    TabItem,
    Tabs,
    TabsList,
  } from "#lib/components/ui/fluid-tabs/index.js";
  import { Input } from "#lib/components/ui/input/index.js";
  import {
    NativeSelect,
    NativeSelectOption,
  } from "#lib/components/ui/native-select/index.js";
  import { Switch } from "#lib/components/ui/switch/index.js";
  import {
    IconArrowDown,
    IconArrowUp,
    IconClose,
    IconComment,
    IconCopy,
    IconPlus,
    IconReset,
    IconTrash,
  } from "#lib/icons.js";
  import AskHere from "../AskHere.svelte";
  import { Asker, type AskHereRequest } from "../ask-here.svelte";
  import { dur, easeDrawer, easeOut, motionOk } from "../motion/curves.svelte";
  import {
    controlOf,
    type SheetInspector,
    STORY_NAME,
  } from "./sheet-inspector.svelte";

  let {
    inspector,
    layout,
    onclose,
  }: {
    inspector: SheetInspector;
    /** A right panel beside the page (a desk's pane), or a sheet over the page's foot (a phone's). */
    layout: "panel" | "sheet";
    onclose: () => void;
  } = $props();

  const id = $props.id();
  const asks = new Asker<AskHereRequest>();
  const sheet = $derived(inspector.sheet);
  const story = $derived(inspector.story);
  const component = $derived(inspector.component);
  const fileName = $derived(sheet?.file.split("/").at(-1) ?? "the story file");

  /** The name field Add story and Duplicate ask for, and which of them it is for. */
  let naming = $state<"add" | "duplicate" | null>(null);
  let newName = $state("");
  const nameProblem = $derived.by(() => {
    const name = newName.trim();
    if (!name) {
      return null;
    }
    if (!STORY_NAME.test(name)) {
      return "A story's name starts with a capital: letters, digits and _ only, like Roomy.";
    }
    return sheet?.stories.some((one) => one.name === name)
      ? `${fileName} has a story ${name} already.`
      : null;
  });
  function startNaming(kind: "add" | "duplicate") {
    naming = kind;
    newName = kind === "duplicate" && story ? `${story.name}Copy` : "";
  }
  async function named(event: SubmitEvent) {
    event.preventDefault();
    const name = newName.trim();
    if (!(name && !nameProblem && naming)) {
      return;
    }
    const op =
      naming === "add"
        ? { add: name, args: inspector.current() }
        : { duplicate: story?.name ?? "", as: name };
    if (await inspector.op(op)) {
      naming = null;
      newName = "";
    }
  }
  function remove() {
    const name = story?.name;
    if (!name) {
      return;
    }
    // biome-ignore lint/complexity/noVoid: the question answers itself; a Cancel changes nothing
    void asks.ask({
      at: "remove-story",
      title: `Remove the story ${name}?`,
      body: `Its export goes from ${fileName}, and its frame from the sheet. The component stays as it is.`,
      confirmLabel: "Remove story",
      pendingLabel: "Removing…",
      destructive: true,
      run: async () => {
        if (!(await inspector.op({ remove: name }))) {
          throw new Error(inspector.problem ?? `${name} wasn't removed.`);
        }
      },
    });
  }
  const up = $derived(inspector.moveBy(-1));
  const down = $derived(inspector.moveBy(1));

  /** A token offer's list id, for a prop whose role takes the project's tokens. */
  const listOf = (prop: PropMeta) =>
    prop.tokens && (sheet?.tokens[prop.tokens].length ?? 0) > 0
      ? `${id}-tokens-${prop.tokens}`
      : undefined;
  const fieldId = (prop: PropMeta) => `${id}-prop-${prop.name}`;
  /**
   * The sheet recipe's motion (DESIGN.md Dialog, sheet and drawer): its
   * whole size in from its edge, the right on a desk and the foot on a
   * phone, over --dur-panel on the drawer curve, out over --dur-exit; with
   * less motion a fade.
   */
  function slide(_node: Element, { leaving }: { leaving: boolean }) {
    const axis = layout === "panel" ? "X" : "Y";
    if (!motionOk.current) {
      return {
        duration: dur(leaving ? "--dur-exit" : "--dur-fade"),
        easing: easeOut,
        css: (t: number) => `opacity: ${t}`,
      };
    }
    return {
      duration: dur(leaving ? "--dur-exit" : "--dur-panel"),
      easing: leaving ? easeOut : easeDrawer,
      css: (t: number) => `transform: translate${axis}(${(1 - t) * 100}%)`,
    };
  }
  /** The props as the person reaches for them: variants first, then switches, then fields, read-only ones last; the file's order within each. */
  const ordered = (props: PropMeta[]) =>
    props
      .map((prop, at) => ({
        prop,
        at,
        rank: RANK[inspector.code(prop) === null ? controlOf(prop) : "code"],
      }))
      .sort((a, b) => a.rank - b.rank || a.at - b.at)
      .map((one) => one.prop);
  /** Whether a prop's type is said under its control: only where the control doesn't say it (a union of kinds, a slot's type), never `string` under a field. */
  const typeSaid = (prop: PropMeta, control: ReturnType<typeof controlOf>) =>
    control === "slot" ||
    (control !== "code" &&
      !PLAIN_TYPES.has(prop.type.raw) &&
      control !== "segments" &&
      control !== "select");
  const shown = (value: unknown) =>
    value === undefined || value === null ? "" : String(value);
</script>

<aside
  aria-label="Inspector"
  class="inspector"
  class:sheet={layout === "sheet"}
  data-inspector={layout}
  in:slide={{ leaving: false }}
  out:slide={{ leaving: true }}
>
  <header class="head">
    <h2 class="title">Inspect</h2>
    <Button
      aria-label="Close the inspector"
      class="touch-hit"
      icon={IconClose}
      onclick={onclose}
      size="icon-sm"
      title="Close the inspector"
      variant="ghost"
    />
  </header>

  <div class="body">
    {#if !sheet}
      <!-- The rows' own size while the page reads the sheet's props. -->
      <div aria-label="Reading the sheet's props" class="loading" role="status">
        {#each [0, 1, 2] as row (row)}
          <span class="kit-skeleton skeleton-name"></span>
          <span class="kit-skeleton skeleton-control"></span>
        {/each}
      </div>
    {:else if sheet.stories.length === 0}
      <p class="note">{fileName} has no stories yet. Add one below.</p>
    {:else}
      <div class="story">
        <label class="sr-only" for={`${id}-story`}>Story</label>
        <NativeSelect
          class="story-pick"
          id={`${id}-story`}
          onchange={(event) =>
            inspector.choose((event.currentTarget as HTMLSelectElement).value)}
          size="sm"
          value={inspector.chosen ?? ""}
        >
          {#each sheet.stories as one (one.name)}
            <NativeSelectOption value={one.name}>
              {one.name}{inspector.dirtyOf(one.name) ? " · edited" : ""}
            </NativeSelectOption>
          {/each}
        </NativeSelect>
        <div class="story-ops">
          <Button
            aria-label="Duplicate the story"
            disabled={!!inspector.writing}
            icon={IconCopy}
            onclick={() => startNaming("duplicate")}
            size="icon-sm"
            title="Duplicate"
            variant="ghost"
          />
          <Button
            aria-label="Move the story up"
            disabled={!up || !!inspector.writing}
            icon={IconArrowUp}
            onclick={() => up && inspector.op(up)}
            size="icon-sm"
            title="Move up"
            variant="ghost"
          />
          <Button
            aria-label="Move the story down"
            disabled={!down || !!inspector.writing}
            icon={IconArrowDown}
            onclick={() => down && inspector.op(down)}
            size="icon-sm"
            title="Move down"
            variant="ghost"
          />
          <Button
            aria-label="Remove the story"
            disabled={!!inspector.writing}
            icon={IconTrash}
            onclick={remove}
            size="icon-sm"
            title="Remove"
            variant="ghost"
          />
        </div>
      </div>
      <AskHere asker={asks} at="remove-story" />

      {#if component}
        <p class="where">
          {component.name} · <code>{component.file}</code>
        </p>
        {#if component.note}
          <p class="note">{component.note}</p>
        {/if}
        <ul class="props">
          {#each ordered(component.props) as prop (prop.name)}
            {@const control =
              inspector.code(prop) === null ? controlOf(prop) : "code"}
            {@const value = inspector.value(prop)}
            <li class="prop" data-prop={prop.name}>
              <div class="prop-head">
                <label class="prop-name" for={fieldId(prop)}>{prop.name}</label>
                {#if prop.required}
                  <span class="prop-meta">required</span>
                {/if}
                {#if inspector.own(prop) && control !== "code" && control !== "slot"}
                  <Button
                    aria-label={`Reset ${prop.name}`}
                    class="prop-reset"
                    icon={IconReset}
                    onclick={() => inspector.reset(prop)}
                    size="icon-xs"
                    title={`Reset ${prop.name} to the sheet's or the component's default`}
                    variant="ghost"
                  />
                {/if}
              </div>
              {#if control === "segments"}
                <Tabs
                  onValueChange={(next) => {
                    const option = prop.options?.find(
                      (one) => String(one) === next
                    );
                    if (option !== undefined) {
                      inspector.set(prop, option);
                    }
                  }}
                  size="compact"
                  value={shown(
                    value ?? prop.defaultValue?.replaceAll(QUOTES, "")
                  )}
                  values={(prop.options ?? []).map(String)}
                >
                  <TabsList aria-label={prop.name} id={fieldId(prop)}>
                    {#each prop.options ?? [] as option (option)}
                      <TabItem label={String(option)} value={String(option)} />
                    {/each}
                  </TabsList>
                </Tabs>
              {:else if control === "select"}
                <NativeSelect
                  class="prop-select"
                  id={fieldId(prop)}
                  name={prop.name}
                  onchange={(event) => {
                    const next = (event.currentTarget as HTMLSelectElement)
                      .value;
                    const option = prop.options?.find(
                      (one) => String(one) === next
                    );
                    if (option !== undefined) {
                      inspector.set(prop, option);
                    }
                  }}
                  size="sm"
                  value={shown(
                    value ?? prop.defaultValue?.replaceAll(QUOTES, "")
                  )}
                >
                  {#each prop.options ?? [] as option (option)}
                    <NativeSelectOption value={String(option)}
                      >{option}</NativeSelectOption
                    >
                  {/each}
                </NativeSelect>
              {:else if control === "switch"}
                <Switch
                  checked={value === undefined
                    ? prop.defaultValue === "true"
                    : value === true}
                  id={fieldId(prop)}
                  name={prop.name}
                  onCheckedChange={(checked) => inspector.set(prop, checked)}
                />
              {:else if control === "text" || control === "number"}
                <Input
                  autocomplete="off"
                  class="prop-field"
                  id={fieldId(prop)}
                  list={listOf(prop)}
                  name={prop.name}
                  oninput={(event) => {
                    const raw = (event.currentTarget as HTMLInputElement).value;
                    const number = Number(raw);
                    const asNumber =
                      control === "number" ||
                      (typeof value === "number" &&
                        raw.trim() !== "" &&
                        Number.isFinite(number));
                    inspector.set(
                      prop,
                      asNumber && raw.trim() !== "" ? number : raw
                    );
                  }}
                  placeholder={prop.defaultValue ?? ""}
                  type={control === "number" ? "number" : "text"}
                  value={shown(value)}
                />
                {#if listOf(prop) && prop.tokens}
                  <datalist id={listOf(prop)}>
                    {#each sheet.tokens[prop.tokens] as token (token)}
                      <option value={token}></option>
                    {/each}
                  </datalist>
                {/if}
              {:else if control === "slot"}
                <p class="slot mark-line" id={fieldId(prop)}>
                  <IconComment class="slot-glyph" />
                  <span
                    >Content is a pin: Comment on the page to change it.</span
                  >
                </p>
              {:else}
                <p class="code" id={fieldId(prop)}>
                  <code>{inspector.code(prop) ?? prop.type.raw}</code>
                  <span
                    >{inspector.code(prop) === null
                      ? "Set it in the file."
                      : "Code in the file: a pin changes it."}</span
                  >
                </p>
              {/if}
              {#if typeSaid(prop, control)}
                <p class="prop-type"><code>{prop.type.raw}</code></p>
              {/if}
              {#if prop.description}
                <p class="prop-hint">{prop.description}</p>
              {/if}
            </li>
          {:else}
            {#if component.types !== "unknown"}
              <li class="note">{component.name} takes no props.</li>
            {/if}
          {/each}
        </ul>
      {:else}
        <p class="note">
          The sheet's meta names no component the stage could find, so it has no
          controls. Give its default export a <code>component</code>.
        </p>
      {/if}
    {/if}
  </div>

  <footer class="foot">
    {#if inspector.problem}
      <p class="problem" role="alert">{inspector.problem}</p>
    {/if}
    {#if naming}
      <form class="naming" onsubmit={named}>
        <label class="prop-name" for={`${id}-name`}>
          {naming === "add"
            ? "New story's name"
            : `Name the copy of ${story?.name ?? "the story"}`}
        </label>
        <Input
          aria-invalid={nameProblem ? "true" : undefined}
          autocomplete="off"
          bind:value={newName}
          id={`${id}-name`}
          placeholder="Roomy"
        />
        {#if nameProblem}
          <p class="problem">{nameProblem}</p>
        {/if}
        <div class="actions">
          <Button
            label="Cancel"
            onclick={() => {
              naming = null;
            }}
            size="sm"
            variant="ghost"
          />
          <Button
            disabled={!newName.trim() || !!nameProblem}
            label={naming === "add" ? "Add story" : "Duplicate"}
            pending={inspector.writing === "op"}
            pendingLabel={naming === "add" ? "Adding…" : "Duplicating…"}
            size="sm"
            type="submit"
          />
        </div>
      </form>
    {:else}
      <div class="actions">
        <Button
          disabled={!sheet || !!inspector.writing}
          icon={IconPlus}
          label="Add story"
          onclick={() => startNaming("add")}
          size="sm"
          title="A new story from the controls as they stand"
          variant="ghost"
        />
        <span class="spacer"></span>
        <Button
          disabled={!inspector.dirty || !!inspector.writing}
          label="Discard"
          onclick={() => inspector.discard()}
          size="sm"
          variant="ghost"
        />
        <Button
          disabled={!inspector.dirty || inspector.writing === "op"}
          label="Save"
          onclick={() => inspector.save()}
          pending={inspector.writing === "save"}
          pendingLabel="Saving…"
          size="sm"
          title={`Write ${story?.name ?? "the story"}'s args into ${fileName}`}
        />
      </div>
    {/if}
  </footer>
</aside>

<style>
  /* The panel: the raised surface beside the page, a hairline its seam; its
     controls scroll between the head and the foot. */
  .inspector {
    position: absolute;
    inset-block: 0;
    inset-inline-end: 0;
    z-index: 2;
    display: grid;
    grid-template-rows: auto 1fr auto;
    inline-size: var(--c-sheet-inspector-w);
    max-inline-size: 100%;
    border-inline-start: 1px solid var(--border-hairline);
    background: var(--surface-raised);
  }
  /* On a phone: the drawer recipe over the page's foot, edge to edge, its
     top corners rounded and its hairline on top, as tall as it holds up to
     the well's 60%, the page above it live. */
  .inspector.sheet {
    inset-block: auto 0;
    inset-inline: 0;
    inline-size: auto;
    max-block-size: 60%;
    border-inline-start: 0;
    border-block-start: 1px solid var(--border-hairline);
    border-start-start-radius: var(--radius-lg);
    border-start-end-radius: var(--radius-lg);
    box-shadow: var(--shadow-drawer);
  }
  .head {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-block-size: var(--c-sheet-inspector-head-h);
    padding-inline: var(--space-4) var(--space-2);
    border-block-end: 1px solid var(--border-hairline);
  }
  .title {
    flex: 1;
    margin: 0;
    color: var(--ink-strong);
    font: var(--type-label);
  }
  .body {
    display: grid;
    align-content: start;
    gap: var(--space-3);
    min-block-size: 0;
    overflow: auto;
    padding: var(--space-3) var(--space-4);
  }
  /* A prop row's name and control, as skeleton lines at their heights. */
  .loading {
    display: grid;
    gap: var(--space-2);
  }
  .skeleton-name {
    display: block;
    inline-size: 40%;
    block-size: var(--text-label);
    border-radius: var(--radius-xs);
  }
  .skeleton-control {
    display: block;
    block-size: var(--c-input-h);
    margin-block-end: var(--space-2);
    border-radius: var(--radius-md);
  }
  .story {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }
  .story :global(.story-pick) {
    flex: 1;
    min-inline-size: 0;
  }
  .story :global(.story-pick select) {
    inline-size: 100%;
  }
  .story-ops {
    display: flex;
    gap: var(--space-1);
  }
  .where,
  .note,
  .prop-hint,
  .prop-type,
  .prop-meta,
  .slot,
  .code span {
    margin: 0;
    color: var(--ink-muted);
    font: var(--type-meta);
  }
  .where code,
  .prop-type code,
  .code code,
  .note code {
    font: var(--type-code);
    overflow-wrap: anywhere;
  }
  .props {
    display: grid;
    gap: var(--space-4);
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .prop {
    display: grid;
    gap: var(--space-1);
  }
  .prop-head {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-block-size: var(--space-6);
  }
  .prop-name {
    color: var(--ink-strong);
    font: var(--type-label);
  }
  .prop-head :global(.prop-reset) {
    margin-inline-start: auto;
  }
  .prop :global(.prop-select),
  .prop :global(.prop-select select) {
    inline-size: 100%;
  }
  .slot {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }
  .slot :global(.slot-glyph) {
    flex-shrink: 0;
    inline-size: var(--icon-md);
    block-size: var(--icon-md);
  }
  .code {
    display: grid;
    gap: var(--space-1);
    margin: 0;
  }
  .code code {
    color: var(--ink-strong);
  }
  .foot {
    display: grid;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3)
      calc(var(--space-2) + env(safe-area-inset-bottom, 0px));
    border-block-start: 1px solid var(--border-hairline);
  }
  .actions {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }
  .spacer {
    flex: 1;
  }
  .naming {
    display: grid;
    gap: var(--space-2);
    margin: 0;
  }
  .naming .actions {
    justify-content: flex-end;
  }
  .problem {
    margin: 0;
    color: var(--data-bad);
    font: var(--type-meta);
  }
</style>
