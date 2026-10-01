/**
 * Centralized constants for flow visualization
 * Extracted from various components to eliminate magic numbers
 */

// ============================================================
// Node Dimensions
// ============================================================

/** Default width for all flow nodes */
export const NODE_WIDTH = 320;

/** Node center offset Y for centering */
export const NODE_CENTER_Y = 60;

// ============================================================
// Zoom Thresholds
// ============================================================

/** Zoom level threshold for overview mode (icon only) */
export const ZOOM_THRESHOLD_OVERVIEW = 0.5;

/** Zoom level threshold for summary mode (single line) */
export const ZOOM_THRESHOLD_SUMMARY = 1.0;

/** Minimum zoom level allowed */
export const ZOOM_MIN = 0.1;

/** Maximum zoom level allowed */
export const ZOOM_MAX = 2;

// ============================================================
// Layout Spacing Configurations
// ============================================================

export const COMPACT_CONFIG = {
  /** Minimum node height in compact mode */
  nodeHeightMin: 40,
  /** Maximum node height in compact mode */
  nodeHeightMax: 60,
  /** Horizontal spacing between nodes */
  nodeSep: 30,
  /** Vertical spacing between ranks */
  rankSep: 20,
  /** Approximate characters per line for height estimation */
  charsPerLine: 50,
  /** Line height in pixels */
  lineHeight: 16,
} as const;

export const EXPANDED_CONFIG = {
  /** Minimum node height in expanded mode */
  nodeHeightMin: 120,
  /** Maximum node height in expanded mode */
  nodeHeightMax: 500,
  /** Horizontal spacing between nodes */
  nodeSep: 40,
  /** Vertical spacing between ranks */
  rankSep: 60,
  /** Approximate characters per line for height estimation */
  charsPerLine: 40,
  /** Line height in pixels */
  lineHeight: 24,
} as const;

export type LayoutConfig = typeof COMPACT_CONFIG | typeof EXPANDED_CONFIG;

// ============================================================
// Viewport & Visibility
// ============================================================

/** Margin for node visibility checks (pixels) */
export const VISIBILITY_MARGIN = 50;

/** Fallback viewport width when actual size unavailable */
export const FALLBACK_VIEWPORT_WIDTH = 1400;

/** Fallback viewport height when actual size unavailable */
export const FALLBACK_VIEWPORT_HEIGHT = 900;

// ============================================================
// Animation
// ============================================================

/** Duration for pan/zoom animations (ms) */
export const ANIMATION_DURATION = 300;

/** Duration for slide transitions (ms) */
export const SLIDE_DURATION = 150;

// ============================================================
// Content Estimation
// ============================================================

/** Base height for nodes (header + padding + borders) */
export const NODE_BASE_HEIGHT = 80;

/** Maximum characters to show in first line preview */
export const FIRST_LINE_MAX_CHARS = 80;

/** Maximum characters for result preview */
export const RESULT_PREVIEW_MAX_CHARS = 100;

/** Maximum characters for subagent result display */
export const SUBAGENT_RESULT_MAX_CHARS = 200;

// ============================================================
// Timing
// ============================================================

/** Interval for elapsed time updates in running subagents (ms) */
export const ELAPSED_TIME_UPDATE_INTERVAL = 1000;

// ============================================================
// Branch Colors (CSS variable references)
// ============================================================

/** CSS variable names for branch colors - use with var() in styles */
export const BRANCH_COLOR_VARS = [
  "--color-info",
  "--color-success",
  "--color-action-solid",
  "--color-warning",
] as const;

/** Branch colors as inline-style values, so a branch reads in either theme. */
export const BRANCH_COLORS_FALLBACK = [
  "var(--color-info)",
  "var(--color-success)",
  "var(--color-action-solid)",
  "var(--color-warning)",
] as const;

// ============================================================
// Helper Functions
// ============================================================

/**
 * Get the appropriate layout config based on zoom mode
 */
export function getLayoutConfig(
  zoomMode: "compact" | "expanded"
): LayoutConfig {
  return zoomMode === "expanded" ? EXPANDED_CONFIG : COMPACT_CONFIG;
}

/**
 * Determine zoom level category from numeric zoom value
 */
export function getZoomLevel(zoom: number): "overview" | "summary" | "detail" {
  if (zoom < ZOOM_THRESHOLD_OVERVIEW) {
    return "overview";
  }
  if (zoom < ZOOM_THRESHOLD_SUMMARY) {
    return "summary";
  }
  return "detail";
}

/**
 * Estimate content height based on text content and config
 */
export function estimateContentHeight(
  content: string | undefined,
  config: LayoutConfig
): number {
  if (!content || typeof content !== "string") {
    return config.nodeHeightMin;
  }

  // Count actual newlines in content
  const newlineCount = (content.match(/\n/g) || []).length;
  // Estimate wrapped lines based on content length
  const wrappedLines = Math.ceil(content.length / config.charsPerLine);
  // Total lines is the max of newlines or wrapped estimate
  const totalLines = Math.max(newlineCount + 1, wrappedLines);

  const contentHeight = totalLines * config.lineHeight;
  const estimatedHeight = NODE_BASE_HEIGHT + contentHeight;

  // Clamp between min and max
  return Math.max(
    config.nodeHeightMin,
    Math.min(config.nodeHeightMax, estimatedHeight)
  );
}
