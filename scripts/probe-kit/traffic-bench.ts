/**
 * The traffic bench's driver (`window.__traffic`, routes/(app)/motion/traffic),
 * as the specs that drive it inside the page call it: arrival-traffic and
 * thinking-traffic. A page.evaluate callback runs alone in the page, so each
 * reads `window.__traffic` itself.
 */
export interface TrafficBench {
  assistant: (text: string) => void;
  /** The call `start` began lands: its record in, its glance gone. */
  finish: (id: string, name: string, command: string, said: string) => void;
  /** A page of `count` older blocks put in front, as a read back lands. */
  front: (count: number) => void;
  /** The call in flight: its glance, or none (null), as the daemon's pulse says. */
  glance: (name: string, text: string | null) => void;
  landed: () => boolean;
  patch: (next: Record<string, unknown>) => void;
  reset: (seed?: number) => void;
  run: (count: number, gapMs: number) => Promise<void>;
  /** A call starting: its glance in flight; answers the id it lands by. */
  start: (name: string, glance: string) => string;
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
