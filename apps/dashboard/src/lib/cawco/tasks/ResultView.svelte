<script lang="ts">
  /**
   * One output an attempt handed in, drawn as the thing it is (result.ts):
   * a document as a document, a page as a page in a frame of its own, a
   * mockup through the project's mockup renderer (MockupFrame, the one
   * OpenUI binding), data as what it says (ResultData), a table as a table.
   * Its file's name is never shown: what it is called above it is its kind,
   * and its own title where it has one. A read the hub refused is said in
   * the hub's words where the result would be.
   */
  import type { ProjectMockups } from "@cawco/core/mockups";
  import type { Component } from "svelte";
  import { Skeleton } from "#lib/components/ui/skeleton/index.js";
  import {
    IconAlignLeft,
    IconDocument,
    IconEye,
    IconFileTable,
    IconLayers,
    IconPalette,
    IconWindow,
  } from "#lib/icons.js";
  import { failureWords } from "../hub-read";
  import MessageBody from "../MessageBody.svelte";
  import { readOutput } from "../project-tasks";
  import { checkMockup, mockupsOf } from "../views/openui/mockup/api";
  import MockupFrame from "../views/openui/mockup/MockupFrame.svelte";
  import ResultCard from "./ResultCard.svelte";
  import ResultData from "./ResultData.svelte";
  import ResultTable from "./ResultTable.svelte";
  import {
    documentOf,
    type Json,
    KIND_WORD,
    parseDelimited,
    type ResultKind,
    resultKind,
  } from "./result";

  let {
    projectId,
    taskId,
    name,
  }: {
    projectId: string;
    taskId: string;
    /** The output's name in the task file (`post.md`): read by, never shown. */
    name: string;
  } = $props();

  const kind = $derived(resultKind(name));

  type Read =
    | { state: "reading" }
    | { state: "refused"; reason: string }
    | { state: "read"; text: string }
    | { state: "picture"; url: string }
    | { state: "mockup"; mockups: ProjectMockups; source: string };

  let read = $state<Read>({ state: "reading" });

  const GLYPH: Record<ResultKind, Component> = {
    document: IconDocument,
    page: IconWindow,
    mockup: IconPalette,
    data: IconLayers,
    table: IconFileTable,
    picture: IconEye,
    text: IconAlignLeft,
  };

  async function load(
    project: string,
    task: string,
    output: string,
    as: ResultKind
  ): Promise<Read> {
    try {
      const served = await readOutput(project, task, output);
      if (as === "picture") {
        return {
          state: "picture",
          url: URL.createObjectURL(await served.blob()),
        };
      }
      const text = await served.text();
      if (as === "mockup") {
        const [mockups, { source }] = await Promise.all([
          mockupsOf(project),
          checkMockup(project, text),
        ]);
        return { state: "mockup", mockups, source };
      }
      return { state: "read", text };
    } catch (error) {
      return { state: "refused", reason: failureWords(error) };
    }
  }

  $effect(() => {
    let current = true;
    let url: string | null = null;
    read = { state: "reading" };
    load(projectId, taskId, name, kind).then((answer) => {
      if (answer.state === "picture") {
        ({ url } = answer);
      }
      if (current) {
        read = answer;
      } else if (url) {
        URL.revokeObjectURL(url);
      }
    });
    return () => {
      current = false;
      if (url) {
        URL.revokeObjectURL(url);
      }
    };
  });

  /** A data result's value, or why it does not read. */
  const data = $derived.by((): { value: Json } | { problem: string } | null => {
    if (kind !== "data" || read.state !== "read") {
      return null;
    }
    try {
      return { value: JSON.parse(read.text) as Json };
    } catch (error) {
      return {
        problem: `This data does not read: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  });
  const doc = $derived(
    kind === "document" && read.state === "read" ? documentOf(read.text) : null
  );
  const rows = $derived(
    kind === "table" && read.state === "read"
      ? parseDelimited(read.text, name.toLowerCase().endsWith(".tsv"))
      : []
  );
</script>

<!-- mark-line: the card draws its glyph and kind on its own mark line -->
<ResultCard
  data-result-kind={kind}
  data-result-state={read.state}
  glyph={GLYPH[kind]}
  kind={KIND_WORD[kind]}
  title={doc?.title}
>
  {#if read.state === "reading"}
    <div aria-hidden="true" class="skeleton">
      <Skeleton class="h-4 w-2/5" />
      <Skeleton class="h-3.5 w-full" />
      <Skeleton class="h-3.5 w-4/5" />
    </div>
  {:else if read.state === "refused"}
    <p class="problem" role="status">{read.reason}</p>
  {:else if read.state === "mockup"}
    <div class="mockup">
      <MockupFrame mockups={read.mockups} {projectId} source={read.source} />
    </div>
  {:else if read.state === "picture"}
    <img alt="What this attempt drew" class="picture" src={read.url} />
  {:else if kind === "document" && doc}
    <div class="document"><MessageBody source={doc.body} /></div>
  {:else if kind === "page"}
    <!-- A page the attempt wrote, drawn as a page: its own document in a
         frame that runs none of its scripts and reaches nothing of ours. -->
    <iframe
      class="page"
      sandbox=""
      srcdoc={read.text}
      title="The page this attempt made"
    ></iframe>
  {:else if kind === "data" && data}
    {#if "value" in data}
      <ResultData value={data.value} />
    {:else}
      <p class="problem" role="status">{data.problem}</p>
    {/if}
  {:else if kind === "table" && rows.length > 0}
    <ResultTable columns={rows[0]} rows={rows.slice(1)} />
  {:else}
    <pre class="text">{read.text}</pre>
  {/if}
</ResultCard>

<style>
  .skeleton {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .problem {
    font: var(--type-body);
    color: var(--ink-muted);
  }
  .document {
    min-inline-size: 0;
  }
  .mockup {
    min-inline-size: 0;
    overflow: auto;
    border-radius: var(--radius-sm);
  }
  .page {
    inline-size: 100%;
    block-size: 28rem;
    border: 1px solid var(--border-well);
    border-radius: var(--radius-sm);
    background: var(--surface-well);
  }
  /* At its own size, never stretched across the card: a column's items
     stretch by default. */
  .picture {
    display: block;
    align-self: start;
    max-inline-size: 100%;
    block-size: auto;
    border-radius: var(--radius-sm);
  }
  .text {
    margin: 0;
    padding: var(--space-3);
    overflow-x: auto;
    border-radius: var(--radius-sm);
    background: var(--code-bg);
    font-family: var(--font-mono);
    font-size: var(--text-meta);
    white-space: pre-wrap;
  }
</style>
