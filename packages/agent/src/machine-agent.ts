/**
 * Whether this agent is the machine's own — the one allowed to write
 * machine-wide harness config (`~/.config/opencode/opencode.json` and its
 * plugins, and everything a fleet delta converges for claude, opencode and
 * pi) and to start the machine's OpenCode server.
 *
 * The process holding the machine's hub link is the machine's agent: the
 * daemon says so as its connection is proven ({@link holdHubLink}), and
 * writes the hub it connected with back into `config.json` then
 * (hub-proof.ts `recordJoinedHub`), the address the environment named
 * winning over the one written there before. Nothing compares addresses or
 * asks a hub for its id: an answer read off `config.json` told a machine's
 * own agent it was not whenever the address it connected with was another
 * than the one written there, and its deltas were refused for it.
 *
 * NEVER AN UNDECIDED ANSWER. Every caller acts on the answer it gets once
 * (OpenCode's server takes its config from it as it starts), so the answer
 * waits until this process holds the link.
 */

let markHeld: () => void = () => undefined;
const held = new Promise<boolean>((resolve) => {
  markHeld = () => resolve(true);
});

/** This process's connection to the hub is proven: it is the machine's agent. */
export const holdHubLink = (): void => markHeld();

export const isMachineAgent = (): Promise<boolean> => held;
