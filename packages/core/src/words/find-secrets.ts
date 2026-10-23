/**
 * What the person reads of a secret in Find's results (hub find-secrets.ts):
 * the dots it is drawn as, what a screen reader says of them, and the
 * setting that turns them off (Configure › Devices). The dashboard imports
 * this module; the app reads it once it draws Find's secrets.
 */
export const findSecretWords = {
  /** A hidden secret, drawn: always this long, never its own length. */
  dots: "••••••••",
  /** A hidden secret's name, for a screen reader and the pointer. */
  hidden: "Hidden secret, press to show",
  /** What ↵ does on a row that holds one still hidden (Find's hint line). */
  enter: "show secret",
  /** Said once a secret is shown in place. */
  shown: "Secret shown",
  /** The setting's group, on Configure › Devices. */
  group: "Find",
  /** The setting. */
  setting: "Hide secrets in Find",
  settingOn:
    "On: a password or key in Find's results shows as dots until you click it, so a screenshot of Find shows none.",
  settingOff: "Off: Find shows every result's words as they were said.",
  /** The setting could not be read. */
  unread: (why: string) => `Could not read Find's settings — ${why}.`,
};
