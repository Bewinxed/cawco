<script lang="ts">
  import { fivePlacesWords as words } from "@cawco/core/words/proto-five-places";
  /**
   * The two sheets under the bar's More: Spend (today and this month against
   * the cap, drawn as meters, and what reaching the cap stops) and Configure
   * (how it runs, places and wiring, who decides, events, account; Forget
   * and Delete at its foot, each asked in the sheet, naming what still runs
   * and stopping it first). The kit's Sheet, drawn inside the screen.
   */
  import { Button } from "#lib/components/ui/button/index.js";
  import Progress from "#lib/components/ui/progress/progress.svelte";
  import * as Sheet from "#lib/components/ui/sheet/index.js";
  import { IconChevronRight, IconTrash } from "#lib/icons.js";
  import type { ProjectRecords } from "./records";

  let {
    records,
    sheet,
    asking: askingArg = null,
    onclose,
  }: {
    records: ProjectRecords;
    sheet: "spend" | "configure" | null;
    /** The end being asked about in the sheet. */
    asking?: "forget" | "delete" | null;
    onclose: () => void;
  } = $props();

  let asking = $derived(askingArg);
  const money = (amount: number) => `$${amount.toFixed(2)}`;
  const running = $derived(
    records.sessions.filter(
      (session) => session.status === "working" || session.status === "needs"
    )
  );
  const SECTIONS = ["setup", "places", "decides", "events", "account"] as const;
</script>

<Sheet.Root
  onOpenChange={(open) => {
    if (!open) {
      onclose();
    }
  }}
  open={sheet !== null}
>
  <Sheet.Content
    portalProps={{ disabled: true }}
    side="right"
    title={sheet === "spend" ? words.spendTitle : words.configureTitle}
    trapFocus={false}
  >
    {#if sheet === "spend"}
      <div class="flex flex-col gap-space-5 px-space-4 pb-space-6">
        {#each [{ name: words.today, used: records.spend.today, of: records.spend.cap }, { name: words.thisMonth, used: records.spend.month, of: records.spend.cap * 30 }] as row (row.name)}
          <section class="flex flex-col gap-space-2">
            <div class="flex items-baseline justify-between gap-space-3">
              <h3 class="type-label text-ink-strong">{row.name}</h3>
              <span class="type-kpi text-ink-stat num">{money(row.used)}</span>
            </div>
            <Progress aria-label={row.name} max={row.of} value={row.used} />
            <span class="type-meta text-ink-muted num">{money(row.of)}</span>
          </section>
        {/each}
        <p class="type-label text-ink-strong">
          {words.capLine(money(records.spend.cap))}
        </p>
        <p class="max-w-c-measure-short type-body text-ink-muted text-pretty">
          {words.capStops}
        </p>
      </div>
    {:else if sheet === "configure"}
      <div class="flex flex-col gap-space-5 px-space-4 pb-space-6">
        <ul class="flex flex-col overflow-hidden rounded-lg bg-surface-recess">
          {#each SECTIONS as section (section)}
            <li class="border-b border-border-hairline last:border-b-0">
              <a
                class="press-tint mark-line flex h-c-row-h items-center gap-space-3 px-space-4 type-label text-ink-row can-hover:hover:bg-surface-hover"
                href={`#configure-${section}`}
              >
                <span class="flex-1">{words.configureSections[section]}</span>
                <IconChevronRight
                  aria-hidden="true"
                  class="size-icon-sm text-ink-subtle"
                />
              </a>
            </li>
          {/each}
        </ul>
        <div class="flex flex-col gap-space-2">
          <Button
            align="row"
            aria-expanded={asking === "forget"}
            label={words.forget}
            onclick={() => {
              asking = asking === "forget" ? null : "forget";
            }}
            variant="ghost"
          />
          <Button
            align="row"
            aria-expanded={asking === "delete"}
            icon={IconTrash}
            label={words.deleteProject}
            onclick={() => {
              asking = asking === "delete" ? null : "delete";
            }}
            tone="destructive"
            variant="ghost"
          />
          {#if asking}
            <!-- Asked in the page (DESIGN.md, Asking in the page): what it
                 does, what still runs and stops first, Cancel then the verb. -->
            <div
              class="flex flex-col gap-space-2 rounded-lg bg-surface-raised p-space-4 shadow-tile"
            >
              <p class="type-label text-ink-strong">
                {asking === "forget"
                  ? words.forgetAsk(records.name)
                  : words.deleteAsk(records.name)}
              </p>
              <p class="type-meta text-ink-muted text-pretty">
                {asking === "forget"
                  ? words.forgetLine(running.length)
                  : words.deleteLine(running.length)}
              </p>
              <ul class="flex flex-col gap-space-row type-meta text-ink-strong">
                {#each running as session (session.id)}
                  <li>{session.title} · {session.machine}</li>
                {/each}
              </ul>
              <div class="flex justify-end gap-space-2 pt-space-1">
                <Button
                  label={words.cancel}
                  onclick={() => {
                    asking = null;
                  }}
                  size="sm"
                  variant="ghost"
                />
                <Button
                  label={asking === "forget"
                    ? words.forgetVerb
                    : words.deleteVerb}
                  size="sm"
                  variant="destructive"
                />
              </div>
            </div>
          {/if}
        </div>
      </div>
    {/if}
  </Sheet.Content>
</Sheet.Root>
