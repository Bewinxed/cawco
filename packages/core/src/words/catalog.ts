/**
 * What the person reads when a machine's listing of its stored sessions left
 * a harness out, for the dashboard and the native app alike.
 *
 * The dashboard imports this module; `bun run words` writes it into the app
 * as `Words.Catalog` (CawCoCore/Words.generated.swift), and `words:check`
 * fails the typecheck chain when that file is stale. So a word is changed
 * here or nowhere.
 */
export const catalogWords = {
  /** One harness on `machine` didn't list in time: its sessions are the ones it listed last. */
  harnessDidntAnswer: (harness: string, machine: string, seconds: number) =>
    `${harness} on ${machine} didn't answer within ${seconds} s, so its stored sessions are the ones it listed last.`,
  /** One harness on `machine` couldn't list (its listing threw), in harnessDidntAnswer's voice. */
  harnessCouldntList: (harness: string, machine: string, error: string) =>
    `${harness} on ${machine} couldn't list its stored sessions (${error}), so they are the ones it listed last.`,
};
