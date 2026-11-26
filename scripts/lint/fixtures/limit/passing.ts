// What house/limit-has-a-reason must let stand: each bound carries a tag in one of its three forms.
import { z } from "zod";

declare const items: string[];
declare const port: number;

export const card = z.object({
  // @limit asked: cawco:session/86084a4c-59de-486c-8b6a-bd7002ae2b7a
  title: z.string().max(80),
  body: z
    .string()
    // @limit measured: the longest body the hub's store held, 3 812 characters, packages/hub/src/db
    .max(4000),
});

/** @limit external: TCP ports are 16-bit, RFC 793 section 3.1 */
export const PORT_MAX = 65_535;
export const safe = Math.min(port, PORT_MAX);

// @limit asked: https://github.com/example/cawco/issues/12
export const PAGE = 20;
export const first = items.slice(0, PAGE);

export const SHEET_LIMITS = {
  // @limit external: Anthropic's documented image limit, https://docs.anthropic.com/en/docs/build-with-claude/vision
  images: 100,
  // @limit measured: the slowest render of a 30-row sheet, 1.9 s, scripts/sheet-bench.ts
  rows: 30,
};

// @limit measured: the panel's widest column, width and height, apps/dashboard/src/lib/panel.ts
export const PANE_MAX = { width: 480, height: 320 };

export const options = {
  type: "array",
  // @limit asked: cawco:card/1a2b3c4d
  maxItems: 12,
};

declare const clamp: (value: number, low: number, high: number) => number;
declare const width: number;
// @limit measured: the narrowest phone the dashboard is laid out for, 320 px, apps/dashboard/src/lib/tokens/theme.css
export const kept = clamp(width, 320, 1200);

// A count of 0 or less caps nothing: these stand with no tag.
export const allButLast = items.slice(0, -1);
export const drained = items.splice(0);
