<script lang="ts">
  /**
   * Running: the install's steps as the hub marks them, fixed for the run so
   * nothing moves as they tick (DESIGN.md, Nothing Jumps). Each step's
   * glyph swaps in its cell (120ms), the connector under a finished step
   * draws down (160ms), the current step breathes with its elapsed beside it,
   * tabular and unanimated, and a step with a limit shows it: "– of 1:30"
   * before it starts, then its time against it, and past it "Past its limit"
   * in attn ink. The installer's checks stand under the step that serves
   * them; on the desk the chips Reach showed fly into them as the run
   * starts. The current step's line is a polite live region.
   *
   * Over SSH the output's last line stands in a one-line well, with Open
   * output and Stop install under it; by a command, the line itself with
   * Copy command, and how the hub hears of it. Stop asks in the page under
   * the footer, with what stopping leaves on the machine.
   */
  import type { Install } from "@cawco/core";
  import { Button } from "#lib/components/ui/button/index.js";
  import AskHere from "../AskHere.svelte";
  import { Asker, type AskHereRequest } from "../ask-here.svelte";
  import { tickingClock } from "../motion/clock.svelte";
  import { land } from "../motion/share.svelte";
  import { checkKey } from "./Checklist.svelte";
  import { connect } from "./installs.svelte";
  import MonoWell from "./MonoWell.svelte";
  import StepMark from "./StepMark.svelte";
  import { stepRows } from "./steps";
  import { clockOf, stopQuestion, timeOf } from "./words";

  let { install }: { install: Install } = $props();

  const clock = tickingClock(() => install.state === "running");
  const rows = $derived(stepRows(install));
  const current = $derived(rows.find((row) => row.state === "current"));

  /** A step's figures: its time while it runs, its limit before it starts. */
  function figures(row: (typeof rows)[number]): {
    text: string;
    past: boolean;
  } {
    if (row.state === "current" && row.startedAt !== null) {
      const ran = clock.now - row.startedAt;
      if (row.limit === null) {
        return { text: clockOf(ran), past: false };
      }
      const past = ran > row.limit;
      return {
        text: `${clockOf(ran)} of ${clockOf(row.limit)}${past ? " · Past its limit" : ""}`,
        past,
      };
    }
    if (row.state === "future" && row.limit !== null) {
      return { text: `– of ${clockOf(row.limit)}`, past: false };
    }
    return { text: "", past: false };
  }

  const asks = new Asker<AskHereRequest>();
  /** Stop asks first, with what stopping now leaves on the machine. */
  function askStop() {
    asks.ask({
      at: "stop-install",
      ...stopQuestion(install),
      cancelLabel: "Cancel",
      confirmLabel: "Stop install",
      pendingLabel: "Stopping…",
      destructive: true,
      run: () => connect.stop(install.id),
    });
  }
</script>

<div class="flex flex-col gap-space-3" {@attach clock.watch}>
  <p data-slot="started" class="m-0 type-meta text-ink-muted">
    {install.route === "ssh"
      ? `over SSH · started ${timeOf(install.startedAt)}`
      : `by a command · listening since ${timeOf(install.startedAt)}`}
  </p>

  <ol data-slot="steps" class="m-0 flex list-none flex-col p-0">
    {#each rows as row, index (row.step)}
      {@const time = figures(row)}
      <li
        data-step={row.step}
        data-state={row.state}
        class="relative flex flex-col"
      >
        {#if index < rows.length - 1}
          <!-- The rail to the next step, from this glyph's foot to the next
               one's top, past the checks hanging off it: it draws down as
               this step finishes. -->
          <span
            aria-hidden="true"
            data-box
            class={[
              "pointer-events-none absolute start-c-step-rail-x top-c-step-rail-top -bottom-c-step-rail-gap w-px -translate-x-1/2 origin-top bg-border-hairline transition-[scale] duration-(--dur-toggle) ease-out",
              row.state === "done" ? "scale-y-100" : "scale-y-0",
            ]}
          ></span>
        {/if}
        <div
          data-slot="step-row"
          class="relative mark-line flex h-c-btn-h-sm items-center gap-space-2"
        >
          <StepMark state={row.state} />
          <span
            class={[
              "min-w-0 flex-1 overflow-clip text-ellipsis whitespace-nowrap type-label",
              row.state === "future" ? "text-ink-muted" : "text-ink-strong",
            ]}>{row.words}</span
          >
          {#if time.text}
            <span
              data-slot="time"
              class={[
                "num flex-none whitespace-nowrap type-meta",
                time.past ? "text-status-attn-ink" : "text-ink-muted",
              ]}>{time.text}</span
            >
          {/if}
        </div>
        {#if row.checks.length > 0}
          <ul
            data-slot="checks"
            class="m-0 flex list-none flex-col p-0 ps-space-6"
          >
            {#each row.checks as check (check.check)}
              <li
                data-check={check.check}
                data-state={check.state}
                class="mark-line flex h-c-badge-h items-center gap-space-2"
                {@attach land(() => checkKey(check.check))}
              >
                <StepMark state={check.state} size="sm" />
                <span
                  class={[
                    "type-meta",
                    check.state === "failed"
                      ? "text-status-fail-ink"
                      : "text-ink-muted",
                  ]}>{check.words}</span
                >
              </li>
            {/each}
          </ul>
        {/if}
      </li>
    {/each}
  </ol>

  {#if install.route === "ssh"}
    <MonoWell
      label="The output's last line"
      lines={install.tail.length > 0
        ? install.tail
        : ["Waiting for the first line…"]}
      live
    />
    <div class="flex items-center justify-between gap-space-2">
      <Button
        data-connect-keep
        onclick={() => connect.openOutput()}
        variant="outline">Open output</Button
      >
      <Button onclick={askStop} variant="destructive">Stop install</Button>
    </div>
  {:else}
    {#if install.command}
      <MonoWell
        copy={install.command}
        copyLabel="Copy command"
        label="The command to run on the machine"
        lines={[install.command]}
      />
    {/if}
    <p class="m-0 type-meta text-pretty text-ink-muted">
      Its terminal shows each check; the hub hears from it when the install
      finishes.
    </p>
    <div class="flex justify-end">
      <Button onclick={askStop} variant="destructive">Stop install</Button>
    </div>
  {/if}
  <AskHere asker={asks} at="stop-install" />
  {#if current}
    <span class="sr-only" aria-live="polite">{current.words}</span>
  {/if}
</div>
