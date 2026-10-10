<script lang="ts">
  import {
    type CanvasChoices,
    machineLabel,
    PREVIEW_DOWN_META,
    type PreviewDown,
  } from "@cawco/core";
  import { type Snippet, untrack } from "svelte";
  import { toast } from "#lib/cawco/toasts.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import PendingContent, {
    whileIdle,
  } from "#lib/components/ui/button/pending-content.svelte";
  import { EmptyState } from "#lib/components/ui/empty/index.js";
  import {
    IconAlert,
    IconCursor,
    IconExternalLink,
    IconRefresh,
    IconSend,
  } from "#lib/icons.js";
  import {
    cawco,
    changePreviewChoice,
    closePreview,
    previewChoices,
    sendPreviewChoices,
  } from "../client.svelte";
  import { conversationHref, resolveSessionTitle } from "../links";
  import { appear, dur } from "../motion/curves.svelte";
  import { closeInto, depart } from "../motion/share.svelte";
  import { watchInput } from "../reload.svelte";
  import SideSurface from "../side/SideSurface.svelte";
  import PlacePick from "./PlacePick.svelte";
  import {
    type CapturedSelection,
    type SelectionShot,
    selectionShare,
  } from "./selection";
  import { applySetupPicks, isSetupPage } from "./setup-page";
  import { previewPlace, previewSourceKey } from "./source";
  import {
    type PreviewRpc,
    previewChoice,
    previewElement,
    previewError,
    previewMessageText,
    previewPickId,
    previewPickPlace,
    previewPng,
    previewRpc,
    previewScale,
    previewTitle,
    previewUrl,
  } from "./wire";

  let {
    instanceId,
    onselect,
    oncapture,
    onescape,
    switcher,
    sheet = false,
    linkSession = false,
  }: {
    instanceId: string;
    /**
     * The preview is another session's than the conversation beside it (a
     * thread shows its project's lead's): its states name that session, as
     * a link to it.
     */
    linkSession?: boolean;
    /**
     * Drawn in the phone's sheet over the conversation (SideSheet): a sent
     * setup page puts the sheet away, so Caw's reply under it is read.
     */
    sheet?: boolean;
    /** The Plan | Preview switch, when the conversation has a plan beside it (SideSplit). */
    switcher?: Snippet;
    onselect: (
      selection: CapturedSelection
    ) => "added" | "duplicate" | "full" | undefined;
    /** A pick's screenshot arrived (null: it could not be drawn). */
    oncapture: (pick: string, shot: SelectionShot | null) => void;
    onescape: () => boolean;
  } = $props();
  let iframe = $state<HTMLIFrameElement>();
  let selecting = $state(false);
  let connected = $state(false);
  let loaded = $state(false);
  let captured = false;
  let reload = $state(0);
  /**
   * What last went wrong, and what trying again means: the frame's own
   * errors (a capture the page refused) reload the frame; a refused close
   * asks again.
   */
  let failure = $state<{ message: string; again: "reload" | "close" } | null>(
    null
  );
  let well = $state<HTMLDivElement>();
  const preview = $derived(cawco.previews[instanceId]);
  const source = $derived(preview?.source);
  /** Each show gives the document and its assets a fresh URL namespace. */
  const previewBase = $derived(preview?.path ?? "");
  /**
   * Where the reader had gone inside this show, kept per session so a reload
   * of the tab (by hand, or by itself once idle: reload.svelte.ts) opens the
   * preview there again. A new show (another revision) starts at its root.
   */
  const keepKey = $derived(`cawco-preview-at:${instanceId}`);
  function keptAt(): string | null {
    try {
      const kept = JSON.parse(localStorage.getItem(keepKey) ?? "null") as {
        at?: unknown;
        revision?: unknown;
      } | null;
      return kept?.revision === preview?.revision &&
        typeof kept?.at === "string" &&
        previewBase.endsWith("/") &&
        kept.at.startsWith("/")
        ? `${previewBase}${kept.at.slice(1)}`
        : null;
    } catch {
      return null;
    }
  }
  /** `at` is the app's own place, the preview's prefix stripped (the overlay's `url`). */
  function keepAt(at: URL): void {
    const place = `${at.pathname}${at.search}${at.hash}`;
    if (!(previewBase && preview)) {
      return;
    }
    localStorage.setItem(
      keepKey,
      JSON.stringify({ revision: preview.revision, at: place })
    );
  }
  /** Where a show starts: the page the agent named (`path`), else the root. */
  const startAt = $derived.by(() => {
    const path = source && "path" in source ? source.path : undefined;
    return path && previewBase.endsWith("/")
      ? `${previewBase}${path.slice(1)}`
      : previewBase;
  });
  /**
   * The frame opens at the start page, or where the reader was in this show;
   * read once per show, so their going on inside it never reloads the frame.
   */
  const url = $derived.by(() => {
    if (!(preview?.revision && previewBase)) {
      return startAt;
    }
    return untrack(keptAt) ?? startAt;
  });
  let displayPath = $state("");
  /**
   * A decision page names itself in its own heading, and it is served at the
   * root of its own address: the header says what it is, with no path.
   */
  const decision = $derived(!!source && "page" in source);
  const title = $derived(
    decision
      ? "Decision page"
      : preview?.title ||
          (connected && source ? previewPlace(source) : "Preview") ||
          "Preview"
  );
  const frameKey = $derived(`${preview?.revision}:${reload}`);
  // The old paint bridges navigation only until the replacement finishes loading.
  let standing = $state<string | null>(null);
  const frames = $derived(
    standing === null || standing === frameKey
      ? [frameKey]
      : [standing, frameKey]
  );
  function arrived(key: string) {
    if (key !== frameKey) {
      return;
    }
    loaded = true;
    standing = key;
  }
  /**
   * Try again after a frame failure: reload the frame. Pending until the
   * reloaded page answers with a capture, which either clears the failure or
   * states the new one.
   */
  let retrying = $state(false);
  function retry() {
    retrying = true;
    reload += 1;
  }
  const frameError = (message: string | null) =>
    message ? { message, again: "reload" as const } : null;

  /*
   * Nothing serves the page: the proxy answered with its own page, which
   * names the hop that did not answer (core `PreviewDown`). The pane draws
   * what happened over the well, in the kit's empty state, with Try again
   * (a reload of the frame) as its way back; it stands until a load serves
   * the page again.
   */
  let down = $state<PreviewDown | null>(null);
  function downOf(frame: HTMLIFrameElement): PreviewDown | null {
    try {
      const said = frame.contentDocument
        ?.querySelector(`meta[name="${PREVIEW_DOWN_META}"]`)
        ?.getAttribute("content");
      return said === "server" || said === "machine" ? said : null;
    } catch {
      // A frame of another origin is a page, not the proxy's.
      return null;
    }
  }
  const owner = $derived(cawco.instanceIndex.byId.get(instanceId));
  const ownerMachine = $derived.by(() => {
    const machine = cawco.machines.find(
      (one) => one.machineId === owner?.machineId
    );
    return machine ? machineLabel(machine.hostname) : "its machine";
  });
  const ownerName = $derived(
    owner
      ? resolveSessionTitle({
          title: owner.title,
          cwd: owner.cwd,
          id: owner.id,
        })
      : "the session"
  );
  const downPort = $derived(source && "port" in source ? source.port : null);

  $effect(() => {
    if (frameKey) {
      connected = false;
      loaded = false;
      captured = false;
      // A page's choices are what its own bridge reads; a page without one shows no send.
      choices = null;
      // A pick the old page asked for has no page left to answer.
      picking = null;
    }
  });
  function post(message: object) {
    iframe?.contentWindow?.postMessage(message, location.origin);
  }

  /*
   * The choices bridge's host side (Projects spec §5.7): the page speaks MCP
   * Apps' JSON-RPC (wire.ts `previewRpc`), and this answers from the hub's
   * store. A change is shown to the page only once the hub has kept it, as
   * a fresh `read_choices` result.
   */
  let choices = $state<CanvasChoices | null>(null);
  /** Picks the session has not heard yet: what Send picks would send. */
  const unsent = $derived(
    !!choices &&
      Object.values(choices.choices).some(
        (entry) => !choices?.sentAt || entry.at > choices.sentAt
      )
  );
  let sending = $state(false);
  const toolResult = (state: CanvasChoices) => ({
    content: [{ type: "text", text: JSON.stringify(state) }],
    structuredContent: state,
  });
  function heard(state: CanvasChoices) {
    choices = state;
    post({
      jsonrpc: "2.0",
      method: "ui/notifications/tool-result",
      params: toolResult(state),
    });
  }
  async function send(text?: string) {
    sending = true;
    try {
      // A setup page's fleet choices and place are applied first (setup-page.ts).
      await applySetupPicks(source, choices);
      heard(await sendPreviewChoices(instanceId, text));
    } finally {
      sending = false;
    }
    // The setup page is done once sent: on a phone its sheet stands over the
    // thread, where Caw answers with the files and "Open the board".
    if (sheet && isSetupPage(source)) {
      await close();
    }
  }
  /** A page's `cawco.pickPlace()` waiting on the person: the request it answers, and the page it came from. */
  let picking = $state<{ id: number | string; pageHash: string } | null>(null);
  async function pickedPlace(place: { machineId: string; path: string }) {
    const asked = picking;
    if (!asked) {
      return;
    }
    heard(
      await changePreviewChoice(instanceId, {
        choice: "place",
        pageHash: asked.pageHash,
        value: place,
      })
    );
    picking = null;
    post({ jsonrpc: "2.0", id: asked.id, result: place });
  }
  function cancelPick() {
    const asked = picking;
    picking = null;
    if (asked) {
      post({ jsonrpc: "2.0", id: asked.id, result: null });
    }
  }
  async function answer(rpc: PreviewRpc) {
    const reply = (result: object) =>
      rpc.id !== undefined && post({ jsonrpc: "2.0", id: rpc.id, result });
    const refuse = (code: number, message: string) =>
      rpc.id !== undefined &&
      post({ jsonrpc: "2.0", id: rpc.id, error: { code, message } });
    try {
      switch (rpc.method) {
        case "ui/initialize":
          reply({
            protocolVersion: "2026-01-26",
            hostInfo: { name: "cawco", version: "1.0.0" },
            hostCapabilities: { serverTools: {} },
            hostContext: { platform: "web" },
          });
          break;
        case "ping":
          reply({});
          break;
        case "tools/call": {
          if (rpc.params.name !== "read_choices") {
            refuse(-32_601, "A preview can call read_choices only.");
            break;
          }
          // The fetched object, not the $state proxy: a proxy cannot be posted.
          const state = await previewChoices(instanceId);
          choices = state;
          reply(toolResult(state));
          break;
        }
        case "ui/update-model-context": {
          const change = previewChoice(rpc.params.structuredContent);
          if (!change) {
            refuse(-32_602, "That change is not a choice the bridge keeps.");
            break;
          }
          heard(await changePreviewChoice(instanceId, change));
          reply({});
          break;
        }
        case "ui/message": {
          const text = previewMessageText(rpc.params);
          if (text === null) {
            refuse(-32_602, "A message is a user's text.");
            break;
          }
          await send(text);
          reply({});
          break;
        }
        case "cawco/pick-place": {
          const asked = previewPickPlace(rpc.params);
          if (!asked || rpc.id === undefined) {
            refuse(-32_602, "pickPlace names the page it is asked from.");
            break;
          }
          // A second ask replaces one still open: the page asked again.
          if (picking) {
            cancelPick();
          }
          picking = { id: rpc.id, pageHash: asked.pageHash };
          break;
        }
        default:
          break;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      refuse(-32_000, message);
      toast.error(message);
    }
  }
  function announce() {
    connected = false;
    post({ type: "cawco:hello" });
  }
  function select(on: boolean) {
    selecting = on;
    post({ type: "cawco:mode", mode: on ? "select" : "off" });
  }
  export function parentEscape(event: KeyboardEvent) {
    if (
      event.key !== "Escape" ||
      event.defaultPrevented ||
      (event.target instanceof Element && event.target.closest("dialog[open]"))
    ) {
      return;
    }
    if (onescape()) {
      event.preventDefault();
      return;
    }
    if (selecting) {
      select(false);
      event.preventDefault();
    }
  }
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one validated dispatch for the overlay's wire protocol.
  function receive(event: MessageEvent) {
    if (
      event.source !== iframe?.contentWindow ||
      event.origin !== location.origin
    ) {
      return;
    }
    const rpc = previewRpc(event.data);
    if (rpc) {
      answer(rpc);
      return;
    }
    const message = event.data;
    switch (message?.type) {
      case "cawco:ready":
      case "cawco:navigated": {
        const at = previewUrl(message.url, location.origin);
        if (!at) {
          return;
        }
        const parsed = new URL(at);
        displayPath = `${parsed.pathname}${parsed.search}${parsed.hash}`;
        keepAt(parsed);
        preview.title = previewTitle(message.title) ?? "";
        if (message.type === "cawco:ready") {
          connected = true;
          select(selecting);
          if (!captured) {
            captured = true;
            post({ type: "cawco:capture" });
          }
        }
        break;
      }
      case "cawco:capture": {
        const png = previewPng(message.png);
        if (png) {
          preview.thumbnail = png;
        }
        failure = frameError(previewError(message.error));
        retrying = false;
        break;
      }
      case "cawco:selected": {
        if (!selecting) {
          return;
        }
        const element = previewElement(message.element, location.origin);
        const pick = previewPickId(message.id);
        if (!(element && pick)) {
          return;
        }
        if (iframe) {
          flyFrom(element.rect, selectionShare(element));
        }
        if (
          well &&
          onselect({
            capturing: pick,
            element,
            png: null,
            note: "",
            scale: 1,
          }) === "full"
        ) {
          const style = getComputedStyle(well);
          well?.animate(
            [
              { outlineColor: style.getPropertyValue("--accent") },
              { outlineColor: style.getPropertyValue("--focus-ring") },
              { outlineColor: style.getPropertyValue("--accent") },
            ],
            {
              duration: matchMedia("(prefers-reduced-motion: reduce)").matches
                ? 1
                : dur("--dur-panel"),
            }
          );
        }
        break;
      }
      case "cawco:selected-png": {
        const pick = previewPickId(message.id);
        if (!pick) {
          return;
        }
        const error = previewError(message.error);
        if (error) {
          failure = frameError(error);
          oncapture(pick, null);
          break;
        }
        const png = previewPng(message.png);
        const scale = previewScale(message.scale);
        oncapture(pick, png && scale ? { png, scale } : null);
        break;
      }
      case "cawco:escape":
        select(false);
        break;
      case "cawco:error":
        failure = frameError(previewError(message.message));
        retrying = false;
        break;
      default:
        break;
    }
  }
  /**
   * The picked element's chip flies out of the element into the composer
   * (motion/share.svelte.ts): a stand-in is laid over the element's box in
   * this page's coordinates, taken as the flight's source, and dropped.
   */
  function flyFrom(
    rect: { x: number; y: number; width: number; height: number },
    key: string
  ) {
    const frame = iframe?.getBoundingClientRect();
    if (!frame) {
      return;
    }
    const stand = document.createElement("div");
    stand.dataset.share = key;
    Object.assign(stand.style, {
      position: "fixed",
      left: `${frame.left + rect.x}px`,
      top: `${frame.top + rect.y}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
      pointerEvents: "none",
    });
    document.body.append(stand);
    depart(stand);
    stand.remove();
  }
  /**
   * Closing goes back where it came from: the preview opened out of its tool
   * row's box (`preview:<session>`), so as it closes, a stand-in the size of
   * the pane shrinks into that row and fades (closeInto, --ease-drawer) while
   * the pane itself leaves. A row scrolled away or not mounted has nothing
   * to land in, and the pane simply leaves.
   */
  let section = $state<HTMLElement>();
  let shown = false;
  $effect(() => {
    const open = preview?.state === "open";
    if (shown && !open && section && source) {
      closeToRow(section, previewSourceKey(source));
    }
    shown = open;
  });
  function closeToRow(pane: HTMLElement, sourceKey: string) {
    const row = [
      ...document.querySelectorAll<HTMLElement>(
        `.preview-tool[data-share="preview:${CSS.escape(instanceId)}"][data-preview-source="${CSS.escape(sourceKey)}"]`
      ),
    ].at(-1);
    if (!row) {
      return;
    }
    const box = row.getBoundingClientRect();
    if (box.height === 0 || box.bottom <= 0 || box.top >= innerHeight) {
      return;
    }
    const rect = pane.getBoundingClientRect();
    const stand = document.createElement("div");
    stand.setAttribute("aria-hidden", "true");
    stand.className = "preview-close-flight";
    Object.assign(stand.style, {
      position: "fixed",
      left: `${rect.left}px`,
      top: `${rect.top}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
      borderRadius: "var(--radius-lg)",
      background: "var(--surface-raised)",
      boxShadow: "var(--shadow-drawer)",
      pointerEvents: "none",
      zIndex: "50",
    });
    document.body.append(stand);
    const done = () => stand.remove();
    const flight = closeInto(stand, row, dur("--dur-panel"));
    if (flight) {
      flight.finished.then(done, done);
    } else {
      done();
    }
  }
  let closing = $state(false);
  async function close() {
    closing = true;
    try {
      await closePreview(instanceId);
    } catch (error) {
      failure = {
        message: error instanceof Error ? error.message : String(error),
        again: "close",
      };
    } finally {
      closing = false;
    }
  }
</script>

<svelte:window onkeydown={parentEscape} onmessage={receive} />

{#snippet controls()}
  {#if unsent || sending}
    <button
      aria-busy={sending || undefined}
      aria-disabled={sending || undefined}
      class="touch-hit"
      onclick={whileIdle(
        () => sending,
        () => send().catch((error: Error) => toast.error(error.message))
      )}
      title="Send picks"
      type="button"
      transition:appear
    >
      <PendingContent icon={IconSend} pending={sending} />
      <span class="send-label">Send picks</span>
    </button>
  {/if}
  <button
    aria-pressed={selecting}
    class="touch-hit"
    disabled={!connected}
    onclick={() => select(!selecting)}
    title="Select"
    type="button"
  >
    <IconCursor /><span class="select-label">Select</span>
  </button>
  <button
    aria-label="Reload"
    class="other touch-hit"
    onclick={() => {
      reload += 1;
    }}
    title="Reload"
    type="button"
  >
    <IconRefresh />
  </button>
  <a
    aria-label="Open in new tab"
    class="other touch-hit"
    href={url}
    rel="noopener noreferrer"
    target="_blank"
    title="Open in new tab"
    ><IconExternalLink /></a
  >
{/snippet}

<!-- The card beside the conversation (SideSurface): the switch, the
     page's name and place (never "Preview" again under the switch that says
     it), the preview's own controls, Close; the page in the well. -->
<SideSurface
  actions={controls}
  class={selecting ? "preview-pane selecting" : "preview-pane"}
  closeFailed={failure?.again === "close"}
  {closing}
  label="Preview"
  onclose={close}
  subtitle={decision ? "" : displayPath || (source ? previewPlace(source) : "")}
  {switcher}
  title={switcher && title === "Preview" ? undefined : title}
  bind:section
  bind:well
>
  {#each frames as key (key)}
    {@const current = key === frameKey}
    <!-- biome-ignore lint/a11y/noNoninteractiveElementInteractions: load starts the overlay handshake. -->
    <iframe
      allow="clipboard-write"
      inert={!current}
      onerror={() => arrived(key)}
      onload={(event) => {
        arrived(key);
        // Input inside the frame never reaches this page: heard there, it
        // keeps a tab in use from reloading under its reader.
        try {
          const inner = (event.currentTarget as HTMLIFrameElement)
            .contentWindow;
          if (inner) {
            watchInput(inner);
          }
        } catch {
          // A frame of another origin: its input is not ours to hear.
        }
        if (key === frameKey) {
          down = downOf(event.currentTarget as HTMLIFrameElement);
          if (down) {
            retrying = false;
          }
          announce();
        }
      }}
      src={url}
      title="Preview"
      class:ready={!current || loaded}
      {@attach (node) => {
        if (key === frameKey) {
          iframe = node;
        }
      }}
    ></iframe>
  {/each}
  <div
    aria-hidden="true"
    class="cover"
    class:ready={loaded || standing !== null}
  >
    <span
      class="kit-skeleton block h-[11px] w-[42%] rounded-[var(--radius-xs)]"
    ></span>
  </div>
  {#if down}
    <!-- What happened, why and the way back, where the page would be. -->
    <div class="down" role="alert" transition:appear>
      <EmptyState
        icon={IconAlert}
        title={down === "server"
          ? "The page's server stopped answering"
          : `${ownerMachine} isn't answering`}
      >
        {#snippet line()}
          {#if down === "server"}
            {downPort
              ? `Nothing is running on port ${downPort} on ${ownerMachine}, so the page can't load.`
              : `The page's server on ${ownerMachine} isn't running, so the page can't load.`}
            {#if linkSession && owner}
              Start it again from its session, then try again.
            {:else}
              Start it again, then try again.
            {/if}
          {:else}
            The preview comes from {ownerMachine}, which isn't connected to the
            hub right now. Once it's back, try again.
          {/if}
        {/snippet}
        {#snippet action()}
          <div class="down-actions">
            <Button
              icon={IconRefresh}
              label="Try again"
              onclick={retry}
              pending={retrying}
              pendingLabel="Reloading…"
              size="sm"
              variant="outline"
            />
            {#if down === "server" && linkSession && owner}
              <!-- The session that serves the page, as the kit draws a link
                   (Button `link`, as Caw's panel offers its settings). -->
              <Button
                class="px-0"
                href={conversationHref(owner.id, cawco.instanceIndex)}
                label={`Open ${ownerName}`}
                size="sm"
                variant="link"
              />
            {/if}
          </div>
        {/snippet}
      </EmptyState>
    </div>
  {/if}
  {#if picking}
    <PlacePick oncancel={cancelPick} onpick={pickedPlace} />
  {/if}
  {#if failure}
    <div class="error" role="alert" transition:appear>
      <p>{failure.message}</p>
      {#if failure.again === "reload"}
        <Button
          label="Try again"
          onclick={retry}
          pending={retrying}
          pendingLabel="Reloading…"
          size="sm"
          variant="outline"
        />
      {:else}
        <Button
          label="Try again"
          onclick={close}
          pending={closing}
          pendingLabel="Closing…"
          size="sm"
          variant="outline"
        />
      {/if}
    </div>
  {/if}
</SideSurface>

<style>
  /* The header's controls are the card's (SideSurface); while selecting,
     the ones that would leave the page wait. */
  :global(.preview-pane.selecting .other) {
    opacity: 0.5;
  }
  /* The well is the card's (SideSurface). Selecting turns the well's own border the accent, 2px, inside its
       box: never a second ring round it. */
  :global(.preview-pane .side-well) {
    outline: var(--focus-ring-width) solid transparent;
    outline-offset: var(--focus-ring-inset);
    transition: outline-color var(--dur-control) var(--ease-in-out);
  }
  :global(.preview-pane.selecting .side-well) {
    outline-color: var(--accent);
    cursor: crosshair;
  }
  /* The replacement's load releases the old paint independently of the overlay. */
  iframe {
    position: absolute;
    inset: 0;
    color-scheme: light;
    background: Canvas;
    display: block;
    width: 100%;
    height: 100%;
    border: 0;
    opacity: 0;
    transition: opacity var(--dur-control) var(--ease-out);
  }
  iframe.ready {
    opacity: 1;
  }
  /* Covers the frame until it connects, holding one kit skeleton line. */
  .cover {
    position: absolute;
    inset: 0;
    padding: var(--space-5);
    background: var(--surface-recess);
    pointer-events: none;
    transition: opacity var(--dur-control) var(--ease-out);
  }
  .cover.ready {
    opacity: 0;
  }
  /* A cover faded away is not loading: its sweep holds still. */
  .cover.ready :global(*),
  .cover.ready :global(*::after) {
    animation-play-state: paused;
  }
  /* Nothing serves the page: the kit's empty state stands over the well, on
     the well's own ground, at the column the page would have started on. */
  .down {
    position: absolute;
    inset: 0;
    overflow: auto;
    padding-inline: var(--space-6);
    background: var(--surface-well);
  }
  /* Try again, and beside it the session that serves the page; under it
     when the pane is too narrow for both. */
  .down-actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
  }
  /* What went wrong, over the foot of the frame, and the one thing to do
     about it. */
  .error {
    position: absolute;
    inset-inline: 0;
    bottom: 0;
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-2) var(--space-3);
    background: var(--surface-raised);
    border-top: 1px solid var(--border-hairline);

    & p {
      flex: 1;
      min-width: 0;
      margin: 0;
      color: var(--data-bad);
      font-size: var(--text-body);
      font-weight: var(--weight-body);
    }
  }
  @container (max-width: 469px) {
    .select-label {
      display: none;
    }
  }
</style>
