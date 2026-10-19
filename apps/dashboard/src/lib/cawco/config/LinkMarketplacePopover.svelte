<script lang="ts">
  /**
   * Link a marketplace: every machine clones it, and nothing is installed
   * until a plugin is picked from it. It is linked under the name its own
   * marketplace.json gives, read by the hub as the source is typed: that is
   * the one name Claude Code registers it and installs its plugins by.
   */
  import { type FleetMarketplace, skillsWords as words } from "@cawco/core";
  import { tick } from "svelte";
  import Coded from "#lib/cawco/Coded.svelte";
  import { failureWords } from "#lib/cawco/hub-read.js";
  import { unfold } from "#lib/cawco/motion/fold.svelte.js";
  import { closeInto } from "#lib/cawco/motion/share.svelte.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { Input } from "#lib/components/ui/input/index.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte component-group convention
  import * as Popover from "#lib/components/ui/popover/index.js";
  import { IconShop } from "#lib/icons.js";
  import { linkMarketplace, readMarketplaceName } from "../fleet";
  import Field from "./Field.svelte";

  /** How long typing rests before the source is read. */
  const READ_AFTER_MS = 400;

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

  /** What the source's marketplace.json calls it, for the source it was read from. */
  let read = $state<{ source: string; name?: string; problem?: string } | null>(
    null
  );

  const wanted = $derived(source.trim());
  const own = $derived(read?.source === wanted ? read.name : undefined);
  const unread = $derived(read?.source === wanted ? read.problem : undefined);
  const reading = $derived(wanted !== "" && read?.source !== wanted);
  const differs = $derived(
    own !== undefined && name.trim() !== "" && name.trim() !== own
  );
  const clash = $derived(own !== undefined && taken.includes(own));
  const ready = $derived(own !== undefined && !clash);

  $effect(() => {
    const at = wanted;
    if (at === "") {
      read = null;
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const found = await readMarketplaceName(at);
        if (wanted !== at) {
          return;
        }
        read = { source: at, name: found };
        if (name.trim() === "") {
          name = found;
        }
      } catch (error) {
        if (wanted === at) {
          read = {
            source: at,
            problem: failureWords(error),
          };
        }
      }
    }, READ_AFTER_MS);
    return () => clearTimeout(timer);
  });

  function reset() {
    name = "";
    source = "";
    read = null;
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
      const row = await linkMarketplace(wanted);
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
      failed = failureWords(error);
    } finally {
      busy = false;
    }
  }
</script>

{#snippet callsItself()}
  <Coded text={words.callsItself(own ?? "")} />
{/snippet}

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
        <span>{words.linkMarketplace}</span>
      </Button>
    {/snippet}
  </Popover.Trigger>
  <Popover.Content
    align="start"
    class="w-(--pop-w) max-w-(--pop-max)"
    gap="form"
    pad="form"
    style="--pop-w: 380px; --pop-max: calc(100vw - 2rem)"
    bind:ref={surface}
  >
    <form class="form" onsubmit={link}>
      <Field id="market-source" label={words.source} problem={unread}>
        {#snippet hint()}
          <Coded text={words.marketSourceHint} />
        {/snippet}
        <Input
          autocomplete="off"
          face="mono"
          id="market-source"
          placeholder={words.marketSourcePlaceholder}
          spellcheck="false"
          bind:value={source}
        />
      </Field>
      <Field
        id="market-name"
        label={words.name}
        problem={clash ? words.alreadyLinked(own ?? "") : undefined}
        warn={differs ? callsItself : undefined}
      >
        {#snippet hint()}
          {#if reading}
            {words.readingManifest}
          {:else}
            <Coded text={words.installsAs(own ?? "name")} />
          {/if}
        {/snippet}
        <Input
          aria-invalid={clash ? "true" : undefined}
          autocomplete="off"
          face="mono"
          id="market-name"
          placeholder={words.marketNamePlaceholder}
          spellcheck="false"
          bind:value={name}
        />
      </Field>
      {#if failed}
        <p
          class="type-meta text-status-fail-ink"
          role="alert"
          transition:unfold
        >
          {failed}
        </p>
      {/if}
      <Button
        class="self-end"
        disabled={down !== null || !ready}
        failed={failed !== undefined}
        label={words.link}
        pending={busy}
        pendingLabel={words.linking}
        title={down ?? undefined}
        type="submit"
      />
    </form>
  </Popover.Content>
</Popover.Root>
