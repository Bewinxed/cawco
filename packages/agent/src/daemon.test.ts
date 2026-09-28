import { describe, expect, test } from "bun:test";
import type { SpawnPayload } from "@whiffle/core";
import { Duration, Effect, Fiber, Schedule } from "effect";
import {
  adoptable,
  custodyRow,
  HEALTHY_CONNECTION,
  reconnect,
  reconnecting,
} from "./daemon";

/**
 * A stand-in for `attach` that, unlike {@link fakeHub}, cares which URL each
 * attempt was made against — that's the one fact `reconnecting`'s
 * `rediscover` hook is allowed to change between attempts. `now()` advances
 * by `stepMs` on every attempt (not just on a stood connection, as
 * {@link fakeHub}'s does), because the whole point here is proving the
 * "spans at least 2 minutes" half of the trigger, independent of whether any
 * connection ever went live.
 */
const fakeAttempts = (options: {
  readonly failures: number;
  readonly stepMs: number;
  readonly url: () => string;
}) => {
  let clock = 0;
  let calls = 0;
  const urls: string[] = [];
  let resolve: () => void = () => {
    // no-op: replaced below before the promise settles
  };
  const drained = new Promise<void>((r) => {
    resolve = r;
  });
  const session = (
    _markLive: () => void
  ): Effect.Effect<never, { readonly reason: string }> =>
    Effect.suspend(() => {
      calls += 1;
      const attempt = calls;
      urls.push(options.url());
      if (attempt > options.failures) {
        resolve();
        return Effect.never;
      }
      clock += options.stepMs;
      return Effect.fail({ reason: `drop ${attempt}` });
    });
  return { session, now: () => clock, drained, urls, calls: () => calls };
};

/**
 * The daemon's reconnect loop cannot be proved against a live hub: the daemon
 * on this machine owns the operator's running sessions, and a real reconnect
 * costs a restart. So the loop is proved here instead, against a stand-in
 * connection and a stand-in clock — everything the fix turns on (does a series
 * end when a connection was healthy? does a flap still back off? is the
 * supervisor built once?) is observable without a socket.
 */

interface Drop {
  readonly reason: string;
}

/** What a schedule decided, without paying the wait it decided on. */
const observed = (schedule: typeof reconnect) => {
  const attempts: number[] = [];
  const delays: number[] = [];
  const probe = schedule.pipe(
    Schedule.tap((metadata) =>
      Effect.sync(() => {
        attempts.push(metadata.attempt);
        delays.push(Duration.toMillis(metadata.duration));
      })
    ),
    // The decision is recorded above, unmodified; the sleep it asks for is
    // zeroed here so a test of backoff shape does not take a minute to run.
    Schedule.modifyDelay(() => Effect.succeed(Duration.zero))
  );
  return { attempts, delays, probe };
};

/**
 * Runs a never-ending effect until `stop` resolves, then interrupts it the way
 * a signal does. Returns the exit so a test can insist the interrupt landed.
 */
const runUntil = async <E>(
  effect: Effect.Effect<never, E>,
  stop: Promise<void>
) => {
  const fiber = Effect.runFork(effect);
  await stop;
  return await Effect.runPromise(Fiber.interrupt(fiber));
};

/**
 * A stand-in connection. Each entry in `uptimes` is how long that connection
 * stood, in fake milliseconds, before it dropped; the clock only moves because
 * a connection stood, so the assertions below are exact rather than timing.
 */
const fakeHub = (options: {
  readonly uptimes: number[];
  readonly live?: boolean;
}) => {
  let clock = 0;
  let calls = 0;
  let resolve: () => void = () => {
    // no-op: replaced below before the promise settles
  };
  const drained = new Promise<void>((r) => {
    resolve = r;
  });
  const session = (markLive: () => void): Effect.Effect<never, Drop> =>
    Effect.suspend(() => {
      calls += 1;
      const attempt = calls;
      // Past the script the connection simply holds: the loop is infinite by
      // design, and a stand-in that kept failing would spin the fiber hard
      // enough to starve the promise the test is waiting on.
      if (attempt > options.uptimes.length) {
        resolve();
        return Effect.never;
      }
      if (options.live !== false) {
        markLive();
      }
      clock += options.uptimes[attempt - 1] ?? 0;
      return Effect.fail<Drop>({ reason: `drop ${attempt}` });
    });
  return { session, now: () => clock, drained, calls: () => calls };
};

describe("reconnecting", () => {
  test("a healthy connection ends the series, so the next outage starts at 1s again", async () => {
    const { attempts, delays, probe } = observed(
      Schedule.exponential(Duration.seconds(1))
    );
    // Three instant flaps, then a connection that stood for two minutes, then
    // flaps again — the fourth drop is a fresh outage, not a fourth failure.
    const hub = fakeHub({ uptimes: [0, 0, 0, 120_000, 0, 0] });

    await runUntil(
      reconnecting(hub.session, {
        healthyAfter: HEALTHY_CONNECTION,
        schedule: probe,
        now: hub.now,
      }),
      hub.drained
    );

    expect(attempts.slice(0, 5)).toEqual([1, 2, 3, 1, 2]);
    expect(delays.slice(0, 5)).toEqual([1000, 2000, 4000, 1000, 2000]);
  });

  test("a flap keeps backing off — the exponent is not reset by a drop that came straight back", async () => {
    const { attempts, delays, probe } = observed(
      Schedule.exponential(Duration.seconds(1))
    );
    // Every connection dies the instant it stands. Nothing here is healthy.
    const hub = fakeHub({ uptimes: [0, 0, 0, 0, 0, 0] });

    await runUntil(
      reconnecting(hub.session, {
        healthyAfter: HEALTHY_CONNECTION,
        schedule: probe,
        now: hub.now,
      }),
      hub.drained
    );

    expect(attempts.slice(0, 5)).toEqual([1, 2, 3, 4, 5]);
    expect(delays.slice(0, 5)).toEqual([1000, 2000, 4000, 8000, 16_000]);
  });

  test("time spent registering is not uptime — a hub that dies before the register lands is a flap", async () => {
    const { attempts, probe } = observed(
      Schedule.exponential(Duration.seconds(1))
    );
    // `live: false` is the connection that never called `markLive`: the socket
    // opened, the harness and tool probes took real time, and the hub went away
    // inside that window. Long, but never healthy.
    const hub = fakeHub({
      uptimes: [120_000, 120_000, 120_000, 120_000],
      live: false,
    });

    await runUntil(
      reconnecting(hub.session, {
        healthyAfter: HEALTHY_CONNECTION,
        schedule: probe,
        now: hub.now,
      }),
      hub.drained
    );

    expect(attempts.slice(0, 3)).toEqual([1, 2, 3]);
  });

  test("a drop just under the healthy threshold still backs off; just over it resets", async () => {
    const under = observed(Schedule.exponential(Duration.seconds(1)));
    const shortLived = fakeHub({ uptimes: [59_999, 59_999, 59_999] });
    await runUntil(
      reconnecting(shortLived.session, {
        healthyAfter: HEALTHY_CONNECTION,
        schedule: under.probe,
        now: shortLived.now,
      }),
      shortLived.drained
    );
    expect(under.attempts.slice(0, 2)).toEqual([1, 2]);

    const over = observed(Schedule.exponential(Duration.seconds(1)));
    const longLived = fakeHub({ uptimes: [60_000, 60_000, 60_000] });
    await runUntil(
      reconnecting(longLived.session, {
        healthyAfter: HEALTHY_CONNECTION,
        schedule: over.probe,
        now: longLived.now,
      }),
      longLived.drained
    );
    // Nothing was recorded because nothing was retried: every drop followed a
    // healthy connection, so each one ended its series and the loop re-entered
    // at once. That immediate re-entry is the point — an outage that follows an
    // hour of health pays nothing until it proves itself an outage, and only
    // then does the 1s, 2s, 4s … series start.
    expect(over.attempts).toEqual([]);
    expect(longLived.calls()).toBeGreaterThanOrEqual(3);
  });

  test("what the daemon builds outside the loop is built once and drained on interrupt", async () => {
    // The shape of `startDaemon`: the supervisor owns the running sessions and
    // the scanner's dedup set is rebuilt only on start (USAGE-SPEC.md §5.1), so
    // both are acquired outside the connection and must survive every reconnect
    // — and the drain must still run when the fiber is interrupted.
    let built = 0;
    let drains = 0;
    const { probe } = observed(Schedule.exponential(Duration.seconds(1)));
    const hub = fakeHub({ uptimes: [0, 120_000, 0, 0, 120_000, 0] });

    const daemon = Effect.gen(function* () {
      yield* Effect.acquireRelease(
        Effect.sync(() => {
          built += 1;
          return built;
        }),
        () =>
          Effect.sync(() => {
            drains += 1;
            return drains;
          })
      );
      return yield* reconnecting(hub.session, {
        healthyAfter: HEALTHY_CONNECTION,
        schedule: probe,
        now: hub.now,
      });
    }).pipe(Effect.scoped);

    await runUntil(daemon, hub.drained);

    expect(hub.calls()).toBeGreaterThanOrEqual(6);
    expect(built).toBe(1);
    expect(drains).toBe(1);
  });
});

describe("the reconnect schedule", () => {
  test("is a 50ms knock 40 times, then 1s, 2s, 4s … capped at 30s, jittered — what its comment claims", async () => {
    const { delays, probe } = observed(reconnect);
    const hub = fakeHub({ uptimes: Array.from({ length: 52 }, () => 0) });

    await runUntil(
      reconnecting(hub.session, { schedule: probe, now: hub.now }),
      hub.drained
    );

    // Jitter is 0.8×–1.2× of the nominal delay (Schedule.jittered).
    const within = (millis: number, nominal: number) =>
      millis >= nominal * 0.8 && millis <= nominal * 1.2;
    for (const delay of delays.slice(0, 40)) {
      expect(within(delay, 50)).toBe(true);
    }
    // biome-ignore lint/style/noNonNullAssertion: 52 uptimes guarantee at least 43 recorded delays
    expect(within(delays[40]!, 1000)).toBe(true);
    // biome-ignore lint/style/noNonNullAssertion: 52 uptimes guarantee at least 43 recorded delays
    expect(within(delays[41]!, 2000)).toBe(true);
    // biome-ignore lint/style/noNonNullAssertion: 52 uptimes guarantee at least 43 recorded delays
    expect(within(delays[42]!, 4000)).toBe(true);
    // Past saturation every delay is the cap, jitter and all — never more.
    for (const delay of delays.slice(47, 52)) {
      expect(within(delay, 30_000)).toBe(true);
    }
  });
});

describe("reconnecting: re-discovery on a sustained failure", () => {
  test("the URL moved: 5 failures spanning >= 2 minutes trigger a fake prober, and later attempts use its answer", async () => {
    let pinnedUrl = "ws://old-host:3456/ws";
    let triggers = 0;
    // Two failures before the trigger fires (attempts 1-5, spanning exactly
    // 2 minutes at 30s apart) and two after, so a change in `urls` is
    // observable rather than inferred from a single sample.
    const hub = fakeAttempts({
      failures: 7,
      stepMs: 30_000,
      url: () => pinnedUrl,
    });

    await runUntil(
      reconnecting(hub.session, {
        schedule: Schedule.exponential(Duration.seconds(1)).pipe(
          Schedule.modifyDelay(() => Effect.succeed(Duration.zero))
        ),
        now: hub.now,
        rediscover: {
          onTrigger: () =>
            Effect.sync(() => {
              triggers += 1;
              pinnedUrl = "ws://new-host:3456/ws";
            }),
        },
      }),
      hub.drained
    );

    expect(triggers).toBe(1);
    expect(hub.urls.slice(0, 5)).toEqual(
      new Array(5).fill("ws://old-host:3456/ws")
    );
    expect(hub.urls.slice(5, 7)).toEqual(
      new Array(2).fill("ws://new-host:3456/ws")
    );
  });

  test("the URL never answers: the trigger still fires, but with no winner the series just continues against the old URL", async () => {
    const pinnedUrl = "ws://old-host:3456/ws";
    let triggers = 0;
    const hub = fakeAttempts({
      failures: 8,
      stepMs: 30_000,
      url: () => pinnedUrl,
    });

    await runUntil(
      reconnecting(hub.session, {
        schedule: Schedule.exponential(Duration.seconds(1)).pipe(
          Schedule.modifyDelay(() => Effect.succeed(Duration.zero))
        ),
        now: hub.now,
        rediscover: {
          onTrigger: () =>
            Effect.sync(() => {
              // The fake prober found nothing — `rediscoverHub` would resolve
              // `undefined` here and never call `repin`, so `pinnedUrl` is
              // deliberately left untouched.
              triggers += 1;
            }),
        },
      }),
      hub.drained
    );

    // A second window closes at attempt 10, but the script only runs 8 —
    // one trigger, and every attempt (before and after it) on the same URL.
    expect(triggers).toBe(1);
    expect(hub.urls.every((url) => url === "ws://old-host:3456/ws")).toBe(true);
    expect(hub.calls()).toBe(9);
  });

  test("5 failures inside 2 minutes but not spanning it: no trigger yet", async () => {
    let triggers = 0;
    // 30s apart, only 4 steps by the 5th failure (attempts 1-5 span 4 * 30s =
    // 120s exactly at the 5th... use a shorter step so the span undershoots).
    const hub = fakeAttempts({
      failures: 5,
      stepMs: 20_000,
      url: () => "ws://host:3456/ws",
    });

    await runUntil(
      reconnecting(hub.session, {
        schedule: Schedule.exponential(Duration.seconds(1)).pipe(
          Schedule.modifyDelay(() => Effect.succeed(Duration.zero))
        ),
        now: hub.now,
        rediscover: {
          onTrigger: () =>
            Effect.sync(() => {
              triggers += 1;
            }),
        },
      }),
      hub.drained
    );

    // 5 failures at 20s apart span 80s (< the 2-minute window), so the count
    // threshold alone never fires the trigger.
    expect(triggers).toBe(0);
  });
});

/**
 * The register-ack custody window (design §7, step 4). A daemon that just
 * restarted is answered with a `spawn` per session the hub thinks should be
 * running, then the ack carrying the ingest ledger. Those spawns are the only
 * place this process learns a surviving child's directory and conversation, so
 * what counts as one — and what it becomes for `reattachFrom` — is a decision
 * worth stating on its own.
 */
describe("custody off the register ack", () => {
  const restore = (over: Partial<SpawnPayload> = {}): SpawnPayload => ({
    instanceId: "inst-1",
    cwd: "/home/op/project",
    resume: { sessionKey: "sess-9" },
    ...over,
  });

  test("a claude restore is adoptable, and becomes the row reattachFrom wants", () => {
    expect(adoptable(restore())).toBe(true);
    expect(custodyRow(restore())).toEqual({
      instanceId: "inst-1",
      cwd: "/home/op/project",
      sessionId: "sess-9",
    });
    // A restore with no stored conversation still adopts; it just has nothing
    // to hand back to at the turn boundary.
    expect(custodyRow(restore({ resume: undefined })).sessionId).toBe(null);
  });

  test("only what `adopt` can actually take: claude, already on disk, already running", () => {
    // `adopt` is claude's alone — opencode reattaches through its own server.
    expect(adoptable(restore({ harness: "opencode" }))).toBe(false);
    // A spawn that has to clone or cut a worktree first is not a session that
    // exists to be adopted.
    expect(
      adoptable(restore({ bootstrap: { repo: "o/n", baseDir: "/tmp" } }))
    ).toBe(false);
    expect(adoptable(restore({ scratch: { worktree: true } }))).toBe(false);
    // And nothing malformed: a row with no directory could not be respawned at
    // the hand-off boundary, so it is left to the ordinary spawn path.
    expect(adoptable(restore({ cwd: "" }))).toBe(false);
    expect(adoptable(restore({ instanceId: "" }))).toBe(false);
    expect(adoptable(undefined)).toBe(false);
  });
});
