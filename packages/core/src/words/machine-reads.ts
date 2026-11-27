/**
 * What the hub logs of a machine's answer that came after its caller was
 * told no answer came (hub machine-calls.ts `lateAnswer`): its beats had
 * stopped naming the request for a quiet spell before it answered.
 */
export const machineReadWords = {
  /** A machine's late answer, said once and dropped as it came. */
  lateLine: (
    machine: string,
    what: string,
    requestId: string,
    sinceAskedMs: number,
    lapsedMs: number
  ) =>
    `[hub] ${machine} answered ${what} (request ${requestId}) ${sinceAskedMs} ms after it was asked, ${lapsedMs} ms after its beats stopped naming it and its caller was told no answer came`,
  /** A machine's beats stopped naming a request the hub's caller waited on: it is told to stop it. */
  quietLine: (
    machine: string,
    what: string,
    caller: string,
    requestId: string
  ) =>
    `[find] ${machine} stopped naming ${what} for ${caller} on its beats (request ${requestId}); it is told to stop it`,
};
