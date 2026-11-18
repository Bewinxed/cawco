<script lang="ts">
  /**
   * Who decides, read at a value's weight (the owner: "such an important
   * part of this project is shown as a very minor subtitle"): the standing
   * as a value (follows the fleet, its own on N of 6 kinds, or its rule
   * file did not read and every choice comes to you), then each kind with
   * who settles it, as sunk chips (DESIGN.md: "A setting that cannot change
   * where it is shown is the same chip, sunk"), the project's own marked.
   * Review before done is its switch here ("Yes, one place"). Changing who
   * settles a kind is the full rule's page, one step away.
   */
  import { type DecidesTable, KIND_SEED } from "@cawco/core/decides";
  import { decidesWords } from "@cawco/core/words/decides";
  import { kindGlyph } from "#lib/cawco/decides/kind-glyph.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { chipVariants } from "#lib/components/ui/chip/index.js";
  import { Switch } from "#lib/components/ui/switch/index.js";
  import { IconArrowUpRight } from "#lib/icons.js";
  import BandGroup from "./BandGroup.svelte";
  import { bandWords } from "./words";

  let {
    decides,
    review,
    ruleHref,
    onreview,
  }: {
    decides: DecidesTable;
    /** Review before done, as the hub holds it. */
    review: boolean;
    /** The project's full rule (`/project/<id>/decides`). */
    ruleHref: string;
    onreview: (on: boolean) => void;
  } = $props();

  const words = bandWords.decides;
  const MEMBERS: Record<string, string> = {
    you: decidesWords.you.name,
    caw: decidesWords.caw.name,
    advisor: decidesWords.advisor.name,
    practice: decidesWords.practice.name,
    asker: decidesWords.asker.name,
  };
  const unread = $derived(decides.problems.length > 0);
  const own = $derived(
    KIND_SEED.filter((kind) => decides.from[kind.id] === "project").length
  );
  const standing = $derived.by(() => {
    if (unread) {
      return words.unread;
    }
    return own === 0 ? words.follows : words.own(own, KIND_SEED.length);
  });
  const kinds = $derived(
    KIND_SEED.map((kind) => ({
      id: kind.id,
      name: words.kinds.get(kind.id) ?? kind.name,
      who: unread
        ? decidesWords.you.name
        : (MEMBERS[decides.routes[kind.id] ?? "you"] ??
          decides.routes[kind.id]),
      own: !unread && decides.from[kind.id] === "project",
    }))
  );
  const uid = $props.id();
</script>

<BandGroup title={words.title}>
  {#snippet trailing()}
    <Button class="-my-space-1" href={ruleHref} size="xs" variant="ghost">
      <span>{words.open}</span>
      <IconArrowUpRight aria-hidden="true" data-icon="inline-end" />
    </Button>
  {/snippet}
  <p class="m-0 type-row text-ink-strong">{standing}</p>
  <ul class="m-0 flex list-none flex-wrap gap-space-2 p-0">
    {#each kinds as kind (kind.id)}
      {@const Glyph = kindGlyph(kind.id)}
      <li
        class={chipVariants({ variant: "setting" })}
        data-kind={kind.id}
        data-variant="static"
      >
        <Glyph aria-hidden="true" class="text-ink-subtle" />
        <span class="text-ink-muted">{kind.name}</span>
        <span>{kind.who}</span>
        {#if kind.own}
          <span class="type-meta text-ink-subtle">{words.ownKind}</span>
        {/if}
      </li>
    {/each}
  </ul>
  <div class="flex items-start gap-space-3 pt-space-1">
    <Switch
      align="first-line"
      aria-describedby="{uid}-review-note"
      aria-labelledby="{uid}-review"
      checked={review}
      id="{uid}-switch"
      onCheckedChange={onreview}
    />
    <span class="flex min-w-0 flex-1 flex-col">
      <label
        class="type-label text-ink-strong"
        for="{uid}-switch"
        id="{uid}-review">{words.review}</label
      >
      <span class="type-meta text-ink-muted" id="{uid}-review-note"
        >{words.reviewNote}</span
      >
    </span>
  </div>
</BandGroup>
