<script lang="ts">
  import {
    hasBody as bodyFor,
    inputFields,
    PROSE_FIELD,
    pathLeaf,
    refusalOf,
    resultField,
  } from "@cawco/core/tool-presentation";
  import { getContext, untrack } from "svelte";
  import { SvelteSet } from "svelte/reactivity";
  import {
    cawco,
    openPreview,
    revealPreview,
  } from "#lib/cawco/client.svelte.js";
  import { fleetMcpServers } from "#lib/cawco/fleet-mcp.svelte.js";
  import { mcpServerHost } from "#lib/cawco/mcp.js";
  import { dur, easeOut, motionOk } from "#lib/cawco/motion/curves.svelte.js";
  import {
    type PreviewAsk,
    previewPlace,
    previewSourceKey,
    reopenAsk,
  } from "#lib/cawco/preview/source.js";
  import { toast } from "#lib/cawco/toasts.js";
  import DiffView from "#lib/components/features/DiffView.svelte";
  import {
    describeTool,
    getDiffInfo,
    type ToolCallStatus,
    type ToolDescriptor,
  } from "#lib/components/features/tool-cards/descriptors.js";
  import MemoryBody from "#lib/components/features/tool-cards/MemoryBody.svelte";
  import ToolProse from "#lib/components/features/tool-cards/ToolProse.svelte";
  import { Badge } from "#lib/components/ui/badge/index.js";
  import PendingContent, {
    whileIdle,
  } from "#lib/components/ui/button/pending-content.svelte";
  import CollapsibleLazy from "#lib/components/ui/collapsible/collapsible-lazy.svelte";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for a component group.
  import * as Collapsible from "#lib/components/ui/collapsible/index.js";
  import { IconChevronRight, IconWindow } from "#lib/icons.js";
  /**
   * A run of tool calls as rail-led rows — never a nested card. The rail is a
   * 2px stripe; each row is a glyph, the verb, a mono argument, and whatever the
   * call measured out (`+14 −6`, `3 files`). Ported from the mock's `.tools` /
   * `.trow`.
   *
   * A one-line summary is not a record of what a tool did: the input it ran on
   * and the result it came back with live in the message metadata and were,
   * until now, unreachable. Every row that carries either opens — same anatomy
   * as Prompt.svelte's permission fields, so the two surfaces read as one
   * idea.
   */
  import type { Message } from "../types";
  import { useLedger } from "./arrivals.svelte";
  import { disclosure } from "./disclosure.svelte";
  import TranscriptRow from "./Row.svelte";
  import Shot from "./Shot.svelte";

  const machine = getContext<(() => string) | undefined>("cawco:machine");

  /** A picture or video on the session's machine, read through the hub when looked at. */
  const machineMedia = (machineId: string, path: string): string =>
    `/api/agents/${encodeURIComponent(machineId)}/image?path=${encodeURIComponent(path)}`;

  /** The clips the machine's file reader serves (agent fs.ts `MEDIA_TYPES`). */
  const VIDEO_FILE = /\.(mp4|mov|webm)$/i;
  const isVideo = (path: string): boolean => VIDEO_FILE.test(path);

  /** `send_to_user` under any harness's naming of it (`mcp__cawco__…`, `cawco_…`). */
  const SEND_TO_USER = /(^|_)send_to_user$/;

  /** What a `send_to_user` call attached, shown under its row as the owner got it. */
  const sentAttachments = (m: Message): string[] => {
    const name = (m.metadata?.toolName ?? "").toLowerCase();
    if (!SEND_TO_USER.test(name)) {
      return [];
    }
    const attached = (m.metadata?.toolInput as { attachments?: unknown })
      ?.attachments;
    return Array.isArray(attached)
      ? attached.filter((path): path is string => typeof path === "string")
      : [];
  };

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

  /**
   * The calls in this run whose body has been opened. A call never opened
   * mounts no Content at all: a scroll mounts tool rows by the dozen, and
   * each closed Content still built its disclosure state, asked for a frame
   * and measured itself. Opened once, it stays, so a fold shut plays and a
   * reopen turns back from where it is.
   */
  const opened = new SvelteSet<string>(
    untrack(() => messages.filter((m) => disclosure(m).get()).map(callId))
  );
  /** The ones already open when the row was built: drawn open, not grown. */
  const openAtMount = new Set(opened);
  $effect(() => {
    for (const m of messages) {
      if (disclosure(m).get()) {
        untrack(() => opened.add(callId(m)));
      }
    }
  });

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

  async function openArtifact(m: Message, input: PreviewAsk) {
    const key = callId(m);
    opening.add(key);
    openFailed.delete(key);
    try {
      await openPreview(m.instanceId, reopenAsk(input));
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
      (meta.toolStatus ?? "pending") as ToolCallStatus,
      (server) =>
        mcpServerHost(cawco.session(m.instanceId)?.mcp ?? null, server) ??
        mcpServerHost(fleetMcpServers(), server),
      meta.toolDiff
    );
  }

  /* What a body shows, and whether a call has one, are the shared rules
     (@cawco/core tool-presentation): a result capped with its "more" count,
     a refusal with its harness's tags off, each renderer's has-body rule. */

  /** The input field a prose body sets (a skill's arguments), as written. */
  const proseOf = (input: Record<string, unknown> | undefined): string =>
    typeof input?.[PROSE_FIELD] === "string"
      ? (input[PROSE_FIELD] as string)
      : "";

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
    preview: (typeof cawco.previews)[string] | undefined,
    wanted: PreviewAsk
  ): boolean {
    return (
      !!preview?.source &&
      previewSourceKey(preview.source) === previewSourceKey(wanted)
    );
  }
</script>

<div class="tools rail-row">
  {#each messages as m (m.id ?? m.toolCallId)}
    {@const d = describe(m)}
    {@const Icon = d.icon}
    {@const failed = m.metadata?.toolStatus === "error"}
    {@const fields = inputFields(m.metadata?.toolInput)}
    {@const result = resultField(m.metadata?.toolResult)}
    {@const toolInput = (m.metadata?.toolInput ?? undefined) as
      | Record<string, unknown>
      | undefined}
    {@const changes =
      d.expanded === "diff"
        ? getDiffInfo(toolInput, m.metadata?.toolName, m.metadata?.toolDiff)
        : []}
    {@const refusal =
      d.expanded === "diff" && failed ? refusalOf(result) : undefined}
    {@const hasBody = bodyFor(
      d.expanded,
      failed,
      toolInput,
      m.metadata?.toolResult,
      m.metadata?.toolName,
      m.metadata?.toolDiff
    )}
    {#snippet line()}
      <span class="ic rail-cell">
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
        title={[d.object, d.detail].filter(Boolean).join(" ") || undefined}
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
      {#if d.fact && d.factTone === "diff"}
        <span class="d" in:factIn
          >{#each factParts(d.fact) as part, i (i)}
            <span class:add={part.add} class:del={part.del}>{part.text}</span>
          {/each}</span
        >
      {:else if d.fact}
        <span class="d" in:factIn>{d.fact}</span>
      {/if}
    {/snippet}
    <!-- The call opens its own line, so a run's rail grows one call at a time. -->
    <TranscriptRow id={callId(m)}>
      {#snippet children()}
        <div class="row" class:err={failed}>
          {#if d.expanded === "preview"}
            {@const input = m.metadata?.toolInput as PreviewAsk}
            {@const current = cawco.previews[m.instanceId]}
            {@const preview = sameSource(current, input) ? current : undefined}
            {@const opened = preview?.state === "open"}
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
                aria-label={preview?.title || "Preview"}
                class="artifact-open"
                onclick={whileIdle(
                  () => busy,
                  () => {
                    if (opened) {
                      revealPreview(m.instanceId);
                    } else {
                      openArtifact(m, input);
                    }
                  }
                )}
                type="button"
              >
                <span class="mark"><IconWindow /></span>
                <span class="artifact-label"
                  ><span class="artifact-title"
                    ><PendingContent
                      failed={openFailed.has(callId(m))}
                      label={preview?.title || "Preview"}
                      pending={busy}
                      pendingLabel="Opening…"
                    /></span
                  ><span class="artifact-path"
                    >{preview?.path || previewPlace(input)}</span
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
              <Collapsible.Trigger class="trow rail-line press-tint">
                {@render line()}
                <span class="chev"><IconChevronRight /></span>
              </Collapsible.Trigger>
              {#if disclosed.get() || opened.has(callId(m))}
                <Collapsible.Content
                  entering={!openAtMount.has(callId(m))}
                  reveal
                >
                  <!-- The body exists only while the call is open (and folding
                     shut): bits-ui keeps a closed Content's children mounted,
                     so every tool row the list mounted built its diff, its
                     highlighting and its fields for a body nobody opened. -->
                  <CollapsibleLazy count={1} open={disclosed.get()}>
                    {#if d.expanded === "diff"}
                      <!-- What the call changed, as the file's own diff: one per
                       replacement a multi-edit made. A failed call is the diff
                       it attempted, under the harness's reason. -->
                      <div class="diffs">
                        {#if refusal}
                          <p class="refusal">{refusal}</p>
                        {/if}
                        {#each changes as change, i (i)}
                          <DiffView
                            fileDiff={change.fileDiff}
                            filePath={change.filePath}
                            newContent={change.newContent}
                            oldContent={change.oldContent}
                          />
                        {/each}
                      </div>
                    {:else if d.expanded === "memory" && !failed}
                      <MemoryBody
                        at={m.timestamp}
                        input={toolInput}
                        result={m.metadata?.toolResult}
                      />
                    {:else if d.expanded === "memory" && result}
                      <div class="fields">
                        <div class="field">
                          <span class="k">result</span>
                          <pre class="v">{result.text}</pre>
                        </div>
                      </div>
                    {:else if d.expanded === "prose" && !failed}
                      <div class="skill-args">
                        <ToolProse source={proseOf(toolInput)} />
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
                                >… {result.more.toLocaleString()} more
                                chars</span
                              >
                            {/if}
                          </div>
                        {/if}
                      </div>
                    {/if}
                  </CollapsibleLazy>
                </Collapsible.Content>
              {/if}
            </Collapsible.Root>
          {:else}
            <div class="trow rail-line flat">{@render line()}</div>
          {/if}
          {#if d.expanded === "image" && machine}
            {@const input = m.metadata?.toolInput as {
              path: string;
              caption?: string;
            }}
            <div class="shots">
              <Shot
                alt={input.caption ?? pathLeaf(input.path)}
                caption={input.caption}
                path={input.path}
                size="card"
                src={machineMedia(machine(), input.path)}
                video={isVideo(input.path)}
              />
            </div>
          {/if}
          {#if machine && sentAttachments(m).length}
            <div class="shots" data-gallery>
              {#each sentAttachments(m) as path (path)}
                <Shot
                  alt={pathLeaf(path)}
                  {path}
                  size="card"
                  src={machineMedia(machine(), path)}
                  video={isVideo(path)}
                />
              {/each}
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
    margin-inline-start: var(--x-hang);
    margin-block-start: var(--space-2);

    & > :global(*) {
      flex: 1 1 240px;
      min-inline-size: 0;
      max-inline-size: 100%;
    }
  }
  /* The row's shape is shared by the plain <div> and the Collapsible trigger
     (a <button>, so it needs its chrome stripped back to the ledger's). Its
     inline geometry is the rail line's (app.css `.rail-line`). */
  .trow,
  .row :global(.trow) {
    inline-size: 100%;
    min-block-size: 26px;
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
  /* The glyph sits in the one rail cell, so a status change can cross-fade
     two of them on the same spot. */
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
  /* The verb gives way before the row does: on a phone the argument, the
     fact and the chevron stay inside the row. */
  .tk {
    font-weight: var(--weight-strong);
    color: var(--ink-strong);
    font-size: var(--text-label);
    flex: 0 1 auto;
    min-inline-size: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
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

  /* The disclosed payload — same anatomy as Prompt.svelte's permission fields.
     Its words hang at the row's text column; the well reaches out past them
     by its own padding. */
  .fields {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    margin-block: var(--space-2) var(--space-3);
    margin-inline-start: calc(var(--x-hang) - var(--space-3));
    padding: var(--space-3);
    border-radius: var(--radius-sm);
    background: var(--surface-recess);
  }
  /* A skill's arguments are the agent's own words to it: prose at the text
     column, with no well around them. */
  .skill-args {
    margin-block: var(--space-1) var(--space-3);
    margin-inline-start: var(--x-hang);
    max-inline-size: 70ch;
  }
  /* An edit's diffs: the file path in each header reads at the text column,
     the diff's frame reaching out past it by its 1px border and its header's
     12px inset (DiffView's `px-3`). */
  .diffs {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    margin-block: var(--space-2) var(--space-3);
    margin-inline-start: calc(var(--x-hang) - 13px);
  }
  .refusal {
    margin: 0;
    margin-inline-start: 13px;
    font-size: var(--text-label);
    color: var(--data-bad);
    overflow-wrap: anywhere;
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
