<script lang="ts" module>
  import type { Component } from "svelte";
  import {
    IconError,
    IconNeedsYou,
    IconPause,
    IconStopped,
    IconWorking,
  } from "#lib/icons.js";
  import type { Session } from "./model";

  /** A session's status glyph (DESIGN.md, Status displays). */
  export const SESSION_GLYPHS: Record<Session["state"], Component> = {
    working: IconWorking,
    needs: IconNeedsYou,
    failed: IconError,
    idle: IconPause,
    stopped: IconStopped,
  };
</script>

<script lang="ts">
  /**
   * Sessions: every session of the project in one list, down fixed
   * columns: its status glyph and word, its title, what kind it is (Caw's
   * conversation, an attempt, one spun off, a routine's run), where it runs
   * and how long ago. Spin off a session opens its form at the list's head:
   * machine and checkout, harness and delegate type, and what comes along.
   */
  import { railOfPlacesWords as w } from "@cawco/core/words/rail-of-places";
  import { Button } from "#lib/components/ui/button/index.js";
  import { EmptyState } from "#lib/components/ui/empty/index.js";
  import * as NativeSelect from "#lib/components/ui/native-select/index.js";
  import { Skeleton } from "#lib/components/ui/skeleton/index.js";
  import { IconSessionAdd, IconTranscript } from "#lib/icons.js";
  import type { Project, Read } from "./model";
  import StaleNote from "./StaleNote.svelte";

  let {
    project,
    read,
    spinning = false,
    onclose,
    onopen,
  }: {
    project: Project;
    read: Read;
    spinning?: boolean;
    onclose: () => void;
    onopen: (task: string) => void;
  } = $props();

  const reading = $derived(read.status === "loading");
  const stale = $derived(read.stale !== null);
  const STATE_WORDS = w.sessionStates;
  const FIELDS = [
    { label: w.machine, options: ["obelisk-of-light", "MacBook"] },
    { label: w.checkout, options: ["~/cawco (main)", "a new workspace"] },
    { label: w.harness, options: ["Claude Code", "OpenCode", "pi"] },
    { label: w.delegateType, options: ["writer", "researcher", "medium"] },
  ];
</script>

<div class="flex flex-col gap-space-group">
  {#if stale && read.stale}
    <StaleNote since={read.stale} />
  {/if}
  {#if spinning && !stale}
    <form
      class="flex flex-col gap-space-4 rounded-lg bg-surface-raised p-space-5 shadow-tile"
      aria-label={w.spinOff}
      onsubmit={(event) => {
        event.preventDefault();
        onclose();
      }}
    >
      <div class="grid gap-space-4 phone:max-wide:grid-cols-2 wide:grid-cols-4">
        {#each FIELDS as field (field.label)}
          <label class="flex min-w-0 flex-col gap-space-1">
            <span class="type-label text-ink-strong">{field.label}</span>
            <NativeSelect.Root>
              {#each field.options as option (option)}
                <NativeSelect.Option value={option}
                  >{option}</NativeSelect.Option
                >
              {/each}
            </NativeSelect.Root>
          </label>
        {/each}
      </div>
      <p class="type-meta text-ink-muted">
        {w.comesAlong}: marketing-skills, x-account-warmup · x-use, monid
      </p>
      <div class="flex items-center justify-end gap-space-2">
        <Button variant="ghost" size="sm" onclick={onclose}>{w.cancel}</Button>
        <Button
          type="submit"
          size="sm"
          icon={IconSessionAdd}
          label={w.startSession}
        />
      </div>
    </form>
  {/if}
  <div class="@container/sessions rounded-lg bg-surface-raised shadow-tile">
    {#if reading}
      <div class="flex flex-col gap-space-3 p-space-3">
        {#each [0, 1, 2, 3] as row (row)}
          <Skeleton height="item" radius="tile" />
        {/each}
      </div>
    {:else if project.sessions.length === 0}
      <EmptyState
        icon={IconTranscript}
        title={w.noSessionsTitle}
        line={w.noSessionsWhy}
        pad="pane"
      >
        {#snippet action()}
          <Button size="sm" icon={IconSessionAdd} label={w.spinOff} />
        {/snippet}
      </EmptyState>
    {:else}
      <ul class="flex flex-col divide-y divide-border-hairline">
        {#each project.sessions as session (session.id)}
          {@const Glyph = SESSION_GLYPHS[session.state]}
          <li
            class="flex flex-wrap items-center gap-x-space-3 gap-y-space-1 px-space-3 py-space-3 data-stale:opacity-55"
            data-stale={stale || undefined}
          >
            <span
              class="grid h-c-row-mark w-c-row-lead flex-none place-items-center"
              role="img"
              aria-label={STATE_WORDS[session.state]}
            >
              <Glyph
                class="size-icon-md data-[state=failed]:text-status-fail-glyph data-[state=needs]:text-status-attn-glyph data-[state=working]:text-status-live-glyph text-ink-muted"
                data-state={session.state}
                aria-hidden="true"
              />
            </span>
            <span
              class="min-w-0 flex-1 basis-56 truncate type-label text-ink-row"
              >{session.title}</span
            >
            <span
              class="w-c-ledger-outcome-w flex-none type-meta text-ink-muted max-phone:ms-c-row-lead max-phone:ps-space-3"
            >
              {w.sessionKinds[session.kind]}
            </span>
            <span
              class="w-c-ledger-outcome-w flex-none truncate type-meta text-ink-muted max-phone:w-auto"
            >
              {session.machine} · {session.harness}
            </span>
            <span
              class="w-c-ledger-when-w flex-none text-end type-meta num text-ink-muted max-phone:ms-auto max-phone:w-auto"
              >{session.age}</span
            >
            {#if session.task}
              {@const task = session.task}
              <Button
                class="flex-none"
                variant="ghost"
                size="icon-xs"
                tone="quiet"
                icon={IconTranscript}
                aria-label="{w.openSession}: {session.title}"
                onclick={() => onopen(task)}
              />
            {:else}
              <Button
                class="flex-none"
                variant="ghost"
                size="icon-xs"
                tone="quiet"
                icon={IconTranscript}
                aria-label="{w.openSession}: {session.title}"
              />
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
  </div>
</div>
