/**
 * The words of "Open CawCo at cawco", the onboarding step that adds
 * CawCo's own device named `cawco` to the person's private network, as the
 * design gives them (the address design, 2026-10-22), for the preview the
 * owner picks a design from. Tailscale's HTTPS step is the tailnet row's own
 * (core words/tailnet.ts); Skip is the presence row's.
 */

/** The private network the hub found on its machine. */
export type AddressNet = "tailscale" | "headscale" | "netbird";
/** A network with no word without a port. */
export type NoWordNet = "zerotier" | "wireguard" | "lan";

const NET_NAMES: Record<AddressNet, string> = {
  tailscale: "Tailscale",
  headscale: "Headscale",
  netbird: "NetBird",
};

export const addressWords = {
  /** The title: thing and action; the word is drawn as a typed word. */
  title: (word: string) => `Open CawCo at ${word}`,
  titleBefore: "Open CawCo at ",
  /** The device's name, and the word typed: `cawco`, or what the tailnet gave it when that was taken. */
  word: "cawco",
  meta: (net: AddressNet, host: string) =>
    `Onboarding · ${NET_NAMES[net]} on ${host}`,

  lead: (word: string, host: string) =>
    `Type ${word} in any browser on your tailnet and CawCo opens. One sign-in adds CawCo's own device, named ${word}, to your tailnet. Nothing on ${host} changes.`,
  /** The phone's lead: the last sentence dropped. */
  leadShort: (word: string) =>
    `Type ${word} in any browser on your tailnet and CawCo opens. One sign-in adds CawCo's own device, named ${word}, to your tailnet.`,

  signIn: "Sign in on Tailscale",
  signInNote:
    "Tailscale's connect page opens in a new tab. On a phone it opens there.",
  signInWaiting:
    "Waiting for Tailscale… Finish the sign-in in the tab that opened, or press the link again.",
  approval: (word: string) =>
    `Signed in. An admin approves ${word} on Tailscale's Machines page; it ticks here by itself.`,
  openMachines: "Open the Machines page",
  signInDone: (word: string) => `${word} is on your tailnet`,

  answers: (address: string) => `Check that ${address} answers`,
  answersChecking: (host: string) => `Checking from ${host}…`,
  answersDone: (address: string) => `${address} answers`,

  /** The address line, once step 2 ticks: one address, or both. */
  opensAt: (http: string, https: string | null) =>
    https
      ? `CawCo opens at ${http} and ${https}.`
      : `CawCo opens at ${http} on every device on your tailnet.`,
  addressLabel: "Address",
  open: "Open",
  copy: "Copy",
  copyNamed: (address: string) => `Copy ${address}`,

  httpsDone: (https: string) => `HTTPS is on: ${https}`,
  httpsSkipped: "Skipped: HTTPS",
  httpsChecking: "Checking…",

  expiry: (word: string) => `Keep ${word} signed in`,
  expiryNote: (word: string) =>
    `On the Machines page, ${word} › Disable key expiry. Left on, Tailscale asks for a fresh sign-in every 180 days.`,
  expiryDone: "Key expiry is off",
  expirySkipped: "Skipped: key expiry",

  later: "Later",

  /** R: before the key lapses. */
  lapsing: (word: string, days: number) =>
    `${word}'s key runs out in ${days} days. Sign in again, or turn key expiry off so it never asks.`,

  /** G: the row's tick. */
  doneLine: (http: string, https: string | null) =>
    https
      ? `CawCo opens at ${http} and ${https} on every device on your tailnet.`
      : `CawCo opens at ${http} on every device on your tailnet.`,
  openAt: (http: string) => `Open ${http}`,

  /** NetBird's step 1. */
  netbirdLead: (address: string, host: string) =>
    `Type ${address} in any browser on your NetBird network and CawCo opens. One setup key adds CawCo's own device, named cawco. Nothing on ${host} changes.`,
  netbirdLeadShort: (address: string) =>
    `Type ${address} in any browser on your NetBird network and CawCo opens. One setup key adds CawCo's own device, named cawco.`,
  setupKey: "Paste a setup key",
  setupKeyNote: "From NetBird's Setup keys page: one key, reusable off.",
  openSetupKeys: "Open NetBird's Setup keys page",
  setupKeyLabel: "Setup key",
  addCawco: "Add cawco",

  /** Headscale's step 1. */
  headscaleSignIn: "Sign in on your Headscale server",
  headscaleNote: (server: string) =>
    `${server} opens in a new tab. If it asks for a command, run this once where Headscale runs.`,
  headscaleButton: (server: string) => `Sign in on ${server}`,
  commandLabel: "Command",
  copyCommand: "Copy command",

  /** J, K: Settings with no word to give. */
  noNetwork: (host: string) =>
    `Typing cawco needs Tailscale, Headscale or NetBird on ${host} and on the devices you use. Install one, and this card starts on its own.`,
  noWord: (net: NoWordNet, host: string) => {
    switch (net) {
      case "zerotier":
        return `ZeroTier on ${host} gives no word without a port: its names need ZeroNSD as root on port 53. Tailscale, Headscale or NetBird on this machine would.`;
      case "wireguard":
        return `WireGuard on ${host} has no names, so there's no word without a port.`;
      case "lan":
        break;
    }
    return `On your LAN a word needs port 80 on ${host}, which CawCo doesn't take.`;
  },

  /** The failure form. */
  showDetails: "Show details",
  hideDetails: "Hide details",
  getNewLink: "Get a new link",
  renameOther: "Rename the other one",
  useSuffix: (name: string) => `Use ${name}`,
  openDnsPage: "Open Tailscale's DNS page",
  checkAgain: "Check again",
  checking: "Checking…",
  signInAgain: "Sign in again",
  remove: "Remove",
  disableExpiry: "Disable key expiry",
  signInWithHost: (host: string) => `Sign in with the account ${host} uses.`,

  /** I: Settings' summary. */
  live: "Live",
  signedOut: "Signed out",
  keyRunsOut: (days: number) => `Key runs out in ${days} days`,
  notAnswering: "Not answering",
  summaryWhere: (net: AddressNet, host: string, account: string) =>
    `${NET_NAMES[net]} on ${host} · signed in as ${account}`,
  httpsOn: "HTTPS is on",
  answeredFrom: (host: string, ago: string) =>
    `Answered from ${host} ${ago} ago`,
  removeTitle: (word: string) => `Remove ${word} from your tailnet?`,
  removeBody: "Your other devices stop opening CawCo by that word.",

  /** The status card (the alternative): its badge words. */
  notYet: "Not yet",
  joining: "Joining…",
  statusLead:
    "One sign-in adds CawCo's own device, named cawco, to your tailnet, and every device there opens CawCo at http://cawco.",
  statusPending: (host: string) =>
    `Waiting for Tailscale, then checking http://cawco from ${host}.`,
};

/** Each failure's words: what happened, why, and the hub's lines under Show details. */
export const failureWords = {
  "link-expired": {
    what: "The sign-in link ran out before it was used.",
    why: null,
    details: "Link made Tue 21 Oct 18:02 · Tailscale: auth key expired",
  },
  "name-taken": {
    what: "Your tailnet already has a device named cawco, so CawCo's is cawco-1.",
    why: "Use that word, or rename the other one and check again.",
    details: "cawco · alice@example.com · last seen 3 days ago",
  },
  "no-answer": {
    what: "http://cawco didn't answer from obelisk-of-light.",
    why: "MagicDNS may be off on your tailnet.",
    details:
      "GET http://cawco/ from 100.101.102.103: no such host (DNS: no answer)",
  },
  "key-expired": {
    what: "cawco's key on your tailnet ran out, so http://cawco stopped answering.",
    why: "One sign-in brings it back.",
    details:
      "Expired Sun 19 Apr 09:12 · To stop this: Machines page › cawco › Disable key expiry ↗",
  },
  "wrong-tailnet": {
    what: "cawco joined alice@example.com's tailnet.",
    why: "obelisk-of-light is on bob@github's, so your devices there can't reach it.",
    details:
      "cawco: alice@example.com (tail9f8e) · obelisk-of-light: bob@github (tail1234)",
  },
} as const;

export type AddressFailure = keyof typeof failureWords;

/** The pages its links open. The sign-in link is the one the hub's device asked Tailscale for. */
export const addressPages = {
  machines: "https://login.tailscale.com/admin/machines",
  netbirdKeys: "https://app.netbird.io/setup-keys",
};
