<script lang="ts">
  import {
    type Pin,
    type PreviewMode,
    previewMode,
  } from "@cawco/core/comments/model";
  import { pinName } from "@cawco/core/pin-name";
  import { STAGE_READY_MS } from "@cawco/core/stage";
  import { browserWords } from "@cawco/core/words/browser";
  import { commentWords } from "@cawco/core/words/comments";
  import { commonWords } from "@cawco/core/words/common";
  import { previewWords } from "@cawco/core/words/preview";
  import { sheetWords } from "@cawco/core/words/sheet";
  import { shellWords } from "@cawco/core/words/shell";
  import { Portal } from "bits-ui";
  import type { Snippet } from "svelte";
  import { BarItem, BarSegments } from "#lib/components/ui/bar-glass/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import PendingContent, {
    whileIdle,
  } from "#lib/components/ui/button/pending-content.svelte";
  import * as DropdownMenu from "#lib/components/ui/dropdown-menu/index.js";
  import { EmptyState } from "#lib/components/ui/empty/index.js";
  import { Skeleton } from "#lib/components/ui/skeleton/index.js";
  import {
    IconAlert,
    IconArchive,
    IconChat,
    IconComment,
    IconCommentLinear,
    IconExternal,
    IconExternalLinear,
    IconGlobe,
    IconInteract,
    IconInteractLinear,
    IconLock,
    IconMonitor,
    IconMonitorLinear,
    IconPen,
    IconPenLinear,
    IconPhone,
    IconPhoneLinear,
    IconRefresh,
    IconRefreshLinear,
    IconSend,
    IconTrash,
    IconUndock,
  } from "#lib/icons.js";
  import { appear, revealOn } from "#lib/platform/motion/curves.svelte.js";
  import { theme } from "#lib/theme.svelte.js";
  import { formatTimestamp } from "#lib/utils/time.js";
  import AskHere from "../AskHere.svelte";
  import EmptyAsk from "../EmptyAsk.svelte";
  import DesignGraph from "../graph/DesignGraph.svelte";
  import { HEAD_PRIORITY, type HeadItem } from "../side/head";
  import SideSurface from "../side/SideSurface.svelte";
  import type { ComposerDraft } from "../transcript/composer-draft.svelte";
  import { NOT_REACHING } from "./artifact-doc";
  import BrowserAddress from "./BrowserAddress.svelte";
  import BrowserView from "./BrowserView.svelte";
  import { browserHead } from "./browser-head";
  import ChangeLines from "./ChangeLines.svelte";
  import ChangesTag from "./ChangesTag.svelte";
  import CommentRail from "./CommentRail.svelte";
  import CommentsButton from "./CommentsButton.svelte";
  import CommentsCard from "./CommentsCard.svelte";
  import CoverState from "./CoverState.svelte";
  import { ChangeTour, lineOfActivity } from "./change-tour.svelte";
  import { CommentKit } from "./comment-kit.svelte";
  import { NEXT_COMMENT } from "./comment-rows";
  import ModeButton from "./ModeButton.svelte";
  import ModeSwitch from "./ModeSwitch.svelte";
  import PinFloat from "./PinFloat.svelte";
  import PlacePick from "./PlacePick.svelte";
  import PreviewTools from "./PreviewTools.svelte";
  import { PageCover } from "./page-cover.svelte";
  import { isComposerMessage, PageWire } from "./page-wire.svelte";
  import { PaneBrowser } from "./pane-browser.svelte";
  import { PaneCanvas } from "./pane-canvas.svelte";
  import { PaneClose } from "./pane-close.svelte";
  import { PaneDoc } from "./pane-doc.svelte";
  import { PaneKeys } from "./pane-keys.svelte";
  import { PaneLayout } from "./pane-layout.svelte";
  import { PaneMode } from "./pane-mode.svelte";
  import { PaneNotice } from "./pane-notice.svelte";
  import { PaneSend } from "./pane-send.svelte";
  import { PaneSheet } from "./pane-sheet.svelte";
  import { PaneSubject } from "./pane-subject.svelte";
  import { PinComposer } from "./pin-composer.svelte";
  import { PinPeek } from "./pin-peek.svelte";
  import { PinThread } from "./pin-thread.svelte";
  import { PreviewFrame } from "./preview-frame.svelte";
  import { PreviewReach } from "./preview-reach.svelte";
  import { errorPlace, errorTitle, StageCover } from "./stage-cover.svelte";
  import ThreadSheet from "./ThreadSheet.svelte";
  import { pageMessage } from "./wire";

  let {
    instanceId,
    switcher,
    switcherAt = "start",
    sheet = false,
    ownTab = false,
    inset = false,
    onScreen = true,
  }: {
    instanceId: string;
    /**
     * Its conversation's tab is in view (SideSplit's `visible`). A tab kept
     * mounted off screen keeps its page loaded and held, up to the bound of
     * loaded.svelte.ts, and loads it again once its tab is back past it.
     */
    onScreen?: boolean;
    /**
     * Drawn inside another surface (a task's review, TaskReview's stage):
     * the page in its well and what stands over it, with no head of its
     * own. The surface around it names it and holds its controls.
     */
    inset?: boolean;
    /**
     * The artifact's own tab (routes/artifact/[id]): the same pane at full
     * width, with no Open in new tab, and Close back to the session.
     */
    ownTab?: boolean;
    /**
     * Drawn in the phone's sheet over the conversation (SideSheet): a sent
     * setup page puts the sheet away, so Caw's reply under it is read.
     */
    sheet?: boolean;
    /** The Plan | Preview switch, when the conversation has a plan beside it (SideSplit). */
    switcher?: Snippet;
    /** Where the switch stands in the bar (SideSurface `switcherAt`). */
    switcherAt?: "start" | "end";
  } = $props();
  /*
   * Off screen, the page is held (the overlay's hold.ts: no frames, timers
   * or animations run) and kept, up to the owner's bound of panes off
   * screen (loaded.svelte.ts); past it, the one hidden longest unloads. A
   * pane that mounts off screen loads nothing until its tab is shown, and
   * then only once the switch has painted (`afterPaint`).
   */
  const paneId = $props.id();
  const paneSubject = new PaneSubject({
    instanceId: () => instanceId,
    ownTab: () => ownTab,
  });
  const paneNotice = new PaneNotice({
    instanceId: () => instanceId,
    paneSubject,
  });
  const paneLayout = new PaneLayout({
    onScreen: () => onScreen,
    sheet: () => sheet,
  });
  const previewReach = new PreviewReach({
    instanceId: () => instanceId,
    onScreen: () => onScreen,
    paneSubject,
  });
  const paneCanvas = new PaneCanvas({
    composing: () => !!pinComposer.composing,
    composer: (data) => {
      const message = pageMessage(data);
      if (message && isComposerMessage(message)) {
        pageWire.heardComposer(message);
      }
    },
    instanceId: () => instanceId,
    onScreen: () => onScreen,
    ownTab: () => ownTab,
    paneSubject,
  });
  const previewFrame = new PreviewFrame({
    inset: () => inset,
    instanceId: () => instanceId,
    onScreen: () => onScreen,
    ownTab: () => ownTab,
    paneId: () => paneId,
    paneSubject,
    paneNotice,
    paneLayout,
    previewReach,
    paneCanvas,
  });
  const paneDoc = new PaneDoc({
    instanceId: () => instanceId,
    paneSubject,
    paneNotice,
    previewReach,
    previewFrame,
    writeLooks: () => changeTour.writeLooks(),
  });
  const paneSend = new PaneSend({
    instanceId: () => instanceId,
    paneSubject,
    paneNotice,
    previewFrame,
    paneDoc,
  });
  const stageCover = new StageCover({
    instanceId: () => instanceId,
    paneId: () => paneId,
    paneSubject,
    previewFrame,
    paneDoc,
  });
  const paneSheet = new PaneSheet({
    instanceId: () => instanceId,
    paneSubject,
    paneNotice,
    previewReach,
    previewFrame,
    paneDoc,
  });
  const commentKit = new CommentKit({
    paneSubject,
    previewFrame,
    cardPin: () => pinThread.cardPin,
  });
  const pinComposer = new PinComposer({
    paneSubject,
    previewFrame,
    paneDoc,
    commentKit,
    markFocused: (id: string) => pinThread.markFocused(id),
    paneCanvas,
  });
  const paneMode = new PaneMode({
    instanceId: () => instanceId,
    previewFrame,
    paneDoc,
    pinComposer,
    pinThread: () => pinThread,
  });
  const pinPeek = new PinPeek({
    paneLayout,
    paneDoc,
    pinComposer,
    openPin: () => pinThread.openPin,
  });
  const changeTour = new ChangeTour({
    instanceId: () => instanceId,
    paneSubject,
    paneNotice,
    previewFrame,
    paneDoc,
    cardPin: () => pinThread.cardPin,
    openCard: (id: string, via?: "key" | "pointer") =>
      pinThread.openCard(id, via),
    unread: () => pinThread.unread,
  });
  const pinThread = new PinThread({
    instanceId: () => instanceId,
    paneSubject,
    paneNotice,
    paneLayout,
    previewFrame,
    paneDoc,
    commentKit,
    pinComposer,
    paneMode,
    pinPeek,
    changeTour,
  });
  const pageCover = new PageCover({
    inset: () => inset,
    paneLayout,
    previewFrame,
    pinComposer,
    changeTour,
    pinThread,
  });
  const paneKeys = new PaneKeys({
    rail: () => rail,
    paneSubject,
    paneLayout,
    previewFrame,
    paneDoc,
    pinComposer,
    paneMode,
    pinThread,
  });
  const paneBrowser = new PaneBrowser({
    instanceId: () => instanceId,
    paneSubject,
    paneNotice,
  });
  const paneClose = new PaneClose({
    instanceId: () => instanceId,
    sheet: () => sheet,
    paneSubject,
    paneLayout,
  });
  const pageWire = new PageWire({
    instanceId: () => instanceId,
    onScreen: () => onScreen,
    paneSubject,
    paneNotice,
    previewReach,
    previewFrame,
    paneDoc,
    paneSheet,
    commentKit,
    pinComposer,
    paneMode,
    pinPeek,
    changeTour,
    pinThread,
    paneKeys,
  });
  /** The cover (its skeleton) stood over the frame, so its going is the skeleton's reveal. */
  let coverStood = false;
  /** The rail, for `/`: its search field takes the keyboard. */
  let rail = $state<ReturnType<typeof CommentRail>>();
  /** The mode's glyph and word, for its one-button form. */
  const MODE_GLYPHS = {
    interact: IconInteractLinear,
    comment: IconCommentLinear,
    draw: IconPenLinear,
  } as const satisfies Record<PreviewMode, unknown>;
  const MODE_WORDS: Record<PreviewMode, string> = {
    interact: "Interact",
    comment: "Comment",
    draw: "Draw",
  };
  /** The taken-over page's layouts, as the head's switch names them. */
  const LAYOUT_SEGMENTS = [
    {
      value: "phone",
      label: browserWords.phoneLayout,
      icon: IconPhoneLinear,
    },
    {
      value: "desk",
      label: browserWords.deskLayout,
      icon: IconMonitorLinear,
    },
  ] as const;

  /** A browser's head controls: Take over or Hand back, while held its layout switch and Reload page, and its address. */
  function browserItems(
    row: NonNullable<typeof paneBrowser.browserRow>
  ): HeadItem[] {
    const all: HeadItem[] = [];
    const shows = browserHead(row, {
      online: paneBrowser.browserMachine.online,
      viewing: paneBrowser.browserViewing,
      sheet: !!sheet,
    });
    if (shows.control) {
      all.push({
        key: "control",
        priority: HEAD_PRIORITY.control,
        bar: controlBar,
        menu: controlMenu,
        place: "prominent",
      });
    }
    // Held, the page's layout is the head's to switch, in the mode's
    // place (its centre, one glyph where the head is narrow). Reload page
    // stands in the glass on a desk, as a page's Reload does; a phone's
    // head holds Close, the switch and Hand back alone (a More beside them
    // leaves the switch no room), so there it stands at the page's foot
    // (BrowserView).
    if (row.takeover) {
      all.push({
        key: "layout",
        priority: HEAD_PRIORITY.mode,
        bar: layoutBar,
        compact: layoutCompact,
        menu: layoutMenu,
        group: true,
        place: "centre",
      });
      if (!sheet) {
        all.push({
          key: "reload-page",
          priority: HEAD_PRIORITY.reload,
          bar: reloadPageBar,
          menu: reloadPageMenu,
        });
      }
    }
    if (shows.address) {
      all.push({
        key: "address",
        priority: HEAD_PRIORITY.address,
        bar: addressBar,
        menu: addressMenu,
        place: "lead",
      });
    }
    return all;
  }

  /** The head's controls in head order, each standing by the head's priority rule while there is room (side/head.ts). */
  const headItems = $derived.by(() => {
    const all: HeadItem[] =
      paneSubject.isBrowser && paneBrowser.browserRow
        ? browserItems(paneBrowser.browserRow)
        : [];
    // A decision page's one Send is its own, at its foot (its doc's
    // `ownSend`): the head stands none for it.
    if (
      paneSubject.artifact &&
      paneDoc.unsentCount > 0 &&
      !paneDoc.view?.ownSend
    ) {
      all.push({
        key: "send",
        priority: HEAD_PRIORITY.send,
        bar: sendBar,
        menu: sendMenu,
        place: "prominent",
        words: true,
      });
    }
    // What acts on an artifact as a whole (the design graph's components
    // and view, Undock) stands in the head's More, last in
    // the glass; More stands only while it holds one of them, never as an
    // empty menu (a page or a preview has none of the graph's).
    const documentMenu =
      !!paneSubject.artifact && (!!paneSheet.graphHead || paneCanvas.canUndock);
    if (paneSubject.isBrowser) {
      return all;
    }
    if (!paneSubject.isCanvas) {
      all.push({
        key: "comments",
        priority: HEAD_PRIORITY.comments,
        bar: commentsBar,
        menu: commentsMenu,
        count: {
          glyph: IconChat,
          n: paneMode.listOpen ? 0 : paneDoc.openCount,
          of: "Comments",
        },
      });
    }
    // What acts on the artifact as a whole, rare: in the head's More, last
    // in the glass.
    if (documentMenu) {
      all.push({
        key: "actions",
        priority: HEAD_PRIORITY.reload,
        bar: documentCommands,
        menu: documentCommands,
        group: true,
        place: "more",
      });
    }
    all.push({
      key: "reload",
      priority: HEAD_PRIORITY.reload,
      bar: reloadBar,
      menu: reloadMenu,
    });
    if (paneSubject.artifact && !ownTab) {
      all.push({
        key: "open",
        priority: HEAD_PRIORITY.open,
        bar: openBar,
        menu: openMenu,
      });
    }
    return all;
  });

  export function parentEscape(event: KeyboardEvent) {
    paneKeys.parentEscape(event);
  }
</script>

<svelte:window
  onkeydown={(event) => {
    paneKeys.parentEscape(event);
    paneKeys.paneKey(event);
  }}
  onmessage={pageWire.receive}
/>

<!-- A frame that loaded no page, or the proxy's page naming the hop that
     failed: Try again (a reload of the frame), and the session that serves
     it, as the kit draws a link (Button `link`, as Caw's panel offers its
     settings). -->
{#snippet frameRetry()}
  <div class="flex flex-wrap items-center gap-space-2">
    <Button
      icon={IconRefresh}
      label={commonWords.tryAgain}
      onclick={previewFrame.retry}
      pending={previewFrame.retrying}
      pendingLabel={previewWords.reloading}
      size="sm"
      variant="outline"
    />
    {#if paneSubject.offerSession && paneSubject.owner}
      {@render sessionOpen()}
    {/if}
  </div>
{/snippet}

<!-- Its session, beside Try again, or the way by hand where it can't be asked here. -->
{#snippet sessionOpen()}
  {#if paneSubject.owner}
    <Button
      href={paneSubject.fleet.sessionHref(paneSubject.owner.id)}
      pad="none"
      label={`Open ${paneSubject.ownerName}`}
      size="sm"
      variant="link"
    />
  {/if}
{/snippet}

<!-- A version whose workspace is gone fills again only as its session makes
     it again (The Empty Starts Work Rule): asked in that session's composer
     where it stands beside this pane, unsent; else its session opened. -->
{#snippet goneAsk()}
  {@const composer = paneSubject.fleet.composer?.(instanceId)}
  <EmptyAsk
    byHand={sessionOpen}
    canStart={!!composer}
    label={previewWords.goneAskLabel(composer?.agent ?? paneSubject.ownerName)}
    onask={() =>
      composer?.ask(
        previewWords.goneAskWords(paneSubject.artifact?.title ?? "")
      )}
    reason={previewWords.goneCantAsk}
    size="sm"
  />
{/snippet}

<!-- A stage that went down or never drew: Try again, and its own words
     folded under Show details, as RowFault folds a machine's. -->
{#snippet stageRetry()}
  <Button
    icon={IconRefresh}
    label={sheetWords.tryAgain}
    onclick={previewFrame.retry}
    pending={previewFrame.retrying}
    pendingLabel={sheetWords.tryingAgain}
    size="sm"
    variant="outline"
  />
{/snippet}
{#snippet stageDetailsToggle()}
  <Button
    data-details
    aria-controls={stageCover.stageDetailsId}
    aria-expanded={stageCover.stageDetails}
    label={stageCover.stageDetails
      ? shellWords.hideDetails
      : shellWords.showDetails}
    onclick={() => {
      stageCover.stageDetails = !stageCover.stageDetails;
    }}
    size="sm"
    variant="ghost"
  />
{/snippet}
{#snippet stageDetailsText(said: string | null | undefined)}
  {#if said && stageCover.stageDetails}
    <p
      id={stageCover.stageDetailsId}
      data-slot="details"
      class="mt-space-2 text-ink-muted type-code liga-none whitespace-pre-wrap wrap-anywhere"
    >
      {said}
    </p>
  {/if}
{/snippet}

<!-- The head's controls, each as the head draws it and as More's entries
     (SideSurface `items`, by the head's priority rule): the bare symbols of
     its glass, the mode in its centre, and Send (or a browser's Take over)
     the one prominent action after the glass, on the coral. -->
{#snippet sendBar()}
  <!-- What of the page the session hasn't heard, picks and comments alike: one press sends it all. -->
  <Button
    data-slot="send"
    aria-label={`${commentWords.send}, ${paneDoc.unsentCount} unsent`}
    onclick={() => paneSend.sendAll("panel-head")}
    pending={paneSend.sending}
    shape="capsule"
    title="Send what the session hasn't heard"
  >
    <PendingContent icon={IconSend} pending={paneSend.sending} />
    <span data-slot="send-label" class="in-form-compact:hidden"
      >{commentWords.send}</span
    ><span data-slot="send-count" class="num">{paneDoc.unsentCount}</span>
  </Button>
{/snippet}
{#snippet sendMenu()}
  <DropdownMenu.Item
    disabled={paneSend.sending}
    onSelect={whileIdle(
      () => paneSend.sending,
      () => paneSend.sendAll("panel-more")
    )}
  >
    <IconSend /><span>{commentWords.sendCount(paneDoc.unsentCount)}</span>
  </DropdownMenu.Item>
{/snippet}

{#snippet controlBar()}
  <!-- A browser's Take over, or Hand back while the person holds it (core `words/browser.ts`). -->
  {@const holding = !!paneBrowser.browserRow?.takeover}
  <Button
    data-slot="browser-take"
    label={holding ? browserWords.handBack : browserWords.takeOver}
    onclick={paneBrowser.browserControl}
    pending={paneBrowser.browserActing}
    pendingLabel={holding ? browserWords.handingBack : browserWords.takingOver}
    shape="capsule"
    variant={holding ? "outline" : "default"}
  />
{/snippet}
{#snippet controlMenu()}
  {@const holding = !!paneBrowser.browserRow?.takeover}
  <DropdownMenu.Item
    disabled={paneBrowser.browserActing}
    onSelect={whileIdle(
      () => paneBrowser.browserActing,
      paneBrowser.browserControl
    )}
  >
    {#if holding}<IconLock />{:else}<IconGlobe />{/if}<span
      >{holding ? browserWords.handBack : browserWords.takeOver}</span
    >
  </DropdownMenu.Item>
{/snippet}

<!-- The taken-over page's layout, the head's segmented control (the
     kit's BarSegments): the phone's or the desktop's, symbols alone. -->
{#snippet layoutBar()}
  <BarSegments
    label={browserWords.layout}
    onValueChange={(next) => {
      paneBrowser.browserForm = next;
    }}
    segments={LAYOUT_SEGMENTS}
    value={paneBrowser.browserForm}
  />
{/snippet}
<!-- Where the head has no room for both segments: one bare symbol in the
     head's glass (SideSurface puts a compact centre control there), the
     glyph and the name of the layout a press gives. -->
{#snippet layoutCompact()}
  <BarItem
    icon={paneBrowser.browserForm === "phone"
      ? IconMonitorLinear
      : IconPhoneLinear}
    label={paneBrowser.browserForm === "phone"
      ? browserWords.toDeskLayout
      : browserWords.toPhoneLayout}
    onclick={() => {
      paneBrowser.browserForm =
        paneBrowser.browserForm === "phone" ? "desk" : "phone";
    }}
    props={{ "data-slot": "browser-layout" }}
  />
{/snippet}
{#snippet layoutMenu()}
  <DropdownMenu.Group>
    <DropdownMenu.GroupHeading>{browserWords.layout}</DropdownMenu.GroupHeading>
    <DropdownMenu.RadioGroup
      onValueChange={(next) => {
        paneBrowser.browserForm = next === "phone" ? "phone" : "desk";
      }}
      value={paneBrowser.browserForm}
    >
      <DropdownMenu.RadioItem value="phone"
        ><IconPhone /><span>{browserWords.phoneLayout}</span
        ></DropdownMenu.RadioItem
      >
      <DropdownMenu.RadioItem value="desk"
        ><IconMonitor /><span>{browserWords.deskLayout}</span
        ></DropdownMenu.RadioItem
      >
    </DropdownMenu.RadioGroup>
  </DropdownMenu.Group>
{/snippet}
{#snippet reloadPageBar()}
  <BarItem
    data-slot="other"
    icon={IconRefreshLinear}
    label={browserWords.reloadPage}
    onclick={() => paneBrowser.browserView?.reloadPage()}
  />
{/snippet}
{#snippet reloadPageMenu()}
  <DropdownMenu.Item onSelect={() => paneBrowser.browserView?.reloadPage()}>
    <IconRefresh /><span>{browserWords.reloadPage}</span>
  </DropdownMenu.Item>
{/snippet}

<!-- A browser's address, in the head's centre (BrowserAddress). -->
{#snippet addressBar()}
  <BrowserAddress
    connecting={!paneBrowser.browserViewing}
    mine={!!paneBrowser.browserRow?.takeover}
    origin={paneBrowser.browserRow?.origin ?? null}
  />
{/snippet}
{#snippet addressMenu()}
  <BrowserAddress
    as="menu"
    connecting={!paneBrowser.browserViewing}
    mine={!!paneBrowser.browserRow?.takeover}
    origin={paneBrowser.browserRow?.origin ?? null}
  />
{/snippet}

{#snippet undockMenu()}
  <DropdownMenu.Item
    disabled={!paneCanvas.stage}
    onSelect={() => paneCanvas.giveBack(false)}
  >
    <IconUndock /><span>Undock</span>
  </DropdownMenu.Item>
{/snippet}

{#snippet openBar()}
  {#if paneSubject.artifact}
    <!-- The same artifact, its doc and its tools, in a tab of its own. -->
    <BarItem
      data-slot="other"
      href={`/artifact/${encodeURIComponent(paneSubject.artifact.id)}`}
      icon={IconExternalLinear}
      label="Open in new tab"
      props={{ rel: "noopener", target: "_blank" }}
    />
  {/if}
{/snippet}
{#snippet openMenu()}
  {#if paneSubject.artifact}
    {@const artifact = paneSubject.artifact}
    <DropdownMenu.Item>
      {#snippet child({ props })}
        <a
          {...props}
          class={[props.class, "mark-line"]}
          href={`/artifact/${encodeURIComponent(artifact.id)}`}
          rel="noopener"
          target="_blank"><IconExternal /><span>Open in new tab</span></a
        >
      {/snippet}
    </DropdownMenu.Item>
  {/if}
{/snippet}

{#snippet modeBar()}
  <ModeSwitch onchange={paneMode.setMode} mode={paneMode.mode} />
{/snippet}
{#snippet modeMenu()}
  <DropdownMenu.Group>
    <DropdownMenu.GroupHeading>Mode</DropdownMenu.GroupHeading>
    <DropdownMenu.RadioGroup
      onValueChange={(next) =>
        paneMode.setMode(previewMode(next) ?? "interact")}
      value={paneMode.mode}
    >
      <DropdownMenu.RadioItem value="interact"
        ><IconInteract /><span>Interact</span><DropdownMenu.Shortcut
          >V</DropdownMenu.Shortcut
        ></DropdownMenu.RadioItem
      >
      <DropdownMenu.RadioItem value="comment"
        ><IconComment /><span>Comment</span><DropdownMenu.Shortcut
          >C</DropdownMenu.Shortcut
        ></DropdownMenu.RadioItem
      >
      <DropdownMenu.RadioItem value="draw"
        ><IconPen /><span>Draw</span><DropdownMenu.Shortcut
          >D</DropdownMenu.Shortcut
        ></DropdownMenu.RadioItem
      >
    </DropdownMenu.RadioGroup>
  </DropdownMenu.Group>
{/snippet}

<!-- The mode as one button where the tools have no room for its three
     segments (a phone, a narrow card): the chosen mode's glyph, opening the
     three. -->
{#snippet modeCompact()}
  <ModeButton
    glyph={MODE_GLYPHS[paneMode.mode]}
    keys="V, C, D"
    menu={modeMenu}
    word={MODE_WORDS[paneMode.mode]}
  />
{/snippet}

<!-- The comment being written: in its float by its target, or, a whole-page
     comment asked from the rail beside the page, hung from the rail's glass
     (CommentRail `pageComposer`). -->
{#snippet composerBody()}
  {#if pinComposer.composing && commentKit.kit && commentKit.nextDraft}
    {@const Composer = commentKit.kit.CommentComposer}
    <Composer
      action="Comment"
      chain={pinComposer.composing.chain.map((one) =>
        pinName({
          anchor: one.anchor,
          elements: one.elements,
        } as unknown as Pin)
      )}
      chosen={pinComposer.composing.chosen}
      draft={commentKit.nextDraft}
      focus
      onchange={() => commentKit.drafts?.changed(NEXT_COMMENT)}
      onchoose={(index) =>
        pinComposer.post({ type: "cawco:compose-target", index })}
      onhold={(text) => pinComposer.comment(text, true)}
      onsubmit={(text) => pinComposer.comment(text)}
      placeholder={commentWords.composeHint}
      sendError={pinComposer.composing.error}
      sending={pinComposer.composing.sending}
    />
  {/if}
{/snippet}

<!-- The composer beside its pill, in a room `w` by `h`: the pane's over a
     page, or one over a canvas's own layer. -->
{#snippet composerCard(w: number, h: number)}
  {#if pinComposer.composing && commentKit.kit && commentKit.nextDraft}
    <PinFloat
      bare
      box={pinComposer.composing.at?.box ?? null}
      label={commentWords.comment}
      mark={pinComposer.composing.at?.mark ?? null}
      room={{ w, h }}
      sheet={paneLayout.floatSheet}
      slot="pin-composer"
      bind:float={pinComposer.composerFloat}
    >
      {@render composerBody()}
    </PinFloat>
  {/if}
{/snippet}

<!-- A pin's thread as its card holds it: the drawn pin's whole, or the
     rested-on pin's as its peek (`peek`), the same card; `pushed`, opened
     in the Comments sheet over its list, Back leading. -->
{#snippet thread(
  pin: Pin,
  draft: ComposerDraft,
  peek: boolean,
  pushed = false,
  sheet = false
)}
  {#if commentKit.kit}
    {@const Card = commentKit.kit.PinCard}
    <Card
      agentName={paneSubject.owner ? paneSubject.ownerName : "The session"}
      changes={(paneDoc.view?.activity[pin.id]?.length ?? 0) > 0
        ? threadChanges
        : undefined}
      marked={peek || !!pinThread.pinAt?.mark}
      session={paneSubject.owner ? instanceId : null}
      {draft}
      link={pinThread.pinLink(pin.number)}
      live={pinThread.live.has(pin.id)}
      name={pin.movedAt ? commentWords.elementGone : pinName(pin)}
      back={pushed
        ? { to: commentWords.comments, onback: pinThread.backToList }
        : undefined}
      onclose={pushed
        ? () => paneMode.showList(false)
        : () => pinThread.closeCard()}
      sheet={pushed || sheet}
      ondelete={pinThread.deleteOpenPin}
      ondraft={() => commentKit.drafts?.changed(pin.id)}
      onfind={() => pinThread.focusPin(pin.id, true)}
      onplace={paneMode.placeElsewhere}
      onhold={(text) => pinThread.reply(text, true)}
      onreply={(text) => pinThread.reply(text)}
      onresolve={(resolved) => pinThread.resolvePin(resolved)}
      onretry={() => paneSend.retryPin(pin.id)}
      parent={!peek && pinThread.cardParent?.id === pin.id
        ? pinThread.cardParent.name
        : null}
      {peek}
      {pin}
      placing={paneMode.placing === pin.id}
      problem={peek ? null : pinThread.cardError}
      sending={!peek && pinThread.replying}
      retrying={paneSend.pinsRetrying.has(pin.id)}
      whyNotSent={paneSend.notSentWhy(pin)}
    />
  {/if}
{/snippet}
<!-- The open thread, joined to the comments card's leading edge (CommentsCard `thread`, `hungPin`). -->
{#snippet hungThread()}
  {#if pinThread.hungPin && commentKit.drafts}
    {@render thread(
      pinThread.hungPin,
      commentKit.drafts.draft(pinThread.hungPin.id),
      false
    )}
  {/if}
{/snippet}
<!-- Comments: on a phone the toggle of the well's foot sheet; elsewhere
     the card hangs from the head's glass, one shape with it as Caw's card
     is with his (the owner's pin on the Working area: "connected to the
     comments icon just like the top-right caw bar"), down to the card's
     foot. It stays while he works on the page: only Comments shuts it. -->
{#snippet commentsBar()}
  {#if paneLayout.railSheet || paneSubject.isCanvas}
    <CommentsButton
      count={paneDoc.openCount}
      down={paneDoc.linkDown ? NOT_REACHING : null}
      label={paneMode.commentsTitle}
      onclick={() => paneMode.showList(!paneMode.listOpen)}
      open={paneLayout.railSheet ? pinThread.railSheetOpen : paneMode.listOpen}
      held={paneDoc.heldCount}
      pinsShown={paneMode.pinsShown}
      answers={pinThread.unread.size}
    />
  {:else}
    <CommentsCard
      label={commentWords.comments}
      onOpenChange={(open) => paneMode.showList(open)}
      open={paneMode.listOpen && paneLayout.listShown}
      panel={paneLayout.section}
      thread={pinThread.hungPin && commentKit.kit && commentKit.drafts
        ? hungThread
        : null}
      threadKey={pinThread.hungPin?.id}
      threadLabel={pinThread.hungPin
        ? `Comment ${pinThread.hungPin.number}`
        : undefined}
    >
      {#snippet trigger(props)}
        <CommentsButton
          count={paneDoc.openCount}
          down={paneDoc.linkDown ? NOT_REACHING : null}
          label={paneMode.commentsTitle}
          open={paneMode.listOpen}
          held={paneDoc.heldCount}
          pinsShown={paneMode.pinsShown}
          {props}
          answers={pinThread.unread.size}
        />
      {/snippet}
      {@render railOf("beside")}
    </CommentsCard>
  {/if}
{/snippet}
{#snippet commentsMenu()}
  <DropdownMenu.Item onSelect={() => paneMode.showList(!paneMode.listOpen)}>
    <IconChat /><span>Comments</span>{#if paneDoc.openCount > 0}<span
        class="ms-auto text-ink-muted num"
        data-slot="count">{paneDoc.openCount}</span
      >{/if}
  </DropdownMenu.Item>
{/snippet}

{#snippet reloadBar()}
  <BarItem
    data-slot="other"
    icon={IconRefreshLinear}
    label="Reload"
    onclick={previewFrame.reloadPage}
  />
{/snippet}
{#snippet reloadMenu()}
  <DropdownMenu.Item onSelect={previewFrame.reloadPage}>
    <IconRefresh /><span>Reload</span>
  </DropdownMenu.Item>
{/snippet}

<!-- The artifact's document commands, in its title's menu (ArtifactMenu
     `commands`): what acts on it as a whole. -->
{#snippet documentCommands()}
  {#if paneSheet.graphHead?.components}
    {@render paneSheet.graphHead.components()}
    <DropdownMenu.Separator />
  {/if}
  {#if paneSheet.graphHead}
    {@render paneSheet.graphHead.more()}
    <DropdownMenu.Separator />
  {/if}
  {#if paneCanvas.canUndock}
    {@render undockMenu()}
  {/if}
{/snippet}

<!-- A thread's change lines, under its replies: every one the hub kept for it. -->
{#snippet threadChanges(pin: Pin)}
  <ChangeLines
    asking={changeTour.askingAgain.has(pin.id)}
    lines={(paneDoc.view?.activity[pin.id] ?? []).map(lineOfActivity)}
    onask={() => changeTour.askAgainPin(pin.id)}
    step={changeTour.stepToChange}
    unanswered={changeTour.changedNoAnswer(pin)}
  />
{/snippet}

{#snippet railOf(layout: "beside" | "sheet")}
  <CommentRail
    bind:this={rail}
    down={paneDoc.linkDown}
    held={paneDoc.heldCount}
    onsendheld={paneDoc.sendHeldNow}
    onsendrefusedclosed={() => {
      if (paneSubject.artifactId) {
        paneDoc.keepSendRefused(paneSubject.artifactId, null);
      }
    }}
    sendRefused={paneDoc.sendRefused}
    focused={pinThread.focusedPin}
    hold={paneDoc.listHold}
    {layout}
    live={pinThread.live}
    onclose={() => paneMode.showList(false)}
    onhover={(id) => previewFrame.post({ type: "cawco:hover-pin", id })}
    onopen={pinThread.openCard}
    onpage={() => {
      if (pinThread.openPin) {
        pinThread.closeCard();
      }
      pinComposer.composingPage = true;
      previewFrame.post({ type: "cawco:compose-page" });
    }}
    onpageclose={pinComposer.cancelComposer}
    pageComposer={composerBody}
    pageOpen={pinThread.pageHung}
    onresolve={(id, resolved) => pinThread.resolvePin(resolved, id)}
    onretry={paneDoc.relink}
    onretrypin={paneSend.retryPin}
    onshown={(ids) => {
      pinThread.railOrder = ids;
    }}
    open={pinThread.openPin}
    whyNotSent={paneSend.notSentWhy}
    pins={paneDoc.pins}
    retrying={paneSend.pinsRetrying}
    unread={pinThread.unread}
    bind:filter={pinThread.listFilter}
    bind:scroll={pinThread.listScroll}
    bind:sort={paneMode.railSort}
  />
{/snippet}

{#if inset}
  <!-- Inset: no head and no modes; the page as the panel draws it. -->
  <section
    data-slot="preview-pane"
    data-preview-inset
    aria-label={paneSubject.artifact?.title ?? "Preview"}
    class="@container flex flex-col flex-1 min-h-0"
    bind:this={paneLayout.section}
  >
    <div
      class="relative flex flex-col flex-1 min-h-0 overflow-hidden border border-border-well rounded-sm bg-surface-well"
      bind:this={paneLayout.well}
    >
      {@render framed()}
    </div>
  </section>
{:else}
  <SideSurface
    of="preview"
    mode={paneSubject.isCanvas || paneSubject.isBrowser
      ? undefined
      : paneMode.mode}
    items={headItems}
    label="Preview"
    onclose={ownTab ? paneClose.backToSession : paneClose.close}
    placement={sheet ? "sheet" : "beside"}
    subtitle={paneSheet.graphHead ? paneSheet.graphHead.line : paneDoc.headLine}
    subtitleId={`${paneId}-line`}
    {switcher}
    {switcherAt}
    bind:section={paneLayout.section}
    bind:well={paneLayout.well}
  >
    {@render framed()}
  </SideSurface>
{/if}

<!-- Changed since you looked: a glass among the tools over the drawing's foot (ChangesTag). -->
{#snippet changesBar()}
  {#if changeTour.changeStops.length > 0 && !paneSubject.isCanvas}
    <ChangesTag
      at={changeTour.tour ? changeTour.tourAt : null}
      onoff={() => {
        changeTour.tour = null;
      }}
      onstep={changeTour.stepChange}
      total={changeTour.tour?.length ?? changeTour.changeStops.length}
      bind:ref={changeTour.changesTag}
    />
  {/if}
{/snippet}

<!-- The page's frame (and, while a new one loads, the one it replaces): in
     the well, or in a component artifact's design graph's stage. -->
{#snippet frameTags()}
  {#each previewReach.reached?.origin === previewReach.paneOrigin ? previewFrame.frames : [] as key (key)}
    {@const current = key === previewFrame.frameKey}
    <!-- biome-ignore lint/a11y/noNoninteractiveElementInteractions: load starts the overlay handshake. -->
    <!-- biome-ignore lint/security/useIframeSandbox: the previewed app runs on its own origin (the preview proxy's), which is the boundary; a sandbox would take the forms, popups and downloads it is being tried with. -->
    <iframe
      data-ready={!current || previewFrame.loaded || undefined}
      class="absolute inset-x-0 top-(--page-top) block h-(--page-h) w-full scheme-light scheme-dark:scheme-dark bg-system-canvas border-none border-current opacity-0 transition-[opacity] duration-(--duration-control) ease-out data-ready:opacity-100"
      style:--page-top={previewFrame.headRoomTaken || paneSheet.inGraph
        ? "0px"
        : "var(--side-room, 0px)"}
      style:--page-h="calc(100% - var(--page-top))"
      allow="clipboard-write"
      inert={!current}
      onerror={() => previewFrame.arrived(key)}
      onload={() => {
        previewFrame.arrived(key);
        if (key === previewFrame.frameKey) {
          previewFrame.loadedFrame(key);
          previewFrame.announce();
        }
      }}
      src={`${previewReach.paneOrigin}${previewReach.framePlace}`}
      data-scheme={paneSubject.themedFrame ? theme.resolved : undefined}
      title="Preview"
      {@attach (node) => {
        if (key === previewFrame.frameKey) {
          previewFrame.iframe = node;
          previewFrame.frameSince = performance.now();
        }
      }}
    ></iframe>
  {/each}
{/snippet}

<!-- The page in the well, and what stands over it: the panel's and an
     inset's alike. -->
{#snippet framed()}
  {#if paneSubject.isCanvas}
    <!-- The canvas's stage stands over this box: its one iframe. The stage
         is a layer on the body over every page layer (CanvasStages,
         `--layer-stage`), so it can never run beneath the head's glass as a
         page in a frame does: the box starts under the head's room, and the
         head's title, controls and Close stand whatever the canvas holds. -->
    <div
      data-slot="canvas-slot"
      aria-hidden="true"
      class="absolute inset-x-0 bottom-0 top-(--slot-top) pointer-events-none"
      style:--slot-top={inset ? "0px" : "var(--side-room, 0px)"}
      bind:this={paneCanvas.canvasSlot}
    ></div>
  {:else if paneSubject.isBrowser && paneSubject.artifact}
    <BrowserView
      bind:this={paneBrowser.browserView}
      addressAtFoot={!!sheet}
      artifactId={paneSubject.artifact.id}
      browser={paneBrowser.browserRow}
      bind:form={paneBrowser.browserForm}
      {instanceId}
      machine={paneBrowser.browserMachine}
      bind:viewing={paneBrowser.browserViewing}
    />
  {:else if previewReach.unopened}
    <!-- The hub opened no origin for it (every preview port in use): its
         words, and Try again asks it again. -->
    <div
      data-slot="down"
      data-unopened
      class="absolute inset-0 overflow-auto px-space-6 pt-(--side-room,0px) bg-surface-well"
      role="alert"
      transition:appear
    >
      <EmptyState icon={IconAlert} title={previewWords.notOpenedTitle}>
        {#snippet line()}
          {previewReach.unopened}
        {/snippet}
        {#snippet action()}
          <Button
            icon={IconRefresh}
            label={commonWords.tryAgain}
            onclick={() => {
              previewReach.addressTries += 1;
            }}
            pending={previewReach.addressAsking}
            pendingLabel="Trying again…"
            size="sm"
            variant="outline"
          />
        {/snippet}
      </EmptyState>
    </div>
  {:else if previewReach.unreached}
    <!-- This tab can't reach the preview's own origin: what failed, by its
         own cause, its fix, and where to switch how previews are reached. -->
    <div
      data-slot="down"
      class="absolute inset-0 overflow-auto px-space-6 pt-(--side-room,0px) bg-surface-well"
      role="alert"
      transition:appear
    >
      <EmptyState icon={IconAlert} title={previewWords.cantBeReached}>
        {#snippet line()}
          {previewReach.unreachedBy?.said}
          {previewWords.tryingAgain}
        {/snippet}
        {#snippet action()}
          <div class="flex flex-wrap items-center gap-space-2">
            <Button
              icon={IconRefresh}
              label={commonWords.tryAgain}
              onclick={() => {
                previewReach.probe += 1;
              }}
              pending={previewReach.probing}
              pendingLabel="Trying again…"
              size="sm"
              variant="outline"
            />
            <Button
              href="/config/previews"
              pad="none"
              label="Preview settings"
              size="sm"
              variant="link"
            />
          </div>
        {/snippet}
      </EmptyState>
    </div>
  {:else}
    <!-- The frame loads once its origin answered the probe; the cover stands
         meanwhile. A component artifact's frame stands in its design graph's
         stage (the graph's chrome round it, the panel's DOM). -->
    {#if paneSheet.inGraph && paneSubject.artifact && paneSheet.link && paneSheet.sheetCanvas}
      <div data-slot="graph-host" class="absolute inset-0">
        <!-- The graph runs to the card's top under the floating head and
             takes its room on its own page (DesignGraph). -->
        <DesignGraph
          bind:head={paneSheet.graphHead}
          changesTools={changesBar}
          modeTools={modeBar}
          {modeCompact}
          ask={paneSubject.artifact.ask ?? ""}
          files={paneSheet.sheetCanvas.files}
          frame={frameTags}
          inspector={paneSheet.inspector}
          link={paneSheet.link}
          keptDials={paneSheet.keptDials}
          memory={`cawco-graph-kept:${paneSubject.artifact.id}`}
          keptTuned={paneSheet.keptTuned}
          startFace={paneSheet.startFace}
          ondials={(values) => {
            // His dial values are the artifact's: its doc's `dials`, which
            // the panel's Send counts and artifact_read answers.
            const refused = paneDoc.doc?.keep("dials", values);
            if (refused) {
              paneNotice.say({ message: refused, again: null });
            }
          }}
          ontuned={(records) => {
            // His tuning of every move is the artifact's: its doc's `tuned` map, which artifact_read answers.
            const refused = paneDoc.doc?.keepTuned(records);
            if (refused) {
              paneNotice.say({ message: refused, again: null });
            }
          }}
          spec={paneSheet.sheetCanvas.spec}
          stale={paneDoc.linkDown !== null}
        />
      </div>
    {:else}
      {@render frameTags()}
    {/if}
    <div
      data-ready={((previewFrame.loaded || previewFrame.standing !== null) &&
        !stageCover.stageWaiting) ||
        undefined}
      data-slot="cover"
      aria-hidden={stageCover.stageWaiting ? undefined : "true"}
      class="group/cover absolute inset-x-0 top-(--side-room,0px) bottom-0 p-space-5 bg-surface-recess pointer-events-none transition-[opacity] duration-(--duration-control) ease-out data-ready:opacity-0"
      role={stageCover.stageWaiting ? "status" : undefined}
      {@attach (node) => {
        // Ready, the cover and its skeleton go in the skeleton's reveal and
        // the frame comes out of its blur on the same clock (motion/curves).
        if (!(
          (previewFrame.loaded || previewFrame.standing !== null) &&
          !stageCover.stageWaiting
        )) {
          coverStood = true;
        } else if (coverStood) {
          coverStood = false;
          revealOn(node, "out");
          if (previewFrame.iframe) {
            revealOn(previewFrame.iframe, "in");
          }
        }
      }}
    >
      <!-- Unseen until the wait has lasted --duration-wait-grace, then fading up
           (The Real Wait Rule); held still, pulse and all, once the cover is
           ready and fading out. The wrapper carries the wait, so the
           skeleton's own opacity is its pulse's. -->
      <div
        class="animate-wait-grace-in group-data-ready/cover:animation-paused"
      >
        <Skeleton
          class="w-2/5"
          data-slot="block"
          hold="cover"
          line="body"
          radius="text"
        />
      </div>
      {#if stageCover.stageWaiting}
        <CoverState waiting={stageCover.stageWaiting} />
      {/if}
    </div>
    {#if stageCover.compileErrors.length > 0}
      {@const first = stageCover.compileErrors[0]}
      <!-- The last good render stays under it, dimmed; the session is told of it on its own. -->
      <div
        aria-hidden="true"
        class="absolute inset-0 bg-scrim pointer-events-none"
        transition:appear
      ></div>
      <div
        data-slot="sheet-error"
        class="absolute inset-x-space-3 bottom-space-3 grid gap-space-2 max-h-3/5 overflow-auto p-space-3 border border-border-hairline rounded-md bg-surface-raised shadow-tile"
        role="alert"
        transition:appear
      >
        <p class="m-0 text-error-9 text-size-body font-medium">
          {errorTitle(first.kind)}
          <code class="type-code">{errorPlace(first)}</code>
        </p>
        <p class="m-0 text-ink-muted type-meta">
          {first.message.split("\n")[0]}
        </p>
        {#if first.frame}
          <pre
            class="m-0 overflow-x-auto p-space-2 rounded-sm bg-surface-recess text-ink-strong type-code">{first.frame}</pre>
        {/if}
        <p class="m-0 text-ink-muted type-meta">
          {first.kind === "missing"
            ? sheetWords.missingNext(stageCover.compileErrors.length - 1)
            : sheetWords.errorNext(stageCover.compileErrors.length - 1)}
        </p>
      </div>
    {/if}
  {/if}
  {#if stageCover.staged?.status === "error"}
    {@const staged = stageCover.staged}
    <!-- The stage or the server didn't start, or failed its restarts: where the page would be. -->
    <div
      data-slot="down"
      class="absolute inset-0 overflow-auto px-space-6 pt-(--side-room,0px) bg-surface-well"
      role="alert"
      transition:appear
    >
      <EmptyState
        icon={IconAlert}
        title={paneSubject.served
          ? sheetWords.serverDownTitle(paneSubject.served.port)
          : sheetWords.downTitle(staged.dir)}
      >
        {#snippet line()}
          {staged.runs === "sheet"
            ? sheetWords.downLine(sheetWords.toolchains[staged.toolchain])
            : sheetWords.serverDownLine}
        {/snippet}
        {#snippet action()}
          <div class="flex flex-wrap items-center gap-space-2">
            {@render stageRetry()}
            {#if staged.message}
              <!-- The stage's own words, as RowFault folds a machine's: under Show details. -->
              {@render stageDetailsToggle()}
            {/if}
          </div>
          {@render stageDetailsText(staged.message)}
        {/snippet}
      </EmptyState>
    </div>
  {/if}
  {#if stageCover.neverDrawn && stageCover.staged?.status !== "error"}
    <!-- On its way past the time its stage is given: never an endless cover. -->
    <div
      data-slot="down"
      class="absolute inset-0 overflow-auto px-space-6 pt-(--side-room,0px) bg-surface-well"
      data-never-drawn
      role="alert"
      transition:appear
    >
      <EmptyState icon={IconAlert} title={sheetWords.neverDrawnTitle}>
        {#snippet line()}
          {sheetWords.neverDrawnLine(
            Math.round((stageCover.waitingFor ?? STAGE_READY_MS) / 1000)
          )}
        {/snippet}
        {#snippet action()}
          <div class="flex flex-wrap items-center gap-space-2">
            {@render stageRetry()}
            <Button
              icon={IconTrash}
              label={sheetWords.remove}
              onclick={stageCover.removeShown}
              size="sm"
              variant="ghost"
            />
            {#if stageCover.stageSaid}
              <!-- The stage's own last words, folded as the down stage's are. -->
              {@render stageDetailsToggle()}
            {/if}
          </div>
          {@render stageDetailsText(stageCover.stageSaid)}
          <AskHere asker={stageCover.removeAsks} at="never-drawn-remove" />
        {/snippet}
      </EmptyState>
    </div>
  {/if}
  {#if stageCover.shownDown && stageCover.staged?.status !== "error" && !stageCover.neverDrawn}
    <!-- What happened, why and the way back, where the page would be; a stage in error says it above. -->
    <div
      data-slot="down"
      data-down={stageCover.shownDown}
      class="absolute inset-0 overflow-auto px-space-6 pt-(--side-room,0px) bg-surface-well"
      role="alert"
      transition:appear
    >
      <!-- A version whose workspace is gone is no fault that may pass: it is archived, and says so. -->
      <EmptyState
        icon={stageCover.shownDown === "gone" ? IconArchive : IconAlert}
        title={stageCover.downTitle}
        action={stageCover.shownDown === "gone" ? goneAsk : frameRetry}
      >
        {#snippet line()}
          {#if stageCover.shownDown === "gone"}
            {previewWords.goneLine}
          {:else if stageCover.shownDown === "workspace"}
            Its server can't be reached until the workspace runs again. Once a
            session there is back, try again.
          {:else if stageCover.shownDown === "server"}
            {paneSubject.downPort
              ? `${previewWords.nothingOnPort(paneSubject.downPort)} on ${paneSubject.ownerMachine}, so the page can't load.`
              : `The page's server on ${paneSubject.ownerMachine} isn't running, so the page can't load.`}
            {#if paneSubject.served}
              CawCo starts it again by itself; try again in a moment.
            {:else if paneSubject.offerSession}
              {previewWords.startFromSession}
            {:else}
              Start it again, then try again.
            {/if}
          {:else if stageCover.shownDown === "reach"}
            The way to the page's server on {paneSubject.ownerMachine} didn't open{stageCover.shownWhy
              ? `: ${stageCover.shownWhy}`
              : "."}
            Try again; if it fails again, start the server again from its session.
          {:else if stageCover.shownDown === "closed"}
            Its session shows something else now, or has ended, so there is no
            page here. Open its session to show it again.
          {:else if stageCover.shownDown === "error"}
            {previewWords.errorLine(stageCover.shownWhy ?? "with an error")}
          {:else if stageCover.shownDown === "crashed"}
            {previewWords.crashedLine(stageCover.shownWhy ?? "no message")}
          {:else}
            The preview comes from {paneSubject.ownerMachine}, which isn't
            answering the hub{stageCover.shownWhy
              ? `: ${stageCover.shownWhy}`
              : "."} Once it answers, try again.
          {/if}
          {#if !previewFrame.down && stageCover.docDown}
            <span
              class="block mt-space-2 text-ink-muted type-meta"
              data-slot="unreached"
              >{sheetWords.unreachedSince(
                formatTimestamp(new Date(stageCover.docDown.since)),
                stageCover.docDown.why
              )}</span
            >
          {/if}
        {/snippet}
      </EmptyState>
    </div>
  {/if}
  {#if previewFrame.notLoaded && !stageCover.shownDown && stageCover.staged?.status !== "error" && !stageCover.neverDrawn}
    <!-- The browser's own error page stands in the frame: said in words, with the way back. -->
    <div
      data-slot="down"
      class="absolute inset-0 overflow-auto px-space-6 pt-(--side-room,0px) bg-surface-well"
      data-not-loaded
      role="alert"
      transition:appear
    >
      <EmptyState icon={IconAlert} title={previewWords.notLoadedTitle}>
        {#snippet line()}
          {previewWords.notLoadedLine(paneSubject.ownerMachine)}
        {/snippet}
        {#snippet action()}
          {@render frameRetry()}
        {/snippet}
      </EmptyState>
    </div>
  {/if}
  {#if previewFrame.picking}
    <PlacePick
      oncancel={previewFrame.cancelPick}
      onpick={previewFrame.pickedPlace}
    />
  {/if}
  {#if pinThread.railSheetDrawn}
    <!-- The rail as the well's bottom sheet, on a phone and in a pane under
         640px: the kit's drawer (ThreadSheet's host), its grabber and two
         stops, half its room where it opens and the whole room (HIG, Sheets:
         "Include a grabber in a resizable sheet"; the medium and large
         detents), dragged below the lower one it goes, as Close does. A
         layer over the page: the frame keeps its whole box under it, so the
         page neither moves, resizes nor scrolls as it opens, drags or
         closes. A thread opened while it stands opens in it, over the list,
         Back leading (HIG, Sheets: "Display only one sheet at a time"); it
         stands aside while a composer or a place picker stands, and comes
         back as it was. In the phone's preview sheet (`sheet`) its room is
         the panel's card under its head, itself a share of the screen, and
         half of it held the bar and the lists' tabs alone: there it opens
         at its whole room, the comments under its bar, and a drag takes it
         to half. -->
    <ThreadSheet
      label={pinThread.threadPushed && pinThread.cardPin
        ? `Comment ${pinThread.cardPin.number}`
        : commentWords.comments}
      onclose={() => paneMode.showList(false)}
      onclosed={() => {
        if (!pinThread.railSheetOpen) {
          pinThread.railSheetDrawn = false;
        }
      }}
      onmoved={() => pageCover.sayCovered?.()}
      open={pinThread.railSheetOpen}
      short={pinThread.railShort}
      tall={sheet && !pinThread.railShort}
      bind:surface={pinThread.railSurface}
    >
      {#if pinThread.threadPushed && pinThread.cardPin && commentKit.kit && commentKit.replyDraft}
        {#key pinThread.cardPin.id}
          {@render thread(
            pinThread.cardPin,
            commentKit.replyDraft,
            false,
            true,
            true
          )}
        {/key}
      {:else}
        {@render railOf("sheet")}
      {/if}
    </ThreadSheet>
  {/if}
  <!-- What stands over the page beside a pill, in the frame's box:
       the composer while a comment is written, the thread once it is, and
       the peek while the pointer rests on one. -->
  <!-- The size container a card's width reads (`--spacing-c-pin-card-reading-w`, two fifths of the well).
       It stands where the frame stands (a component artifact's stage, a page under the head's room), so a place the page says is a place on it. -->
  <div
    data-slot="pin-room"
    class={[
      "@container absolute pointer-events-none",
      previewFrame.frameBox
        ? "start-(--frame-x) top-(--frame-y) w-(--frame-w) h-(--frame-h)"
        : "inset-0",
    ]}
    style:--frame-x={previewFrame.frameBox
      ? `${previewFrame.frameBox.x}px`
      : undefined}
    style:--frame-y={previewFrame.frameBox
      ? `${previewFrame.frameBox.y}px`
      : undefined}
    style:--frame-w={previewFrame.frameBox
      ? `${previewFrame.frameBox.w}px`
      : undefined}
    style:--frame-h={previewFrame.frameBox
      ? `${previewFrame.frameBox.h}px`
      : undefined}
    data-mode={paneMode.mode !== "interact" && !paneSubject.isCanvas
      ? paneMode.mode
      : undefined}
    {@attach pinThread.measureRoom}
  >
    {#if !(pinThread.pageHung || paneSubject.isCanvas)}
      {@render composerCard(pinThread.roomW, pinThread.roomH)}
    {/if}
    <!-- The drawn pin's card (`drawnPin`); each pin's card is its own, so
         another's never moves to it. -->
    {#if pinThread.cardPin && commentKit.kit && commentKit.replyDraft && !pinThread.threadPushed && !pinThread.threadHung}
      {#key pinThread.cardPin.id}
        {#if paneLayout.floatSheet}
          <!-- On a phone and under a finger, the thread is the well's
               bottom sheet, dragged between its stops (ThreadSheet): it
               opens at half its room, the page lifted so the pin's pill
               and its element stand above it (what the comment is about
               in view), and goes to the whole room on a drag. -->
          <ThreadSheet
            label={`Comment ${pinThread.cardPin.number}`}
            onclose={() => pinThread.closeCard()}
            onclosed={() => {
              if (!pinThread.openPin) {
                pinThread.closingPin = null;
              }
            }}
            onmoved={() => pageCover.sayCovered?.()}
            open={pinThread.openPin !== null}
            short={pinThread.placingThread}
            bind:surface={pinThread.cardFloat}
          >
            {@render thread(
              pinThread.cardPin,
              commentKit.replyDraft,
              false,
              false,
              true
            )}
          </ThreadSheet>
        {:else}
          <PinFloat
            box={pinThread.pinAt?.box ?? null}
            label={`Comment ${pinThread.cardPin.number}`}
            mark={pinThread.pinAt?.mark ?? null}
            onclosed={() => {
              if (!pinThread.openPin) {
                pinThread.closingPin = null;
              }
            }}
            open={pinThread.openPin !== null}
            pin={pinThread.cardPin.number}
            room={{ w: pinThread.roomW, h: pinThread.roomH }}
            slot="pin-card"
            bind:float={pinThread.cardFloat}
          >
            {@render thread(pinThread.cardPin, commentKit.replyDraft, false)}
          </PinFloat>
        {/if}
      {/key}
    {/if}
    <!-- The rested-on pin's peek: the same card beside its pill, his words
         and the latest reply alone; a press on it opens the whole thread. -->
    {#if pinPeek.peekPin && pinPeek.peekAt && commentKit.drafts}
      {#key pinPeek.peekPin.id}
        <PinFloat
          label={`Comment ${pinPeek.peekPin.number}`}
          mark={pinPeek.peekAt.mark}
          onpress={() => {
            const id = pinPeek.peekPin?.id;
            if (id) {
              pinThread.openCard(id);
            }
          }}
          onrest={pinPeek.restOnPeek}
          pin={pinPeek.peekPin.number}
          room={{ w: pinThread.roomW, h: pinThread.roomH }}
          slot="pin-peek"
        >
          {@render thread(
            pinPeek.peekPin,
            commentKit.drafts.draft(pinPeek.peekPin.id),
            true
          )}
        </PinFloat>
      {/key}
    {/if}
  </div>
  {#if paneSubject.isCanvas && paneCanvas.canvasBox}
    <!-- A canvas stands on its own layer over the panel (CanvasStages):
         the composer of a Comment on its ink stands in a room over that
         layer, in the canvas's box, so a place the canvas says is a place
         on it. -->
    <Portal>
      <div
        data-slot="canvas-pin-room"
        class="@container fixed z-(--layer-float) pointer-events-none left-(--frame-x) top-(--frame-y) w-(--frame-w) h-(--frame-h)"
        style:--frame-x={`${paneCanvas.canvasBox.x}px`}
        style:--frame-y={`${paneCanvas.canvasBox.y}px`}
        style:--frame-w={`${paneCanvas.canvasBox.w}px`}
        style:--frame-h={`${paneCanvas.canvasBox.h}px`}
      >
        {@render composerCard(paneCanvas.canvasBox.w, paneCanvas.canvasBox.h)}
      </div>
    </Portal>
  {/if}
  {#if paneNotice.failure || paneNotice.paneRefused}
    <!-- The pane's own line: a frame's failure, or an act of the pane's the
         hub refused, kept through a reload. -->
    <div
      data-slot="failure"
      data-pane-failure
      class="absolute inset-x-0 bottom-0 flex flex-wrap items-center gap-x-space-3 gap-y-space-2 px-space-3 py-space-2 bg-surface-raised border-t border-border-hairline"
      role="alert"
      transition:appear
    >
      <p
        class="flex-1 basis-c-draft-line min-w-0 m-0 text-error-9 text-size-body font-normal text-pretty wrap-anywhere"
      >
        {paneNotice.failure
          ? paneNotice.failure.message
          : paneNotice.paneRefused?.reason}
      </p>
      {#if paneNotice.failure?.again === "reload"}
        <Button
          label={commonWords.tryAgain}
          onclick={previewFrame.retry}
          pending={previewFrame.retrying}
          pendingLabel="Reloading…"
          size="sm"
          variant="outline"
        />
      {:else if !paneNotice.failure && paneNotice.paneRefused}
        <Button
          data-again
          label={commonWords.tryAgain}
          onclick={paneNotice.rerun}
          pending={paneNotice.rerunning}
          pendingLabel="Trying again…"
          size="sm"
          variant="outline"
        />
      {/if}
    </div>
  {/if}
  {#if !(paneSubject.isCanvas || paneSubject.isBrowser || paneSheet.inGraph)}
    <PreviewTools
      lift={changeTour.pageFoot}
      bind:height={changeTour.toolsHeight}
    >
      {@render modeBar()}
      {@render changesBar()}
    </PreviewTools>
  {/if}
{/snippet}
