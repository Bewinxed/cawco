<script lang="ts">
  import { yourMoveFirstWords as words } from "@cawco/core/words/proto-your-move-first";
  /**
   * The task's head on Apple's toolbar model (DESIGN.md, The Title Bars
   * Follow Liquid Glass Rule): Back as a bare symbol in its own glass,
   * the task's title leading on one line (the whole title in its tooltip,
   * truncated inside), the stage as a chip beside it, then trailing one glass
   * group of bare symbols (Open session, More) and the one prominent act.
   * The prominent act is Pass on, coral, only while the stage is of kind
   * `you`; the rest carry none. On a phone Open session moves into More.
   */
  import { mergeProps } from "bits-ui";
  import { Badge } from "#lib/components/ui/badge/index.js";
  import BarGlass from "#lib/components/ui/bar-glass/bar-glass.svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import * as DropdownMenu from "#lib/components/ui/dropdown-menu/index.js";
  import Tip from "#lib/components/ui/tooltip/tip.svelte";
  import {
    IconArchive,
    IconArrowLeft,
    IconMore,
    IconReopen,
    IconTranscript,
    IconTrash,
  } from "#lib/icons.js";
  import type { TaskRead } from "./fixtures/types";

  let {
    task,
    wide,
    backLabel = words.head.back,
    sessionOpen = false,
    passPending = false,
    passFailed = false,
    hasSession,
    onback,
    onsession,
    onpass,
    ondrop,
    onreopen,
  }: {
    task: TaskRead;
    /** The desk's head: Open session stands in the trailing glass. */
    wide: boolean;
    backLabel?: string;
    sessionOpen?: boolean;
    passPending?: boolean;
    passFailed?: boolean;
    /** The task has a session to open. */
    hasSession: boolean;
    onback: () => void;
    onsession: () => void;
    onpass: () => void;
    ondrop: () => void;
    onreopen: () => void;
  } = $props();

  const closed = $derived(task.kind === "done" || task.kind === "dropped");
  const sessionLabel = $derived(
    sessionOpen ? words.head.closeSession : words.head.openSession
  );
</script>

<header
  class="sticky top-0 z-(--layer-bar) flex h-c-top-bar-h min-w-0 items-center gap-space-3"
  data-slot="task-head"
>
  <BarGlass form="group">
    <Tip label={backLabel}>
      {#snippet children(tip)}
        <button
          data-bar-item
          aria-label={backLabel}
          class="select-none touch-hit press-tint"
          type="button"
          {...mergeProps(tip, { onclick: onback })}
        >
          <IconArrowLeft aria-hidden="true" data-slot="bar-symbol" />
        </button>
      {/snippet}
    </Tip>
  </BarGlass>

  <div class="flex min-w-0 flex-1 items-center gap-space-2">
    <Tip label={task.title}>
      {#snippet children(tip)}
        <h1 class="m-0 min-w-0 type-row text-ink-strong" tabindex="-1" {...tip}>
          <span class="block truncate">{task.title}</span>
        </h1>
      {/snippet}
    </Tip>
    <Badge class="flex-none" kind="meta"><span>{task.stage}</span></Badge>
  </div>

  <div class="flex flex-none items-center gap-space-3">
    <BarGlass form="group">
      {#if wide && hasSession}
        <Tip label={sessionLabel}>
          {#snippet children(tip)}
            <button
              data-bar-item
              aria-label={sessionLabel}
              aria-pressed={sessionOpen}
              class="select-none touch-hit press-tint"
              type="button"
              {...mergeProps(tip, { onclick: onsession })}
            >
              <IconTranscript aria-hidden="true" data-slot="bar-symbol" />
            </button>
          {/snippet}
        </Tip>
      {/if}
      <DropdownMenu.Root>
        <DropdownMenu.Trigger>
          {#snippet child({ props })}
            <button
              data-bar-item
              aria-label={words.head.more}
              class="select-none touch-hit press-tint"
              type="button"
              {...props}
            >
              <IconMore aria-hidden="true" data-slot="bar-symbol" />
            </button>
          {/snippet}
        </DropdownMenu.Trigger>
        <DropdownMenu.Content align="end" width="regular">
          {#if !wide && hasSession}
            <DropdownMenu.Item onSelect={onsession}>
              <IconTranscript aria-hidden="true" /><span>{sessionLabel}</span>
            </DropdownMenu.Item>
          {/if}
          {#if closed}
            <DropdownMenu.Item onSelect={onreopen}>
              <IconReopen aria-hidden="true" /><span>{words.more.reopen}</span>
            </DropdownMenu.Item>
          {:else}
            <DropdownMenu.Item
              ><span>{words.more.moveTo}</span></DropdownMenu.Item
            >
            <DropdownMenu.Item onSelect={ondrop} variant="destructive">
              <IconTrash aria-hidden="true" /><span>{words.more.drop}</span>
            </DropdownMenu.Item>
          {/if}
          <DropdownMenu.Item><span>{words.more.link}</span></DropdownMenu.Item>
          <DropdownMenu.Separator />
          <DropdownMenu.Item>
            <IconArchive aria-hidden="true" /><span>{words.more.archive}</span>
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Root>
    </BarGlass>
    {#if task.kind === "you" && task.passOn}
      <Button
        label={words.move.passOn(task.passOn)}
        pending={passPending}
        pendingLabel={words.move.passingOn}
        failed={passFailed}
        onclick={onpass}
      />
    {/if}
  </div>
</header>
