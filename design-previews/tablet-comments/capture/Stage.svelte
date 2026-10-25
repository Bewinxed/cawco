<!--
  The capture stage (capture.ts): the parts both tablet options are drawn
  from, each the dashboard's real component mounted once with the pins
  read from the hub (pins.json), so the static page is made of their own
  markup laid out by the dashboard's own stylesheet. Nothing here is shown
  to anyone; capture.ts reads each `data-part` and writes it into parts.js.

  - The Comments rail (CommentRail) with the two pins, as a finger sees it.
  - Each pin's thread (PinCard), its head's pill shown.
  - The kit's ghost glyph Button for Back.
  - Four glass groups (BarGlass): the rail's (Search, Sort, +, Close), the
    pane head's trailing one (Reload, Expand, Comments, Close) with its join
    drawn, the mode switch's and New canvas's.
  - The panel's title (ArtifactMenu), shut.
  - HangCard twice, open and placed: hung from a row's box (the kit's), and
    from a glass group (`glass`, its hung shadow drawn by motion/hung-shadow
    as the Shell draws it); and once shut, so the shut card's rules are kept.
  - Each pin's pill (PinMark), on the page and focused.
-->
<script>
  import { onMount } from "svelte";
  import { hangShadow } from "../../../apps/dashboard/src/lib/cawco/motion/hung-shadow.ts";
  import ArtifactMenu from "../../../apps/dashboard/src/lib/cawco/preview/ArtifactMenu.svelte";
  import CommentRail from "../../../apps/dashboard/src/lib/cawco/preview/CommentRail.svelte";
  import PinCard from "../../../apps/dashboard/src/lib/cawco/preview/PinCard.svelte";
  import PinMark, {
    markState,
  } from "../../../apps/dashboard/src/lib/cawco/preview/PinMark.svelte";
  import { ComposerDraft } from "../../../apps/dashboard/src/lib/cawco/transcript/composer-draft.svelte";
  import BarGlass from "../../../apps/dashboard/src/lib/components/ui/bar-glass/bar-glass.svelte";
  import { Button } from "../../../apps/dashboard/src/lib/components/ui/button/index.js";
  import {
    TabItem,
    Tabs,
    TabsList,
  } from "../../../apps/dashboard/src/lib/components/ui/fluid-tabs/index.js";
  import { HangCard } from "../../../apps/dashboard/src/lib/components/ui/hang-card/index.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte component-group convention
  import * as Popover from "../../../apps/dashboard/src/lib/components/ui/popover/index.js";
  import {
    IconChat,
    IconChevronLeft,
    IconClose,
    IconComment,
    IconInteract,
    IconMaximize,
    IconPen,
    IconPlus,
    IconRefresh,
    IconSearch,
    IconSort,
  } from "../../../apps/dashboard/src/lib/icons.js";
  import { newAnswer } from "../../../packages/core/src/comments.ts";
  import { pinName } from "../../../packages/core/src/pin-name.ts";
  import { commentWords as said } from "../../../packages/core/src/words/comments.ts";
  import EXPORT from "../pins.json";

  const PINS = EXPORT.pins;
  const unread = new Set(PINS.filter(newAnswer).map((pin) => pin.id));
  const none = () => undefined;
  const nothing = new Set();
  const draft = () => new ComposerDraft({ byReference: true });
  const linkOf = (pin) =>
    `${EXPORT.artifact.address.split("?")[0]}#pin-${pin.number}`;

  let rowAnchor = $state(null);
  let groupAnchor = $state(null);
  let shutAnchor = $state(null);

  onMount(() => {
    const corner = Number.parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue("--radius-lg")
    );
    // As the Shell draws it for every card hanging from a glass: its
    // trailing top square, where it runs on from the group's flank.
    hangShadow("[data-glass-card]", "--shadow-overlay-hung", [
      corner,
      0,
      corner,
      corner,
    ]).then(() => {
      window.__shadowed = true;
    });
  });
</script>

{#snippet bare(label, Icon, pressed = false)}
  <button
    data-bar-item
    aria-expanded={pressed ? "true" : undefined}
    aria-label={label}
    class="select-none mark-line touch-hit press-tint"
    title={label}
    type="button"
  >
    <Icon aria-hidden="true" data-slot="bar-symbol" />
  </button>
{/snippet}

<main
  style="display: grid; gap: 24px; padding: 24px; inline-size: 1200px; background: var(--surface-raised)"
>
  <div data-part="rail" style="display: flex; block-size: 640px">
    <CommentRail
      down={null}
      focused={null}
      hold="ready"
      layout="beside"
      live={nothing}
      onclose={none}
      onhover={none}
      onopen={none}
      onpage={none}
      onresolve={none}
      onretry={none}
      onretrypin={none}
      open={null}
      pins={PINS}
      {unread}
    />
  </div>
  {#each PINS as pin (pin.id)}
    <div
      data-part={`card-${pin.number}`}
      style="display: flex; flex-direction: column; gap: 8px; inline-size: 420px; block-size: 640px"
    >
      <PinCard
        agentName={EXPORT.agentName}
        draft={draft()}
        link={linkOf(pin)}
        marked={false}
        name={pinName(pin)}
        onclose={none}
        ondelete={async () => undefined}
        onfind={none}
        onplace={none}
        onreply={none}
        onresolve={none}
        onretry={none}
        parent={null}
        {pin}
        problem={null}
      />
    </div>
    <span data-part={`pill-${pin.number}`} style="display: inline-flex">
      <PinMark
        dot={unread.has(pin.id) ? "unread" : null}
        number={pin.number}
        state={markState(pin)}
      />
    </span>
    <span data-part={`pill-${pin.number}-focused`} style="display: inline-flex">
      <PinMark
        dot={unread.has(pin.id) ? "unread" : null}
        focused
        number={pin.number}
        state={markState(pin)}
      />
    </span>
  {/each}
  <div data-part="back" style="display: flex">
    <Button
      aria-label="Back to comments"
      icon={IconChevronLeft}
      onclick={none}
      size="icon-sm"
      title="Back to comments"
      variant="ghost"
    />
  </div>
  <div data-part="group-rail" style="display: flex">
    <BarGlass>
      {#snippet head()}
        {@render bare(said.closeComments, IconClose)}
      {/snippet}
      {@render bare(said.searchComments, IconSearch)}
      {@render bare(said.sort, IconSort)}
      {@render bare(said.onWholePage, IconPlus)}
    </BarGlass>
  </div>
  <div data-part="group-trailing" style="display: flex">
    <BarGlass>
      {#snippet head()}
        {@render bare("Close", IconClose)}
      {/snippet}
      {@render bare("Reload", IconRefresh)}
      {@render bare("Expand", IconMaximize)}
      {@render bare(said.comments, IconChat, true)}
    </BarGlass>
  </div>
  <div data-part="group-trailing-joined" style="display: flex">
    <BarGlass joined>
      {#snippet head()}
        {@render bare("Close", IconClose)}
      {/snippet}
      {@render bare("Reload", IconRefresh)}
      {@render bare("Expand", IconMaximize)}
      {@render bare(said.comments, IconChat, true)}
    </BarGlass>
  </div>
  <div data-part="group-modes" style="display: flex">
    <BarGlass>
      {#snippet head()}
        <Tabs size="compact" value="interact" values={["interact", "comment", "draw"]}>
          <TabsList aria-label="Preview mode">
            <TabItem
              aria-keyshortcuts="V"
              glyphOnly
              icon={IconInteract}
              label="Interact"
              title="Interact (V): the page gets every click"
              value="interact"
            />
            <TabItem
              aria-keyshortcuts="C"
              glyphOnly
              icon={IconComment}
              label="Comment"
              title="Comment (C): a click pins a comment"
              value="comment"
            />
            <TabItem
              aria-keyshortcuts="D"
              glyphOnly
              icon={IconPen}
              label="Draw"
              title="Draw (D): drag to draw on the page"
              value="draw"
            />
          </TabsList>
        </Tabs>
      {/snippet}
    </BarGlass>
  </div>
  <div data-part="group-new" style="display: flex">
    <BarGlass>
      {#snippet head()}
        {@render bare("New canvas", IconPlus)}
      {/snippet}
    </BarGlass>
  </div>
  <div data-part="title" style="display: flex">
    <ArtifactMenu
      held={undefined}
      instanceId="tablet-comments"
      line=""
      lineDropped={false}
      lineId="tablet-comments-line"
      onrefused={none}
      shown={{
        id: EXPORT.artifact.id,
        kind: EXPORT.artifact.kind,
        name: EXPORT.artifact.name,
      }}
    />
  </div>

  <!-- A card hung from a row's box: flush with its trailing edge, reaching
       past its leading one, the row's foot flared. -->
  <div style="position: relative; inline-size: 700px; block-size: 360px">
    <div
      bind:this={rowAnchor}
      style="position: absolute; inset-block-start: 20px; inset-inline-end: 20px; inline-size: 186px; block-size: 44px; --flare: var(--radius-lg)"
    ></div>
    <div data-part="hang-row">
      {#if rowAnchor}
        <Popover.Root open>
          <HangCard
            align="end"
            anchor={rowAnchor}
            customAnchor={rowAnchor}
            forceMount
            onOpenAutoFocus={(event) => event.preventDefault()}
            portalProps={{ disabled: true }}
            side="bottom"
            sideOffset={0}
            style="inline-size: 280px"
            trapFocus={false}
          >
            <span data-slot="hang-body"></span>
          </HangCard>
        </Popover.Root>
      {/if}
    </div>
  </div>

  <!-- A card hung from a glass group (the glass's cards), its hung shadow. -->
  <div style="position: relative; inline-size: 700px; block-size: 360px">
    <div
      style="position: absolute; inset-block-start: 20px; inset-inline-end: 20px; display: flex"
    >
      <div bind:this={groupAnchor} style="display: flex">
        <BarGlass joined>
          {#snippet head()}
            {@render bare("Close", IconClose)}
          {/snippet}
          {@render bare(said.comments, IconChat, true)}
        </BarGlass>
      </div>
    </div>
    <div data-part="hang-glass">
      {#if groupAnchor}
        {@const glass = groupAnchor.querySelector("[data-bar-group]")}
        <Popover.Root open>
          <HangCard
            align="end"
            anchor={glass}
            customAnchor={glass}
            forceMount
            glass
            onOpenAutoFocus={(event) => event.preventDefault()}
            side="bottom"
            sideOffset={0}
            style="inline-size: 300px"
            trapFocus={false}
          >
            <span data-slot="hang-body"></span>
          </HangCard>
        </Popover.Root>
      {/if}
    </div>
  </div>

  <!-- A shut one, kept mounted: the shut card's rules (its fade under less
       motion) are kept in house.css. -->
  <div style="position: relative; inline-size: 700px; block-size: 120px">
    <div
      bind:this={shutAnchor}
      style="position: absolute; inset-block-start: 20px; inset-inline-end: 20px; inline-size: 186px; block-size: 44px"
    ></div>
    {#if shutAnchor}
      <Popover.Root open={false}>
        <HangCard
          align="end"
          anchor={shutAnchor}
          customAnchor={shutAnchor}
          forceMount
          portalProps={{ disabled: true }}
          side="bottom"
          sideOffset={0}
          trapFocus={false}
        >
          <span></span>
        </HangCard>
      </Popover.Root>
    {/if}
  </div>
</main>
