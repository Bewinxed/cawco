<script lang="ts">
  /**
   * The decision cards a task waits on that are not picked yet, as its sheet
   * leads with them (Details' TaskNeeds, Review's TaskReview): one card in
   * the needs recipe, the Needs-you mark in its head, each question whole
   * and its Pick, then what a pick does. Pick goes where the card's chip on
   * the sheet goes, its page in the project's Decisions at the card
   * (sheet-cards.ts); outside a sheet it opens as the chip in the
   * transcript does (`openReference`), a refused open said under its
   * question with Try again.
   */
  import { decisionReference, parseReference } from "@cawco/core/references";
  import { taskNeedsWords as words } from "@cawco/core/words/task-review";
  import { Button } from "#lib/components/ui/button/index.js";
  import { IconNeedsYou } from "#lib/icons.js";
  import type { TaskWait } from "../project-tasks";
  import RowFault from "../RowFault.svelte";
  import { openReference } from "../reference-open.svelte";
  import { sessionHere } from "../session-here";
  import { sheetCardsHere } from "./sheet-cards";

  let { picks }: { picks: TaskWait[] } = $props();

  const here = sessionHere();
  /** On a task's sheet: each card's way to its page in Decisions. */
  const sheet = sheetCardsHere();
  /** A wait's card, by its page's artifact and its id. */
  const cardOf = (wait: TaskWait) => {
    const named = parseReference(wait.href);
    return named?.kind === "decision" ? decisionReference(named.id) : null;
  };
  /** Each card's refused open, by its wait. */
  let refused = $state<Record<string, string>>({});

  async function pick(wait: TaskWait) {
    const card = cardOf(wait);
    if (!card) {
      return;
    }
    const why = await openReference(
      card.artifact,
      { card: card.card },
      here?.()
    );
    const { [wait.target]: _was, ...rest } = refused;
    refused = why ? { ...rest, [wait.target]: why } : rest;
  }
</script>

<section
  aria-label={words.picksHead(picks.length)}
  class="flex flex-col gap-space-3 rounded-md border border-status-attn-glyph/40 bg-needs-ground px-space-4 pt-space-3 pb-space-4"
  data-slot="needs"
>
  <h3
    class="mark-line m-0 flex items-center gap-space-2 type-label text-status-attn-ink"
    data-slot="head"
  >
    <IconNeedsYou
      class="size-icon-md flex-none text-status-attn-glyph"
      data-task-needs-glyph
    />
    <span>{words.picksHead(picks.length)}</span>
  </h3>
  <ul class="m-0 flex list-none flex-col gap-space-3 p-0">
    {#each picks as wait (wait.target)}
      {@const card = cardOf(wait)}
      {@const there = card ? sheet(card.artifact, card.card) : null}
      <li class="flex flex-col gap-space-1" data-slot="pick">
        <!-- The question whole, its Pick on its first line's end; a long
             one wraps under itself, never past the card. -->
        <div class="flex items-start gap-space-3">
          <p
            class="m-0 min-w-0 flex-auto type-body text-pretty text-ink-strong"
          >
            {wait.label}
          </p>
          <!-- On a task's sheet, a link to the card in Decisions; else it
               opens as the card's chip does. -->
          <Button
            aria-label={words.pickOn(wait.label)}
            class="flex-none"
            href={there?.href}
            label={words.pick}
            onclick={there ? undefined : () => pick(wait)}
            size="sm"
          />
        </div>
        <RowFault
          again={() => pick(wait)}
          reason={refused[wait.target] ?? null}
        />
      </li>
    {/each}
  </ul>
  <p class="m-0 type-meta text-ink-muted">{words.picksLine}</p>
</section>
