<script lang="ts">
  /**
   * First run on the fleet board: the steps to a first project as one staged
   * row, in the shape of the tailnet HTTPS row (NeedsCard `tailnet`): one
   * line and its meta, then every step in order, each with its control and
   * its tick as the hub finds it done. A machine online, a harness signed in
   * on it, the stream relay (Set up, or Later, which ticks it as answered),
   * the first project. A step shows its control only once the step before
   * it that it needs is done (the relay and the project need a machine; the
   * project needs a harness), and the one step to do next takes the coral.
   *
   * Caw stands centred over the row, the mark over what is drawn under him
   * (DESIGN.md, The Alignment Rule). Asleep until a machine joins; the first machine registering is
   * his arrival, the one moment of delight the first run spends (DESIGN.md,
   * The Frequency Rule: "Delight … belongs only to what is rare: the first
   * run"), with the line naming the machine. The row leaves once every step
   * is done and never comes back.
   *
   * Its state arrives as props (FirstRun.stories.ts): the board reads it
   * from the hub's machines, accounts and projects, and the relay's answer.
   */
  import { firstRunWords } from "@cawco/core/words/onboarding";
  import { Button } from "#lib/components/ui/button/index.js";
  import { IconFolder } from "#lib/icons.js";
  import Caw from "./Caw.svelte";
  import StepRow from "./StepRow.svelte";

  export interface FirstRunState {
    /** A harness signed in on it, or the sign-in that failed and why. */
    harness:
      | { state: "todo" }
      | { state: "failed"; reason: string }
      | { state: "done"; harness: string };
    /** The first machine: none yet, joined and offline, or online. */
    machine: { state: "todo" } | { state: "offline" | "done"; name: string };
    /** The first project exists. */
    project: boolean;
    /** The stream relay: not answered, put off (Later), or set up. */
    relay: "todo" | "later" | "done";
  }

  let {
    steps,
    arrived = false,
    onaddmachine,
    onsignin,
    onrelay,
    onlater,
    onnewproject,
  }: {
    steps: FirstRunState;
    /** The first machine has just registered: Caw arrives, saying where. */
    arrived?: boolean;
    onaddmachine: (anchor: HTMLElement) => void;
    onsignin: () => void;
    onrelay: () => void;
    onlater: () => void;
    onnewproject: () => void;
  } = $props();

  const machineName = $derived(
    steps.machine.state === "todo" ? "" : steps.machine.name
  );
  const online = $derived(steps.machine.state === "done");
  const signedIn = $derived(steps.harness.state === "done");

  interface Step {
    /** Its control, once what it needs is done. */
    act?: { label: string; run: (anchor: HTMLElement) => void; later?: true };
    done: boolean;
    id: "machine" | "harness" | "relay" | "project";
    label: string;
    note?: string;
  }

  const list = $derived.by<Step[]>(() => {
    const { harness } = steps;
    return [
      {
        id: "machine",
        done: online,
        label: online
          ? firstRunWords.machineOnline(machineName)
          : firstRunWords.machine,
        note:
          steps.machine.state === "offline"
            ? firstRunWords.machineOffline(machineName)
            : firstRunWords.machineNote,
        act: online
          ? undefined
          : { label: firstRunWords.machine, run: onaddmachine },
      },
      {
        id: "harness",
        done: signedIn,
        label:
          harness.state === "done"
            ? firstRunWords.harnessDone(harness.harness, machineName)
            : firstRunWords.harness,
        note:
          harness.state === "failed"
            ? harness.reason
            : firstRunWords.harnessNote(machineName || "it"),
        act:
          online && !signedIn
            ? { label: firstRunWords.signIn, run: () => onsignin() }
            : undefined,
      },
      {
        id: "relay",
        done: steps.relay !== "todo",
        label:
          steps.relay === "done"
            ? firstRunWords.relayLive
            : firstRunWords.relay,
        note:
          steps.relay === "later"
            ? firstRunWords.relayAnswered
            : firstRunWords.relayNote,
        act:
          online && steps.relay === "todo"
            ? { label: firstRunWords.relaySetUp, run: () => onrelay() }
            : undefined,
      },
      {
        id: "project",
        done: steps.project,
        label: firstRunWords.project,
        act:
          signedIn && !steps.project
            ? { label: firstRunWords.newProject, run: () => onnewproject() }
            : undefined,
      },
    ];
  });
  const doneCount = $derived(list.filter((step) => step.done).length);
  /** The one step to do next: its control takes the coral. */
  const next = $derived(list.find((step) => !step.done && step.act)?.id);
</script>

<section
  aria-label={firstRunWords.title}
  class="mx-auto flex w-full max-w-c-page-line flex-col items-stretch gap-space-5"
>
  <figure class="m-0 flex flex-col items-center gap-space-2">
    <Caw
      next={["ready", "sleeping"]}
      present
      size={112}
      status={steps.machine.state === "todo" ? "sleeping" : "ready"}
    />
    {#if arrived && machineName}
      <figcaption class="type-body text-center text-ink-muted">
        {firstRunWords.arrived(machineName)}
      </figcaption>
    {/if}
  </figure>

  <!-- mark-line: the folder glyph heads the title and its meta as a pair in the lead column; the steps below are rows of their own. -->
  <div
    data-slot="first-run"
    class="grid grid-cols-(--row-cols) gap-x-space-3 rounded-lg bg-surface-raised p-space-4 shadow-tile"
    style:--row-cols="var(--spacing-c-mark) minmax(0, 1fr)"
  >
    <span class="mark-cell row-span-2"
      ><IconFolder
        aria-hidden="true"
        class="size-icon-md text-ink-muted"
      /></span
    >
    <h2 class="m-0 type-label text-ink-strong">{firstRunWords.title}</h2>
    <span class="type-meta num text-ink-muted"
      >{firstRunWords.meta(doneCount, list.length)}</span
    >
    <!-- biome-ignore-start lint/a11y/noRedundantRoles : WebKit drops a list's semantics once its markers are styled away (VoiceOver reads no list); these steps are still a numbered list. -->
    <ol
      data-slot="steps"
      class="col-start-2 mx-0 mt-space-3 mb-0 grid list-none gap-space-3 p-0"
      role="list"
    >
      <!-- biome-ignore-end lint/a11y/noRedundantRoles: the list above -->
      {#each list as one, index (one.id)}
        <StepRow
          done={one.done}
          doneWord={firstRunWords.stepDone}
          label={one.label}
          n={index + 1}
          step={one.id}
        >
          {#if one.note && (!one.done || one.id === "relay")}
            <span
              data-slot="step-note"
              class={[
                "col-start-2 min-w-0 type-meta wrap-anywhere",
                one.id === "harness" && steps.harness.state === "failed"
                  ? "text-status-fail-ink"
                  : "text-ink-muted",
              ]}>{one.note}</span
            >
          {/if}
          {#if one.act}
            {@const act = one.act}
            <div
              data-slot="step-act"
              class="col-start-2 mt-space-1 flex min-w-0 flex-wrap gap-space-2"
              data-box
            >
              <Button
                label={act.label}
                onclick={(event: MouseEvent) =>
                  act.run(event.currentTarget as HTMLElement)}
                size="sm"
                variant={next === one.id ? "default" : "outline"}
              />
              {#if one.id === "relay"}
                <Button
                  label={firstRunWords.relayLater}
                  onclick={() => onlater()}
                  size="sm"
                  variant="ghost"
                />
              {/if}
            </div>
          {/if}
        </StepRow>
      {/each}
    </ol>
  </div>
</section>
