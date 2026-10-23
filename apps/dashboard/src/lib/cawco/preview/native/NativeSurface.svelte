<script lang="ts">
  /**
   * The artifact panel as it stands over a native app's preview or canvas:
   * the side surface's head (SideSurface) with the preview's own controls
   * as PreviewPane draws them (Send with its count, the mode's segments,
   * Comments with its open count, Reload) standing by the head's priority
   * rule, and Wire, a pressed toggle drawing every box of the app's tree,
   * where the picture carries one. The well is the caller's.
   */
  import type { Snippet } from "svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  // biome-ignore lint/performance/noNamespaceImport: the kit's compound menu, as every menu of the app imports it
  import * as DropdownMenu from "#lib/components/ui/dropdown-menu/index.js";
  import {
    TabItem,
    Tabs,
    TabsList,
  } from "#lib/components/ui/fluid-tabs/index.js";
  import { Toggle } from "#lib/components/ui/toggle/index.js";
  import {
    IconChat,
    IconComment,
    IconInteract,
    IconLayers,
    IconPen,
    IconRefresh,
    IconSend,
  } from "#lib/icons.js";
  import { HEAD_PRIORITY, type HeadItem } from "../../side/head";
  import SideSurface from "../../side/SideSurface.svelte";

  let {
    title,
    subtitle,
    unsent = 1,
    open = 2,
    wire = $bindable(false),
    wireControl = false,
    children,
  }: {
    /** The artifact's name. */
    title: string;
    /** Its line under the name. */
    subtitle: string;
    /** Picks and comments the session hasn't heard. */
    unsent?: number;
    /** Open comments. */
    open?: number;
    /** Every box of the tree drawn. */
    wire?: boolean;
    /** The head stands Wire. */
    wireControl?: boolean;
    children: Snippet;
  } = $props();

  type Mode = "interact" | "comment" | "draw";
  const MODES: readonly string[] = ["interact", "comment", "draw"];
  let mode = $state<Mode>("comment");
  function choose(next: string) {
    if (MODES.includes(next)) {
      mode = next as Mode;
    }
  }

  const items = $derived<HeadItem[]>([
    {
      key: "send",
      priority: HEAD_PRIORITY.send,
      bar: sendBar,
      menu: sendMenu,
      words: true,
    },
    {
      key: "mode",
      priority: HEAD_PRIORITY.mode,
      bar: modeBar,
      menu: modeMenu,
      group: true,
    },
    {
      key: "comments",
      priority: HEAD_PRIORITY.comments,
      bar: commentsBar,
      menu: commentsMenu,
      count: { n: open, of: "Comments" },
      words: true,
    },
    ...(wireControl
      ? [
          {
            key: "wire",
            // Wire is what this canvas is for: it gives up the head last, as a browser's own control does.
            priority: HEAD_PRIORITY.control,
            bar: wireBar,
            menu: wireMenu,
            words: true,
          },
        ]
      : []),
    {
      key: "reload",
      priority: HEAD_PRIORITY.reload,
      bar: reloadBar,
      menu: reloadMenu,
    },
  ]);
</script>

{#snippet sendBar()}
  <Button aria-label={`Send, ${unsent} unsent`} size="sm" variant="ghost">
    <IconSend /><span class="in-form-compact:hidden">Send</span><span
      class="num">{unsent}</span
    >
  </Button>
{/snippet}
{#snippet sendMenu()}
  <DropdownMenu.Item><IconSend /><span>Send {unsent}</span></DropdownMenu.Item>
{/snippet}

{#snippet modeBar()}
  <Tabs
    onValueChange={choose}
    size="compact"
    value={mode}
    values={["interact", "comment", "draw"]}
  >
    <TabsList aria-label="Preview mode">
      <TabItem
        glyphOnly
        icon={IconInteract}
        label="Interact"
        title="Interact (V): the app gets every tap"
        value="interact"
      />
      <TabItem
        glyphOnly
        icon={IconComment}
        label="Comment"
        title="Comment (C): a click picks a box and pins a comment"
        value="comment"
      />
      <TabItem
        glyphOnly
        icon={IconPen}
        label="Draw"
        title="Draw (D): drag to draw on the app"
        value="draw"
      />
    </TabsList>
  </Tabs>
{/snippet}
{#snippet modeMenu()}
  <DropdownMenu.Group>
    <DropdownMenu.GroupHeading>Mode</DropdownMenu.GroupHeading>
    <DropdownMenu.RadioGroup onValueChange={choose} value={mode}>
      <DropdownMenu.RadioItem value="interact"
        ><IconInteract /><span>Interact</span></DropdownMenu.RadioItem
      >
      <DropdownMenu.RadioItem value="comment"
        ><IconComment /><span>Comment</span></DropdownMenu.RadioItem
      >
      <DropdownMenu.RadioItem value="draw"
        ><IconPen /><span>Draw</span></DropdownMenu.RadioItem
      >
    </DropdownMenu.RadioGroup>
  </DropdownMenu.Group>
{/snippet}

{#snippet commentsBar()}
  <Button aria-label={`Comments, ${open} open`} size="sm" variant="ghost">
    <IconChat /><span class="in-form-compact:hidden">Comments</span><span
      class="min-w-c-count-digit num">{open}</span
    >
  </Button>
{/snippet}
{#snippet commentsMenu()}
  <DropdownMenu.Item
    ><IconChat /><span>Comments</span><span class="ms-auto text-ink-muted num"
      >{open}</span
    ></DropdownMenu.Item
  >
{/snippet}

{#snippet wireBar()}
  <Toggle
    aria-label="Wire"
    bind:pressed={wire}
    size="sm"
    title="Wire: draw every box of the app's tree"
  >
    <IconLayers /><span class="in-form-compact:hidden">Wire</span>
  </Toggle>
{/snippet}
{#snippet wireMenu()}
  <DropdownMenu.CheckboxItem bind:checked={wire}>Wire</DropdownMenu.CheckboxItem
  >
{/snippet}

{#snippet reloadBar()}
  <Button
    aria-label="Reload"
    icon={IconRefresh}
    size="icon-sm"
    title="Reload"
    variant="ghost"
  />
{/snippet}
{#snippet reloadMenu()}
  <DropdownMenu.Item><IconRefresh /><span>Reload</span></DropdownMenu.Item>
{/snippet}

<SideSurface
  {items}
  label="Preview"
  {mode}
  of="preview"
  onclose={() => undefined}
  {subtitle}
  {title}
>
  {@render children()}
</SideSurface>
