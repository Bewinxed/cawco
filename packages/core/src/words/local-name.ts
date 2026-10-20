/**
 * The hub's `.local` name typed in a browser: its onboarding row in Caw's
 * Needs you (core local-name.ts), while Linux keeps port 80 from the hub.
 * One step, the command that lowers `ip_unprivileged_port_start`; it ticks
 * once the hub holds the port. The title is a noun, true before and after.
 */
export const localNameWords = {
  /** The row's title, by the name the hub holds: the same words while it stands and once ticked. */
  title: (name: string) => `CawCo at ${name}`,
  /** Where the row comes from: onboarding, on the hub's machine. */
  meta: (host: string) => `Onboarding · ${host}`,
  /** The row's line over its step: what happened and why, then what stands until it is done (WORDS.md, Error formula). */
  lead: (name: string, host: string, port: number) =>
    `Typing ${name} in a browser doesn't open CawCo yet: a browser asks port 80 first, and ${host} lets only root answer there. Until then CawCo opens at ${name}:${port}.`,
  step: "Let CawCo answer on port 80",
  /** Where the command runs and what happens after: sudo asks for the person's password there. */
  note: (host: string) =>
    `Run it once in a terminal on ${host}. It holds a reboot and ticks here by itself.`,
  /** Port 80 came while the row stood: its tick. */
  done: (name: string) => `Typing ${name} in a browser opens CawCo now.`,
};
