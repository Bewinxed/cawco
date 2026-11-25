<script lang="ts">
  /**
   * First run on the fleet board: the steps to a first project as one staged
   * row, in the shape of the tailnet HTTPS row (NeedsCard `tailnet`): one
   * line and its meta, then every step in order, each with its control and
   * its tick as the hub finds it done. A machine online, a harness signed in
   * on it, the fleet's helpers and step lists (core own-tools.ts: each a
   * pick in place, the recommended side keeping CawCo's way), whether agents
   * may send CawCo usability feedback (core usability-feedback.ts: asked in
   * place, neither answer recommended), the stream
   * relay (Set up, or Later, which ticks it as answered), the first project. A step shows its control only once the step before
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
  import type { OwnToolsChosen } from "@cawco/core/own-tools";
  import { firstRunWords } from "@cawco/core/words/onboarding";
  import { ownToolsWords } from "@cawco/core/words/own-tools";
  import { usabilityFeedbackWords } from "@cawco/core/words/usability-feedback";
  import type { Snippet } from "svelte";
  import FeedbackOptions from "#lib/cawco/config/feedback/FeedbackOptions.svelte";
  import ToolOptions from "#lib/cawco/config/own-tools/ToolOptions.svelte";
  import type { OwnToolPick } from "#lib/cawco/stores/own-tools.svelte.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { IconFolder } from "#lib/icons.js";
  import Caw from "./Caw.svelte";
  import StepRow from "./StepRow.svelte";

  export interface FirstRunState {
    /**
     * Whether agents may send CawCo usability feedback: the person's answer
     * (null until given), whether a machine signs in to GitHub, and why an
     * answer didn't hold.
     */
    feedback: {
      consent: boolean | null;
      fault: string | null;
      signedIn: boolean;
    };
    /** A harness signed in on it, or the sign-in that failed and why. */
    harness:
      | { state: "todo" }
      | { state: "failed"; reason: string }
      | { state: "done"; harness: string };
    /** The first machine: none yet, joined and offline, or online. */
    machine: { state: "todo" } | { state: "offline" | "done"; name: string };
    /** The fleet's helpers and step lists, each null while no person has chosen it. */
    ownTools: OwnToolsChosen;
    /** Why a pick of either didn't hold, or why neither could be read, in words. */
    ownToolsFaults: { helpers: string | null; stepLists: string | null };
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
    onchoose,
    onfeedback,
  }: {
    steps: FirstRunState;
    /** The first machine has just registered: Caw arrives, saying where. */
    arrived?: boolean;
    onaddmachine: (anchor: HTMLElement) => void;
    onsignin: () => void;
    onrelay: () => void;
    onlater: () => void;
    onnewproject: () => void;
    /** A side of the helpers' or the step lists' switch picked, saved at once. */
    onchoose: (pick: OwnToolPick) => void;
    /** The feedback question answered, saved at once. */
    onfeedback: (consent: boolean) => void;
  } = $props();

  const machineName = $derived(
    steps.machine.state === "todo" ? "" : steps.machine.name
  );
  const online = $derived(steps.machine.state === "done");
  const signedIn = $derived(steps.harness.state === "done");

  interface Step {
    /** Its control, once what it needs is done. */
    act?: { label: string; run: (anchor: HTMLElement) => void; later?: true };
    body?: Snippet;
    done: boolean;
    id: string;
    label: string;
    note?: string;
  }

  /**
   * The fleet's two switches as steps: each asked in place while no person
   * has chosen it, then its pick, with where it changes.
   */
  const ownToolSteps = (): Step[] => {
    const { helpers, stepLists } = steps.ownTools;
    const faults = steps.ownToolsFaults;
    return [
      {
        id: "helpers",
        done: helpers !== null,
        label:
          helpers === null
            ? ownToolsWords.stepHelpers
            : ownToolsWords.stepHelpersDone(helpers),
        // Where they change, once, under the last of the two done.
        note:
          faults.helpers ??
          (helpers === null || stepLists !== null
            ? undefined
            : ownToolsWords.stepNote),
        body: helpers === null ? helpersPick : undefined,
      },
      {
        id: "step-lists",
        done: stepLists !== null,
        label:
          stepLists === null
            ? ownToolsWords.stepStepLists
            : ownToolsWords.stepStepListsDone(stepLists),
        note:
          faults.stepLists ??
          (stepLists === null ? undefined : ownToolsWords.stepNote),
        body: stepLists === null ? stepListsPick : undefined,
      },
    ];
  };

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
      ...ownToolSteps(),
      {
        id: "feedback",
        done: steps.feedback.consent !== null,
        label:
          steps.feedback.consent === null
            ? usabilityFeedbackWords.step
            : usabilityFeedbackWords.stepDone(steps.feedback.consent),
        note:
          steps.feedback.fault ??
          (steps.feedback.consent === null
            ? undefined
            : usabilityFeedbackWords.stepNote),
        body: steps.feedback.consent === null ? feedbackPick : undefined,
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

{#snippet helpersPick()}
  <ToolOptions
    label={ownToolsWords.stepHelpers}
    onpick={(value) => onchoose({ key: "helpers", value })}
    options={ownToolsWords.helpers.options}
    recommended="delegates"
    value={steps.ownTools.helpers}
  />
{/snippet}

{#snippet feedbackPick()}
  <div class="flex min-w-0 flex-col gap-space-2">
    <p class="m-0 text-pretty text-tx type-body">
      {usabilityFeedbackWords.question}
    </p>
    <FeedbackOptions
      onpick={onfeedback}
      signedIn={steps.feedback.signedIn}
      value={steps.feedback.consent}
    />
  </div>
{/snippet}

{#snippet stepListsPick()}
  <ToolOptions
    label={ownToolsWords.stepStepLists}
    onpick={(value) => onchoose({ key: "stepLists", value })}
    options={ownToolsWords.stepLists.options}
    recommended="cawco"
    value={steps.ownTools.stepLists}
  />
{/snippet}

<section
  aria-label={firstRunWords.title}
  class="mx-auto flex w-full max-w-104 flex-col items-stretch gap-space-4"
>
  <figure class="m-0 flex flex-col items-center gap-space-2">
    <Caw
      next={["ready", "sleeping"]}
      present
      size={112}
      status={steps.machine.state === "todo" ? "sleeping" : "ready"}
    />
    {#if arrived && machineName}
      <figcaption class="text-center text-tx-2 type-body">
        {firstRunWords.arrived(machineName)}
      </figcaption>
    {/if}
  </figure>

  <!-- mark-line: the folder glyph heads the title and its meta as a pair in the lead column; the steps below are rows of their own. -->
  <div
    data-slot="first-run"
    class="grid grid-cols-(--row-cols) gap-x-space-3 rounded-lg bg-bg p-space-4 shadow-sm"
    style:--row-cols="var(--spacing-row-compact) minmax(0, 1fr)"
  >
    <span class="row-span-2 mark-cell"
      ><IconFolder aria-hidden="true" class="size-icon-md text-tx-2" /></span
    >
    <h2 class="m-0 text-tx type-label">{firstRunWords.title}</h2>
    <span class="text-tx-2 type-meta num"
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
          <!-- A done step's note goes, but the relay's answer and where the
               two switches change stay. -->
          {#if one.note && (!one.done || one.id === "relay" || one.id === "helpers" || one.id === "step-lists" || one.id === "feedback")}
            <span
              data-slot="step-note"
              class={[
                "col-start-2 min-w-0 wrap-anywhere type-meta",
                (one.id === "harness" && steps.harness.state === "failed") ||
                (one.id === "helpers" && steps.ownToolsFaults.helpers) ||
                (one.id === "step-lists" && steps.ownToolsFaults.stepLists) ||
                (one.id === "feedback" && steps.feedback.fault)
                  ? "text-red"
                  : "text-tx-2",
              ]}>{one.note}</span
            >
          {/if}
          {#if one.body}
            <div class="col-start-2 mt-space-1 min-w-0">
              {@render one.body()}
            </div>
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
                onclick={(event: MouseEvent & { currentTarget: HTMLElement }) =>
                  act.run(event.currentTarget)}
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
