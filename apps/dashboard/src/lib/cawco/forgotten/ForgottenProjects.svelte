<script lang="ts">
  /**
   * Forgotten projects (`/project/forgotten`, from the glyph in the rail's
   * Projects head): every project the hub's trash can bring back, newest
   * first, one row each in fixed columns: its mark, its name, what it
   * brings back, when it was forgotten, then Bring back and Delete….
   *
   * A project forgotten before the hub kept names has a name field where
   * its name would stand; Bring back waits for a name, and Enter in the
   * field brings it back. Bring back stays pending until the hub answers and
   * lands in the project's page; refused, the hub's words stand under the
   * row with Try again (kept through a reload, project-end.svelte.ts).
   * Delete… asks under its row (AskHere), with the same files box as a live
   * project's delete; once it goes, the row leaves and the rows below close
   * up (motion/rows).
   *
   * Under the `forgotten` container width each row takes two lines: its
   * name, then what it brings and when, the actions trailing under them.
   *
   * The rows a restore held back (`held`) stand among them by when their
   * project was forgotten, one entry each under that project's name (a way
   * to the project while it is live), its warning mark in the lead column,
   * how many rows in the Brings back column, and each row with why listed
   * under it. Its acts are Try again, which puts back what now reads and
   * says under the entry what is still held back, and Delete…, which asks
   * under it and deletes those rows alone. It is never brought back as a
   * project.
   *
   * Its state arrives as props, so every state stands in a story
   * (ForgottenProjects.stories.ts): `list` null while it is read,
   * `bringing` and `asking` force a pending Bring back and a standing
   * delete question, `retrying` a pending Try again.
   */
  import { detach } from "@cawco/core/detach";
  import {
    type ForgottenProject,
    type HeldRows,
    PROJECT_NAME_LENGTH,
  } from "@cawco/core/forgotten-project";
  import { projectEndWords } from "@cawco/core/words/project-ends";
  import { projectTrashWords } from "@cawco/core/words/project-trash";
  import { untrack } from "svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import { Input } from "#lib/components/ui/input/index.js";
  import { Skeleton } from "#lib/components/ui/skeleton/index.js";
  import {
    IconArchive,
    IconDeleteForGood,
    IconFolder,
    IconRefresh,
    IconReset,
    IconWarningTriangle,
  } from "#lib/icons.js";
  import { reflow } from "#lib/platform/motion/rows.svelte.js";
  import AskHere from "../AskHere.svelte";
  import { Asker, type AskHereRequest } from "../ask-here.svelte";
  import FromDiskBox from "../FromDiskBox.svelte";
  import RowFault from "../RowFault.svelte";

  let {
    list,
    held,
    unread = null,
    reread,
    bringBack,
    remove,
    refusalOf,
    holderOf = () => null,
    now = Date.now(),
    bringing = null,
    asking = null,
    names = {},
    retry,
    removeHeld,
    heldSaidOf,
    retrying = null,
  }: {
    /** What the hub lists, newest first; null while it is read. */
    list: ForgottenProject[] | null;
    /** The rows each restore held back, one entry each, newest first. */
    held: HeldRows[];
    /** The list could not be read: the hub's words, with Try again. */
    unread?: string | null;
    reread: () => unknown;
    /** Brings one back (and opens its page); false when the hub refused, its words then kept for `refusalOf`. */
    bringBack: (one: ForgottenProject, name?: string) => Promise<boolean>;
    /** Deletes one for good; a refusal is thrown in the hub's words. */
    remove: (one: ForgottenProject, fromDisk: boolean) => Promise<void>;
    /**
     * A refused Bring back for the row: the hub's words, and `standing` when
     * asking again the same way can't change it (no Try again); or null.
     */
    refusalOf: (id: string) => { reason: string; standing: boolean } | null;
    /** The live project that holds one of its places now, linked from a refusal; null: none. */
    holderOf?: (one: ForgottenProject) => { href: string; name: string } | null;
    /** The clock its dates are read against. */
    now?: number;
    /** A story's: the row whose Bring back is pending. */
    bringing?: string | null;
    /** A story's: the row whose delete question stands, its box as given; `held`: its entry of held rows. */
    asking?: { id: string; fromDisk: boolean; held?: boolean } | null;
    /** A story's: names already typed into nameless rows, by id. */
    names?: Record<string, string>;
    /** Tries an entry's rows again; what it came to is then said through `heldSaidOf`. */
    retry: (one: HeldRows) => Promise<unknown>;
    /** Deletes an entry's rows for good; a refusal is thrown in the hub's words. */
    removeHeld: (one: HeldRows) => Promise<void>;
    /**
     * What the entry's last Try again came to, when rows were still held
     * back or the hub refused it, in words; null: nothing to say. Its own
     * Try again stands beside it.
     */
    heldSaidOf: (one: HeldRows) => string | null;
    /** A story's: the entry whose Try again is pending, by its key. */
    retrying?: string | null;
  } = $props();

  /** The ledger's columns: mark, name, what it brings, when, the actions. */
  const COLUMNS =
    "var(--spacing-c-row-lead) minmax(0, 1fr) calc(var(--spacing) * 48) calc(var(--spacing) * 30) auto";
  /** Under the container width: mark, then everything else under the name. */
  const COLUMNS_NARROW = "var(--spacing-c-row-lead) minmax(0, 1fr)";
  /** Three rows stand in while the list is read. */
  const SKELETON_ROWS = [0, 1, 2];

  const asker = new Asker<AskHereRequest>();
  /** Delete's files box, for the question standing. */
  let fromDisk = $state(false);
  /** Names typed into nameless rows, by id. */
  let typed = $state<Record<string, string>>({});
  /** Rows whose Bring back is waiting on the hub. */
  let pending = $state<string[]>([]);

  /** What a nameless row's field starts from: the heading its folder gives itself, else nothing. */
  const seedOf = (one: ForgottenProject): string => one.hints?.heading ?? "";
  /** The name a nameless row would come back under, as its field stands. */
  const fieldOf = (one: ForgottenProject): string =>
    typed[one.id] ?? names[one.id] ?? seedOf(one);
  const nameOf = (one: ForgottenProject): string => fieldOf(one).trim();
  const keyOf = (one: ForgottenProject) => `${one.id}:${one.forgottenAt}`;
  /** An entry of held rows' key: the forget its rows come from. */
  const heldKeyOf = (one: HeldRows) => `held:${one.id}:${one.forgottenAt}`;

  /** Every row the list draws, forgotten projects and held rows' entries alike, newest forget first. */
  const rows = $derived(
    [
      ...(list ?? []).map((one) => ({
        kind: "forgotten" as const,
        at: one.forgottenAt,
        key: keyOf(one),
        one,
      })),
      ...held.map((one) => ({
        kind: "held" as const,
        at: one.forgottenAt,
        key: heldKeyOf(one),
        one,
      })),
    ].toSorted((a, b) => b.at - a.at)
  );
  /** Entries whose Try again is waiting on the hub, by key. */
  let retryPending = $state<string[]>([]);

  async function tryAgain(one: HeldRows): Promise<void> {
    const key = heldKeyOf(one);
    if (retryPending.includes(key)) {
      return;
    }
    retryPending = [...retryPending, key];
    try {
      await retry(one);
    } finally {
      retryPending = retryPending.filter((each) => each !== key);
    }
  }

  function askDeleteHeld(one: HeldRows): void {
    detach(
      asker.ask({
        at: heldKeyOf(one),
        title: projectTrashWords.heldDeleteAsk(one.name, one.rows.length),
        body: projectTrashWords.heldDeleteBody,
        confirmLabel: projectTrashWords.heldDeleteConfirm,
        pendingLabel: projectEndWords.deleting,
        destructive: true,
        icon: IconDeleteForGood,
        run: () => removeHeld(one),
      }),
      "delete held rows"
    );
  }

  /**
   * A moment as the list reads it: its day and its time, the year only when
   * it is not this one. Folders forgotten together tell apart by the minute.
   */
  function when(at: number): string {
    const date = new Date(at);
    return date.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      ...(date.getFullYear() === new Date(now).getFullYear()
        ? {}
        : { year: "numeric" }),
    });
  }

  /**
   * The line under a row's name that tells it from the rest: a named
   * project's checkout; a folder's newest task, its pages, its stages, and
   * when its files last changed, which is all that tells two stubs apart.
   */
  function detailOf(one: ForgottenProject): string {
    const checkout = one.places.find((place) => place.kind === "checkout");
    if (one.name !== null) {
      return checkout
        ? projectEndWords.placeAt(checkout.machineName, checkout.path)
        : "";
    }
    const { hints } = one;
    if (!hints) {
      return "";
    }
    return projectEndWords.folderSays({
      task: hints.newestTask,
      pages: hints.pages,
      stages: hints.stages.length,
      changed: hints.changedAt === null ? null : when(hints.changedAt),
    });
  }

  /** The nameless rows whose name field stands open, asked by Bring back. */
  let naming = $state<string[]>([]);
  const isNaming = (one: ForgottenProject) =>
    one.name === null &&
    (naming.includes(one.id) || (names[one.id] ?? "") !== "");

  /** The name field takes the focus as it opens. */
  const takeFocus = (node: HTMLElement) => {
    (node instanceof HTMLInputElement
      ? node
      : node.querySelector("input")
    )?.focus();
  };

  async function back(one: ForgottenProject): Promise<void> {
    if (one.name === null && !isNaming(one)) {
      // Nameless: Bring back opens its name field first.
      naming = [...naming, one.id];
      return;
    }
    const name = one.name ?? nameOf(one);
    if (!name || pending.includes(one.id)) {
      return;
    }
    pending = [...pending, one.id];
    try {
      await bringBack(one, one.name === null ? name : undefined);
    } finally {
      pending = pending.filter((id) => id !== one.id);
    }
  }

  /** The checkouts a delete with its files removes, by machine name and path (its hub folder goes either way). */
  const checkoutsOf = (one: ForgottenProject) =>
    one.places
      .filter((place) => place.kind === "checkout")
      .map((place) => ({
        machine: place.machineName,
        path: place.path,
        within: place.within.map((holder) => holder.name),
      }));

  /** What a row is called to a reader and in its question: its name, else when it was forgotten. */
  const rowName = (one: ForgottenProject): string =>
    one.name ??
    one.hints?.heading ??
    projectEndWords.unnamedAt(when(one.forgottenAt));

  function askDelete(one: ForgottenProject, box = false): void {
    fromDisk = box;
    const name = rowName(one);
    detach(
      asker.ask({
        at: keyOf(one),
        title: projectEndWords.deleteForgotten(name),
        body: projectEndWords.deleteForgottenBody,
        confirmLabel: () =>
          fromDisk && checkoutsOf(one).length > 0
            ? projectEndWords.deleteWithFiles
            : projectEndWords.deletePlain,
        pendingLabel: projectEndWords.deleting,
        destructive: true,
        icon: IconDeleteForGood,
        run: () => remove(one, fromDisk),
      }),
      "delete forgotten"
    );
  }

  // A story's standing question: asked as the story opens it, of a
  // forgotten project's row, or of an entry of held rows (`held`).
  $effect(() => {
    const standing = asking;
    if (!standing) {
      return;
    }
    const one = list?.find((each) => each.id === standing.id);
    const entry = standing.held
      ? held.find((each) => each.id === standing.id)
      : undefined;
    // Untracked: asking reads the asker's question it then replaces.
    untrack(() => {
      if (entry) {
        askDeleteHeld(entry);
      } else if (one) {
        askDelete(one, standing.fromDisk);
      }
    });
  });
</script>

<!-- A row's Brings back and Forgotten columns, on a desk. -->
{#snippet columns(brings: string, forgot: string)}
  <span
    data-slot="brings"
    class="overflow-clip type-meta text-ellipsis whitespace-nowrap text-ink-muted @max-forgotten/forgotten:hidden"
    title={brings}>{brings}</span
  >
  <span
    data-box
    data-slot="when"
    class="num overflow-clip type-meta text-ellipsis whitespace-nowrap text-ink-muted @max-forgotten/forgotten:hidden"
    ><span class="sr-only">{projectEndWords.forgottenAt(forgot)}</span><span
      aria-hidden="true">{forgot}</span
    ></span
  >
{/snippet}

<section
  aria-label={projectEndWords.forgottenTitle}
  class="@container/forgotten min-w-0"
  data-forgotten
>
  {#if unread !== null}
    <RowFault again={reread} reason={unread} />
  {:else if list === null}
    <!-- Rows where the list will stand, at a row's height each. -->
    <div class="grid gap-space-1" aria-hidden="true">
      {#each SKELETON_ROWS as row (row)}
        <Skeleton height="control" radius="tile" />
      {/each}
    </div>
  {:else if rows.length === 0}
    <!-- Nothing forgotten: said where the rows would stand, its mark in the
         lead column. No action: nothing here starts the work that fills it
         (a forget does, from a project's menu). -->
    <div
      class="mark-line grid grid-cols-(--narrow-cols) items-center gap-x-space-3 gap-y-space-1 py-space-3"
      data-forgotten-none
      style:--narrow-cols={COLUMNS_NARROW}
    >
      <span class="grid place-items-center text-ink-muted" data-box>
        <IconArchive aria-hidden="true" class="size-icon-md" />
      </span>
      <span class="block min-w-0 type-label text-ink-row"
        >{projectEndWords.noneTitle}</span
      >
      <p class="col-start-2 m-0 min-w-0 type-meta text-pretty text-ink-muted">
        {projectEndWords.noneBody}
      </p>
    </div>
  {:else}
    <ul
      class="m-0 grid list-none grid-cols-(--wide-cols) gap-x-space-3 p-0 @max-forgotten/forgotten:grid-cols-(--narrow-cols)"
      style:--wide-cols={COLUMNS}
      style:--narrow-cols={COLUMNS_NARROW}
      {@attach reflow()}
    >
      <!-- The columns' heads, on a desk: what each fact is. Under the
           container width the facts fold under the name, worded whole. A
           reader hears each cell's own words instead. -->
      <li
        aria-hidden="true"
        class="col-span-full grid grid-cols-subgrid border-b border-border-hairline py-space-2 type-label tracking-caps text-ink-muted uppercase @max-forgotten/forgotten:hidden"
        data-forgotten-heads
      >
        <span class="col-start-2">{projectEndWords.headProject}</span>
        <span>{projectEndWords.headBrings}</span>
        <span>{projectEndWords.headForgotten}</span>
      </li>
      {#each rows as item (item.key)}
        {#if item.kind === "held"}
          {@const one = item.one}
          {@const busy =
            retryPending.includes(item.key) || retrying === item.key}
          {@const said = heldSaidOf(one)}
          {@const count = projectTrashWords.heldEntry(one.rows.length)}
          {@const forgot = when(one.forgottenAt)}
          <li
            class="col-span-full grid grid-cols-subgrid border-b border-border-hairline last:border-b-0"
            data-flip
            data-held-row={item.key}
          >
            <div
              data-slot="row"
              class="mark-line col-span-full grid min-h-c-row-h grid-cols-subgrid items-center gap-y-space-1 py-space-1 @max-forgotten/forgotten:py-space-2"
            >
              <span
                data-slot="mark"
                class="grid place-items-center self-center text-status-attn-ink @max-forgotten/forgotten:row-span-3 @max-forgotten/forgotten:self-start @max-forgotten/forgotten:pt-space-2"
                data-box
              >
                <IconWarningTriangle aria-hidden="true" class="size-icon-md" />
              </span>
              <div data-box data-slot="name" class="min-w-0">
                <!-- The project these rows belong to: the way to it while
                     it is live. -->
                {#if one.live}
                  <a
                    aria-label={projectTrashWords.heldOpenProject(one.name)}
                    class="block overflow-clip type-label text-ellipsis whitespace-nowrap text-ink-row no-underline hover:text-link-hover"
                    href={`/project/${encodeURIComponent(one.id)}`}
                    title={one.name}>{one.name}</a
                  >
                {:else}
                  <span
                    class="block overflow-clip type-label text-ellipsis whitespace-nowrap text-ink-row"
                    title={one.name}>{one.name}</span
                  >
                  <span
                    class="mt-space-row block type-meta text-pretty text-ink-muted"
                    data-slot="detail"
                    >{projectTrashWords.heldProjectGone(one.name)}</span
                  >
                {/if}
              </div>
              {@render columns(count, forgot)}
              <span
                data-slot="facts"
                class="col-start-2 hidden type-meta text-pretty text-ink-muted @max-forgotten/forgotten:block"
                >{projectTrashWords.heldFacts(one.rows.length, forgot)}</span
              >
              <div
                data-box
                data-slot="actions"
                class="flex items-center justify-end gap-space-2 @max-forgotten/forgotten:col-start-2 @max-forgotten/forgotten:justify-start"
              >
                <Button
                  aria-label={projectTrashWords.heldRetryOne(one.name)}
                  data-held-retry
                  disabled={!one.live}
                  failed={said !== null}
                  icon={IconRefresh}
                  label={projectTrashWords.heldRetry}
                  onclick={() => tryAgain(one)}
                  pending={busy}
                  pendingLabel={projectTrashWords.heldRetrying}
                  size="sm"
                  variant="outline"
                />
                <Button
                  aria-label={projectTrashWords.heldDeleteOne(one.name)}
                  data-held-delete
                  disabled={busy}
                  label={projectEndWords.deleteRow}
                  onclick={() => askDeleteHeld(one)}
                  size="sm"
                  variant="ghost"
                />
              </div>
            </div>
            <!-- What the last Try again came to, while rows stay held back,
                 or why the hub did not try them. -->
            <RowFault
              class="col-span-full"
              indent="calc(var(--spacing-c-row-lead) + var(--spacing-space-3))"
              reason={said}
            />
            <!-- Each row held back, and why, under the entry; a long list
                 scrolls in its own place. -->
            <ul
              aria-label={projectTrashWords.heldListLabel(one.name)}
              class="col-start-2 -col-end-1 m-0 grid max-h-48 list-none gap-space-row overflow-y-auto p-0 pb-space-2 type-meta break-words text-ink-muted"
              data-slot="held"
            >
              {#each one.rows as row, at (at)}
                <li>{projectTrashWords.heldRow(row)}</li>
              {/each}
            </ul>
            <AskHere
              {asker}
              at={item.key}
              class="col-span-full pb-space-2"
              indent="calc(var(--spacing-c-row-lead) + var(--spacing-space-3))"
            />
          </li>
        {:else}
          {@const one = item.one}
          {@const named = one.name !== null}
          {@const name = one.name ?? nameOf(one)}
          {@const busy = pending.includes(one.id) || bringing === one.id}
          {@const facts = projectEndWords.brings(one.brings)}
          {@const forgot = when(one.forgottenAt)}
          {@const refusal = refusalOf(one.id)}
          {@const holder = refusal ? holderOf(one) : null}
          <li
            class="col-span-full grid grid-cols-subgrid border-b border-border-hairline last:border-b-0"
            data-flip
            data-forgotten-row={one.id}
          >
            <div
              data-slot="row"
              class="mark-line col-span-full grid min-h-c-row-h grid-cols-subgrid items-center gap-y-space-1 py-space-1 @max-forgotten/forgotten:py-space-2"
            >
              <span
                data-slot="mark"
                class="grid place-items-center self-center text-ink-muted @max-forgotten/forgotten:row-span-3 @max-forgotten/forgotten:self-start @max-forgotten/forgotten:pt-space-2"
                data-box
              >
                <IconFolder aria-hidden="true" class="size-icon-md" />
              </span>
              <div data-box data-slot="name" class="min-w-0">
                {#if named}
                  <span
                    class="block overflow-clip type-label text-ellipsis whitespace-nowrap text-ink-row"
                    title={one.name}>{one.name}</span
                  >
                {:else if !isNaming(one)}
                  <!-- Forgotten before the hub kept names: the heading its
                     folder gives itself, else Unnamed; Bring back asks for a
                     name here, starting from that heading. -->
                  <span
                    class={[
                      "block overflow-clip type-label text-ellipsis whitespace-nowrap",
                      one.hints?.heading ? "text-ink-row" : "text-ink-muted",
                    ]}>{one.hints?.heading ?? projectEndWords.unnamed}</span
                  >
                {:else}
                  <Input
                    {@attach takeFocus}
                    data-box
                    aria-label={projectEndWords.nameLabel(one.id)}
                    class="max-w-c-page-column-w"
                    disabled={busy}
                    maxlength={PROJECT_NAME_LENGTH}
                    oninput={(event) => {
                      typed[one.id] = event.currentTarget.value;
                    }}
                    onkeydown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        detach(back(one), "bring back");
                      } else if (event.key === "Escape") {
                        naming = naming.filter((id) => id !== one.id);
                        delete typed[one.id];
                      }
                    }}
                    placeholder={projectEndWords.namePlaceholder}
                    value={fieldOf(one)}
                  />
                {/if}
                {#if detailOf(one)}
                  <!-- It wraps rather than cut: its end ("files changed …")
                     is often all that tells two stubs apart. -->
                  <span
                    class="mt-space-row block type-meta text-pretty text-ink-muted"
                    data-slot="detail"
                    title={detailOf(one)}>{detailOf(one)}</span
                  >
                {/if}
                {#if one.brings.tasksIn}
                  <span
                    class="mt-space-row block overflow-clip type-meta text-ellipsis whitespace-nowrap text-ink-muted"
                    >{projectEndWords.tasksIn(
                      one.brings.tasksIn.name,
                      one.brings.tasksIn.tasks
                    )}</span
                  >
                {/if}
              </div>
              {@render columns(facts, forgot)}
              <!-- Under the container width: what it brings and when, each
                 named, since the heads are gone. -->
              <span
                data-slot="facts"
                class="col-start-2 hidden type-meta text-pretty text-ink-muted @max-forgotten/forgotten:block"
                >{projectEndWords.factsLine(facts, forgot)}</span
              >
              <div
                data-box
                data-slot="actions"
                class="flex items-center justify-end gap-space-2 @max-forgotten/forgotten:col-start-2 @max-forgotten/forgotten:justify-start"
              >
                <Button
                  aria-label={projectEndWords.bringBackOne(rowName(one))}
                  data-bring-back
                  failed={refusal !== null}
                  disabled={isNaming(one) && !name}
                  icon={IconReset}
                  label={projectEndWords.bringBack}
                  onclick={() => back(one)}
                  pending={busy}
                  pendingLabel={projectEndWords.bringingBack}
                  size="sm"
                  variant="outline"
                />
                <Button
                  aria-label={projectEndWords.deleteOne(rowName(one))}
                  data-delete-forgotten
                  disabled={busy}
                  label={projectEndWords.deleteRow}
                  onclick={() => askDelete(one)}
                  size="sm"
                  variant="ghost"
                />
              </div>
            </div>
            <!-- A refusal that can't change by asking again offers no Try
               again; where a live project holds its place, the way to it. -->
            <RowFault
              again={refusal && !refusal.standing ? () => back(one) : undefined}
              class="col-span-full"
              goTo={holder
                ? {
                    href: holder.href,
                    label: projectEndWords.openHolder(holder.name),
                  }
                : undefined}
              indent="calc(var(--spacing-c-row-lead) + var(--spacing-space-3))"
              reason={refusal?.reason ?? null}
            />
            <AskHere
              {asker}
              at={keyOf(one)}
              class="col-span-full pb-space-2"
              indent="calc(var(--spacing-c-row-lead) + var(--spacing-space-3))"
            >
              <!-- The same choice as a live project's delete, said the same:
                 its checkouts by machine and path, its transcripts. -->
              <FromDiskBox
                checked={fromDisk}
                onchange={(on) => {
                  fromDisk = on;
                }}
                places={checkoutsOf(one)}
              />
            </AskHere>
          </li>
        {/if}
      {/each}
    </ul>
  {/if}
</section>
