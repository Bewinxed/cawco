<script lang="ts">
  /**
   * Under a thread's notice that a session made a routine (core ThreadEvent
   * `routine-made`): how long it lasts, and Keep, Turn off and Open. It reads
   * the routine as it stands now, so a routine kept or turned off since says
   * so, and acts through `/api/routines/:id`.
   */
  import { untrack } from "svelte";
  import {
    changeRoutine,
    type RoutineState,
    readRoutine,
  } from "#lib/cawco/client.svelte.js";
  import { failureWords } from "#lib/cawco/hub-read.js";
  import { routineHref } from "#lib/cawco/thread-tabs.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import type { MessageMetadata } from "../types";

  let { routine }: { routine: NonNullable<MessageMetadata["routineMade"]> } =
    $props();

  const DAY_MS = 24 * 60 * 60 * 1000;

  let now = $state<RoutineState | null>(null);
  let problem = $state<string | null>(null);
  let acting = $state<"keep" | "off" | null>(null);

  $effect(() => {
    const id = routine.routineId;
    untrack(() => {
      readRoutine(id).then(
        (read) => {
          now = read;
        },
        (error: unknown) => {
          problem = failureWords(error);
        }
      );
    });
  });

  /** How long it lasts, in words: the 7 days an agent's routine has unless kept. */
  const lasts = $derived.by(() => {
    if (!now) {
      return null;
    }
    if (!now.enabled) {
      return "Off";
    }
    if (now.keep || routine.expiresAt === null) {
      return "Kept";
    }
    const days = Math.max(
      1,
      Math.ceil((routine.expiresAt - Date.now()) / DAY_MS)
    );
    return `Off in ${days} day${days === 1 ? "" : "s"} unless you keep it`;
  });
  /** The routine open in its project's Routines tab. */
  const href = $derived(now ? routineHref(now) : null);

  async function act(what: "keep" | "off") {
    if (acting) {
      return;
    }
    acting = what;
    problem = null;
    try {
      now = await changeRoutine(
        routine.routineId,
        what === "keep" ? { keep: true } : { enabled: false }
      );
    } catch (error) {
      problem = failureWords(error);
    } finally {
      acting = null;
    }
  }
</script>

<div
  class="rail-hang flex flex-wrap items-center gap-space-2 mt-space-2"
  data-routine-made={routine.routineId}
>
  {#if now}
    <span data-slot="lasts" class="text-size-meta font-normal text-ink-muted"
      >{lasts}</span
    >
    {#if now.enabled && !now.keep && routine.expiresAt !== null}
      <Button
        label="Keep"
        onclick={() => act("keep")}
        pending={acting === "keep"}
        pendingLabel="Keeping…"
        size="xs"
        variant="outline"
      />
    {/if}
    {#if now.enabled}
      <Button
        label="Turn off"
        onclick={() => act("off")}
        pending={acting === "off"}
        pendingLabel="Turning off…"
        size="xs"
        variant="outline"
      />
    {/if}
    {#if href}
      <Button {href} label="Open" size="xs" variant="ghost" />
    {/if}
  {/if}
  {#if problem}
    <p class="basis-full m-0 text-size-meta font-normal text-status-fail-ink">
      {problem}
    </p>
  {/if}
</div>
