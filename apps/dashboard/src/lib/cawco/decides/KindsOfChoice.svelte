<script lang="ts">
  /**
   * Kinds of choice (build spec §3.6): every kind agents file decisions
   * under, and who decides each across the fleet, in the kit's popover hung
   * from the head's button (its count beside its name), so nothing on the
   * page moves while it stands open. ×, Escape or a press elsewhere closes
   * it.
   *
   * Its head: the title, what the kinds are for, and the key for the pen a
   * kind he added wears. Then Add a kind, which unfolds a step at a time
   * (Name → What agents read → Who decides it), each answered step folding
   * to its summary with Change, Continue turning to Add kind on the last
   * (The Steady Swap Rule). A kind half added and closed is kept, in the
   * session's storage too: the button says so, and one press brings it
   * back where it was. Then the kinds, one row each (KindRow).
   *
   * A fleet that didn't load stands in it with the hub's words and Retry.
   */
  import { unhandled } from "@cawco/core/unhandled";
  import { decidesWords } from "@cawco/core/words/decides";
  import { untrack } from "svelte";
  import RowFault from "#lib/cawco/RowFault.svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import { Input } from "#lib/components/ui/input/index.js";
  import {
    OptionGroup,
    OptionGroupItem,
  } from "#lib/components/ui/option-group/index.js";
  import * as Popover from "#lib/components/ui/popover/index.js";
  import { floatingSurface } from "#lib/components/ui/popover/index.js";
  import { Skeleton } from "#lib/components/ui/skeleton/index.js";
  import { IconClose, IconPen, IconPlus } from "#lib/icons.js";
  import type { WhoDecides } from "./decides.svelte";
  import { showFirstProblem } from "./first-problem";
  import { drawnInPlace, placeUnder } from "./in-place";
  import KindRow from "./KindRow.svelte";
  import { KIND_STEPS, type KindStep, writeParkedKind } from "./kinds.svelte";
  import MemberFace from "./MemberFace.svelte";
  import SetupRow from "./SetupRow.svelte";

  let {
    who,
    named = (projects) => projects,
  }: {
    who: WhoDecides;
    /** The projects' names, by their ids (the page's project list). */
    named?: (projects: string[]) => string[];
  } = $props();

  const uid = $props.id();
  const still = drawnInPlace();
  /** What the button and the popover hang from. */
  let anchor = $state<HTMLElement | null>(null);
  let steps = $state<HTMLElement | null>(null);

  const add = $derived(who.kindAdd);
  const problems = $derived(add ? who.kindAddProblems(add) : {});
  /** Closed with a kind half added: the button says so. */
  const parked = $derived(!who.kindsOpen && add !== null && add.changed);
  const shownSteps = $derived(add ? KIND_STEPS.slice(0, add.reached + 1) : []);
  const last = $derived(add ? who.kindLastStep(add) : false);
  /** The add's own fault, where no step holds it. */
  const addFault = $derived(
    add?.fault && add.fault.step === null ? add.fault : null
  );

  // A kind half added is kept as it changes, so a reload finds it.
  $effect(() => {
    const kept = add?.parked();
    if (kept) {
      untrack(() => writeParkedKind(who.projectId, add));
    }
  });

  // The first problem in view once Continue found it, its field in hand.
  $effect(() => {
    if (add && add.shown > 0) {
      showFirstProblem(steps);
    }
  });

  /** A step's problem, once Continue was pressed. */
  const problemOf = (step: KindStep): string | undefined =>
    add?.tried ? problems[step] : undefined;

  const summary = (step: KindStep): string => {
    if (!add) {
      return "";
    }
    switch (step) {
      case "name":
        return add.name.trim();
      case "example":
        return add.example.trim();
      case "to":
        return who.member(add.to)?.name ?? add.to;
      default:
        return unhandled("kind step", step);
    }
  };

  const onEnter = (event: KeyboardEvent) => {
    if (event.key === "Enter") {
      event.preventDefault();
      who.nextKind();
    }
  };
</script>

{#snippet problemLine(step: KindStep)}
  {@const problem = problemOf(step)}
  {#if problem}
    <p
      class="m-0 type-meta text-status-fail-ink text-pretty"
      data-problem
      id="{uid}-{step}-problem"
      role="alert"
    >
      {problem}
    </p>
  {/if}
{/snippet}

{#snippet field(step: KindStep)}
  {#if add}
    {#if step === "name"}
      <Input
        aria-describedby={problemOf("name") ? `${uid}-name-problem` : undefined}
        aria-invalid={problemOf("name") ? true : undefined}
        aria-label={decidesWords.kindSteps.name}
        autocomplete="off"
        onkeydown={onEnter}
        placeholder={decidesWords.kindNamePlaceholder}
        bind:value={add.name}
      />
    {:else if step === "example"}
      <Input
        aria-describedby={problemOf("example")
          ? `${uid}-example-problem`
          : undefined}
        aria-invalid={problemOf("example") ? true : undefined}
        aria-label={decidesWords.kindSteps.example}
        autocomplete="off"
        onkeydown={onEnter}
        placeholder={decidesWords.kindExamplePlaceholder}
        bind:value={add.example}
      />
    {:else}
      <div class="min-w-0">
        <OptionGroup
          aria-label={decidesWords.kindSteps.to}
          layout="list"
          onenter={() => who.nextKind()}
          bind:value={
            () => [add.to],
            (next) => {
              const [picked] = next;
              if (picked !== undefined) {
                add.to = picked;
              }
            }
          }
        >
          {#each who.members as member (member.id)}
            <OptionGroupItem value={member.id}>
              <span class="mark-line flex min-w-0 items-center gap-x-space-2">
                <MemberFace {member} size={24} />
                <span class="min-w-0 wrap-anywhere">{member.name}</span>
              </span>
            </OptionGroupItem>
          {/each}
        </OptionGroup>
      </div>
    {/if}
    {@render problemLine(step)}
  {/if}
{/snippet}

{#snippet adding()}
  {#if add}
    <section
      aria-labelledby="{uid}-add"
      bind:this={steps}
      class="@container/member-setup mb-space-2 flex min-w-0 flex-col rounded-well bg-surface-recess px-space-3 pt-space-3"
    >
      <h3 class="m-0 type-label font-medium text-ink-strong" id="{uid}-add">
        {decidesWords.addKind}
      </h3>
      {#each shownSteps as step (step)}
        <SetupRow
          id={step}
          label={decidesWords.kindSteps[step]}
          onopen={() => who.openKindStep(step)}
          open={add.open === step}
          problem={problemOf(step) !== undefined}
          value={summary(step)}
        >
          {@render field(step)}
        </SetupRow>
      {/each}
      <RowFault again={() => who.addKind()} reason={addFault?.reason} />
      <div
        class="flex min-w-0 items-center justify-end gap-space-2 border-t border-border-hairline py-space-3"
      >
        <Button
          label={decidesWords.cancel}
          onclick={() => who.cancelKind()}
          size="sm"
          variant="ghost"
        />
        <Button
          aria-busy={add.saving || undefined}
          onclick={() => (add.open ? who.nextKind() : who.addKind())}
          size="sm"
        >
          <span
            class="grid grid-cols-1 grid-rows-1 *:col-start-1 *:row-start-1"
            data-box
          >
            <span class={[(last || add.saving) && "invisible"]}
              >{decidesWords.continue}</span
            >
            <span class={[(!last || add.saving) && "invisible"]}
              >{decidesWords.addKindAct}</span
            >
            <span class={[!add.saving && "invisible"]}
              >{decidesWords.addingKind}</span
            >
          </span>
        </Button>
      </div>
    </section>
  {:else}
    <Button
      class="-ms-space-2 mb-space-1 self-start"
      icon={IconPlus}
      label={decidesWords.addKind}
      onclick={() => who.startKind()}
      size="sm"
      variant="ghost"
    />
  {/if}
{/snippet}

{#snippet panel(headId: string)}
  <div
    class="@container/kinds flex max-h-(--pop-max-h) min-h-0 min-w-0 flex-col"
  >
    <header class="flex min-w-0 items-start gap-x-space-3 p-space-3">
      <div class="flex min-w-0 flex-auto flex-col gap-space-1">
        <h2 class="m-0 type-title text-balance text-ink-strong" id={headId}>
          {decidesWords.kindsHead}
        </h2>
        <p class="m-0 max-w-c-measure type-meta text-ink-muted text-pretty">
          {decidesWords.kindsIntro}
        </p>
        <p
          class="mark-line m-0 flex items-center gap-x-space-1 type-meta text-ink-muted"
        >
          <IconPen aria-hidden="true" class="size-icon-sm flex-none" />
          <span>{decidesWords.addedKey}</span>
        </p>
      </div>
      <Button
        aria-label={decidesWords.closeKinds}
        icon={IconClose}
        onclick={() => who.showKinds(false)}
        size="icon-sm"
        variant="ghost"
      />
    </header>
    <div
      class="flex min-h-0 flex-auto flex-col overflow-y-auto overscroll-contain px-space-3 pb-space-3"
    >
      {#if who.read.state === "failed"}
        <RowFault again={() => who.load()} reason={who.read.reason} />
      {:else if who.read.state === "reading"}
        <div class="flex flex-col gap-space-2">
          {#each [0, 1, 2] as at (at)}
            <Skeleton height="row" radius="card" />
          {/each}
        </div>
      {:else}
        {@render adding()}
        <ul
          class="m-0 grid list-none grid-cols-(--kind-cols) gap-x-space-3 p-0 @max-kinds/kinds:grid-cols-(--kind-cols-narrow)"
          style:--kind-cols="auto minmax(0, 1fr) auto auto"
          style:--kind-cols-narrow="auto minmax(0, 1fr) auto"
        >
          {#each who.kinds as kind (kind.id)}
            <KindRow {kind} {named} {who} />
          {/each}
        </ul>
      {/if}
    </div>
  </div>
{/snippet}

{#snippet button(props: Record<string, unknown>)}
  <Button {...props} size="sm" variant="secondary">
    <span>{decidesWords.kindsHead}</span>
    {#if who.read.state === "read"}
      <span class="text-ink-muted tabular-nums" aria-hidden="true"
        >{who.kinds.length}</span
      >
      <span class="sr-only">, {decidesWords.kindsCount(who.kinds.length)}</span>
    {/if}
  </Button>
{/snippet}

<div
  bind:this={anchor}
  class="flex min-w-0 flex-none flex-wrap items-center gap-x-space-2 gap-y-space-1 self-start"
>
  {#if still}
    {@render button({
      "aria-expanded": who.kindsOpen,
      "aria-controls": who.kindsOpen ? `${uid}-panel` : undefined,
      onclick: () => who.showKinds(!who.kindsOpen),
    })}
  {:else}
    <Popover.Root
      bind:open={() => who.kindsOpen, (next) => who.showKinds(next)}
    >
      <Popover.Trigger>
        {#snippet child({ props })}
          {@render button(props)}
        {/snippet}
      </Popover.Trigger>
      <Popover.Content
        align="end"
        aria-labelledby="{uid}-head"
        customAnchor={anchor}
        gap="none"
        height="room"
        overflow="clip"
        pad="none"
        side="bottom"
        style="--pop-w: min(var(--spacing-c-kinds-max-w), var(--bits-popover-content-available-width, 100vw)); --pop-max-h: var(--bits-popover-content-available-height)"
        width="room"
      >
        {#if who.kindsOpen}
          {@render panel(`${uid}-head`)}
        {/if}
      </Popover.Content>
    </Popover.Root>
  {/if}
  {#if parked}
    <span class="type-meta text-ink-muted">{decidesWords.kindUnsaved}</span>
  {/if}
</div>

{#if still && who.kindsOpen}
  <section
    aria-labelledby="{uid}-head"
    class={[
      floatingSurface({ motion: "pop" }),
      "absolute z-(--layer-float) w-(--pop-w) overflow-clip p-0",
    ]}
    data-state="open"
    data-still-popover
    id="{uid}-panel"
    style="--pop-w: min(var(--spacing-c-kinds-max-w), 100%)"
    {@attach placeUnder(() => anchor, "end")}
  >
    {@render panel(`${uid}-head`)}
  </section>
{/if}
