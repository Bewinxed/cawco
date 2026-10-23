/**
 * "Open CawCo at cawco", the recommended design's sheet (Component Story
 * Format 3, live components): every frame of the address design
 * (2026-10-22), A to S, on the owner's own machine (the hub on
 * obelisk-of-light, his tailnet tail1234, signed in as bob@github). Each
 * state stands twice: at the desk (1440) and on a phone (390). Needs you's
 * frames are the row (`row`), Settings' the card. The meta's args are every
 * story's; a story's own args are what it changes.
 */
import AddressJourney from "./AddressJourney.svelte";
import type { AddressStep } from "./model";

const host = "obelisk-of-light";
const http = "http://cawco";
const https = "https://cawco.tail1234.ts.net";
const signIn = "https://login.tailscale.com/a/4f1c9e2b7a3d";

/** Tailscale's four steps, as they stand, `over` changing some. */
const path = (
  over: Partial<Record<AddressStep["step"], AddressStep>>
): AddressStep[] =>
  (
    [
      { step: "sign-in", state: "needs" },
      { step: "answers", state: "waiting" },
      { step: "https", state: "waiting" },
      { step: "expiry", state: "waiting" },
    ] satisfies AddressStep[]
  ).map((step) => over[step.step] ?? step);

const joined = { step: "sign-in", state: "done" } satisfies AddressStep;
const answers = { step: "answers", state: "done" } satisfies AddressStep;

export default {
  title: "Onboarding/Open CawCo at cawco",
  component: AddressJourney,
  args: {
    view: "journey",
    row: true,
    net: "tailscale",
    host,
    signIn,
    place: { http, https: null },
    steps: path({}),
  },
};

const desk = { viewport: 1440 };
const phone = { viewport: 390 };

/** A · Entry: step 1 stands; the lead says why. */
export const Entry = { args: {}, parameters: desk };
/** A · Entry, on a phone: the lead's last sentence dropped. */
export const EntryPhone = { args: {}, parameters: phone };

const waiting = {
  steps: path({ "sign-in": { step: "sign-in", state: "waiting" } }),
};
/** B · The link was pressed; the hub waits for the device to join. */
export const Waiting = { args: waiting, parameters: desk };
/** B · Waiting, on a phone. */
export const WaitingPhone = { args: waiting, parameters: phone };

const approval = {
  steps: path({ "sign-in": { step: "sign-in", state: "approval" } }),
};
/** C · Device approval is on: an admin approves cawco on the Machines page. */
export const Approval = { args: approval, parameters: desk };
/** C · Approval, on a phone. */
export const ApprovalPhone = { args: approval, parameters: phone };

const checking = {
  steps: path({
    "sign-in": joined,
    answers: { step: "answers", state: "checking" },
  }),
};
/** D · The device is on; the hub fetches the address from obelisk-of-light. */
export const Checking = { args: checking, parameters: desk };
/** D · Checking, on a phone. */
export const CheckingPhone = { args: checking, parameters: phone };

const ready = {
  steps: path({
    "sign-in": joined,
    answers,
    https: { step: "https", state: "needs" },
  }),
};
/** E · Ready: the address answers, Copy and Open; HTTPS stands, optional, with Skip. */
export const Ready = { args: ready, parameters: desk };
/** E · Ready, on a phone. */
export const ReadyPhone = { args: ready, parameters: phone };

const keepSignedIn = {
  place: { http, https },
  steps: path({
    "sign-in": joined,
    answers,
    https: { step: "https", state: "done" },
    expiry: { step: "expiry", state: "needs" },
  }),
};
/** F · HTTPS ticked; Keep cawco signed in stands, optional, with Skip. */
export const KeepSignedIn = { args: keepSignedIn, parameters: desk };
/** F · Keep it signed in, on a phone. */
export const KeepSignedInPhone = { args: keepSignedIn, parameters: phone };

const done = { view: "done", place: { http, https } };
/** G · Done: the row's tick, both addresses, Copy and Open. */
export const Done = { args: done, parameters: desk };
/** G · Done, on a phone. */
export const DonePhone = { args: done, parameters: phone };

const parked = { ...ready, row: false };
/** H · Later pressed: parked live; Settings holds the same card, without Later. */
export const Parked = { args: parked, parameters: desk };
/** H · Parked in Settings, on a phone. */
export const ParkedPhone = { args: parked, parameters: phone };

const summary = {
  view: "summary",
  row: false,
  place: { http, https },
  summary: {
    state: "live",
    account: "bob@github",
    https: "on",
    expiry: "off",
    ago: "2 min",
  },
};
/** I · Settings once it is done: the summary, Check again and Remove asked in place. */
export const Summary = { args: summary, parameters: desk };
/** I · The summary, on a phone. */
export const SummaryPhone = { args: summary, parameters: phone };

const none = { view: "none", row: false };
/** J · Settings, no private network on this machine. */
export const NoNetwork = { args: none, parameters: desk };
/** J · No network, on a phone. */
export const NoNetworkPhone = { args: none, parameters: phone };

const noWord = { view: "no-word", row: false, noWord: "zerotier" };
/** K · Settings on ZeroTier: no word without a port, and why. */
export const NoWord = { args: noWord, parameters: desk };
/** K · ZeroTier, on a phone. */
export const NoWordPhone = { args: noWord, parameters: phone };
/** K · Plain WireGuard: it has no names. */
export const WireGuard = {
  args: { ...noWord, noWord: "wireguard" },
  parameters: desk,
};
/** K · LAN only: a word needs port 80, which CawCo doesn't take. */
export const Lan = { args: { ...noWord, noWord: "lan" }, parameters: desk };

const netbird = {
  net: "netbird",
  place: { http: "http://cawco.netbird.example", https: null },
  steps: [
    { step: "setup-key", state: "needs" },
    { step: "answers", state: "waiting" },
  ] satisfies AddressStep[],
};
/** L · NetBird: step 1 is a setup key; steps 3 and 4 don't apply. */
export const NetBird = { args: netbird, parameters: desk };
/** L · NetBird, on a phone. */
export const NetBirdPhone = { args: netbird, parameters: phone };

const headscale = {
  net: "headscale",
  server: "headscale.example.net",
  signIn: "https://headscale.example.net/register/mkey:3f9a",
  steps: [
    {
      step: "headscale",
      state: "needs",
      command:
        "headscale nodes register --user bob --key mkey:3f9a2c71e0b84d55a6c19e7f2b0d4a83",
    },
    { step: "answers", state: "waiting" },
    { step: "expiry", state: "waiting" },
  ] satisfies AddressStep[],
};
/** M · Headscale: its own server's sign-in, and the register command to copy. */
export const Headscale = { args: headscale, parameters: desk };
/** M · Headscale, on a phone. */
export const HeadscalePhone = { args: headscale, parameters: phone };

const failed = (failure: string) => ({ view: "failure", failure });
/** N · The sign-in link ran out: Get a new link. */
export const LinkExpired = { args: failed("link-expired"), parameters: desk };
/** N · Link expired, on a phone. */
export const LinkExpiredPhone = {
  args: failed("link-expired"),
  parameters: phone,
};
/** O · The name was taken: Rename the other one, or Use cawco-1. */
export const NameTaken = { args: failed("name-taken"), parameters: desk };
/** O · Name taken, on a phone. */
export const NameTakenPhone = { args: failed("name-taken"), parameters: phone };
/** P · The address doesn't answer: Tailscale's DNS page, or Check again. */
export const NoAnswer = { args: failed("no-answer"), parameters: desk };
/** P · No answer, on a phone. */
export const NoAnswerPhone = { args: failed("no-answer"), parameters: phone };
/** Q · The key ran out: Sign in again. */
export const KeyExpired = { args: failed("key-expired"), parameters: desk };
/** Q · Key expired, on a phone. */
export const KeyExpiredPhone = {
  args: failed("key-expired"),
  parameters: phone,
};

const lapsing = { view: "lapsing", days: 12 };
/** R · Before it lapses: Sign in again, or Disable key expiry. */
export const Lapsing = { args: lapsing, parameters: desk };
/** R · Before it lapses, on a phone. */
export const LapsingPhone = { args: lapsing, parameters: phone };

/** S · Signed into a different tailnet: Sign in again, or Remove (asked in place). */
export const WrongTailnet = { args: failed("wrong-tailnet"), parameters: desk };
/** S · Wrong tailnet, on a phone. */
export const WrongTailnetPhone = {
  args: failed("wrong-tailnet"),
  parameters: phone,
};
