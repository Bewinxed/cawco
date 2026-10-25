/**
 * The traffic bench's driver (`window.__traffic`, routes/(app)/motion/traffic),
 * as the specs that drive it inside the page call it: arrival-traffic and
 * thinking-traffic. A page.evaluate callback runs alone in the page, so each
 * reads `window.__traffic` itself.
 */
export interface TrafficBench {
  assistant: (text: string) => void;
  landed: () => boolean;
  patch: (next: Record<string, unknown>) => void;
  reset: (seed?: number) => void;
  run: (count: number, gapMs: number) => Promise<void>;
  streaming: (text: string) => void;
  thinking: (text: string | null) => void;
  tool: (name: string, glance: string) => void;
  user: (text: string) => void;
}

/** One frame of the thinking row, as thinking-traffic records them. */
export interface ThinkingFrame {
  /** The live row's faces: two while one phase crossfades into the next. */
  faces: number;
  /** Each row whose place is tweening this frame: its index in the list, and its height. */
  growing: [number, number][];
  /** The live row's height. */
  height: number;
  indicator: boolean;
  /** The height of the row its place is (Row). */
  reserved: number;
  time: number;
  /** A `block-size` tween runs on the live row or its row. */
  tweening: boolean;
}

declare global {
  interface Window {
    __directAt: number;
    __exitAt: number;
    __firstStep: Element | null;
    __recordThinking: boolean;
    __thinkingFrames: ThinkingFrame[];
    __traffic: TrafficBench;
  }
}
