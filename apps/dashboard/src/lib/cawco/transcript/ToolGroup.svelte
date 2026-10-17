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
  import { SvelteMap, SvelteSet } from "svelte/reactivity";
  import { showArtifact } from "#lib/cawco/artifact-api.js";
  import { cawco, revealPreview } from "#lib/cawco/client.svelte.js";
  import { fleetMcpServers } from "#lib/cawco/fleet-mcp.svelte.js";
  import { failureWords } from "#lib/cawco/hub-read.js";
  import { mcpServerHost } from "#lib/cawco/mcp.js";
  import { dur, easeOut, motionOk } from "#lib/cawco/motion/curves.svelte.js";
  import {
    type CalledArtifact,
    calledArtifact,
    previewPlace,
  } from "#lib/cawco/preview/source.js";
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
    `/api/agents/${encodeURIComponent(machineId)}/media?path=${encodeURIComponent(path)}`;

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

  /** This run's own prefix for the ids its calls' bodies go by. */
  const uid = $props.id();

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

  const asString = (value: unknown): string | undefined =>
    typeof value === "string" ? value : undefined;

  /** Favicons that failed to load; their rows keep the tool's glyph. */
  const brokenIcons = new SvelteSet<string>();
  /** Preview calls whose open request is out, and why the last one failed, said under its row. */
  const opening = new SvelteSet<string>();
  const openFailed = new SvelteMap<string, string>();

  async function openArtifact(m: Message, artifact: CalledArtifact) {
    const key = callId(m);
    opening.add(key);
    openFailed.delete(key);
    try {
      await showArtifact(m.instanceId, artifact.id);
      revealPreview(m.instanceId);
    } catch (error) {
      openFailed.set(key, failureWords(error));
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
   * Metadata belongs to its artifact, even when another artifact from the
   * same session is the one currently showing.
   */
  function sameArtifact(
    preview: (typeof cawco.previews)[string] | undefined,
    wanted: CalledArtifact | undefined
  ): boolean {
    return !!wanted && preview?.artifact?.id === wanted.id;
  }
</script>

<div data-slot="tools" data-tool-group-rail-row class="rail-row">
  {#each messages as m (m.id ?? m.toolCallId)}
    {@const d = describe(m)}
    {@const Icon = d.icon}
    {@const failed = m.metadata?.toolStatus === "error"}
    {@const fields = inputFields(m.metadata?.toolInput)}
    {@const result = resultField(m.metadata?.toolResult)}
    {@const toolInput = (m.metadata?.toolInput ?? undefined) as
      Record<string, unknown> | undefined}
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
      <span data-slot="rail-cell" class="rail-cell">
        {#key m.metadata?.toolStatus}
          <!-- The glyph sits in the one rail cell, so a status change can
               cross-fade two of them on the same spot; a favicon and the
               glyph it gives way to share the cell. A failed call carries
               its state on the glyph — the completed row's done/failed cue,
               next to the running row's breathing glyph in the live tool. -->
          <span
            data-slot="glyph"
            class="col-start-1 row-start-1 grid place-items-center text-ink-muted data-err:text-data-bad"
            data-err={failed || undefined}
            in:glyphIn
            out:glyphOut
            >{#if d.favicon && !brokenIcons.has(d.favicon)}
              {@const src = d.favicon}
              <!-- literal: 14px -->
              <!-- biome-ignore lint/a11y/noNoninteractiveElementInteractions: onerror is an image-load callback — a site with no icon keeps the tool's glyph -->
              <img
                alt=""
                class="col-start-1 row-start-1 size-(--fav) block rounded-xs"
                onerror={() => brokenIcons.add(src)}
                {src}
                style:--fav="14px"
                in:iconSwap
                out:iconSwap
              />
            {:else}
              <span
                class="col-start-1 row-start-1 grid place-items-center"
                in:iconSwap
                out:iconSwap><Icon class="size-icon-md block" /></span
              >
            {/if}</span
          >
        {/key}
      </span>
      <!-- The verb gives way before the row does: on a phone the argument,
           the fact and the chevron stay inside the row. -->
      {#if d.label}
        <span
          class="font-medium text-ink-strong text-size-label flex-initial min-w-0 overflow-clip text-ellipsis whitespace-nowrap"
          >{d.label}</span
        >
      {/if}
      <span
        class="font-(family-name:--font-mono) text-ink-muted overflow-clip text-ellipsis whitespace-nowrap min-w-0 flex-auto"
        title={[d.object, d.detail].filter(Boolean).join(" ") || undefined}
      >
        {#if d.object}
          {d.object}
        {/if}
        {#if d.detail}
          <span class="text-ink-muted opacity-70">{` ${d.detail}`}</span>
        {/if}
      </span>
      <!-- shadcn Badge, dressed on the DESIGN.md scale rather than the stock
           ladder. -->
      {#if d.chip}
        <Badge class="h-auto flex-none" kind="meta" variant="secondary"
          ><span>{d.chip}</span></Badge
        >
      {/if}
      <!-- One chain, so a fact arriving with its result fades in (Svelte plays
           a local intro only when a block that already ran switches). A fact
           is a measurement, not a verdict: it reads in --ink-strong, the ink
           that gives a number presence without passing judgement on it.
           Green is reserved for the added side of a `diff` fact — the one
           measurement that carries a direction — and every diff row agrees
           on that reading, whether it came back as `+38 −2` or a lone `+38`. -->
      {#if d.fact && d.factTone === "diff"}
        <span class="text-ink-strong num flex-none" in:factIn
          >{#each factParts(d.fact) as part, i (i)}
            <span
              data-add={part.add || undefined}
              class="not-data-del:data-add:text-data-ok data-del:text-data-bad"
              data-del={part.del || undefined}>{part.text}</span
            >
          {/each}</span
        >
      {:else if d.fact}
        <span class="text-ink-strong num flex-none" in:factIn>{d.fact}</span>
      {/if}
    {/snippet}
    <!-- The call opens its own line, so a run's rail grows one call at a time. -->
    <TranscriptRow id={callId(m)}>
      {#snippet children()}
        <div data-slot="row" data-err={failed || undefined}>
          {#if d.expanded === "preview"}
            {@const called = calledArtifact(
              m.metadata?.toolInput ?? undefined,
              m.metadata?.toolResult
            )}
            {@const current = cawco.previews[m.instanceId]}
            {@const preview = sameArtifact(current, called)
              ? current
              : undefined}
            {@const opened = preview?.state === "open"}
            {@const busy = opening.has(callId(m))}
            {@const name = called?.name ?? preview?.artifact.name ?? "Artifact"}
            <!-- The row is what travels: pressing its button departs it
                 (motion/share's click capture), and the panel or sheet
                 opens out of its box under `preview:<session>` — first open
                 or repeat, thumbnail or not. Closing, the pane shrinks back
                 into this row (PreviewPane.svelte). The button is the whole
                 card (its ::after), so the card is what focus lights: the
                 card's own border takes the ring, as a field frame's does
                 (app.css field-shell), and the button draws nothing. Neither
                 line sets the card's width, so the card fits any row it
                 stands in. -->
            <!-- literal: 440px -->
            <!-- literal: 80px -->
            <div
              data-slot="preview-tool"
              class="relative flex items-center gap-space-2 max-w-(--card-max) min-h-(--card-min) p-space-2 my-space-2 border border-border-hairline rounded-md bg-surface-raised shadow-tile data-closed:opacity-50 not-has-[[data-slot=artifact-thumb]]:w-fit has-hover:bg-surface-hover has-focus-visible:outline-(length:--focus-ring-width) has-focus-visible:outline-focus-ring has-focus-visible:outline-offset-(--focus-ring-inset)"
              data-artifact={called?.id}
              data-share="preview:{m.instanceId}"
              data-share-ttl="10000"
              data-closed={!opened || undefined}
              style:--card-max="440px"
              style:--card-min="80px"
            >
              <!-- literal: 44px -->
              <!-- The button draws no ring of its own (the card takes it):
                   the outline shorthand's none, which also puts the ring's
                   width and colour back to their initial values. -->
              <button
                aria-busy={busy || undefined}
                aria-disabled={busy || !called || undefined}
                aria-label={preview?.title || name}
                data-slot="artifact-open"
                class="flex items-center gap-space-2 flex-1 min-w-0 border-none border-current p-space-2 bg-transparent text-ink-strong text-size-label font-medium text-start cursor-pointer coarse:min-h-(--hit-min) focus-visible:outline-off"
                style:--hit-min="44px"
                onclick={whileIdle(
                  () => busy || !called,
                  () => {
                    if (opened) {
                      revealPreview(m.instanceId);
                    } else if (called) {
                      openArtifact(m, called);
                    }
                  }
                )}
                type="button"
              >
                <!-- literal: 17px -->
                <!-- Two background layers, the overlay over the hue, as the
                     shorthand wrote them: the overlay and an empty layer,
                     the hue under both. -->
                <span
                  data-slot="mark"
                  class="size-(--mark-size) shrink-0 grid place-items-center rounded-xs text-mark-glyph bg-(image:--mark-layers) bg-mark-6"
                  style:--mark-size="17px"
                  style:--mark-layers="var(--mark-overlay), none"
                  ><IconWindow class="size-icon-sm" /></span
                >
                <!-- The name wraps, whole, and breaks inside a word only
                     when the word alone is wider than the row; the place
                     stays one line, cut at its end, and contained, so
                     however long it is it takes the width it is given. The
                     place's face is the font shorthand's: meta size, mono,
                     its weight and line height reset. -->
                <span class="flex flex-col min-w-0"
                  ><!-- literal: 12px -->
                  <span
                    class="flex items-center gap-(--btn-gap) wrap-anywhere"
                    style:--btn-gap="var(--space-1)"
                    style:--btn-icon="12px"
                    ><PendingContent
                      failed={openFailed.has(callId(m))}
                      label={preview?.title || name}
                      pending={busy}
                      pendingLabel="Opening…"
                    /></span
                  ><span
                    data-slot="artifact-path"
                    class="truncate text-ink-muted contain-inline-size text-size-meta font-(family-name:--font-mono) font-normal leading-(--path-leading)"
                    style:--path-leading="normal"
                    >{preview?.source
                      ? previewPlace(preview.source)
                      : (called?.kind ?? "")}</span
                  ></span
                >
              </button>
              {#if preview?.thumbnail}
                <!-- literal: 90px -->
                <!-- literal: 64px -->
                <div
                  aria-hidden="true"
                  data-slot="artifact-thumb"
                  class="w-(--thumb-w) h-(--thumb-h) shrink-0 overflow-hidden border border-border-hairline rounded-sm bg-surface-recess"
                  inert
                  style:--thumb-w="90px"
                  style:--thumb-h="64px"
                >
                  <Shot
                    alt="Preview"
                    size="thumb"
                    src={`data:image/png;base64,${preview.thumbnail}`}
                  />
                </div>
              {/if}
            </div>
            {#if openFailed.has(callId(m))}
              <!-- What happened and the way back, under the row that asked;
                   the row itself is still the way to open it. -->
              <!-- literal: 440px -->
              <p
                class="max-w-(--card-max) -mt-space-1 mx-0 mb-space-2 text-data-bad text-size-meta font-normal"
                role="alert"
                style:--card-max="440px"
              >
                Couldn't open {name}: {openFailed.get(callId(m))} Press it to try
                again.
              </p>
            {/if}
          {:else if hasBody}
            {@const disclosed = disclosure(m)}
            {@const body = `${uid}-${m.id ?? m.toolCallId}`}
            <!-- The trigger is a plain button and the disclosure is built only
                 once the call is first opened: a scroll mounts calls by the
                 dozen, and a closed Collapsible with its trigger was most of
                 what one cost to mount. One button the whole time, so the
                 chevron turns and focus stays where it was. The row's shape
                 is shared by this button and the plain <div> below, with the
                 button's chrome stripped back to the ledger's; its inline
                 geometry is the rail line's (app.css `.rail-line`). -->
            <!-- literal: 26px -->
            <!-- literal: 44px -->
            <button
              aria-controls={opened.has(callId(m)) ? body : undefined}
              aria-expanded={disclosed.get()}
              class="group/trow rail-line press-tint w-full min-h-(--trow-min) coarse:min-h-(--trow-min-coarse) text-size-label font-medium text-ink-strong bg-transparent border-none border-current rounded-xs p-0 m-0 text-start cursor-pointer"
              data-state={disclosed.get() ? "open" : "closed"}
              onclick={() => disclosed.set(!disclosed.get())}
              style:--trow-min="26px"
              style:--trow-min-coarse="44px"
              type="button"
            >
              {@render line()}
              <!-- The affordance sits at the tail so the row's left anatomy
                   is unchanged. -->
              <!-- literal: rotate(90deg) -->
              <span
                data-slot="chev"
                class="flex-none grid place-items-center text-ink-muted motion-safe:transition-[transform] motion-safe:dur-control motion-safe:ease-out group-state-open/trow:transform-(--chev-turn)"
                data-box
                style:--chev-turn="rotate(90deg)"
                ><IconChevronRight class="size-icon-md block" /></span
              >
            </button>
            {#if disclosed.get() || opened.has(callId(m))}
              <Collapsible.Root bind:open={disclosed.get, disclosed.set}>
                <Collapsible.Content
                  entering={!openAtMount.has(callId(m))}
                  id={body}
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
                       it attempted, under the harness's reason. The file path
                       in each header reads at the text column, the diff's
                       frame reaching out past it by its 1px border and its
                       header's 12px inset (DiffView's `px-3`). -->
                      <!-- literal: 13px -->
                      <div
                        class="flex flex-col gap-space-2 mt-space-2 mb-space-3 ms-(--diffs-start)"
                        style:--diffs-start="calc(var(--x-hang) - 13px)"
                      >
                        {#if refusal}
                          <!-- literal: 13px -->
                          <p
                            data-slot="refusal"
                            class="my-0 me-0 ms-(--refusal-start) text-size-label text-data-bad wrap-anywhere"
                            style:--refusal-start="13px"
                          >
                            {refusal}
                          </p>
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
                      <!-- The disclosed payload — same anatomy as
                           Prompt.svelte's permission fields. Its words hang
                           at the row's text column; the well reaches out past
                           them by its own padding. -->
                      <div
                        class="flex flex-col gap-space-2 mt-space-2 mb-space-3 ms-(--fields-start) p-space-3 rounded-sm bg-surface-recess"
                        style:--fields-start={"calc(var(--x-hang) - var(--space-3))"}
                      >
                        <div
                          data-slot="tool-group-field"
                          class="flex flex-col gap-space-1 min-w-0"
                        >
                          <span
                            class="text-size-label font-medium text-ink-muted"
                            >result</span
                          >
                          <!-- literal: 300px -->
                          <pre
                            class="m-0 max-h-(--value-max) overflow-auto font-mono text-size-label leading-body text-ink-strong whitespace-pre-wrap break-word"
                            style:--value-max="300px">{result.text}</pre>
                        </div>
                      </div>
                    {:else if d.expanded === "prose" && !failed}
                      <!-- A skill's arguments are the agent's own words to
                           it: prose at the text column, with no well around
                           them. -->
                      <!-- literal: 70ch -->
                      <div
                        class="mt-space-1 mb-space-3 ms-(--x-hang) max-w-(--measure)"
                        style:--measure="70ch"
                      >
                        <ToolProse source={proseOf(toolInput)} />
                      </div>
                    {:else}
                      <div
                        class="flex flex-col gap-space-2 mt-space-2 mb-space-3 ms-(--fields-start) p-space-3 rounded-sm bg-surface-recess"
                        style:--fields-start={"calc(var(--x-hang) - var(--space-3))"}
                      >
                        {#each fields as f (f.key)}
                          <div
                            data-slot="tool-group-field"
                            class="flex flex-col gap-space-1 min-w-0"
                          >
                            <span
                              class="text-size-label font-medium text-ink-muted"
                              >{f.key}</span
                            >
                            <!-- literal: 300px -->
                            <pre
                              class="m-0 max-h-(--value-max) overflow-auto font-mono text-size-label leading-body text-ink-strong whitespace-pre-wrap break-word"
                              style:--value-max="300px">{f.text}</pre>
                          </div>
                        {/each}
                        {#if result}
                          <div
                            data-slot="tool-group-field"
                            class="flex flex-col gap-space-1 min-w-0"
                          >
                            <span
                              class="text-size-label font-medium text-ink-muted"
                              >result</span
                            >
                            <!-- literal: 300px -->
                            <pre
                              class="m-0 max-h-(--value-max) overflow-auto font-mono text-size-label leading-body text-ink-strong whitespace-pre-wrap break-word"
                              style:--value-max="300px">{result.text}</pre>
                            {#if result.more}
                              <span
                                data-slot="more"
                                class="text-size-meta font-normal text-ink-muted"
                                >… {result.more.toLocaleString()} more chars</span
                              >
                            {/if}
                          </div>
                        {/if}
                      </div>
                    {/if}
                  </CollapsibleLazy>
                </Collapsible.Content>
              </Collapsible.Root>
            {/if}
          {:else}
            <!-- literal: 26px -->
            <!-- literal: 44px -->
            <div
              class="rail-line w-full min-h-(--trow-min) coarse:min-h-(--trow-min-coarse) text-size-label font-medium text-ink-strong bg-transparent border-none border-current rounded-xs p-0 m-0 text-start"
              style:--trow-min="26px"
              style:--trow-min-coarse="44px"
            >
              {@render line()}
            </div>
          {/if}
          {#if d.expanded === "image" && machine && !failed}
            {@const input = m.metadata?.toolInput as {
              path: string;
              caption?: string;
            }}
            <!-- literal: 240px -->
            <div
              data-slot="shots"
              class="flex flex-wrap gap-space-2 ms-(--x-hang) mt-space-2"
              style:--shot-basis="240px"
            >
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
          {#if machine && !failed && sentAttachments(m).length}
            <!-- literal: 240px -->
            <div
              data-slot="shots"
              class="flex flex-wrap gap-space-2 ms-(--x-hang) mt-space-2"
              data-gallery
              style:--shot-basis="240px"
            >
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
            <!-- literal: 240px -->
            <div
              data-slot="shots"
              class="flex flex-wrap gap-space-2 ms-(--x-hang) mt-space-2"
              data-gallery
              style:--shot-basis="240px"
            >
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
  /* residual: pseudo */
  /* The button is the whole card: its ::after covers the card's box. */
  [data-slot="artifact-open"]::after {
    content: "";
    position: absolute;
    inset: 0;
    border-radius: var(--radius-md);
  }

  /* residual: foreign-dom */
  /* The thumbnail is Shot's own box and image, which take no class. */
  [data-slot="artifact-thumb"] :global([data-slot="shot-box"]) {
    block-size: var(--thumb-h);
    min-block-size: 0;
  }
  [data-slot="artifact-thumb"] :global(img) {
    inline-size: 100%;
    block-size: var(--thumb-h);
    object-fit: cover;
    object-position: top;
  }
  /* Each picture is a Shot, whose root takes no class. */
  [data-slot="shots"] > :global(*) {
    flex: 1 1 var(--shot-basis);
    min-inline-size: 0;
    max-inline-size: 100%;
  }
</style>
