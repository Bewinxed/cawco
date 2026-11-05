<script lang="ts">
  /**
   * The Configure sheet, under More in every place's bar (TOM tasks 16, 17
   * and 19): how the project runs, changed with Caw; where it lives and how
   * it is wired, as facts in rows; its spend cap and what reaching it
   * stops; and, at the foot, forget or delete. Forgetting asks in the page
   * under its own row (DESIGN.md, Asking in the page): what still runs,
   * named, and that it stops first; Cancel takes the focus.
   */
  import { homeFirstWords as words } from "@cawco/core/words/proto-home-first";
  import { Button } from "#lib/components/ui/button/index.js";
  import { IconSparkles } from "#lib/icons.js";
  import { money } from "./format";

  let {
    project,
    asking = false,
  }: {
    project: string;
    /** Forget project… was pressed: the question stands under it. */
    asking?: boolean;
  } = $props();

  const WIRING: [string, string][] = [
    [
      words.configure.rows.places,
      "obelisk-of-light · ~/cawco-marketing (primary) · the hub's folder",
    ],
    [words.configure.rows.tracker, "CawCo's files"],
    [words.configure.rows.lands, "Nowhere: its results are files and posts"],
    [words.configure.rows.checks, "None"],
    [
      words.configure.rows.decides,
      "You decide looks and behaviour; an advisor decides tools",
    ],
    [words.configure.rows.events, "On: routine runs, reports, GitHub pushes"],
    [words.configure.rows.account, "The fleet's routing"],
  ];
  const RUNNING = [
    "Make the Caw bookend kit for clips (attempt)",
    "Prepare CawCo profile and email (OpenCode)",
    "Caw: let's setup this project again",
  ];
</script>

<div class="flex flex-col gap-space-6">
  <section class="flex flex-col gap-space-2">
    <h3 class="m-0 type-label text-ink-strong">{words.configure.setup}</h3>
    <p class="m-0 type-body text-ink-muted text-pretty">
      {words.configure.setupLine}
    </p>
    <div>
      <Button data-icon="inline-start" size="sm" variant="outline">
        <IconSparkles aria-hidden="true" />
        <span>{words.configure.changeWithCaw}</span>
      </Button>
    </div>
  </section>

  <section class="flex flex-col gap-space-2">
    <h3 class="m-0 type-label text-ink-strong">{words.configure.wiring}</h3>
    <dl class="m-0 flex flex-col">
      {#each WIRING as [term, fact] (term)}
        <div
          class="flex flex-col gap-space-row border-b border-b-border-hairline py-space-2 last:border-b-0"
        >
          <dt class="type-meta text-ink-muted">{term}</dt>
          <dd class="m-0 type-body text-ink-strong text-pretty">{fact}</dd>
        </div>
      {/each}
    </dl>
  </section>

  <section class="flex flex-col gap-space-2">
    <h3 class="m-0 type-label text-ink-strong">{words.configure.cap}</h3>
    <p class="m-0 flex items-baseline gap-space-2">
      <span class="type-kpi text-ink-stat tabular-nums">{money(10)}</span>
      <span class="type-meta text-ink-muted">{words.configure.capPer}</span>
    </p>
    <p class="m-0 type-body text-ink-muted text-pretty">
      {words.configure.atCap}: new attempts and routine runs wait until
      midnight, Asia/Qatar.
    </p>
  </section>

  <section
    class="flex flex-col gap-space-2 border-t border-t-border-hairline pt-space-4"
  >
    <h3 class="m-0 type-label text-ink-strong">{words.configure.end}</h3>
    <div class="flex flex-wrap gap-space-2">
      <Button aria-expanded={asking} size="sm" variant="outline"
        >{words.configure.forget}</Button
      >
      <Button size="sm" variant="destructive">{words.configure.remove}</Button>
    </div>
    {#if asking}
      <div
        class="flex flex-col gap-space-2 rounded-md bg-surface-raised p-space-4 shadow-tile"
      >
        <p class="m-0 type-label text-ink-strong">
          {words.configure.forgetAsk(project)}
        </p>
        <p class="m-0 type-meta text-ink-muted">{words.configure.forgetLine}</p>
        <ul
          class="m-0 flex flex-col gap-space-1 ps-space-5 type-meta text-ink-strong"
        >
          {#each RUNNING as run (run)}
            <li>{run}</li>
          {/each}
        </ul>
        <div class="mt-space-2 flex justify-between gap-space-8">
          <Button size="sm" variant="ghost">{words.configure.cancel}</Button>
          <Button size="sm" variant="destructive"
            >{words.configure.forgetVerb}</Button
          >
        </div>
      </div>
    {/if}
  </section>
</div>
