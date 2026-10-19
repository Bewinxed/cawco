<script lang="ts">
  /**
   * TODAY: the delegates as the conversation draws them now, one card each
   * in the transcript and nowhere in the plan. It is the transcript's
   * Delegate card's head, brief, status line and asks register, with its
   * markup and styles, fed from fixtures: the real card reads the live
   * client for its session, which a static page has none of. Folded, as the
   * transcript leaves them.
   */
  import { markHue, sessionSprite } from "#lib/cawco/mark.js";
  import { IconChevronRight, IconExternal } from "#lib/icons.js";
  import { todayCards } from "./fixtures";
</script>

<div class="tx-columns cards" data-today>
  <p class="said">
    I've sent the work out to four delegates. Their cards are below; I'll pick
    up their reports as they land.
  </p>
  {#each todayCards as card (card.seed)}
    {@const Sprite = sessionSprite(card.seed)}
    <div class="branch delegate rail-row">
      <div class="head">
        <button class="bhead rail-line press-tint" type="button">
          <span aria-hidden="true" class="mark rail-cell m{markHue(card.seed)}"
            ><Sprite /></span
          >
          <span class="tk">{card.label}</span>
          <span aria-hidden="true" class="chev" data-box
            ><IconChevronRight /></span
          >
          <span class="pill mark-text {card.tone}" data-box>{card.pill}</span>
        </button>
        <span aria-hidden="true" class="jump"><IconExternal /></span>
      </div>
      <p class="brief rail-hang">{card.brief}</p>
      {#if "now" in card}
        <p class="now rail-line" class:err={"err" in card}>
          <span aria-hidden="true" class="rail-cell"
            >{#if card.tone === "live"}<span class="beat"></span>{/if}</span
          >
          <span>{card.now}</span>
        </p>
      {/if}
      {#if "ask" in card}
        <p class="ask rail-line">
          <span aria-hidden="true" class="rail-cell"
            ><span class="dot"></span></span
          >
          <span class="astate">Question</span>
          <span class="ashort">{card.ask}</span>
        </p>
      {/if}
    </div>
  {/each}
</div>

<style>
  .cards {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    padding-block-start: var(--space-2);
  }
  .said {
    margin: 0;
    font: var(--type-body);
    color: var(--ink-strong);
    text-wrap: pretty;
  }
  .branch {
    --well-at: calc(var(--x-hang) - var(--space-1));
  }
  .head {
    display: flex;
    align-items: center;
    gap: var(--space-1);
  }
  .bhead {
    min-block-size: 26px;
    flex: 1 1 auto;
    min-inline-size: 0;
    font-size: var(--text-label);
    font-weight: var(--weight-strong);
    background: none;
    border: 0;
    border-radius: var(--radius-xs);
    padding: 0;
    color: inherit;
    cursor: pointer;
    text-align: start;
  }
  .chev {
    inline-size: 13px;
    block-size: 13px;
    flex: 0 0 auto;
    display: grid;
    place-items: center;
    color: var(--ink-muted);

    & :global(svg) {
      inline-size: 12px;
      block-size: 12px;
      display: block;
    }
  }
  .mark {
    border-radius: var(--radius-xs);
    background-image: var(--mark-overlay);
    background-color: var(--mark-1);

    & :global(svg) {
      inline-size: 11px;
      block-size: 11px;
      display: block;
      color: var(--mark-glyph);
    }
    &.m2 {
      background-color: var(--mark-2);
    }
    &.m3 {
      background-color: var(--mark-3);
    }
    &.m4 {
      background-color: var(--mark-4);
    }
    &.m5 {
      background-color: var(--mark-5);
    }
    &.m6 {
      background-color: var(--mark-6);
    }
    &.m7 {
      background-color: var(--mark-7);
    }
    &.m8 {
      background-color: var(--mark-8);
    }
  }
  .tk {
    font-family: var(--font-mono);
    color: var(--ink-strong);
    flex: 0 1 auto;
    min-inline-size: 0;
    overflow: clip;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .pill {
    margin-inline-start: auto;
    flex: 0 0 auto;
    font-size: var(--text-meta);
    font-weight: var(--weight-body);
    font-variant-numeric: tabular-nums;
    border-radius: var(--radius-xs);
    padding: calc(2px + (1lh - 1ex) / 2) var(--space-2);
    background: var(--status-idle-bg);
    color: var(--status-idle-ink);
    white-space: nowrap;

    &.live {
      background: var(--status-live-bg);
      color: var(--status-live-ink);
    }
    &.attn {
      background: var(--status-attn-bg);
      color: var(--status-attn-ink);
    }
    &.fail {
      background: var(--status-fail-bg);
      color: var(--status-fail-ink);
    }
  }
  .jump {
    flex: 0 0 auto;
    inline-size: 26px;
    block-size: 26px;
    display: grid;
    place-items: center;
    color: var(--ink-muted);

    & :global(svg) {
      inline-size: 12px;
      block-size: 12px;
      display: block;
    }
  }
  .brief {
    margin-block: var(--space-1) 0;
    font-size: var(--text-body);
    color: var(--ink-muted);
    line-height: var(--leading-body);
    overflow-wrap: anywhere;
  }
  .now,
  .ask {
    align-items: start;
    margin-block: var(--space-1) 0;
    font-size: var(--text-meta);
    color: var(--ink-strong);
    line-height: var(--leading-body);

    & > .rail-cell {
      block-size: 1lh;
    }
  }
  .now.err {
    color: var(--status-fail-ink);
  }
  .beat,
  .dot {
    inline-size: 5px;
    block-size: 5px;
    border-radius: 50%;
    background: var(--status-live-glyph);
  }
  .dot {
    background: var(--status-attn-ink);
  }
  .astate {
    flex: 0 0 auto;
    color: var(--status-attn-ink);
    text-transform: uppercase;
    letter-spacing: var(--track-caps);
  }
  .ashort {
    min-inline-size: 0;
    overflow-wrap: anywhere;
  }
</style>
