<script lang="ts">
  import { machineLabel } from "@cawco/core";
  /**
   * One fault, rendered the same way everywhere it appears.
   *
   * The rule this component exists to enforce: a failure is never handed to the
   * reader as the raw string a CLI printed. It is named, attributed to a hub or
   * to a machine, explained in a sentence, given the affordance that resolves
   * it — and only then, behind a disclosure, quoted verbatim. The raw text is
   * evidence, not the message.
   *
   * The one exception is a cause cawco does not recognise, where the machine's
   * own words ARE the message; that case shows the output open, because hiding
   * an explanation nobody has behind a summary that says nothing is worse.
   *
   * Its disclosures fold (240ms open, 160ms shut, motion/fold) and what its
   * remedy came to is said under the button, in place.
   */
  import { Button } from "#lib/components/ui/button/index.js";
  import {
    IconChevronRight,
    IconRefresh,
    IconWarningTriangle,
  } from "#lib/icons.js";
  import type { Machine } from "./client.svelte";
  import { refreshPlugin, refreshSkill, syncFleet } from "./fleet";
  import {
    CAUSE,
    type FaultGroup,
    faultHref,
    faultLabel,
    readToolchain,
    SCOPE_NOUN,
  } from "./fleet-faults";
  import { appear, CURVE, dur } from "./motion/curves.svelte";
  import { fold } from "./motion/fold.svelte";
  import OsMark from "./OsMark.svelte";

  let {
    group,
    machines,
    compact = false,
    onresolved,
  }: {
    group: FaultGroup;
    machines: Machine[];
    /**
     * One line under a list row — the title and where — with the reading,
     * the output and the remedy one click away rather than always open.
     */
    compact?: boolean;
    /** Called after a retry or a re-sync lands, so a list can re-read itself. */
    onresolved?: () => void;
  } = $props();

  const copy = $derived(CAUSE[group.cause]);
  const machine = $derived(
    machines.find((one) => one.machineId === group.machineId)
  );
  const online = $derived(machine?.status === "online");
  const toolchain = $derived(readToolchain(machine?.fleet));

  /**
   * How many affected rows are named before the rest become a count. Our
   * choice, because: six monospace ids is about two lines at this panel's
   * width, and past that the list has stopped being something you take in at a
   * glance and become something you scroll.
   */
  const NAMED = 6;
  const shown = $derived(group.faults.slice(0, NAMED));
  const extra = $derived(group.faults.length - shown.length);

  let busy = $state(false);
  let actFailed = $state(false);
  /** What the remedy came to, said under its button. */
  let result = $state<{ tone: "done" | "fail"; text: string } | null>(null);
  let disclosureOpen = $state(false);
  let expanded = $state(false);
  const whole = $derived(!compact || expanded);

  const message = (error: unknown) =>
    error instanceof Error ? error.message : String(error);

  /**
   * An always-mounted part held open or shut by `open`: the first state lands
   * still, every change after it folds from where the part is drawn.
   */
  const disclose =
    (open: () => boolean, gap = 0) =>
    (node: HTMLElement) => {
      let first = true;
      $effect(() => {
        const next = open();
        if (first) {
          first = false;
          if (!next) {
            node.style.overflow = "hidden";
            node.style.height = "0px";
            node.style.marginBottom = `${-gap}px`;
            node.style.opacity = "0";
          }
          return;
        }
        fold(node, next, {
          ms: dur(next ? "--dur-pop" : "--dur-exit"),
          easing: CURVE.out,
          fade: true,
          gap,
        });
      });
    };

  async function resync() {
    if (!group.machineId) {
      return;
    }
    busy = true;
    actFailed = false;
    result = null;
    try {
      await syncFleet(group.machineId);
      result = {
        tone: "done",
        text: `Sent. This clears once ${machine ? machineLabel(machine.hostname) : "the machine"} reports back.`,
      };
      onresolved?.();
    } catch (error) {
      actFailed = true;
      result = { tone: "fail", text: message(error) };
    } finally {
      busy = false;
    }
  }

  /**
   * Re-resolve at the hub, for every row in this group. A skill and a plugin
   * have their own verbs and neither is the other's, so the scope picks.
   */
  async function refresh() {
    busy = true;
    actFailed = false;
    result = null;
    try {
      let stillFailing = 0;
      for (const fault of group.faults) {
        if (fault.scope === "skills") {
          // biome-ignore lint/performance/noAwaitInLoops: rows are re-resolved one at a time, in order, so the final count is right
          if ((await refreshSkill(fault.key)).error) {
            stillFailing += 1;
          }
        } else if (
          fault.scope === "plugins" &&
          (await refreshPlugin(fault.key)).error
        ) {
          stillFailing += 1;
        }
      }
      if (stillFailing > 0) {
        actFailed = true;
        result = {
          tone: "fail",
          text: `${stillFailing} still would not fetch. The row says why.`,
        };
      } else {
        result = {
          tone: "done",
          text: "Fetched. The machines are being sent the files.",
        };
      }
      onresolved?.();
    } catch (error) {
      actFailed = true;
      result = { tone: "fail", text: message(error) };
    } finally {
      busy = false;
    }
  }

  /** What the button will do, said before it is pressed rather than after. */
  const actionLabel = $derived.by(() => {
    if (copy.action === "resync") {
      return "Sync this machine";
    }
    if (copy.action === "refresh") {
      return group.faults.length > 1
        ? `Fetch all ${group.faults.length} again`
        : "Fetch again";
    }
    return "";
  });
  const actionHint = $derived.by(() => {
    if (copy.action === "resync") {
      return "Applies the fleet’s setup to this machine again and reports what came of it.";
    }
    if (copy.action === "refresh") {
      return "Downloads the content at the hub, once, then hands the bytes to every machine.";
    }
    return "";
  });
</script>

<div class="fault" class:hub={group.origin === "hub"}>
  <div class="top">
    <IconWarningTriangle class="size-4 shrink-0" />
    <span class="title">{copy.title}</span>
    <!-- Where, never left implicit: the whole point of the investigation this
         came out of was that a badge named no machine. -->
    <span class="where">
      {#if group.origin === "hub"}
        <span class="tag">at the hub</span>
      {:else if machine}
        <span class="tag">
          <OsMark class="size-4 shrink-0" os={machine.os} />
          {machineLabel(machine.hostname)}{online ? "" : " · offline"}
        </span>
      {:else}
        <span class="tag">{group.machineId}</span>
      {/if}
    </span>
    {#if compact}
      <button
        aria-expanded={expanded}
        class="disclose more-toggle touch-hit"
        onclick={() => {
          expanded = !expanded;
        }}
        type="button"
      >
        <IconChevronRight class="chevron size-4 shrink-0" />
        {expanded ? "Hide" : "Details"}
      </button>
    {/if}
  </div>

  <div class="body" inert={!whole} {@attach disclose(() => whole)}>
    <div class="inner">
      <p class="rows">
        <span class="noun"
          >{SCOPE_NOUN[group.scope]}
          {group.faults.length === 1 ? "" : "s"}:</span
        >
        {#each shown as fault (fault.scope + fault.key)}
          <code>{faultLabel(fault)}</code>
        {/each}
        {#if extra > 0}
          <span class="more">and {extra} more</span>
        {/if}
      </p>

      <p class="why">{copy.why}</p>

      {#if copy.toolchain && toolchain}
        <!-- The attribution that was missing: which binary said it, and whether a
         newer one is sitting on the same machine behind it. -->
        <div class="tool">
          <span class="k">claude on this machine</span>
          {#if toolchain.used}
            <span class="line used">
              <code>{toolchain.used.path}</code>
              <span class="v"
                >{toolchain.used.version ?? "version unknown"}</span
              >
              <span class="badge">ran this sync</span>
            </span>
          {/if}
          {#each toolchain.others as other (other.path)}
            <span class="line">
              <code>{other.path}</code>
              <span class="v">{other.version ?? "version unknown"}</span>
            </span>
          {/each}
          {#if toolchain.shadowed}
            <p class="shadow">
              A newer claude is installed on this machine and is not the one
              PATH resolves first. Until that changes, updating again will not
              help.
            </p>
          {/if}
        </div>
      {/if}

      {#if group.faults[0]?.detail}
        {#if group.cause === "unknown"}
          <pre class="said">{group.faults[0].detail}</pre>
        {:else}
          <button
            aria-expanded={disclosureOpen}
            class="disclose touch-hit"
            onclick={() => {
              disclosureOpen = !disclosureOpen;
            }}
            type="button"
          >
            <IconChevronRight class="chevron size-4 shrink-0" />
            What it said
          </button>
          <div
            class="saids"
            inert={!disclosureOpen}
            {@attach disclose(() => disclosureOpen, 7)}
          >
            {#each shown as fault (fault.scope + fault.key)}
              {#if fault.detail}
                <pre
                  class="said"
                ><span class="for">{faultLabel(fault)}</span>{fault.detail}</pre>
              {/if}
            {/each}
          </div>
        {/if}
      {/if}

      <p class="fix">{copy.fix}</p>

      <div class="acts">
        {#if copy.action === "resync"}
          <Button
            disabled={!online}
            failed={actFailed}
            icon={IconRefresh}
            label={actionLabel}
            onclick={resync}
            pending={busy}
            pendingLabel="Syncing…"
            size="xs"
            variant="outline"
          />
          <span class="hint"
            >{online
              ? actionHint
              : "It syncs on its own the moment it comes back."}</span
          >
        {:else if copy.action === "refresh"}
          <Button
            class="num"
            failed={actFailed}
            icon={IconRefresh}
            label={actionLabel}
            onclick={refresh}
            pending={busy}
            pendingLabel="Fetching…"
            size="xs"
            variant="outline"
          />
          <span class="hint">{actionHint}</span>
        {:else if copy.action === "settle"}
          <Button href={faultHref(group.faults[0])} size="xs" variant="outline"
            >Compare the two copies</Button
          >
          <span class="hint"
            >Adopt this machine’s copy into the fleet, or overwrite it with the
            fleet’s.</span
          >
        {:else}
          <Button href={faultHref(group.faults[0])} size="xs" variant="outline"
            >Open the section</Button
          >
        {/if}
      </div>
      {#if result}
        <p
          class="result"
          data-flip
          data-tone={result.tone}
          role={result.tone === "fail" ? "alert" : "status"}
          in:appear
        >
          {result.text}
        </p>
      {/if}
    </div>
  </div>
</div>

<style>
  /* The alert recipe: a compact status-tinted row, status ink on its own
     tint, no edge. */
  .fault {
    --tone-bg: var(--status-attn-bg);
    --tone-ink: var(--status-attn-ink);
    display: flex;
    flex-direction: column;
    border-radius: var(--radius-md);
    background: var(--tone-bg);
    color: var(--tone-ink);
    padding: 10px 12px;
    font: var(--type-body);
    min-width: 0;
  }
  /* A hub fault is not a machine's problem and does not wear a machine's tint:
     nothing downstream of it can be fixed until it is. */
  .fault.hub {
    --tone-bg: var(--status-fail-bg);
    --tone-ink: var(--status-fail-ink);
  }
  /* The body folds as one piece under the title line; its own gap to the
     line sits inside it, so a shut body leaves nothing behind. */
  .inner {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding-block-start: var(--space-2);
  }
  .saids {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  /* The chevron turns with the disclosure it opens. */
  :global(.chevron) {
    @media (prefers-reduced-motion: no-preference) {
      transition: rotate var(--dur-control) var(--ease-out);
    }
  }
  [aria-expanded="true"] > :global(.chevron) {
    rotate: 90deg;
  }
  .result {
    font-size: var(--text-meta);
    font-weight: var(--weight-body);
    color: var(--tone-ink);
    overflow-wrap: anywhere;

    &[data-tone="fail"] {
      color: var(--status-fail-ink);
    }
  }
  .top {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
  }
  .title {
    font-size: var(--text-label);
    font-weight: var(--weight-strong);
    color: var(--tone-ink);
  }
  /* The machine sits beside the title, not pushed to the far edge. Measured:
     `margin-left: auto` opened a 717px gap between the two halves of one
     sentence — "what broke" and "where" read as one fact and belong together. */
  .where {
    display: inline-flex;
  }
  .tag {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    border-radius: var(--radius-pill);
    background: var(--surface-raised);
    padding: 1px var(--space-2);
    font-size: var(--text-meta);
    font-weight: var(--weight-body);
    color: var(--ink-muted);
    white-space: nowrap;
  }
  .rows {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: var(--space-1) var(--space-2);
    min-width: 0;
  }
  .noun,
  .more,
  .hint {
    font-size: var(--text-meta);
    font-weight: var(--weight-body);
    color: var(--tone-ink);
    opacity: 0.8;
  }
  code {
    font-family: var(--font-mono);
    font-size: var(--text-meta);
    color: var(--tone-ink);
    overflow-wrap: anywhere;
  }
  .why,
  .fix {
    font-size: var(--text-body);
    font-weight: var(--weight-body);
    color: var(--tone-ink);
    max-width: 68ch;
  }
  .tool {
    display: flex;
    flex-direction: column;
    gap: 2px;
    border-radius: var(--radius-sm);
    background: var(--surface-recess);
    border: 1px solid var(--border-hairline);
    padding: var(--space-2);
  }
  .tool .k {
    font-size: var(--text-meta);
    font-weight: var(--weight-body);
    color: var(--ink-muted);
  }
  .tool .line {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: var(--space-2);
  }
  .tool .v {
    font-size: var(--text-meta);
    font-weight: var(--weight-body);
    font-variant-numeric: tabular-nums;
    color: var(--ink-muted);
  }
  .tool .badge {
    border-radius: var(--radius-pill);
    background: var(--surface-raised);
    padding: 0 var(--space-2);
    font-size: var(--text-meta);
    font-weight: var(--weight-body);
    color: var(--ink-muted);
  }
  .shadow {
    font-size: var(--text-meta);
    font-weight: var(--weight-body);
    color: var(--ink-strong);
    padding-top: var(--space-1);
  }
  /* The well and the quoted output sit on --surface-recess, a neutral ground, so
     they keep neutral ink rather than inheriting the callout's tone. */
  .tool code,
  .said {
    color: var(--ink-strong);
  }
  .tool .line.used code {
    font-weight: var(--weight-strong);
  }
  /* min-height 24px: measured at 14.6px, below the 24px WCAG 2.5.8 (AA)
     minimum target size. The negative inline margin keeps the label optically
     flush with the text above it while the target itself stays full size. */
  .disclose {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    align-self: flex-start;
    min-height: 24px;
    margin-inline-start: calc(var(--space-2) * -1);
    padding-inline: var(--space-2);
    border-radius: var(--radius-sm);
    font-size: var(--text-meta);
    font-weight: var(--weight-body);
    color: var(--ink-muted);
    cursor: pointer;
  }
  .disclose {
    color: var(--tone-ink);
    opacity: 0.8;
  }
  .disclose:hover {
    opacity: 1;
  }
  .more-toggle {
    margin-inline-start: auto;
  }
  .said {
    max-height: 10rem;
    overflow: auto;
    border-radius: var(--radius-sm);
    background: var(--surface-recess);
    border: 1px solid var(--border-hairline);
    padding: var(--space-2);
    font-family: var(--font-mono);
    font-size: var(--text-meta);
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  .said .for {
    display: block;
    color: var(--ink-muted);
  }
  .acts {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
  }
</style>
