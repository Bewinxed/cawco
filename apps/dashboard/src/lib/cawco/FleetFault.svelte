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
  import { failureWords as message } from "#lib/cawco/hub-read.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import {
    IconChevronRight,
    IconRefresh,
    IconWarningTriangle,
  } from "#lib/icons.js";
  import type { Machine } from "./client.svelte";
  import {
    adoptSkill,
    pushSkill,
    refreshPlugin,
    refreshSkill,
    syncFleet,
  } from "./fleet";
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

  /**
   * A skill has no editor of its own to compare copies in, so its drift is
   * settled here, with the hook editor's two buttons and words: adopt this
   * machine's copy into the fleet, or send the fleet's over it.
   */
  let settling = $state<Record<string, "adopt" | "push">>({});
  let settleFailed = $state<Record<string, boolean>>({});
  const machineName = $derived(
    machine ? machineLabel(machine.hostname) : (group.machineId ?? "")
  );

  async function settle(name: string, way: "adopt" | "push") {
    if (!group.machineId) {
      return;
    }
    settling[name] = way;
    delete settleFailed[name];
    result = null;
    try {
      if (way === "adopt") {
        await adoptSkill(name, group.machineId);
        result = {
          tone: "done",
          text: `The fleet now keeps ${machineName}'s copy.`,
        };
      } else {
        await pushSkill(name, group.machineId);
        result = {
          tone: "done",
          text: `${machineName} takes the fleet's copy.`,
        };
      }
      onresolved?.();
    } catch (error) {
      settleFailed[name] = true;
      result = { tone: "fail", text: message(error) };
    } finally {
      delete settling[name];
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

<!-- The alert recipe: a compact status-tinted row, status ink on its own
     tint, no edge. A hub fault is not a machine's problem and does not wear a
     machine's tint: nothing downstream of it can be fixed until it is. -->
<!-- literal: 10px, 12px -->
<div
  class="flex min-w-0 flex-col rounded-md bg-(--tone-bg) px-(--fault-x) py-(--fault-y) type-body text-(color:--tone-ink)"
  data-hub={group.origin === "hub" || undefined}
  style:--fault-x="12px"
  style:--fault-y="10px"
  style:--tone-bg={group.origin === "hub"
    ? "var(--status-fail-bg)"
    : "var(--status-attn-bg)"}
  style:--tone-ink={group.origin === "hub"
    ? "var(--status-fail-ink)"
    : "var(--status-attn-ink)"}
>
  <div
    data-slot="top"
    class="mark-line flex flex-wrap items-center gap-space-2"
  >
    <IconWarningTriangle class="size-icon-md shrink-0" />
    <span
      data-slot="title"
      class="text-size-label font-medium text-(color:--tone-ink)"
      >{copy.title}</span
    >
    <!-- Where, never left implicit: the whole point of the investigation this
         came out of was that a badge named no machine. The machine sits beside
         the title, not pushed to the far edge: "what broke" and "where" read
         as one fact and belong together. -->
    <span data-slot="where" class="inline-flex" data-box>
      {#if group.origin === "hub"}
        <span
          data-slot="tag"
          class="inline-flex items-center gap-space-1 rounded-pill bg-surface-raised px-space-2 py-px text-size-meta font-normal whitespace-nowrap text-ink-muted"
          >at the hub</span
        >
      {:else if machine}
        <span
          data-slot="tag"
          class="mark-line inline-flex items-center gap-space-1 rounded-pill bg-surface-raised px-space-2 py-px text-size-meta font-normal whitespace-nowrap text-ink-muted"
        >
          <OsMark class="size-icon-md shrink-0" os={machine.os} />
          <span
            >{machineLabel(machine.hostname)}
            {group.harness ? ` · ${group.harness}` : ""}
            {online ? "" : " · offline"}</span
          >
        </span>
      {:else}
        <span
          data-slot="tag"
          class="inline-flex items-center gap-space-1 rounded-pill bg-surface-raised px-space-2 py-px text-size-meta font-normal whitespace-nowrap text-ink-muted"
          >{group.machineId}</span
        >
      {/if}
    </span>
    {#if compact}
      <!-- literal: 24px (min-height: 24px, below that the target is under the
           WCAG 2.5.8 (AA) minimum; measured at 14.6px). The margin keeps the
           label optically flush with the text above it. -->
      <button
        aria-expanded={expanded}
        class="group/disclose mark-line touch-hit inline-flex min-h-(--disclose-min) cursor-pointer items-center gap-space-1 self-start rounded-sm px-space-2 text-size-meta font-normal text-(color:--tone-ink) opacity-80 ms-auto hover:opacity-100"
        data-box
        onclick={() => {
          expanded = !expanded;
        }}
        style:--disclose-min="24px"
        type="button"
      >
        <IconChevronRight
          class="size-icon-md shrink-0 motion-safe:transition-[rotate] motion-safe:dur-control motion-safe:ease-out group-aria-expanded/disclose:rotate-90"
        />
        <span>{expanded ? "Hide" : "Details"}</span>
      </button>
    {/if}
  </div>

  <div
    data-slot="body"
    inert={!whole}
    {@attach disclose(() => whole)}
  >
    <!-- The body folds as one piece under the title line; its own gap to the
         line sits inside it, so a shut body leaves nothing behind. -->
    <div data-slot="inner" class="flex flex-col gap-space-2 pt-space-2">
      <p class="flex min-w-0 flex-wrap items-baseline gap-x-space-2 gap-y-space-1">
        <span
          class="text-size-meta font-normal text-(color:--tone-ink) opacity-80"
          >{SCOPE_NOUN[group.scope]}
          {group.faults.length === 1 ? "" : "s"}:</span
        >
        {#each shown as fault (fault.scope + fault.key)}
          <code
            class="font-mono text-size-meta wrap-anywhere text-(color:--tone-ink)"
            >{faultLabel(fault)}</code
          >
        {/each}
        {#if extra > 0}
          <span
            data-slot="more"
            class="text-size-meta font-normal text-(color:--tone-ink) opacity-80"
            >and {extra} more</span
          >
        {/if}
      </p>

      <!-- literal: 68ch -->
      <p
        data-slot="why"
        class="max-w-(--measure) text-size-body font-normal text-(color:--tone-ink)"
        style:--measure="68ch"
      >{copy.why}</p>

      {#if copy.toolchain && toolchain}
        <!-- The attribution that was missing: which binary said it, and whether a
         newer one is sitting on the same machine behind it. -->
        <div
          data-slot="tool"
          class="flex flex-col gap-space-row rounded-sm border border-border-hairline bg-surface-recess p-space-2"
        >
          <span class="text-size-meta font-normal text-ink-muted"
            >claude on this machine</span
          >
          {#if toolchain.used}
            <span class="flex flex-wrap items-baseline gap-space-2">
              <code
                class="font-mono text-size-meta font-medium wrap-anywhere text-ink-strong"
                >{toolchain.used.path}</code
              >
              <span
                class="num text-size-meta font-normal text-ink-muted"
                >{toolchain.used.version ?? "version unknown"}</span
              >
              <span
                class="rounded-pill bg-surface-raised px-space-2 py-0 text-size-meta font-normal text-ink-muted"
                >ran this sync</span
              >
            </span>
          {/if}
          {#each toolchain.others as other (other.path)}
            <span class="flex flex-wrap items-baseline gap-space-2">
              <code
                class="font-mono text-size-meta wrap-anywhere text-ink-strong"
                >{other.path}</code
              >
              <span class="num text-size-meta font-normal text-ink-muted"
                >{other.version ?? "version unknown"}</span
              >
            </span>
          {/each}
          {#if toolchain.shadowed}
            <p class="pt-space-1 text-size-meta font-normal text-ink-strong">
              A newer claude is installed on this machine and is not the one
              PATH resolves first. Until that changes, updating again will not
              help.
            </p>
          {/if}
        </div>
      {/if}

      {#if group.faults[0]?.detail}
        {#if group.cause === "unknown"}
          <!-- literal: 10rem -->
          <pre
            class="max-h-(--said-max) overflow-auto rounded-sm border border-border-hairline bg-surface-recess p-space-2 font-mono text-size-meta wrap-anywhere whitespace-pre-wrap text-ink-strong"
            style:--said-max="10rem">{group.faults[0].detail}</pre>
        {:else}
          <!-- literal: 24px -->
          <button
            aria-expanded={disclosureOpen}
            class="group/disclose mark-line touch-hit -ms-space-2 inline-flex min-h-(--disclose-min) cursor-pointer items-center gap-space-1 self-start rounded-sm px-space-2 text-size-meta font-normal text-(color:--tone-ink) opacity-80 hover:opacity-100"
            onclick={() => {
              disclosureOpen = !disclosureOpen;
            }}
            style:--disclose-min="24px"
            type="button"
          >
            <IconChevronRight
              class="size-icon-md shrink-0 motion-safe:transition-[rotate] motion-safe:dur-control motion-safe:ease-out group-aria-expanded/disclose:rotate-90"
            />
            <span>What it said</span>
          </button>
          <div
            class="flex flex-col gap-space-2"
            inert={!disclosureOpen}
            {@attach disclose(() => disclosureOpen, 7)}
          >
            {#each shown as fault (fault.scope + fault.key)}
              {#if fault.detail}
                <!-- literal: 10rem -->
                <pre
                  class="max-h-(--said-max) overflow-auto rounded-sm border border-border-hairline bg-surface-recess p-space-2 font-mono text-size-meta wrap-anywhere whitespace-pre-wrap text-ink-strong"
                  style:--said-max="10rem"><span class="block text-ink-muted"
                    >{faultLabel(fault)}</span
                  >{fault.detail}</pre>
              {/if}
            {/each}
          </div>
        {/if}
      {/if}

      <!-- literal: 68ch -->
      <p
        class="max-w-(--measure) text-size-body font-normal text-(color:--tone-ink)"
        style:--measure="68ch"
      >{copy.fix}</p>

      <div
        data-slot="acts"
        class="flex flex-wrap items-center gap-space-2"
      >
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
          <span class="text-size-meta font-normal text-(color:--tone-ink) opacity-80"
            >{online
              ? actionHint
              : "It syncs on its own the moment it comes back."}</span
          >
        {:else if copy.action === "refresh"}
          <Button
            data-num
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
          <span class="text-size-meta font-normal text-(color:--tone-ink) opacity-80">{actionHint}</span>
        {:else if copy.action === "settle" && group.scope === "skills"}
          {#each shown as fault (fault.key)}
            {#if group.faults.length > 1}
              <code
                class="font-mono text-size-meta wrap-anywhere text-(color:--tone-ink)"
                >{fault.key}</code
              >
            {/if}
            <Button
              disabled={!online || settling[fault.key] === "push"}
              failed={settleFailed[fault.key] === true}
              label="Adopt this copy"
              onclick={() => settle(fault.key, "adopt")}
              pending={settling[fault.key] === "adopt"}
              pendingLabel="Adopting…"
              size="xs"
              variant="outline"
            />
            <Button
              disabled={!online || settling[fault.key] === "adopt"}
              failed={settleFailed[fault.key] === true}
              label="Send ours"
              onclick={() => settle(fault.key, "push")}
              pending={settling[fault.key] === "push"}
              pendingLabel="Sending…"
              size="xs"
              variant="outline"
            />
          {/each}
          <span class="text-size-meta font-normal text-(color:--tone-ink) opacity-80"
            >Adopt this machine’s copy into the fleet, or overwrite it with the
            fleet’s.</span
          >
        {:else if copy.action === "settle"}
          <Button href={faultHref(group.faults[0])} size="xs" variant="outline"
            >Compare the two copies</Button
          >
          <span class="text-size-meta font-normal text-(color:--tone-ink) opacity-80"
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
          data-slot="result"
          class="text-size-meta font-normal wrap-anywhere text-(color:--tone-ink) tone-fail:text-status-fail-ink"
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
