<script lang="ts">
  /**
   * One machine in an editor's Per machine list: its row, and when its copy
   * drifted, Compare, Adopt this copy and Send ours; why a settle was
   * refused or waits for the machine; what it reported failing; and its
   * copy folded open under it, read and diffed against ours.
   */
  import { machineLabel } from "@cawco/core/machine-names";
  import { memoryWords as words } from "@cawco/core/words/memory";
  import MachineAway from "#lib/cawco/MachineAway.svelte";
  import { crossIn, crossOut } from "#lib/cawco/motion/curves.svelte.js";
  import { unfold } from "#lib/cawco/motion/fold.svelte.js";
  import { morph } from "#lib/cawco/motion/morph.svelte.js";
  import RowFault from "#lib/cawco/RowFault.svelte";
  import DiffView from "#lib/components/features/DiffView.svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import {
    MachineRow,
    machineHue,
    machineIcon,
  } from "#lib/components/ui/machine-row/index.js";
  import { Spinner } from "#lib/components/ui/spinner/index.js";
  import type { Machine } from "../client.svelte";
  import type { MachineCopies } from "./machine-copies.svelte";

  let {
    copies,
    machine,
    index,
    slot,
    meta,
    acts,
    drifted,
    detail,
    oncompare,
    onadopt,
    onsend,
    reading,
    noCopy,
    diff,
    foldSlot,
    swapSlot,
  }: {
    copies: MachineCopies;
    machine: Machine;
    /** Its place in the list, which picks its hue. */
    index: number;
    /** The row's data-slot. */
    slot: string;
    /** Where its copy stands, its OS, and whether it is online. */
    meta: string;
    /** Its settles stand: Adopt this copy, and when it `drifted`, Compare and Send ours. */
    acts: boolean;
    drifted: boolean;
    /** What it reported failing, drawn under its row. */
    detail: string | undefined;
    oncompare: () => void;
    onadopt: () => void;
    onsend: () => void;
    /** What its copy says while it is read, and when it has none. */
    reading: string;
    noCopy: string;
    /** Ours, the file it diffs as, and what ours is keyed on (its hash). */
    diff: { filePath: string; oldContent: string; hash: string };
    foldSlot?: string;
    swapSlot?: string;
  } = $props();

  const at = $derived(machine.machineId);
  const online = $derived(machine.status === "online");
  const comparingThis = $derived(copies.comparing === at);
  const settle = $derived(copies.settling[at]);
</script>

<li
  data-slot={slot}
  class="flex flex-col gap-space-2 py-space-2 not-first:border-t not-first:border-t-border-hairline"
>
  <div class="relative flex flex-wrap items-center gap-x-space-3 gap-y-space-2">
    <MachineRow
      hue={machineHue(index, online)}
      icon={machineIcon(machine.os)}
      {meta}
      name={machineLabel(machine.hostname)}
      presence={online ? "online" : "off"}
    />
    {#if acts}
      <span
        data-slot="acts"
        class="flex flex-wrap gap-space-2"
        in:crossIn
        out:crossOut
      >
        {#if drifted}
          <Button
            disabled={!online}
            onclick={oncompare}
            size="sm"
            variant={comparingThis ? "secondary" : "outline"}
          >
            {comparingThis ? words.hide : words.compare}
          </Button>
        {/if}
        <Button
          disabled={!online || settle === "push"}
          failed={at in copies.settleFailed}
          label={words.adoptCopy}
          onclick={onadopt}
          pending={settle === "adopt"}
          pendingLabel={words.adopting}
          size="sm"
          variant="outline"
        />
        {#if drifted}
          <Button
            disabled={!online || settle === "adopt"}
            failed={at in copies.settleFailed}
            label={words.sendOurs}
            onclick={onsend}
            pending={settle === "push"}
            pendingLabel={words.sending}
            size="sm"
            variant="outline"
          />
        {/if}
      </span>
    {/if}
  </div>
  <RowFault reason={copies.settleFailed[at]} />
  <MachineAway away={copies.waits.away(`settle:${at}`)} />
  {#if detail}
    <pre
      class="max-h-c-detail-max overflow-auto rounded-sm bg-surface-raised px-space-2 py-space-2 font-mono text-size-meta wrap-anywhere whitespace-pre-wrap"
      in:unfold
      out:unfold>{detail}</pre>
  {/if}
  {#if comparingThis}
    <!-- Its copy folds open under its row; reading cross-fades to what was
         read as the box follows. -->
    <div
      data-slot={foldSlot}
      class="flex flex-col gap-space-2"
      in:unfold
      out:unfold
    >
      <div
        data-slot={swapSlot}
        class="relative flex flex-col"
        {@attach morph()}
      >
        {#if copies.waits.away(`peek:${at}`)}
          <MachineAway away={copies.waits.away(`peek:${at}`)} />
        {:else if copies.peeking[at]}
          <p
            data-slot="note"
            class="mark-line flex items-center gap-space-2 type-meta max-w-c-measure text-ink-muted"
            role="status"
            in:crossIn
            out:crossOut
          >
            <Spinner class="shrink-0" /><span>{reading}</span>
          </p>
        {:else if copies.unread[at]}
          <p
            class="type-meta text-status-attn-ink"
            role="alert"
            in:crossIn
            out:crossOut
          >
            {copies.unread[at]}
          </p>
        {:else if copies.copies[at] === null}
          <p
            data-slot="note"
            class="type-meta max-w-c-measure text-ink-muted"
            in:crossIn
            out:crossOut
          >
            {noCopy}
          </p>
        {:else if copies.copies[at] !== undefined}
          <div in:crossIn out:crossOut>
            {#key `${at}:${diff.hash}`}
              <DiffView
                filePath={diff.filePath}
                newContent={copies.copies[at] ?? ""}
                oldContent={diff.oldContent}
              />
            {/key}
          </div>
        {/if}
      </div>
    </div>
  {/if}
</li>
