<script lang="ts">
  /**
   * The task's head (DESIGN.md, The Title Bars Follow Liquid Glass Rule):
   * Back as a glass symbol, the task's title leading, then trailing one
   * glass group of bare symbols (Open session, More) and the one prominent
   * act. The act is coral only while the task waits on you (Pass on): the
   * project's one other coral control is Ask Caw. Under 640px the glass
   * holds More alone; the attempt's own entry opens its session.
   *
   * Under 900px what an entry opens stands in the record's place, and Back
   * returns to the task. With the result standing there on its own, the
   * head carries the review's two moves at its two ends instead of the
   * title, so they stay in reach while the result is read. Its form follows
   * the screen's container (`record`), never the window.
   */
  import { taskOneRecordWords as words } from "@cawco/core/words/task-one-record";
  import { mergeProps } from "bits-ui";
  import { BarGlass } from "#lib/components/ui/bar-glass/index.js";
  import * as DropdownMenu from "#lib/components/ui/dropdown-menu/index.js";
  import Skeleton from "#lib/components/ui/skeleton/skeleton.svelte";
  import Tip from "#lib/components/ui/tooltip/tip.svelte";
  import {
    IconArchive,
    IconArrowLeft,
    IconArrowRight,
    IconLink,
    IconMore,
    IconReopen,
    IconTranscript,
    IconTrash,
  } from "#lib/icons.js";
  import type { Acts, Pending, TaskView } from "./model";
  import ReviewMove from "./ReviewMove.svelte";

  let {
    view,
    inPlace = false,
    resultAlone = false,
    pending = null,
    stale = false,
    onback,
    onclose,
    onact,
    onopensession,
  }: {
    /** The task; null while its first read is on its way. */
    view: TaskView | null;
    /** Something is open: under 900px it stands in the record's place. */
    inPlace?: boolean;
    /** The result is open: under 900px the head carries the review's two moves. */
    resultAlone?: boolean;
    pending?: Pending | null;
    /** The hub isn't answering: every act waits for it. */
    stale?: boolean;
    /** Back to the board. */
    onback: () => void;
    /** Back from what stands in the record's place. */
    onclose: () => void;
    onact: Acts["onact"];
    onopensession: () => void;
  } = $props();

  const review = $derived(view?.review ?? null);
  const pair = $derived(resultAlone && review !== null);
  /** The stages More can move it to: every stage but its own and dropped (Drop asks first). */
  const moves = $derived(
    (view?.stages ?? []).filter(
      (stage) => stage.name !== view?.stage && stage.kind !== "dropped"
    )
  );
  const hasSession = $derived(
    view !== null &&
      (view.liveSession !== null ||
        view.entries.some((entry) => entry.kind === "attempt"))
  );
</script>

{#snippet back(label: string, onclick: () => void, only: string)}
  <Tip {label}>
    {#snippet children(tip)}
      <button
        data-bar-item
        data-box
        {...mergeProps(tip, { onclick })}
        aria-label={label}
        class={["select-none touch-hit press-tint", only]}
        type="button"
      >
        <IconArrowLeft data-slot="bar-symbol" aria-hidden="true" />
      </button>
    {/snippet}
  </Tip>
{/snippet}

<header
  data-slot="record-head"
  class="flex flex-none items-center gap-x-space-4 pt-space-4 pe-space-6 pb-space-3 ps-space-7 @max-desk/record:px-space-5"
>
  <BarGlass form="group">
    {#if inPlace}
      {@render back(words.backToTask, onclose, "@desk/record:hidden")}
      {@render back(words.backToBoard, onback, "@max-desk/record:hidden")}
    {:else}
      {@render back(words.backToBoard, onback, "")}
    {/if}
  </BarGlass>

  {#if pair && review}
    <!-- The review's two moves at the head's two ends, nothing between
         (DESIGN.md, The Peer Rule): Send back at the start, Pass on at the
         end, both 44 tall. Only where the result stands on its own. -->
    <div
      class="hidden min-w-0 flex-1 items-center justify-between gap-space-8 @max-desk/record:flex"
    >
      <ReviewMove
        move="sendBack"
        look="peer"
        {review}
        {pending}
        {stale}
        onpress={() => {
          onclose();
          onact("ask:sendBack");
        }}
      />
      <ReviewMove
        move="passOn"
        look="prominent-peer"
        {review}
        {pending}
        {stale}
        onpress={() => onact("passOn")}
      />
    </div>
  {/if}

  <div
    class={[
      "flex min-w-0 flex-1 items-center gap-x-space-4",
      pair && "@max-desk/record:hidden",
    ]}
  >
    <h1
      class="m-0 min-w-0 flex-1 type-title text-ink-strong text-balance line-clamp-2"
    >
      {#if view}
        {view.title}
      {:else}
        <Skeleton line="title" width="title" radius="text" />
      {/if}
    </h1>

    {#if view}
      <div class="flex flex-none items-center gap-space-2">
        <BarGlass form="group">
          {#if hasSession}
            <Tip label={words.openSession}>
              {#snippet children(tip)}
                <button
                  data-bar-item
                  data-box
                  {...mergeProps(tip, { onclick: onopensession })}
                  aria-label={words.openSession}
                  class="select-none touch-hit press-tint @max-phone/record:hidden"
                  type="button"
                >
                  <IconTranscript data-slot="bar-symbol" aria-hidden="true" />
                </button>
              {/snippet}
            </Tip>
          {/if}
          <DropdownMenu.Root>
            <Tip label={words.more(view.title)}>
              {#snippet children(tip)}
                <DropdownMenu.Trigger>
                  {#snippet child({ props })}
                    <button
                      data-bar-item
                      data-box
                      {...mergeProps(tip, props)}
                      aria-label={words.more(view.title)}
                      class="select-none touch-hit press-tint"
                      type="button"
                    >
                      <IconMore data-slot="bar-symbol" aria-hidden="true" />
                    </button>
                  {/snippet}
                </DropdownMenu.Trigger>
              {/snippet}
            </Tip>
            <DropdownMenu.Content align="end" width="regular">
              <DropdownMenu.Group>
                <DropdownMenu.GroupHeading
                  >{words.moveTo}</DropdownMenu.GroupHeading
                >
                {#each moves as stage (stage.name)}
                  <DropdownMenu.Item disabled={stale}>
                    <IconArrowRight />
                    <span>{words.moveToStage(stage.name)}</span>
                    <DropdownMenu.Shortcut
                      >{words.takesUp[
                        stage.kind === "waiting" ? "todo" : stage.kind
                      ]}</DropdownMenu.Shortcut
                    >
                  </DropdownMenu.Item>
                {/each}
              </DropdownMenu.Group>
              <DropdownMenu.Separator />
              {#if view.kind === "dropped"}
                <DropdownMenu.Item
                  disabled={stale}
                  onSelect={() => onact("ask:reopen")}
                >
                  <IconReopen />
                  <span>{words.reopenTask}</span>
                </DropdownMenu.Item>
              {:else}
                <DropdownMenu.Item
                  disabled={stale}
                  variant="destructive"
                  onSelect={() => onact("ask:drop")}
                >
                  <IconTrash />
                  <span>{words.dropTask}</span>
                </DropdownMenu.Item>
              {/if}
              <DropdownMenu.Item disabled={stale}>
                <IconArchive />
                <span>{words.archiveTask}</span>
              </DropdownMenu.Item>
              <DropdownMenu.Item>
                <IconLink />
                <span>{words.copyLink}</span>
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Root>
        </BarGlass>
        {#if review}
          <ReviewMove
            move="passOn"
            look="prominent"
            {review}
            {pending}
            {stale}
            onpress={() => onact("passOn")}
          />
        {/if}
      </div>
    {/if}
  </div>
</header>
