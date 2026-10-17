<script lang="ts">
  import { type RuleRow, ruleSentence } from "@cawco/core";
  import AskHere from "#lib/cawco/AskHere.svelte";
  import { Asker, type AskHereRequest } from "#lib/cawco/ask-here.svelte.js";
  import RowList from "#lib/cawco/config/RowList.svelte";
  import { deleteRule } from "#lib/cawco/config/rule-delete.js";
  import SectionFrame from "#lib/cawco/config/SectionFrame.svelte";
  import SectionRow from "#lib/cawco/config/SectionRow.svelte";
  import { sectionOf } from "#lib/cawco/config/sections.js";
  import { configStore, withStats } from "#lib/cawco/config/store.svelte.js";
  import { failureWords as message } from "#lib/cawco/hub-read.js";
  import RowFault from "#lib/cawco/RowFault.svelte";
  import {
    createRule,
    draftOf,
    RULE_TEMPLATES,
    saveRule,
    since,
    times,
  } from "#lib/cawco/rules.js";
  import { toast } from "#lib/cawco/toasts.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { EmptyState } from "#lib/components/ui/empty/index.js";
  import { Toggle } from "#lib/components/ui/toggle/index.js";
  import { IconAlert, IconPlus, IconRules, IconTrash } from "#lib/icons.js";

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
  const shown = $derived(
    waitingOnly ? rules.filter((rule) => rule.stats.pending > 0) : rules
  );

  let busy = $state<Record<string, boolean>>({});
  let seeding = $state<string | null>(null);
  /** The template whose last add was refused, and why: said under its row. */
  let seedFailed = $state<{ title: string; reason: string } | null>(null);
  /** Why a rule's switch did not take, by rule: said under its row. */
  let toggleFailed = $state<Record<string, string>>({});

  const fired = (row: RuleRow) =>
    row.stats.totalFires === 0
      ? "Has not caught anything yet"
      : `Fired ${times(row.stats.totalFires)}, last ${since(row.stats.lastFiredAt)}`;

  async function toggle(row: RuleRow, enabled: boolean) {
    busy[row.id] = true;
    delete toggleFailed[row.id];
    try {
      await saveRule(row.id, { ...draftOf(row), enabled });
      row.enabled = enabled;
    } catch (error) {
      toggleFailed[row.id] = message(error);
    } finally {
      delete busy[row.id];
    }
  }

  const asks = new Asker<AskHereRequest>();
  /** Delete: at once, with Undo in the toast (rule-delete.ts). */
  async function remove(row: RuleRow) {
    busy[row.id] = true;
    try {
      await deleteRule(store, row);
    } catch (error) {
      toast.error(message(error));
    } finally {
      delete busy[row.id];
    }
  }

  async function useTemplate(template: (typeof RULE_TEMPLATES)[number]) {
    seeding = template.title;
    seedFailed = null;
    try {
      const saved = await createRule(template.draft);
      // Its new row, marked, is the result.
      store.rules.value = [withStats(saved), ...rules];
      store.mark(saved.id);
    } catch (error) {
      seedFailed = { title: template.title, reason: message(error) };
    } finally {
      seeding = null;
    }
  }
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
      <Toggle
        aria-label="Show only rules waiting on an answer"
        size="sm"
        variant="outline"
        bind:pressed={waitingOnly}
      >
        <IconAlert />
        <span>Waiting on an answer ({pendingTotal})</span>
      </Toggle>
    {/if}
  {/snippet}

  {#if rules.length === 0}
    <EmptyState
      icon={section.icon}
      line="Start from one of these — they are ordinary rules once added, and you can change every part of them."
      title="Nothing is watching yet"
    />
    <RowList label="Starter rules">
      {#each RULE_TEMPLATES as template (template.title)}
        <SectionRow
          hue={HUE}
          icon={IconRules}
          meta={template.blurb}
          name={template.title}
        >
          {#snippet trailing()}
            <Button
              disabled={seeding !== null && seeding !== template.title}
              failed={seedFailed?.title === template.title}
              label="Add"
              onclick={() => useTemplate(template)}
              pending={seeding === template.title}
              pendingLabel="Adding…"
              size="sm"
              variant="outline"
            />
          {/snippet}
          {#snippet below()}
            <RowFault
              again={() => useTemplate(template)}
              reason={seedFailed?.title === template.title
                ? seedFailed.reason
                : null}
            />
          {/snippet}
        </SectionRow>
      {/each}
    </RowList>
    <div>
      <Button href="/config/rules/new" variant="outline">
        Or write one from scratch
      </Button>
    </div>
  {:else if shown.length === 0}
    <EmptyState
      icon={section.icon}
      line="Every session that was told something has answered for it."
      title="No rule is waiting on an answer"
    />
  {:else}
    <RowList label="Rules">
      {#each shown as row (row.id)}
        <SectionRow
          actions={[
            {
              label: "Delete rule",
              icon: IconTrash,
              destructive: true,
              onselect: () => remove(row),
            },
          ]}
          enabled={row.enabled}
          flash={store.flash === row.id}
          href="/config/rules/{row.id}"
          hue={HUE}
          icon={IconRules}
          meta="{fired(row)} · {ruleSentence(row)}"
          name={row.name}
          ontoggle={(next) => toggle(row, next)}
          toggling={busy[row.id] === true}
        >
          {#snippet badge()}
            {#if row.stats.pending > 0}
              <!-- literal: 1px 6px -->
              <span
                data-slot="num"
                class="num type-label flex-none rounded-xs bg-status-attn-bg px-(--waiting-pad-x) py-(--waiting-pad-y) text-status-attn-ink"
                style:--waiting-pad-x="6px"
                style:--waiting-pad-y="1px"
                >{row.stats.pending} waiting</span
              >
            {/if}
          {/snippet}
          {#snippet below()}
            <AskHere asker={asks} at={row.id} />
            <RowFault
              again={() => toggle(row, !row.enabled)}
              reason={toggleFailed[row.id]}
            />
          {/snippet}
        </SectionRow>
      {/each}
    </RowList>
  {/if}
</SectionFrame>
