<script lang="ts">
  /**
   * The stage: whatever this stage kind makes central, drawn whole at its
   * own size, one at a time. Kind `you`: the result. Active: the live
   * attempt, or nobody on it. To do and waiting: the wait map. Done: what
   * landed. A failed or stopped last attempt replaces what its stage would
   * draw; dropped: the reason. A change of what it draws crosses over in
   * place. Before the first read its skeleton stands at the stage's size.
   */
  import { crossIn, reveal } from "#lib/cawco/motion/curves.svelte.js";
  import { Skeleton } from "#lib/components/ui/skeleton/index.js";
  import type { StageShow, TaskRead } from "./records";
  import StageEnded from "./StageEnded.svelte";
  import StageLive from "./StageLive.svelte";
  import StageOutputs from "./StageOutputs.svelte";
  import StageResult from "./StageResult.svelte";
  import StageWaitMap from "./StageWaitMap.svelte";

  let {
    task,
    now,
    show,
    pending = false,
    onopenwait,
    onretry,
    onreopen,
    onstart,
    ontranscript,
  }: {
    task: TaskRead | null;
    now: number;
    /** What it draws; the task's own unless a move the hub answered changed it. */
    show: StageShow | null;
    /** Retry, Reopen or Start attempt pressed, the hub not yet answered. */
    pending?: boolean;
    onopenwait?: (target: string) => void;
    onretry?: () => void;
    onreopen?: () => void;
    onstart?: () => void;
    ontranscript?: () => void;
  } = $props();
</script>

<div class="relative min-w-0" data-slot="stage">
  {#if task === null || show === null}
    <div aria-busy="true" class="flex flex-col gap-space-5" out:reveal>
      <div class="w-1/2"><Skeleton height="x-height" /></div>
      <Skeleton height="board" />
      <Skeleton height="row" />
      <Skeleton height="block" />
    </div>
  {:else}
    {#key `${task.id}:${show}`}
      <div in:crossIn>
        {#if show === "result"}
          <StageResult {now} result={task.result} />
        {:else if show === "live" || show === "idle"}
          <StageLive
            live={task.live}
            {now}
            {onstart}
            since={task.since}
            stage={task.stage}
            starting={pending}
          />
        {:else if show === "waits"}
          <StageWaitMap
            id={task.id}
            liveness={task.liveness}
            onopen={onopenwait}
            title={task.title}
            unblocks={task.unblocks}
            waits={task.waits}
          />
        {:else if show === "outputs"}
          <StageOutputs {now} outputs={task.outputs} since={task.since} />
        {:else}
          <StageEnded
            dropped={task.dropped}
            failure={task.failure}
            {now}
            {onreopen}
            {onretry}
            {ontranscript}
            {pending}
          />
        {/if}
      </div>
    {/key}
  {/if}
</div>
