<!--
  The artifact panel at desk width: the dashboard's own frame (SideSurface,
  as PreviewPane draws it), its name the artifact's own menu (ArtifactMenu)
  over its ask, its controls standing by the head's priority rule (Send
  with the unsent count, only above 0, comment-design §1, in the place
  PreviewPane gives Send picks; the mode; Comments with the open count;
  Reload), Close last, and the well holding the page, ringed in Comment
  mode as SideSurface rings it.

  Comment-design §1 adds the Comments rail beside the well. SideSurface has
  no place beside its well, so the rail stands in the card's room to the
  well's end, under the head, until the build gives the frame one.
  PreviewPane's control snippets are its own and can't be imported: the
  controls here are the same kit parts with the same props.
-->
<script lang="ts">
  import type { Snippet } from "svelte";
  import ArtifactMenu from "$kit/cawco/preview/ArtifactMenu.svelte";
  import { HEAD_PRIORITY, type HeadItem } from "$kit/cawco/side/head";
  import SideSurface from "$kit/cawco/side/SideSurface.svelte";
  import { Button } from "$kit/components/ui/button/index.js";
  import { TabItem, Tabs, TabsList } from "$kit/components/ui/fluid-tabs/index.js";
  import { IconChat, IconComment, IconInteract, IconPen, IconRefresh, IconSend } from "$kit/icons.js";

  let {
    mode = "comment",
    comments = false,
    open = 3,
    send = 0,
    ask = "Pin anything that reads wrong",
    height = "690px",
    page,
    rail,
  }: {
    mode?: "interact" | "comment";
    comments?: boolean;
    open?: number;
    send?: number;
    ask?: string;
    /** The panel's height; `auto` fits it to the page, so the whole page shows. */
    height?: string;
    page: Snippet;
    rail?: Snippet;
  } = $props();

  const nothing = () => undefined;
</script>

{#snippet sendBar()}
  <Button data-slot="send" size="sm" variant="ghost"
    ><IconSend /><span data-slot="send-label">Send</span><span class="num">{send}</span></Button
  >
{/snippet}
{#snippet modeBar()}
  <div data-slot="modes">
    <Tabs size="compact" value={mode} values={["interact", "comment", "draw"]}>
      <TabsList aria-label="Preview mode">
        <TabItem glyphOnly icon={IconInteract} label="Interact" value="interact" />
        <TabItem glyphOnly icon={IconComment} label="Comment" value="comment" />
        <TabItem glyphOnly icon={IconPen} label="Draw" value="draw" />
      </TabsList>
    </Tabs>
  </div>
{/snippet}
{#snippet commentsBar()}
  <Button
    data-slot="comments"
    aria-expanded={comments}
    aria-label={`Comments${open > 0 ? `, ${open} open` : ""}`}
    expanded="pressed"
    size="sm"
    variant="ghost"
    ><IconChat /><span data-slot="comments-label">Comments</span>{#if open > 0}<span
        class="min-w-c-count-digit"
        data-slot="count">{open}</span
      >{/if}</Button
  >
{/snippet}
{#snippet reloadBar()}
  <Button data-slot="other" aria-label="Reload" dimmed={mode !== "interact"} size="icon-sm" variant="ghost"
    ><IconRefresh /></Button
  >
{/snippet}
{#snippet none()}{/snippet}
{#snippet title()}
  <ArtifactMenu
    held={["routine"]}
    instanceId="drawings"
    line={ask}
    lineDropped={false}
    lineId="panel-line"
    shown={{ id: "routine", kind: "page", name: "New routine" }}
  />
{/snippet}

<div
  class={["group/panel relative w-[760px]", comments && rail && "has-rail"]}
  data-panel
  style:height={height}
>
  <SideSurface
    items={[
      ...(send > 0 ? [{ key: "send", priority: HEAD_PRIORITY.send, bar: sendBar, menu: none, words: true } satisfies HeadItem] : []),
      { key: "mode", priority: HEAD_PRIORITY.mode, bar: modeBar, menu: none, group: true },
      { key: "comments", priority: HEAD_PRIORITY.comments, bar: commentsBar, menu: none, count: { n: open, of: "Comments" }, words: true },
      { key: "reload", priority: HEAD_PRIORITY.reload, bar: reloadBar, menu: none },
    ]}
    label="Preview"
    {mode}
    of="preview"
    onclose={nothing}
    subtitle={ask}
    subtitleId="panel-line"
    titleControl={title}
  >
    <div class="relative flex min-h-0 flex-1 flex-col" data-well>
      {@render page()}
    </div>
  </SideSurface>
  {#if comments && rail}
    <aside
      class="absolute end-space-2 top-c-btn-h-lg bottom-space-2 flex w-(--c-comments-w) flex-col rounded-sm bg-surface-raised"
      data-rail
    >
      {@render rail()}
    </aside>
  {/if}
</div>

<style>
  /* The well gives the rail its room at the card's end (comment-design §1). */
  .has-rail :global([data-side-well]) {
    margin-inline-end: calc(var(--c-comments-w) + var(--space-2));
  }
</style>
