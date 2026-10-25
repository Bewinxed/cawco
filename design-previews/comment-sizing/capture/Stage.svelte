<!--
  The capture stage (capture.ts): the comment surface's real components,
  each mounted once with the preview's fixtures, so the static page is made
  of their own markup laid out by the dashboard's own stylesheet. Nothing
  here is shown to anyone; capture.ts reads each `data-part` and writes it
  into parts.js.
-->
<script>
  import CommentComposer from "../../../apps/dashboard/src/lib/cawco/preview/CommentComposer.svelte";
  import CommentRail from "../../../apps/dashboard/src/lib/cawco/preview/CommentRail.svelte";
  import PinCard from "../../../apps/dashboard/src/lib/cawco/preview/PinCard.svelte";
  import PinFloat from "../../../apps/dashboard/src/lib/cawco/preview/PinFloat.svelte";
  import PinMark from "../../../apps/dashboard/src/lib/cawco/preview/PinMark.svelte";
  import { ComposerDraft } from "../../../apps/dashboard/src/lib/cawco/transcript/composer-draft.svelte";
  import { Button } from "../../../apps/dashboard/src/lib/components/ui/button/index.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte component-group convention
  import * as Resizable from "../../../apps/dashboard/src/lib/components/ui/resizable/index.js";
  import { IconComment } from "../../../apps/dashboard/src/lib/icons.js";
  import { pinSaid } from "../../../packages/core/src/comments.ts";
  import { pinName } from "../../../packages/core/src/pin-name.ts";
  import { commentWords as said } from "../../../packages/core/src/words/comments.ts";
  import {
    AGENT,
    LONG_PIN,
    NAME,
    OTHER_PINS,
    PARENT,
    SHORT_PIN,
  } from "./fixture.js";

  /** A pin as the hub stamps it once the session heard it: its pill filled. */
  const heard = (pin) => ({ ...pin, heard: pinSaid(pin) });
  const long = heard(LONG_PIN);
  const short = heard(SHORT_PIN);
  const others = OTHER_PINS.map(heard);
  const listOf = (open) => [others[0], others[1], open, others[2]];
  const none = () => undefined;
  const nothing = new Set();
  const draft = () => new ComposerDraft({ byReference: true });
  const cards = [
    ["card-long-beside", long, true],
    ["card-long-held", long, false],
    ["card-short-beside", short, true],
    ["card-short-held", short, false],
  ];
  const rails = [
    ["rail-long-beside", long, "beside", long.id],
    ["rail-short-beside", short, "beside", short.id],
    ["rail-long-sheet", long, "sheet", long.id],
    ["rail-short-sheet", short, "sheet", short.id],
  ];
</script>

<main style="display: grid; gap: 24px; padding: 24px; inline-size: 1200px">
  {#each cards as [key, pin, marked] (key)}
    <div
      data-part={key}
      style="display: flex; flex-direction: column; gap: 8px; inline-size: 420px; block-size: 640px"
    >
      <PinCard
        agentName={AGENT}
        draft={draft()}
        link="https://hub.local/a/away-mode#pin-3"
        {marked}
        name={NAME}
        onclose={none}
        ondelete={async () => undefined}
        onfind={none}
        onplace={none}
        onreply={none}
        onresolve={none}
        onretry={none}
        parent={PARENT}
        {pin}
        problem={null}
      />
    </div>
  {/each}
  {#each rails as [key, pin, layout, open] (key)}
    <div data-part={key} style="display: flex; block-size: 640px">
      <CommentRail
        down={null}
        focused={null}
        hold="ready"
        {layout}
        live={nothing}
        onclose={none}
        onhover={none}
        onopen={none}
        onpage={none}
        onresolve={none}
        onretry={none}
        onretrypin={none}
        {open}
        pins={listOf(pin)}
        unread={nothing}
      />
    </div>
  {/each}
  <div data-part="composer" style="inline-size: 280px">
    <CommentComposer
      action="Comment"
      chain={[pinName(long), PARENT, "Whole page"]}
      draft={draft()}
      onsubmit={none}
      placeholder={said.composeHint}
    />
  </div>
  {#each [1, 2, 3, 4] as number (number)}
    <span data-part={`pill-${number}`} style="display: inline-flex">
      <PinMark {number} state="sent" />
    </span>
    <span data-part={`pill-${number}-focused`} style="display: inline-flex">
      <PinMark focused {number} state="sent" />
    </span>
  {/each}
  <span data-part="pill-new" style="display: inline-flex">
    <PinMark focused number={null} state="provisional" />
  </span>
  <div data-part="toggle" style="display: flex">
    <Button
      aria-pressed="true"
      icon={IconComment}
      label={said.comments}
      onclick={none}
      size="sm"
      variant="ghost"
    />
  </div>
  <div
    data-part="split"
    style="display: flex; block-size: 200px; inline-size: 600px"
  >
    <Resizable.PaneGroup direction="horizontal">
      <Resizable.Pane defaultSize={60}><div></div></Resizable.Pane>
      <Resizable.Handle
        aria-label="Resize the thread"
        look="split"
        withHandle
      />
      <Resizable.Pane defaultSize={40}><div></div></Resizable.Pane>
    </Resizable.PaneGroup>
  </div>
  <div
    data-part="float"
    style="position: relative; inline-size: 900px; block-size: 400px"
  >
    <PinFloat
      label="Comment 3"
      mark={{ x: 100, y: 100, w: 20, h: 20 }}
      pin={3}
      room={{ w: 900, h: 400 }}
      slot="pin-card"
    >
      <span></span>
    </PinFloat>
  </div>
  <div
    data-part="float-sheet"
    style="position: relative; inline-size: 390px; block-size: 400px"
  >
    <PinFloat
      label="Comment 3"
      mark={{ x: 100, y: 100, w: 20, h: 20 }}
      pin={3}
      room={{ w: 390, h: 400 }}
      sheet
      slot="pin-card"
    >
      <span></span>
    </PinFloat>
  </div>
  <div
    data-part="float-bare"
    style="position: relative; inline-size: 900px; block-size: 400px"
  >
    <PinFloat
      bare
      label={said.comment}
      mark={{ x: 100, y: 100, w: 20, h: 20 }}
      room={{ w: 900, h: 400 }}
      slot="pin-composer"
    >
      <span></span>
    </PinFloat>
  </div>
  <div
    data-part="float-bare-sheet"
    style="position: relative; inline-size: 390px; block-size: 400px"
  >
    <PinFloat
      bare
      label={said.comment}
      mark={{ x: 100, y: 100, w: 20, h: 20 }}
      room={{ w: 390, h: 400 }}
      sheet
      slot="pin-composer"
    >
      <span></span>
    </PinFloat>
  </div>
  <!-- A composer on each other side of its pill (left, under, over), not
       captured as parts: standing here, the stylesheet's rules for each side
       its pop rises from are kept in house.css. -->
  {#each [{ w: 900, x: 860, y: 100 }, { w: 300, x: 10, y: 10 }, { w: 300, x: 10, y: 370 }] as at (`${at.w}-${at.y}`)}
    <div
      style="position: relative; inline-size: {at.w}px; block-size: 400px"
    >
      <PinFloat
        bare
        label={said.comment}
        mark={{ x: at.x, y: at.y, w: 20, h: 20 }}
        room={{ w: at.w, h: 400 }}
        slot="pin-composer"
      >
        <span></span>
      </PinFloat>
    </div>
  {/each}
</main>
