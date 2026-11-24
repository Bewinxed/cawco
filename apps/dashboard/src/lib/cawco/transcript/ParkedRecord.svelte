<script lang="ts">
  /**
   * An `artifact_create` call that put a pick to the person outside itself
   * (core parked.ts), where the agent made it: the call's own tool row, and
   * under it, once he answered, each pick it put to him as it settled, in the
   * anatomy an answered question settles into (QuestionCard: its state's
   * mark and words on the rail, what it asked, what was picked as the kit's
   * option chips, chosen, and his note under them), read-only. While a pick
   * still waits, the composer holds it (ParkedPrompt) and nothing stands
   * here but the call. The picks are the pane's (parked-queue.svelte.ts), as
   * the hub keeps them, by the artifact the call's answer names.
   */
  import type { ParkedItem } from "@cawco/core/parked";
  import { parkedWords as words } from "@cawco/core/words/parked";
  import {
    chipsVariants,
    chipVariants,
  } from "#lib/components/ui/chip/index.js";
  import { Kbd } from "#lib/components/ui/kbd/index.js";
  import { IconCheck, IconClose } from "#lib/icons.js";
  import { crossIn } from "#lib/platform/motion/curves.svelte.js";
  import { parkedHere } from "../parked/parked-queue.svelte";
  import type { Message } from "../types";
  import ToolGroup from "./ToolGroup.svelte";

  let {
    message,
    asker = "the agent",
    items: given,
  }: {
    message: Message;
    /** Who asked, as the conversation names its agent. */
    asker?: string;
    /** The picks it put, as they stand; the pane's by default. */
    items?: ParkedItem[];
  } = $props();

  /** The card's surface starts on the rail's edge and its content on the glyph column, as an answered question's (QuestionCard). */
  const HITL_START =
    "calc(var(--x-glyph) - var(--x-rail) - var(--border-width))";
  /** The artifact the call's answer names (core references.ts `artifactLink`). */
  const ARTIFACT_LINK = /cawco:artifact\/([0-9a-f-]{36})/u;
  const queue = parkedHere();
  const artifactId = $derived.by(() => {
    const result = message.metadata?.toolResult;
    const text =
      typeof result === "string" ? result : JSON.stringify(result ?? "");
    return ARTIFACT_LINK.exec(text)?.[1] ?? null;
  });
  /** Each pick it put that is settled: answered, or withdrawn. */
  const settled = $derived(
    (given ?? (artifactId ? (queue?.of(artifactId) ?? []) : [])).filter(
      (item) => item.state !== "open"
    )
  );

  /** What was picked, each with its place among the options (its keycap). */
  const pickedOf = (item: ParkedItem): { at: number; label: string }[] => {
    if (item.state === "withdrawn") {
      return [];
    }
    if (item.kind === "directions") {
      const at = item.directions.findIndex((one) => one.file === item.picked);
      return at < 0 ? [] : [{ at, label: item.directions[at]?.name ?? "" }];
    }
    return (item.answer?.options ?? []).flatMap((id) => {
      const at = item.card.options.findIndex((option) => option.id === id);
      return at < 0 ? [] : [{ at, label: item.card.options[at]?.label ?? id }];
    });
  };
  /** Its state as its pill says it: a pick picked, a card answered, either withdrawn. */
  const stateWord = (item: ParkedItem): string => {
    if (item.state === "withdrawn") {
      return words.withdrawn;
    }
    return item.kind === "directions" ? words.picked : words.answered;
  };
  const noteOf = (item: ParkedItem): string =>
    item.kind === "card" && item.state !== "withdrawn"
      ? (item.answer?.note ?? "")
      : "";
</script>

<ToolGroup messages={[message]} />
{#each settled as item (`${item.artifact.id}/${item.key}`)}
  {@const picked = pickedOf(item)}
  {@const note = noteOf(item)}
  {@const done = item.state !== "withdrawn"}
  {@const title =
    item.kind === "directions"
      ? words.pickFrom(asker)
      : words.decisionFrom(asker)}
  <section
    aria-label={title}
    class="mt-space-4 ms-(--x-rail) rounded-lg border border-border-control bg-surface-raised py-space-3 pe-space-3 ps-(--hitl-start) shadow-hairline"
    data-frame
    data-slot="hitl"
    data-parked-record={item.kind}
    style:--hitl-start={HITL_START}
  >
    <h2
      class="rail-line mb-space-2 text-size-label font-medium text-ink-strong"
    >
      <span class="rail-cell inline-grid" data-slot="rail-cell">
        <span
          class={[
            "col-start-1 row-start-1 grid place-items-center",
            done ? "text-status-done-ink" : "text-ink-muted",
          ]}
          data-slot="mark"
        >
          {#if done}
            <IconCheck class="size-(--w-glyph)" />
          {:else}
            <IconClose class="size-(--w-glyph)" />
          {/if}
        </span>
      </span>
      <span>{title}</span>
      <span class="inline-grid" data-box>
        <span
          class={[
            "mark-line inline-flex h-icon-lg items-center rounded-pill px-space-2 py-0 text-size-label font-medium whitespace-nowrap",
            done
              ? "bg-status-done-bg text-status-done-ink"
              : "bg-surface-recess text-ink-muted",
          ]}><span>{stateWord(item)}</span></span
        >
      </span>
    </h2>
    <p
      class="rail-hang mb-space-2 max-w-c-measure type-body text-ink-strong"
      data-slot="lede"
    >
      {item.kind === "directions" ? item.ask : item.card.question}
    </p>
    {#if picked.length > 0}
      <div
        class={chipsVariants({
          class: "rail-hang relative mt-space-row mb-space-2",
        })}
        data-slot="qopts"
      >
        {#each picked as one (one.at)}
          <span class={chipVariants()} data-chosen data-slot="sel">
            <Kbd data-box look="keycap">{one.at + 1}</Kbd><span
              >{one.label}</span
            >
          </span>
        {/each}
      </div>
    {/if}
    {#if note}
      <p
        class="rail-hang flex max-w-c-measure items-baseline gap-space-2 type-body text-ink-strong"
        in:crossIn
      >
        <span
          class="flex-none text-size-label font-medium tracking-caps text-ink-muted uppercase"
          >{words.yourNote}</span
        >{note}
      </p>
    {/if}
  </section>
{/each}
