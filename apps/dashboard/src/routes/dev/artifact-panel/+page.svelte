<script lang="ts">
  /**
   * The artifact panel whole, for judging it at its widths: its head (the
   * artifact's title and its menu, the mode, the glass, Close), the page in
   * its well, the Comments card hung from the head's Comments on a desk (a
   * thread opened from it joined to its leading edge) and the Comments sheet
   * over it on a phone (under 640px), and a thread opened. The real parts
   * (SideSurface, CommentsCard, CommentRail, ThreadSheet, PinCard) on
   * real records (records.ts): the decision page title-bars-close, its five
   * pins as they stand, and the session's artifacts. The page is its own
   * picture (the bench reaches no hub, and the page's doc is the hub's), and
   * the artifacts menu's read of the hub is answered here from the records.
   *
   * `?state=`: `rest` (the rail shut), `rail` (the open comments; on a
   * phone the sheet at half its room), `full` (the phone's sheet at its
   * whole room), `resolved`, `none` (no comments at all), `check` (To check
   * holds two while Open is in front), `sort` (the rail's Sort menu open),
   * `search` (searching "HIG", with hits), `miss` (searching, none),
   * `artifacts` (the title's menu open), `thread` (comment 4 opened; on a
   * phone in the Comments sheet, Back leading), `changes` (Changed since you
   * looked over the page's foot), `long` (150 comments), `compose` (a
   * comment on the whole page being written), `more` (the head's More open,
   * where the head has one), `mode`
   * (the mode's one-button form open, where the head draws it), `delete`
   * (comment 4's Delete pressed: its question under the card's bar),
   * `remove` (the artifacts menu's Remove pressed: its question in the menu),
   * `gone` (comment 4 opened, its element gone from the page), `place` (its
   * Pin it somewhere else pressed: on a phone the sheet at its low stop),
   * `unsent` (comment 4 opened, its edit's delivery reaching no one: why,
   * with Try again),
   * `found` (Resolved in front, searching "HIG": the hits in every list),
   * `scrolled` (the page scrolled to its foot, its top under the head's glass),
   * `held` (three comments held to send together: Send 3 trailing the rail's
   * bar, Search, + and Sort folded into More leading, each row Unsent, the
   * head's bubble ringed), `fold` (held, the rail's More open), `note` (Send
   * all pressed: its note under the bar), `hold` (a comment being written: Hold beside send),
   * and on a desk the card's pour, the Comments card shut: `pour` (it pours
   * out of comment 4's pill once the panel stands), `drain` (it drains back), `turn` (it opens and
   * is closed half way, turning back from where it is drawn); `?slow=n`
   * runs the pour n times as long; `?count=n` sets the head's Comments
   * badge to n (5, 12, 150, 1500).
   * The picture stands for a decision page as the panel shows it: its own
   * title left out under the head, which names it (overlay
   * `data-cawco-headed`), under the head's room, its scrollbar undrawn
   * (overlay `data-cawco-bare-scroll`). The head is the owner's picks: the
   * title over its description, the Comments beside the page.
   */
  import { type Pin, pinHeld } from "@cawco/core/comments/model";
  import { hubRequest } from "@cawco/core/hub-request";
  import { commentWords } from "@cawco/core/words/comments";
  import { onMount } from "svelte";
  import { MediaQuery } from "svelte/reactivity";
  import { frameSize } from "#lib/cawco/frame-observer.js";
  import { dur } from "#lib/cawco/motion/curves.svelte.js";
  import { pressOutside } from "#lib/cawco/press-outside.js";
  import ChangesTag from "#lib/cawco/preview/ChangesTag.svelte";
  import CommentComposer from "#lib/cawco/preview/CommentComposer.svelte";
  import CommentRail from "#lib/cawco/preview/CommentRail.svelte";
  import CommentsButton from "#lib/cawco/preview/CommentsButton.svelte";
  import CommentsCard from "#lib/cawco/preview/CommentsCard.svelte";
  import type { RailList, RailSort } from "#lib/cawco/preview/comment-rows.js";
  import pageDesk from "#lib/cawco/preview/fixtures/title-bars-close-desk.webp";
  import pagePhone from "#lib/cawco/preview/fixtures/title-bars-close-phone.webp";
  import ModeSwitch from "#lib/cawco/preview/ModeSwitch.svelte";
  import PinCard from "#lib/cawco/preview/PinCard.svelte";
  import PinFloat from "#lib/cawco/preview/PinFloat.svelte";
  import PinMark, { markState } from "#lib/cawco/preview/PinMark.svelte";
  import type { Box } from "#lib/cawco/preview/pin-place.svelte.js";
  import ThreadSheet from "#lib/cawco/preview/ThreadSheet.svelte";
  import { setSideExpand } from "#lib/cawco/side/expand.js";
  import { HEAD_PRIORITY, type HeadItem } from "#lib/cawco/side/head.js";
  import SideSurface from "#lib/cawco/side/SideSurface.svelte";
  import { ComposerDraft } from "#lib/cawco/transcript/composer-draft.svelte.js";
  import { BarItem } from "#lib/components/ui/bar-glass/index.js";
  import * as DropdownMenu from "#lib/components/ui/dropdown-menu/index.js";
  import {
    IconChat,
    IconExternal,
    IconExternalLinear,
    IconInteract,
    IconPen,
    IconPin,
    IconRefresh,
    IconRefreshLinear,
  } from "#lib/icons.js";
  import { page } from "$app/state";
  import { ARTIFACTS, HELD, LONG, PINS } from "./records";

  const INSTANCE = "bench-artifact-panel";
  /** The hub's show of an artifact: its id. */
  const SHOW_PATH = /\/artifacts\/([^/]+)\/show$/u;
  const asked = page.url.searchParams.get("state") ?? "rail";
  const phone = new MediaQuery("(width < 640px)");
  /** The picture stands scrolled to its foot. */
  const scrolled = asked === "scrolled" || asked === "changes";

  /** The artifact on show: the newest, until the menu shows another. */
  let shownId = $state(ARTIFACTS[0]?.id ?? "");
  const shown = $derived(
    ARTIFACTS.find((one) => one.id === shownId) ?? ARTIFACTS[0]
  );
  // The artifacts menu reads the session's artifacts from the hub and asks it
  // to show one: answered here from the records, the one asked for shown.
  const hubFetch = window.fetch.bind(window);
  const listed = hubRequest("GET /api/instances/:id/artifacts", {
    path: { id: INSTANCE },
  }).path;
  window.fetch = (input, init) => {
    const path = String(input);
    if (!path.startsWith(listed)) {
      return hubFetch(input, init);
    }
    const show = path.match(SHOW_PATH);
    if (show?.[1]) {
      shownId = decodeURIComponent(show[1]);
      return Promise.resolve(Response.json({}));
    }
    return Promise.resolve(Response.json(ARTIFACTS));
  };
  /** Send all pressed: what was held stands sent. */
  let heldSent = $state(false);
  const holding = asked === "held" || asked === "note" || asked === "fold";
  /** The pins as the state has them: none, or resolved three, or as they stand. */
  /** Comment 4's element is gone from the page (`gone`), and being placed again (`place`). */
  const gone = asked === "gone" || asked === "place";
  /** Comment 4's edit went to no one (`unsent`): the session heard its earlier words, and the hub says why the last delivery failed. */
  const unsent = asked === "unsent";
  const pins: Pin[] = $derived.by(() => {
    if (holding) {
      return [
        ...PINS,
        ...(heldSent
          ? HELD.map((one) => ({
              ...one,
              sentAt: one.at,
              thread: one.thread.map(({ held: _held, ...entry }) => ({
                ...entry,
                sentAt: one.at,
              })),
            }))
          : HELD),
      ];
    }
    if (asked === "none") {
      return [];
    }
    if (asked === "long") {
      return LONG;
    }
    if (asked === "resolved" || asked === "found") {
      return PINS.map((one, at) =>
        at < 3 ? { ...one, resolvedAt: "2026-11-05T10:00:00.000Z" } : one
      );
    }
    if (gone) {
      return PINS.map((one, at) =>
        at === 3 ? { ...one, movedAt: "2026-11-05T10:00:00.000Z" } : one
      );
    }
    if (unsent) {
      return PINS.map((one, at) =>
        at === 3
          ? {
              ...one,
              heard: "the earlier wording of this comment",
              notSent: {
                at: "2026-11-05T10:00:00.000Z",
                why: "the session had ended before it arrived",
              },
            }
          : one
      );
    }
    return PINS;
  });
  /** The card's pour (`pour`, `drain`, `turn`) is the thread beside its pill, which stands while the Comments card is shut. */
  const pours = asked === "pour" || asked === "drain" || asked === "turn";
  let listOpen = $state(
    asked !== "rest" && asked !== "changes" && asked !== "scrolled" && !pours
  );
  let filter = $state<RailList>(
    asked === "resolved" || asked === "found" ? "resolved" : "open"
  );
  let sort = $state<RailSort>("newest");
  /** The card's pour, on a desk (PinFloat): `pour` opens it once the panel stands, `drain` closes it, `turn` opens it and closes it half way through (caught mid-way, it turns back from where it is drawn). */
  let openPin = $state<string | null>(
    asked === "thread" ||
      asked === "delete" ||
      asked === "drain" ||
      gone ||
      unsent
      ? (PINS[3]?.id ?? null)
      : null
  );
  /** The desk's card stands poured out; closed, it drains into its pill and then goes (`onclosed`). */
  let cardOpen = $state(true);
  // `?slow=n`: the pour's clock and its thread's fade n times as long, to
  // read a frame of it; set on the root before any run reads them.
  const slow = Number(page.url.searchParams.get("slow") ?? 1);
  if (slow > 1) {
    // `drain` slows its close alone: the card it drains pours at speed.
    const slowed = [
      "--duration-goo-exit",
      "--duration-goo-content-exit",
      ...(asked === "drain"
        ? []
        : [
            "--duration-goo",
            "--duration-goo-content",
            "--duration-goo-content-delay",
          ]),
    ];
    for (const name of slowed) {
      // Read off the root as it stands, never through dur(), which would
      // keep the token's own value for every later read.
      const ms = Number.parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue(name)
      );
      document.documentElement.style.setProperty(name, `${ms * slow}ms`);
    }
  }
  const thread = $derived(pins.find((one) => one.id === openPin) ?? null);
  /** On a desk the open thread stands joined to the Comments card while it stands (PreviewPane's `hungPin`), else beside its pill. */
  const hung = $derived(!phone.current && listOpen ? thread : null);
  /** The pin being placed again (Pin it somewhere else): the next tap on the page places it. */
  let placing = $state<string | null>(
    asked === "place" ? (PINS[3]?.id ?? null) : null
  );
  /** A sheet holding the thread being placed stands at its low stop, the page above it taking the tap. */
  const placingThread = $derived(placing !== null && placing === openPin);
  /** The reply's draft and the next comment's, apart, as the pane keeps them. */
  const replyDraft = new ComposerDraft();
  const nextDraft = new ComposerDraft();
  const openCount = $derived(pins.filter((one) => !one.resolvedAt).length);
  /** `?count=n`: the head's Comments badge says n open (5, 12, 150, 1500), the rail as it stands. */
  const countAsked = Number(page.url.searchParams.get("count") ?? Number.NaN);
  const badgeCount = $derived(
    Number.isFinite(countAsked) ? countAsked : openCount
  );
  const heldCount = $derived(pins.filter(pinHeld).length);
  const checked = asked === "check" ? [PINS[3]?.id, PINS[4]?.id] : [];
  let mode = $state<"interact" | "comment" | "draw">("interact");
  /** Changed since you looked: five stops, the tour not started. */
  let tourAt = $state<number | null>(null);
  /** A comment on the whole page being written. */
  let composing = $state(asked === "compose" || asked === "hold");
  if (asked === "hold") {
    nextDraft.text =
      "do you think the close button size is mismatched vs the search/add?";
  }
  /** The phone's composer sheet, whose outside presses put it away (PreviewPane's rule). */
  let composerFloat = $state<HTMLElement>();
  $effect(() => {
    const float = composerFloat;
    if (!float) {
      return;
    }
    return pressOutside(float, () => {
      composing = false;
    });
  });
  // Escape puts the composer away, as the pane's does.
  $effect(() => {
    if (!composing) {
      return;
    }
    const away = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        composing = false;
      }
    };
    addEventListener("keydown", away);
    return () => removeEventListener("keydown", away);
  });
  let well = $state({ w: 0, h: 0 });
  /** The panel's card (SideSurface `section`): the hung Comments card reaches its foot. */
  let section = $state<HTMLElement>();
  /** The page as it scrolls in the well. */
  let benchPage = $state<HTMLElement>();
  /**
   * The element each comment stands on in the picture, as shares of its
   * width and height (x, y, w, h): the decision page each pin was left on
   * (title-bars-close). Its pill stands at the element's top trailing corner,
   * its tail on it, as the page's overlay draws a pin.
   */
  type Spot = [number, number, number, number];
  const SPOTS: Record<"desk" | "phone", Record<number, Spot>> = {
    desk: {
      1: [0.036, 0.882, 0.062, 0.018],
      2: [0.049, 0.378, 0.347, 0.143],
      3: [0.436, 0.716, 0.342, 0.147],
      4: [0.033, 0.027, 0.29, 0.03],
      5: [0.049, 0.168, 0.347, 0.141],
    },
    phone: {
      1: [0, 0.69, 1, 0.23],
      2: [0, 0.336, 1, 0.28],
      3: [0.07, 0.627, 0.5, 0.022],
      4: [0.07, 0.044, 0.73, 0.03],
      5: [0.07, 0.094, 0.88, 0.2],
    },
  };
  const spots = $derived(SPOTS[phone.current ? "phone" : "desk"]);
  /** The open comments' pills on the page: each that has its spot. */
  const onPage = $derived(
    pins.filter((one) => !one.resolvedAt && spots[one.number] !== undefined)
  );
  /** The spots Changed since you looked steps through, top to bottom, by the pin whose element each is. */
  const CHANGE_SPOTS = [4, 5, 2, 3, 1];
  /** A comment's row the pointer or the keyboard rests on: its element is chosen on the page. */
  let hovered = $state<string | null>(null);
  /**
   * The element chosen on the page (The One Target Rule): a row rested on,
   * else the change stepped to, else the open comment's; its 1px line.
   */
  const chosen = $derived.by((): number | null => {
    const rested = pins.find((one) => one.id === hovered);
    if (rested) {
      return rested.number;
    }
    if (tourAt !== null) {
      return CHANGE_SPOTS[tourAt] ?? null;
    }
    return pins.find((one) => one.id === openPin)?.number ?? null;
  });
  // A change stepped to is brought into the well's view.
  $effect(() => {
    const at = tourAt === null ? null : CHANGE_SPOTS[tourAt];
    const scroller = benchPage;
    if (at === undefined || at === null || !scroller) {
      return;
    }
    const box = scroller.querySelector<HTMLElement>(`[data-spot-box="${at}"]`);
    if (box) {
      scroller.scrollTop = Math.max(
        0,
        box.offsetTop - scroller.clientHeight / 3
      );
    }
  });
  /** The opened comment's pill in the well, px, as drawn now: the card's mark; null while it has none. */
  let cardMark = $state<Box | null>(null);
  function readMark() {
    const at = benchPage;
    const one = pins.find((each) => each.id === openPin);
    const spot =
      one && at?.querySelector<HTMLElement>(`[data-pin-spot="${one.number}"]`);
    if (!(at && spot)) {
      cardMark = null;
      return;
    }
    const room = at.getBoundingClientRect();
    const pill = spot.getBoundingClientRect();
    cardMark = {
      x: pill.left - room.left,
      y: pill.top - room.top,
      w: pill.width,
      h: pill.height,
    };
  }
  // The mark follows the opened pin, the well's size and the picture.
  $effect(() => {
    // biome-ignore lint/complexity/noVoid: read to follow them
    void [openPin, well.w, well.h, spots];
    const frame = requestAnimationFrame(readMark);
    return () => cancelAnimationFrame(frame);
  });
  const measureWell = frameSize<HTMLElement, { w: number; h: number }>(
    (node) => ({ w: node.clientWidth, h: node.clientHeight }),
    (value) => {
      well = value;
    }
  );
  /** A pill on the page pressed: its thread opens, beside it on a desk, in the Comments sheet on a phone. */
  function openFromPage(one: Pin) {
    openPin = one.id;
    cardOpen = true;
    if (phone.current) {
      listOpen = true;
    }
  }

  setSideExpand({
    // A sheet has no Expand: only the desk's split offers it.
    get available() {
      return !phone.current;
    },
    backLabel: "Back to conversation",
    collapse: () => false,
    expanded: false,
    toggle: () => undefined,
  });

  let rail = $state<ReturnType<typeof CommentRail>>();
  /** How long the head takes to fit, ms: two frames' reads and writes, with room. */
  const FITTED = 300;
  /** Opens what the state names once the panel stands (its head fitted, which draws More): a menu, the search with its words, the sheet's whole room. */
  /** The control each state presses once the panel stands. */
  const PRESSES: Record<string, string> = {
    sort: '[data-slot="sort"]',
    more: '[data-slot="more"]',
    fold: '[data-slot="comment-rail"] [data-slot="more"]',
    mode: '[aria-label^="Mode:"]',
    artifacts: "[data-artifact-trigger]",
    remove: "[data-artifact-trigger]",
    note: '[data-slot="send-held"]',
    delete: '[data-slot="delete"]',
    full: "[data-thread-grab]",
  };
  onMount(() => {
    const press = (selector: string) =>
      document.querySelector<HTMLElement>(selector)?.click();
    setTimeout(() => {
      const control = PRESSES[asked];
      if (control) {
        press(control);
      }
      if (asked === "pour" || asked === "turn") {
        openPin = PINS[3]?.id ?? null;
        cardOpen = true;
      }
      if (asked === "turn") {
        setTimeout(
          () => {
            cardOpen = false;
          },
          dur("--duration-goo") / 2
        );
      }
      if (asked === "drain") {
        // Once it has poured out and stands.
        setTimeout(
          () => {
            cardOpen = false;
          },
          dur("--duration-goo") + FITTED
        );
      }
      if (asked === "remove") {
        setTimeout(() => press("[data-artifact-remove]"), FITTED);
      } else if (asked === "search" || asked === "miss" || asked === "found") {
        rail?.focusSearch();
        requestAnimationFrame(() => {
          const field = document.querySelector<HTMLInputElement>(
            'input[data-slot="search"]'
          );
          if (field) {
            field.value = asked === "miss" ? "zebra" : "HIG";
            field.dispatchEvent(new Event("input", { bubbles: true }));
          }
        });
      }
    }, FITTED);
  });
  // The bench names no fleet: the panel's own words stand for the session's.
  const agent = "The session";
  /** The stops Changed since you looked steps through. */
  const CHANGES = 5;
</script>

{#snippet modeBar()}
  <ModeSwitch
    onchange={(next) => {
      mode = next;
    }}
    {mode}
  />
{/snippet}
{#snippet modeMenu()}
  <DropdownMenu.RadioGroup
    onValueChange={(next) => {
      mode = next as typeof mode;
    }}
    value={mode}
  >
    <DropdownMenu.RadioItem value="interact"
      ><IconInteract /><span>Interact</span></DropdownMenu.RadioItem
    >
    <DropdownMenu.RadioItem value="comment"
      ><IconPin /><span>Comment</span></DropdownMenu.RadioItem
    >
    <DropdownMenu.RadioItem value="draw"
      ><IconPen /><span>Draw</span></DropdownMenu.RadioItem
    >
  </DropdownMenu.RadioGroup>
{/snippet}
<!-- The open thread, joined to the Comments card's leading edge (CommentsCard `thread`), as PreviewPane hangs it. -->
{#snippet hungThread()}
  {#if hung}
    {@render card(hung)}
  {/if}
{/snippet}
<!-- Comments: on a phone the toggle of the Comments sheet; on a desk the
     card hung from the head's glass, as PreviewPane draws it. -->
{#snippet commentsBar()}
  {#if phone.current}
    <CommentsButton
      count={badgeCount}
      label="Comments (⇧C hides the pins)"
      onclick={() => {
        listOpen = !listOpen;
      }}
      held={heldCount}
      open={listOpen && !composing}
      answers={checked.length}
    />
  {:else}
    <CommentsCard
      label={commentWords.comments}
      onOpenChange={(open) => {
        // Shut, it takes the thread joined to it along (PreviewPane `showList`).
        if (!open && hung) {
          openPin = null;
        }
        listOpen = open;
      }}
      open={listOpen}
      panel={section}
      thread={hung ? hungThread : null}
      threadKey={hung?.id}
      threadLabel={hung ? `Comment ${hung.number}` : undefined}
    >
      {#snippet trigger(props)}
        <CommentsButton
          count={badgeCount}
          label="Comments (⇧C hides the pins)"
          held={heldCount}
          open={listOpen}
          {props}
          answers={checked.length}
        />
      {/snippet}
      {@render railOf("beside")}
    </CommentsCard>
  {/if}
{/snippet}
{#snippet commentsMenu()}
  <DropdownMenu.Item
    onSelect={() => {
      listOpen = !listOpen;
    }}><IconChat /><span>Comments</span></DropdownMenu.Item
  >
{/snippet}
{#snippet reloadBar()}
  <BarItem icon={IconRefreshLinear} label="Reload" onclick={() => undefined} />
{/snippet}
{#snippet reloadMenu()}
  <DropdownMenu.Item><IconRefresh /><span>Reload</span></DropdownMenu.Item>
{/snippet}
{#snippet openBar()}
  <BarItem href="#open" icon={IconExternalLinear} label="Open in new tab" />
{/snippet}
{#snippet openMenu()}
  <DropdownMenu.Item
    ><IconExternal /><span>Open in new tab</span></DropdownMenu.Item
  >
{/snippet}

{#snippet railOf(layout: "beside" | "sheet")}
  <CommentRail
    bind:this={rail}
    down={null}
    focused={openPin}
    held={heldCount}
    hold="ready"
    onsendheld={() => {
      heldSent = true;
      return null;
    }}
    {layout}
    live={new Set()}
    onclose={() => {
      listOpen = false;
    }}
    onhover={(id) => {
      hovered = id;
    }}
    onopen={(id) => {
      openPin = id;
      cardOpen = true;
    }}
    onpage={() => {
      openPin = null;
      composing = true;
    }}
    onpageclose={() => {
      composing = false;
    }}
    pageComposer={composer}
    pageOpen={composing && listOpen && !phone.current}
    onresolve={() => undefined}
    onretry={() => undefined}
    onretrypin={() => undefined}
    open={openPin}
    {pins}
    unread={new Set(checked.filter((id): id is string => !!id))}
    bind:filter
    bind:sort
  />
{/snippet}
{#snippet composer()}
  <CommentComposer
    action="Comment"
    chain={[commentWords.wholePage]}
    draft={nextDraft}
    focus
    onhold={() => {
      composing = false;
    }}
    onsubmit={() => {
      composing = false;
    }}
    placeholder={commentWords.composeHint}
  />
{/snippet}

{#snippet card(one: Pin, pushed = false)}
  <PinCard
    agentName={agent}
    back={pushed
      ? {
          to: commentWords.comments,
          onback: () => {
            openPin = null;
          },
        }
      : undefined}
    draft={replyDraft}
    link={`#comment-${one.number}`}
    marked={!phone.current && cardMark !== null}
    sheet={phone.current}
    name={one.title ?? ""}
    onclose={() => {
      if (phone.current || hung) {
        openPin = null;
      } else {
        // On a desk the card drains into its pill first (PinFloat).
        cardOpen = false;
      }
      if (pushed) {
        listOpen = false;
      }
    }}
    ondelete={() => Promise.resolve()}
    onfind={() => undefined}
    onhold={() => undefined}
    onplace={(on) => {
      placing = on ? one.id : null;
    }}
    onreply={() => undefined}
    onresolve={() => undefined}
    onretry={() => undefined}
    parent={null}
    pin={one}
    placing={placing === one.id}
    problem={null}
    whyNotSent={one.notSent?.why ?? null}
  />
{/snippet}

<div
  class="h-dvh bg-surface-recess p-space-2 max-phone:p-0"
  data-bench-panel={asked}
>
  <SideSurface
    items={[
      {
        key: "mode",
        priority: HEAD_PRIORITY.mode,
        bar: modeBar,
        menu: modeMenu,
        group: true,
        place: "centre",
      },
      {
        key: "comments",
        priority: HEAD_PRIORITY.comments,
        bar: commentsBar,
        menu: commentsMenu,
        count: {
          glyph: IconChat,
          n: listOpen ? 0 : openCount,
          of: "Comments",
        },
      },
      {
        key: "reload",
        priority: HEAD_PRIORITY.reload,
        bar: reloadBar,
        menu: reloadMenu,
      },
      {
        key: "open",
        priority: HEAD_PRIORITY.open,
        bar: openBar,
        menu: openMenu,
      },
    ] satisfies HeadItem[]}
    label="Preview"
    mode="interact"
    of="preview"
    onclose={() => undefined}
    placement={phone.current ? "sheet" : "beside"}
    bind:section
    subtitle={shown?.ask}
    subtitleId="bench-line"
  >
    <!-- The page as a decision page draws itself in the panel: beneath
         the head, its scroller padding its top by the head's room
         (`cawco:head-room`, Decisions' `--page-inset-top`), the timeline
         the head's scroll edge effect plays on; its scrollbar undrawn as
         the overlay leaves a page's (`data-cawco-bare-scroll`). -->
    <div
      class="size-full overflow-y-auto overscroll-contain pt-(--side-room) scroll-timeline-transcript-head no-scrollbar"
      data-slot="bench-page"
      onscroll={readMark}
      bind:this={benchPage}
      {@attach measureWell}
    >
      <!-- The picture and the open comments' pills on it, as the page's
           overlay draws them: each a press that opens its thread. -->
      <div class="relative w-fit max-w-full" data-slot="bench-picture">
        <img
          alt={shown?.title}
          class="block h-auto max-w-full"
          src={phone.current ? pagePhone : pageDesk}
          {@attach (img) => {
            // Scrolled to its foot once the picture has its height, and
            // the opened pill read where it stands.
            const loaded = () => {
              if (scrolled && benchPage) {
                benchPage.scrollTop = benchPage.scrollHeight;
              }
              readMark();
            };
            if (img.complete) {
              loaded();
            }
            img.addEventListener("load", loaded);
            return () => img.removeEventListener("load", loaded);
          }}
        />
        {#each Object.entries(spots) as [key, [x, y, w, h]] (key)}
          <!-- The element's chosen line, drawn while it is chosen. -->
          <span
            aria-hidden="true"
            class="pointer-events-none absolute start-(--box-x) top-(--box-y) h-(--box-h) w-(--box-w) rounded-xs outline-(length:--spacing-c-target-stroke) outline-offset-(--spacing-c-target-stroke) outline-transparent outline-solid data-chosen:outline-brand-solid"
            data-chosen={chosen === Number(key) || undefined}
            data-spot-box={key}
            style:--box-h="{h * 100}%"
            style:--box-w="{w * 100}%"
            style:--box-x="{x * 100}%"
            style:--box-y="{y * 100}%"
          ></span>
        {/each}
        {#each onPage as one (one.id)}
          {@const [x, y, w] = spots[one.number] ?? [0, 0, 0, 0]}
          <button
            aria-label={commentWords.openThread(one.number)}
            class="absolute start-(--spot-x) top-(--spot-y) z-1 flex -translate-y-full rounded-pill outline-off focus-visible:outline-(length:--focus-ring-width) focus-visible:outline-focus-ring"
            data-pin-spot={one.number}
            onclick={() => openFromPage(one)}
            onpointerenter={() => {
              hovered = one.id;
            }}
            onpointerleave={() => {
              hovered = null;
            }}
            style:--spot-x="{(x + w) * 100}%"
            style:--spot-y="{y * 100}%"
            type="button"
          >
            <PinMark number={one.number} state={markState(one)} />
          </button>
        {/each}
      </div>
    </div>
    {#if asked === "changes"}
      <!-- The page's own foot bar (its Send) stands at the picture's foot,
           scrolled there: 66px, as the overlay reads it (cawco:page-foot). -->
      <ChangesTag
        at={tourAt}
        onoff={() => {
          tourAt = null;
        }}
        onstep={(by) => {
          tourAt =
            tourAt === null
              ? 0
              : (((tourAt + by) % CHANGES) + CHANGES) % CHANGES;
        }}
        total={CHANGES}
      />
    {/if}
    {#if composing && phone.current}
      <!-- A comment on the whole page on a phone: the composer as the
           well's foot sheet, as PreviewPane draws it; a press outside it,
           or Escape, puts it away. -->
      <div class="contents">
        <PinFloat
          bare
          box={null}
          label={commentWords.comment}
          mark={null}
          room={well}
          sheet
          slot="pin-composer"
          bind:float={composerFloat}
        >
          {@render composer()}
        </PinFloat>
      </div>
    {/if}
    {#if phone.current}
      <!-- The Comments sheet: its list, or a thread opened from it in the same sheet, Back leading. -->
      <ThreadSheet
        label={thread ? `Comment ${thread.number}` : commentWords.comments}
        onclose={() => {
          openPin = null;
          listOpen = false;
        }}
        open={listOpen && !composing}
        short={(pins.length === 0 && !thread) || placingThread}
      >
        {#if thread}
          {#key thread.id}
            {@render card(thread, true)}
          {/key}
        {:else}
          {@render railOf("sheet")}
        {/if}
      </ThreadSheet>
      {#if thread && !listOpen}
        <ThreadSheet
          label={`Comment ${thread.number}`}
          onclose={() => {
            openPin = null;
          }}
          open
          short={placingThread}
        >
          {@render card(thread)}
        </ThreadSheet>
      {/if}
    {:else if thread && !hung}
      <!-- The card beside its pin in the pane's own shell (PinFloat),
           poured out of its pill on the page. -->
      <div class="contents">
        <PinFloat
          label={`Comment ${thread.number}`}
          mark={cardMark}
          onclosed={() => {
            if (!cardOpen) {
              openPin = null;
            }
          }}
          open={cardOpen}
          pin={thread.number}
          room={well}
          slot="pin-card"
        >
          {@render card(thread)}
        </PinFloat>
      </div>
    {/if}
  </SideSurface>
</div>
