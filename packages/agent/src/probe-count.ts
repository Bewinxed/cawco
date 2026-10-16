/**
 * How many harness probes this process has started: each harness's
 * `detect()`, the machine's capabilities, the tool catalog and Claude's
 * account reports count one as they begin. Read at the register
 * (`register-spawned-nothing`, core invariant.ts): an agent's first register
 * is sent before any of them has started (ea944761a).
 */
let started = 0;

/** One probe begins. */
export const probeStarted = (): void => {
  started += 1;
};

/** The probes this process has started so far. */
export const probesStarted = (): number => started;
