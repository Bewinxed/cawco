/**
 * One call of the `tailscale` CLI on the hub's machine, bounded: what Funnel
 * (funnel.ts) and HTTPS on the tailnet name (tailnet-https.ts) both run.
 */
import { type Bounded, readWithin } from "@cawco/core/bounded";

/** What one call printed and how it ended; `missing` when there is no CLI to run. */
export interface Ran {
  code: number | null;
  missing?: true;
  output: string;
  stdout: string;
}

/** What a call printed so far, kept as it comes. */
export interface Heard {
  stderr: string;
  stdout: string;
}

/** A call's first line of output, trimmed, for a sentence. */
export const firstLine = (text: string) =>
  text
    .split("\n")
    .map((line) => line.trim())
    .find(Boolean)
    ?.slice(0, 300) ?? "no output";

/**
 * Runs `bin` with `args` within `ms`. What it printed is kept in `heard` as
 * it comes, so a call let go unanswered still says what it printed (an
 * approval URL it waits on).
 */
export const runTailscale = (
  bin: string,
  args: string[],
  ms: number,
  heard: Heard = { stdout: "", stderr: "" }
): Promise<Bounded<Ran>> =>
  readWithin(ms, async (signal) => {
    let child: Bun.Subprocess<"ignore", "pipe", "pipe">;
    try {
      child = Bun.spawn([bin, ...args], {
        stdin: "ignore",
        stdout: "pipe",
        stderr: "pipe",
        signal,
      });
    } catch {
      return { code: null, missing: true, output: "", stdout: "" };
    }
    const keep = async (
      stream: ReadableStream<Uint8Array>,
      into: keyof Heard
    ) => {
      const decoder = new TextDecoder();
      for await (const chunk of stream) {
        heard[into] += decoder.decode(chunk, { stream: true });
      }
    };
    const [, , code] = await Promise.all([
      keep(child.stdout, "stdout"),
      keep(child.stderr, "stderr"),
      child.exited,
    ]);
    return {
      code,
      output: `${heard.stdout}\n${heard.stderr}`,
      stdout: heard.stdout,
    };
  });
