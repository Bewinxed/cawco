/**
 * Turning a project's Caw off while sessions he started still run: one tray
 * (CawOffDialog) mounted once in the shell, as Forget's is, so it outlives
 * the panel that asked for it. The opener (his lead switch) departs under
 * `caw-off:<id>` (motion/share) as it is pressed, so the tray flies out of
 * it.
 */
import type { CawRunning, CawView } from "@cawco/core";

export interface CawOffAsk {
  projectId: string;
  projectName: string;
  /** What he started that still runs, as his view listed it just now. */
  running: CawRunning[];
  /** The hub's view once he is off: the page's Caw takes it. */
  settled: (view: CawView) => void;
}

let asked = $state<CawOffAsk | null>(null);

/** What the single tray reads and answers through. */
export const cawOffHost = {
  get ask(): CawOffAsk | null {
    return asked;
  },
  close(): void {
    asked = null;
  },
};

/** Asks to turn Caw off over what he started; a tray already open gives way to it. */
export function askCawOff(ask: CawOffAsk): void {
  asked = ask;
}
