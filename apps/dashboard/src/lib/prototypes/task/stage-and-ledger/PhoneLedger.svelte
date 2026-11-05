<script lang="ts">
  /**
   * The ledger on a phone: the kit's bottom drawer (vaul), drawn in the
   * task's own box and never modal, peeking from the foot. Its handle row
   * always shows and carries the two moves at its two ends with the stage
   * and liveness word between (or Deny and Approve when the session asks),
   * so a thumb judges without opening it. Drag it up, or press its grabber,
   * for the rest in the desk strip's order; File is its second page.
   */
  import { taskStageLedgerWords as words } from "@cawco/core/words/task-stage-ledger";
  import type { Snippet } from "svelte";
  import { numberOf } from "#lib/cawco/motion/curves.svelte.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import * as Drawer from "#lib/components/ui/drawer/index.js";
  import { LIVENESS } from "./marks";
  import type { Liveness, MoveState, SessionAsk, TaskRead } from "./records";
  import StatusMark from "./StatusMark.svelte";

  let {
    task,
    liveness,
    container,
    move = "idle",
    ask = null,
    stale = false,
    stop = $bindable("peek"),
    asking = $bindable(false),
    onpasson,
    onanswer,
    children,
  }: {
    task: TaskRead | null;
    liveness: Liveness | null;
    /** The box the drawer stands in: the task's own, as tall as the screen. */
    container: HTMLElement | null;
    move?: MoveState;
    ask?: SessionAsk | null;
    stale?: boolean;
    /** Where the drawer stands: its handle alone, or the whole ledger. */
    stop?: "peek" | "full";
    asking?: boolean;
    onpasson?: () => void;
    onanswer?: (word: "approve" | "deny") => void;
    /** The ledger, or File, under the handle. */
    children?: Snippet;
  } = $props();

  /** vaul reads a px stop with parseInt: the handle's height, whole. */
  /** The handle's stop, read off its token once the page is drawn. */
  let peek = $state("0px");
  $effect(() => {
    peek = `${Math.round(numberOf("--c-ledger-peek"))}px`;
  });
  const stops = $derived([peek, 1]);
  const yours = $derived(task?.kind === "you" && move !== "landed");
  const answering = $derived(ask !== null && ask.answered === null);
  const blocked = $derived(stale || move === "landing");
</script>

<Drawer.Root
  activeSnapPoint={stop === "peek" ? peek : 1}
  {container}
  dismissible={false}
  modal={false}
  onActiveSnapPointChange={(next: number | string | null) => {
    stop = next === 1 ? "full" : "peek";
  }}
  open
  shouldScaleBackground={false}
  snapPoints={stops}
>
  <Drawer.Content
    contained
    grabber={{
      label: words.drawerNext,
      onpress: () => {
        stop = stop === "peek" ? "full" : "peek";
      },
    }}
    modal={false}
    onOpenAutoFocus={(event: Event) => event.preventDefault()}
    ownHead
    portalProps={{ disabled: true }}
    title={words.drawer}
    trapFocus={false}
  >
    <div class="flex min-h-0 flex-1 flex-col">
      <div
        class="grid grid-cols-(--handle-cols) items-center gap-space-3 px-space-4 pb-space-3"
        data-slot="handle"
        style:--handle-cols={"minmax(0, 1fr) auto minmax(0, 1fr)"}
      >
        {#if answering}
          <Button
            hit="always"
            label={words.deny}
            onclick={() => onanswer?.("deny")}
            size="lg"
            variant="outline"
          />
        {:else if yours}
          <Button
            disabled={blocked || move === "passing"}
            label={words.sendBack}
            onclick={() => {
              asking = true;
              stop = "full";
            }}
            pending={move === "sending"}
            pendingLabel={words.sendingBack}
            size="lg"
            variant="outline"
          />
        {:else}
          <span></span>
        {/if}
        <!-- mark-line: the mark stands on a row of its own, the words under it -->
        <span class="flex min-w-0 flex-col items-center gap-px text-center">
          {#if task && liveness}
            <span
              class="max-w-full overflow-clip text-ellipsis whitespace-nowrap type-meta text-ink-muted"
              >{task.stage}</span
            >
            <StatusMark mark={LIVENESS[liveness]} />
          {:else}
            <span class="type-meta text-ink-muted">{words.loading}</span>
          {/if}
        </span>
        {#if answering}
          <Button
            hit="always"
            label={words.approve}
            onclick={() => onanswer?.("approve")}
            size="lg"
            variant="outline"
          />
        {:else if yours}
          <Button
            disabled={blocked || move === "sending"}
            label={words.passOn}
            onclick={onpasson}
            pending={move === "passing"}
            pendingLabel={words.passingOn}
            size="lg"
            variant="outline"
          />
        {:else}
          <span></span>
        {/if}
      </div>
      <div
        class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-space-4 pb-space-8"
        data-vaul-no-drag
      >
        {@render children?.()}
      </div>
    </div>
  </Drawer.Content>
</Drawer.Root>
