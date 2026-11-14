<script lang="ts" module>
  import type { ToolUpdateState } from "@cawco/core/tool-updates";
  import type { ToolSpec } from "@cawco/core/tools";

  /** One machine whose copy of the tool waits on the person (core `ToolBehind`, `needsYou`). */
  export interface ToolNeedLine {
    machine: string;
    machineId: string;
    online: boolean;
    /** Its daemon's `platform-arch` fingerprint (OsMark). */
    os: string;
    /** Its owner paused it: Update all leaves it. */
    pausedUntil: number | null;
    state: Extract<ToolUpdateState, { kind: "failed" | "own" | "asked" }>;
  }

  /**
   * A command-line tool some machines' copies of wait on the person for
   * (core tool-updates.ts: an update that failed, a copy the person
   * installed, or one the fleet asks about): one entry per tool, a line per
   * such machine. It leaves by itself once none waits.
   */
  export interface ToolItem {
    href: string;
    key: string;
    kind: "tool";
    lines: ToolNeedLine[];
    place: string;
    raisedAt: number;
    spec: ToolSpec;
    title: string;
    want: string;
  }
</script>

<script lang="ts">
  /**
   * Needs you's entry for a tool: its mark, "Update OpenCode on
   * 2 machines" (the machines that wait on the person), what it means, then a line per machine
   * on one grid (its OS mark, its name, wrapping whole, the version found and
   * why it waits, and its press, Retry or Update, off while it is offline).
   * Under a failed update, the installer's line that says why (core
   * `causeOf`), and "update failed" unfolds its whole output. Update all
   * from two, counted by the hub's own rule (`updateAllTakes`): never a copy
   * the person installed, never a paused machine. The row opens Configure ›
   * Command-line tools.
   */
  import { toolUpdateWords as words } from "@cawco/core/words/tool-updates";
  import { Button } from "#lib/components/ui/button/index.js";
  import { failureWords } from "#lib/platform/hub-read.js";
  import { unfold } from "#lib/platform/motion/fold.svelte.js";
  import { updateAllTakes } from "../blocking";
  import HarnessLogo, { hasMark } from "../HarnessLogo.svelte";
  import OsMark from "../OsMark.svelte";
  import RowFault from "../RowFault.svelte";
  import { span } from "../span";
  import { minute } from "../stores/clock.svelte";
  import { updateAllOf } from "../stores/tool-updates.svelte";
  import {
    pressInstall,
    pressPending,
    pressRefused,
  } from "../tool-presses.svelte";
  import NeedsRow from "./NeedsRow.svelte";

  let { item, onchoose }: { item: ToolItem; onchoose: () => void } = $props();

  const sendable = $derived(
    item.lines.filter((line) =>
      updateAllTakes(line.state, {
        status: line.online ? "online" : "offline",
        pausedUntil: line.pausedUntil,
      })
    ).length
  );

  /** The lines whose installer output is unfolded, by machine. */
  let opened = $state<Record<string, boolean>>({});

  let sending = $state(false);
  let allRefused = $state<string | null>(null);
  async function sendAll() {
    sending = true;
    allRefused = null;
    try {
      await updateAllOf([item.spec.id]);
    } catch (error) {
      allRefused = failureWords(error);
    } finally {
      sending = false;
    }
  }
</script>

<NeedsRow
  href={item.href}
  kind="tool"
  {onchoose}
  share="pane:{item.key}"
  title={item.title}
  wait={span(minute.now - item.raisedAt)}
  want={item.want}
>
  {#snippet lead()}
    {#if hasMark(item.spec.id)}
      <HarnessLogo data-box harness={item.spec.id} />
    {/if}
  {/snippet}
  {#snippet below()}
    <span
      data-slot="meta"
      class="pointer-events-none relative col-start-2 col-end-4 row-3 overflow-hidden type-meta text-ellipsis whitespace-nowrap text-ink-muted"
      >{item.place}</span
    >
    <!-- A line per machine, every line on the list's one grid, so each
         column starts at one x and a name takes the room the rest leaves. -->
    <ul
      class="relative col-start-2 col-end-4 row-4 m-0 mt-space-2 grid list-none grid-cols-(--line-cols) gap-x-space-2 gap-y-space-1 p-0 type-meta"
      style:--line-cols="var(--spacing-icon-md) minmax(0, 1fr) auto auto"
    >
      {#each item.lines as line (line.machineId)}
        {@const pending = pressPending(line.machineId, item.spec.id)}
        {@const refused = pressRefused(line.machineId, item.spec.id)}
        {@const why = words.lineWhy[line.state.kind]}
        {@const outputId = `tool-output-${item.spec.id}-${line.machineId}`}
        <li
          class="mark-line col-span-full grid grid-cols-subgrid gap-y-space-1"
        >
          <OsMark
            class="mark-line size-icon-md self-center text-ink-muted"
            data-box
            os={line.os}
          />
          <span class="min-w-0 self-center wrap-break-word text-ink-strong"
            >{line.machine}</span
          >
          <span class="self-center text-ink-muted"
            >{#if line.state.found}<code class="num type-code"
                >{line.state.found}</code
              >{/if}{#if line.state.found && why}{" · "}{/if}{#if line.state.kind === "failed" && line.state.output}<button
                aria-controls={outputId}
                aria-expanded={opened[line.machineId] === true}
                class="pointer-hit touch-hit rounded-xs text-status-fail-ink underline decoration-dotted underline-offset-2 hover:text-ink-strong"
                onclick={() => {
                  opened[line.machineId] = !opened[line.machineId];
                }}
                type="button">{why}</button
              >{:else}{why ?? ""}{/if}</span
          >
          <Button
            class="self-center"
            data-box
            disabled={!line.online}
            failed={refused !== undefined}
            label={line.state.kind === "failed" ? words.retry : words.update}
            onclick={() => pressInstall(line.machineId, item.spec.id)}
            {pending}
            pendingLabel={words.pressing}
            size="xs"
            variant="ghost"
          />
          <!-- What stands under the line: the cause, the output, a refusal. -->
          {#if (line.state.kind === "failed" && (line.state.cause || opened[line.machineId])) || refused}
            <div
              class="col-start-2 col-end-5 flex min-w-0 flex-col gap-space-1"
              data-box
            >
              {#if line.state.kind === "failed" && line.state.cause}
                <!-- The installer's own line that says why, under the name. -->
                <code
                  class="line-clamp-2 type-code wrap-anywhere text-status-fail-ink"
                  >{line.state.cause}</code
                >
              {/if}
              {#if line.state.kind === "failed" && opened[line.machineId]}
                <pre
                  id={outputId}
                  class="m-0 max-h-56 overflow-auto rounded-xs bg-surface-recess px-space-2 py-space-1 type-code whitespace-pre-wrap wrap-anywhere text-ink-muted"
                  transition:unfold>{line.state.output}</pre>
              {/if}
              {#if refused}
                <!-- The line's own press is the way on. -->
                <RowFault reason={refused} />
              {/if}
            </div>
          {/if}
        </li>
      {/each}
    </ul>
    {#if sendable > 1 || allRefused}
      <div
        class="relative col-start-2 col-end-4 row-5 mt-space-2 flex flex-col items-end gap-space-1"
      >
        <RowFault reason={allRefused} />
        <Button
          label={words.updateAll(sendable)}
          onclick={sendAll}
          pending={sending}
          pendingLabel={words.pressing}
          size="sm"
          variant="secondary"
        />
      </div>
    {/if}
  {/snippet}
</NeedsRow>
