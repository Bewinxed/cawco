<script lang="ts">
  import type { PreviewSource } from "@whiffle/core";
  import { getContext } from "svelte";
  import { SvelteSet } from "svelte/reactivity";
  import { toast } from "svelte-sonner";
  import {
    describeTool,
    memoryResult,
    pathLeaf,
    type ToolDescriptor,
    type ToolStatus,
  } from "$lib/components/features/tool-cards/descriptors";
  import MemoryBody from "$lib/components/features/tool-cards/MemoryBody.svelte";
  import ToolProse from "$lib/components/features/tool-cards/ToolProse.svelte";
  import { Badge } from "$lib/components/ui/badge";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for a component group.
  import * as Collapsible from "$lib/components/ui/collapsible";
  import { IconChevronRight, IconWindow } from "$lib/icons";
  import {
    openPreview,
    revealPreview,
    whiffle,
  } from "$lib/whiffle/client.svelte";
  import { fleetMcpServers } from "$lib/whiffle/fleet-mcp.svelte";
  import { SHOW_IMAGE_TOOLS, SHOW_PREVIEW_TOOLS } from "$lib/whiffle/frames";
  import { mcpServerHost } from "$lib/whiffle/mcp";
  import Arrival from "$lib/whiffle/motion/Arrival.svelte";
  import { ARRIVAL } from "$lib/whiffle/motion/arrival";
  import Reveal from "$lib/whiffle/motion/Reveal.svelte";
  import Stream from "$lib/whiffle/motion/Stream.svelte";
  /**
   * A run of tool calls as rail-led rows — never a nested card. The rail is a
   * 2px stripe; each row is a glyph, the verb, a mono argument, and whatever the
   * call measured out (`+14 −6`, `3 files`). Ported from the mock's `.tools` /
   * `.trow`.
   *
   * A one-line summary is not a record of what a tool did: the input it ran on
   * and the result it came back with live in the message metadata and were,
   * until now, unreachable. Every row that carries either opens — same anatomy
   * as Prompt.svelte's "What this touches" disclosure, so the two surfaces read
   * as one idea.
   */
  import type { Message } from "../types";
  import Shot from "./Shot.svelte";

  const machine = getContext<(() => string) | undefined>("whiffle:machine");

  let {
    messages,
    /**
     * Whether a given call is ARRIVING, and where it sits in the stagger
     * queue.
     *
     * A run of calls is one row, created when the first of them lands, so the
     * row cannot be the unit that animates — every later call in the run would
     * be appended into something that had already arrived. The CALL is the
     * unit, and the answer comes from the transcript rather than from here so
     * that it survives this component being unmounted and remounted as the
     * virtualizer scrolls.
     *
     * The three nested surfaces that render tool rows — a subagent branch, a
     * delegate's report, the static tail — are not following a live tail and
     * decide no arrivals, so the default is the honest one: nothing here is
     * landing.
     */
    landing = () => ({ fresh: false, lead: 0 }),
  }: {
    messages: Message[];
    landing?: (m: Message) => { fresh: boolean; lead: number };
  } = $props();

  /** shadcn Badge, dressed on the DESIGN.md scale rather than the stock ladder. */
  const chipClass =
    "h-auto rounded-[var(--radius-xs)] border-transparent bg-[var(--surface-recess)] " +
    "px-[var(--space-2)] py-px text-[length:var(--text-meta)] font-[var(--weight-body)] " +
    "!text-[color:var(--ink-muted)]";

  const asString = (value: unknown): string | undefined =>
    typeof value === "string" ? value : undefined;

  /** Favicons that failed to load; their rows keep the tool's glyph. */
  const brokenIcons = new SvelteSet<string>();

  function describe(m: Message): ToolDescriptor {
    const meta = m.metadata ?? {};
    return describeTool(
      meta.toolName,
      (meta.toolInput ?? undefined) as Record<string, unknown> | undefined,
      asString(meta.toolResult),
      (meta.toolStatus ?? "pending") as ToolStatus,
      (server) =>
        mcpServerHost(whiffle.session(m.instanceId)?.mcp ?? null, server) ??
        mcpServerHost(fleetMcpServers(), server)
    );
  }

  /* A result can be a megabyte of build log. The row shows the head of it and
     says how much it is not showing, rather than handing the virtualizer a row
     the height of a city block. */
  const RESULT_CAP = 20_000;

  interface Field {
    key: string;
    text: string;
  }

  const asText = (value: unknown): string =>
    typeof value === "string"
      ? value
      : (JSON.stringify(value, null, 2) ?? String(value));

  function inputFields(raw: unknown): Field[] {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      return [];
    }
    return Object.entries(raw as Record<string, unknown>).map(
      ([key, value]) => ({
        key,
        text: asText(value),
      })
    );
  }

  function resultText(
    raw: unknown
  ): { text: string; more: number } | undefined {
    if (raw === undefined || raw === null) {
      return undefined;
    }
    const text = asText(raw);
    if (!text.trim()) {
      return undefined;
    }
    return text.length > RESULT_CAP
      ? { text: text.slice(0, RESULT_CAP), more: text.length - RESULT_CAP }
      : { text, more: 0 };
  }

  /* What a settled memory call has to open into: the document it wrote or
     read, or the list it got back. A removal says everything in its sentence. */
  function memoryHasBody(
    input: Record<string, unknown> | undefined,
    raw: unknown
  ): boolean {
    switch (input?.action) {
      case "set":
      case "set_doc":
        return typeof input.content === "string";
      case "get":
        return memoryResult(raw).kind === "doc";
      case "list_docs":
        return memoryResult(raw).kind === "docs";
      default:
        return false;
    }
  }

  /** A skill's arguments are prose the agent wrote for it; absent, nothing opens. */
  const skillArgs = (input: Record<string, unknown> | undefined) =>
    typeof input?.args === "string" && input.args.trim()
      ? input.args
      : undefined;

  function bodyFor(
    kind: ToolDescriptor["expanded"],
    failed: boolean,
    input: Record<string, unknown> | undefined,
    fields: Field[],
    result: { text: string } | undefined,
    raw: unknown
  ): boolean {
    if (kind === "memory") {
      return failed ? !!result : memoryHasBody(input, raw);
    }
    if (kind === "skill" && !failed) {
      return !!skillArgs(input);
    }
    return fields.length > 0 || !!result;
  }

  /* A diff fact is one string carrying two opposite meanings — `+14 −6` from an
     edit, a lone `+38` from a write. The descriptor's own `diff` tone is what
     licenses the coloring, not the shape of the string, so both rows agree on
     what green means: added. Whitespace is kept as its own token so the fact
     reads exactly as the descriptor wrote it. */
  interface FactPart {
    add: boolean;
    del: boolean;
    text: string;
  }

  const ADDED = /^\+\d[\d,._]*$/;
  const REMOVED = /^[−-]\d[\d,._]*$/;
  const WHITESPACE_TOKEN = /(\s+)/;

  const factParts = (fact: string): FactPart[] =>
    fact
      .split(WHITESPACE_TOKEN)
      .filter((token) => token !== "")
      .map((token) => ({
        text: token,
        add: ADDED.test(token),
        del: REMOVED.test(token),
      }));

  /**
   * Metadata belongs to its source, even when another artifact from the same
   * session is the one currently showing.
   */
  function sameSource(
    preview: (typeof whiffle.previews)[string] | undefined,
    wanted: PreviewSource
  ): boolean {
    if (!preview?.source) {
      return false;
    }
    return "port" in wanted
      ? "port" in preview.source && preview.source.port === wanted.port
      : "dir" in preview.source && preview.source.dir === wanted.dir;
  }
</script>

<div class="tools">
  {#each messages as m (m.id ?? m.toolCallId)}
    {@const d = describe(m)}
    {@const Icon = d.icon}
    {@const failed = m.metadata?.toolStatus === 'error'}
    {@const fields = inputFields(m.metadata?.toolInput)}
    {@const result = resultText(m.metadata?.toolResult)}
    {@const toolInput = (m.metadata?.toolInput ?? undefined) as Record<string, unknown> | undefined}
    {@const hasBody = bodyFor(d.expanded, failed, toolInput, fields, result, m.metadata?.toolResult)}
    {#snippet line()}
      <span class="ic" class:err={failed}
        ><Reveal
          >{#if d.favicon && !brokenIcons.has(d.favicon)}
            {@const src = d.favicon}
            <!-- biome-ignore lint/a11y/noNoninteractiveElementInteractions: onerror is an image-load callback — a site with no icon keeps the tool's glyph -->
            <img alt="" class="fav" onerror={() => brokenIcons.add(src)} {src}>
          {:else}
            <Icon />
          {/if}</Reveal
        ></span
      >
      {#if d.label}
        <span class="tk"><Stream text={d.label} /></span>
      {/if}
      <span
        class="arg"
        title={[d.object, d.detail].filter(Boolean).join(' ') || undefined}
      >
        {#if d.object}
          <Stream text={d.object} />
        {/if}
        {#if d.detail}
          <span class="tail"><Stream text=" {d.detail}" /></span>
        {/if}
      </span>
      {#if d.chip}
        <Badge class={chipClass} variant="secondary">{d.chip}</Badge>
      {/if}
      {#if d.fact}
        {#if d.factTone === 'diff'}
          <span class="d"
            >{#each factParts(d.fact) as part, i (i)}
              <span class:add={part.add} class:del={part.del}>{part.text}</span>
            {/each}</span
          >
        {:else}
          <span class="d" class:bad={d.factTone === 'error'}>{d.fact}</span>
        {/if}
      {/if}
    {/snippet}
    {@const land = landing(m)}
    <!-- The call reserves its own space, so a run's rail grows one call at a
         time — which is the storyboard the row-level wrapper used to play once
         for the whole run and never again. -->
    <Arrival
      lead={land.lead}
      opens
      owns={false}
      params={ARRIVAL}
      still={!land.fresh}
    >
      <div class="row" class:err={failed}>
        {#if SHOW_PREVIEW_TOOLS.has(m.metadata?.toolName ?? '')}
          {@const input = m.metadata?.toolInput as PreviewSource}
          {@const current = whiffle.previews[m.instanceId]}
          {@const preview = sameSource(current, input) ? current : undefined}
          {@const opened = preview?.state === 'open'}
          <div class="preview-tool" class:closed={!opened}>
            <button
              aria-label={preview?.title || 'Preview'}
              class="artifact-open"
              onclick={() => opened ? revealPreview(m.instanceId) : openPreview(m.instanceId, input).then(() => revealPreview(m.instanceId)).catch((error) => toast.error(error.message))}
              type="button"
            >
              <span class="mark"><IconWindow /></span>
              <span class="artifact-label"
                ><span>{preview?.title || 'Preview'}</span
                ><span class="artifact-path"
                  >{preview?.path || ('dir' in input ? pathLeaf(input.dir) : '')}</span
                ></span
              >
            </button>
            {#if preview?.thumbnail}
              <div aria-hidden="true" class="artifact-thumb" inert>
                <Shot
                  alt="Preview"
                  size="thumb"
                  src={`data:image/png;base64,${preview.thumbnail}`}
                />
              </div>
            {/if}
          </div>
        {:else if hasBody}
          <Collapsible.Root>
            <Collapsible.Trigger class="trow">
              {@render line()}
              <span class="chev"><IconChevronRight /></span>
            </Collapsible.Trigger>
            <Collapsible.Content reveal>
              {#if d.expanded === 'memory' && !failed}
                <MemoryBody input={toolInput} result={m.metadata?.toolResult} />
              {:else if d.expanded === 'memory' && result}
                <div class="fields">
                  <div class="field">
                    <span class="k">result</span>
                    <pre class="v">{result.text}</pre>
                  </div>
                </div>
              {:else if d.expanded === 'skill' && !failed}
                <div class="skill-args">
                  <ToolProse source={skillArgs(toolInput) ?? ''} />
                </div>
              {:else}
                <div class="fields">
                  {#each fields as f (f.key)}
                    <div class="field">
                      <span class="k">{f.key}</span>
                      <pre class="v">{f.text}</pre>
                    </div>
                  {/each}
                  {#if result}
                    <div class="field">
                      <span class="k">result</span>
                      <pre class="v">{result.text}</pre>
                      {#if result.more}
                        <span class="more"
                          >… {result.more.toLocaleString()} more chars</span
                        >
                      {/if}
                    </div>
                  {/if}
                </div>
              {/if}
            </Collapsible.Content>
          </Collapsible.Root>
        {:else}
          <div class="trow flat">{@render line()}</div>
        {/if}
        {#if SHOW_IMAGE_TOOLS.has(m.metadata?.toolName ?? '') && machine}
          {@const input = m.metadata?.toolInput as { path: string; caption?: string }}
          <div class="shots">
            <Shot
              alt={input.caption ?? pathLeaf(input.path)}
              caption={input.caption}
              path={input.path}
              size="card"
              src={`/api/agents/${encodeURIComponent(machine())}/image?path=${encodeURIComponent(input.path)}`}
            />
          </div>
        {/if}
        {#if m.metadata?.resultImages?.length}
          <div class="shots">
            {#each m.metadata.resultImages as image, i (i)}
              <Shot
                alt="Image {i + 1} from {m.metadata.toolName}"
                size="card"
                src={image.src}
              />
            {/each}
          </div>
        {/if}
      </div>
    </Arrival>
  {/each}
</div>

<style>
  .preview-tool {
    position: relative;
    display: flex;
    align-items: center;
    gap: var(--space-2);
    max-width: 440px;
    min-height: 80px;
    padding: var(--space-2);
    margin: var(--space-2) 0;
    border: 1px solid var(--border-hairline);
    border-radius: var(--radius-md);
    background: var(--surface-raised);
    box-shadow: var(--shadow-tile);
  }
  .preview-tool.closed {
    opacity: 0.5;
  }
  .preview-tool:not(:has(.artifact-thumb)) {
    width: fit-content;
  }
  .artifact-open {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    flex: 1;
    min-width: 0;
    border: 0;
    padding: var(--space-2);
    background: transparent;
    color: var(--ink-strong);
    font-size: var(--text-label);
    text-align: left;
    cursor: pointer;
  }
  .artifact-open::after {
    content: "";
    position: absolute;
    inset: 0;
    border-radius: var(--radius-md);
  }
  .artifact-open:focus-visible {
    outline: none;
  }
  .artifact-open:focus-visible::after {
    outline: 2px solid var(--focus-ring);
    outline-offset: 2px;
  }
  .artifact-label {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .artifact-label > span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .artifact-path {
    color: var(--ink-muted);
    font: var(--text-meta) var(--font-mono);
  }
  .mark {
    width: 17px;
    height: 17px;
    flex-shrink: 0;
    display: grid;
    place-items: center;
    border-radius: var(--radius-xs);
    background: var(--mark-overlay), var(--mark-6);
    color: var(--mark-glyph);
  }
  .mark :global(svg) {
    width: 13px;
    height: 13px;
  }
  .artifact-thumb {
    width: 90px;
    height: 64px;
    flex-shrink: 0;
    overflow: hidden;
    border: 1px solid var(--border-hairline);
    border-radius: var(--radius-sm);
    background: var(--surface-recess);
  }
  .artifact-thumb :global(.box) {
    height: 64px;
    min-height: 0;
  }
  .artifact-thumb :global(img) {
    width: 100%;
    height: 64px;
    object-fit: cover;
    object-position: top;
  }
  @media (hover: hover) {
    .preview-tool:has(.artifact-open:hover) {
      background: var(--surface-hover);
    }
  }
  @media (pointer: coarse) {
    .preview-tool button {
      min-height: 44px;
    }
  }
  .shots {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    margin-left: calc(15px + var(--space-2));
    margin-top: var(--space-2);
  }
  .shots > :global(*) {
    flex: 1 1 240px;
    min-width: 0;
    max-width: 100%;
  }
  .tools {
    margin: var(--rail-gap, var(--space-4)) 0 0 var(--space-2);
    padding-left: var(--space-3);
    background: var(--rail-head, var(--rail)) left top / 2px 100% no-repeat;
  }
  /* The row's shape is shared by the plain <div> and the Collapsible trigger
     (a <button>, so it needs its chrome stripped back to the ledger's). */
  .trow,
  .row :global(.trow) {
    width: 100%;
    min-height: 26px;
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-family: inherit;
    font-size: var(--text-label);
    color: var(--ink-strong);
    background: none;
    border: 0;
    padding: 0;
    margin: 0;
    text-align: left;
  }
  .row :global(button.trow) {
    cursor: pointer;
  }
  .row :global(.trow:focus-visible) {
    outline: 2px solid var(--focus-ring);
    outline-offset: 2px;
    border-radius: var(--radius-xs);
  }
  .ic {
    width: 15px;
    height: 15px;
    flex: 0 0 auto;
    display: grid;
    place-items: center;
    color: var(--ink-muted);
  }
  .ic :global(svg) {
    width: 15px;
    height: 15px;
    display: block;
  }
  .fav {
    width: 14px;
    height: 14px;
    display: block;
    border-radius: 3px;
  }
  /* A failed call carries its state on the glyph — the completed row's done/failed
     cue, next to the running row's breathing glyph in the live tool. */
  .ic.err {
    color: var(--data-bad);
  }
  .tk {
    font-weight: var(--weight-strong);
    color: var(--ink-strong);
    font-size: var(--text-label);
    flex: 0 0 auto;
  }
  .arg {
    font-family: var(--font-mono);
    color: var(--ink-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
    flex: 1 1 auto;
  }
  .tail {
    color: var(--ink-muted);
    opacity: 0.7;
  }
  .row :global([data-slot="badge"]) {
    flex: 0 0 auto;
  }
  /* A fact is a measurement, not a verdict: it reads in --ink-strong, the ink
     that gives a number presence without passing judgement on it. Green is
     reserved for the added side of a `diff` fact — the one measurement that
     carries a direction — and every diff row agrees on that reading, whether
     it came back as `+38 −2` or a lone `+38`. */
  .d {
    color: var(--ink-strong);
    font-variant-numeric: tabular-nums;
    flex: 0 0 auto;
  }
  .d.bad {
    color: var(--data-bad);
  }
  .add {
    color: var(--data-ok);
  }
  .del {
    color: var(--data-bad);
  }
  /* The affordance sits at the tail so the row's left anatomy is unchanged. */
  .chev {
    flex: 0 0 auto;
    display: grid;
    place-items: center;
    color: var(--ink-muted);
    @media (prefers-reduced-motion: no-preference) {
      transition: transform var(--dur-control) var(--ease-out);
    }
  }
  .chev :global(svg) {
    width: 14px;
    height: 14px;
    display: block;
  }
  .row :global(.trow[data-state="open"] .chev) {
    transform: rotate(90deg);
  }

  /* The disclosed payload — same anatomy as Prompt.svelte's "What this touches",
     indented past the glyph so it hangs under the row's text, not its icon. */
  .fields {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    margin: var(--space-2) 0 var(--space-3) calc(15px + var(--space-2));
    padding: var(--space-3);
    border-radius: var(--radius-sm);
    background: var(--surface-recess);
  }
  /* A skill's arguments are the agent's own words to it: prose at the fields'
     left edge, with no well around them. */
  .skill-args {
    margin: var(--space-1) 0 var(--space-3) calc(15px + var(--space-2));
    max-width: 70ch;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    min-width: 0;
  }
  .field .k {
    font-size: var(--text-meta);
    font-weight: var(--weight-medium);
    color: var(--ink-muted);
  }
  .field .v {
    margin: 0;
    max-height: 300px;
    overflow: auto;
    font-family: var(--font-mono);
    font-size: var(--text-label);
    line-height: var(--leading-body);
    color: var(--ink-strong);
    white-space: pre-wrap;
    word-break: break-word;
  }
  .field .more {
    font-size: var(--text-meta);
    color: var(--ink-muted);
  }
  @media (max-width: 900px) {
    .tools {
      margin-left: 0;
    }
  }
  @media (pointer: coarse) {
    .trow,
    .row :global(.trow) {
      min-height: 44px;
    }
  }
</style>
