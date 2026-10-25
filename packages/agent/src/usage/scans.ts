/**
 * The loop's side of the usage scanner, which runs on the agent's stores
 * thread (stores/usage-host.ts, usage/scanner.ts): each scan asked there,
 * and what its store holds said in the memory line.
 */
import type { UsageBucket } from "@cawco/core";
import { gauge } from "../memory";
import { storeWork } from "../stores/client";
import type { UsageGauges } from "../stores/usage-host";

export class UsageScans {
  readonly #firstScan = Promise.withResolvers<void>();
  /** Settles once the first scan, full or incremental, has ended. */
  readonly scanned = this.#firstScan.promise;
  /** The store as the last scan left it. */
  #gauges: UsageGauges = { dbMB: 0, rowIndexKeys: 0 };

  constructor() {
    gauge("usage.dbMB", () => this.#gauges.dbMB);
    gauge("usage.rowIndexKeys", () => this.#gauges.rowIndexKeys);
  }

  /** One scan on the stores thread: the buckets the hub must (re-)learn (usage/scanner.ts `scan`). */
  async scan(now: number): Promise<UsageBucket[]> {
    try {
      const { buckets, gauges } = await storeWork("usage.scan", now);
      this.#gauges = gauges;
      return buckets;
    } finally {
      this.#firstScan.resolve();
    }
  }
}
