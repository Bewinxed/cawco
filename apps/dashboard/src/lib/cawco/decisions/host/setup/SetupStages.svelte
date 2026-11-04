<!--
  A setup page's stages, one list on one grid, every row one line, in the
  drawing the card `stage-rest` is choosing between (setup-look.ts):

  - `reminders`, as Apple's Reminders draws its lists in edit mode
    (mobbin.com/screens/0352b7f5-3903-49df-9c4d-cdcaae6797e9): one list in
    the board's order, and on every row, at rest, what changes it. Leading,
    the remove button (a minus: pressed, the row's end turns into Remove,
    as Reminders' minus turns into Delete); then the stage's mark and its
    name, a field with no edge until it has the caret (DESIGN.md, Inputs
    and fields, Field frame); trailing, the kind in the row's meta (where
    Reminders' rows carry their value), the info button ("Use an info
    button only to reveal more information about a row's content", HIG
    Lists and tables) opening the house menu of its kind, its glyph and
    colour and what its hooks do (Reminders' List Info:
    mobbin.com/screens/a5698f3c-db13-4f59-acf2-de0d2d5c4743), and the
    reorder handle. Add a stage is the list's last row; the new stage
    stands before the first closed one, its name taking the caret.
  - `notion`, as Notion draws a status property's options
    (mobbin.com/screens/2bf06d40-1b37-44ed-bfc0-f4d42216bc83): a head for
    each kind in the kinds' fixed order, each with its own add button, as
    Notion's To-do, In progress and Complete; each stage its reorder
    handle, its mark and name, and the house's More (where Notion draws a
    chevron, which the HIG keeps for drilling in) holding the menu
    Notion's option opens (mobbin.com/screens/83e2d66a-d836-406f-b72d-d5bc20e1d16f):
    Rename (the name turns into its field where it stands), the kind
    (Notion's Group), the glyph and colour, what its hooks do, and Remove.
    The stages are kept in the kinds' order: a stage drags within its
    kind, and a new kind moves it to that kind's end.

  The list owns the columns and every row takes them (subgrid), so each
  part stands on one edge down the list: one 30px control column at each
  end, one 26px mark, the name, one 44px row (`c-row-h`).
-->
<script lang="ts">
  import type { StageKind } from "@cawco/core/views";
  import { CLOSED_STAGE_KINDS, STAGE_KINDS } from "@cawco/core/views";
  import { setupPageWords as words } from "@cawco/core/words/onboarding";
  import { tick } from "svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import * as DropdownMenu from "#lib/components/ui/dropdown-menu/index.js";
  import { iconTileVariants } from "#lib/components/ui/icon-tile/index.js";
  import { Input } from "#lib/components/ui/input/index.js";
  import { IconMinus, IconMore, IconPlus, IconUnfold } from "#lib/icons.js";
  import type { SetupLook } from "../setup-look";
  import { HeldRow } from "./held-row.svelte.js";
  import StageHandle from "./StageHandle.svelte";
  import StageKindItems from "./StageKindItems.svelte";
  import StageList from "./StageList.svelte";
  import StageLookItems from "./StageLookItems.svelte";
  import StageMark from "./StageMark.svelte";
  import StageRow from "./StageRow.svelte";
  import { moved, patched, type Stage, type StagesChange } from "./stage";

  let {
    stages,
    onchange,
    look,
  }: {
    stages: Stage[];
    onchange: StagesChange;
    look: SetupLook["stages"];
  } = $props();

  const REMINDERS_COLS =
    "var(--c-btn-h-sm) var(--c-mark) minmax(0, 1fr) auto var(--c-btn-h-sm)";
  const NOTION_COLS =
    "var(--c-btn-h-sm) var(--c-mark) minmax(0, 1fr) var(--c-btn-h-sm)";

  const rank = (kind: StageKind) => STAGE_KINDS.indexOf(kind);
  /** The stages as the list draws them: in the board's order, or in the kinds' order with each kind's own order kept. */
  const rows = $derived(
    look === "notion"
      ? stages
          .map((stage, i) => ({ stage, i }))
          .sort((a, b) => rank(a.stage.kind) - rank(b.stage.kind) || a.i - b.i)
          .map(({ stage }) => stage)
      : stages
  );
  const groups = $derived(
    STAGE_KINDS.map((kind) => {
      const first = rows.findIndex((one) => one.kind === kind);
      const count = rows.filter((one) => one.kind === kind).length;
      return { kind, first, last: first + count - 1, count };
    })
  );

  const held = new HeldRow((from, to) => onchange(moved(rows, from, to)));
  const at = (index: number, patch: Partial<Stage>) =>
    onchange(patched(rows, index, patch));

  let list = $state<HTMLOListElement | null>(null);
  const part = (index: number, slot: string) =>
    list?.querySelector<HTMLElement>(
      `[data-row="${index}"] [data-part="${slot}"]`
    );

  /** Reminders: the row whose minus was pressed, its end asking to remove it. */
  let asking = $state<number | null>(null);
  async function ask(index: number): Promise<void> {
    asking = asking === index ? null : index;
    await tick();
    part(index, asking === null ? "remove" : "remove-now")?.focus();
  }

  /** Reminders: the stage goes, and the focus to the row that takes its place (the one before, at the list's end). */
  async function drop(index: number): Promise<void> {
    asking = null;
    onchange(rows.filter((_, i) => i !== index));
    await tick();
    part(Math.min(index, rows.length - 1), "remove")?.focus();
  }

  /** Reminders: a new stage, Active, before the first closed one (Done, Dropped), where work still moves; its name takes the caret. */
  async function addActive(): Promise<void> {
    const closed = rows.findIndex((one) =>
      CLOSED_STAGE_KINDS.some((kind) => kind === one.kind)
    );
    const place = closed === -1 ? rows.length : closed;
    const next = [...rows];
    next.splice(place, 0, { name: "", kind: "active" });
    onchange(next);
    await tick();
    list
      ?.querySelector<HTMLInputElement>(`[data-row="${place}"] input`)
      ?.focus();
  }

  /** Notion: the stage whose name is a field, after Rename or Add. */
  let renaming = $state<number | null>(null);
  async function rename(index: number): Promise<void> {
    renaming = index;
    await tick();
    list
      ?.querySelector<HTMLInputElement>(`[data-row="${index}"] input`)
      ?.focus();
  }
  function rekind(index: number, kind: StageKind): void {
    const rest = rows.filter((_, i) => i !== index);
    // To the end of its new kind.
    const end = rest.findLastIndex((one) => rank(one.kind) <= rank(kind));
    rest.splice(end + 1, 0, { ...rows[index], kind });
    onchange(rest);
  }
  function add(kind: StageKind): void {
    const after = rows.findLastIndex((one) => rank(one.kind) <= rank(kind)) + 1;
    const next = [...rows];
    next.splice(after, 0, { name: "", kind });
    onchange(next);
    rename(after);
  }
</script>

{#if look === "notion"}
  <StageList bind:ref={list} cols={NOTION_COLS}>
    {#each groups as group (group.kind)}
      <li
        class="col-span-full grid grid-cols-subgrid items-center px-space-1 pt-space-2 first:pt-0"
        data-slot="setup-kind"
      >
        <span
          class="col-start-2 col-end-4 truncate type-meta text-ink-muted"
          id="setup-kind-{group.kind}">{words.kinds[group.kind]}</span
        >
        <Button
          aria-label={words.addTo(words.kinds[group.kind])}
          onclick={() => add(group.kind)}
          size="icon-sm"
          tone="quiet"
          variant="ghost"
        >
          <IconPlus />
        </Button>
      </li>
      {#each rows as stage, index (index)}
        {#if stage.kind === group.kind}
          {@const label = stage.name || words.newStage}
          <!-- mark-line: StageRow draws the recipe on its own li. -->
          <StageRow
            describedby="setup-kind-{group.kind}"
            {held}
            {index}
            kind={stage.kind}
          >
            <StageHandle
              first={group.first}
              {held}
              {index}
              {label}
              last={group.last}
            />
            <StageMark {stage} />
            {#if renaming === index}
              <Input
                aria-label={words.stageName(index + 1)}
                data-slot="setup-stage-name"
                look="inline"
                onblur={() => {
                  renaming = null;
                }}
                oninput={(event: Event) =>
                  onchange(
                    patched(rows, index, {
                      name: (event.currentTarget as HTMLInputElement).value,
                    }),
                    false
                  )}
                onkeydown={(event: KeyboardEvent) => {
                  if (event.key === "Enter" || event.key === "Escape") {
                    (event.currentTarget as HTMLInputElement).blur();
                  }
                }}
                placeholder={words.newStage}
                text="label"
                value={stage.name}
              />
            {:else}
              <span
                class={[
                  "truncate type-label",
                  stage.name ? "text-ink-row" : "text-ink-subtle",
                ]}
                data-slot="setup-stage-name">{label}</span
              >
            {/if}
            <DropdownMenu.Root>
              <DropdownMenu.Trigger
                aria-label={words.moreFor(label)}
                size="icon-sm"
                variant="ghost"
              >
                <IconMore />
              </DropdownMenu.Trigger>
              <DropdownMenu.Content align="end" width="wide">
                <DropdownMenu.Item onSelect={() => rename(index)}>
                  <span>{words.rename}</span>
                </DropdownMenu.Item>
                <DropdownMenu.Sub>
                  <DropdownMenu.SubTrigger
                    ><span>{words.kindItem}</span></DropdownMenu.SubTrigger
                  >
                  <DropdownMenu.SubContent>
                    <StageKindItems
                      kind={stage.kind}
                      line={stage.line}
                      onkind={(kind) => rekind(index, kind)}
                    />
                  </DropdownMenu.SubContent>
                </DropdownMenu.Sub>
                <StageLookItems onlook={(patch) => at(index, patch)} {stage} />
                <DropdownMenu.Separator />
                <DropdownMenu.Item
                  onSelect={() => onchange(rows.filter((_, i) => i !== index))}
                  variant="destructive"
                >
                  <span>{words.remove(label)}</span>
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Root>
          </StageRow>
        {/if}
      {/each}
    {/each}
  </StageList>
{:else}
  <StageList bind:ref={list} cols={REMINDERS_COLS} narrow={NOTION_COLS}>
    {#each rows as stage, index (index)}
      {@const label = stage.name || words.newStage}
      <!-- mark-line: StageRow draws the recipe on its own li. -->
      <StageRow {held} {index} kind={stage.kind}>
        <Button
          aria-expanded={asking === index}
          aria-label={words.removeAsk(label)}
          data-part="remove"
          onclick={() => ask(index)}
          size="icon-sm"
          tone="destructive"
          variant="ghost"
        >
          <IconMinus />
        </Button>
        <DropdownMenu.Root>
          <DropdownMenu.Trigger aria-label={words.lookOf(label)}>
            {#snippet child({ props: trigger })}
              <StageMark {stage} {trigger} />
            {/snippet}
          </DropdownMenu.Trigger>
          <DropdownMenu.Content align="start" width="wide">
            <StageLookItems onlook={(patch) => at(index, patch)} {stage} />
          </DropdownMenu.Content>
        </DropdownMenu.Root>
        <!-- The name and its kind: on the list's two columns, or the kind
             under the name where the list is too narrow for both. -->
        <span
          class="col-span-2 grid min-w-0 grid-cols-subgrid items-center @max-setup-stages-line:col-span-1 @max-setup-stages-line:grid-cols-1 @max-setup-stages-line:py-space-1"
        >
          <Input
            aria-label={words.stageName(index + 1)}
            data-slot="setup-stage-name"
            look="inline"
            oninput={(event: Event) =>
              onchange(
                patched(rows, index, {
                  name: (event.currentTarget as HTMLInputElement).value,
                }),
                false
              )}
            placeholder={words.newStage}
            text="label"
            value={stage.name}
          />
          {#if asking === index}
            <span
              class="grid min-w-0 justify-items-end @max-setup-stages-line:flex"
            >
              <Button
                data-part="remove-now"
                onclick={() => {
                  drop(index);
                }}
                onkeydown={(event: KeyboardEvent) => {
                  if (event.key === "Escape") {
                    event.preventDefault();
                    ask(index);
                  }
                }}
                size="sm"
                variant="destructive">{words.removeNow}</Button
              >
            </span>
          {:else}
            <span
              class="grid min-w-0 @max-setup-stages-line:-ms-space-2 @max-setup-stages-line:flex"
            >
              <DropdownMenu.Root>
                <DropdownMenu.Trigger aria-label={words.kindOf(label)}>
                  {#snippet child({ props: trigger })}
                    <Button
                      {...trigger}
                      align="trigger"
                      pad="more"
                      size="sm"
                      style="--more-px: var(--space-2)"
                      tone="muted"
                      variant="ghost"
                    >
                      <span
                        class="min-w-0 overflow-clip text-ellipsis whitespace-nowrap"
                        >{words.kinds[stage.kind]}</span
                      >
                      <IconUnfold data-icon="inline-end" />
                    </Button>
                  {/snippet}
                </DropdownMenu.Trigger>
                <DropdownMenu.Content align="end" width="regular">
                  <DropdownMenu.Group>
                    <DropdownMenu.GroupHeading
                      >{words.kind}</DropdownMenu.GroupHeading
                    >
                    <StageKindItems
                      kind={stage.kind}
                      line={stage.line}
                      onkind={(kind) => at(index, { kind })}
                    />
                  </DropdownMenu.Group>
                </DropdownMenu.Content>
              </DropdownMenu.Root>
            </span>
          {/if}
        </span>
        <StageHandle first={0} {held} {index} {label} last={rows.length - 1} />
      </StageRow>
    {/each}
    <li
      class="col-span-full grid min-h-c-row-h grid-cols-subgrid items-center px-space-1"
    >
      <button
        class="col-start-2 -col-end-1 -mx-space-1 flex min-h-c-row-h items-center gap-space-2 rounded-md border-none bg-transparent px-space-1 text-start type-label text-ink-muted mark-line hover:bg-surface-hover focus-visible:outline-(length:--focus-ring-width) focus-visible:outline-solid focus-visible:outline-focus-ring focus-visible:outline-offset-(--focus-ring-inset)"
        data-slot="setup-add-stage"
        onclick={() => addActive()}
        type="button"
      >
        <span class={iconTileVariants({ empty: true })} data-box
          ><IconPlus class="size-icon-md" /></span
        >
        <span>{words.addStage}</span>
      </button>
    </li>
  </StageList>
{/if}
