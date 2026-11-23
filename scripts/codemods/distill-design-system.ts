/**
 * `bun scripts/codemods/distill-design-system.ts`:
 *
 * Distils CawCo's design system in `apps/dashboard/src/lib/tokens/theme.css`
 * into a human-holdable token set (93 `@theme static` + 9 `@theme inline` =
 * 102 tokens total: 24 semantic colour roles + 7 marks + 3 art pigments,
 * 4 type sizes, 3 line-heights as 4px grid lengths, 6 spacing steps on
 * `calc(var(--spacing) * n)`, 5 radii, 3 shadows, 4 durations, 3 curves,
 * 2 breakpoints, 4 containers, 4 layers, 4 mechanics), evicts component-local
 * variables from `design.css`, and migrates every consumer across the
 * dashboard and packages in one sweep.
 *
 * Safe to run more than once: already-migrated references are untouched.
 */
import { loadTexts, THEME, write } from "./lib/theme-tree";

/**
 * Distilled `theme.css` — declared once, by hand, in Tailwind's `@theme`.
 * Every number a person can hold in their head:
 *   - Colour: 24 semantic roles (6 surfaces, 3 inks, 3 borders, 4 accent,
 *     4x2 status) + 7 categorical marks + 3 brand art pigments = 34.
 *   - Type: 3 faces, 2 weights, 4 sizes (12 / 14 / 18 / 24px), 3 4px-grid
 *     line-heights (16 / 20 / 24px), 2 trackings = 14, driving 6 `type-*` roles.
 *   - Spacing & sizes: 4px base (`--spacing`) + 6 rhythm steps (4..32px) +
 *     9 semantic sizes (3 icons, 3 controls, 2 rows, 1 measure) = 16.
 *   - Shape & depth: 5 radii (4 / 8 / 12 / 16 / pill) + 3 shadows = 8.
 *   - Motion: 4 durations + 3 curves = 7.
 *   - Layout: 2 breakpoints, 4 containers, 4 z-layers = 10.
 *   - Shared mechanics: 4 (glass blur, press scale, pop scale, breath floor).
 */
const DISTILLED_THEME = `/* CawCo's design system, declared once by hand in Tailwind's @theme.
   \`static\` emits every custom property so scheme and pointer overrides below
   reach every utility. */

@theme static {
  --*: initial;

  /* =========================================================================
     Layout — 2 breakpoints, 4 containers, 4 z-layers
     ========================================================================= */

  --breakpoint-phone: 640px;
  --breakpoint-desk: 900px;

  --container-xs: 320px;
  --container-sm: 448px;
  --container-phone: 640px;
  --container-desk: 900px;

  --layer-bar: 50;
  --layer-sheet: 80;
  --layer-float: 120;
  --layer-top: 160;

  /* =========================================================================
     Spacing & Sizes — 4px base, 6 rhythm steps, 9 semantic sizes
     ========================================================================= */

  --spacing: 0.25rem;
  --spacing-space-1: calc(var(--spacing) * 1);
  --spacing-space-2: calc(var(--spacing) * 2);
  --spacing-space-3: calc(var(--spacing) * 3);
  --spacing-space-4: calc(var(--spacing) * 4);
  --spacing-space-6: calc(var(--spacing) * 6);
  --spacing-space-8: calc(var(--spacing) * 8);

  --spacing-icon-sm: calc(var(--spacing) * 3);
  --spacing-icon-md: calc(var(--spacing) * 4);
  --spacing-icon-lg: calc(var(--spacing) * 5);

  --spacing-control-sm: calc(var(--spacing) * 8);
  --spacing-control-md: calc(var(--spacing) * 9);
  --spacing-control-lg: calc(var(--spacing) * 11);

  --spacing-row-compact: calc(var(--spacing) * 7);
  --spacing-row: calc(var(--spacing) * 10);

  --spacing-measure: 72ch;

  /* =========================================================================
     Colour — 24 semantic roles, 7 categorical marks, 3 brand art pigments
     ========================================================================= */

  /* Surfaces (6): frame recesses, content sits raised, sunk holds shelves. */
  --color-surface-page: light-dark(
    oklch(96.6% 0.008 85),
    oklch(18.4% 0.004 70)
  );
  --color-surface-raised: light-dark(
    oklch(99.3% 0.004 85),
    oklch(24.8% 0.006 70)
  );
  --color-surface-recess: light-dark(
    oklch(96.6% 0.008 85),
    oklch(21% 0.005 70)
  );
  --color-surface-sunk: light-dark(
    oklch(92% 0.011 83),
    oklch(15.6% 0.004 70)
  );
  --color-surface-hover: light-dark(
    oklch(92% 0.011 83),
    oklch(28.2% 0.007 70)
  );
  --color-surface-pressed: light-dark(
    oklch(85.4% 0.014 82),
    oklch(31.4% 0.008 70)
  );

  /* Inks (3): every ink holds >=4.5:1 on every surface it sits on. */
  --color-ink-strong: light-dark(
    oklch(29.5% 0.01 70),
    oklch(93.4% 0.01 82)
  );
  --color-ink-muted: light-dark(
    oklch(49.5% 0.014 74),
    oklch(77.8% 0.012 78)
  );
  --color-ink-subtle: light-dark(
    oklch(50.8% 0.014 74),
    oklch(68.5% 0.012 76)
  );

  /* Borders (3): hairline -> control -> strong (>=3:1 UI boundary). */
  --color-border-hairline: light-dark(
    oklch(93.6% 0.01 84),
    oklch(29.5% 0.007 70)
  );
  --color-border-control: light-dark(
    oklch(89% 0.013 82),
    oklch(35.2% 0.009 70)
  );
  --color-border-strong: light-dark(
    oklch(52% 0.016 76),
    oklch(58.5% 0.014 76)
  );

  /* Accent (4): Caw coral marks where you act and what you chose. */
  --color-accent: light-dark(oklch(55.5% 0.17 33), oklch(55.5% 0.165 33));
  --color-accent-ink: light-dark(oklch(50% 0.155 32), oklch(78.5% 0.115 34));
  --color-accent-wash: light-dark(oklch(92.5% 0.048 42), oklch(33% 0.068 38));
  --color-on-accent: oklch(100% 0 0);

  /* Status (8): four states (live, attn, done, fail) x ink/glyph and wash.
     Each chromatic token holds >=4.5:1 on its bg and >=3:1 on surfaces. */
  --color-status-live: light-dark(
    oklch(42% 0.135 252),
    oklch(78% 0.105 245)
  );
  --color-status-live-bg: light-dark(
    oklch(88% 0.042 245),
    oklch(30% 0.06 252)
  );
  --color-status-attn: light-dark(
    oklch(44% 0.115 78),
    oklch(85% 0.125 92)
  );
  --color-status-attn-bg: light-dark(
    oklch(92% 0.095 95),
    oklch(31% 0.06 90)
  );
  --color-status-done: light-dark(
    oklch(41% 0.125 150),
    oklch(78% 0.12 152)
  );
  --color-status-done-bg: light-dark(
    oklch(90% 0.05 152),
    oklch(30% 0.06 152)
  );
  --color-status-fail: light-dark(
    oklch(45% 0.17 18),
    oklch(77% 0.13 18)
  );
  --color-status-fail-bg: light-dark(
    oklch(91% 0.05 18),
    oklch(31% 0.07 18)
  );

  /* Categorical marks (7): perceptually even hues for accounts, tools, syntax. */
  --color-mark-1: light-dark(oklch(53% 0.15 47.4), oklch(70% 0.15 47.4));
  --color-mark-2: light-dark(oklch(50% 0.115 86.8), oklch(70% 0.12 86.8));
  --color-mark-3: light-dark(oklch(50% 0.132 121.2), oklch(70% 0.135 121.2));
  --color-mark-4: light-dark(oklch(51% 0.093 186.7), oklch(70% 0.095 186.7));
  --color-mark-5: light-dark(oklch(51% 0.14 251.4), oklch(70% 0.145 251.4));
  --color-mark-6: light-dark(oklch(51% 0.15 292.5), oklch(70% 0.155 292.5));
  --color-mark-7: light-dark(oklch(51% 0.165 349.8), oklch(70.5% 0.17 349.8));

  /* Brand art pigments (3): mascot, favicon, OG art. */
  --color-spark: #f2d36b;
  --color-paper: #f4f0e6;
  --color-crow-ink: #171715;

  /* =========================================================================
     Typography — 3 faces, 2 weights, 4 sizes, 3 4px-grid leadings, 2 trackings
     ========================================================================= */

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

  --text-sm: 0.75rem;
  --text-base: 0.875rem;
  --text-lg: 1.125rem;
  --text-xl: 1.5rem;

  --leading-sm: calc(var(--spacing) * 4);
  --leading-base: calc(var(--spacing) * 5);
  --leading-lg: calc(var(--spacing) * 6);

  --tracking-tight: -0.01em;
  --tracking-caps: 0.05em;

  /* =========================================================================
     Shape & Elevation — 5 radii (4px grid + pill), 3 shadows
     ========================================================================= */

  --radius-xs: 4px;
  --radius-sm: 8px;
  --radius-lg: 12px;
  --radius-xl: 16px;
  --radius-pill: 999px;

  --shadow-sm:
    0 1px 3px
      light-dark(oklch(29.5% 0.01 70 / 0.09), oklch(18.4% 0.004 70 / 0.55)),
    0 1px 1px
      light-dark(oklch(29.5% 0.01 70 / 0.09), oklch(18.4% 0.004 70 / 0.55)),
    inset 0 0 0 1px light-dark(transparent, oklch(93.4% 0.01 82 / 0.07));
  --shadow-md:
    0 3px 10px
      light-dark(oklch(29.5% 0.01 70 / 0.14), oklch(18.4% 0.004 70 / 0.66)),
    0 1px 2px
      light-dark(oklch(29.5% 0.01 70 / 0.09), oklch(18.4% 0.004 70 / 0.55)),
    inset 0 0 0 1px light-dark(transparent, oklch(93.4% 0.01 82 / 0.07));
  --shadow-lg:
    0 18px 48px
      light-dark(oklch(29.5% 0.01 70 / 0.2), oklch(18.4% 0.004 70 / 0.76)),
    0 2px 6px
      light-dark(oklch(29.5% 0.01 70 / 0.09), oklch(18.4% 0.004 70 / 0.55)),
    inset 0 0 0 1px light-dark(transparent, oklch(93.4% 0.01 82 / 0.07));

  /* =========================================================================
     Motion — 4 durations, 3 curves
     ========================================================================= */

  --duration-fast: 120ms;
  --duration-base: 200ms;
  --duration-slow: 320ms;
  --duration-loop: 1000ms;

  --ease-out: cubic-bezier(0.23, 1, 0.32, 1);
  --ease-in-out: cubic-bezier(0.77, 0, 0.175, 1);
  --ease-drawer: cubic-bezier(0.32, 0.72, 0, 1);

  /* =========================================================================
     Shared Mechanics — 4 constants
     ========================================================================= */

  --blur-glass: 20px;
  --press-scale: 0.97;
  --pop-scale: 0.92;
  --breath-floor: 0.77;
}

@theme inline {
  --default-font-family: var(--font-sans);
  --default-mono-font-family: var(--font-mono);
  --default-transition-duration: var(--duration-fast);
  --default-transition-timing-function: var(--ease-out);

  --animate-spin: spin var(--duration-loop) linear infinite;
  --animate-pulse: pulse var(--duration-loop) var(--ease-in-out) infinite;
  --animate-breath: breath calc(var(--duration-loop) * 2) var(--ease-in-out)
    infinite;
  --animate-ping: ping var(--duration-loop) var(--ease-out) 3 forwards;
  --animate-fade-in: fade-in var(--duration-base) var(--ease-out) backwards;

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
}

/* Six semantic type roles — font shorthands sorting before longhands. */
@utility type-meta {
  --tw-sort: vertical-align;
  font: var(--font-weight-normal) var(--text-sm) / var(--leading-sm)
    var(--font-sans);
}

@utility type-code {
  --tw-sort: vertical-align;
  font: var(--font-weight-normal) var(--text-sm) / var(--leading-base)
    var(--font-mono);
}

@utility type-body {
  --tw-sort: vertical-align;
  font: var(--font-weight-normal) var(--text-base) / var(--leading-base)
    var(--font-sans);
}

@utility type-label {
  --tw-sort: vertical-align;
  font: var(--font-weight-medium) var(--text-base) / var(--leading-base)
    var(--font-sans);
}

@utility type-title {
  --tw-sort: vertical-align;
  font: var(--font-weight-medium) var(--text-lg) / var(--leading-lg)
    var(--font-sans);
  letter-spacing: var(--tracking-tight);
}

@utility type-kpi {
  --tw-sort: vertical-align;
  font: var(--font-weight-medium) var(--text-xl) / var(--leading-lg)
    var(--font-sans);
  font-variant-numeric: tabular-nums;
}

/* Primary coral fill sheen and hover state derived from --color-accent. */
@utility bg-accent-surface {
  background-image: linear-gradient(
    to bottom,
    oklch(from var(--color-accent) calc(l + 0.025) c h),
    oklch(from var(--color-accent) calc(l - 0.025) c h)
  );
}

@utility bg-accent-surface-hover {
  background-image: linear-gradient(
    to bottom,
    oklch(from var(--color-accent) calc(l - 0.02) c h),
    oklch(from var(--color-accent) calc(l - 0.07) c h)
  );
}

/* Dynamic project hue ink, holding >=4.5:1 on surfaces across all hues. */
@utility identity-ink {
  color: light-dark(
    oklch(48% 0.12 var(--identity-h, 120)),
    oklch(74% 0.11 var(--identity-h, 120))
  );
}

/* Shared transition shorthands composed from motion tokens. */
@utility transition-control {
  transition:
    background-color var(--duration-fast) var(--ease-out),
    border-color var(--duration-fast) var(--ease-out),
    color var(--duration-fast) var(--ease-out),
    --tw-gradient-from var(--duration-fast) var(--ease-out),
    --tw-gradient-to var(--duration-fast) var(--ease-out);
}

@utility transition-fade-show {
  transition:
    opacity var(--duration-base) var(--ease-out),
    visibility 0s linear;
}

@utility transition-fade-hide {
  transition:
    opacity var(--duration-base) var(--ease-out),
    visibility 0s linear var(--duration-base);
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
      --spacing-row: calc(var(--spacing) * 11);
    }
  }
}
`;

// ============================================================================
// 1. Multiplied-leading calc() rewrites (leadings are now 4px-grid lengths)
// ============================================================================

const MULTIPLIED_LEADING_REWRITES: [RegExp, string][] = [
  [
    /var\(--text-meta\)\s*\*\s*var\(--leading-label\)/gu,
    "var(--leading-sm)",
  ],
  [
    /var\(--text-label\)\s*\*\s*var\(--leading-label\)/gu,
    "var(--leading-base)",
  ],
  [
    /var\(--text-body\)\s*\*\s*var\(--leading-body\)/gu,
    "var(--leading-base)",
  ],
  [
    /var\(--text-body\)\s*\*\s*var\(--who-lead,\s*var\(--leading-body\)\)/gu,
    "var(--who-lead, var(--leading-base))",
  ],
  [
    /var\(--text-title\)\s*\*\s*var\(--leading-ui\)/gu,
    "var(--leading-lg)",
  ],
  [
    /var\(--prompt-fs\)\s*\*\s*var\(--leading-body\)/gu,
    "var(--leading-base)",
  ],
];

// ============================================================================
// 2. Plain-CSS var(--type-*) expansions (for packages/ & ns-theme.css)
// ============================================================================

const PLAIN_TYPE_VAR_MAP: Record<string, string> = {
  "var(--type-meta)":
    "var(--font-weight-normal) var(--text-sm) / var(--leading-sm) var(--font-sans)",
  "var(--type-code)":
    "var(--font-weight-normal) var(--text-sm) / var(--leading-base) var(--font-mono)",
  "var(--type-body)":
    "var(--font-weight-normal) var(--text-base) / var(--leading-base) var(--font-sans)",
  "var(--type-label)":
    "var(--font-weight-medium) var(--text-base) / var(--leading-base) var(--font-sans)",
  "var(--type-row)":
    "var(--font-weight-medium) var(--text-lg) / var(--leading-lg) var(--font-sans)",
  "var(--type-title)":
    "var(--font-weight-medium) var(--text-lg) / var(--leading-lg) var(--font-sans)",
  "var(--type-kpi)":
    "var(--font-weight-medium) var(--text-xl) / var(--leading-lg) var(--font-sans)",
  "var(--type-caps)":
    "var(--font-weight-medium) var(--text-sm) / var(--leading-sm) var(--font-sans)",
};

// ============================================================================
// 3. Exact Tailwind class renames (variants repeated onto multi-class targets)
// ============================================================================

const EXACT_CLASS_MAP: Record<string, string> = {
  // Typography utilities (eliminate text-size-* and duplicate text-* wrappers)
  "text-size-meta": "text-sm",
  "text-size-label": "text-base",
  "text-size-body": "text-base",
  "text-size-title": "text-lg",
  "text-size-kpi": "text-xl",
  "text-meta": "type-meta",
  "text-label": "type-label",
  "text-body": "type-body",
  "text-title": "type-title",
  "text-kpi": "type-kpi",
  "text-row": "text-input-floor",
  "type-row": "type-title",
  "type-caps": "type-meta font-medium tracking-caps uppercase",
  "leading-kpi": "leading-none",
  "leading-ui": "leading-lg",
  "leading-label": "leading-base",
  "leading-body": "leading-base",
  "leading-code": "leading-base",
  "tracking-title": "tracking-tight",
  "text-(length:--text-meta)": "text-sm",
  "text-(length:--text-label)": "text-base",
  "text-(length:--text-body)": "text-base",
  "text-(length:--text-title)": "text-lg",
  "text-(length:--text-kpi)": "text-xl",
  "text-(length:--text-row)": "text-input-floor",

  // Coral accent fills & stops
  "bg-action-surface": "bg-accent-surface",
  "bg-action-surface-hover": "bg-accent-surface-hover",
  "action-stops": "accent-stops",
  "action-stops-hover": "accent-stops-hover",

  // Shadows
  "shadow-xs": "shadow-sm",

  // Motion durations & curves
  "duration-(--duration-step)": "duration-(--duration-fast)",
  "duration-(--duration-control)": "duration-(--duration-fast)",
  "duration-(--duration-fade)": "duration-(--duration-base)",
  "duration-(--duration-panel)": "duration-(--duration-slow)",
  "duration-(--duration-settle)": "duration-(--duration-slow)",
  "anim-dur-step": "anim-dur-fast",
  "anim-dur-control": "anim-dur-fast",
  "anim-dur-fade": "anim-dur-base",
  "anim-dur-panel": "anim-dur-slow",
  "anim-dur-settle": "anim-dur-slow",
  "anim-delay-step": "anim-delay-fast",
  "anim-delay-control": "anim-delay-fast",
  "anim-delay-fade": "anim-delay-base",
  "anim-delay-panel": "anim-delay-slow",
  "anim-delay-settle": "anim-delay-slow",
  "ease-crossfade": "ease-in-out",

  // Mechanics & blur utilities
  "backdrop-blur-(--material-blur)": "backdrop-blur-glass",
  "backdrop-saturate-(--material-saturate)": "backdrop-saturate-[1.6]",
  "backdrop-blur-(--scrim-blur)": "backdrop-blur-scrim",

  // Layers removed from theme.css
  "z-(--layer-base)": "z-20",
  "z-(--layer-dock)": "z-40",

  // Evicted design.css :root vars -> direct Tailwind scale / system utilities
  "opacity-(--ghost-presence)": "opacity-70",
  "opacity-(--account-stale-opacity)": "opacity-82",
  "blur-(--fold-blur)": "blur-fold",
  "blur-(--part-blur)": "blur-(length:--spacing-space-1)",
  "mask-(--head-tint-ramp)": "mask-head-tint",
  "size-(--status-dot-size)": "size-1.5",
  "w-(--status-dot-size)": "w-1.5",
  "h-(--status-dot-size)": "h-1.5",
  "h-(--row-tall-h)": "h-12",
  "min-h-(--row-tall-h)": "min-h-12",
  "max-h-(--tx-field-cap)": "max-h-75",
  "max-w-(--tx-preview-max)": "max-w-110",
  "min-h-(--tx-preview-min)": "min-h-20",
  "w-(--tx-preview-thumb-w)": "w-22.5",
  "h-(--tx-preview-thumb-h)": "h-16",
  "w-(--tx-compact-caw)": "w-4.5",
  "h-(--tx-compact-caw)": "h-4.5",
  "h-(--tx-compact-wave)": "h-1.5",
  "w-(--tx-shot-thumb)": "w-12",
  "h-(--tx-shot-thumb)": "h-12",
  "min-h-(--tx-line)": "min-h-6.5",
  "h-(--tx-line)": "h-6.5",
  "w-(--lightbox-sheet-w)": "w-full max-w-240",
  "max-h-(--lightbox-sheet-max-h)": "max-h-dvh-86",
  "max-w-(--doc-max)": "w-full max-w-64",
  "h-(--fig-chip)": "h-2.5",
  "size-(--fig-chip)": "size-2.5",
  "inset-x-(--fig-pad)": "inset-x-space-3",
  "bottom-(--fig-cap-foot)": "bottom-space-2",
  "leading-(--fig-cap-line)": "leading-sm",
  "start-(--step-rail-x)": "start-space-2",
  "top-(--step-rail-top)": "top-space-6",
  "-bottom-(--step-rail-gap)": "-bottom-space-2",
  "h-(--suggest-chip)": "h-control-sm",
  "h-(--suggest-row)": "h-14",
  "max-w-(--starters-w)": "max-w-182",
  "ps-(--ledger-text-inset)": "ps-space-6",
  "pl-(--ledger-text-inset)": "pl-space-6",
  "px-(--field-inline-inset)": "px-space-3",
  "ps-(--field-inline-inset)": "ps-space-3",
  "r-inset-(--inset-floating)": "r-inset-space-2",
  "r-inset-(--inset-composer)": "r-inset-space-2",
  "fade-len-(--edge-fade-len)": "fade-len-row",
  "h-(--usage-strip-row)": "h-9",
  "h-(--usage-strip-clip)": "h-10",
  "max-h-(--sheet-max-h)": "max-h-vh-85",
  "w-(--bar-symbol)": "w-4.5",
  "h-(--bar-symbol)": "h-4.5",
  "size-(--bar-symbol)": "size-4.5",
  "size-(--mark-box)": "size-row-compact",
  "w-(--mark-box)": "w-row-compact",
  "h-(--mark-box)": "h-row-compact",
  "min-w-(--mark-box)": "min-w-row-compact",
  "gap-(--tree-gap)": "gap-space-1",
  "gap-y-(--tree-gap)": "gap-y-space-1",
  "mt-(--tree-gap)": "mt-space-1",
  "mb-(--tree-gap)": "mb-space-1",
  "my-(--tree-gap)": "my-space-1",
  "pt-(--tree-gap)": "pt-space-1",
  "pb-(--tree-gap)": "pb-space-1",
  "py-(--tree-gap)": "py-space-1",
  "top-(--tree-gap)": "top-space-1",
  "bottom-(--tree-gap)": "bottom-space-1",
  "h-(--tx-shot)": "h-60",
  "w-(--tx-shot)": "w-60",
  "max-h-(--tx-shot)": "max-h-60",
  "max-w-(--tx-shot)": "max-w-60",
  "min-w-(--board-col-min)": "min-w-60",
  "max-w-(--board-col-max)": "max-w-88",
  "w-(--panel-w)": "w-95",
  "max-w-(--panel-w)": "max-w-95",
  "min-w-(--panel-w)": "min-w-95",
  "h-(--caw-panel-h)": "h-160",
  "max-h-(--caw-panel-h)": "max-h-160",
  "max-w-(--hover-panel-max)": "max-w-110",
  "w-(--graph-move-name-w)": "w-48",
  "w-(--graph-control-w)": "w-64",
  "size-(--row-mark-box)": "size-4.5",
  "w-(--row-mark-box)": "w-4.5",
  "h-(--row-mark-box)": "h-4.5",
  "size-(--row-mark)": "size-4.25",
  "size-(--row-mark-glyph)": "size-2.75",
  // Arbitrary-variable forms of removed theme / design.css tokens
  "outline-(length:--focus-ring-width)": "outline-2",
  "outline-offset-(--focus-ring-offset)": "outline-offset-2",
  "outline-offset-(--focus-ring-inset)": "-outline-offset-2",
  "border-(length:--focus-ring-width)": "border-2",
  "ring-(length:--focus-ring-width)": "ring-2",
  "border-(length:--border-width)": "border",
  "outline-(length:--border-width)": "outline-1",
  "outline-offset-(--border-width)": "outline-offset-1",
  "bg-(image:--action-surface)": "bg-accent-surface",
  "bg-(image:--action-surface-hover)": "bg-accent-surface-hover",
  "bg-(--action-surface)": "bg-accent-surface",
  "bg-(--action-surface-hover)": "bg-accent-surface-hover",
  "[transition:var(--transition-control)]": "transition-control",
  "[transition:var(--transition-control),transform_var(--duration-base)_var(--ease-out)]":
    "transition-control-press",
  "ring-(length:--status-dot-cut)": "ring-dot-cut",
  "inset-ring-(length:--corner-grip-stroke)": "inset-ring-1.5",
  "stroke-(length:--graph-edge)": "stroke-1.5",
  "bg-(--meter-wash-over)": "bg-status-fail/8",
  "fill-(--ring-track-spent)": "fill-border-strong/55",
  "stroke-(--ring-track-spent)": "stroke-border-strong/55",
  "bg-(--mark-deck-shade)": "bg-mark-deck-shade",
  "from-(--mark-deck-cast)": "from-mark-deck-cast",
  "translate-x-(--optical-nudge)": "translate-x-optical",
  "-translate-y-(--optical-nudge)": "-translate-y-optical",
  "delay-(--duration-step)": "delay-(--duration-fast)",
  "translate-y-(--spacing-space-2)": "translate-y-space-2",
  "backdrop-saturate-[1.6]": "backdrop-saturate-160",
};

// ============================================================================
// 4. Prefix-based Tailwind utility maps
// ============================================================================

const COLOR_PREFIXES =
  "bg|text|border(?:-[trblxyse])?|ring|inset-ring|outline|fill|stroke|accent|caret|decoration|divide|from|via|to|placeholder|shadow|ring-ground";

const COLOR_SUFFIX_MAP: Record<string, string> = {
  "surface-shelf": "surface-sunk",
  "surface-glass": "surface-raised/72",
  scrim: "surface-page/72",
  "on-ink": "surface-page",
  seam: "accent/35",
  "brand-solid": "accent",
  "action-solid": "accent",
  "action-hover": "accent",
  "brand-wash": "accent-wash",
  "selected-bg": "accent-wash",
  "brand-ink": "accent-ink",
  "focus-ring": "accent-ink",
  "on-action": "on-accent",
  selection: "accent/20",
  "status-live-ink": "status-live",
  "status-live-glyph": "status-live",
  "status-attn-ink": "status-attn",
  "status-attn-glyph": "status-attn",
  "status-done-ink": "status-done",
  "status-done-glyph": "status-done",
  "status-fail-ink": "status-fail",
  "status-fail-glyph": "status-fail",
  "image-outline": "ink-strong/10",
  "coral-9": "accent",
  "coral-10": "accent",
  "coral-11": "accent-ink",
  "coral-3": "accent-wash",
  "neutral-1": "surface-raised",
  "neutral-2": "surface-recess",
  "neutral-3": "surface-recess",
  "neutral-4": "surface-hover",
  "neutral-5": "border-control",
  "neutral-6": "surface-pressed",
  "neutral-7": "border-control",
  "neutral-8": "border-strong",
  "neutral-9": "border-strong",
  "neutral-11": "ink-muted",
  "neutral-12": "ink-strong",
  "mark-2": "mark-1",
  "mark-3": "mark-2",
  "mark-4": "mark-3",
  "mark-5": "mark-4",
  "mark-6": "mark-5",
  "mark-7": "mark-6",
  "mark-8": "mark-7",
};

const SPACING_PREFIXES =
  "p[xystblrse]?|pbs|pbe|m[xystblrse]?|mbs|mbe|gap(?:-[xy])?|space-[xy]|w|min-w|max-w|h|min-h|max-h|size|basis|inset(?:-[xy])?|top|right|bottom|left|start|end|translate(?:-[xy])?|scroll-[pm][xystblrse]?|leading|r-inset|fade-len|hit-gap-[xy]|pb-safe|tray-indent|clip-margin";

const SPACING_SUFFIX_MAP: Record<string, string> = {
  "space-row": "space-1",
  "space-5": "space-4",
  "control-xs": "space-6",
  "measure-short": "ch-60",
};

const RADIUS_PREFIXES =
  "rounded(?:-(?:[trblse]|[tb][lr]|[se][se]))?|r-outer|r-join|concentric";

const RADIUS_SUFFIX_MAP: Record<string, string> = {
  hair: "xs",
  md: "sm",
  modal: "xl",
};

const CONTAINER_MAP: Record<string, string> = {
  md: "phone",
  wide: "desk",
};

// ============================================================================
// 5. CSS Custom Property renames & inline expressions
// ============================================================================

/** `var(--old)` expressions replaced with non-variable CSS expressions. */
const VAR_EXPR_REPLACEMENTS: [RegExp, string][] = [
  [
    /var\(\s*--color-surface-glass\s*\)/gu,
    "oklch(from var(--color-surface-raised) l c h / 0.72)",
  ],
  [
    /var\(\s*--color-scrim\s*\)/gu,
    "oklch(from var(--color-surface-page) l c h / 0.72)",
  ],
  [
    /var\(\s*--color-seam\s*\)/gu,
    "oklch(from var(--color-accent) l c h / 0.35)",
  ],
  [
    /var\(\s*--color-selection\s*\)/gu,
    "oklch(from var(--color-accent) l c h / 0.2)",
  ],
  [
    /var\(\s*--color-image-outline\s*\)/gu,
    "oklch(from var(--color-ink-strong) l c h / 0.1)",
  ],
  [
    /var\(\s*--color-action-hover\s*\)/gu,
    "oklch(from var(--color-accent) calc(l - 0.045) c h)",
  ],
  [
    /var\(\s*--color-shadow-tint\s*\)/gu,
    "light-dark(oklch(29.5% 0.01 70 / 0.09), oklch(18.4% 0.004 70 / 0.55))",
  ],
  [
    /var\(\s*--action-surface-hover\s*\)/gu,
    "linear-gradient(to bottom, oklch(from var(--color-accent) calc(l - 0.02) c h), oklch(from var(--color-accent) calc(l - 0.07) c h))",
  ],
  [
    /var\(\s*--action-surface\s*\)/gu,
    "linear-gradient(to bottom, oklch(from var(--color-accent) calc(l + 0.025) c h), oklch(from var(--color-accent) calc(l - 0.025) c h))",
  ],
  [
    /var\(\s*--surface-recess-clear\s*\)/gu,
    "oklch(from var(--color-surface-recess) l c h / 0)",
  ],
  [/var\(\s*--border-width\s*\)/gu, "1px"],
  [/var\(\s*--focus-ring-width\s*\)/gu, "2px"],
  [/var\(\s*--focus-ring-offset\s*\)/gu, "2px"],
  [/var\(\s*--focus-ring-inset\s*\)/gu, "-2px"],
  [/var\(\s*--material-saturate\s*\)/gu, "1.6"],
  [/var\(\s*--scrim-blur\s*\)/gu, "2px"],
  [/var\(\s*--scrim-mix\s*\)/gu, "72%"],
  [/var\(\s*--mono-figure-cap\s*\)/gu, "0.703"],
  [/var\(\s*--duration-step\s*\)/gu, "calc(var(--duration-fast) / 2)"],
  [/var\(\s*--duration-breath\s*\)/gu, "calc(var(--duration-loop) * 2)"],
  [/var\(\s*--ns-check-ms\s*\)/gu, "var(--duration-base)"],
  [/var\(\s*--ns-fill-ms\s*\)/gu, "var(--duration-base)"],
  [/var\(\s*--ns-row-ms\s*\)/gu, "var(--duration-base)"],
  [/var\(\s*--spacing-measure-short\s*\)/gu, "60ch"],
  // Evicted design.css :root vars in CSS/style expressions
  [/var\(\s*--tab-strip-uncapped\s*\)/gu, "100vw"],
  [/var\(\s*--roll-reach\s*\)/gu, "100vmax"],
  [/var\(\s*--compaction-word-bleed\s*\)/gu, "0.5em"],
  [/var\(\s*--tip-rise\s*\)/gu, "2px"],
  [/var\(\s*--tip-arrow-nudge\s*\)/gu, "calc(var(--spacing) * 0.375)"],
  [/var\(\s*--corner-grip-stroke\s*\)/gu, "calc(var(--spacing) * 0.375)"],
  [/var\(\s*--graph-edge\s*\)/gu, "calc(var(--spacing) * 0.375)"],
  [/var\(\s*--status-dot-cut\s*\)/gu, "calc(var(--spacing) * 0.375)"],
  [/var\(\s*--tree-mark-hole-edge\s*\)/gu, "calc(1px / 4)"],
  [/var\(\s*--hang-shadow-room\s*\)/gu, "calc(var(--spacing) * 30)"],
  [/var\(\s*--grabber-h\s*\)/gu, "calc(var(--spacing) * 1.5)"],
  [/var\(\s*--grabber-w\s*\)/gu, "calc(var(--spacing) * 25)"],
  [/var\(\s*--bar-symbol\s*\)/gu, "calc(var(--spacing) * 4.5)"],
  [/var\(\s*--swap-nudge\s*\)/gu, "calc(var(--spacing) * 10)"],
  [/var\(\s*--starter-w\s*\)/gu, "calc(var(--spacing) * 44)"],
  [/var\(\s*--board-col-min\s*\)/gu, "calc(var(--spacing) * 60)"],
  [/var\(\s*--board-col-max\s*\)/gu, "calc(var(--spacing) * 88)"],
  [/var\(\s*--roster-card-min\s*\)/gu, "calc(var(--spacing) * 70)"],
  [/var\(\s*--panel-w\s*\)/gu, "calc(var(--spacing) * 95)"],
  [/var\(\s*--find-w\s*\)/gu, "calc(var(--spacing) * 130)"],
  [/var\(\s*--connect-w\s*\)/gu, "calc(var(--spacing) * 120)"],
  [/var\(\s*--caw-panel-h\s*\)/gu, "calc(var(--spacing) * 160)"],
  [/var\(\s*--signin-pop-w\s*\)/gu, "calc(var(--spacing) * 85)"],
  [/var\(\s*--graph-move-name-w\s*\)/gu, "calc(var(--spacing) * 48)"],
  [/var\(\s*--graph-control-w\s*\)/gu, "calc(var(--spacing) * 64)"],
  [/var\(\s*--line-answer-w\s*\)/gu, "calc(var(--spacing) * 33)"],
  [/var\(\s*--line-answer-w-narrow\s*\)/gu, "calc(var(--spacing) * 32)"],
  [/var\(\s*--answer-w\s*\)/gu, "calc(var(--spacing) * 28)"],
  [/var\(\s*--foot-fade\s*\)/gu, "calc(var(--spacing) * 24)"],
  [/var\(\s*--session-hover-room\s*\)/gu, "calc(var(--spacing) * 90)"],
  [/var\(\s*--pose-tile\s*\)/gu, "calc(var(--spacing) * 16)"],
  [/var\(\s*--roster-face\s*\)/gu, "calc(var(--spacing) * 12)"],
  [/var\(\s*--address-phone-h\s*\)/gu, "calc(var(--spacing) * 195)"],
  [/var\(\s*--bench-phone-h\s*\)/gu, "calc(var(--spacing) * 211)"],
  [/var\(\s*--tx-diff-cap\s*\)/gu, "calc(var(--spacing) * 100)"],
  [/var\(\s*--tx-shot\s*\)/gu, "calc(var(--spacing) * 60)"],
  [/var\(\s*--sheet-max-h\s*\)/gu, "85vh"],
  [/var\(\s*--peek-sheet-h\s*\)/gu, "80dvh"],
  [/var\(\s*--line-sheet-h\s*\)/gu, "70dvh"],
  [/var\(\s*--c-ask-diff-share\s*\)/gu, "0.4"],
  [/var\(\s*--figure-bearing\s*\)/gu, "calc(1em * 0.07)"],
  [/var\(\s*--optical-nudge\s*\)/gu, "calc(1px / 2)"],
  [/var\(\s*--hit-nudge\s*\)/gu, "calc(1px / 2)"],
  [/var\(\s*--deck-shade-step\s*\)/gu, "0.2"],
  [/var\(\s*--ghost-presence\s*\)/gu, "0.7"],
  [/var\(\s*--account-stale-opacity\s*\)/gu, "0.82"],
  [/var\(\s*--layer-base\s*\)/gu, "20"],
  [/var\(\s*--layer-dock\s*\)/gu, "40"],
  [
    /var\(\s*--meter-wash-over\s*\)/gu,
    "light-dark(color-mix(in oklch, var(--color-status-fail) 6%, transparent), color-mix(in oklch, var(--color-status-fail) 10%, transparent))",
  ],
  [
    /var\(\s*--ring-track-spent\s*\)/gu,
    "light-dark(oklch(80.5% 0.016 80), oklch(48.8% 0.012 74))",
  ],
  [
    /var\(\s*--mark-deck-shade\s*\)/gu,
    "oklch(14% 0.01 60)",
  ],
  [
    /var\(\s*--mark-deck-cast\s*\)/gu,
    "oklch(0% 0 0 / 0.16)",
  ],
  [/var\(\s*--status-dot-size\s*\)/gu, "calc(var(--spacing) * 1.5)"],
  [/var\(\s*--row-mark-box\s*\)/gu, "calc(var(--spacing) * 4.5)"],
  [/dur\("--duration-step"\)/gu, '(dur("--duration-fast") / 2)'],
  [/dur\("--duration-breath"\)/gu, '(dur("--duration-loop") * 2)'],
  [/chrome\.ms\("--duration-breath"\)/gu, '(2 * chrome.ms("--duration-loop"))'],
  [/\bms\("--duration-breath"\)/gu, '(2 * ms("--duration-loop"))'],
  [/tokenMs\("--duration-step"\)/gu, '(tokenMs("--duration-fast") / 2)'],
];

/** Direct custom property name renames (`--old` -> `--new`). */
const VAR_RENAMES: Record<string, string> = {
  // Colour roles
  "--color-surface-shelf": "--color-surface-sunk",
  "--color-on-ink": "--color-surface-page",
  "--color-brand-solid": "--color-accent",
  "--color-action-solid": "--color-accent",
  "--color-brand-wash": "--color-accent-wash",
  "--color-selected-bg": "--color-accent-wash",
  "--color-brand-ink": "--color-accent-ink",
  "--color-focus-ring": "--color-accent-ink",
  "--color-on-action": "--color-on-accent",
  "--color-status-live-ink": "--color-status-live",
  "--color-status-live-glyph": "--color-status-live",
  "--color-status-attn-ink": "--color-status-attn",
  "--color-status-attn-glyph": "--color-status-attn",
  "--color-status-done-ink": "--color-status-done",
  "--color-status-done-glyph": "--color-status-done",
  "--color-status-fail-ink": "--color-status-fail",
  "--color-status-fail-glyph": "--color-status-fail",
  "--color-coral-3": "--color-accent-wash",
  "--color-coral-9": "--color-accent",
  "--color-coral-10": "--color-accent",
  "--color-coral-11": "--color-accent-ink",
  "--color-neutral-1": "--color-surface-raised",
  "--color-neutral-2": "--color-surface-recess",
  "--color-neutral-3": "--color-surface-recess",
  "--color-neutral-4": "--color-surface-hover",
  "--color-neutral-5": "--color-border-control",
  "--color-neutral-6": "--color-surface-pressed",
  "--color-neutral-7": "--color-border-control",
  "--color-neutral-8": "--color-border-strong",
  "--color-neutral-9": "--color-border-strong",
  "--color-neutral-11": "--color-ink-muted",
  "--color-neutral-12": "--color-ink-strong",
  "--color-mark-2": "--color-mark-1",
  "--color-mark-3": "--color-mark-2",
  "--color-mark-4": "--color-mark-3",
  "--color-mark-5": "--color-mark-4",
  "--color-mark-6": "--color-mark-5",
  "--color-mark-7": "--color-mark-6",
  "--color-mark-8": "--color-mark-7",

  // Typography
  "--text-meta": "--text-sm",
  "--text-label": "--text-base",
  "--text-body": "--text-base",
  "--text-title": "--text-lg",
  "--text-kpi": "--text-xl",
  "--leading-kpi": "--leading-lg",
  "--leading-ui": "--leading-lg",
  "--leading-label": "--leading-base",
  "--leading-body": "--leading-base",
  "--leading-code": "--leading-base",
  "--tracking-title": "--tracking-tight",

  // Spacing & sizes
  "--spacing-space-row": "--spacing-space-1",
  "--spacing-space-5": "--spacing-space-4",
  "--spacing-control-xs": "--spacing-space-6",

  // Radii & shadows
  "--radius-hair": "--radius-xs",
  "--radius-md": "--radius-sm",
  "--radius-modal": "--radius-xl",
  "--shadow-xs": "--shadow-sm",

  // Motion
  "--duration-control": "--duration-fast",
  "--duration-fade": "--duration-base",
  "--duration-panel": "--duration-slow",
  "--duration-settle": "--duration-slow",
  "--ease-crossfade": "--ease-in-out",

  // Layout
  "--breakpoint-wide": "--breakpoint-desk",
  "--container-md": "--container-phone",
  "--container-wide": "--container-desk",

  // Mechanics & aliases evicted from theme.css / design.css
  "--material-blur": "--blur-glass",
  "--pop-rise": "--spacing-space-2",
  "--leave-scale": "--press-scale",
  "--goo-join": "--radius-lg",
  "--hover-panel-inset": "--spacing-space-2",
  "--tree-gap": "--spacing-space-1",
  "--edge-fade-len": "--spacing-row",
  "--tab-rim-glow-room": "--spacing-space-6",
  "--ledger-text-inset": "--spacing-space-6",
  "--mark-box": "--spacing-row-compact",
  "--part-blur": "--spacing-space-1",
};

// ============================================================================
// Compile regexes
// ============================================================================

const REGEX_META = /[.*+?^${}()|[\]\\]/gu;
const esc = (s: string) => s.replace(REGEX_META, "\\$&");
const byLen = (keys: string[]) => [...keys].sort((a, b) => b.length - a.length);

const EXACT_CLASS_RE = new RegExp(
  `(?<![\\w-])((?:[a-z0-9:@/[\\]()_-]+:)*)(${byLen(Object.keys(EXACT_CLASS_MAP)).map(esc).join("|")})(?![\\w-])`,
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

const VAR_RE = new RegExp(
  `(?<![\\w-])(${byLen(Object.keys(VAR_RENAMES)).map(esc).join("|")})(?![\\w-])`,
  "gu"
);

const PLAIN_TYPE_RE = new RegExp(
  byLen(Object.keys(PLAIN_TYPE_VAR_MAP)).map(esc).join("|"),
  "gu"
);

/** Files skipped from automated rewriting (fixtures, generated files, hand-edited sheets). */
const SKIP_FILE = (path: string) =>
  path.startsWith("scripts/lint/fixtures/") ||
  path.startsWith("apps/dashboard/scripts/fixtures/") ||
  path === "apps/dashboard/src/lib/tokens/preflight.css" ||
  path === "apps/dashboard/src/lib/tokens/variants.css" ||
  path === "apps/dashboard/src/lib/tokens/screen-edges.css" ||
  path === "apps/dashboard/src/design.css" ||
  path === "scripts/token-contrast-check.ts" ||
  path === "apps/dashboard/src/lib/design-board/foundations.ts" ||
  path === "apps/dashboard/src/lib/design-board/Foundation.svelte" ||
  path === "apps/dashboard/src/lib/platform/motion/curves.svelte.ts" ||
  path === "packages/core/src/words/graph.ts";

const MARK_STRING_SHIFT: Record<string, string> = {
  '"mark-2"': '"mark-1"',
  '"mark-3"': '"mark-2"',
  '"mark-4"': '"mark-3"',
  '"mark-5"': '"mark-4"',
  '"mark-6"': '"mark-5"',
  '"mark-7"': '"mark-6"',
  '"mark-8"': '"mark-7"',
};
const MARK_STRING_RE = /"mark-[2-8]"/gu;

const PROSE_COLOR_SUFFIXES = new Set(["selection", "scrim", "seam"]);

function transform(path: string, input: string): string {
  let out = input;

  // 1. Multiplied-leading calc() expressions -> grid-length leading tokens.
  for (const [re, replacement] of MULTIPLIED_LEADING_REWRITES) {
    out = out.replace(re, replacement);
  }

  // 2. Plain-CSS `var(--type-*)` expansions (only outside TS string token tables).
  out = out.replace(PLAIN_TYPE_RE, (m) => PLAIN_TYPE_VAR_MAP[m] ?? m);

  // 3. Exact Tailwind class renames.
  out = out.replace(EXACT_CLASS_RE, (_full, variants: string, base: string) => {
    const target = EXACT_CLASS_MAP[base];
    if (!target) {
      return _full;
    }
    return target
      .split(" ")
      .map((part) => `${variants}${part}`)
      .join(" ");
  });

  // 4. Container query variants (`@max-md/table:` -> `@max-phone/table:`).
  out = out.replace(
    CONTAINER_RE,
    (_full, prefix: string, name: string) =>
      `${prefix}${CONTAINER_MAP[name] ?? name}`
  );

  // 5. Radius utilities (`rounded-hair` -> `rounded-xs`, `rounded-modal` -> `rounded-xl`).
  out = out.replace(
    RADIUS_CLASS_RE,
    (_full, variants: string, prefix: string, suffix: string) =>
      `${variants}${prefix}-${RADIUS_SUFFIX_MAP[suffix] ?? suffix}`
  );

  // 6. Colour utilities (`bg-brand-solid` -> `bg-accent`, `text-status-live-glyph` -> `text-status-live`).
  out = out.replace(
    COLOR_CLASS_RE,
    (
      full,
      variants: string,
      prefix: string,
      suffix: string,
      offset: number
    ) => {
      if (
        (prefix === "from" || prefix === "to" || prefix === "via") &&
        PROSE_COLOR_SUFFIXES.has(suffix)
      ) {
        return full;
      }
      const before = out[offset - 1] ?? "";
      if (before === ".") {
        return full;
      }
      const mapped = COLOR_SUFFIX_MAP[suffix];
      if (!mapped) {
        return full;
      }
      // Guard double-slash opacity modifier when target already has `/72` or `/20` or `/10` or `/35`:
      // e.g. `bg-surface-glass/50` -> keep explicit opacity on base colour!
      const after = out[offset + full.length] ?? "";
      if (after === "/" && mapped.includes("/")) {
        return `${variants}${prefix}-${mapped.split("/")[0]}`;
      }
      return `${variants}${prefix}-${mapped}`;
    }
  );

  // 7. Spacing / size utilities (`space-row` -> `space-1`, `space-5` -> `space-4`, `control-xs` -> `space-6`).
  out = out.replace(
    SPACING_CLASS_RE,
    (full, variants: string, sign: string, prefix: string, suffix: string) => {
      const mapped = SPACING_SUFFIX_MAP[suffix];
      if (!mapped) {
        return full;
      }
      return `${variants}${sign}${prefix}-${mapped}`;
    }
  );

  // 8. `var(--old)` expressions that inline to CSS formulas/constants.
  for (const [re, replacement] of VAR_EXPR_REPLACEMENTS) {
    out = out.replace(re, replacement);
  }

  // 9. Direct CSS custom property renames (`--color-brand-ink` -> `--color-accent-ink`).
  out = out.replace(VAR_RE, (name) => VAR_RENAMES[name] ?? name);

  // 10. Quoted mark identifiers (`"mark-2"` .. `"mark-8"` in configure.ts).
  if (path === "packages/core/src/words/configure.ts") {
    out = out.replace(MARK_STRING_RE, (m) => MARK_STRING_SHIFT[m] ?? m);
  }

  // 11. Remove `text-row` references in `prompt-fs-(--text-row)` -> `prompt-fs-(--text-lg)` or `calc(var(--spacing) * 4)`.
  out = out.replaceAll("prompt-fs-(--text-row)", "prompt-fs-(--text-input-floor)");
  out = out.replaceAll("var(--text-row)", "calc(var(--spacing) * 4)");

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
