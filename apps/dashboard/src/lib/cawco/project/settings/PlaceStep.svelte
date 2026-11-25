<script lang="ts">
  /**
   * A place's step, opened under its row from its ⋯ menu: Move, Change
   * path or Copy elsewhere, in the house's opened form (opened-form.ts), as
   * Add folder's is. It asks where (the machine, for Move and Copy; the
   * folder's path), says what will happen there before anything runs, read
   * from the machine by the hub (`flow.forecast`), and lists the agents
   * working in the folder a move pauses; pressed, it follows the act's
   * stages, with Call off while it can, and then says what it did. What the
   * hub refused stands by the act's button in its words.
   */
  import { stepWords } from "@cawco/core/words/project-details";
  import { settingsViewWords as words } from "@cawco/core/words/settings-view";
  import Field from "#lib/cawco/config/Field.svelte";
  import RowFault from "#lib/cawco/RowFault.svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import { Input } from "#lib/components/ui/input/index.js";
  import { unfold } from "#lib/platform/motion/fold.svelte.js";
  import type { FlowEvent, PlaceFlow } from "./changes";
  import MachinePick from "./MachinePick.svelte";
  import { FORM_FIELD, FORM_LABEL, OPENED_FORM } from "./opened-form";
  import type { FleetMachine } from "./records";

  let {
    flow,
    machines,
    disabled,
    onflow,
  }: {
    flow: PlaceFlow;
    /** The fleet's machines, for where Move and Copy go. */
    machines: FleetMachine[];
    disabled: boolean;
    onflow: (event: FlowEvent) => void;
  } = $props();

  const uid = $props.id();

  const TITLES = {
    move: words.places.move,
    find: words.places.findFolder,
    copy: words.places.copyToMachine,
  } as const;
  const title = $derived(TITLES[flow.act]);
  /** Change path stays on the place's own machine: only Move and Copy ask where. */
  const asksMachine = $derived(flow.act !== "find");
  const machine = $derived(
    machines.find((one) => one.id === flow.machineId) ?? null
  );
  const phase = $derived.by(() => {
    if (flow.after) {
      return "after";
    }
    return flow.run ? "running" : "edit";
  });
  const ready = $derived(
    flow.forecast.state === "ready" &&
      flow.path.trim() !== "" &&
      flow.machineId !== null
  );

  function submit(event: SubmitEvent) {
    event.preventDefault();
    if (!disabled && ready && !flow.sending) {
      onflow({ kind: "run" });
    }
  }
</script>

<form
  aria-label={title}
  class={OPENED_FORM}
  data-slot="place-step"
  onsubmit={submit}
  transition:unfold
>
  <p class="m-0 text-tx type-label">{title}</p>

  {#if phase === "edit"}
    {#if asksMachine}
      <div class={FORM_FIELD}>
        <p class={FORM_LABEL} id="{uid}-machine">
          {words.places.machineLabel}
        </p>
        <MachinePick
          {disabled}
          labelledby="{uid}-machine"
          {machines}
          onpick={(next) =>
            onflow({ kind: "draft", machineId: next, path: flow.path })}
          value={flow.machineId}
        />
      </div>
    {/if}
    <Field id="{uid}-path" label={words.places.folderPath}>
      <Input
        id="{uid}-path"
        autocomplete="off"
        {disabled}
        face="mono"
        oninput={(event) =>
          onflow({
            kind: "draft",
            machineId: flow.machineId,
            path: event.currentTarget.value,
          })}
        placeholder={machine ? `${machine.home}/` : "/"}
        spellcheck="false"
        value={flow.path}
      />
    </Field>

    <!-- What will happen, read from the machine before anything runs. -->
    <div aria-live="polite" class={FORM_FIELD}>
      <p class={FORM_LABEL}>{stepWords.whatHappens}</p>
      {#if flow.forecast.state === "none"}
        <p class="m-0 text-pretty text-tx-2 type-meta">
          {stepWords.pickFirst}
        </p>
      {:else if flow.forecast.state === "checking"}
        <p class="m-0 text-tx-2 type-meta">
          {stepWords.checking(flow.forecast.machine)}
        </p>
      {:else if flow.forecast.state === "ready"}
        <ul class="m-0 flex list-none flex-col gap-space-1 p-0">
          {#each flow.forecast.lines as line, at (at)}
            <li class="text-pretty text-tx type-meta">{line}</li>
          {/each}
        </ul>
      {:else}
        <RowFault reason={flow.forecast.why} />
        {#if flow.forecast.todo}
          <p class="m-0 text-pretty text-tx-2 type-meta">
            {flow.forecast.todo}
          </p>
        {/if}
      {/if}
    </div>

    {#if flow.agents.length > 0}
      <!-- The agents a move pauses, each one following the files. -->
      <div class={FORM_FIELD}>
        <p class={FORM_LABEL}>{stepWords.agentsHere(flow.agents.length)}</p>
        <ul class="m-0 flex list-none flex-col gap-space-2 p-0">
          {#each flow.agents as agent (agent.id)}
            <li class="flex min-w-0 flex-wrap items-center gap-space-2">
              <span class="min-w-0 flex-auto text-tx type-meta"
                >{agent.name}
                <span class="text-tx-2"
                  >{agent.carry.way === "same"
                    ? stepWords.same
                    : stepWords.summary}</span
                ></span
              >
              {#if agent.replying}
                <span class="text-tx-2 type-meta">{stepWords.replying}</span>
                <Button
                  {disabled}
                  label={stepWords.interrupt}
                  onclick={() =>
                    onflow({ kind: "interrupt", agentId: agent.id })}
                  size="xs"
                  type="button"
                  variant="outline"
                />
              {/if}
            </li>
          {/each}
        </ul>
      </div>
    {/if}
  {:else if phase === "running" && flow.run}
    <!-- Its stages in order, the one it stands on marked. -->
    <ol aria-live="polite" class="m-0 flex list-none flex-col gap-space-1 p-0">
      {#each flow.run.stages as stage, at (at)}
        <li class={["type-meta", at === flow.run.at ? "text-tx" : "text-tx-2"]}>
          {stage}{#if at === flow.run.at && flow.run.progress}<span
              class="text-tx-2 num"
            >
              · {flow.run.progress}</span
            >{/if}
        </li>
      {/each}
    </ol>
    {#if flow.run.waitingFor}
      <p class="m-0 text-pretty text-tx-2 type-meta">
        {stepWords.waiting(flow.run.waitingFor)}
      </p>
    {/if}
    {#if flow.run.failed}
      <RowFault
        again={() => onflow({ kind: "tryStage" })}
        againLabel={stepWords.tryStage}
        details={flow.run.failed.words}
        reason={stepWords.stageFailed(flow.run.failed.stage)}
      />
    {/if}
  {:else if flow.after}
    <ul class="m-0 flex list-none flex-col gap-space-1 p-0">
      {#each flow.after.lines as line, at (at)}
        <li class="text-pretty text-tx type-meta">{line}</li>
      {/each}
    </ul>
  {/if}

  <RowFault reason={flow.refused} />

  <div class="flex justify-end gap-space-2">
    {#if phase === "edit"}
      <Button
        label={words.cancel}
        onclick={() => onflow({ kind: "close" })}
        size="sm"
        type="button"
        variant="ghost"
      />
      <Button
        disabled={disabled || !ready}
        label={title}
        pending={flow.sending}
        size="sm"
        type="submit"
      />
    {:else if phase === "running"}
      {#if flow.run?.callOff}
        <Button
          {disabled}
          label={stepWords.callOff}
          onclick={() => onflow({ kind: "callOff" })}
          size="sm"
          type="button"
          variant="outline"
        />
      {/if}
    {:else}
      <Button
        label={stepWords.done}
        onclick={() => onflow({ kind: "close" })}
        size="sm"
        type="button"
      />
    {/if}
  </div>
</form>
