<script lang="ts">
  import { DAY_MS } from "@cawco/core/time";
  import { conditionWords as words } from "@cawco/core/words/conditions";
  /**
   * A condition a task waits on, under its row in Waits on (TaskNeeds):
   * where it stands, told by its state (hub routine-stop.ts), and what you can
   * do to it beside it (DESIGN.md, Flow):
   * - checking, not yet, could not check: its last words and when it checks
   *   next and stops; Mark met, Start anyway;
   * - timed out: Keep checking, until a new day or none; Start anyway; Mark met;
   * - failing: Check again; Start anyway; Mark met;
   * - paused: Resume; Start anyway;
   * - deleted, or no condition: Start anyway.
   *
   * Start anyway takes this task's wait away, the condition and every other
   * task on it as they are; it is offered on the task's own wait only, an
   * inherited one being its whole's. Mark met frees every task and plan step
   * waiting on it, so it first says so beside the condition (ceremony
   * matches consequence). A refusal stays under the row in the hub's words.
   */
  import { Button } from "#lib/components/ui/button/index.js";
  import { Input } from "#lib/components/ui/input/index.js";
  import { failureWords as message } from "#lib/platform/hub-read.js";
  import { formatDistanceToNow } from "#lib/utils/time.js";
  import {
    linkTask,
    readTask,
    type TaskView,
    type TaskWait,
  } from "../project-tasks";
  import RowFault from "../RowFault.svelte";
  import {
    checkConditionAgain,
    markConditionMet,
    updateRoutine,
  } from "../routines/routines-api";
  import { whenOf } from "../routines/schedule";

  let {
    projectId,
    taskId,
    wait,
    onchanged,
  }: {
    projectId: string;
    taskId: string;
    wait: TaskWait;
    /** The hub wrote the task, or the condition it waits on moved. */
    onchanged: (task: TaskView) => void;
  } = $props();

  const condition = $derived(wait.condition);
  const DAY = new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  const dayOf = (at: number) => DAY.format(at);
  const ago = (at: number) => formatDistanceToNow(new Date(at));

  /** What it says under its row: one sentence, by its state. */
  const said = $derived.by((): string | null => {
    if (!condition) {
      return words.deleted;
    }
    switch (condition.state) {
      case "checking":
        return words.checkingLine;
      case "not-yet":
        return condition.reason;
      case "could-not-check":
        return condition.reason ? words.couldNotCheck(condition.reason) : null;
      case "timed-out":
        return words.timedOut(
          dayOf(condition.deadline ?? Date.now()),
          condition.reason
        );
      case "failing":
        return words.failing(condition.reason);
      case "paused":
        return words.paused;
      case "asked":
        return words.askedLine(condition.reason);
      case "met":
        return condition.markedMet
          ? words.markedMet(ago(condition.metAt ?? Date.now()))
          : words.metBy(
              condition.evidence ?? "",
              ago(condition.metAt ?? Date.now())
            );
      case "deleted":
        return words.deleted;
    }
  });

  /** Its quieter facts: when it was checked, when it checks next, when it stops. */
  const facts = $derived.by((): string[] => {
    if (!condition) {
      return [];
    }
    const checked =
      condition.checkedAt === null
        ? []
        : [words.checkedAt(ago(condition.checkedAt))];
    const stops =
      condition.deadline === null
        ? words.noDeadline
        : words.stopsAt(dayOf(condition.deadline));
    switch (condition.state) {
      case "not-yet":
        return [
          ...checked,
          ...(condition.nextAt === null
            ? []
            : [words.nextCheckAt(whenOf(condition.nextAt))]),
          stops,
        ];
      case "could-not-check":
        return [
          ...checked,
          ...(condition.nextAt === null
            ? []
            : [words.triesAgainAt(whenOf(condition.nextAt))]),
        ];
      case "checking":
        return [stops];
      case "met":
      case "timed-out":
      case "failing":
      case "asked":
      case "paused":
      case "deleted":
        return [];
    }
  });

  const standing = $derived(condition?.state ?? "deleted");
  const own = $derived(wait.via === null);

  let acting = $state<string | null>(null);
  let fault = $state<string | null>(null);
  let asking = $state(false);
  /** Keep checking's new day, as the date field holds it ("2026-12-01"); blank: until met. */
  let until = $state("");

  /** One act: the hub's answer read back as the task, or its refusal under the row in `refused`'s words. */
  async function act(
    name: string,
    go: () => Promise<unknown>,
    refused: (why: string) => string
  ) {
    acting = name;
    fault = null;
    try {
      await go();
      onchanged(await readTask(projectId, taskId));
      asking = false;
    } catch (error) {
      fault = refused(message(error));
    } finally {
      acting = null;
    }
  }

  const routineId = $derived(condition?.routineId ?? "");
  const startAnyway = () =>
    act(
      "start",
      () =>
        linkTask(projectId, taskId, { waitsOn: [wait.target], remove: true }),
      words.refusedStartAnyway
    );
  const markMet = () =>
    act("met", () => markConditionMet(routineId), words.refusedMarkMet);
  const checkAgain = () =>
    act("again", () => checkConditionAgain(routineId), words.refusedCheckAgain);
  const keepChecking = () =>
    act(
      "keep",
      () =>
        checkConditionAgain(
          routineId,
          until ? new Date(`${until}T23:59:59`).getTime() : null
        ),
      words.refusedCheckAgain
    );
  const resume = () =>
    act(
      "resume",
      () => updateRoutine(routineId, { enabled: true }),
      words.refusedResume
    );
</script>

<div data-slot="condition" class="flex flex-col gap-space-2 min-w-0 ps-space-1">
  {#if said}
    <p class="m-0 type-body text-ink-strong wrap-break-word">{said}</p>
  {/if}
  {#if facts.length > 0}
    <p class="m-0 flex flex-wrap gap-x-space-2 type-meta text-ink-muted">
      {#each facts as fact (fact)}
        <span>{fact}</span>
      {/each}
    </p>
  {/if}
  {#if standing === "timed-out"}
    <label
      class="flex flex-wrap items-center gap-space-2 type-label text-ink-muted"
    >
      <span>{words.keepCheckingUntil}</span>
      <Input
        class="w-auto"
        min={new Date(Date.now() + DAY_MS).toISOString().slice(0, 10)}
        type="date"
        bind:value={until}
      />
      <span class="type-meta">{words.keepCheckingHint}</span>
    </label>
  {/if}
  {#if asking}
    <p class="m-0 type-body text-ink-strong">{words.markMetAsk}</p>
  {/if}
  <div data-slot="acts" class="flex flex-wrap items-center gap-space-2">
    {#if asking}
      <Button
        label={words.markMet}
        onclick={markMet}
        pending={acting === "met"}
        size="xs"
        variant="secondary"
      />
      <Button
        disabled={acting !== null}
        label={words.cancel}
        onclick={() => {
          asking = false;
        }}
        size="xs"
        variant="ghost"
      />
    {:else}
      {#if standing === "timed-out"}
        <Button
          disabled={acting !== null}
          label={words.keepChecking}
          onclick={keepChecking}
          pending={acting === "keep"}
          size="xs"
          variant="secondary"
        />
      {:else if standing === "failing"}
        <Button
          disabled={acting !== null}
          label={words.checkAgain}
          onclick={checkAgain}
          pending={acting === "again"}
          size="xs"
          variant="secondary"
        />
      {:else if standing === "paused"}
        <Button
          disabled={acting !== null}
          label={words.resume}
          onclick={resume}
          pending={acting === "resume"}
          size="xs"
          variant="secondary"
        />
      {/if}
      {#if own}
        <Button
          disabled={acting !== null}
          label={words.startAnyway}
          onclick={startAnyway}
          pending={acting === "start"}
          size="xs"
          variant="ghost"
        />
      {/if}
      {#if condition}
        <Button
          disabled={acting !== null}
          label={words.markMet}
          onclick={() => {
            asking = true;
          }}
          size="xs"
          variant="ghost"
        />
      {/if}
    {/if}
  </div>
  <RowFault reason={fault} />
</div>
