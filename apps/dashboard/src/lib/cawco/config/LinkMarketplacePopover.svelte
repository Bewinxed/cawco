<script lang="ts" module>
  import { z } from "zod";
  import { TabDraft } from "../tab-draft.svelte";

  /**
   * Where the popover was opened from: the section's header ("head"), or an
   * empty group's action, named by its group.
   */
  type Where = string;

  /**
   * The popover's held state (DESIGN.md, The Work Outlives Its Surface
   * Rule): open or not, what was typed, and the source whose link it asked
   * for. The link itself is the hub's (the snapshot's `links`, then its row).
   */
  const draft = new TabDraft(
    "cawco:link-marketplace",
    z.object({
      open: z.boolean(),
      at: z.string(),
      name: z.string(),
      source: z.string(),
      /** The source this popover asked the hub to link, until it lands. */
      asked: z.string().nullable(),
      /** Why the hub refused the ask itself. */
      refused: z.string().nullable(),
    }),
    () => ({
      open: false,
      at: "head",
      name: "",
      source: "",
      asked: null,
      refused: null,
    })
  );

  /** The popovers mounted on the page, by where: one put away opens in the header's when its own is gone. */
  const mounted = $state<Record<Where, number>>({});
  /** The pending row it is reopened from, which it opens beside and closes into. */
  let fromRow = $state<HTMLElement | null>(null);

  /** One press on a link's row: the popover again, on that link, beside the row. */
  export function reopenLink(source: string, row: HTMLElement | null): void {
    if (draft.value.asked !== source) {
      draft.value.source = source;
      draft.value.name = "";
      draft.value.refused = null;
      draft.value.asked = source;
    }
    fromRow = row;
    draft.value.open = true;
  }
</script>

<script lang="ts">
  /**
   * Link a marketplace: every machine clones it, and nothing is installed
   * until a plugin is picked from it. It is linked under the name its own
   * marketplace.json gives, read by the hub as the source is typed: that is
   * the one name Claude Code registers it and installs its plugins by.
   *
   * The link belongs to the hub, which holds it (under way, or refused) in
   * the marketplace list until it lands: ×, Esc or a press outside put the
   * popover away into that row, which carries Open link back here, and a
   * reload opens it again as it was (`draft`).
   */
  import {
    type FleetMarketplace,
    type MarketplaceLink,
    skillsWords as words,
  } from "@cawco/core";
  import { onMount } from "svelte";
  import Coded from "#lib/cawco/Coded.svelte";
  import { failureWords } from "#lib/cawco/hub-read.js";
  import { unfold } from "#lib/cawco/motion/fold.svelte.js";
  import { closeInto } from "#lib/cawco/motion/share.svelte.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { Input } from "#lib/components/ui/input/index.js";
  import { LiveDot } from "#lib/components/ui/live-dot/index.js";
  import * as Popover from "#lib/components/ui/popover/index.js";
  import { IconShop } from "#lib/icons.js";
  import { linkMarketplace, readMarketplaceName } from "../fleet";
  import Field from "./Field.svelte";

  /** How long typing rests before the source is read. */
  const READ_AFTER_MS = 400;

  let {
    marketplaces,
    links,
    down,
    where = "head",
    onlinked,
  }: {
    /** The linked rows (null until read): the one this link lands as. */
    marketplaces: FleetMarketplace[] | null;
    /** The links with no row yet, as the hub holds them (null until read). */
    links: MarketplaceLink[] | null;
    /** Why the hub cannot take a write, or null: the trigger and the submit
        are disabled on it and say it as their title. */
    down: string | null;
    where?: Where;
    /** The hub's answer to the ask: the link under way. */
    onlinked: (link: MarketplaceLink) => void;
  } = $props();

  onMount(() => {
    mounted[where] = (mounted[where] ?? 0) + 1;
    return () => {
      mounted[where] = (mounted[where] ?? 1) - 1;
    };
  });

  const held = draft.value;
  const open = $derived(
    held.open &&
      (held.at === where || (where === "head" && (mounted[held.at] ?? 0) === 0))
  );

  let sending = $state(false);
  let surface = $state<HTMLElement | null>(null);

  /** What the source's marketplace.json calls it, for the source it was read from. */
  let read = $state<{ source: string; name?: string; problem?: string } | null>(
    null
  );

  const taken = $derived((marketplaces ?? []).map((row) => row.name));
  const wanted = $derived(held.source.trim());
  const own = $derived(read?.source === wanted ? read.name : undefined);
  const unread = $derived(read?.source === wanted ? read.problem : undefined);
  const reading = $derived(wanted !== "" && read?.source !== wanted);
  const differs = $derived(
    own !== undefined && held.name.trim() !== "" && held.name.trim() !== own
  );
  const clash = $derived(own !== undefined && taken.includes(own));
  const ready = $derived(own !== undefined && !clash);

  /** The hub's word on the link this popover asked for. */
  const pending = $derived(
    held.asked === null
      ? undefined
      : links?.find((one) => one.source === held.asked)
  );
  const landed = $derived(
    held.asked === null || pending
      ? undefined
      : marketplaces?.find((row) => row.source === held.asked)
  );
  const busy = $derived(sending || pending?.fetching === true);
  const failed = $derived(
    held.refused ??
      (pending?.error ? words.linkRefused(pending.source, pending.error) : null)
  );

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
        if (held.name.trim() === "") {
          held.name = found;
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

  const rowOf = (key: string) =>
    document.querySelector<HTMLElement>(`[data-row-name="${CSS.escape(key)}"]`);

  /** The closed surface's flight into its row, while bits-ui still draws it. */
  let flight: Animation | undefined;

  /**
   * Closes at once, and the surface travels into `row` as it goes (The One
   * Object Rule): bits-ui keeps a closed surface drawn until its animations
   * end, the flight among them. The close never waits on the flight, so a
   * reload or a press made during it finds the popover already shut.
   */
  function closeOnto(row: HTMLElement | null) {
    flight?.cancel();
    flight = surface && row ? closeInto(surface, row) : undefined;
    held.open = false;
    fromRow = null;
  }

  // Opened again while its flight still runs (its trigger, or the row's
  // Open): it turns back, whole, before it is drawn.
  $effect.pre(() => {
    if (open) {
      flight?.cancel();
      flight = undefined;
    }
  });

  // Linked: the popover closes into the row it made. Put away meanwhile, it
  // lets go of the link, and the row says the rest.
  $effect(() => {
    const row = landed;
    if (!row || sending) {
      return;
    }
    if (open) {
      closeOnto(rowOf(row.name));
    }
    draft.clear();
  });

  // A reload finds no link and no row (let go meanwhile): nothing is followed.
  $effect(() => {
    if (
      held.asked !== null &&
      !sending &&
      links !== null &&
      marketplaces !== null &&
      !pending &&
      !landed
    ) {
      held.asked = null;
    }
  });

  async function link(event: SubmitEvent) {
    event.preventDefault();
    if (!ready || busy) {
      return;
    }
    sending = true;
    held.refused = null;
    try {
      const answer = await linkMarketplace(wanted);
      held.asked = answer.source;
      onlinked(answer);
    } catch (error) {
      held.refused = failureWords(error);
    } finally {
      sending = false;
    }
  }

  /** ×, Esc or a press outside: the popover goes, the link stays, on its row. */
  function setOpen(next: boolean) {
    if (next) {
      held.at = where;
      held.open = true;
      return;
    }
    closeOnto(held.asked === null ? null : rowOf(held.asked));
  }
</script>

{#snippet callsItself()}
  <Coded text={words.callsItself(own ?? "")} />
{/snippet}

<Popover.Root bind:open={() => open, setOpen}>
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
    class="w-c-panel-w max-w-(--bits-popover-content-available-width)"
    customAnchor={fromRow}
    gap="form"
    pad="form"
    bind:ref={surface}
  >
    <form
      data-link-marketplace
      class="flex flex-col gap-space-3"
      onsubmit={link}
    >
      <Field id="market-source" label={words.source} problem={unread}>
        {#snippet hint()}
          <Coded text={words.marketSourceHint} />
        {/snippet}
        <Input
          autocomplete="off"
          id="market-source"
          placeholder={words.marketSourcePlaceholder}
          spellcheck="false"
          bind:value={held.source}
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
            <span class="mark-line inline-flex items-center gap-space-2"
              ><LiveDot /><span>{words.readingManifest}</span></span
            >
          {:else}
            <Coded text={words.installsAs(own ?? "name")} />
          {/if}
        {/snippet}
        <Input
          aria-invalid={clash ? "true" : undefined}
          autocomplete="off"
          id="market-name"
          placeholder={words.marketNamePlaceholder}
          spellcheck="false"
          bind:value={held.name}
        />
      </Field>
      {#if failed}
        <p
          data-slot="refused"
          class="type-meta wrap-anywhere text-status-fail-ink"
          role="alert"
          transition:unfold
        >
          {failed}
        </p>
      {/if}
      <Button
        class="self-end"
        disabled={down !== null || !ready}
        failed={failed !== null}
        label={words.link}
        pending={busy}
        pendingLabel={words.linking}
        title={down ?? undefined}
        type="submit"
      />
    </form>
  </Popover.Content>
</Popover.Root>
