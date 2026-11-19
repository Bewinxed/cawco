<script lang="ts">
  /**
   * Move, before it starts: where the place's folder goes (a machine and a
   * folder typed), then the hub's reading of what that reaches, in plain
   * words: a rename on one disk or a copy of so many files, what moves along
   * and what no longer holds the files, the links that break, and each
   * conversation running here with how it carries. A refusal says what
   * stands in the way and what to do, and Move is absent.
   */
  import { type HarnessKind, harnessName } from "@cawco/core/harness/kinds";
  import { machineLabel } from "@cawco/core/machine-names";
  import type { ProjectPlace } from "#lib/cawco/projects.js";
  import type { Machine } from "#lib/cawco/stores/board.svelte.js";
  import {
    Alert,
    AlertDescription,
    AlertTitle,
  } from "#lib/components/ui/alert/index.js";
  import { Input } from "#lib/components/ui/input/index.js";
  import { LiveDot } from "#lib/components/ui/live-dot/index.js";
  import {
    OptionGroup,
    OptionGroupItem,
  } from "#lib/components/ui/option-group/index.js";
  import { reveal } from "#lib/platform/motion/curves.svelte.js";
  import type { MovePlan, RunningHere } from "./details";
  import Face from "./Face.svelte";
  import Group from "./Group.svelte";
  import MachineChips from "./MachineChips.svelte";
  import { standingWords } from "./words";

  const words = standingWords.move;

  let {
    form,
    place,
    machines,
    to,
    plan,
    onto,
    onfolder,
    oncarry,
    onharness,
    onback,
    onmove,
  }: {
    form: "card" | "sheet";
    /** The place whose folder moves. */
    place: ProjectPlace;
    machines: Machine[];
    /** Where it goes, as far as it is named. */
    to: { machineId: string; folder: string };
    plan: MovePlan;
    onto: (machineId: string) => void;
    onfolder: (folder: string) => void;
    oncarry: (id: string, carry: RunningHere["carry"]) => void;
    onharness: (id: string, harness: HarnessKind) => void;
    onback: () => void;
    onmove: () => void;
  } = $props();

  const folderId = $props.id();
  const toMachine = $derived(
    machines.find((one) => one.machineId === to.machineId) ?? null
  );
  const fromMachine = $derived(
    machines.find((one) => one.machineId === place.machineId) ?? null
  );
  const onSummary = $derived(
    plan.running.some((one) => one.carry === "summary")
  );
</script>

<Face
  {form}
  go={plan.refusal
    ? undefined
    : {
        label: words.go,
        disabled: plan.reach.state === "reading",
        onclick: onmove,
      }}
  {onback}
  title={words.title}
>
  {#snippet lead()}
    <p class="m-0 flex min-w-0 flex-col gap-space-1">
      <span class="type-label text-ink-strong"
        >{fromMachine
          ? machineLabel(fromMachine.hostname)
          : place.machineId}</span
      >
      <span
        class="dir-rtl truncate text-end type-meta text-ink-muted"
        title={place.path}><bdi>{place.path}</bdi></span
      >
    </p>
    <Group title={words.to}>
      <MachineChips
        label={words.to}
        {machines}
        onpick={onto}
        value={to.machineId}
      />
      <label class="sr-only" for={folderId}>{words.folder}</label>
      <Input
        autocomplete="off"
        face="mono"
        id={folderId}
        oninput={(event) => onfolder(event.currentTarget.value)}
        spellcheck="false"
        value={to.folder}
      />
      <p class="m-0 type-meta text-ink-strong text-pretty" aria-live="polite">
        {#if plan.reach.state === "reading"}
          <span class="mark-line flex items-center gap-space-2">
            <LiveDot data-box size="row" />
            <span>{words.reading}</span>
          </span>
        {:else if plan.reach.state === "rename"}
          {words.rename}
        {:else if plan.reach.state === "copy"}
          {words.copy(plan.reach.files, plan.reach.bytes)}
        {:else}
          {words.copy(plan.reach.files, plan.reach.bytes)}
          {words.away(toMachine ? machineLabel(toMachine.hostname) : "")}
        {/if}
      </p>
    </Group>
    {#if plan.refusal}
      <Alert variant="destructive">
        <AlertTitle>{words.stops}</AlertTitle>
        <AlertDescription
          >{plan.refusal.stops} {plan.refusal.todo}</AlertDescription
        >
      </Alert>
    {:else}
      <div class="flex min-w-0 flex-col gap-space-2" in:reveal>
        <p class="m-0 type-body text-ink-strong text-pretty">{words.happens}</p>
        {#if plan.along.length > 0}
          <p class="m-0 type-meta text-ink-muted text-pretty">
            {words.along(plan.along.join(", "))}
          </p>
        {/if}
        {#if plan.noLongerHeldBy}
          <p class="m-0 type-meta text-ink-muted text-pretty">
            {words.unheld(plan.noLongerHeldBy)}
          </p>
        {/if}
        {#if plan.brokenLinks > 0}
          <p class="m-0 type-meta text-ink-muted text-pretty">
            {words.links(plan.brokenLinks)}
          </p>
        {/if}
      </div>
    {/if}
  {/snippet}
  {#snippet trail()}
    {#if plan.running.length > 0}
      <Group title={words.running(plan.running.length)}>
        <ul class="m-0 flex min-w-0 list-none flex-col gap-space-4 p-0">
          {#each plan.running as one (one.id)}
            <li class="flex min-w-0 flex-col gap-space-2">
              <div class="flex min-w-0 items-baseline gap-space-2">
                <span class="min-w-0 truncate type-label text-ink-strong"
                  >{one.title}</span
                >
                {#if one.midTurn}
                  <span class="ms-auto flex-none type-meta text-ink-muted"
                    >{words.midTurn}</span
                  >
                {/if}
              </div>
              {#if one.why}
                <span class="type-meta text-ink-muted text-pretty"
                  >{one.why}</span
                >
              {:else}
                <OptionGroup
                  aria-label={one.title}
                  bind:value={
                    () => [one.carry],
                    (next) => {
                      const [carry] = next;
                      if (carry === "as-is" || carry === "summary") {
                        oncarry(one.id, carry);
                      }
                    }
                  }
                >
                  <OptionGroupItem value="as-is">
                    <span>{words.asIs}</span>
                  </OptionGroupItem>
                  <OptionGroupItem value="summary">
                    <span>{words.summary}</span>
                  </OptionGroupItem>
                </OptionGroup>
              {/if}
              {#if one.carry === "summary"}
                <div class="flex min-w-0 flex-wrap items-center gap-space-2">
                  <span class="type-meta text-ink-muted"
                    >{words.continuesOn}</span
                  >
                  <OptionGroup
                    aria-label={words.continuesOn}
                    bind:value={
                      () => (one.continuesOn ? [one.continuesOn] : []),
                      (next) => {
                        const harness = one.harnesses.find(
                          (kind) => kind === next[0]
                        );
                        if (harness) {
                          onharness(one.id, harness);
                        }
                      }
                    }
                  >
                    {#each one.harnesses as harness (harness)}
                      <OptionGroupItem value={harness}>
                        <span>{harnessName(harness)}</span>
                      </OptionGroupItem>
                    {/each}
                  </OptionGroup>
                </div>
              {/if}
            </li>
          {/each}
        </ul>
        {#if onSummary}
          <p class="m-0 type-meta text-ink-muted text-pretty">
            {words.dropsNote}
          </p>
        {/if}
      </Group>
    {/if}
  {/snippet}
</Face>
