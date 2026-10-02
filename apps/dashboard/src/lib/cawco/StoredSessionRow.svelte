<script lang="ts">
  /** One stored session from `listSessions`, linking to its read-only transcript. */
  import type { NeutralSessionInfo } from "@cawco/core";
  import { formatDistanceToNow } from "$lib/utils/time";
  import { cawco } from "./client.svelte";
  import { catalogTitle, conversationHref } from "./links";
  import { markHue, sessionSprite } from "./mark";
  import StoredSessionMenu from "./StoredSessionMenu.svelte";
  import { dragSession } from "./workspace/dnd.svelte";

  interface Props {
    /** The card's own path: a row repeating it adds nothing, so it stays off. */
    groupCwd?: string;
    info: NeutralSessionInfo;
    machineId: string;
  }

  let { machineId, info, groupCwd }: Props = $props();

  const showCwd = $derived(Boolean(info.cwd) && info.cwd !== groupCwd);
  const href = $derived(
    conversationHref(info.sessionId, cawco.instanceIndex, {
      machineId,
      cwd: info.cwd,
    })
  );

  // Distinct per stored session (seeded by its SDK session id). These rows all
  // drew the same cube before; the sprite gives each transcript its own face.
  const Sprite = $derived(sessionSprite(info.sessionId));
</script>

<StoredSessionMenu {info} {machineId}>
  <a
    class="press-tint flex min-h-9 items-center rounded-[var(--radius-sm)] px-4 py-1.5
      transition-colors duration-(--dur-control) ease-out hover:text-foreground"
    {href}
    use:dragSession={{
      sessionId: href.slice('/session/'.length),
      from: null,
      ctx: () => ({ machine: machineId, cwd: info.cwd ?? '', harness: info.harness ?? 'claude' }),
    }}
  >
    <!-- Full-width band, measured content: the same bargain the live rows make. -->
    <span class="flex w-full max-w-3xl items-center gap-3">
      <!-- Where a live row carries its state dot and the card's header carries
           its mark, so a card has one title column top to bottom. -->
      <span
        aria-hidden="true"
        class="flex shrink-0 items-center justify-center opacity-60"
        style="--c-mark:20px;--c-mark-glyph:12px"
      >
        <span class="mark m{markHue(info.cwd || machineId)}">
          <Sprite aria-hidden="true" />
        </span>
      </span>
      <!-- Stops at a readable measure, as the live rows do, so a runaway title
           does not crush the path beside it. -->
      <span class="min-w-0 max-w-lg truncate text-label"
        >{catalogTitle(info, cawco.instanceIndex, machineId)}</span
      >
      <!-- Beside the title, as the live rows carry it: it yields three times as
           readily, and what it keeps it gives up from the left — the leaf is
           what tells two checkouts apart. -->
      {#if showCwd}
        <span
          class="hidden min-w-24 shrink-[3] truncate font-mono text-label text-muted-foreground [direction:rtl] sm:block"
          title={info.cwd}
          ><bdi>{info.cwd}</bdi></span
        >
      {/if}
      <span class="num ml-auto shrink-0 text-meta text-muted-foreground">
        {formatDistanceToNow(new Date(info.lastModified))}
      </span>
    </span>
  </a>
</StoredSessionMenu>

<style>
  /* Item mark — inlined token primitive (identity hue + harness glyph, top-light
     overlay). No clean shadcn equivalent; kept identical in recipe across the
     four sidebar-cluster files. Size comes from --c-mark / --c-mark-glyph set on
     the wrapper. */
  .mark {
    width: var(--c-mark);
    height: var(--c-mark);
    border-radius: var(--radius-xs);
    flex: 0 0 auto;
    display: grid;
    place-items: center;
    background-image: var(--mark-overlay);
    background-color: var(--mark-1);
  }
  .mark :global(svg) {
    width: var(--c-mark-glyph);
    height: var(--c-mark-glyph);
    display: block;
    color: var(--mark-glyph);
  }
  .mark.m2 {
    background-color: var(--mark-2);
  }
  .mark.m3 {
    background-color: var(--mark-3);
  }
  .mark.m4 {
    background-color: var(--mark-4);
  }
  .mark.m5 {
    background-color: var(--mark-5);
  }
  .mark.m6 {
    background-color: var(--mark-6);
  }
  .mark.m7 {
    background-color: var(--mark-7);
  }
  .mark.m8 {
    background-color: var(--mark-8);
  }
</style>
