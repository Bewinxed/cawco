/**
 * What the hub logs of a machine's answer that came after its caller was
 * told no answer came (hub server.ts `lateAnswer`). The probe kit finds it by
 * these same words (scripts/probe-words-check.ts refuses a copy).
 */
export const machineReadWords = {
  /** Between what was asked and how late its answer came, in the line below. */
  pastDeadline: "past its",
  /** A machine's late answer, said once and dropped as it came. */
  lateLine: (
    machine: string,
    what: string,
    requestId: string,
    lateMs: number,
    deadlineMs: number
  ) =>
    `[hub] ${machine} answered ${what} (request ${requestId}) ${lateMs} ms ${machineReadWords.pastDeadline} ${deadlineMs / 1000} s deadline; its caller had been told no answer came`,
};
