/**
 * What a task waits on (hub task-file.ts `waits_on:`) and what a plan step
 * waits on (`PlanStep.waitsOn`): one grammar, its kind read from the
 * handle's shape, never from a type field. The hub's task-waits.ts reads
 * what an agent writes into it and settles each target.
 *
 * | Kind    | An agent writes                                   | A file keeps                    |
 * | ------- | ------------------------------------------------- | ------------------------------- |
 * | task    | `tsk-12` (`#12`, `12`)                            | `12`                            |
 * | card    | `<page>#<card>`, the page by name, handle or id   | `<artifact id>#<card>`          |
 * | pin     | `<page>/<number>`                                 | `<artifact id>/<number>`        |
 * | pr      | `https://github.com/<owner>/<repo>/pull/<n>`      | the same                        |
 * | run     | `https://github.com/<owner>/<repo>/actions/runs/<n>` | the same                     |
 * | session | `<dir>#<id8>`, the handle CawCo's tools name it by | `<dir>#<session id>`           |
 *
 * A kept card's artifact and a kept session are whole ids, so `<uuid>#<card>`
 * and `<dir>#<uuid>` never read as each other.
 */

export type WaitKind = "task" | "card" | "pin" | "pr" | "run" | "session";

export type WaitTarget =
  | { kind: "task"; id: string }
  | { kind: "card"; artifactId: string; card: string }
  | { kind: "pin"; artifactId: string; number: number }
  | { kind: "pr"; number: number; repo: string; url: string }
  | { kind: "run"; id: string; repo: string; url: string }
  | { kind: "session"; dir: string; instanceId: string };

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const TASK = /^(?:tsk-|#)?(\d{1,9})$/iu;
const CARD = new RegExp(`^(${UUID})#([^#\\s]+)$`, "iu");
const SESSION = new RegExp(`^([^#\\s]*)#(${UUID})$`, "iu");
const PIN = new RegExp(`^(${UUID})/(\\d{1,6})$`, "iu");
const PR =
  /^https?:\/\/github\.com\/([\w.-]+\/[\w.-]+)\/pull\/(\d{1,9})(?:[/?#].*)?$/iu;
const RUN =
  /^https?:\/\/github\.com\/([\w.-]+\/[\w.-]+)\/actions\/runs\/(\d{1,15})(?:[/?#].*)?$/iu;

/** A pull request or an Actions run on GitHub, by its URL; undefined for any other. */
export const githubTarget = (
  url: string
): Extract<WaitTarget, { kind: "pr" | "run" }> | undefined => {
  const written = url.trim();
  const pr = PR.exec(written);
  if (pr) {
    const repo = (pr[1] as string).toLowerCase();
    const number = Number(pr[2]);
    return {
      kind: "pr",
      repo,
      number,
      url: `https://github.com/${repo}/pull/${number}`,
    };
  }
  const run = RUN.exec(written);
  if (run) {
    const repo = (run[1] as string).toLowerCase();
    const id = run[2] as string;
    return {
      kind: "run",
      repo,
      id,
      url: `https://github.com/${repo}/actions/runs/${id}`,
    };
  }
};

/** A task named as a wait (`tsk-12`, `#12`, `12`), as `tsk-12`; undefined when it names none. */
export const taskTarget = (handle: string): string | undefined => {
  const found = TASK.exec(handle.trim());
  return found ? `tsk-${Number(found[1])}` : undefined;
};

/** A wait as a file keeps it, read back; undefined when its shape is none of the six. */
export const waitTarget = (handle: string): WaitTarget | undefined => {
  const kept = handle.trim();
  const task = taskTarget(kept);
  if (task) {
    return { kind: "task", id: task };
  }
  const github = githubTarget(kept);
  if (github) {
    return github;
  }
  const pin = PIN.exec(kept);
  if (pin) {
    return {
      kind: "pin",
      artifactId: (pin[1] as string).toLowerCase(),
      number: Number(pin[2]),
    };
  }
  const card = CARD.exec(kept);
  if (card) {
    return {
      kind: "card",
      artifactId: (card[1] as string).toLowerCase(),
      card: card[2] as string,
    };
  }
  const session = SESSION.exec(kept);
  if (session) {
    return {
      kind: "session",
      dir: session[1] as string,
      instanceId: (session[2] as string).toLowerCase(),
    };
  }
};

/** A wait as a file keeps it and every answer names it: one string per target. */
export const waitHandle = (target: WaitTarget): string => {
  switch (target.kind) {
    case "task":
      return target.id;
    case "card":
      return `${target.artifactId}#${target.card}`;
    case "pin":
      return `${target.artifactId}/${target.number}`;
    case "pr":
    case "run":
      return target.url;
    case "session":
      return `${target.dir}#${target.instanceId}`;
  }
};

/** The artifact a card or pin wait stands on, by its whole id; undefined for any other wait. */
export const waitArtifact = (handle: string): string | undefined => {
  const target = waitTarget(handle);
  return target?.kind === "card" || target?.kind === "pin"
    ? target.artifactId
    : undefined;
};
