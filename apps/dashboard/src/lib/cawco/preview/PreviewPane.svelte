<script lang="ts">
  import {
    type ArtifactChoices,
    machineLabel,
    PREVIEW_DOWN_META,
    type PreviewDown,
  } from "@cawco/core";
  import { type Snippet, untrack } from "svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import PendingContent, {
    whileIdle,
  } from "#lib/components/ui/button/pending-content.svelte";
  import { EmptyState } from "#lib/components/ui/empty/index.js";
  import {
    IconAlert,
    IconCursor,
    IconExternal,
    IconPlus,
    IconRefresh,
    IconSend,
    IconUndock,
  } from "#lib/icons.js";
  import { goto } from "$app/navigation";
  import {
    handBack,
    holdStage,
    letGo,
    type Stage,
  } from "../canvas/stage.svelte";
  import {
    cawco,
    closePreview,
    createDraftCanvas,
    showArtifact,
  } from "../client.svelte";
  import { conversationHref, resolveSessionTitle } from "../links";
  import { appear, dur } from "../motion/curves.svelte";
  import { closeInto, depart } from "../motion/share.svelte";
  import { watchInput } from "../reload.svelte";
  import SideSurface from "../side/SideSurface.svelte";
  import ArtifactMenu from "./ArtifactMenu.svelte";
  import { artifactSyncPath, joinArtifact, sendArtifact } from "./artifact-doc";
  import { heardInk } from "./ink.svelte";
  import PlacePick from "./PlacePick.svelte";
  import {
    type CapturedSelection,
    type SelectionShot,
    selectionShare,
  } from "./selection";
  import { isSetupPage } from "./setup-page";
  import { previewPlace } from "./source";
  import {
    previewElement,
    previewError,
    previewErrorOf,
    previewPickId,
    previewPickPlace,
    previewPng,
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
    ownTab = false,
  }: {
    instanceId: string;
    /**
     * The artifact's own tab (routes/artifact/[id]): the same pane at full
     * width, with no Open in new tab, and Close back to the session.
     */
    ownTab?: boolean;
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
    /**
     * A selected element goes to the conversation's composer; with no
     * composer beside the pane (its own tab) there is no Select.
     */
    onselect?: (
      selection: CapturedSelection
    ) => "added" | "duplicate" | "full" | undefined;
    /** A pick's screenshot arrived (null: it could not be drawn). */
    oncapture?: (pick: string, shot: SelectionShot | null) => void;
    onescape?: () => boolean;
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
   * asks again; a refused send sends again. A field the hub's bounds
   * refused has no way back here: the page says so under the field, and
   * the band goes once the field is kept.
   */
  let failure = $state<{
    message: string;
    again: "reload" | "close" | "send" | null;
  } | null>(null);
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
   * A page is served at the root of its own address: the head names the
   * artifact, with no path under it.
   */
  const page = $derived(!!source && "page" in source);
  const artifact = $derived(preview?.artifact);
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
  /** The way back from what a page's `cawco:error` names. */
  const AGAIN = { send: "send", field: null } as const;

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
      return said === "server" || said === "machine" || said === "workspace"
        ? said
        : null;
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
  const downTitle = $derived.by(() => {
    if (down === "server") {
      return "The page's server stopped answering";
    }
    if (down === "workspace") {
      return "That workspace isn't running";
    }
    return `${ownerMachine} isn't answering`;
  });

  $effect(() => {
    if (frameKey) {
      connected = false;
      loaded = false;
      captured = false;
      // A pick the old page asked for has no page left to answer.
      picking = null;
    }
  });
  function post(message: object) {
    iframe?.contentWindow?.postMessage(message, location.origin);
  }

  /*
   * The page keeps its own state (Projects spec §5.10): the overlay joins
   * the artifact's live document itself, on the path `cawco:hello` names.
   * The pane joins the same doc for its head alone (artifact-doc.ts): the
   * picks the session has not heard, which Send sends.
   */
  let choices = $state.raw<ArtifactChoices | null>(null);
  /** Picks the session has not heard sent: what Send picks would send. */
  const unsent = $derived(
    !!choices &&
      Object.values(choices.choices).some(
        (entry) => !choices?.sentAt || entry.at > choices.sentAt
      )
  );
  let sending = $state(false);
  const artifactId = $derived(artifact?.id);
  $effect(() => {
    const id = artifactId;
    const base = previewBase;
    if (!(id && base)) {
      return;
    }
    const joined = joinArtifact(base, id, (state) => {
      choices = state;
    });
    choices = null;
    return () => joined.destroy();
  });
  /**
   * Send: every pick to the session, through the hub's send, which applies
   * a setup page's fleet choices and place first. A refusal stands in the
   * band over the page, its way back sending again.
   */
  async function send() {
    if (!artifact) {
      return;
    }
    sending = true;
    try {
      await sendArtifact(previewBase, artifact.id);
      if (failure?.again === "send") {
        failure = null;
      }
    } catch (error) {
      failure = {
        message: error instanceof Error ? error.message : String(error),
        again: "send",
      };
      return;
    } finally {
      sending = false;
    }
    // The setup page is done once sent: on a phone its sheet stands over the
    // thread, where Caw answers with the files and "Open the board".
    if (sheet && isSetupPage(artifact, owner?.projectId)) {
      await close();
    }
  }
  /** A page's `cawco.pickPlace()` waiting on the person: the request it answers. */
  let picking = $state<{ id: number | string } | null>(null);
  /** The place picked goes back to the page, which keeps it in its state. */
  function pickedPlace(place: {
    machineId: string;
    path: string;
  }): Promise<void> {
    const asked = picking;
    picking = null;
    if (asked) {
      post({ jsonrpc: "2.0", id: asked.id, result: place });
    }
    return Promise.resolve();
  }
  function cancelPick() {
    const asked = picking;
    picking = null;
    if (asked) {
      post({ jsonrpc: "2.0", id: asked.id, result: null });
    }
  }
  /** Tells the page which artifact it is and where its doc is synced. */
  function announce() {
    connected = false;
    post({
      type: "cawco:hello",
      ...(artifact && previewBase
        ? {
            artifact: {
              id: artifact.id,
              kind: artifact.kind,
              name: artifact.name,
            },
            sync: artifactSyncPath(previewBase, artifact.id),
          }
        : {}),
    });
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
    if (onescape?.()) {
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
    const ask = previewPickPlace(event.data);
    if (ask !== null) {
      // A second ask replaces one still open: the page asked again.
      cancelPick();
      picking = { id: ask };
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
        if (!(selecting && onselect)) {
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
          oncapture?.(pick, null);
          break;
        }
        const png = previewPng(message.png);
        const scale = previewScale(message.scale);
        oncapture?.(pick, png && scale ? { png, scale } : null);
        break;
      }
      case "cawco:escape":
        select(false);
        break;
      case "cawco:error": {
        const said = previewError(message.message);
        const of = previewErrorOf(message.of);
        if (said) {
          // A send the page made itself goes again from Send; a field's
          // problem is the page's to show under the field.
          failure = { message: said, again: of ? AGAIN[of] : "reload" };
        }
        retrying = false;
        break;
      }
      case "cawco:resolved":
        if (failure && failure.again === null) {
          failure = null;
        }
        break;
      case "cawco:ink":
        // The person's unsent ink, which the composer's Send carries.
        if (artifact && iframe?.contentWindow) {
          heardInk(instanceId, artifact.id, iframe.contentWindow, message);
        }
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
    if (shown && !open && section && artifact) {
      closeToRow(section, artifact.id);
    }
    shown = open;
  });
  function closeToRow(pane: HTMLElement, id: string) {
    const row = [
      ...document.querySelectorAll<HTMLElement>(
        `.preview-tool[data-share="preview:${CSS.escape(instanceId)}"][data-artifact="${CSS.escape(id)}"]`
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
  /** Close in the artifact's own tab: back to the session that made it. */
  async function backToSession() {
    await goto(conversationHref(instanceId, cawco.instanceIndex));
  }
  /*
   * A canvas stands on its stage (canvas/stage.svelte.ts), one iframe for it
   * wherever it is: the well holds a slot the stage stands over, so Dock and
   * Undock fly that same iframe between the composer and here.
   */
  const isCanvas = $derived(artifact?.kind === "canvas");
  const holder = Symbol("panel");
  let canvasSlot = $state<HTMLElement>();
  let stage = $state<Stage>();
  /** This session's composer can take the canvas back: not a lead's shown beside a thread, not its own tab. */
  const canUndock = $derived(isCanvas && !(ownTab || linkSession));
  $effect(() => {
    const canvas = isCanvas ? artifact : undefined;
    const slot = canvasSlot;
    const session = instanceId;
    if (!(canvas && slot)) {
      return;
    }
    // Held, placed and stood here once per canvas and slot: what this reads
    // of the stages is what it writes, so none of it is a dependency.
    const held = untrack(() => {
      const one = holdStage(holder, session, canvas.id, canvas.name);
      stage = one;
      one.slots.panel = slot;
      one.actions.panel = {
        undock: () => giveBack(false),
        done: () => giveBack(true),
      };
      one.standAt("panel");
      one.changed();
      return one;
    });
    return () => {
      if (held.slots.panel === slot) {
        held.slots.panel = undefined;
        held.actions.panel = undefined;
        if (held.at === "panel") {
          held.standAt(null);
        }
      }
      letGo(holder, held.id);
      stage = undefined;
    };
  });
  /** Undock (or Done here): the session's composer takes the canvas back, open or as its chip. */
  function giveBack(folded: boolean) {
    if (!(canUndock && artifact)) {
      return;
    }
    handBack.ask = {
      instanceId,
      id: artifact.id,
      name: artifact.name,
      folded,
    };
  }
  /** The head's +: a new canvas, standing here at once. */
  let making = $state(false);
  async function newCanvas() {
    making = true;
    try {
      const made = await createDraftCanvas(instanceId);
      await showArtifact(instanceId, made.id);
    } catch (error) {
      failure = {
        message: `The canvas couldn't be made: ${error instanceof Error ? error.message : String(error)}. Try + again.`,
        again: null,
      };
    } finally {
      making = false;
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
      onclick={whileIdle(() => sending, send)}
      title="Send picks"
      type="button"
      transition:appear
    >
      <PendingContent icon={IconSend} pending={sending} />
      <span class="send-label">Send picks</span>
    </button>
  {/if}
  {#if !(ownTab || linkSession)}
    <button
      aria-busy={making || undefined}
      aria-disabled={making || undefined}
      aria-label="New canvas"
      class="touch-hit"
      onclick={whileIdle(() => making, newCanvas)}
      title="New canvas"
      type="button"
    >
      <PendingContent icon={IconPlus} pending={making} />
    </button>
  {/if}
  {#if canUndock}
    <button
      aria-label="Undock"
      class="other touch-hit"
      disabled={!stage}
      onclick={() => giveBack(false)}
      title="Undock"
      type="button"
    >
      <IconUndock />
    </button>
  {/if}
  {#if artifact && !ownTab}
    <!-- The same artifact, its doc and its tools, in a tab of its own. -->
    <a
      aria-label="Open in new tab"
      class="other touch-hit"
      href={`/artifact/${encodeURIComponent(artifact.id)}`}
      rel="noopener"
      target="_blank"
      title="Open in new tab"
      ><IconExternal /></a
    >
  {/if}
  {#if onselect && !isCanvas}
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
  {/if}
  <button
    aria-label="Reload"
    class="other touch-hit"
    onclick={() => {
      if (isCanvas && stage?.frame) {
        stage.frame.src = stage.src;
      } else {
        reload += 1;
      }
    }}
    title="Reload"
    type="button"
  >
    <IconRefresh />
  </button>
{/snippet}

<!-- The card beside the conversation (SideSurface): the switch, the
     page's name and place (never "Preview" again under the switch that says
     it), the preview's own controls, Close; the page in the well. -->
{#snippet artifactTitle()}
  {#if artifact}
    <ArtifactMenu {instanceId} shown={artifact} />
  {/if}
{/snippet}

<SideSurface
  actions={controls}
  class={selecting ? "preview-pane selecting" : "preview-pane"}
  closeFailed={failure?.again === "close"}
  {closing}
  label="Preview"
  onclose={ownTab ? backToSession : close}
  subtitle={page ? "" : displayPath || (source ? previewPlace(source) : "")}
  {switcher}
  titleControl={artifact ? artifactTitle : undefined}
  bind:section
  bind:well
>
  {#if isCanvas}
    <!-- The canvas's stage stands over this box: its one iframe. -->
    <div aria-hidden="true" class="canvas-slot" bind:this={canvasSlot}></div>
  {:else}
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
  {/if}
  {#if down}
    <!-- What happened, why and the way back, where the page would be. -->
    <div class="down" role="alert" transition:appear>
      <EmptyState icon={IconAlert} title={downTitle}>
        {#snippet line()}
          {#if down === "workspace"}
            Its server can't be reached until the workspace runs again. Once a
            session there is back, try again.
          {:else if down === "server"}
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
      {:else if failure.again === "send"}
        <Button
          label="Send again"
          onclick={send}
          pending={sending}
          pendingLabel="Sending…"
          size="sm"
          variant="outline"
        />
      {:else if failure.again === "close"}
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
  /* The canvas's stage (canvas/) stands over the well's whole box. */
  .canvas-slot {
    position: absolute;
    inset: 0;
    pointer-events: none;
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
