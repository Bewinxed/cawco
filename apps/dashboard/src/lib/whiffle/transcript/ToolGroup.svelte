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
  import PendingContent, {
    whileIdle,
  } from "$lib/components/ui/button/pending-content.svelte";
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
  import { dur, easeOut, motionOk } from "$lib/whiffle/motion/curves.svelte";
  import { previewSourceKey } from "$lib/whiffle/preview/source";
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
  import { useLedger } from "./arrivals.svelte";
  import { disclosure } from "./disclosure.svelte";
  import TranscriptRow from "./Row.svelte";
  import Shot from "./Shot.svelte";

  const machine = getContext<(() => string) | undefined>("whiffle:machine");

  let { messages }: { messages: Message[] } = $props();

  /**
   * Each call arrives on its own line. A run of calls is one row, created
   * when the first of them lands, so the row cannot be what arrives — every
   * later call would be appended into something that had already arrived.
   * The CALL is the unit: the transcript's ledger decides each one (by this
   * id), and the call's own row plays it. The surfaces that nest tool rows —
   * a subagent's branch, a delegate's report — are not in the ledger, and
   * nothing in them arrives.
   */
  const callId = (m: Message): string => `call:${m.id ?? m.toolCallId}`;

  const ledger = useLedger();
  /** Only a change the reader is watching is shown moving. */
  const moving = (): boolean => motionOk.current && !!ledger?.watched;

  /**
   * A call's status changing is a crossfade on its glyph: the outgoing glyph
   * fades while the new one fades up out of a slight shrink, both on one
   * cell, over --dur-control. Svelte plays these only when the status
   * changes under a mounted row — never on a row's first render.
   */
  function glyphIn(_node: Element) {
    if (!moving()) {
      return { duration: 0 };
    }
    return {
      duration: dur("--dur-control"),
      easing: easeOut,
      css: (t: number) => `opacity: ${t}; scale: ${0.8 + 0.2 * t}`,
    };
  }
  function glyphOut(_node: Element) {
    if (!moving()) {
      return { duration: 0 };
    }
    return {
      duration: dur("--dur-control"),
      easing: easeOut,
      css: (t: number) => `opacity: ${t}`,
    };
  }
  /**
   * A favicon that fails to load gives way to the tool's glyph, the two
   * cross-fading in one cell over --dur-control. Opacity only, so it runs
   * with reduced motion as well; never on a row's first render.
   */
  function iconSwap(_node: Element) {
    return {
      duration: dur("--dur-control"),
      easing: easeOut,
      css: (t: number) => `opacity: ${t}`,
    };
  }
  /** What a call measured out, arriving with its result. */
  function factIn(_node: Element) {
    if (!moving()) {
      return { duration: 0 };
    }
    return {
      duration: dur("--dur-menu"),
      easing: easeOut,
      css: (t: number) => `opacity: ${t}`,
    };
  }

  /** shadcn Badge, dressed on the DESIGN.md scale rather than the stock ladder. */
  const chipClass =
    "h-auto rounded-[var(--radius-xs)] border-transparent bg-[var(--surface-recess)] " +
    "px-[var(--space-2)] py-px text-[length:var(--text-meta)] font-[var(--weight-body)] " +
    "!text-[color:var(--ink-muted)]";

  const asString = (value: unknown): string | undefined =>
    typeof value === "string" ? value : undefined;

  /** Favicons that failed to load; their rows keep the tool's glyph. */
  const brokenIcons = new SvelteSet<string>();
  /** Preview calls whose open request is out, and those whose last one failed. */
  const opening = new SvelteSet<string>();
  const openFailed = new SvelteSet<string>();

  async function openArtifact(m: Message, input: PreviewSource) {
    const key = callId(m);
    opening.add(key);
    openFailed.delete(key);
    try {
      await openPreview(m.instanceId, input);
      revealPreview(m.instanceId);
    } catch (error) {
      openFailed.add(key);
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      opening.delete(key);
    }
  }

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
      <span class="ic">
        {#key m.metadata?.toolStatus}
          <span class="glyph" class:err={failed} in:glyphIn out:glyphOut
            >{#if d.favicon && !brokenIcons.has(d.favicon)}
              {@const src = d.favicon}
              <!-- biome-ignore lint/a11y/noNoninteractiveElementInteractions: onerror is an image-load callback — a site with no icon keeps the tool's glyph -->
              <img
                alt=""
                class="fav"
                onerror={() => brokenIcons.add(src)}
                {src}
                in:iconSwap
                out:iconSwap
              >
            {:else}
              <span class="tool-glyph" in:iconSwap out:iconSwap><Icon /></span>
            {/if}</span
          >
        {/key}
      </span>
      {#if d.label}
        <span class="tk">{d.label}</span>
      {/if}
      <span
        class="arg"
        title={[d.object, d.detail].filter(Boolean).join(' ') || undefined}
      >
        {#if d.object}
          {d.object}
        {/if}
        {#if d.detail}
          <span class="tail">{` ${d.detail}`}</span>
        {/if}
      </span>
      {#if d.chip}
        <Badge class={chipClass} variant="secondary">{d.chip}</Badge>
      {/if}
      <!-- One chain, so a fact arriving with its result fades in (Svelte plays
           a local intro only when a block that already ran switches). -->
      {#if d.fact && d.factTone === 'diff'}
        <span class="d" in:factIn
          >{#each factParts(d.fact) as part, i (i)}
            <span class:add={part.add} class:del={part.del}>{part.text}</span>
          {/each}</span
        >
      {:else if d.fact}
        <span class="d" class:bad={d.factTone === 'error'} in:factIn
          >{d.fact}</span
        >
      {/if}
    {/snippet}
    <!-- The call opens its own line, so a run's rail grows one call at a time. -->
    <TranscriptRow id={callId(m)} motion="open">
      {#snippet children()}
        <div class="row" class:err={failed}>
          {#if SHOW_PREVIEW_TOOLS.has(m.metadata?.toolName ?? '')}
            {@const input = m.metadata?.toolInput as PreviewSource}
            {@const current = whiffle.previews[m.instanceId]}
            {@const preview = sameSource(current, input) ? current : undefined}
            {@const opened = preview?.state === 'open'}
            {@const busy = opening.has(callId(m))}
            <!-- The row is what travels: pressing its button departs it
                 (motion/share's click capture), and the preview pane or
                 sheet opens out of its box under `preview:<session>` —
                 first open or repeat, thumbnail or not. Closing, the pane
                 shrinks back into this row (PreviewPane.svelte). -->
            <div
              class="preview-tool"
              data-preview-source={previewSourceKey(input)}
              data-share="preview:{m.instanceId}"
              data-share-ttl="10000"
              class:closed={!opened}
            >
              <button
                aria-busy={busy || undefined}
                aria-disabled={busy || undefined}
                aria-label={preview?.title || 'Preview'}
                class="artifact-open"
                onclick={whileIdle(() => busy, () => { if (opened) { revealPreview(m.instanceId); } else { openArtifact(m, input); } })}
                type="button"
              >
                <span class="mark"><IconWindow /></span>
                <span class="artifact-label"
                  ><span class="artifact-title"
                    ><PendingContent
                      failed={openFailed.has(callId(m))}
                      label={preview?.title || 'Preview'}
                      pending={busy}
                      pendingLabel="Opening…"
                    /></span
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
            {@const disclosed = disclosure(m)}
            <Collapsible.Root bind:open={disclosed.get, disclosed.set}>
              <Collapsible.Trigger class="trow press-tint">
                {@render line()}
                <span class="chev"><IconChevronRight /></span>
              </Collapsible.Trigger>
              <Collapsible.Content reveal>
                {#if d.expanded === 'memory' && !failed}
                  <MemoryBody
                    input={toolInput}
                    result={m.metadata?.toolResult}
                  />
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
            <div class="shots" data-gallery>
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
      {/snippet}
    </TranscriptRow>
  {/each}
</div>

<style>
  .preview-tool {
    position: relative;
    display: flex;
    align-items: center;
    gap: var(--space-2);
    max-inline-size: 440px;
    min-block-size: 80px;
    padding: var(--space-2);
    margin-block: var(--space-2);
    border: 1px solid var(--border-hairline);
    border-radius: var(--radius-md);
    background: var(--surface-raised);
    box-shadow: var(--shadow-tile);

    &.closed {
      opacity: 0.5;
    }
    &:not(:has(.artifact-thumb)) {
      inline-size: fit-content;
    }
    @media (hover: hover) {
      &:has(.artifact-open:hover) {
        background: var(--surface-hover);
      }
    }
    @media (pointer: coarse) {
      & button {
        min-block-size: 44px;
      }
    }
  }
  .artifact-open {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    flex: 1;
    min-inline-size: 0;
    border: 0;
    padding: var(--space-2);
    background: transparent;
    color: var(--ink-strong);
    font-size: var(--text-label);
    font-weight: var(--weight-strong);
    text-align: start;
    cursor: pointer;

    &::after {
      content: "";
      position: absolute;
      inset: 0;
      border-radius: var(--radius-md);
    }
    /* The button is the whole card (its ::after), so the card is what
       focus lights: the card's own border takes the ring, as a field
       frame's does (app.css field-shell), and the button draws nothing. */
    &:focus-visible {
      outline: none;
    }
  }
  .preview-tool:has(> .artifact-open:focus-visible) {
    outline: var(--focus-ring-width) solid var(--focus-ring);
    outline-offset: var(--focus-ring-inset);
  }
  .artifact-label {
    display: flex;
    flex-direction: column;
    min-inline-size: 0;

    & > span {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }
  .artifact-title {
    display: flex;
    align-items: center;
    gap: var(--btn-gap);
    --btn-gap: var(--space-1);
    --btn-icon: 12px;
  }
  .artifact-path {
    color: var(--ink-muted);
    font: var(--text-meta) var(--font-mono);
  }
  .mark {
    inline-size: 17px;
    block-size: 17px;
    flex-shrink: 0;
    display: grid;
    place-items: center;
    border-radius: var(--radius-xs);
    background: var(--mark-overlay), var(--mark-6);
    color: var(--mark-glyph);

    & :global(svg) {
      inline-size: 12px;
      block-size: 12px;
    }
  }
  .artifact-thumb {
    inline-size: 90px;
    block-size: 64px;
    flex-shrink: 0;
    overflow: hidden;
    border: 1px solid var(--border-hairline);
    border-radius: var(--radius-sm);
    background: var(--surface-recess);

    & :global(.box) {
      block-size: 64px;
      min-block-size: 0;
    }
    & :global(img) {
      inline-size: 100%;
      block-size: 64px;
      object-fit: cover;
      object-position: top;
    }
  }
  .shots {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    margin-inline-start: calc(15px + var(--space-2));
    margin-block-start: var(--space-2);

    & > :global(*) {
      flex: 1 1 240px;
      min-inline-size: 0;
      max-inline-size: 100%;
    }
  }
  .tools {
    margin-block-start: var(--rail-gap, var(--space-4));
    margin-inline-start: var(--space-2);
    padding-inline-start: var(--space-3);
    background: var(--rail-head, var(--rail)) left top / 2px 100% no-repeat;

    @media (width <= 900px) {
      margin-inline-start: 0;
    }
  }
  /* The row's shape is shared by the plain <div> and the Collapsible trigger
     (a <button>, so it needs its chrome stripped back to the ledger's). */
  .trow,
  .row :global(.trow) {
    inline-size: 100%;
    min-block-size: 26px;
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-family: inherit;
    font-size: var(--text-label);
    font-weight: var(--weight-strong);
    color: var(--ink-strong);
    background: none;
    border: 0;
    border-radius: var(--radius-xs);
    padding: 0;
    margin: 0;
    text-align: start;

    @media (pointer: coarse) {
      min-block-size: 44px;
    }
  }
  .row {
    & :global(button.trow) {
      cursor: pointer;
    }
    & :global([data-slot="badge"]) {
      flex: 0 0 auto;
    }
    & :global(.trow[data-state="open"] .chev) {
      transform: rotate(90deg);
    }
  }
  /* The glyph sits in one cell, so a status change can cross-fade two of
     them on the same spot. */
  .ic {
    inline-size: 16px;
    block-size: 16px;
    flex: 0 0 auto;
    display: grid;
    place-items: center;
  }
  .glyph {
    grid-area: 1 / 1;
    display: grid;
    place-items: center;
    color: var(--ink-muted);

    /* A favicon and the glyph it gives way to share the cell. */
    & > * {
      grid-area: 1 / 1;
    }

    & :global(svg) {
      inline-size: 16px;
      block-size: 16px;
      display: block;
    }
    /* A failed call carries its state on the glyph — the completed row's
       done/failed cue, next to the running row's breathing glyph in the live
       tool. */
    &.err {
      color: var(--data-bad);
    }
  }
  .fav {
    inline-size: 14px;
    block-size: 14px;
    display: block;
    border-radius: var(--radius-xs);
  }
  .tool-glyph {
    display: grid;
    place-items: center;
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
    min-inline-size: 0;
    flex: 1 1 auto;
  }
  .tail {
    color: var(--ink-muted);
    opacity: 0.7;
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

    &.bad {
      color: var(--data-bad);
    }
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
    & :global(svg) {
      inline-size: 16px;
      block-size: 16px;
      display: block;
    }
  }

  /* The disclosed payload — same anatomy as Prompt.svelte's "What this touches",
     indented past the glyph so it hangs under the row's text, not its icon. */
  .fields {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    margin-block: var(--space-2) var(--space-3);
    margin-inline-start: calc(15px + var(--space-2));
    padding: var(--space-3);
    border-radius: var(--radius-sm);
    background: var(--surface-recess);
  }
  /* A skill's arguments are the agent's own words to it: prose at the fields'
     inline-start edge, with no well around them. */
  .skill-args {
    margin-block: var(--space-1) var(--space-3);
    margin-inline-start: calc(15px + var(--space-2));
    max-inline-size: 70ch;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    min-inline-size: 0;

    & .k {
      font-size: var(--text-label);
      font-weight: var(--weight-strong);
      color: var(--ink-muted);
    }
    & .v {
      margin: 0;
      max-block-size: 300px;
      overflow: auto;
      font-family: var(--font-mono);
      font-size: var(--text-label);
      line-height: var(--leading-body);
      color: var(--ink-strong);
      white-space: pre-wrap;
      word-break: break-word;
    }
    & .more {
      font-size: var(--text-meta);
      font-weight: var(--weight-body);
      color: var(--ink-muted);
    }
  }
</style>
