<script lang="ts">
  /**
   * Link a marketplace: every machine clones it, and nothing is installed
   * until a plugin is picked from it.
   */
  import type { FleetMarketplace } from "@whiffle/core";
  import { tick } from "svelte";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte component-group convention
  import * as Popover from "$lib/components/ui/popover";
  import { IconShop } from "$lib/icons";
  import { unfold } from "$lib/whiffle/motion/fold.svelte";
  import { closeInto } from "$lib/whiffle/motion/share.svelte";
  import { saveMarketplace } from "../fleet";
  import Field from "./Field.svelte";

  let {
    taken,
    down,
    onsaved,
  }: {
    taken: string[];
    /** Why the hub cannot take a write, or null: the trigger and the submit
        are disabled on it and say it as their title. */
    down: string | null;
    onsaved: (row: FleetMarketplace) => void;
  } = $props();

  let expanded = $state(false);
  let name = $state("");
  let source = $state("");
  let busy = $state(false);
  let failed = $state<string | undefined>(undefined);
  let surface = $state<HTMLElement | null>(null);

  const clash = $derived(taken.includes(name.trim()));
  const ready = $derived(name.trim() !== "" && source.trim() !== "" && !clash);

  function reset() {
    name = "";
    source = "";
    failed = undefined;
  }

  async function link(event: SubmitEvent) {
    event.preventDefault();
    if (!ready || busy) {
      return;
    }
    busy = true;
    failed = undefined;
    try {
      const row = await saveMarketplace(name.trim(), source.trim());
      onsaved(row);
      // The form closes into the row it made.
      await tick();
      const made = document.querySelector<HTMLElement>(
        `[data-row-name="${CSS.escape(row.name)}"]`
      );
      const closing = surface && made ? closeInto(surface, made) : undefined;
      await closing?.finished.catch(() => undefined);
      expanded = false;
      reset();
    } catch (error) {
      failed = error instanceof Error ? error.message : String(error);
    } finally {
      busy = false;
    }
  }
</script>

<Popover.Root
  onOpenChange={(next) => {
    if (!next) {
      reset();
    }
  }}
  bind:open={expanded}
>
  <Popover.Trigger disabled={down !== null}>
    {#snippet child({ props })}
      <Button
        {...props}
        disabled={down !== null}
        size="sm"
        title={down ?? undefined}
        variant="outline"
      >
        <IconShop />
        Link marketplace
      </Button>
    {/snippet}
  </Popover.Trigger>
  <Popover.Content
    align="start"
    class="w-[380px] max-w-[calc(100vw-2rem)] gap-3 p-3"
    bind:ref={surface}
  >
    <form class="form" onsubmit={link}>
      <Field id="market-source" label="Source">
        {#snippet hint()}
          A GitHub <span class="font-mono">owner/repo</span>, a git URL, or a
          URL that ends in <span class="font-mono">marketplace.json</span>.
          Anthropic publishes <span class="font-mono">anthropics/skills</span>
          and <span class="font-mono">anthropics/claude-plugins-official</span>.
        {/snippet}
        <Input
          autocomplete="off"
          class="font-mono"
          id="market-source"
          placeholder="anthropics/skills"
          spellcheck="false"
          bind:value={source}
        />
      </Field>
      <Field
        id="market-name"
        label="Name"
        problem={clash ? `"${name.trim()}" is already linked.` : undefined}
      >
        {#snippet hint()}
          What its plugins are installed as —
          <span class="font-mono">plugin@{name.trim() || 'name'}</span>.
        {/snippet}
        <Input
          aria-invalid={clash ? 'true' : undefined}
          autocomplete="off"
          class="font-mono"
          id="market-name"
          placeholder="skills"
          spellcheck="false"
          bind:value={name}
        />
      </Field>
      {#if failed}
        <p class="problem" role="alert" transition:unfold>{failed}</p>
      {/if}
      <Button
        class="self-end"
        disabled={down !== null || !ready}
        failed={failed !== undefined}
        label="Link"
        pending={busy}
        pendingLabel="Linking…"
        title={down ?? undefined}
        type="submit"
      />
    </form>
  </Popover.Content>
</Popover.Root>

<style>
  .form {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .problem {
    font: var(--type-meta);
    color: var(--status-fail-ink);
  }
</style>
