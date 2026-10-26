<script lang="ts">
  import {
    RULE_TEMPLATES,
    type RuleRow,
    ruleSentence,
    rulesWords,
  } from "@cawco/core";
  import { deleteRule } from "#lib/cawco/config/deletes.js";
  import FleetStarters from "#lib/cawco/config/FleetStarters.svelte";
  import RowActFaults from "#lib/cawco/config/RowActFaults.svelte";
  import RowList from "#lib/cawco/config/RowList.svelte";
  import { RowActs } from "#lib/cawco/config/row-acts.svelte.js";
  import SectionFrame from "#lib/cawco/config/SectionFrame.svelte";
  import SectionRow from "#lib/cawco/config/SectionRow.svelte";
  import { sectionOf } from "#lib/cawco/config/sections.js";
  import { configStore, withStats } from "#lib/cawco/config/store.svelte.js";
  import { EMPTY_LINES } from "#lib/cawco/empty-asks.js";
  import {
    createRule,
    draftOf,
    saveRule,
    since,
    times,
  } from "#lib/cawco/rules.js";
  import { Badge } from "#lib/components/ui/badge/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { EmptyState } from "#lib/components/ui/empty/index.js";
  import { IconPlus, IconRules, IconTrash } from "#lib/icons.js";

  /**
   * The rules. Each row reads as the sentence the rule is, because a rule is a
   * sentence. The empty state is the onboarding: three ready-made rules, one
   * click each.
   */
  const store = configStore();
  const section = sectionOf("rules");
  const HUE = section.hue;

  const rules = $derived(store.rules.value ?? []);
  const pendingTotal = $derived(
    rules.reduce((sum, rule) => sum + rule.stats.pending, 0)
  );
  let waitingOnly = $state(false);
  // The filter's chip stands only while a rule waits: the last answer turns
  // the filter off with it, so the list never stands behind a chip that has
  // gone (the empty state's Remove the filter covers the frame between).
  $effect(() => {
    if (pendingTotal === 0) {
      waitingOnly = false;
    }
  });
  const shown = $derived(
    waitingOnly ? rules.filter((rule) => rule.stats.pending > 0) : rules
  );

  const acts = new RowActs<RuleRow>("/config/rules", {
    key: (row) => row.id,
    toggle: async (row, enabled) => {
      await saveRule(row.id, { ...draftOf(row), enabled });
      row.enabled = enabled;
    },
    remove: (row) => deleteRule(store, row),
  });

  const fired = (row: RuleRow) =>
    row.stats.totalFires === 0
      ? "Has not caught anything yet"
      : `Fired ${times(row.stats.totalFires)}, last ${since(row.stats.lastFiredAt)}`;
</script>

<SectionFrame
  problem={store.rules.error}
  purpose={section.purpose}
  ready={store.rules.value !== null}
  title={section.label}
>
  {#snippet actions(down)}
    <Button
      disabled={down !== null}
      href="/config/rules/new"
      title={down ?? undefined}
    >
      <IconPlus />
      <span>New rule</span>
    </Button>
  {/snippet}
  {#snippet toolbar()}
    {#if pendingTotal > 0}
      <!-- The filter chip (DESIGN.md, filter-chip-active): a pill, brand
           wash and brand ink while it filters, the control edge at rest;
           drawn as Find's filter chips are. -->
      <button
        aria-label="Show only rules waiting on an answer"
        aria-pressed={waitingOnly}
        class="select-none mark-line touch-hit pointer-hit inline-flex h-space-6 items-center gap-space-row rounded-pill border border-border-control bg-surface-raised px-space-3 type-label text-ink-muted transition-property-[background-color,color,border-color] aria-pressed:border-transparent aria-pressed:bg-brand-wash aria-pressed:text-brand-ink aria-pressed-false:hover:bg-surface-hover motion-safe:transition-property-[background-color,color,border-color,scale] motion-safe:active:scale-(--press-scale)"
        onclick={() => {
          waitingOnly = !waitingOnly;
        }}
        type="button"
      >
        <span>Waiting on an answer</span>
        <span data-slot="num" class="num">{pendingTotal}</span>
      </button>
    {/if}
  {/snippet}

  {#if rules.length === 0}
    <FleetStarters
      {acts}
      add={async (starter) => {
        const saved = await createRule(starter.draft);
        // Its new row, marked, is the result.
        store.rules.value = [withStats(saved), ...rules];
        store.mark(saved.id);
      }}
      icon={IconRules}
      kind="rules"
      label={rulesWords.starterRules}
      meta={(starter) => starter.blurb}
      {section}
      starters={RULE_TEMPLATES}
      title={rulesWords.nothingWatching}
    />
  {:else if shown.length === 0}
    <!-- The filter's empty, not the list's: the rules are there, none is
         waiting, and nothing should be made to wait. Its action lifts the
         filter on them. -->
    <EmptyState
      icon={section.icon}
      line={EMPTY_LINES.rulesNoneWaiting}
      title={rulesWords.noneWaiting}
    >
      {#snippet action()}
        <Button
          onclick={() => {
            waitingOnly = false;
          }}
          label="Remove the filter"
          variant="outline"
        />
      {/snippet}
    </EmptyState>
  {:else}
    <RowList label="Rules">
      {#each shown as row (row.id)}
        <SectionRow
          actions={[
            {
              label: rulesWords.deleteRule,
              icon: IconTrash,
              destructive: true,
              onselect: () => acts.remove(row),
            },
          ]}
          enabled={row.enabled}
          flash={store.flash === row.id}
          href="/config/rules/{row.id}"
          hue={HUE}
          icon={IconRules}
          meta="{fired(row)} · {ruleSentence(row)}"
          name={row.name}
          ontoggle={(next) => acts.toggle(row, next)}
          toggling={acts.busy[row.id] === true}
        >
          {#snippet badge()}
            {#if row.stats.pending > 0}
              <Badge data-slot="num" variant="attn"
                ><span>{row.stats.pending} waiting</span></Badge
              >
            {/if}
          {/snippet}
          {#snippet below()}
            <RowActFaults {acts} {row} />
          {/snippet}
        </SectionRow>
      {/each}
    </RowList>
  {/if}
</SectionFrame>
