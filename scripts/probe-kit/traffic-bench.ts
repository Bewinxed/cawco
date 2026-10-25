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

declare global {
  interface Window {
    __firstStep: Element | null;
    /** The rows a held motion read found tweening their place, kept across its fractions (thinking-traffic). */
    __placing: Element[];
    __traffic: TrafficBench;
  }
}
