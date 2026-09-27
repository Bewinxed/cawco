<!--
  The tail of a transcript that is catching up: one short assistant line,
  in the skeleton's language, under the last row the reader left. The
  transcript above it is already on screen; this stands where the turns
  that arrived while they were away are about to land, and leaves when
  they do.
-->
<div aria-busy="true" class="catchup" role="status">
  <span class="spoken">Catching up…</span>
  <div class="who"><span class="mark"></span><span class="name"></span></div>
  <div class="ln"></div>
</div>

<style>
  /* One assistant turn's worth of the skeleton: the same top rhythm as every
     row, the 18px mark and its name, one line. `overflow: hidden` clips the
     band while it is off to either side. */
  .catchup {
    position: relative;
    overflow: hidden;
    margin-top: var(--space-4);
    animation: cu-in var(--dur-panel) var(--ease-out) both;
  }
  @keyframes cu-in {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
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
    background: oklch(from var(--brand-solid) l c h / 0.28);
  }
  .name {
    width: 64px;
    height: 12px;
    border-radius: var(--radius-xs);
    background: var(--surface-hover);
  }
  /* --text-body at --leading-body is a 21px line box: an 11px bar with 5px
     above and below keeps the prose pitch. Short, the way a line that is
     still arriving is. */
  .ln {
    width: 38%;
    height: 11px;
    margin-block: 5px;
    border-radius: var(--radius-xs);
    background: var(--surface-hover);
  }

  /* The one thing that moves: the skeleton's band, crossing on --breath,
     transform only, linear so it reads as something arriving. */
  .catchup::after {
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
    animation: cu-sweep var(--breath) linear infinite;
  }
  @keyframes cu-sweep {
    to {
      transform: translateX(100%);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .catchup::after {
      display: none;
    }
    .catchup {
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
