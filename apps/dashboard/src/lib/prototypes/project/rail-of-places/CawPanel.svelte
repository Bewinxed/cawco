<script lang="ts">
  /**
   * Caw's pane (TOM task 5): his status in a word and his sentence, his
   * harness and model, whether the project's events reach him, Turn off and
   * Open as its own session; his newest conversation; the starters written
   * for this project, which fill the composer and never send; the
   * composer. Docked beside the page from 1024 up it carries its own bar;
   * in a sheet the sheet's bar is its.
   */
  import { railOfPlacesWords as w } from "@cawco/core/words/rail-of-places";
  import { Button } from "#lib/components/ui/button/index.js";
  import { Skeleton } from "#lib/components/ui/skeleton/index.js";
  import { Switch } from "#lib/components/ui/switch/index.js";
  import { Textarea } from "#lib/components/ui/textarea/index.js";
  import { IconAgent, IconChatAdd, IconSend, IconUndock } from "#lib/icons.js";
  import type { Project, Read } from "./model";
  import SheetHead from "./SheetHead.svelte";

  let {
    project,
    read,
    docked = false,
    onclose,
  }: {
    project: Project;
    read: Read;
    docked?: boolean;
    onclose: () => void;
  } = $props();

  let message = $state("");
  const caw = $derived(project.caw);
  const reading = $derived(read.status === "loading");
  const off = $derived(caw.status === "off" || caw.status === "unreachable");
</script>

<div class="flex min-h-0 flex-1 flex-col">
  {#if docked}
    <SheetHead title={w.caw} closeLabel={w.closeCaw} {onclose}>
      {#snippet symbols()}
        <button
          data-bar-item
          type="button"
          class="select-none touch-hit press-tint"
          aria-label={w.newConversation}
        >
          <IconChatAdd data-slot="bar-symbol" aria-hidden="true" />
        </button>
        <button
          data-bar-item
          type="button"
          class="select-none touch-hit press-tint"
          aria-label={w.openAsSession}
        >
          <IconUndock data-slot="bar-symbol" aria-hidden="true" />
        </button>
      {/snippet}
    </SheetHead>
  {/if}
  <div
    class="flex flex-none flex-col gap-space-3 border-b border-border-hairline px-space-5 pb-space-4"
  >
    <div class="mark-line flex items-center gap-space-3">
      <span class="grid size-c-row-mark flex-none place-items-center" data-box>
        <IconAgent class="size-icon-lg text-ink-strong" aria-hidden="true" />
      </span>
      <span
        class="type-label text-ink-strong data-[status=asking]:text-status-attn-ink data-[status=unreachable]:text-status-fail-ink data-[status=working]:text-status-live-ink"
        data-status={caw.status}>{w.cawStatus[caw.status]}</span
      >
      <span class="ms-auto type-meta text-ink-muted"
        >{w.harnessModel(caw.harness, caw.model)}</span
      >
    </div>
    <p class="type-body text-ink-strong">{caw.sentence}</p>
    <div class="flex flex-wrap items-center gap-x-space-4 gap-y-space-2">
      <label class="flex items-center gap-space-2 type-meta text-ink-muted">
        <Switch checked={caw.eventsReach} size="sm" disabled={off} />
        {w.eventsReachHim}
      </label>
      <Button class="ms-auto" variant="ghost" size="xs" tone="quiet"
        >{off ? w.turnOn : w.turnOff}</Button
      >
    </div>
    {#if caw.status === "off"}
      <p
        class="rounded-md bg-surface-recess px-space-3 py-space-2 type-meta text-ink-muted"
      >
        {w.cawOff}
      </p>
    {:else if caw.status === "unreachable"}
      <p
        class="rounded-md bg-status-fail-bg px-space-3 py-space-2 type-meta text-status-fail-ink"
      >
        {w.cawUnreachable(caw.machine)}
      </p>
    {/if}
  </div>
  <ol
    class="flex min-h-0 flex-1 flex-col gap-space-4 overflow-y-auto px-space-5 py-space-4"
    aria-label={w.caw}
  >
    {#if reading}
      <li><Skeleton height="block" radius="tile" /></li>
    {:else}
      {#each caw.turns as turn, index (index)}
        <li
          class="flex flex-col gap-space-1 data-[who=you]:items-end"
          data-who={turn.who}
        >
          <span class="type-meta text-ink-muted"
            >{turn.who === "you" ? w.you : w.caw} · {turn.when}</span
          >
          <p
            class="max-w-c-measure rounded-lg px-space-3 py-space-2 type-prose text-ink-strong data-[who=caw]:bg-surface-recess data-[who=you]:bg-selected-bg"
            data-who={turn.who}
          >
            {turn.text}
          </p>
        </li>
      {/each}
    {/if}
  </ol>
  <div
    class="flex flex-none flex-col gap-space-2 border-t border-border-hairline px-space-5 py-space-3 pb-safe-space-3"
  >
    <div class="flex flex-wrap gap-space-2">
      {#each caw.starters as starter (starter)}
        <Button
          variant="secondary"
          size="xs"
          disabled={off}
          onclick={() => {
            message = starter;
          }}>{starter}</Button
        >
      {/each}
    </div>
    <form
      class="flex items-end gap-space-2"
      onsubmit={(event) => {
        event.preventDefault();
        message = "";
      }}
    >
      <Textarea
        bind:value={message}
        rows={2}
        placeholder={w.composerPlaceholder}
        aria-label={w.composerPlaceholder}
        disabled={off}
      />
      <Button
        type="submit"
        size="icon"
        icon={IconSend}
        aria-label={w.askCaw}
        disabled={off || message.trim() === ""}
      />
    </form>
  </div>
</div>
