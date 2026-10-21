<!--
  The dashboard's chat composer (transcript/Composer.svelte), unchanged,
  mounted as the comment composer and the thread's reply (commenting
  addendum §2). It docks on its host's foot as it does over a transcript;
  this host stands in the flow at the height the composer reports
  (`onfoot`) plus its dock's foot, and gives it the host's width
  (`--c-composer-w`, which the composer's column reads). `target`
  is the lead row's chip (TargetChip); `action` the word on its action box.
-->
<script lang="ts">
  import Composer from "$kit/cawco/transcript/Composer.svelte";
  import { ComposerDraft } from "$kit/cawco/transcript/composer-draft.svelte";
  import TargetChip from "./TargetChip.svelte";

  let {
    draft = new ComposerDraft(),
    action,
    placeholder,
    target = null,
    chain = [],
    sendError = "",
    focus = true,
  }: {
    draft?: ComposerDraft;
    action: string;
    placeholder: string;
    /** What the comment is about, its chip leading the pill; none for a reply. */
    target?: string | null;
    /** The chip's menu: the element's parents, out to the whole page. */
    chain?: string[];
    /** Why the last Comment didn't go, over the pill. */
    sendError?: string;
    /** Its field takes the focus as it opens (comment-design §3); off where several stand side by side. */
    focus?: boolean;
  } = $props();

  // svelte-ignore state_referenced_locally: the field is asked for once, as the composer opens
  draft.focusWanted = focus;

  let host = $state<HTMLDivElement>();
  let height = $state(0);
  const onfoot = ({ stack }: { stack: number }) => {
    const dock = host?.querySelector<HTMLElement>("[data-slot='dock']");
    height = stack + (dock ? Number.parseFloat(getComputedStyle(dock).bottom) : 0);
  };
</script>

{#snippet lead()}{#if target}<TargetChip {chain} {target} />{/if}{/snippet}

<div
  bind:this={host}
  class="relative"
  data-docked
  style:--c-composer-w="100%"
  style:height="{height}px"
>
  <Composer
    {action}
    {draft}
    lead={target ? lead : undefined}
    {onfoot}
    onstop={() => undefined}
    onsubmit={() => undefined}
    {placeholder}
    {sendError}
  />
</div>
