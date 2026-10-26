<script lang="ts" module>
  import { z } from "zod";
  import { ParkedPopover } from "./parked-popover.svelte";

  /**
   * The popover's held state: open or not, what was typed, and the source
   * whose link it asked for. The link itself is the hub's (the snapshot's
   * `links`, then its row).
   */
  const parked = new ParkedPopover(
    "cawco:link-marketplace",
    z.object({
      open: z.boolean(),
      at: z.string(),
      name: z.string(),
      source: z.string(),
      asked: z.string().nullable(),
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
  const { draft } = parked;

  /** One press on a link's row: the popover again, on that link, beside the row. */
  export function reopenLink(source: string, row: HTMLElement | null): void {
    if (draft.value.asked !== source) {
      draft.value.source = source;
      draft.value.name = "";
      draft.value.refused = null;
      draft.value.asked = source;
    }
    parked.reopen(row);
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
  import Coded from "#lib/cawco/Coded.svelte";
  import { failureWords } from "#lib/cawco/hub-read.js";
  import { Input } from "#lib/components/ui/input/index.js";
  import { LiveDot } from "#lib/components/ui/live-dot/index.js";
  import * as Popover from "#lib/components/ui/popover/index.js";
  import { IconShop } from "#lib/icons.js";
  import { linkMarketplace, readMarketplaceName } from "../fleet";
  import Field from "./Field.svelte";
  import HubAskFoot from "./HubAskFoot.svelte";
  import { PopoverSeat, rowOf } from "./parked-popover.svelte";
  import WriteTrigger from "./WriteTrigger.svelte";

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
    /** Where it stands: the section's header ("head"), or an empty group's action, named by its group. */
    where?: string;
    /** The hub's answer to the ask: the link under way. */
    onlinked: (link: MarketplaceLink) => void;
  } = $props();

  const seat = new PopoverSeat(parked, () => where);
  const held = draft.value;

  let sending = $state(false);

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

  // Linked: the popover closes into the row it made. Put away meanwhile, it
  // lets go of the link, and the row says the rest.
  $effect(() => {
    const row = landed;
    if (!row || sending) {
      return;
    }
    if (seat.open) {
      seat.closeOnto(rowOf(row.name));
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
</script>

{#snippet callsItself()}
  <Coded text={words.callsItself(own ?? "")} />
{/snippet}

<Popover.Root bind:open={() => seat.open, seat.setOpen}>
  <WriteTrigger
    {down}
    icon={IconShop}
    label={words.linkMarketplace}
    size="sm"
    variant="outline"
  />
  <Popover.Content
    align="start"
    class="w-c-panel-w max-w-(--bits-popover-content-available-width)"
    customAnchor={parked.fromRow}
    gap="form"
    pad="form"
    bind:ref={seat.surface}
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
      <HubAskFoot
        {down}
        {failed}
        label={words.link}
        pending={busy}
        pendingLabel={words.linking}
        {ready}
      />
    </form>
  </Popover.Content>
</Popover.Root>
