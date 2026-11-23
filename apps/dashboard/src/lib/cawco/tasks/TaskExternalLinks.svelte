<script lang="ts" module>
  /** Carried comments drawn under an item before "N more" folds the rest: its newest. */
  export const COMMENTS_SHOWN = 2;
</script>

<script lang="ts">
  /**
   * The outside items a task links (core external-items.ts), in its pane:
   * one list on one column grid whose groups, rows and lines are subgrids of
   * it, so the state glyph, the title, the author, the age and the link-out
   * each hold one width from the first row to the last.
   *
   * An item is two lines: its title in the row role, wrapping to two lines
   * and clamped; then the source's own word for its state, the source's
   * mark, its ref and where it lives. Its state is also the glyph in the
   * leading column. The record (the tracker sync's issue) comes first under
   * Main record, then Closes, Refers to and Related, each group headed once
   * with its count; a single link has no head. The row is the link out.
   *
   * A comment carried from the source stands under the item it was written
   * on, indented to the title's edge, newest first: the newest
   * {@link COMMENTS_SHOWN}, then "N more" opens the rest in place.
   *
   * A link whose last read stopped short keeps its row: the failed glyph,
   * what we last knew of its title, the source's words verbatim and Retry.
   * One not read yet keeps the row's height: a bar where its title goes.
   * The record whose tracker sync is held (its baseline does not read,
   * `baselineUnread`) says so in one line under its title, in the
   * needs-you ink: the sync waits on the task and its issue matching.
   *
   * Its rows and heads stand `space-2` in from its own edges, the inset a
   * row's hover fills: a host lines its words up with its column by
   * setting it that far out (TaskPane).
   */
  import type { ExternalRef, LinkMode } from "@cawco/core/external-items";
  import { externalItemWords as words } from "@cawco/core/words/external-items";
  import { linkOfUrl } from "@cawco/providers/registry";
  import MessageBody from "#lib/cawco/MessageBody.svelte";
  import type { TaskComment } from "#lib/cawco/project-tasks.js";
  import ProviderLogo from "#lib/components/features/ProviderLogo.svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import { sectionHeadVariants } from "#lib/components/ui/section-header/index.js";
  import { Skeleton } from "#lib/components/ui/skeleton/index.js";
  import { IconArrowUpRight, IconRefresh } from "#lib/icons.js";
  import { failureWords } from "#lib/platform/hub-read.js";
  import { formatAgeShort, formatTimestamp } from "#lib/utils/time.js";
  import { cn } from "#lib/utils.js";
  import LinkStateGlyph, { type LinkGlyph } from "./LinkStateGlyph.svelte";

  let {
    links,
    comments,
    onretry,
  }: {
    /** Its links, the record first. */
    links: ExternalRef[];
    /** The task's comments: those carried from a source (`via`) stand under the item they were written on. */
    comments: TaskComment[];
    /** Reads a failed link again from its source; throws the hub's refusal. */
    onretry: (link: ExternalRef) => Promise<void>;
  } = $props();

  const uid = $props.id();

  /** The groups in their order; a group with nothing in it is not drawn. */
  const ORDER: readonly LinkMode[] = ["record", "closes", "refs", "related"];
  const groups = $derived(
    ORDER.map((mode) => ({
      mode,
      links: links.filter((link) => link.mode === mode),
    })).filter((group) => group.links.length > 0)
  );
  const headed = $derived(links.length > 1);

  /** An item by its URL as its source names it, so a comment's anchor and a link's casing never part them. */
  const itemOf = (url: string): string =>
    (linkOfUrl(url)?.url ?? url).toLowerCase();

  /** Each item's carried comments, newest first. */
  const carried = $derived.by(() => {
    const by = new Map<string, TaskComment[]>();
    for (const comment of comments) {
      if (comment.via) {
        const key = itemOf(comment.via.url);
        by.set(key, [...(by.get(key) ?? []), comment]);
      }
    }
    for (const list of by.values()) {
      list.sort((a, b) => b.at - a.at);
    }
    return by;
  });

  /** Items whose every comment stands open. */
  let unfolded = $state<Record<string, boolean>>({});
  /** A Retry running, and what its last try threw, by the link's URL. */
  let retrying = $state<Record<string, boolean>>({});
  let thrown = $state<Record<string, string>>({});

  async function retry(link: ExternalRef): Promise<void> {
    if (retrying[link.url]) {
      return;
    }
    retrying[link.url] = true;
    delete thrown[link.url];
    try {
      await onretry(link);
    } catch (error) {
      thrown[link.url] = failureWords(error);
    } finally {
      retrying[link.url] = false;
    }
  }

  const glyphOf = (link: ExternalRef): LinkGlyph =>
    link.problem ? "failed" : (link.state ?? "pending");

  /** Its state in a word: the source's own, else ours, else why it has none. */
  const stateWord = (link: ExternalRef): string => {
    if (link.problem) {
      return words.readFailed;
    }
    return (
      link.stateName || (link.state ? words.state[link.state] : words.unread)
    );
  };

  /** Where it lives: `owner/repo`, the Linear workspace. */
  const placeOf = (link: ExternalRef): string =>
    linkOfUrl(link.url)?.container ?? "";

  const nameOf = (link: ExternalRef): string =>
    words.linkName(
      link.ref,
      link.title,
      stateWord(link),
      words.kind[link.kind],
      words.source[link.source]
    );

  const whoOf = (comment: TaskComment): string =>
    comment.via?.author.name ??
    comment.via?.author.login ??
    comment.author.name;

  /** The column tracks: glyph, title, then (from 34rem) the author, then the age and the link-out. */
  const COLS = "auto minmax(0, 1fr) auto auto";
  const COLS_WIDE = "auto minmax(0, 1fr) auto auto auto";
</script>

{#snippet age(at: number | null)}
  {#if at !== null}
    <time
      class="type-label font-normal num whitespace-nowrap text-tx-2"
      datetime={new Date(at).toISOString()}
      title={formatTimestamp(new Date(at))}>{formatAgeShort(at)}</time
    >
  {/if}
{/snippet}

{#snippet comment(each: TaskComment, link: ExternalRef)}
  {@const via = each.via}
  {#if via}
    {@const who = whoOf(each)}
    <li
      data-slot="link-comment"
      class="flex max-w-measure min-w-0 flex-col gap-space-2 rounded-sm bg-bg-2 px-space-3 py-space-2"
    >
      <div
        data-slot="comment-text"
        class="min-w-0 type-body wrap-anywhere text-tx"
      >
        <MessageBody source={each.text} />
      </div>
      <a
        aria-label={words.commentName(
          who,
          link.ref,
          formatTimestamp(new Date(each.at)),
          words.source[via.source]
        )}
        class="mark-line flex max-w-full flex-wrap items-center gap-x-space-2 gap-y-space-1 self-start rounded-xs type-label font-normal text-tx-2 no-underline hover:text-tx focus-inset"
        data-slot="comment-cite"
        href={via.url}
        rel="noreferrer"
        target="_blank"
      >
        <ProviderLogo class="flex-none" provider={via.source} />
        {#if via.author.avatarUrl}
          <img
            alt=""
            class="size-icon-lg flex-none rounded-pill"
            src={via.author.avatarUrl}
          />
        {/if}
        <span class="font-medium">{who}</span>
        <span
          class="num whitespace-nowrap"
          title={formatTimestamp(new Date(each.at))}
          >{formatAgeShort(each.at)}</span
        >
        {#if via.editedAt}
          <span class="text-tx-2">{words.edited}</span>
        {/if}
        <IconArrowUpRight
          aria-hidden="true"
          class="size-icon-md flex-none text-tx-2"
        />
      </a>
    </li>
  {/if}
{/snippet}

{#snippet row(link: ExternalRef)}
  {@const glyph = glyphOf(link)}
  {@const said = stateWord(link)}
  {@const place = placeOf(link)}
  {@const all = carried.get(itemOf(link.url)) ?? []}
  {@const open = unfolded[link.url] ?? false}
  {@const shown = open ? all : all.slice(0, COMMENTS_SHOWN)}
  {@const sentence = thrown[link.url] ?? link.problem}
  {@const commentsId = `${uid}-${link.number ?? link.ref}-comments`}
  <li
    data-slot="link"
    class="col-span-full grid grid-cols-subgrid"
    data-failed={link.problem ? "" : undefined}
    data-mode={link.mode}
    data-source={link.source}
  >
    <!-- mark-line: the glyph, age and link-out stand in cells one title line tall, on the title's first line, beside words that wrap -->
    <div
      class="group/row relative isolate col-span-full grid grid-cols-subgrid items-start gap-y-space-1 px-space-2 py-space-2 before:absolute before:inset-0 before:-z-1 before:rounded-sm before:transition-[background-color] before:duration-(--duration-fast) before:ease-in-out hover:not-active:before:bg-ui active:before:bg-ui-2"
      data-slot="link-line"
    >
      <span class="mark-cell type-title" data-slot="glyph"
        ><LinkStateGlyph {glyph} /></span
      >
      <div class="flex min-w-0 flex-col gap-space-1" data-slot="link-main">
        <a
          aria-label={nameOf(link)}
          class="block min-w-0 type-title text-tx no-underline after:absolute after:inset-0 after:rounded-sm focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-solid focus-visible:after:outline-accent focus-visible:after:-outline-offset-2"
          data-slot="link-title"
          href={link.url}
          rel="noreferrer"
          target="_blank"
        >
          {#if glyph === "pending"}
            <span class="flex h-lh items-center" data-slot="link-title-bar">
              <Skeleton class="w-4/5 max-w-ch-60" line="label" radius="text" />
            </span>
          {:else if link.title}
            <span
              class="line-clamp-2 text-pretty wrap-anywhere"
              class:text-tx-2={glyph === "failed"}
              title={link.title}>{link.title}</span
            >
          {:else if sentence}
            <span
              class="block type-body text-pretty wrap-anywhere text-red"
              role="alert">{sentence}</span
            >
          {/if}
        </a>
        {#if link.title && sentence}
          <p
            class="m-0 max-w-measure type-body text-pretty wrap-anywhere text-red"
            data-slot="link-problem"
            role="alert"
          >
            {sentence}
          </p>
        {/if}
        {#if link.baselineUnread}
          <p
            class="m-0 max-w-measure type-body text-pretty wrap-anywhere text-orange"
            data-slot="link-held"
          >
            {words.baselineUnread}
          </p>
        {/if}
        <span
          class="mark-line flex min-w-0 items-center gap-x-space-2 type-label font-normal text-tx-2"
          data-slot="link-meta"
        >
          <span
            class="flex-none whitespace-nowrap font-medium"
            class:text-tx={glyph !== "failed" && glyph !== "pending"}
            class:text-red={glyph === "failed"}
            class:text-tx-2={glyph === "pending"}
            data-slot="link-state">{said}</span
          >
          <span aria-hidden="true" class="flex-none text-tx-2">·</span>
          <ProviderLogo class="flex-none" provider={link.source} />
          <span
            class="flex-none whitespace-nowrap font-(family-name:--font-mono) liga-none num"
            data-slot="link-ref">{link.ref}</span
          >
          {#if place}
            <span aria-hidden="true" class="flex-none text-tx-2">·</span>
            <span
              class="min-w-0 overflow-clip text-ellipsis whitespace-nowrap"
              data-slot="link-place"
              title={place}>{place}</span
            >
          {/if}
        </span>
        {#if link.problem}
          <span class="relative z-1 self-start" data-slot="link-retry">
            <Button
              icon={IconRefresh}
              label={words.readAgain}
              onclick={() => retry(link)}
              pending={retrying[link.url] ?? false}
              pendingLabel={words.readingAgain}
              size="xs"
              variant="ghost"
            />
          </span>
        {/if}
      </div>
      <span
        class="mark-cell hidden type-title @min-phone/links:grid"
        data-slot="link-author"
      >
        {#if link.author?.avatarUrl && !link.problem}
          <img
            alt=""
            class="size-icon-lg rounded-pill"
            src={link.author.avatarUrl}
            title={link.author.name ?? link.author.login}
          />
        {/if}
      </span>
      <span class="mark-cell type-title justify-items-end" data-slot="link-age"
        >{@render age(link.updatedAt)}</span
      >
      <span class="mark-cell type-title" data-slot="link-out"
        ><IconArrowUpRight
          aria-hidden="true"
          class="size-icon-md text-tx-2"
        /></span
      >
    </div>

    {#if shown.length > 0}
      <div
        class="col-start-2 -col-end-1 flex min-w-0 flex-col items-start gap-space-2 pe-space-2 pb-space-3"
        data-slot="link-comments"
      >
        <ul
          class="m-0 flex w-full min-w-0 list-none flex-col gap-space-2 p-0"
          id={commentsId}
        >
          {#each shown as each (each.via?.externalId ?? each.at)}
            {@render comment(each, link)}
          {/each}
        </ul>
        {#if all.length > COMMENTS_SHOWN}
          <Button
            aria-controls={commentsId}
            aria-expanded={open}
            label={open
              ? words.fewerComments
              : words.moreComments(all.length - COMMENTS_SHOWN)}
            onclick={() => {
              unfolded[link.url] = !open;
            }}
            size="xs"
            variant="ghost"
          />
        {/if}
      </div>
    {/if}
  </li>
{/snippet}

<section
  aria-labelledby="{uid}-head"
  class="@container/links flex min-w-0 flex-col gap-space-2"
  data-slot="links"
>
  <h3
    class={cn(sectionHeadVariants({ inset: "flush" }), "px-space-2")}
    id="{uid}-head"
  >
    <span>{words.linksHead}</span>
    <span data-num data-slot="count" class="num ms-auto type-meta text-tx-2"
      >{links.length}</span
    >
  </h3>
  <div
    class="grid grid-cols-(--links-cols) gap-x-space-3 @min-phone/links:grid-cols-(--links-cols-wide) @min-phone/links:gap-x-space-4"
    data-slot="link-groups"
    style:--links-cols={COLS}
    style:--links-cols-wide={COLS_WIDE}
  >
    {#each groups as group, index (group.mode)}
      <section
        aria-labelledby={headed ? `${uid}-${group.mode}` : undefined}
        class="col-span-full grid grid-cols-subgrid"
        data-group={group.mode}
      >
        {#if headed}
          <h4
            class="col-span-full m-0 flex items-baseline gap-space-2 px-space-2 pb-space-1 type-label text-tx-2"
            class:pt-space-4={index > 0}
            id="{uid}-{group.mode}"
          >
            <span>{words.relation[group.mode]}</span>
            {#if group.mode !== "record"}
              <span class="num type-meta text-tx-2">{group.links.length}</span>
            {/if}
          </h4>
        {/if}
        <ul class="col-span-full m-0 grid list-none grid-cols-subgrid p-0">
          {#each group.links as link (link.url)}
            {@render row(link)}
          {/each}
        </ul>
      </section>
    {/each}
  </div>
</section>
