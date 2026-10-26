<script lang="ts">
  import { memoryResult } from "@cawco/core/tool-presentation";
  import {
    type FleetMemoryVersion,
    memoryDocsNow,
    memoryHistory,
    memoryVersion,
  } from "#lib/cawco/fleet.js";
  import { failureWords } from "#lib/cawco/hub-read.js";
  import { reveal, revealOut } from "#lib/cawco/motion/curves.svelte.js";
  /**
   * What an `admin_memory_read` or `admin_memory_write` call read or wrote, as the document it is. The
   * sentence above already names the action and the path, so none of the raw
   * parameters are repeated here. A failed call never reaches this body — its
   * error is the row's result, shown by ToolGroup like any other failure.
   *
   * A write (`set`, `set_doc`) is a diff like an Edit's: from the version it
   * replaced to what it wrote. A `remove_doc` is the removed document diffed
   * to nothing. A `list_docs` in words names its documents by path, and each
   * opens to what it held then. What stood at the call is the hub's history
   * row for it (`fleet_memory_history`, read through the Configure editor's
   * own routes), found by the call's time.
   */
  import * as Collapsible from "#lib/components/ui/collapsible/index.js";
  import { Skeleton } from "#lib/components/ui/skeleton/index.js";
  import { IconChevronRight } from "#lib/icons.js";
  import DiffView from "../DiffView.svelte";
  import ToolProse from "./ToolProse.svelte";

  let {
    input,
    result,
    at,
  }: {
    input: Record<string, unknown> | undefined;
    result: unknown;
    /** When the call was made, ISO: what a `remove_doc` is matched by. */
    at: string | undefined;
  } = $props();

  const action = $derived(input?.action);
  const parsed = $derived(memoryResult(result));
  const written = $derived(
    typeof input?.content === "string" ? input.content : undefined
  );
  const docPath = $derived(
    typeof input?.path === "string" ? input.path : undefined
  );
  const writes = $derived(action === "set" || action === "set_doc");
  const removes = $derived(action === "remove_doc");

  /** What the diff's old side is, once it is known. */
  type Before =
    | { kind: "loading" }
    | { kind: "version"; content: string }
    /** Nothing stood there before: a first write, against empty like Write. */
    | { kind: "empty" }
    /** The save matched what was already there. */
    | { kind: "unchanged" }
    | { kind: "missing"; why: string };

  /**
   * The version of one document that stood at the call: the hub keeps a
   * version as it is replaced or removed, so it is the oldest history row
   * recorded at or after the call. `rows` are newest first. None: what stood
   * then still stands (or nothing stood).
   */
  const versionAt = (
    rows: FleetMemoryVersion[],
    called: number
  ): FleetMemoryVersion | undefined =>
    rows.filter((row) => Date.parse(row.createdAt) >= called).at(-1);

  /**
   * Which history row this call replaced or removed, by the call's time: the
   * agent's words carry no time, so the hub's record of versions does. A
   * write that left none had nothing to replace: a save of the same content
   * when the document had earlier versions, else a first write.
   */
  function replaced(
    rows: FleetMemoryVersion[]
  ): FleetMemoryVersion | Exclude<Before, { kind: "loading" | "version" }> {
    if (!at) {
      return { kind: "missing", why: "the call carries no time to match" };
    }
    const called = Date.parse(at);
    const found = versionAt(rows, called);
    if (found) {
      return found;
    }
    if (writes) {
      return rows.some((row) => Date.parse(row.createdAt) < called)
        ? { kind: "unchanged" }
        : { kind: "empty" };
    }
    return {
      kind: "missing",
      why: "the hub no longer keeps the removed version",
    };
  }

  let before = $state<Before>({ kind: "loading" });

  $effect(() => {
    if (!(writes || removes)) {
      return;
    }
    // A live write has no saved row yet; the diff waits for it.
    if (writes && parsed.kind !== "saved") {
      before = { kind: "loading" };
      return;
    }
    let live = true;
    before = { kind: "loading" };
    const path = action === "set" ? undefined : docPath;
    memoryHistory(path)
      .then(async (rows) => {
        const found = replaced(rows);
        const next: Before =
          "id" in found
            ? {
                kind: "version",
                content: (await memoryVersion(found.id)).content,
              }
            : found;
        if (live) {
          before = next;
        }
      })
      .catch((caught: unknown) => {
        if (live) {
          before = {
            kind: "missing",
            why: failureWords(caught),
          };
        }
      });
    return () => {
      live = false;
    };
  });

  interface ListedDoc {
    content: string;
    path: string;
    updatedAt?: string;
  }

  /** A listing's documents: as the detailed answer carries them, or read from the hub as they stood at the call. */
  type Listed =
    | { kind: "loading" }
    | { kind: "docs"; docs: ListedDoc[] }
    | { kind: "missing"; why: string };

  /**
   * What one listed document held at the call: its version from then when
   * the hub has replaced or removed it since, else the document as it stands.
   */
  async function heldAt(
    path: string,
    called: number,
    now: () => Promise<ListedDoc[]>
  ): Promise<ListedDoc> {
    const found = versionAt(await memoryHistory(path), called);
    if (found) {
      return { path, content: (await memoryVersion(found.id)).content };
    }
    const standing = (await now()).find((doc) => doc.path === path);
    if (!standing) {
      throw new Error(`the hub keeps no version of ${path}`);
    }
    return standing;
  }

  let listed = $state<Listed>({ kind: "loading" });

  $effect(() => {
    if (parsed.kind === "docs") {
      listed = { kind: "docs", docs: parsed.docs };
      return;
    }
    if (action !== "list_docs" || parsed.kind !== "listed") {
      return;
    }
    if (!at) {
      listed = { kind: "missing", why: "the call carries no time to match" };
      return;
    }
    let live = true;
    listed = { kind: "loading" };
    const called = Date.parse(at);
    // The documents as they stand, read once for every path that needs them.
    let standing: Promise<ListedDoc[]> | undefined;
    const now = () => {
      standing ??= memoryDocsNow();
      return standing;
    };
    Promise.all(parsed.paths.map((path) => heldAt(path, called, now)))
      .then((docs) => {
        if (live) {
          listed = { kind: "docs", docs };
        }
      })
      .catch((caught: unknown) => {
        if (live) {
          listed = { kind: "missing", why: failureWords(caught) };
        }
      });
    return () => {
      live = false;
    };
  });

  const diffPath = $derived(action === "set" ? "CLAUDE.md" : (docPath ?? ""));

  const clock = (iso: string): string =>
    new Date(iso).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  const day = (iso: string): string =>
    new Date(iso).toLocaleDateString([], {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  const lines = (text: string): number => text.split("\n").length;

  /** `saved · d957eef · 03:56` — the parts the result actually carried. */
  const footer = $derived.by(() => {
    if (parsed.kind !== "doc" && parsed.kind !== "saved") {
      return;
    }
    const parts = [
      action === "set" || action === "set_doc" ? "saved" : undefined,
      parsed.hash?.slice(0, 7),
      parsed.updatedAt ? clock(parsed.updatedAt) : undefined,
    ].filter(Boolean);
    return parts.length ? parts.join(" · ") : undefined;
  });
</script>

{#snippet well(source: string)}
  <div
    data-slot="well"
    class="max-h-c-tool-well-max-h overflow-auto p-space-3 border border-border-hairline rounded-sm bg-surface-recess"
  >
    <ToolProse {source} />
  </div>
{/snippet}

<!-- Hangs at the row's text column, like the fields well. -->
<div
  class="flex flex-col gap-space-2 mt-space-2 mb-space-3 ml-(--x-hang) min-w-0"
>
  {#if (writes && written !== undefined) || removes}
    {#if before.kind === "loading"}
      <div out:revealOut>
        <Skeleton class="w-full" height="block" />
      </div>
    {:else if before.kind === "missing"}
      <p class="text-size-label text-ink-muted" role="alert" in:reveal>
        The version this {removes ? "removed" : "replaced"} can't be shown:
        {before.why}.
      </p>
    {:else if before.kind === "unchanged"}
      <p
        data-slot="memory-body-label"
        class="text-size-label font-medium text-ink-muted"
        in:reveal
      >
        Saved unchanged: the content matched what was there.
      </p>
    {:else}
      <div class="min-w-0" in:reveal>
        <DiffView
          filePath={diffPath}
          newContent={removes ? "" : (written ?? "")}
          oldContent={before.kind === "version" ? before.content : ""}
        />
      </div>
    {/if}
    {#if footer}
      <span data-slot="foot" class="type-code text-ink-muted num">{footer}</span
      >
    {/if}
  {:else if action === "get" && parsed.kind === "doc"}
    {@render well(parsed.content)}
    {#if footer}
      <span data-slot="foot" class="type-code text-ink-muted num">{footer}</span
      >
    {/if}
  {:else if action === "list_docs" && listed.kind === "loading"}
    <div out:revealOut>
      <Skeleton class="w-full" height="block" />
    </div>
  {:else if action === "list_docs" && listed.kind === "missing"}
    <p class="text-size-label text-ink-muted" role="alert" in:reveal>
      The documents it listed can't be shown: {listed.why}.
    </p>
  {:else if action === "list_docs" && listed.kind === "docs"}
    <div class="flex flex-col gap-space-1" in:reveal>
      {#each listed.docs as doc (doc.path)}
        <Collapsible.Root>
          <Collapsible.Trigger data-doc class="group w-full" look="head">
            <span
              data-slot="path"
              class="flex-auto min-w-0 overflow-clip text-ellipsis whitespace-nowrap font-(family-name:--font-mono) text-ink-strong"
              >{doc.path}</span
            >
            {#if doc.updatedAt}
              <span
                data-slot="meta"
                class="flex-none text-size-meta font-normal text-ink-muted num"
                >{day(doc.updatedAt)}</span
              >
            {/if}
            <span
              data-slot="meta"
              class="flex-none text-size-meta font-normal text-ink-muted num"
              >{lines(doc.content)} lines</span
            >
            <span
              data-slot="chev"
              class="flex-none grid place-items-center text-ink-muted transition-[rotate] duration-(--dur-control) ease-out motion-reduce:transition-off group-state-open:rotate-90"
              data-box><IconChevronRight class="size-icon-sm block" /></span
            >
          </Collapsible.Trigger>
          <!-- Folds like the row that holds it: grows open and folds shut
               from the header, which the transcript holds in place. -->
          <Collapsible.Content reveal>
            <div data-slot="doc-body" class="pt-space-1 pb-space-2">
              {@render well(doc.content)}
            </div>
          </Collapsible.Content>
        </Collapsible.Root>
      {/each}
    </div>
  {/if}
</div>
