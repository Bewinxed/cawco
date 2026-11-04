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
  import StageKindItems from "#lib/cawco/decisions/host/setup/StageKindItems.svelte";
  import StageLookItems from "#lib/cawco/decisions/host/setup/StageLookItems.svelte";
  import type { Stage } from "#lib/cawco/decisions/host/setup/stage.js";
  import { STAGE_GLYPHS, STAGE_HUES } from "#lib/cawco/tasks/stage-look.js";
  import * as DropdownMenu from "#lib/components/ui/dropdown-menu/index.js";
  import { Input } from "#lib/components/ui/input/index.js";
  import { IconMore, IconNeedsYou } from "#lib/icons.js";

  let {
    stage,
    at,
    of,
    onchange,
    onmove,
    onremove,
  }: {
    stage: Stage;
    /** Its place, from 0, among `of` stages: the ends take no move past them. */
    at: number;
    of: number;
    onchange: (patch: Partial<Stage>) => void;
    onmove: (by: -1 | 1) => void;
    onremove: () => void;
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
  /** What happens to work here, in the column's body. */
  const holds = $derived.by(() => {
    if (stage.hooks?.runs) {
      return setupWords.stageRuns(stage.hooks.runs);
    }
    if (stage.hooks?.after) {
      return setupWords.stageAfter(span(stage.hooks.after));
    }
    return setupWords.stageHolds[stage.kind];
  });
  const kindWord = $derived(setupPageWords.kinds[stage.kind]);
</script>

<section
  aria-label={setupWords.draftStage(stage.name)}
  class="group/col flex min-h-c-draft-col-h flex-col gap-space-1 rounded-lg bg-surface-band p-space-1 inset-ring inset-ring-border-hairline"
  data-kind={stage.kind}
  data-share="stage:{stage.name}"
  data-slot="draft-column"
>
  <header class="flex flex-col gap-0 ps-space-2 pe-0 pt-space-1">
    <!-- mark-line: the name is a field, a box of its own; the glyph and More stand centred on it as boxes. -->
    <span class="flex min-h-c-btn-h-sm items-center gap-space-2">
      {#if stage.kind === "you"}
        <IconNeedsYou
          aria-hidden="true"
          class="size-icon-md flex-none text-status-attn-glyph"
        />
      {:else if stage.icon}
        {@const Glyph = STAGE_GLYPHS[stage.icon]}
        <span
          aria-hidden="true"
          class="grid flex-none place-items-center text-(--stage-hue)"
          data-box
          style:--stage-hue={stage.color
            ? STAGE_HUES[stage.color]
            : "var(--ink-muted)"}><Glyph class="size-icon-md" /></span
        >
      {/if}
      <Input
        aria-label={setupPageWords.stageName(at + 1)}
        look="inline"
        measure="shrink"
        oninput={(event: Event) =>
          onchange({ name: (event.currentTarget as HTMLInputElement).value })}
        text="label"
        value={stage.name}
      />
      <DropdownMenu.Root>
        <DropdownMenu.Trigger
          aria-label={setupPageWords.moreFor(stage.name)}
          class="ms-auto"
          size="icon-sm"
          variant="ghost"
        >
          <IconMore />
        </DropdownMenu.Trigger>
        <DropdownMenu.Content align="end" width="regular">
          <DropdownMenu.Sub>
            <DropdownMenu.SubTrigger
              ><span>{setupPageWords.kindItem}</span></DropdownMenu.SubTrigger
            >
            <DropdownMenu.SubContent>
              <StageKindItems
                kind={stage.kind}
                onkind={(kind: StageKind) => onchange({ kind })}
              />
            </DropdownMenu.SubContent>
          </DropdownMenu.Sub>
          <StageLookItems onlook={(patch) => onchange(patch)} {stage} />
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
        </DropdownMenu.Content>
      </DropdownMenu.Root>
    </span>
    <span
      class="type-meta whitespace-nowrap text-ink-subtle group-kind-you/col:text-status-attn-ink"
      >{kindWord}</span
    >
  </header>
  <p
    class="m-0 px-space-2 pt-space-2 pb-space-2 type-body text-pretty text-ink-muted"
    data-slot="holds"
  >
    {holds}
  </p>
</section>
