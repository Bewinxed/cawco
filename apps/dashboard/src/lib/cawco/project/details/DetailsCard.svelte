<script lang="ts">
  /**
   * A project's details, as one card hung from the head's place mark
   * (DetailsHang): is it all right, then how it is set, then every change
   * one press makes. It reads top to bottom in four strata, each lighter
   * than the one above it:
   *
   * 1. The top line (Verdict): whether agents can start, the section in
   *    trouble by name, with Done at its end. It stays while the body
   *    scrolls under it.
   * 2. The two things agents need before they start: Files and locations,
   *    and AI account, side by side.
   * 3. The two rules for what agents produce: Finished code and Task list.
   * 4. What agents work on and where big files are kept (Codebases and big
   *    files), across both columns at the foot.
   *
   * Every section stands under a hairline (Section), so each reads as its
   * own unit.
   *
   * Two equal columns from 680 of card room, read across then down, so the
   * top line's two possible causes sit together in the first row; under
   * that, one column in the same order. A project with no code has no
   * Finished code and no Codebases and big files.
   *
   * A change that needs a destination or a sign-in takes the card's body
   * as a step (FolderStep, TaskListStep), its bar "‹ Project details", the
   * step's name, Done; the body's height follows it (`morph`). The step's
   * answers live with the card's owner, so closing the card loses nothing
   * and opening it again returns to the step. While the hub is out of reach
   * every control is sunk, so the person learns before pressing that
   * changes cannot be sent.
   */
  import { bringIntoView } from "@cawco/core/bring-into-view";
  import { commonWords } from "@cawco/core/words/common";
  import { cardWords } from "@cawco/core/words/project-details";
  import { BarGlass, BarItem } from "#lib/components/ui/bar-glass/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import HeadFade from "#lib/components/ui/scroll-edge/head-fade.svelte";
  import { IconChevronLeft, IconClose } from "#lib/icons.js";
  import { crossIn } from "#lib/platform/motion/curves.svelte.js";
  import { morph } from "#lib/platform/motion/morph.svelte.js";
  import { cn } from "#lib/utils.js";
  import AccountSection from "./AccountSection.svelte";
  import CodeStorageSection from "./CodeStorageSection.svelte";
  import type {
    CardActs,
    CardOpen,
    Computer,
    Details,
    FolderStepFacts,
    PendingChanges,
    StepState,
    TaskStepFacts,
  } from "./details";
  import FilesSection from "./FilesSection.svelte";
  import FinishedCodeSection from "./FinishedCodeSection.svelte";
  import FolderStep from "./FolderStep.svelte";
  import { stepTitle } from "./step-title";
  import TaskListSection from "./TaskListSection.svelte";
  import TaskListStep from "./TaskListStep.svelte";
  import Verdict from "./Verdict.svelte";
  import { type Trouble, verdictOf } from "./verdict";

  let {
    details,
    pending = {},
    fleet,
    step,
    opened = $bindable(),
    folderFacts,
    taskFacts,
    phone = false,
    acts,
  }: {
    details: Details;
    pending?: PendingChanges;
    fleet: Computer[];
    step: StepState;
    opened: CardOpen;
    folderFacts: FolderStepFacts;
    taskFacts: TaskStepFacts;
    /** It stands in the kit's bottom sheet: the sheet's bar is its bar. */
    phone?: boolean;
    acts: CardActs;
  } = $props();

  const verdict = $derived(verdictOf(details));
  const sunk = $derived(!details.hub.reachable);
  const folders = $derived(
    details.folders.state === "read" ? details.folders.value : []
  );
  /** The computers holding one of the project's folders: Copy to computer can't pick them. */
  const holders = $derived(
    folders.filter((f) => f.role !== "builtin").map((f) => f.machine.id)
  );
  const stepFolder = $derived.by(() => {
    const now = step;
    return now?.kind === "folder"
      ? (folders.find((f) => f.id === now.folderId) ?? null)
      : null;
  });

  let body = $state<HTMLElement | null>(null);
  /** The account combobox stands open: One account was pressed. */
  let picking = $state(false);

  /** The top line's press: focus moves to the troubled row's fix. */
  function jump(section: Trouble): void {
    const at = body?.querySelector<HTMLElement>(
      section === "tasks"
        ? '[data-section="tasks"] [data-facts] button'
        : `[data-section="${section}"] [data-trouble] button`
    );
    if (at) {
      bringIntoView(at, { behavior: "smooth" });
    }
    at?.focus({ preventScroll: true });
  }
</script>

<div
  class={cn(
    "@container/card flex min-h-0 min-w-0 flex-col",
    phone
      ? "w-full flex-1 pt-(--sheet-room)"
      : "relative max-h-(--details-room) w-c-details-card-w max-w-full timeline-scope-transcript-head @min-details-wide/shell:w-c-details-card-w-wide"
  )}
  data-details-card
  data-project-details
  data-step={step?.kind ?? "card"}
>
  {#if step === null}
    <header
      class={cn(
        "flex flex-none flex-wrap items-center justify-between gap-x-space-3 gap-y-space-1",
        phone ? "px-space-1 pb-space-3" : "px-space-5 pt-space-4 pb-space-3"
      )}
    >
      <Verdict onjump={jump} ontry={acts.tryAgain} {verdict} />
      {#if !phone}
        <!-- On a bar's line, so Done stands where the step's bar puts it. -->
        <span class="flex min-h-c-btn-h items-center">
          <Button onclick={acts.close} size="sm" variant="outline"
            >{cardWords.done}</Button
          >
        </span>
      {/if}
    </header>
  {:else}
    <!-- The step's one bar: Back, its name, then Done on a desk and Close
         on a phone, whose sheet draws no bar of its own while a step
         stands (DetailsHang, `ownHead`). Its edges are the card's. -->
    <header
      class={cn(
        "grid flex-none grid-cols-3 items-center gap-space-3",
        phone ? "px-space-1 pb-space-3" : "px-space-5 pt-space-4 pb-space-3"
      )}
    >
      <span class="flex">
        <BarGlass form="group">
          <BarItem
            icon={IconChevronLeft}
            label={commonWords.backTo(cardWords.back)}
            onclick={acts.back}
          />
        </BarGlass>
      </span>
      <h3
        class="m-0 truncate text-center type-label font-medium text-ink-strong"
      >
        {stepTitle(step)}
      </h3>
      <span class="flex justify-end">
        {#if phone}
          <BarGlass form="group">
            <BarItem
              icon={IconClose}
              label={commonWords.close}
              onclick={acts.close}
            />
          </BarGlass>
        {:else}
          <Button onclick={acts.close} size="sm" variant="outline"
            >{cardWords.done}</Button
          >
        {/if}
      </span>
    </header>
  {/if}

  <div class="relative flex min-h-0 flex-1 flex-col">
    {#if !phone}
      <HeadFade band="var(--spacing-space-6)" tint="bg-surface-raised" />
    {/if}
    <div
      bind:this={body}
      class={cn(
        "min-h-0 flex-1 overflow-y-auto overscroll-contain",
        phone
          ? "px-space-1 pb-space-5"
          : "scroll-timeline-transcript-head px-space-5 pt-space-2 pb-space-5"
      )}
      data-details-body
    >
      <div {@attach morph({ followUnfolds: true })}>
        {#key step === null ? "card" : step.kind}
          <div in:crossIn>
            {#if step === null}
              <div
                class="grid grid-cols-1 gap-x-space-7 gap-y-space-6 @min-details-card/card:grid-cols-2"
              >
                <FilesSection
                  asOf={details.hub.reachable ? null : details.hub.readAt}
                  bind:confirming={opened.disconnect}
                  callingOff={pending.locate}
                  disconnecting={pending.disconnect}
                  {fleet}
                  folders={details.folders}
                  onact={acts.folderAct}
                  oncalloff={acts.callOffLocate}
                  ondisconnect={acts.disconnect}
                  bind:openFolder={opened.folder}
                  ontry={acts.tryAgain}
                  running={details.running}
                  {sunk}
                />
                <AccountSection
                  ai={details.ai}
                  onpick={acts.pick}
                  onsignin={acts.signIn}
                  ontry={acts.tryAgain}
                  pending={pending.account}
                  pendingLimit={pending.atLimit}
                  bind:picking
                  {sunk}
                />
                {#if details.hasCode}
                  <FinishedCodeSection
                    finished={details.finished}
                    onpick={acts.pick}
                    ontry={acts.tryAgain}
                    pending={pending.finished}
                    {sunk}
                  />
                {/if}
                <TaskListSection
                  bind:confirmStop={opened.stopUpdating}
                  onchange={() => {
                    const kind =
                      details.tasks.state === "read"
                        ? details.tasks.value.kind
                        : "here";
                    acts.connectTasks(
                      kind === "linear" ? "linear" : "github",
                      true
                    );
                  }}
                  onconnect={(provider) => acts.connectTasks(provider, false)}
                  onpick={acts.pick}
                  onrefresh={acts.refreshTasks}
                  ontry={acts.tryAgain}
                  pending={pending.tasks}
                  {sunk}
                  tasks={details.tasks}
                />
                {#if details.hasCode}
                  <!-- What agents work on and where big files are kept,
                       across both columns at the card's foot. -->
                  <div class="col-span-full">
                    <CodeStorageSection
                      bigFiles={details.bigFiles}
                      codebases={details.codebases}
                      bind:draft={opened.bigDraft}
                      ondefaults={() =>
                        acts.pick({ section: "bigFiles", value: "defaults" })}
                      onsave={acts.saveBigFiles}
                      ontry={acts.tryAgain}
                      pending={pending.bigFiles}
                      signIns={details.bigFileSignIns}
                      {sunk}
                    />
                  </div>
                {/if}
              </div>
            {:else if step.kind === "folder"}
              <FolderStep
                facts={folderFacts}
                {fleet}
                folder={stepFolder}
                {holders}
                oncalloff={acts.callOff}
                oncancel={acts.cancelStep}
                ondone={acts.close}
                oninterrupt={acts.interrupt}
                onrun={acts.run}
                onstep={acts.step}
                ontryleft={acts.tryLeft}
                ontrystage={acts.tryStage}
                {step}
                {sunk}
              />
            {:else}
              <TaskListStep
                facts={taskFacts}
                oncancel={acts.cancelStep}
                onsearch={acts.searchTargets}
                onstart={acts.run}
                onstep={acts.step}
                ontry={acts.tryAgain}
                {step}
                {sunk}
              />
            {/if}
          </div>
        {/key}
      </div>
    </div>
  </div>
</div>
