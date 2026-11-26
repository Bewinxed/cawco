/**
 * The loop's side of the usage scanner, which runs on the agent's stores
 * thread (stores/usage-host.ts, usage/scanner.ts): each scan asked there,
 * and what its store holds said in the memory line.
 */
import type { UsageBucket } from "@cawco/core/usage/types";
import { Deferred, Effect, Exit } from "effect";
import { runPromise } from "../daemon-runtime";
import { gauge } from "../memory";
import { fromPromise, type Rejected } from "../rejected";
import { storeWork } from "../stores/client";
import type { UsageGauges } from "../stores/usage-host";

export class UsageScans {
  readonly #firstScan = Deferred.makeUnsafe<void>();
  /** Settles once the first scan, full or incremental, has ended: the promise edge of its {@link Deferred}. */
  readonly scanned = runPromise(Deferred.await(this.#firstScan));
  /** The store as the last scan left it. */
  #gauges: UsageGauges = { dbMB: 0, rowIndexKeys: 0 };

  constructor() {
    gauge("usage.dbMB", () => this.#gauges.dbMB);
    gauge("usage.rowIndexKeys", () => this.#gauges.rowIndexKeys);
  }

  /** One scan on the stores thread: the buckets the hub must (re-)learn (usage/scanner.ts `scan`). */
  scan(now: number): Effect.Effect<UsageBucket[], Rejected> {
    return fromPromise(() => storeWork("usage.scan", now)).pipe(
      Effect.map(({ buckets, gauges }) => {
        this.#gauges = gauges;
        return buckets;
      }),
      Effect.ensuring(Deferred.done(this.#firstScan, Exit.void))
    );
  }
}
