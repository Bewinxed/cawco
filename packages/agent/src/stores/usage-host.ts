/**
 * The usage scanner (usage/scanner.ts), held on the stores' thread
 * (stores/worker.ts): its store, `usage.db`, its reads of every Claude
 * transcript and of OpenCode's databases, and its folding, never on the
 * agent's loop, which asks for each scan's buckets (stores/client.ts).
 */
import type { UsageBucket } from "@cawco/core";
import { UsageScanner } from "../usage/scanner";

let scanner: UsageScanner | undefined;

/** What the loop's memory line says of the scanner's store ({@link usageHost.scan}). */
export interface UsageGauges {
  dbMB: number;
  rowIndexKeys: number;
}

export const usageHost = {
  /** One scan, the scanner made on the first: the buckets to report, and its store's size. */
  scan: async (
    now: number
  ): Promise<{ buckets: UsageBucket[]; gauges: UsageGauges }> => {
    scanner ??= new UsageScanner();
    const buckets = await scanner.scan(now);
    return { buckets, gauges: await scanner.gauges() };
  },
};
