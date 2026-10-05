import { AGENT_NOT_STARTED, type AgentRestartReadiness } from "@cawco/core";

/** One process-wide admission fence and transaction ledger. No turn activity. */
const holds = new Map<symbol, { reason: string; id: string }>();
let retiring = false;
const answers = new Map<string, () => void>();
export function beginHarnessAnswer(id: string): void {
  if (!answers.has(id)) {
    answers.set(id, holdRestart("harness-answer", id));
  }
}
export function endHarnessAnswer(id: string): void {
  answers.get(id)?.();
  answers.delete(id);
}

export function endHarnessAnswersFor(procId: string): void {
  for (const id of answers.keys()) {
    if (id.startsWith(`${procId}/`)) {
      endHarnessAnswer(id);
    }
  }
}

export class AgentRetiring extends Error {
  readonly code = AGENT_NOT_STARTED;
  constructor() {
    super(
      "The agent is restarting. This request was not started; it waits for registration."
    );
  }
}

export const isRetiring = (): boolean => retiring;
export const setRetiring = (value: boolean): void => {
  retiring = value;
};

/** Internal work already admitted may finish after the fence is raised. */
export function holdRestart(reason: string, id: string): () => void {
  const key = Symbol(reason);
  holds.set(key, { reason, id });
  return () => {
    holds.delete(key);
  };
}

export async function withRestartHold<T>(
  reason: string,
  id: string,
  work: () => Promise<T>
): Promise<T> {
  const release = holdRestart(reason, id);
  try {
    return await work();
  } finally {
    release();
  }
}

export function restartSnapshot(
  extra: AgentRestartReadiness["holds"] = []
): AgentRestartReadiness {
  const grouped = new Map<string, Set<string>>();
  for (const { reason, ids } of [
    ...extra,
    ...[...holds.values()].map((entry) => ({
      reason: entry.reason,
      ids: [entry.id],
    })),
  ]) {
    const idsForReason = grouped.get(reason) ?? new Set<string>();
    for (const id of ids) {
      idsForReason.add(id);
    }
    grouped.set(reason, idsForReason);
  }
  return {
    ready: grouped.size === 0,
    retiring,
    holds: [...grouped].map(([reason, ids]) => ({ reason, ids: [...ids] })),
  };
}

export const describeRestartHolds = (report: AgentRestartReadiness): string =>
  report.holds
    .map(({ reason, ids }) => `${reason}=${ids.join(",")}`)
    .join("; ");

/** Check, fence synchronously, check again, then schedule. Never force past a hold. */
type RetirementResult = AgentRestartReadiness & { scheduled: boolean };
let retirement: Promise<RetirementResult> | undefined;

export function retireAgent(
  read: () => Promise<AgentRestartReadiness>,
  schedule: () => Promise<boolean>
): Promise<RetirementResult> {
  retirement ??= decideRetirement(read, schedule).finally(() => {
    retirement = undefined;
  });
  return retirement;
}

async function decideRetirement(
  read: () => Promise<AgentRestartReadiness>,
  schedule: () => Promise<boolean>
): Promise<AgentRestartReadiness & { scheduled: boolean }> {
  if (retiring) {
    return { ...(await read()), scheduled: true };
  }
  const first = await read();
  if (!first.ready) {
    return { ...first, scheduled: false };
  }
  setRetiring(true);
  try {
    const fenced = await read();
    if (!fenced.ready) {
      setRetiring(false);
      return { ...fenced, retiring: false, scheduled: false };
    }
    const scheduled = await schedule();
    if (!scheduled) {
      setRetiring(false);
      return { ...(await read()), scheduled: false };
    }
    return { ...fenced, retiring: true, scheduled };
  } catch (error) {
    setRetiring(false);
    throw error;
  }
}
