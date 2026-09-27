<!--
  What the transcript looks like before it has arrived.

  Drawn in the transcript's own geometry — the ledger's 25/21 gutters, the
  reader's sunken well bleeding out by its --space-4, the 18px role mark,
  the tool rail's 2px hairline and 26px rows — so the real rows land into
  the same shape and the swap moves nothing. The blocks are static fills;
  the only thing that moves is one band of light crossing the whole
  placeholder on `--breath`, on the compositor, rather than a shimmer
  painted into every bar.
-->
<div aria-busy="true" class="skeleton" role="status">
  <span class="spoken">Reading transcript…</span>

  <!-- The reader's turn: the sunken well, its raised mark, one short line. -->
  <div class="block you">
    <div class="who">
      <span class="mark raised"></span><span class="name"></span>
    </div>
    <div class="ln" style="width: 52%"></div>
  </div>

  <!-- The agent's answer: four lines of prose, ragged the way prose is. -->
  <div class="block">
    <div class="who"><span class="mark"></span><span class="name"></span></div>
    <div class="ln" style="width: 94%"></div>
    <div class="ln" style="width: 81%"></div>
    <div class="ln" style="width: 88%"></div>
    <div class="ln" style="width: 43%"></div>
  </div>

  <!-- Its tool calls, on the rail. -->
  <div class="block tools">
    <div class="trow">
      <span class="ic"></span><span class="tk"></span
      ><span class="arg" style="width: 46%"></span>
    </div>
    <div class="trow">
      <span class="ic"></span><span class="tk"></span
      ><span class="arg" style="width: 31%"></span>
    </div>
    <div class="trow">
      <span class="ic"></span><span class="tk"></span
      ><span class="arg" style="width: 58%"></span>
    </div>
  </div>

  <!-- And what it said about them. -->
  <div class="block">
    <div class="who"><span class="mark"></span><span class="name"></span></div>
    <div class="ln" style="width: 72%"></div>
    <div class="ln" style="width: 35%"></div>
  </div>
</div>

<style>
  /* Mirrors `.tr` in Transcript.svelte: the same asymmetric gutters, the same
     narrow-breakpoint step-down, so the placeholder columns are the transcript's
     columns. `overflow: hidden` clips the band while it is off to either side. */
  .skeleton {
    position: relative;
    overflow: hidden;
    flex: 1 1 auto;
    min-height: 0;
    padding: 0 var(--space-6) var(--space-8) var(--space-7);
    /* The placeholder enters as one thing: DESIGN.md rules out staggered
       page-load fades, so the blocks sit still inside a single fade. */
    animation: sk-in var(--dur-panel) var(--ease-out) both;
  }
  .block {
    margin-top: var(--space-4);
  }
  @keyframes sk-in {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  /* The reader's well, exactly as MessageRow draws it: bleeding back out by
     its own padding so the words sit on the ledger column. Its bars take
     --surface-fill, one step deeper than the well, because the well itself
     is the hover step and a bar at the same value would vanish into it. */
  .block.you {
    margin-inline: calc(var(--space-4) * -1);
    padding: var(--space-3) var(--space-4);
    background: var(--surface-recess);
    border-radius: var(--radius-sm);
  }
  .block.you .ln,
  .block.you .name {
    background: var(--surface-fill);
  }
  @media (max-width: 900px) {
    .skeleton {
      padding-inline: var(--space-5);
    }
    .block.you {
      margin-inline: calc(var(--space-3) * -1);
      padding-inline: var(--space-3);
    }
  }

  /* Who: the 18px mark at --radius-xs and the speaker's name at its step,
     spaced as Who.svelte spaces them. */
  .who {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    height: 18px;
    margin-bottom: var(--space-2);
  }
  .mark {
    width: 18px;
    height: 18px;
    flex: 0 0 auto;
    border-radius: var(--radius-xs);
    background: var(--surface-fill);
  }
  /* The agent's mark is brand-solid in the transcript; here it is the same
     square held at a whisper of that colour, so the placeholder says "an
     answer goes here" without lighting up. */
  .mark:not(.raised) {
    background: oklch(from var(--brand-solid) l c h / 0.28);
  }
  .mark.raised {
    background: var(--surface-raised);
    border: 1px solid var(--border-control);
  }
  /* biome-ignore lint/style/noDescendingSpecificity: cascade order is load-bearing — .name's base fill must lose to .block.you .name above it. */
  .name {
    width: 64px;
    height: 12px;
    border-radius: var(--radius-xs);
    background: var(--surface-hover);
  }

  /* A line of body copy: --text-body at --leading-body is a 21px line box, so
     an 11px bar with 5px above and below keeps the prose pitch exactly. */
  /* biome-ignore lint/style/noDescendingSpecificity: cascade order is load-bearing — .ln's base fill must lose to .block.you .ln above it. */
  .ln {
    height: 11px;
    margin-block: 5px;
    border-radius: var(--radius-xs);
    background: var(--surface-hover);
  }

  /* The tool rail, as ToolGroup draws it: the rail's indent and hairline,
     26px rows, a 15px glyph, the verb, then the mono argument. */
  .block.tools {
    margin-left: var(--space-2);
    padding-left: var(--space-3);
    background: var(--rail) left top / 2px 100% no-repeat;
  }
  .trow {
    min-height: 26px;
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }
  .ic {
    width: 15px;
    height: 15px;
    flex: 0 0 auto;
    border-radius: var(--radius-xs);
    background: var(--surface-hover);
  }
  .tk {
    width: 40px;
    height: 11px;
    flex: 0 0 auto;
    border-radius: var(--radius-xs);
    background: var(--surface-hover);
  }
  .arg {
    height: 11px;
    border-radius: var(--radius-xs);
    background: var(--surface-hover);
  }

  /* The one thing that moves. A band of the raised surface, transparent at
     both edges, translated across the whole placeholder every --breath —
     transform only, so it composites without repainting the bars beneath.
     Linear on purpose: a sweep that eases reads as something arriving. */
  .skeleton::after {
    content: "";
    position: absolute;
    inset: 0;
    pointer-events: none;
    background: linear-gradient(
      90deg,
      transparent 0 35%,
      oklch(from var(--surface-raised) l c h / 0.55) 50%,
      transparent 65% 100%
    );
    transform: translateX(-100%);
    will-change: transform;
    animation: sk-sweep var(--breath) linear infinite;
  }
  @keyframes sk-sweep {
    to {
      transform: translateX(100%);
    }
  }

  /* Under reduced motion the band goes and the blocks sit still, a step
     quieter — the placeholder still says "loading", it just stops moving. */
  @media (prefers-reduced-motion: reduce) {
    .skeleton::after {
      display: none;
    }
    .skeleton {
      animation: none;
      opacity: 0.6;
    }
  }

  /* Read, never seen: off-screen rather than `display: none`, which assistive
     tech skips entirely. */
  .spoken {
    position: absolute;
    width: 1px;
    height: 1px;
    margin: -1px;
    padding: 0;
    border: 0;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
</style>
