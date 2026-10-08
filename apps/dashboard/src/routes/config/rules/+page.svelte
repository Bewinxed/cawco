<script lang="ts">
  import { type RuleRow, ruleSentence } from "@cawco/core";
  import RowList from "#lib/cawco/config/RowList.svelte";
  import SectionFrame from "#lib/cawco/config/SectionFrame.svelte";
  import SectionRow from "#lib/cawco/config/SectionRow.svelte";
  import { sectionOf } from "#lib/cawco/config/sections.js";
  import { configStore, withStats } from "#lib/cawco/config/store.svelte.js";
  import { confirm } from "#lib/cawco/confirm.svelte.js";
  import {
    createRule,
    draftOf,
    message,
    RULE_TEMPLATES,
    removeRule,
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
  /** The template whose last add failed: its button shows no check. */
  let seedFailed = $state<string | null>(null);

  const fired = (row: RuleRow) =>
    row.stats.totalFires === 0
      ? "Has not caught anything yet"
      : `Fired ${times(row.stats.totalFires)}, last ${since(row.stats.lastFiredAt)}`;

  async function toggle(row: RuleRow, enabled: boolean) {
    busy[row.id] = true;
    try {
      await saveRule(row.id, { ...draftOf(row), enabled });
      row.enabled = enabled;
    } catch (error) {
      toast.error(message(error));
    } finally {
      delete busy[row.id];
    }
  }

  async function askRemove(row: RuleRow) {
    await confirm({
      title: `Delete ${row.name}?`,
      body: "This rule stops applying to every session and is removed for good. You can always write it again, but there's no undo.",
      confirmLabel: "Delete rule",
      destructive: true,
      pendingLabel: "Deleting…",
      run: async () => {
        busy[row.id] = true;
        try {
          await removeRule(row.id, row.name);
          store.rules.value = rules.filter((other) => other.id !== row.id);
        } finally {
          delete busy[row.id];
        }
      },
    });
  }

  async function useTemplate(template: (typeof RULE_TEMPLATES)[number]) {
    seeding = template.title;
    seedFailed = null;
    try {
      const saved = await createRule(template.draft);
      store.rules.value = [withStats(saved), ...rules];
      store.mark(saved.id);
      toast.success(`${template.title} is live on every session.`);
    } catch (error) {
      seedFailed = template.title;
      toast.error(message(error));
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
  {#snippet actions(
    down
  )}
    <Button
      disabled={down !== null}
      href="/config/rules/new"
      title={down ?? undefined}
    >
      <IconPlus />
      New rule
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
        Waiting on an answer ({pendingTotal})
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
              failed={seedFailed === template.title}
              label="Add"
              onclick={() => useTemplate(template)}
              pending={seeding === template.title}
              pendingLabel="Adding…"
              size="sm"
              variant="outline"
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
              onselect: () => askRemove(row),
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
              <span class="waiting num">{row.stats.pending} waiting</span>
            {/if}
          {/snippet}
        </SectionRow>
      {/each}
    </RowList>
  {/if}
</SectionFrame>

<style>
  .waiting {
    flex: none;
    padding: 1px 6px;
    border-radius: var(--radius-xs);
    background: var(--status-attn-bg);
    font: var(--type-label);
    color: var(--status-attn-ink);
  }
</style>
