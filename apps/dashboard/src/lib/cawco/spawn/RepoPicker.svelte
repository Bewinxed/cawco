<script lang="ts" module>
  import type { GhRepo } from "@cawco/core/connections";
  import type { MachineRepos } from "../stores/machines";

  /**
   * Each machine's last answer, so a popover opened again shows its list at
   * once while it is read again. The page's own: a reload reads it afresh.
   */
  const lastRead = new Map<string, MachineRepos>();

  /** The list as the picker holds it: being read, the machine's answer, or why it has none. */
  type Listing =
    | { kind: "reading" }
    | { kind: "read"; answer: MachineRepos }
    | { kind: "unread"; words: string };

  /** One owner of the listed repositories, in the order the list first names them. */
  interface Owner {
    count: number;
    owner: GhRepo["owner"];
  }

  /** A row of the list: a listed repository, or a git URL taken as it is written. */
  type Row = { key: string; repo: GhRepo } | { key: string; url: string };

  /** The owner group's value for every owner's repositories: no GitHub login holds a `*`. */
  const ALL = "*";

  /** The URL row's key's prefix. */
  const URL_KEY = "url:";
</script>

<script lang="ts">
  /**
   * The repository picker in the location popover (§1.5): a search field
   * over the selected machine's GitHub repositories as its gh sees them
   * (stores/machines `machineRepos`), latest updated first, and a combobox
   * over them (WAI-ARIA APG, Combobox with listbox popup): the field keeps
   * focus, ↑ and ↓ move the active row, Enter picks it and sets the
   * location, Escape empties the search. A pasted git URL on any host is
   * one row of its own in place of the list. Owner chips filter the list
   * to one owner, and each row's `owner/` folds away while one is chosen.
   *
   * Motion: one list, its rows keyed by the repository, never mounted
   * again (motion/rows `reflow`). As the search or the owner changes, the
   * rows in both lists stay and slide to their places, their `owner/`
   * folding in place; those only the old list held close where they stood;
   * those only the new one holds are uncovered; the list's height travels
   * once (`morph`). An owner picked whose list shares no row with the one
   * shown (one owner for another) swaps the lists (motion/list-swap): the
   * rows shown leave together, held where they were drawn, and the new ones
   * come in after them; the list keeps the old rows' room while they leave
   * and its height travels as the new ones arrive. Through `reflow` those
   * rows left and arrived in the same slots in the same frames, each the
   * other's crossfade, under an edge shrinking over the ones leaving. The
   * owner group's thumb travels to the owner picked (the kit's segmented
   * group); the rows' hover ghost and picked wash travel between rows
   * (`highlight`); the lock's tooltip is the list's one tooltip, portalled
   * out of the scroller.
   */
  import { bringIntoView } from "@cawco/core/bring-into-view";
  import { isGitUrl, repoIdentity, repoPath } from "@cawco/core/protocol";
  import { unhandled } from "@cawco/core/unhandled";
  import { spawnWords } from "@cawco/core/words/spawn";
  import { untrack } from "svelte";
  import { highlight } from "#lib/components/ui/highlight/highlight.svelte.js";
  import { LiveDot } from "#lib/components/ui/live-dot/index.js";
  import * as ToggleGroup from "#lib/components/ui/toggle-group/index.js";
  import { provideGlide } from "#lib/components/ui/tooltip/glide.js";
  import GlideTip from "#lib/components/ui/tooltip/glide-tip.svelte";
  import Tip from "#lib/components/ui/tooltip/tip.svelte";
  import {
    IconLink as Link,
    IconLock as Lock,
    IconSearch as Search,
  } from "#lib/icons.js";
  import { failureWords } from "#lib/platform/hub-read.js";
  import { motionOk } from "#lib/platform/motion/curves.svelte.js";
  import { unfold } from "#lib/platform/motion/fold.svelte.js";
  import { ListSwap } from "#lib/platform/motion/list-swap.svelte.js";
  import { morph } from "#lib/platform/motion/morph.svelte.js";
  import { handOver, reflow } from "#lib/platform/motion/rows.svelte.js";
  import { formatAgeShort } from "#lib/utils/time.js";
  import { didntAnswer } from "../hub/control";
  import Marked from "../Marked.svelte";
  import { machineRepos } from "../stores/machines";
  import { TRY_AGAIN } from "../unanswered";

  let {
    machineId,
    machineName,
    repo,
    onrepo,
    oncommit,
    focus = false,
  }: {
    machineId: string;
    machineName: string;
    /** The git URL picked, or "" while none is. */
    repo: string;
    /** A repository was picked, or a pasted URL taken, by its git URL ("" for none). */
    onrepo: (url: string) => void;
    /** Enter picked the active row: the location is set. */
    oncommit?: () => void;
    /** The search takes focus as the picker opens: it is what the popover opened for. */
    focus?: boolean;
  } = $props();

  /**
   * Focus in the search a frame after it mounts: the popover's focus scope
   * moves focus to its first stop as it opens, and this lands after it.
   */
  function searchFirst(node: HTMLInputElement) {
    if (!untrack(() => focus)) {
      return;
    }
    const frame = requestAnimationFrame(() => node.focus());
    return () => cancelAnimationFrame(frame);
  }

  const uid = $props.id();
  const tips = provideGlide();

  let query = $state("");
  /** The owner whose repositories alone are shown; "" for every owner's. */
  let ownerPick = $state("");
  /** The row ↑ and ↓ and the pointer stand on, by its key. */
  let activeKey = $state("");
  let listing = $state<Listing>({ kind: "reading" });
  let listbox = $state<HTMLElement>();
  /** The rows' `reflow` container: handed over as one owner's list is swapped for another's. */
  let rowsBox = $state<HTMLElement>();
  /** One owner's list swapped for another's (motion/list-swap). */
  const swap = new ListSwap<Row>();
  /** The swap's incoming rows, each at its place in the list it brought: the order they come in. */
  let incoming = $state<ReadonlyMap<string, number>>(new Map());
  /**
   * Where a row still coming in was drawn as the next swap took it away:
   * its ink and its offset, which its leave starts from (the leave's
   * keyframes name only where it ends).
   */
  let drawnAt = $state<ReadonlyMap<string, { ink: string; at: string }>>(
    new Map()
  );

  $effect(() => {
    const id = machineId;
    const held = lastRead.get(id);
    listing = held ? { kind: "read", answer: held } : { kind: "reading" };
    if (!id) {
      return;
    }
    let stale = false;
    machineRepos(id)
      .then((read) => {
        if (stale) {
          return;
        }
        switch (read.kind) {
          case "answered":
            lastRead.set(id, read.value);
            listing = { kind: "read", answer: read.value };
            return;
          case "unanswered":
            // A list read before stands; this says why it did not move.
            if (!held) {
              listing = {
                kind: "unread",
                words: didntAnswer(id, read, {
                  missed: spawnWords.location.reposMissed,
                  again: TRY_AGAIN,
                }),
              };
            }
            return;
          default:
            unhandled("read", read);
        }
      })
      .catch((cause: unknown) => {
        if (!(stale || held)) {
          listing = { kind: "unread", words: failureWords(cause) };
        }
      });
    return () => {
      stale = true;
    };
  });

  const repos = $derived(
    listing.kind === "read" && listing.answer.kind === "listed"
      ? listing.answer.repos
      : []
  );
  /** Why there is no list to show, in a sentence; "" while there is one, or while it is read. */
  const why = $derived.by(() => {
    if (listing.kind === "unread") {
      return listing.words;
    }
    if (listing.kind === "reading") {
      return "";
    }
    switch (listing.answer.kind) {
      case "listed":
        return listing.answer.repos.length ? "" : spawnWords.location.noRepos;
      case "no-gh":
        return spawnWords.location.noGh(machineName);
      case "signed-out":
        return spawnWords.location.signedOut(machineName);
      case "old-daemon":
        return spawnWords.location.oldDaemon(machineName);
      default:
        return unhandled("answer", listing.answer);
    }
  });
  const owners = $derived.by(() => {
    const byLogin = new Map<string, Owner>();
    for (const one of repos) {
      const known = byLogin.get(one.owner.login);
      if (known) {
        known.count += 1;
      } else {
        byLogin.set(one.owner.login, { owner: one.owner, count: 1 });
      }
    }
    return [...byLogin.values()];
  });
  /** The chosen owner, while it still owns something listed. */
  const owner = $derived(
    owners.some((one) => one.owner.login === ownerPick) ? ownerPick : ""
  );
  const typed = $derived(query.trim());
  /** The search is a git URL: it is the one row, cloned as it is written. */
  const pasted = $derived(isGitUrl(typed));
  const q = $derived(pasted ? "" : typed.toLowerCase());
  const pickedId = $derived(repo ? repoIdentity(repo) : "");
  const listed = $derived(
    repos.find((one) => repoIdentity(one.url) === pickedId)
  );
  /**
   * The URL row: the pasted one, or a URL picked before that the list does
   * not hold (a popover opened again on it), heading the list.
   */
  const urlRow = $derived.by(() => {
    if (pasted) {
      return typed;
    }
    return repo && listing.kind === "read" && !listed ? repo : "";
  });
  /** The rows shown while `login`'s repositories alone are ("" for every owner's). */
  function rowsFor(login: string): Row[] {
    return [
      ...(urlRow ? [{ key: `${URL_KEY}${urlRow}`, url: urlRow }] : []),
      ...(pasted
        ? []
        : repos
            .filter(
              (one) =>
                (!login || one.owner.login === login) &&
                (!q ||
                  one.nameWithOwner.toLowerCase().includes(q) ||
                  (one.description ?? "").toLowerCase().includes(q))
            )
            .map((one) => ({ key: one.nameWithOwner, repo: one }))),
    ];
  }
  const rows = $derived(rowsFor(owner));
  /** `owner/` and the name, as the row draws them apart. */
  function ownerAndName(one: GhRepo): [string, string] {
    const at = one.nameWithOwner.indexOf("/");
    return [one.nameWithOwner.slice(0, at), one.nameWithOwner.slice(at + 1)];
  }
  function identityOf(row: Row): string {
    return repoIdentity("url" in row ? row.url : row.repo.url);
  }
  /** The active row: the one stood on, else the picked one, else the first. */
  const active = $derived(
    rows.find((row) => row.key === activeKey) ??
      rows.find((row) => identityOf(row) === pickedId) ??
      rows[0]
  );
  const optionId = (row: Row) => `${uid}-${rows.indexOf(row)}`;

  /** The picked row is brought into the list's view once, as the list first holds it: a popover opened again opens on it. */
  let shownPicked = false;
  $effect(() => {
    const row = rows.find((one) => identityOf(one) === pickedId);
    if (shownPicked || !(row && listbox)) {
      return;
    }
    shownPicked = true;
    const option = listbox.querySelector(`#${CSS.escape(optionId(row))}`);
    if (option) {
      bringIntoView(option);
    }
  });

  function take(row: Row): void {
    activeKey = row.key;
    onrepo("url" in row ? row.url : row.repo.url);
  }

  function search(value: string): void {
    query = value;
    activeKey = "";
    const url = value.trim();
    if (isGitUrl(url)) {
      onrepo(url);
    } else if (repo && !listed) {
      // The URL pasted before is no longer what the field says.
      onrepo("");
    }
  }

  /** Where an owner stands in the owner group, All first: the side a swap moves toward. */
  const ownerAt = (login: string) =>
    login ? 1 + owners.findIndex((one) => one.owner.login === login) : 0;

  function chooseOwner(login: string): void {
    const next = rowsFor(login);
    const shown = new Set(rows.map((row) => row.key));
    // Lists that share no row are swapped: in `reflow`, every row shown
    // would close in the slot a new one is uncovered in. Lists that share
    // one move as one list, their shared rows sliding (One Object). With
    // reduced motion the new list is simply there.
    if (
      rowsBox &&
      shown.size > 0 &&
      next.length > 0 &&
      !next.some((row) => shown.has(row.key))
    ) {
      handOver(rowsBox);
      if (motionOk.current) {
        const drawn = comingIn(rowsBox);
        const { leaving } = swap;
        swap.swap(rows, ownerAt(login) - ownerAt(owner), {
          scroller: listbox,
        });
        if (swap.leaving !== leaving) {
          drawnAt = drawn;
        }
        incoming = new Map(next.map((row, i) => [row.key, i]));
      }
    }
    ownerPick = login;
    activeKey = "";
  }

  /** Where each row the last swap brought is drawn while it still comes in, by its key. */
  function comingIn(
    box: HTMLElement
  ): Map<string, { ink: string; at: string }> {
    const drawn = new Map<string, { ink: string; at: string }>();
    if (swap.phase !== "in" || incoming.size === 0) {
      return drawn;
    }
    const shown = box.querySelectorAll<HTMLElement>(":scope > [data-flip]");
    rows.forEach((row, i) => {
      const element = shown[i];
      if (element && incoming.has(row.key)) {
        const { opacity, transform } = getComputedStyle(element);
        drawn.set(row.key, { ink: opacity, at: transform });
      }
    });
    return drawn;
  }

  /** A row's entrance: the swap's, for a row it brought, while it comes in. */
  function entrance(row: Row): string {
    const at = incoming.get(row.key);
    return at === undefined ? "none" : swap.rowAnim(at);
  }

  function step(by: number): void {
    if (!(active && listbox)) {
      return;
    }
    const at = rows.indexOf(active);
    const next = rows[Math.min(rows.length - 1, Math.max(0, at + by))];
    if (!next) {
      return;
    }
    activeKey = next.key;
    const option = listbox.querySelector(`#${CSS.escape(optionId(next))}`);
    if (option) {
      bringIntoView(option);
    }
  }

  function onkeydown(event: KeyboardEvent): void {
    if (event.isComposing) {
      return;
    }
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        step(1);
        return;
      case "ArrowUp":
        event.preventDefault();
        step(-1);
        return;
      case "Enter":
        event.preventDefault();
        if (active) {
          take(active);
        }
        oncommit?.();
        return;
      case "Escape":
        if (query) {
          // The search empties; the popover stays.
          event.stopPropagation();
          search("");
        }
        return;
      default:
    }
  }

  const PRIVATE = spawnWords.location.private;
  /** The list's columns: the lead, the name and its description, the lock, the time. */
  const REPO_COLS =
    "var(--spacing-c-row-lead) minmax(0, 1fr) var(--spacing-icon-md) max-content";
  /** Where a row's trailing ink ends: the path field's edge and Browse's (1px each), the field's inset and Browse's own. */
  const REPO_END =
    "calc(var(--spacing-space-2) + var(--spacing-space-3) + 2px)";
  /** A row: its lead, name and description, lock and time on the list's columns (a subgrid). */
  const ROW =
    "group mark-line col-span-full grid grid-cols-subgrid items-center gap-y-space-1 rounded-sm border-none bg-transparent py-space-2 pe-(--repo-end) ps-0 text-start select-none";
</script>

<div data-slot="repo-picker" class="grid min-w-0 gap-space-2">
  <label
    data-slot="location-section-field"
    class="field-edge flex h-c-row-h min-w-0 items-center gap-space-3 rounded-md border bg-surface-raised pe-space-3 shadow-xs transition-control"
  >
    <span class="grid w-c-row-lead flex-none place-items-center self-stretch"
      ><Search class="size-icon-md text-ink-subtle" /></span
    >
    <input
      aria-activedescendant={active ? optionId(active) : undefined}
      aria-autocomplete="list"
      aria-controls={`${uid}-list`}
      aria-expanded="true"
      aria-label={spawnWords.location.search}
      autocapitalize="off"
      autocomplete="off"
      autocorrect="off"
      class="h-full min-w-0 flex-1 border-none border-current bg-transparent p-0 type-body text-ink-strong placeholder:text-ink-muted"
      oninput={(event) => search(event.currentTarget.value)}
      {onkeydown}
      placeholder={spawnWords.location.search}
      role="combobox"
      spellcheck="false"
      value={query}
      {@attach searchFirst}
    />
  </label>

  {#if owners.length > 1 && !pasted}
    <!-- One pick among the owners, its thumb travelling to the one picked
         (the kit's segmented group); a row wider than the popover scrolls. -->
    <div
      data-slot="owners"
      class="fai-scroll min-w-0 overflow-x-auto overscroll-x-contain"
      in:unfold
      out:unfold
    >
      <ToggleGroup.Root
        aria-label={spawnWords.location.owners}
        onValueChange={(next) => {
          // A press on the picked owner keeps it picked.
          if (next) {
            chooseOwner(next === ALL ? "" : next);
          }
        }}
        type="single"
        value={owner || ALL}
      >
        <ToggleGroup.Item value={ALL}>
          <span>{spawnWords.location.allOwners}</span>
          <span class="num text-ink-muted">{repos.length}</span>
        </ToggleGroup.Item>
        {#each owners as one (one.owner.login)}
          <ToggleGroup.Item value={one.owner.login}>
            {@render avatar(one.owner, "size-icon-md")}
            <span>{one.owner.login}</span>
            <span class="num text-ink-muted">{one.count}</span>
          </ToggleGroup.Item>
        {/each}
      </ToggleGroup.Root>
    </div>
  {/if}

  <!-- The rows share the list's columns (a subgrid each): the avatar's
       lead, the name and its description, the lock, the time. In a narrow
       list the lock and the time go to the description's line, so the
       name has the row's width. A row's trailing ink ends where Browse's
       does under it: the path field's edge and the button's (1px each),
       the field's inset and the button's. -->
  <div
    bind:this={listbox}
    data-slot="repo-list"
    aria-label={spawnWords.location.repositories}
    class="fai-scroll @container/repos relative grid max-h-72 auto-rows-max grid-cols-(--repo-cols) content-start gap-x-space-3 overflow-y-auto overscroll-contain"
    id={`${uid}-list`}
    role="listbox"
    style:--repo-cols={REPO_COLS}
    style:--repo-end={REPO_END}
    style:--owner-track={owner ? "0fr" : "1fr"}
    style:--owner-ink={owner ? 0 : 1}
    {@attach highlight({
      rows: "[data-repo-row]",
      hovered: "data-active",
      selected: '[data-repo-row][aria-selected="true"]',
    })}
    {@attach morph()}
  >
    <!-- A swap's leaving rows, in the rows' own cell (their room held while
         they leave, the list's height travelling once they have gone), where
         they were drawn: the list is scrolled to its top for the new rows. -->
    {#if swap.leaving.length}
      <div
        aria-hidden="true"
        class="pointer-events-none col-span-full row-start-1 grid translate-y-(--left-at) auto-rows-max grid-cols-subgrid content-start"
        data-leaving
        inert
        style:--left-at={`${-swap.leftAt}px`}
      >
        {#each swap.leaving as row (row.key)}
          <div
            class="col-span-full grid grid-cols-subgrid opacity-(--leave-ink) transform-(--leave-at) animate-(--leave)"
            style:--leave={swap.leaveAnim()}
            style:--leave-ink={drawnAt.get(row.key)?.ink}
            style:--leave-at={drawnAt.get(row.key)?.at}
          >
            {@render face(row, false)}
          </div>
        {/each}
      </div>
    {/if}
    <div
      bind:this={rowsBox}
      class="col-span-full row-start-1 grid auto-rows-max grid-cols-subgrid"
      {@attach reflow()}
    >
      {#each rows as row (row.key)}
        <div
          class="col-span-full grid grid-cols-subgrid animate-(--enter)"
          data-flip
          style:--enter={entrance(row)}
        >
          {@render face(row, true)}
        </div>
      {/each}
    </div>
    {#if !rows.length}
      <p
        data-slot="repo-list-empty"
        class="col-span-full m-0 py-space-5 type-meta text-pretty text-ink-muted"
        role="status"
      >
        {#if listing.kind === "reading"}
          <span class="mark-line inline-flex items-center gap-space-2"
            ><LiveDot /><span>{spawnWords.location.loadingRepos}</span></span
          >
        {:else if why}
          {why}
        {:else}
          {spawnWords.location.noMatch(typed)}
        {/if}
      </p>
    {/if}
  </div>
</div>
<GlideTip tether={tips} />

<!-- A row: the option the combobox walks; `live` false, a picture of one
     leaving in a swap, named nothing and answering nothing. -->
{#snippet face(row: Row, live: boolean)}
  <button
    data-repo-row={live || undefined}
    aria-selected={identityOf(row) === pickedId}
    class={ROW}
    data-active={(live && active?.key === row.key) || undefined}
    id={live ? optionId(row) : undefined}
    onclick={() => {
      if (live) {
        take(row);
      }
    }}
    onpointermove={() => {
      if (live) {
        activeKey = row.key;
      }
    }}
    role="option"
    tabindex="-1"
    type="button"
  >
    {#if "url" in row}
      <span
        class="col-start-1 mark-cell justify-self-center text-ink-muted"
        data-box><Link class="size-icon-md" /></span
      >
      <span
        class="col-span-3 col-start-2 min-w-0 overflow-clip text-ellipsis whitespace-nowrap type-label font-medium text-ink-row group-aria-selected:text-selected-ink"
        >{repoPath(row.url) || row.url}</span
      >
    {:else}
      {@const one = row.repo}
      {@const [login, repoName] = ownerAndName(one)}
      <span class="col-start-1 mark-cell justify-self-center" data-box
        >{@render avatar(one.owner, "size-icon-lg")}</span
      >
      <!-- Its `owner/` folds to nothing while one owner is chosen: its
           width (a grid track going 1fr to 0fr) and its ink together. -->
      <span
        data-slot="name"
        data-box
        class="col-start-2 min-w-0 overflow-clip text-ellipsis whitespace-nowrap type-label font-medium text-ink-row group-aria-selected:text-selected-ink @max-repo-narrow/repos:col-span-3"
        ><span
          data-slot="owner"
          aria-hidden={Boolean(owner) || undefined}
          class="inline-grid grid-cols-(--owner-track) align-top font-normal text-ink-muted opacity-(--owner-ink) motion-safe:transition-[grid-template-columns,opacity] motion-safe:duration-(--duration-panel) motion-safe:ease-in-out"
          data-box
          ><span class="min-w-0 overflow-hidden"
            ><Marked query={q} text={`${login}/`} /></span
          ></span
        ><Marked query={q} text={repoName} /></span
      >
      {#if one.isPrivate}
        <Tip glide={tips} label={PRIVATE} side="top">
          {#snippet children(tip)}
            <span
              {...tip}
              aria-label={PRIVATE}
              class="col-start-3 mark-cell text-ink-muted @max-repo-narrow/repos:row-start-2"
              data-box
              data-slot="private"
              role="img"
              tabindex="-1"><Lock class="size-icon-md" /></span
            >
          {/snippet}
        </Tip>
      {/if}
      <span
        data-slot="updated"
        class="col-start-4 num type-meta text-end whitespace-nowrap text-ink-muted @max-repo-narrow/repos:row-start-2"
        >{formatAgeShort(Date.parse(one.updatedAt))}</span
      >
      {#if one.description}
        <span
          data-slot="description"
          data-box
          class="col-start-2 row-start-2 min-w-0 overflow-clip text-ellipsis whitespace-nowrap type-meta text-ink-muted"
          ><Marked query={q} text={one.description} /></span
        >
      {/if}
    {/if}
  </button>
{/snippet}

{#snippet avatar(who: GhRepo["owner"], size: string)}
  <img
    alt=""
    class="{size} flex-none bg-surface-hover object-cover data-[kind=org]:rounded-xs data-[kind=user]:rounded-pill"
    data-kind={who.kind}
    src={who.avatarUrl}
  />
{/snippet}
