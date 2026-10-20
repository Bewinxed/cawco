/**
 * The hub's `.local` name typed in a browser: its onboarding row in Caw's
 * Needs you (core local-name.ts), while Linux keeps port 80 from the hub.
 * One step, the command that lowers `ip_unprivileged_port_start`; it ticks
 * once the hub holds the port.
 */
export const localNameWords = {
  /** The row's title, by the name the hub holds. */
  title: (name: string) => `Open CawCo by typing ${name}`,
  /** Where the row comes from: onboarding, on the hub's machine. */
  meta: (host: string) => `Onboarding · port 80 on ${host}`,
  /** The row's line over its step, while it stands. */
  lead: (name: string, port: number) =>
    `A browser on this network opens CawCo at ${name} once this is done. Until then it opens at ${name}:${port}.`,
  step: "Let CawCo answer on port 80",
  /** Where the command runs: sudo asks for the person's password there. */
  note: (host: string) =>
    `Run it once in a terminal on ${host}. It holds a reboot and ticks here by itself.`,
  /** The step's command box, for a screen reader. */
  command: "Command",
  /** Port 80 came while the row stood: its tick. */
  done: (name: string) => `A browser on this network opens CawCo at ${name}.`,
};
