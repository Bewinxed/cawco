// biome-ignore-all lint/performance/useTopLevelRegex: one-shot codemod run by hand, never on a hot path.
// biome-ignore-all lint/complexity/noExcessiveCognitiveComplexity: single-pass migration over the repository's design-token tree.
/**
 * `bun scripts/codemods/distill-design-system.ts`:
 *
 * Distils CawCo's design system in `apps/dashboard/src/lib/tokens/theme.css`
 * into a two-layer architecture (primitive scales -> semantic roles) and
 * migrates every reference across the dashboard and cross-package consumers
 * (Tailwind utilities, `var(--...)` reads, and TS/Svelte/CSS token names)
 * before writing the distilled `theme.css`.
 *
 * Safe to run more than once: already-migrated references are untouched.
 */
import { loadTexts, THEME, write } from "./lib/theme-tree";

/**
 * Distilled `theme.css` — declared once, by hand, in two layers:
 *   1. Primitive scales (breakpoints, containers, 4px spacing ladder, warm
 *      neutrals, coral ramp, 8 categorical marks, brand pigments, type scale,
 *      radii, 7 durations, 4 curves, 6 z-layers).
 *   2. Semantic roles (surfaces, inks, borders & seam, brand/action/selection,
 *      4 statuses x bg/ink/glyph, control/row/measure sizes, 8 type roles,
 *      4 elevations, 3 transitions, 8 animations, shared mechanics).
 */
const DISTILLED_THEME = `/* CawCo's design system, declared once by hand in Tailwind's @theme:
   Layer 1 defines the primitive scales; Layer 2 binds semantic roles to them.
   \`static\` emits every custom property so scheme and pointer overrides below
   reach every utility. */

@theme static {
  --*: initial;

  /* =========================================================================
     Layer 1 — Primitive scales
     ========================================================================= */

  /* Breakpoints and container tiers. */
  --breakpoint-phone: 640px;
  --breakpoint-desk: 900px;
  --breakpoint-wide: 1025px;

  --container-xs: 320px;
  --container-sm: 448px;
  --container-md: 576px;
  --container-phone: 640px;
  --container-desk: 900px;
  --container-wide: 1025px;

  /* Spacing: one 4px base unit and the house rhythm ladder. */
  --spacing: 0.25rem;
  --spacing-space-row: 2px;
  --spacing-space-1: 4px;
  --spacing-space-2: 8px;
  --spacing-space-3: 12px;
  --spacing-space-4: 16px;
  --spacing-space-5: 20px;
  --spacing-space-6: 24px;
  --spacing-space-8: 32px;

  /* Warm neutrals (paper ~85 by day, roost ~70 at night; low chroma). */
  --color-neutral-1: light-dark(oklch(99.3% 0.004 85), oklch(18.4% 0.004 70));
  --color-neutral-2: light-dark(oklch(96.6% 0.008 85), oklch(21% 0.005 70));
  --color-neutral-3: light-dark(oklch(94.4% 0.01 84), oklch(24.8% 0.006 70));
  --color-neutral-4: light-dark(oklch(92% 0.011 83), oklch(28.2% 0.007 70));
  --color-neutral-5: light-dark(oklch(89% 0.013 82), oklch(31.4% 0.008 70));
  --color-neutral-6: light-dark(oklch(85.4% 0.014 82), oklch(35.2% 0.009 70));
  --color-neutral-7: light-dark(oklch(81% 0.016 80), oklch(40.2% 0.01 72));
  --color-neutral-8: light-dark(oklch(73.5% 0.017 78), oklch(48.8% 0.012 74));
  --color-neutral-9: oklch(52% 0.016 76);
  --color-neutral-11: light-dark(oklch(49.5% 0.014 74), oklch(77.8% 0.012 78));
  --color-neutral-12: light-dark(oklch(29.5% 0.01 70), oklch(93.4% 0.01 82));

  /* Caw coral: brand and primary action. */
  --color-coral-3: light-dark(oklch(94.6% 0.03 38), oklch(28% 0.06 32));
  --color-coral-9: light-dark(oklch(64.5% 0.175 33), oklch(66.5% 0.17 33));
  --color-coral-10: light-dark(oklch(60% 0.175 33), oklch(70.5% 0.16 34));
  --color-coral-11: light-dark(oklch(50% 0.15 32), oklch(80% 0.1 34));

  /* Categorical marks: eight perceptually even hues for identity, accounts, and data.
     mark-8 sits at 70.5% L in dark so all seven account hues hold >=3.9:1 on border-control
     and >=3.0:1 at breath-floor. */
  --color-mark-1: light-dark(oklch(51% 0.168 27.9), oklch(70% 0.17 27.9));
  --color-mark-2: light-dark(oklch(53% 0.15 47.4), oklch(70% 0.15 47.4));
  --color-mark-3: light-dark(oklch(50% 0.115 86.8), oklch(70% 0.12 86.8));
  --color-mark-4: light-dark(oklch(50% 0.132 121.2), oklch(70% 0.135 121.2));
  --color-mark-5: light-dark(oklch(51% 0.093 186.7), oklch(70% 0.095 186.7));
  --color-mark-6: light-dark(oklch(51% 0.14 251.4), oklch(70% 0.145 251.4));
  --color-mark-7: light-dark(oklch(51% 0.15 292.5), oklch(70% 0.155 292.5));
  --color-mark-8: light-dark(oklch(51% 0.165 349.8), oklch(70.5% 0.17 349.8));

  /* Brand art pigments (wordmark, mascot, OG art). */
  --color-spark: #f2d36b;
  --color-paper: #f4f0e6;
  --color-crow-ink: #171715;

  /* House faces, weights (UI never above 500), type ramp, leadings, and trackings. */
  --font-wordmark:
    "Nunito Variable", "Nunito Variable Fallback", ui-rounded, system-ui,
    sans-serif;
  --font-sans:
    "Figtree Variable", "Figtree Variable Fallback", ui-sans-serif, system-ui,
    -apple-system, "Segoe UI", sans-serif;
  --font-mono:
    "JetBrains Mono Variable", "JetBrains Mono Variable Fallback", ui-monospace,
    "SF Mono", monospace;

  --font-weight-normal: 400;
  --font-weight-medium: 500;

  --text-meta: 0.75rem;
  --text-label: 0.8125rem;
  --text-body: 0.875rem;
  --text-row: 1rem;
  --text-title: clamp(1.125rem, 1.048rem + 0.3155vi, 1.25rem);
  --text-kpi: clamp(1.25rem, 1.0962rem + 0.6309vi, 1.5rem);

  --leading-kpi: 1;
  --leading-ui: 1.25;
  --leading-label: 1.4;
  --leading-body: 1.5;
  --leading-code: 1.6;

  --tracking-title: -0.01em;
  --tracking-caps: 0.05em;
  --tracking-wordmark: -0.045em;

  /* Corner radii. */
  --radius-hair: 2px;
  --radius-xs: 4px;
  --radius-sm: 8px;
  --radius-md: 10px;
  --radius-lg: 12px;
  --radius-modal: 18px;
  --radius-pill: 999px;

  /* Motion: seven durations and four curves. */
  --duration-step: 60ms;
  --duration-control: 120ms;
  --duration-fade: 180ms;
  --duration-panel: 280ms;
  --duration-settle: 400ms;
  --duration-loop: 1000ms;
  --duration-breath: 2000ms;

  --ease-out: cubic-bezier(0.23, 1, 0.32, 1);
  --ease-in-out: cubic-bezier(0.77, 0, 0.175, 1);
  --ease-drawer: cubic-bezier(0.32, 0.72, 0, 1);
  --ease-crossfade: cubic-bezier(0.42, 0, 0.58, 1);

  /* Z-index stack: six semantic planes. */
  --layer-base: 20;
  --layer-dock: 50;
  --layer-bar: 60;
  --layer-sheet: 80;
  --layer-float: 120;
  --layer-top: 160;

  /* =========================================================================
     Layer 2 — Semantic roles
     ========================================================================= */

  /* Surfaces: frame recesses, content sits raised; glass and scrim for chrome. */
  --color-surface-page: light-dark(
    var(--color-neutral-2),
    var(--color-neutral-1)
  );
  --color-surface-raised: light-dark(
    var(--color-neutral-1),
    var(--color-neutral-3)
  );
  --color-surface-recess: var(--color-neutral-2);
  --color-surface-sunk: light-dark(
    var(--color-neutral-4),
    var(--color-neutral-1)
  );
  --color-surface-shelf: light-dark(
    var(--color-neutral-5),
    oklch(15.6% 0.004 70)
  );
  --color-surface-hover: var(--color-neutral-4);
  --color-surface-pressed: light-dark(
    var(--color-neutral-6),
    var(--color-neutral-5)
  );
  --color-surface-glass: oklch(from var(--color-surface-raised) l c h / 0.72);
  --color-scrim: oklch(from var(--color-surface-page) l c h / var(--scrim-mix));

  /* Inks: every text ink holds >=4.5:1 on the surfaces it sits on. */
  --color-ink-strong: var(--color-neutral-12);
  --color-ink-muted: var(--color-neutral-11);
  --color-ink-subtle: light-dark(
    color-mix(in oklab, var(--color-neutral-8) 6%, var(--color-neutral-11)),
    color-mix(in oklab, var(--color-neutral-8) 33.3%, var(--color-neutral-11))
  );
  --color-on-ink: var(--color-neutral-1);

  /* Borders & dividers: hairline -> control -> strong (>=3:1), plus coral seam. */
  --color-border-hairline: light-dark(
    color-mix(in oklab, var(--color-neutral-4) 34%, var(--color-neutral-3)),
    color-mix(in oklab, var(--color-neutral-5) 40%, var(--color-neutral-4))
  );
  --color-border-control: light-dark(
    var(--color-neutral-5),
    var(--color-neutral-6)
  );
  --color-border-strong: light-dark(
    var(--color-neutral-9),
    color-mix(in oklab, var(--color-neutral-9), var(--color-neutral-11) 25%)
  );
  --color-seam: light-dark(
    oklch(from var(--color-coral-9) l c h / 0.32),
    oklch(from var(--color-coral-9) l c h / 0.38)
  );

  /* Brand, action & selection. */
  --color-brand-solid: var(--color-coral-9);
  --color-brand-wash: light-dark(
    var(--color-coral-3),
    oklch(from var(--color-coral-9) l c h / 0.16)
  );
  --color-brand-ink: var(--color-coral-11);
  --color-action-solid: light-dark(oklch(55.5% 0.17 33), oklch(54% 0.165 33));
  --color-action-hover: light-dark(oklch(51% 0.165 33), oklch(49.5% 0.16 34));
  --color-on-action: oklch(100% 0 0);
  --color-selected-bg: light-dark(oklch(90.5% 0.062 48), oklch(34% 0.075 40));
  --color-focus-ring: light-dark(oklch(55% 0.165 33), oklch(76% 0.12 34));
  --color-selection: light-dark(
    oklch(64.5% 0.175 33 / 0.2),
    oklch(64.5% 0.175 33 / 0.3)
  );

  /* Status: four states (live, attention, done, fail) x bg / ink / glyph.
     Every ink holds >=4.5:1 on its bg; every glyph holds >=3:1 on surfaces. */
  --color-status-live-bg: light-dark(
    oklch(78.8% 0.052 243.8),
    oklch(36.2% 0.081 252.8)
  );
  --color-status-live-ink: light-dark(
    oklch(30.3% 0.05 253.7),
    oklch(81.8% 0.045 234.6)
  );
  --color-status-live-glyph: light-dark(
    oklch(50% 0.15 252),
    oklch(74% 0.12 245)
  );

  --color-status-attn-bg: light-dark(oklch(91% 0.115 95), oklch(37% 0.07 92));
  --color-status-attn-ink: light-dark(oklch(35% 0.075 88), oklch(90% 0.115 95));
  --color-status-attn-glyph: light-dark(
    oklch(52% 0.125 78),
    oklch(87% 0.14 92)
  );

  --color-status-done-bg: light-dark(
    oklch(75% 0.106 117.7),
    oklch(40.2% 0.089 121.7)
  );
  --color-status-done-ink: light-dark(
    oklch(32.8% 0.059 120.1),
    oklch(84% 0.076 114.5)
  );
  --color-status-done-glyph: light-dark(
    oklch(46.5% 0.14 140),
    oklch(76% 0.15 135)
  );

  --color-status-fail-bg: light-dark(
    oklch(80.4% 0.079 13.6),
    oklch(39% 0.109 13.5)
  );
  --color-status-fail-ink: light-dark(
    oklch(34.4% 0.085 16.3),
    oklch(87.8% 0.054 14.4)
  );
  --color-status-fail-glyph: light-dark(
    oklch(53% 0.19 15),
    oklch(71% 0.16 15)
  );

  /* Support colour tokens: shadows, night inner ring, image edge, dynamic project hue. */
  --color-shadow-tint: light-dark(
    oklch(from var(--color-neutral-12) l c h / 0.09),
    oklch(from var(--color-neutral-1) l c h / 0.55)
  );
  --color-night-ring: light-dark(
    transparent,
    oklch(from var(--color-neutral-12) l c h / 0.07)
  );
  --color-image-outline: light-dark(oklch(0 0 0 / 0.1), oklch(1 0 0 / 0.1));
  --color-identity-ink: light-dark(oklch(48% 0.12 0), oklch(74% 0.11 0));

  /* Semantic control, icon, row, and reading-measure sizes. */
  --spacing-icon-sm: 12px;
  --spacing-icon-md: 16px;
  --spacing-icon-lg: 20px;

  --spacing-control-xs: 24px;
  --spacing-control-sm: 32px;
  --spacing-control-md: 36px;
  --spacing-control-lg: 44px;

  --spacing-row: 40px;
  --spacing-row-compact: 28px;

  --spacing-measure: 72ch;
  --spacing-measure-short: 60ch;

  /* Type roles (font shorthands). */
  --type-meta: 400 var(--text-meta) / var(--leading-label) var(--font-sans);
  --type-label: 500 var(--text-label) / var(--leading-label) var(--font-sans);
  --type-body: 400 var(--text-body) / var(--leading-body) var(--font-sans);
  --type-row: 500 var(--text-row) / var(--leading-label) var(--font-sans);
  --type-title: 500 var(--text-title) / var(--leading-ui) var(--font-sans);
  --type-kpi: 500 var(--text-kpi) / var(--leading-kpi) var(--font-sans);
  --type-code: 400 var(--text-meta) / var(--leading-code) var(--font-mono);
  --type-caps: 500 var(--text-meta) / var(--leading-kpi) var(--font-sans);

  /* Elevations: four steps (xs -> sm -> md -> lg), ringed at night. */
  --shadow-xs: 0 1px 2px var(--color-shadow-tint);
  --shadow-sm:
    0 1px 3px var(--color-shadow-tint), 0 1px 1px var(--color-shadow-tint),
    inset 0 0 0 1px var(--color-night-ring);
  --shadow-md:
    0 3px 10px
      light-dark(
        oklch(from var(--color-neutral-12) l c h / 0.14),
        oklch(from var(--color-neutral-1) l c h / 0.66)
      ),
    0 1px 2px var(--color-shadow-tint), inset 0 0 0 1px var(--color-night-ring);
  --shadow-lg:
    0 18px 48px
      light-dark(
        oklch(from var(--color-neutral-12) l c h / 0.2),
        oklch(from var(--color-neutral-1) l c h / 0.76)
      ),
    0 2px 6px var(--color-shadow-tint), inset 0 0 0 1px var(--color-night-ring);

  /* Shared transitions. */
  --transition-control:
    background-color var(--duration-control) var(--ease-out),
    border-color var(--duration-control) var(--ease-out),
    color var(--duration-control) var(--ease-out),
    --tw-gradient-from var(--duration-control) var(--ease-out),
    --tw-gradient-to var(--duration-control) var(--ease-out);
  --transition-fade-show:
    opacity var(--duration-fade) var(--ease-out), visibility 0s linear;
  --transition-fade-hide:
    opacity var(--duration-fade) var(--ease-out),
    visibility 0s linear var(--duration-fade);

  /* Shared surface, focus, motion, and typography mechanics. */
  --border-width: 1px;
  --focus-ring-width: 2px;
  --focus-ring-offset: 2px;
  --focus-ring-inset: -2px;
  --material-blur: 20px;
  --material-saturate: 1.6;
  --scrim-blur: 2px;
  --scrim-mix: 72%;
  --press-scale: 0.97;
  --pop-scale: 0.92;
  --pop-rise: 8px;
  --breath-floor: 0.77;
  --mono-figure-cap: 0.703;
  --weight-wordmark: 1000;
  --action-surface: linear-gradient(
    to bottom,
    oklch(from var(--color-action-solid) calc(l + 0.03) c h),
    oklch(from var(--color-action-solid) calc(l - 0.03) c h)
  );
  --action-surface-hover: linear-gradient(
    to bottom,
    oklch(from var(--color-action-hover) calc(l + 0.03) c h),
    oklch(from var(--color-action-hover) calc(l - 0.03) c h)
  );
}

@theme inline {
  --default-font-family: var(--font-sans);
  --default-mono-font-family: var(--font-mono);
  --default-transition-duration: var(--duration-control);
  --default-transition-timing-function: var(--ease-out);

  --animate-spin: spin var(--duration-loop) linear infinite;
  --animate-pulse: pulse var(--duration-loop) var(--ease-crossfade) infinite;
  --animate-breath: breath var(--duration-breath) var(--ease-in-out) infinite;
  --animate-ping: ping var(--duration-loop) var(--ease-out) 3 forwards;
  --animate-fade-in: fade-in var(--duration-fade) var(--ease-out) backwards;
  --animate-fade-out: fade-out var(--duration-fade) var(--ease-out) both;
  --animate-rise-in: rise-in var(--duration-panel) var(--ease-out) backwards;
  --animate-rise-out: rise-out var(--duration-fade) var(--ease-out) both;

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
  @keyframes pulse {
    50% {
      opacity: 0.5;
    }
  }
  @keyframes breath {
    50% {
      opacity: var(--breath-floor);
    }
  }
  @keyframes ping {
    75%,
    100% {
      transform: scale(2);
      opacity: 0;
    }
  }
  @keyframes fade-in {
    from {
      opacity: 0;
    }
  }
  @keyframes fade-out {
    to {
      opacity: 0;
    }
  }
  @keyframes rise-in {
    from {
      opacity: 0;
      transform: translateY(var(--pop-rise));
    }
  }
  @keyframes rise-out {
    to {
      opacity: 0;
      transform: translateY(var(--pop-rise));
    }
  }
}

@utility bg-action-surface {
  background-image: var(--action-surface);
}

@utility bg-action-surface-hover {
  background-image: var(--action-surface-hover);
}

@utility type-meta {
  --tw-sort: vertical-align;
  font: var(--type-meta);
}

@utility type-label {
  --tw-sort: vertical-align;
  font: var(--type-label);
}

@utility type-body {
  --tw-sort: vertical-align;
  font: var(--type-body);
}

@utility type-row {
  --tw-sort: vertical-align;
  font: var(--type-row);
}

@utility type-title {
  --tw-sort: vertical-align;
  font: var(--type-title);
  letter-spacing: var(--tracking-title);
}

@utility type-kpi {
  --tw-sort: vertical-align;
  font: var(--type-kpi);
  font-variant-numeric: tabular-nums;
}

@utility type-code {
  --tw-sort: vertical-align;
  font: var(--type-code);
}

@utility type-caps {
  --tw-sort: vertical-align;
  font: var(--type-caps);
  letter-spacing: var(--tracking-caps);
}

@utility text-size-meta {
  font-size: var(--text-meta);
}

@utility text-size-label {
  font-size: var(--text-label);
}

@utility text-size-body {
  font-size: var(--text-body);
}

@utility text-size-title {
  font-size: var(--text-title);
}

@utility text-meta {
  font-size: var(--text-meta);
  line-height: var(--tw-leading, var(--leading-label));
  font-weight: var(--tw-font-weight, var(--font-weight-normal));
}

@utility text-label {
  font-size: var(--text-label);
  line-height: var(--tw-leading, var(--leading-label));
  font-weight: var(--tw-font-weight, var(--font-weight-medium));
}

@utility text-body {
  font-size: var(--text-body);
  line-height: var(--tw-leading, var(--leading-body));
  font-weight: var(--tw-font-weight, var(--font-weight-normal));
}

@utility transition-control {
  transition: var(--transition-control);
}

@utility transition-fade-show {
  transition: var(--transition-fade-show);
}

@utility transition-fade-hide {
  transition: var(--transition-fade-hide);
}

@utility liga-none {
  font-variant-ligatures: none;
}

@utility no-scrollbar {
  scrollbar-width: none;
  &::-webkit-scrollbar {
    display: none;
  }
}

@utility anim-dur-* {
  animation-duration: --value(--duration-*);
}

@utility anim-delay-* {
  animation-delay: --value(--duration-*);
}

@layer theme {
  :root.dark,
  [data-scheme="dark"] {
    --breath-floor: 0.63;
  }

  [data-scheme="light"] {
    --breath-floor: 0.77;
  }

  @media (pointer: coarse), (width < 640px) {
    :root {
      --spacing-row: 44px;
    }
  }
}
`;

// ---- 1. Direct CSS custom-property renames (whole-token match) --------------

const VAR_RENAMES: Record<string, string> = {
  // Surfaces & shadcn aliases
  "--background": "--color-surface-page",
  "--sidebar": "--color-surface-page",
  "--foreground": "--color-ink-strong",
  "--muted": "--color-surface-recess",
  "--muted-foreground": "--color-ink-muted",
  "--color-card": "--color-surface-raised",
  "--color-surface-lift": "--color-surface-raised",
  "--color-tab-sheet": "--color-surface-recess",
  "--color-code-bg": "--color-surface-recess",
  "--color-surface-recess-deep": "--color-surface-sunk",
  "--color-surface-well": "--color-surface-sunk",
  "--color-tab-recede-1": "--color-surface-sunk",
  "--color-accent": "--color-surface-hover",
  "--color-surface-fill": "--color-surface-hover",
  "--color-surface-fill-strong": "--color-surface-pressed",
  "--color-groove-hover": "--color-surface-pressed",
  "--color-material-panel": "--color-surface-glass",

  // Inks
  "--color-ink-row": "--color-ink-strong",
  "--color-code-ink": "--color-ink-strong",
  "--color-media-fill": "--color-ink-strong",
  "--color-chart-1": "--color-ink-strong",
  "--color-mask-opaque": "--color-ink-strong",
  "--color-text-muted": "--color-ink-muted",
  "--color-status-idle-ink": "--color-ink-muted",
  "--color-status-idle-glyph": "--color-ink-muted",
  "--color-meter-calm": "--color-ink-muted",
  "--color-meter-share": "--color-ink-muted",
  "--color-c-clip-other": "--color-ink-muted",
  "--color-machine-offline": "--color-ink-subtle",
  "--color-meter-stale": "--color-ink-subtle",
  "--color-presence-off": "--color-ink-subtle",
  "--color-account-reserved": "--color-ink-subtle",
  "--color-chart-5": "--color-ink-subtle",
  "--color-mark-glyph": "--color-on-ink",

  // Borders
  "--color-border": "--color-border-control",
  "--color-border-well": "--color-border-control",
  "--color-input": "--color-border-control",
  "--color-meter-calm-track": "--color-border-control",
  "--color-meter-stale-track": "--color-border-control",
  "--color-media-track": "--color-border-control",
  "--color-border-contrast": "--color-border-strong",
  "--color-border-row-outline": "--color-border-strong",
  "--color-media-buffered": "--color-border-strong",

  // Brand, action, selection
  "--color-chart-brand": "--color-brand-solid",
  "--color-brand-hover": "--color-action-hover",
  "--color-brand-ink-strong": "--color-brand-ink",
  "--color-link-ink": "--color-brand-ink",
  "--color-link-hover": "--color-brand-ink",
  "--color-selected-ink": "--color-brand-ink",
  "--color-selected-icon": "--color-brand-ink",
  "--color-chip-chosen-ink": "--color-on-action",

  // Status & notes & functional aliases
  "--color-info-3": "--color-status-live-bg",
  "--color-note-improved-bg": "--color-status-live-bg",
  "--color-info-11": "--color-status-live-ink",
  "--color-note-improved-ink": "--color-status-live-ink",
  "--color-info-9": "--color-status-live-glyph",
  "--color-chart-2": "--color-status-live-glyph",
  "--color-note-fixed-bg": "--color-status-attn-bg",
  "--color-meter-near-track": "--color-status-attn-bg",
  "--color-note-fixed-ink": "--color-status-attn-ink",
  "--color-warning-9": "--color-status-attn-glyph",
  "--color-presence-away": "--color-status-attn-glyph",
  "--color-chart-4": "--color-status-attn-glyph",
  "--color-tab-rim-attn": "--color-status-attn-glyph",
  "--color-success-3": "--color-status-done-bg",
  "--color-note-new-bg": "--color-status-done-bg",
  "--color-success-11": "--color-status-done-ink",
  "--color-note-new-ink": "--color-status-done-ink",
  "--color-success-9": "--color-status-done-glyph",
  "--color-presence-online": "--color-status-done-glyph",
  "--color-c-change-ring": "--color-status-done-glyph",
  "--color-error-3": "--color-status-fail-bg",
  "--color-meter-over-track": "--color-status-fail-bg",
  "--color-error-11": "--color-status-fail-ink",
  "--color-error-9": "--color-status-fail-glyph",
  "--color-c-guide-miss": "--color-status-fail-glyph",

  // Accounts, clips, guides, OpenCode logo
  "--color-account-amber": "--color-mark-3",
  "--color-account-orange": "--color-mark-2",
  "--color-account-green": "--color-mark-4",
  "--color-account-cyan": "--color-mark-5",
  "--color-account-blue": "--color-mark-6",
  "--color-account-rose": "--color-mark-8",
  "--color-account-violet": "--color-mark-7",
  "--color-c-clip-size": "--color-mark-6",
  "--color-c-clip-move": "--color-mark-7",
  "--color-c-clip-fade": "--color-mark-3",
  "--color-c-clip-tint": "--color-mark-8",
  "--color-c-clip-effect": "--color-mark-5",
  "--color-c-guide-start": "--color-mark-6",
  "--color-c-guide-end": "--color-mark-8",
  "--color-c-guide-centre": "--color-mark-7",
  "--color-c-guide-baseline": "--color-mark-5",
  "--color-c-guide-surface": "--color-mark-3",
  "--color-chart-3": "--color-mark-7",
  "--color-opencode-logo-core": "--color-neutral-7",
  "--color-opencode-logo-frame": "--color-ink-strong",

  // Internal design.css helper paint names (dropped from theme.css --color-*)
  "--color-nest-ink": "--nest-ink",
  "--color-account-week-toward": "--account-week-toward",
  "--color-ring-track-spent": "--ring-track-spent",
  "--color-meter-wash-over": "--meter-wash-over",
  "--color-mark-deck-shade": "--mark-deck-shade",
  "--color-mark-deck-cast": "--mark-deck-cast",
  "--color-scrollbar-thumb": "--scrollbar-thumb",
  "--color-prose-bullet": "--prose-bullet",
  "--color-tab-shade": "--tab-shade",
  "--color-tab-shade-chosen": "--tab-shade-chosen",
  "--color-shadow-tint-2": "--shadow-tint-2",
  "--color-shadow-tint-3": "--shadow-tint-3",
  "--rail-body": "--rail",

  // Typography
  "--text-code": "--text-meta",
  "--text-field-floor": "--text-row",
  "--leading-meta": "--leading-label",
  "--leading-prose": "--leading-body",
  "--leading-prose-sm": "--leading-body",
  "--tracking-display": "--tracking-title",
  "--type-prose": "--type-body",
  "--type-button": "--type-label",

  // Radii
  "--radius-well": "--radius-sm",
  "--radius-inner-well": "--radius-sm",
  "--radius-glide-row": "--radius-xs",

  // Shadows
  "--shadow-tile": "--shadow-sm",
  "--shadow-raised": "--shadow-sm",
  "--shadow-hairline": "--shadow-sm",
  "--shadow-knob": "--shadow-sm",
  "--shadow-overlay": "--shadow-lg",
  "--shadow-drawer": "--shadow-lg",

  // Durations & curves
  "--duration-stagger": "--duration-step",
  "--duration-type": "--duration-step",
  "--duration-ghost": "--duration-step",
  "--duration-menu": "--duration-control",
  "--duration-goo-content-delay": "--duration-control",
  "--duration-goo-content-exit": "--duration-control",
  "--duration-toggle": "--duration-fade",
  "--duration-exit": "--duration-fade",
  "--duration-morph": "--duration-fade",
  "--duration-pick-up": "--duration-fade",
  "--duration-goo-content": "--duration-fade",
  "--duration-pop": "--duration-panel",
  "--duration-panel-exit": "--duration-panel",
  "--duration-peek": "--duration-panel",
  "--duration-glide": "--duration-panel",
  "--duration-goo-exit": "--duration-panel",
  "--duration-cascade": "--duration-settle",
  "--duration-goo": "--duration-settle",
  "--duration-press-hold": "--duration-settle",
  "--duration-skeleton-reveal": "--duration-settle",
  "--duration-goo-settle": "--duration-settle",
  "--duration-hold": "--duration-loop",
  "--duration-wait-grace": "--duration-loop",
  "--duration-skeleton-pulse": "--duration-loop",
  "--ease-goo": "--ease-drawer",

  // Semantic spacing & rhythm
  "--spacing-space-7": "--spacing-space-6",
  "--spacing-space-group": "--spacing-space-5",
  "--spacing-c-floating-pad": "--spacing-space-2",
  "--spacing-c-pill-gap": "--spacing-space-2",
  "--spacing-c-composer-inset": "--spacing-space-2",
  "--spacing-c-pin-pad": "--spacing-space-2",
  "--spacing-c-tray-gap": "--spacing-space-2",
  "--row-compact-gap": "--spacing-space-2",
  "--row-compact-pad-end": "--spacing-space-2",
  "--spacing-c-segment-pad-x-compact": "--spacing-space-2",
  "--spacing-c-scrollbar-thin": "--spacing-space-2",
  "--spacing-c-bar-group-pad": "--spacing-space-1",
  "--spacing-c-composer-nudge": "--spacing-space-1",
  "--spacing-c-deck-peek": "--spacing-space-1",
  "--spacing-c-head-fade-blur": "--spacing-space-1",
  "--spacing-c-inline-chip-pad": "--spacing-space-row",
  "--spacing-c-recall-cross-blur": "--spacing-space-row",
  "--spacing-c-caw-ring": "--spacing-space-row",
  "--spacing-c-bar-phone-edge": "--spacing-space-3",
  "--spacing-c-tab-lead": "--spacing-space-3",
  "--spacing-c-row-inset": "--spacing-space-3",
  "--spacing-c-segment-pad-x": "--spacing-space-3",
  "--spacing-c-screen-margin": "--spacing-space-3",
  "--spacing-c-deck-gap": "--spacing-space-3",
  "--tx-diff-head-inline": "--spacing-space-3",
  "--spacing-c-head-fade": "--spacing-space-6",
  "--spacing-c-edge-fade-len-phone": "--spacing-space-4",

  // Semantic control / row / measure sizes
  "--spacing-c-btn-h-xs": "--spacing-control-xs",
  "--spacing-c-pill-h": "--spacing-control-xs",
  "--spacing-c-pointer-floor": "--spacing-control-xs",
  "--spacing-c-bar-caw-head-phone": "--spacing-control-xs",
  "--spacing-c-btn-h-sm": "--spacing-control-sm",
  "--spacing-c-menu-item-h": "--spacing-control-sm",
  "--spacing-c-section-head-h": "--spacing-control-sm",
  "--spacing-c-bar-caw-glass-phone": "--spacing-control-sm",
  "--tx-option": "--spacing-control-sm",
  "--spacing-c-btn-h": "--spacing-control-md",
  "--spacing-c-input-h": "--spacing-control-md",
  "--spacing-c-tab-row-h": "--spacing-control-md",
  "--spacing-c-status-mark": "--spacing-control-md",
  "--spacing-c-composer-field": "--spacing-control-md",
  "--spacing-c-btn-h-lg": "--spacing-control-lg",
  "--spacing-c-touch-floor": "--spacing-control-lg",
  "--spacing-c-top-bar-h": "--spacing-control-lg",
  "--spacing-c-row-h": "--spacing-control-lg",
  "--spacing-c-ledger-row-h": "--spacing-control-lg",
  "--spacing-c-artifact-row-h": "--spacing-control-lg",
  "--tx-line-touch": "--spacing-control-lg",
  "--spacing-c-nav-h": "--spacing-row",
  "--spacing-c-rail-row-h": "--spacing-row",
  "--row-compact-h": "--spacing-row-compact",
  "--spacing-c-pin": "--spacing-row-compact",
  "--spacing-c-row-lead": "--spacing-row-compact",
  "--spacing-c-tray-chip": "--spacing-row-compact",
  "--spacing-c-bar-item": "--spacing-row-compact",
  "--spacing-c-badge-h": "--spacing-icon-lg",
  "--spacing-c-measure": "--spacing-measure",
  "--spacing-c-diagram-medium": "--spacing-measure",
  "--spacing-c-measure-short": "--spacing-measure-short",
  "--spacing-c-target-stroke": "--border-width",
  "--spacing-c-pin-gone-ring": "--border-width",
  "--spacing-c-guide-line": "--border-width",
  "--spacing-c-guide-miss-line": "--spacing-space-row",
  "--spacing-c-change-ring-width": "--focus-ring-width",
  "--spacing-c-change-ring-offset": "--spacing-space-1",
  "--spacing-c-change-ping-spread": "--spacing-space-3",
  "--spacing-c-meter-bar-h": "--spacing-space-2",
  "--spacing-c-comments-w": "--container-xs",
  "--spacing-c-machines-w": "--container-xs",
  "--spacing-c-signin-col-w": "--container-xs",
  "--spacing-c-side-surface-min": "--container-xs",
  "--spacing-c-hover-panel-room": "--container-xs",

  // Component-local vars moved to design.css :root
  "--spacing-c-composer-panel": "--composer-panel",
  "--spacing-c-composer-w": "--composer-w",
  "--spacing-c-inset-composer": "--inset-composer",
  "--spacing-c-inset-floating": "--inset-floating",
  "--spacing-c-suggest-chip": "--suggest-chip",
  "--spacing-c-suggest-row": "--suggest-row",
  "--spacing-c-suggest-room": "--suggest-room",
  "--spacing-c-starters-w": "--starters-w",
  "--spacing-c-tray-row": "--tray-row",
  "--spacing-c-ledger-text-inset": "--ledger-text-inset",
  "--spacing-c-field-inline-inset": "--field-inline-inset",
  "--spacing-c-draft-col-h": "--draft-col-h",
  "--spacing-c-usage-strip-row": "--usage-strip-row",
  "--spacing-c-usage-strip-clip": "--usage-strip-clip",
  "--spacing-c-pin-card-reading-w": "--pin-card-reading-w",
  "--spacing-c-step-rail-x": "--step-rail-x",
  "--spacing-c-step-rail-top": "--step-rail-top",
  "--spacing-c-step-rail-gap": "--step-rail-gap",
  "--spacing-c-head-room": "--head-room",
  "--spacing-c-edge-fade-len": "--edge-fade-len",
  "--spacing-c-decision-page-max": "--decision-page-max",
  "--spacing-c-picture-min": "--picture-min",
  "--spacing-c-usage-tile-min": "--usage-tile-min",
  "--spacing-c-stat-tile-min": "--stat-tile-min",
  "--spacing-c-model-list-max": "--model-list-max",
  "--spacing-c-drag-dots-tile": "--drag-dots-tile",
  "--spacing-c-drag-dots-edge": "--drag-dots-edge",
  "--spacing-c-corner-grip-stroke": "--corner-grip-stroke",
  "--spacing-c-graph-edge": "--graph-edge",
  "--spacing-c-tree-mark-hole-edge": "--tree-mark-hole-edge",
  "--spacing-c-tip-arrow-nudge": "--tip-arrow-nudge",
  "--spacing-c-hang-shadow-room": "--hang-shadow-room",
  "--spacing-c-tab-strip-uncapped": "--tab-strip-uncapped",
  "--spacing-c-compaction-word-bleed": "--compaction-word-bleed",
  "--spacing-c-sidebar-w": "--sidebar-w",
  "--spacing-c-pin-card-w": "--pin-card-w",
  "--spacing-c-graph-node-w": "--graph-node-w",
  "--spacing-c-graph-label": "--graph-label",
  "--spacing-c-graph-stage-min": "--graph-stage-min",
  "--spacing-c-graph-move-name-w": "--graph-move-name-w",
  "--spacing-c-graph-control-w": "--graph-control-w",
  "--spacing-c-starter-w": "--starter-w",
  "--spacing-c-signin-pop-w": "--signin-pop-w",
  "--spacing-c-panel-w": "--panel-w",
  "--spacing-c-find-w": "--find-w",
  "--spacing-c-connect-w": "--connect-w",
  "--spacing-c-caw-panel-h": "--caw-panel-h",
  "--spacing-c-board-col-min": "--board-col-min",
  "--spacing-c-board-col-max": "--board-col-max",
  "--spacing-c-roster-card-min": "--roster-card-min",
  "--spacing-c-line-answer-w": "--line-answer-w",
  "--spacing-c-line-answer-w-narrow": "--line-answer-w-narrow",
  "--spacing-c-answer-w": "--answer-w",
  "--spacing-c-foot-fade": "--foot-fade",
  "--spacing-c-session-hover-room": "--session-hover-room",
  "--spacing-c-block-body-max": "--block-body-max",
  "--spacing-c-grid-4": "--grid-4",
  "--spacing-c-grid-2": "--grid-2",
  "--spacing-c-block-routines": "--block-routines",
  "--spacing-c-block-ledger": "--block-ledger",
  "--spacing-c-block-view": "--block-view",
  "--spacing-c-sheet-max-h": "--sheet-max-h",
  "--spacing-c-peek-sheet-h": "--peek-sheet-h",
  "--spacing-c-line-sheet-h": "--line-sheet-h",
  "--spacing-c-grabber-w": "--grabber-w",
  "--spacing-c-grabber-h": "--grabber-h",
  "--spacing-c-decision-meter-w": "--decision-meter-w",
  "--spacing-c-decision-option-min": "--decision-option-min",
  "--spacing-c-decision-code": "--decision-code",
  "--spacing-c-canvas-skeleton-w": "--canvas-skeleton-w",
  "--spacing-c-address-qr": "--address-qr",
  "--spacing-c-address-caw": "--address-caw",
  "--spacing-c-address-phone-h": "--address-phone-h",
  "--spacing-c-caw-hero": "--caw-hero",
  "--spacing-c-pose-tile": "--pose-tile",
  "--spacing-c-roster-face": "--roster-face",
  "--spacing-c-bench-phone-h": "--bench-phone-h",
  "--spacing-c-mark": "--mark-box",
  "--spacing-c-row-mark": "--row-mark-box",
  "--spacing-c-inline-chip-line": "--row-mark-box",
  "--spacing-c-bar-symbol": "--bar-symbol",
  "--spacing-c-bar-toggle-glyph": "--bar-symbol",
  "--spacing-c-skeleton-x-height": "--spacing-x-height",
  "--spacing-c-peek-glyph": "--spacing-icon-md",
  "--spacing-c-usage-cap-lh": "--spacing-space-4",
  "--spacing-c-context-bar-min": "--context-bar-min",
  "--spacing-c-context-bar-max": "--context-bar-max",

  // Layer base renames (exact-tier ones; intra-tier offsets handled separately)
  "--layer-band": "--layer-base",
  "--layer-toast": "--layer-top",
};

// ---- 2. Tailwind colour utility suffix renames ------------------------------

const COLOR_SUFFIX_MAP: Record<string, string> = {
  // Surfaces
  background: "surface-page",
  sidebar: "surface-page",
  card: "surface-raised",
  "surface-lift": "surface-raised",
  muted: "surface-recess",
  "tab-sheet": "surface-recess",
  "code-bg": "surface-recess",
  "surface-recess-deep": "surface-sunk",
  "surface-well": "surface-sunk",
  "tab-recede-1": "surface-sunk",
  accent: "surface-hover",
  "surface-fill": "surface-hover",
  "surface-fill-strong": "surface-pressed",
  "groove-hover": "surface-pressed",
  "material-panel": "surface-glass",
  "surface-recess-clear": "surface-recess/0",
  "needs-ground": "status-attn-bg/45",
  "strategy-card-picked": "selected-bg/45",
  "meter-wash-over": "(--meter-wash-over)",

  // Inks
  foreground: "ink-strong",
  "ink-row": "ink-strong",
  "code-ink": "ink-strong",
  "media-fill": "ink-strong",
  "chart-1": "ink-strong",
  "mask-opaque": "ink-strong",
  "muted-foreground": "ink-muted",
  "text-muted": "ink-muted",
  "status-idle-ink": "ink-muted",
  "status-idle-glyph": "ink-muted",
  "meter-calm": "ink-muted",
  "meter-share": "ink-muted",
  "c-clip-other": "ink-muted",
  "machine-offline": "ink-subtle",
  "meter-stale": "ink-subtle",
  "presence-off": "ink-subtle",
  "account-reserved": "ink-subtle",
  "chart-5": "ink-subtle",
  "mark-glyph": "on-ink",

  // Borders
  border: "border-control",
  "border-well": "border-control",
  input: "border-control",
  "meter-calm-track": "border-control",
  "meter-stale-track": "border-control",
  "media-track": "border-control",
  "border-contrast": "border-strong",
  "border-row-outline": "border-strong",
  "media-buffered": "border-strong",

  // Brand, action, selection
  "chart-brand": "brand-solid",
  "brand-hover": "action-hover",
  "brand-ink-strong": "brand-ink",
  "link-ink": "brand-ink",
  "link-hover": "brand-ink",
  "selected-ink": "brand-ink",
  "selected-icon": "brand-ink",
  "chip-chosen-ink": "on-action",

  // Status, notes, functional
  "info-3": "status-live-bg",
  "note-improved-bg": "status-live-bg",
  "info-11": "status-live-ink",
  "note-improved-ink": "status-live-ink",
  "info-9": "status-live-glyph",
  info: "status-live-glyph",
  "chart-2": "status-live-glyph",
  "note-fixed-bg": "status-attn-bg",
  "meter-near-track": "status-attn-bg",
  "note-fixed-ink": "status-attn-ink",
  "warning-9": "status-attn-glyph",
  "presence-away": "status-attn-glyph",
  "chart-4": "status-attn-glyph",
  "tab-rim-attn": "status-attn-glyph",
  "success-3": "status-done-bg",
  "note-new-bg": "status-done-bg",
  "success-11": "status-done-ink",
  "note-new-ink": "status-done-ink",
  "success-9": "status-done-glyph",
  "presence-online": "status-done-glyph",
  "c-change-ring": "status-done-glyph",
  "error-3": "status-fail-bg",
  "meter-over-track": "status-fail-bg",
  "error-11": "status-fail-ink",
  "error-9": "status-fail-glyph",
  "c-guide-miss": "status-fail-glyph",
  "status-idle-bg": "transparent",

  // Accounts, clips, guides, OpenCode
  "account-amber": "mark-3",
  "account-orange": "mark-2",
  "account-green": "mark-4",
  "account-cyan": "mark-5",
  "account-blue": "mark-6",
  "account-rose": "mark-8",
  "account-violet": "mark-7",
  "c-clip-size": "mark-6",
  "c-clip-move": "mark-7",
  "c-clip-fade": "mark-3",
  "c-clip-tint": "mark-8",
  "c-clip-effect": "mark-5",
  "c-clip-size-wash": "mark-6/22",
  "c-clip-move-wash": "mark-7/22",
  "c-clip-fade-wash": "mark-3/22",
  "c-clip-tint-wash": "mark-8/22",
  "c-clip-effect-wash": "mark-5/22",
  "c-clip-other-wash": "ink-muted/22",
  "c-guide-start": "mark-6",
  "c-guide-end": "mark-8",
  "c-guide-centre": "mark-7",
  "c-guide-baseline": "mark-5",
  "c-guide-surface": "mark-3",
  "chart-3": "mark-7",
  "opencode-logo-core": "neutral-7",
  "opencode-logo-frame": "ink-strong",

  // Helper paints moved to design.css :root
  "nest-ink": "(--nest-ink)",
  "ring-track-spent": "(--ring-track-spent)",
  "mark-deck-shade": "(--mark-deck-shade)",
  "mark-deck-cast": "(--mark-deck-cast)",
};

const COLOR_PREFIXES =
  "bg|text|border(?:-[xytrblse])?|outline|ring|ring-offset|inset-ring|fill|stroke|decoration|accent|caret|divide|from|via|to|placeholder|background|ring-ground";

// ---- 3. Tailwind spacing/sizing utility suffix renames ----------------------

const SPACING_SUFFIX_MAP: Record<string, string> = {
  // Rhythm & ladder
  "space-7": "space-6",
  "space-group": "space-5",
  "c-floating-pad": "space-2",
  "c-pill-gap": "space-2",
  "c-composer-inset": "space-2",
  "c-pin-pad": "space-2",
  "c-tray-gap": "space-2",
  "c-segment-pad-x-compact": "space-2",
  "c-bar-group-pad": "space-1",
  "c-composer-nudge": "space-1",
  "c-deck-peek": "space-1",
  "c-inline-chip-pad": "space-row",
  "c-bar-phone-edge": "space-3",
  "c-tab-lead": "space-3",
  "c-row-inset": "space-3",
  "c-segment-pad-x": "space-3",
  "c-screen-margin": "space-3",
  "c-deck-gap": "space-3",
  "c-head-fade": "space-6",
  "c-edge-fade-len-phone": "space-4",
  "c-meter-bar-h": "space-2",

  // Semantic controls, rows, icons, measures
  "c-btn-h-xs": "control-xs",
  "c-pill-h": "control-xs",
  "c-pointer-floor": "control-xs",
  "c-bar-caw-head-phone": "control-xs",
  "c-btn-h-sm": "control-sm",
  "c-menu-item-h": "control-sm",
  "c-section-head-h": "control-sm",
  "c-bar-caw-glass-phone": "control-sm",
  "c-btn-h": "control-md",
  "c-input-h": "control-md",
  "c-tab-row-h": "control-md",
  "c-status-mark": "control-md",
  "c-composer-field": "control-md",
  "c-btn-h-lg": "control-lg",
  "c-touch-floor": "control-lg",
  "c-top-bar-h": "control-lg",
  "c-row-h": "control-lg",
  "c-ledger-row-h": "control-lg",
  "c-artifact-row-h": "control-lg",
  "c-nav-h": "row",
  "c-rail-row-h": "row",
  "c-pin": "row-compact",
  "c-row-lead": "row-compact",
  "c-tray-chip": "row-compact",
  "c-bar-item": "row-compact",
  "c-badge-h": "icon-lg",
  "c-measure": "measure",
  "c-diagram-medium": "measure",
  "c-measure-short": "measure-short",

  // Container tiers
  "c-comments-w": "xs",
  "c-machines-w": "xs",
  "c-signin-col-w": "xs",
  "c-side-surface-min": "xs",
  "c-hover-panel-room": "xs",

  // Numeric 4px-scale component geometry (non-rhythm sizing utilities)
  "c-mark": "6.5",
  "c-row-mark": "4.5",
  "c-inline-chip-line": "4.5",
  "c-bar-symbol": "4.5",
  "c-bar-toggle-glyph": "4.5",
  "c-stat-h": "22",
  "c-find-w": "130",
  "c-connect-w": "120",
  "c-panel-w": "95",
  "c-signin-pop-w": "85",
  "c-caw-panel-h": "160",
  "c-tab-max-w": "60",
  "c-pin-card-w": "70",
  "c-canvas-skeleton-w": "60",
  "c-graph-node-w": "52",
  "c-graph-label": "40",
  "c-graph-move-name-w": "48",
  "c-graph-control-w": "64",
  "c-graph-figure-w": "42",
  "c-graph-stage-min": "150",
  "c-starter-w": "44",
  "c-starter-h": "14",
  "c-routine-time-w": "36",
  "c-block-body-max": "120",
  "c-inline-block-fossil-h": "40",
  "c-tray-chip-min": "30",
  "c-tray-chip-max": "56",
  "c-textarea-max-h": "50",
  "c-btn-min-w": "24",
  "c-edge-fade-len": "10",
  "c-line-answer-w": "33",
  "c-line-answer-w-narrow": "32",
  "c-peek-sheet-w": "96",
  "c-grabber-w": "25",
  "c-grabber-h": "1.5",
  "c-config-max-w": "245",
  "c-row-h-two": "14",
  "c-setup-nickname-w": "70",
  "c-decision-page-max": "337",
  "c-decision-meter-w": "30",
  "c-decision-option-min": "48",
  "c-picture-min": "40",
  "c-lead-card-w": "104",
  "c-move-wait-col-w": "140",
  "c-find-phone-h": "13",
  "c-ledger-when-w": "24",
  "c-ledger-when-w-narrow": "18",
  "c-ledger-outcome-w": "44",
  "c-ledger-outcome-w-narrow": "32",
  "c-ledger-took-w": "20",
  "c-ledger-count-w": "32",
  "c-ledger-usd-w": "24",
  "c-matrix-col-w": "56",
  "c-version-col-w": "24",
  "c-tool-state-col-w": "64",
  "c-side-grip-w": "1.5",
  "c-page-column-w": "136",
  "c-page-line": "104",
  "c-view-lead-min": "36",
  "c-board-col-min": "60",
  "c-board-col-max": "88",
  "c-task-label-field-w": "32",
  "c-task-stage-skeleton-w": "24",
  "c-usage-cap-lh": "4",
  "c-hang-shadow-room": "30",
  "c-usage-tile-min": "62",
  "c-roster-card-min": "70",
  "c-roster-face": "12",
  "c-pose-tile": "16",
  "c-stat-tile-min": "38",
  "c-key-field-basis": "56",
  "c-key-field-max": "96",
  "c-bench-phone-w": "97.5",
  "c-bench-phone-h": "211",
  "c-bench-field-w": "120",
  "c-rail-sheet-w": "71",
  "c-session-hover-room": "90",
  "c-foot-fade": "24",
  "c-address-caw": "16",
  "c-answer-w": "28",
  "c-address-qr": "28",
  "c-address-raw-h": "48",
  "c-address-phone-h": "195",
  "c-caw-hero": "20",
  "c-context-bar-min": "12",
  "c-context-bar-max": "24",
  "c-model-list-max": "58",
  "c-draft-line": "56",
  "c-sidebar-w": "57",

  // Compound formulas moved to design.css :root -> var form
  "c-step-rail-x": "(--step-rail-x)",
  "c-step-rail-top": "(--step-rail-top)",
  "c-step-rail-gap": "(--step-rail-gap)",
  "c-head-room": "(--head-room)",
  "c-inset-composer": "(--inset-composer)",
  "c-inset-floating": "(--inset-floating)",
  "c-composer-w": "(--composer-w)",
  "c-suggest-chip": "(--suggest-chip)",
  "c-suggest-row": "(--suggest-row)",
  "c-starters-w": "(--starters-w)",
  "c-tray-row": "(--tray-row)",
  "c-ledger-text-inset": "(--ledger-text-inset)",
  "c-field-inline-inset": "(--field-inline-inset)",
  "c-draft-col-h": "(--draft-col-h)",
  "c-usage-strip-row": "(--usage-strip-row)",
  "c-usage-strip-clip": "(--usage-strip-clip)",
  "c-tip-arrow-nudge": "(--tip-arrow-nudge)",

  // Character-measure & viewport-measure helpers (resolved via design.css utilities)
  "c-inline-chip-max-w": "ch-32",
  "c-measure-meta": "ch-32",
  "c-rail-count-min": "ch-3",
  "c-skeleton-age": "ch-2",
  "c-tree-mark-num-w": "ch-2",
  "c-usage-pct-w": "ch-4",
  "c-give-way-min": "ch-6",
  "c-elapsed-w": "ch-7",
  "c-offer-line": "ch-24",
  "c-turn-clock-w": "ch-9",
  "c-bench-readout-w": "ch-4",
  "c-trail-col": "ch-3",
  "c-skeleton-x-height": "x-height",
  "c-sheet-max-h": "vh-85",
  "c-dialog-max-h": "dvh-85",
  "c-dialog-document-w": "vw-95",
  "c-line-sheet-h": "dvh-70",
  "c-peek-sheet-h": "dvh-80",
  "c-media-max-h": "vb-80",
  "c-report-text-max": "vh-60",
  "c-lightbox-sheet-w": "(--lightbox-sheet-w)",
  "c-lightbox-sheet-max-h": "(--lightbox-sheet-max-h)",
  "c-doc-max": "(--doc-max)",
};

const SPACING_PREFIXES =
  "p[xystblrse]?|pbs|pbe|m[xystblrse]?|mbs|mbe|gap(?:-[xy])?|space-[xy]|w|min-w|max-w|h|min-h|max-h|size|basis|inset(?:-[xy])?|top|right|bottom|left|start|end|translate(?:-[xy])?|scroll-[pm][xystblrse]?|leading|r-inset|fade-len|hit-gap-[xy]|pb-safe|tray-indent|clip-margin";

// ---- 4. Container variant renames -------------------------------------------

const CONTAINER_MAP: Record<string, string> = {
  "stop-tray-rail": "xs",
  "section-row": "xs",
  "suggestion-rows-narrow": "xs",
  "table-400px": "sm",
  "find-line": "sm",
  "stop-tray": "sm",
  "repo-narrow": "sm",
  "table-424px": "sm",
  "field-group": "sm",
  details: "sm",
  timeline: "sm",
  kinds: "sm",
  "table-496px": "md",
  "decisions-520px": "md",
  "table-34rem": "md",
  "member-setup": "md",
  "table-576px": "md",
  "project-dock": "md",
  leaf: "phone",
  setup: "phone",
  "media-split": "phone",
  "table-670px": "phone",
  "pictures-split": "phone",
  images: "phone",
  "table-766px": "desk",
  forgotten: "desk",
  "table-878px": "desk",
  "task-frame": "desk",
  "decisions-900px": "desk",
  "table-1102px": "wide",
};

// ---- 5. Exact utility renames (radii, shadows, type, animations, etc.) ------

const EXACT_CLASS_MAP: Record<string, string> = {
  // Type
  "type-prose": "type-body",
  "type-button": "type-label",
  "text-size-code": "text-size-meta",
  "leading-meta": "leading-label",
  "leading-prose": "leading-body",
  "leading-prose-sm": "leading-body",
  "tracking-display": "tracking-title",
  "text-(length:--text-field-floor)": "text-row",
  "underline-offset-(--underline-offset)": "underline-offset-3",

  // Shadows & rails
  "shadow-tile": "shadow-sm",
  "shadow-raised": "shadow-sm",
  "shadow-hairline": "shadow-sm",
  "shadow-knob": "shadow-sm",
  "shadow-overlay": "shadow-lg",
  "shadow-drawer": "shadow-lg",
  "drop-shadow-drop-near": "drop-shadow-near",
  "bg-rail-body": "bg-rail",

  // Easings
  "ease-goo": "ease-drawer",

  // Animations consolidated onto the 8 system animations
  "animate-kit-fade-out": "animate-fade-out",
  "animate-kit-tip-fade": "animate-fade-in anim-dur-control",
  "animate-thinking-step-in": "animate-fade-in anim-dur-control",
  "animate-sheet-fade-in": "animate-fade-in anim-dur-control",
  "animate-sheet-fade-out": "animate-fade-out anim-dur-control",
  "animate-wait-grace-in": "animate-fade-in anim-delay-loop",
  "animate-wait-grace-out": "animate-fade-out anim-delay-loop",
  "animate-check-in": "animate-fade-in",
  "animate-face-out": "animate-fade-out",
  "animate-face-in": "animate-fade-in anim-dur-control",
  "animate-cell-fade": "animate-fade-in anim-dur-control",
  "animate-arrive": "animate-fade-in anim-dur-control",
  "animate-arrive-late": "animate-fade-in anim-dur-control anim-delay-control",
  "animate-scrim-in": "animate-fade-in anim-dur-panel",
  "animate-tip-fade": "animate-fade-in",
  "animate-dialog-in": "animate-rise-in",
  "animate-dialog-out": "animate-rise-out",
  "animate-offer-settle": "animate-rise-in",
  "animate-skeleton-pulse": "animate-pulse",
  "animate-attn-echo": "animate-ping",

  // Transitions consolidated
  "transition-exit-show": "transition-fade-show",
  "transition-exit-hide": "transition-fade-hide",
  "anim-delay-ghost": "anim-delay-control",
  "w-field-group": "w-sm",
  "max-w-field-group": "max-w-sm",
  "max-w-task-frame": "max-w-desk",
  "max-w-decisions-900px": "max-w-desk",

  // Arbitrary spacing refs that now resolve to system tokens (avoids TOKEN_ARBITRARY)
  "min-h-(--row-compact-h)": "min-h-row-compact",
  "h-(--row-compact-h)": "h-row-compact",
  "gap-(--row-compact-gap)": "gap-space-2",
  "gap-x-(--row-compact-gap)": "gap-x-space-2",
  "ps-(--row-compact-gap)": "ps-space-2",
  "pl-(--row-compact-gap)": "pl-space-2",
  "-mx-(--row-compact-gap)": "-mx-space-2",
  "pe-(--row-compact-pad-end)": "pe-space-2",
  "pr-(--row-compact-pad-end)": "pr-space-2",
  "min-h-(--tx-line-touch)": "min-h-control-lg",
  "w-(--tx-compacting-caw)": "w-space-8",
  "grid-cols-fit-c-decision-option-min": "grid-cols-fit-48",
};

const RADIUS_SUFFIX_MAP: Record<string, string> = {
  well: "sm",
  "inner-well": "sm",
  "glide-row": "xs",
};

const RADIUS_PREFIXES =
  "rounded(?:-(?:[trblse]|[tb][lr]|[se][se]))?|r-outer|r-join|concentric";

// ---- Compile regexes --------------------------------------------------------

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
const byLen = (keys: string[]) => [...keys].sort((a, b) => b.length - a.length);

const VAR_RE = new RegExp(
  `(?<![\\w-])(${byLen(Object.keys(VAR_RENAMES)).map(esc).join("|")})(?![\\w-])`,
  "gu"
);

const COLOR_CLASS_RE = new RegExp(
  `(?<![\\w-])((?:[a-z0-9:@/[\\]()_-]+:)*)(${COLOR_PREFIXES})-(${byLen(Object.keys(COLOR_SUFFIX_MAP)).map(esc).join("|")})(?![\\w-])`,
  "gu"
);

const SPACING_CLASS_RE = new RegExp(
  `(?<![\\w-])((?:[a-z0-9:@/[\\]()_-]+:)*)(-?)(${SPACING_PREFIXES})-(${byLen(Object.keys(SPACING_SUFFIX_MAP)).map(esc).join("|")})(?![\\w-])`,
  "gu"
);

const RADIUS_CLASS_RE = new RegExp(
  `(?<![\\w-])((?:[a-z0-9:@/[\\]()_-]+:)*)(${RADIUS_PREFIXES})-(${byLen(Object.keys(RADIUS_SUFFIX_MAP)).map(esc).join("|")})(?![\\w-])`,
  "gu"
);

const CONTAINER_RE = new RegExp(
  `(@(?:min-|max-)?)(${byLen(Object.keys(CONTAINER_MAP)).map(esc).join("|")})(?=[/:\\s"'\`]|$)`,
  "gu"
);

const EXACT_CLASS_RE = new RegExp(
  `(?<![\\w-])((?:[a-z0-9:@/[\\]()_-]+:)*)(${byLen(Object.keys(EXACT_CLASS_MAP)).map(esc).join("|")})(?![\\w-])`,
  "gu"
);

/** Non-CSS files where `--info` is a CLI flag, never a CSS variable. */
const CLI_INFO_FILES = new Set(["packages/agent/src/boundary-log-protocol.ts"]);

/** Files skipped from automated rewriting (fixtures that intentionally test old/raw patterns). */
const SKIP_FILE = (path: string) =>
  path.startsWith("scripts/lint/fixtures/") ||
  path.startsWith("apps/dashboard/scripts/fixtures/") ||
  path === "apps/dashboard/src/lib/tokens/preflight.css" ||
  path === "apps/dashboard/src/lib/tokens/variants.css" ||
  path === "apps/dashboard/src/lib/tokens/screen-edges.css";

function transform(path: string, input: string): string {
  let out = input;

  // 1. Exact class renames (repeat variant prefixes onto expanded multi-class targets).
  out = out.replace(
    EXACT_CLASS_RE,
    (_full, variants: string, base: string) => {
      const target = EXACT_CLASS_MAP[base];
      if (!target) {
        return _full;
      }
      return target
        .split(" ")
        .map((part) => `${variants}${part}`)
        .join(" ");
    }
  );

  // 2. Container query variants (`@max-table-424px/table:` -> `@max-sm/table:`).
  out = out.replace(
    CONTAINER_RE,
    (_full, prefix: string, name: string) =>
      `${prefix}${CONTAINER_MAP[name] ?? name}`
  );

  // 3. Radius classes (`rounded-well` -> `rounded-sm`).
  out = out.replace(
    RADIUS_CLASS_RE,
    (_full, variants: string, prefix: string, suffix: string) =>
      `${variants}${prefix}-${RADIUS_SUFFIX_MAP[suffix] ?? suffix}`
  );

  // 4. Colour classes (`bg-surface-fill` -> `bg-surface-hover`).
  // Guard prose & TS identifiers: never rewrite `text-foreground`? That IS a class.
  // Never rewrite `border-border` -> `border-border-control`? That IS a class!
  // Avoid rewriting inside CSS custom property names (`--bg-card` is protected by `(?<![\w-])`).
  out = out.replace(
    COLOR_CLASS_RE,
    (full, variants: string, prefix: string, suffix: string, offset: number) => {
      // Skip plain English prose like "to border" or "from input" or "to info"
      if (
        (prefix === "from" || prefix === "to" || prefix === "via") &&
        (suffix === "border" ||
          suffix === "input" ||
          suffix === "info" ||
          suffix === "card" ||
          suffix === "muted" ||
          suffix === "accent" ||
          suffix === "background" ||
          suffix === "foreground" ||
          suffix === "sidebar")
      ) {
        return full;
      }
      // Skip SVG/CSS property-like words in non-class contexts (`stroke-width`, `fill-rule` aren't in map anyway).
      // Skip `border-info`? Not a CSS prop. Skip `text-info`? Could be a class!
      // Skip `divide-border`? Wait: `divide-border` IS a Tailwind class!
      // Protect CSS declarations like `background: transparent` (those have `:`, not `-`).
      // Protect `to-transparent` when mapping `status-idle-bg`.
      const before = out[offset - 1] ?? "";
      if (before === ".") {
        return full;
      }
      const mapped = COLOR_SUFFIX_MAP[suffix];
      if (!mapped) {
        return full;
      }
      return `${variants}${prefix}-${mapped}`;
    }
  );

  // 5. Spacing / sizing classes (`h-c-btn-h-sm` -> `h-control-sm`, `w-c-panel-w` -> `w-95`).
  out = out.replace(
    SPACING_CLASS_RE,
    (full, variants: string, sign: string, prefix: string, suffix: string) => {
      const mapped = SPACING_SUFFIX_MAP[suffix];
      if (!mapped) {
        return full;
      }
      // `r-inset-c-inset-floating` -> `r-inset-(--inset-floating)`
      // `fade-len-c-edge-fade-len` -> `fade-len-(--edge-fade-len)`
      if (prefix === "fade-len" && suffix === "c-edge-fade-len") {
        return `${variants}fade-len-(--edge-fade-len)`;
      }
      // Guard: `m-c-` or `p-c-` never accidentally produces numeric rhythm
      return `${variants}${sign}${prefix}-${mapped}`;
    }
  );

  // 6. Custom property references (`--color-surface-fill` -> `--color-surface-hover`).
  out = out.replace(VAR_RE, (name) => VAR_RENAMES[name] ?? name);

  // 7. Special `--info` CSS custom property (never touch CLI `--info` flag).
  if (!CLI_INFO_FILES.has(path)) {
    out = out.replace(
      /var\(\s*--info\s*\)/gu,
      "var(--color-status-live-glyph)"
    );
  }

  // 8. Special CSS washes & masks that had dedicated tokens.
  out = out.replaceAll(
    "var(--color-surface-recess-clear)",
    "var(--surface-recess-clear)"
  );
  out = out.replaceAll(
    "var(--color-c-target-tint)",
    "oklch(from var(--color-brand-solid) l c h / 0.08)"
  );
  out = out.replaceAll(
    "var(--color-c-guide-on-token-wash)",
    "color-mix(in oklab, var(--color-status-done-glyph) 14%, transparent)"
  );
  out = out.replaceAll(
    "var(--color-c-guide-off-token-wash)",
    "color-mix(in oklab, var(--color-status-fail-glyph) 30%, transparent)"
  );

  return out;
}

// ---- Execute migration ------------------------------------------------------

const texts = loadTexts();
let filesChanged = 0;

for (const [path, before] of texts) {
  if (SKIP_FILE(path)) {
    continue;
  }
  const after = transform(path, before);
  if (after !== before) {
    write(path, after);
    filesChanged += 1;
  }
}

write(THEME, DISTILLED_THEME);
console.log(
  `distill-design-system: wrote distilled ${THEME} and migrated ${filesChanged} file(s)`
);
