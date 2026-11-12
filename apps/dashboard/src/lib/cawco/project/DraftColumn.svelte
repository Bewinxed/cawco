<script lang="ts">
  /**
   * One stage of Caw's draft, drawn as the board's column it becomes
   * (TaskColumn's band, hairline and head), so the person reviews the
   * board they will get, not a list about it. Its head is the stage's mark
   * and its name, the name a field where it stands (the house Input's
   * `inline` look: the column's words at rest, the field's edge only with
   * the caret), and More with the stage's kind, its glyph and colour, a
   * move a place earlier or later, and Remove. Its body says what happens
   * to work in it: what its hooks do ("Runs the researcher", "Moves on
   * after 7 days"), else what its kind holds. Nothing here is written to
   * the project: each change goes to the draft (`onchange`), kept by the
   * setup page's bridge until the person sets it up.
   */
  import type { StageKind } from "@cawco/core/views";
  import { setupPageWords, setupWords } from "@cawco/core/words/onboarding";
  import { tick } from "svelte";
  import StageKindItems from "#lib/cawco/project/StageKindItems.svelte";
  import StageLookItems from "#lib/cawco/project/StageLookItems.svelte";
  import type { SetupDelegate, Stage } from "#lib/cawco/project/setup-stage.js";
  import { markOf } from "#lib/cawco/tasks/stage-look.js";
  import { BarMore } from "#lib/components/ui/bar-glass/index.js";
  import * as DropdownMenu from "#lib/components/ui/dropdown-menu/index.js";
  import { Input } from "#lib/components/ui/input/index.js";
  import {
    IconChevronLeft,
    IconChevronRight,
    IconNeedsYou,
  } from "#lib/icons.js";

  let {
    stage,
    at,
    of,
    onchange,
    onmove,
    onremove,
    delegates = [],
  }: {
    stage: Stage;
    /** Its place, from 0, among `of` stages: the ends take no move past them. */
    at: number;
    of: number;
    onchange: (patch: Partial<Stage>) => void;
    onmove: (by: -1 | 1) => void;
    onremove: () => void;
    /** The delegate types the setup proposes: who may do a stage's work. */
    delegates?: SetupDelegate[];
  } = $props();

  /** A span of whole days, as stages.md writes it ("7d"). */
  const DAYS = /^(\d+)d$/u;
  const days = new Intl.NumberFormat(undefined, {
    style: "unit",
    unit: "day",
    unitDisplay: "long",
  });
  /** A hook's span ("7d") in words, or as written. */
  const span = (value: string): string => {
    const match = DAYS.exec(value);
    return match ? days.format(Number(match[1])) : value;
  };
  /** Who does a stage's work, by type id: its label, else the id. */
  const nameOf = (id: string): string =>
    delegates.find((one) => one.id === id)?.name ?? id;
  /**
   * What this project does with work here, from the stage's own hooks (who
   * runs it, when it moves on): never a generic line for its kind, which
   * said what the kind word already says (cold review a89636bb).
   */
  const holds = $derived.by(() => {
    if (stage.hooks?.runs) {
      return setupWords.stageRuns(nameOf(stage.hooks.runs));
    }
    if (stage.hooks?.after) {
      return setupWords.stageAfter(span(stage.hooks.after));
    }
    return null;
  });
  const kindWord = $derived(setupPageWords.kinds[stage.kind]);
  /** The kind word stands only where it says something the name does not ("Done / Done" says it twice). */
  const showsKind = $derived(
    kindWord.toLowerCase() !== stage.name.trim().toLowerCase()
  );
  /** Which level of the stage's menu stands: its items, its kind, its worker or its look. */
  let level = $state<"root" | "kind" | "worker" | "look">("root");
  /** Sets who does the work: a type's id, or none. */
  function work(runs: string) {
    const { runs: _gone, ...rest } = stage.hooks ?? {};
    onchange({ hooks: runs ? { ...rest, runs } : rest });
  }
  /** A level stood up in place: the keys go to its first item, as a submenu's would. */
  async function to(next: "root" | "kind" | "worker" | "look") {
    level = next;
    await tick();
    document
      .querySelector<HTMLElement>(
        "[data-slot=dropdown-menu-content] [role^=menuitem]:not([data-disabled])"
      )
      ?.focus();
  }
</script>

<section
  aria-label={setupWords.draftStage(stage.name)}
  class="group/col flex flex-col gap-space-1 rounded-lg bg-surface-recess p-space-1 inset-ring inset-ring-border-hairline"
  data-kind={stage.kind}
  data-share="stage:{stage.name}"
  data-slot="draft-column"
>
  <header class="flex flex-col gap-0 ps-space-2 pe-0 pt-space-1 pb-space-1">
    <!-- mark-line: the name is a field, a box of its own; the glyph and More stand centred on it as boxes. -->
    <span class="flex min-h-c-btn-h-sm items-center gap-space-2">
      {#if stage.kind === "you"}
        <IconNeedsYou
          aria-hidden="true"
          class="size-icon-md flex-none text-status-attn-glyph"
        />
      {:else}
        {@const mark = markOf(stage)}
        <span
          aria-hidden="true"
          class="grid flex-none place-items-center text-(--stage-hue)"
          data-box
          style:--stage-hue={mark.hue}><mark.glyph class="size-icon-md" /></span
        >
      {/if}
      <Input
        aria-label={setupPageWords.stageName(at + 1)}
        look="inline"
        measure="shrink"
        oninput={(event: Event) =>
          onchange({ name: (event.currentTarget as HTMLInputElement).value })}
        onkeydown={(event: KeyboardEvent) => {
          // Enter ends the rename, as a list's row name does.
          if (event.key === "Enter") {
            event.preventDefault();
            (event.currentTarget as HTMLInputElement).blur();
          }
        }}
        text="label"
        value={stage.name}
      />
      <!-- One menu, its second level in place (HIG Menus: a submenu on a
           touch screen is a level in the same menu): Kind and Look each
           replace the menu's items with theirs under a Back row, so it
           never flies out beside its row nor runs past a phone's screen. -->
      <!-- More in a glass of its own at the column head's end. -->
      <span class="ms-auto flex flex-none">
        <BarMore
          label={setupPageWords.moreFor(stage.name)}
          onOpenChange={(open) => {
            if (!open) {
              level = "root";
            }
          }}
          width="tiles"
        >
          {#if level === "root"}
            <DropdownMenu.Item
              closeOnSelect={false}
              onSelect={() => {
                to("kind");
              }}
            >
              <span>{setupPageWords.kindItem}</span>
              <span class="ms-auto type-meta text-ink-muted">{kindWord}</span>
              <IconChevronRight aria-hidden="true" class="size-icon-sm" />
            </DropdownMenu.Item>
            {#if delegates.length > 0}
              <DropdownMenu.Item
                closeOnSelect={false}
                onSelect={() => {
                  to("worker");
                }}
              >
                <span>{setupPageWords.worker}</span>
                <span class="ms-auto type-meta text-ink-muted"
                  >{stage.hooks?.runs
                    ? nameOf(stage.hooks.runs)
                    : setupPageWords.noWorker}</span
                >
                <IconChevronRight aria-hidden="true" class="size-icon-sm" />
              </DropdownMenu.Item>
            {/if}
            {#if stage.kind !== "you"}
              <DropdownMenu.Item
                closeOnSelect={false}
                onSelect={() => {
                  to("look");
                }}
              >
                <span>{setupPageWords.look}</span>
                <IconChevronRight
                  aria-hidden="true"
                  class="ms-auto size-icon-sm"
                />
              </DropdownMenu.Item>
            {/if}
            <DropdownMenu.Separator />
            <DropdownMenu.Item disabled={at === 0} onSelect={() => onmove(-1)}>
              <span>{setupPageWords.earlier}</span>
            </DropdownMenu.Item>
            <DropdownMenu.Item
              disabled={at === of - 1}
              onSelect={() => onmove(1)}
            >
              <span>{setupPageWords.later}</span>
            </DropdownMenu.Item>
            <DropdownMenu.Separator />
            <DropdownMenu.Item onSelect={onremove} variant="destructive">
              <span>{setupPageWords.remove(stage.name)}</span>
            </DropdownMenu.Item>
          {:else}
            <DropdownMenu.Item
              closeOnSelect={false}
              onSelect={() => {
                to("root");
              }}
            >
              <IconChevronLeft aria-hidden="true" class="size-icon-sm" />
              <span>{setupPageWords.back}</span>
            </DropdownMenu.Item>
            <DropdownMenu.Separator />
            {#if level === "kind"}
              <StageKindItems
                kind={stage.kind}
                onkind={(kind: StageKind) => onchange({ kind })}
              />
              {#if stage.kind === "you"}
                <DropdownMenu.Separator />
                <DropdownMenu.Label kind="line"
                  >{setupPageWords.youMark}</DropdownMenu.Label
                >
              {/if}
            {:else if level === "worker"}
              <!-- Who does the work here: a type the setup proposes, or
                   no one (the person, or Caw by hand). -->
              <DropdownMenu.RadioGroup
                onValueChange={(next) => work(next)}
                value={stage.hooks?.runs ?? ""}
              >
                <DropdownMenu.RadioItem value="">
                  <span>{setupPageWords.noWorker}</span>
                </DropdownMenu.RadioItem>
                {#each delegates as one (one.id)}
                  <DropdownMenu.RadioItem value={one.id}>
                    <span>{one.name}</span>
                  </DropdownMenu.RadioItem>
                {/each}
              </DropdownMenu.RadioGroup>
            {:else}
              <StageLookItems onlook={(patch) => onchange(patch)} {stage} />
            {/if}
          {/if}
        </BarMore>
      </span>
    </span>
    {#if showsKind}
      <span
        class="type-meta whitespace-nowrap text-ink-subtle group-kind-you/col:text-status-attn-ink"
        >{kindWord}</span
      >
    {/if}
  </header>
  <!-- What this project does with work here, only where its hooks say: in
       the meta role, under the name it describes. -->
  {#if holds}
    <p
      class="m-0 px-space-2 pb-space-2 type-meta text-pretty text-ink-muted"
      data-slot="holds"
    >
      {holds}
    </p>
  {/if}
</section>
