/**
 * The flow's words, per state and form, as the report writes them (design
 * e791c712, §4.2 and §4.5) in the house voice (WORDS.md: impersonal second
 * person, buttons a verb from the allowlist and its object, the error
 * formula for a failure). One place, so the desk tray, the phone's sheet,
 * the row and Settings say the same thing.
 *
 * Two of the report's buttons wait on WORDS.md's allowlist (its §4.10, the
 * owner's call): Start opens "Tailscale sign-in" rather than "Sign in to
 * Tailscale", and Headscale's refusal opens "the command" rather than
 * showing it.
 */
import { dateOf, EXPIRES, type Fact } from "../tray.svelte";
import type { Form, Press, StateWords } from "../words";
import { HEADSCALE_USER } from "../words";
import { type AddressFlow, type Cause, PEER } from "./flow.svelte";

/** The machine CawCo's hub runs on, as the drawing names it. */
const HUB_MACHINE = "obelisk";

/** A failure's words: what happened, why and the way out, its buttons. */
function failureWords(
  flow: AddressFlow,
  cause: Cause
): {
  title: string;
  line: string;
  button: string;
  secondary?: string;
} {
  const { domain, control, name: net } = flow.facts;
  switch (cause) {
    case "stopped":
      return {
        title: `${net} stopped on ${HUB_MACHINE}`,
        line: `${flow.name} signs out with it. Start ${net} on ${HUB_MACHINE}; CawCo checks again by itself.`,
        button: "Check again",
      };
    case "unsupported":
      return {
        title: "No word address on this network",
        line: "ZeroTier and WireGuard alone give devices no names. Tailscale, Headscale and NetBird do: CawCo joins one as a device and your phone and laptop reach it by name. Install one here and on your phone, and CawCo offers the word address here.",
        button: "Check again",
      };
    case "stale-link":
      return {
        title: "The sign-in link expired",
        line: `Nobody approved ${flow.name} within the hour. Open a new sign-in and approve it signed in to ${domain}; CawCo goes on by itself once it's approved.`,
        button: "Open a new sign-in",
      };
    case "wrong-tailnet":
      return {
        title: `${flow.name} joined a different tailnet`,
        line: `The link was approved on other-team.ts.net, not ${domain}. Open a new sign-in and approve it signed in to ${domain}; CawCo goes on by itself once it's approved there.`,
        button: "Open a new sign-in",
      };
    case "refused":
      return {
        title: `Your admin didn't approve ${flow.name}`,
        line: `${control} turned the request down. Send your admin the command again, or ask why; CawCo goes on by itself once it's approved.`,
        button: "Open the command",
      };
    case "key-refused":
      return {
        title: "NetBird refused the key",
        line: "It was used up, expired, or the name was refused. Make a new one-off key and paste it here; CawCo joins with it at once.",
        button: "Use a new key",
      };
    case "taken": {
      const given = flow.network === "netbird" ? "cawco-12-7" : "cawco-1";
      return {
        title: "cawco was taken",
        line: `Another machine on ${domain} is already called cawco, so ${net} named this one ${given}, and keeps that name. Use ${given}, or free the name in the machines list and CawCo asks for cawco again.`,
        button: `Use ${given}`,
        secondary: "Open machines list",
      };
    }
    case "no-answer":
      return {
        title: `${flow.name} is on the network but doesn't answer`,
        line: "CawCo keeps trying by itself. If it stays this way, its details say what came back.",
        button: "Check now",
      };
    case "expired":
      return {
        title: `${flow.name} signed out`,
        line: `Its key lapsed on ${dateOf(EXPIRES)}; nothing else changed. Open a new sign-in and the address comes back once it's approved.`,
        button: "Open a new sign-in",
      };
    case "certs-off":
      return {
        title: "The https address stopped",
        line: `${domain} stopped issuing certificates. ${flow.address} still works. Turn HTTPS Certificates back on in DNS settings, and CawCo gets the secure address back by itself.`,
        button: "Open DNS settings",
      };
  }
}

/** What the state says and offers, on a desk or a phone. */
export function stateWords(flow: AddressFlow, form: Form): StateWords {
  const { name: net, domain, control } = flow.facts;
  const title = "Open CawCo by one word";
  switch (flow.step) {
    case "start":
      if (flow.network === "netbird") {
        return {
          title,
          lines: [
            `This computer is on NetBird (${domain}). CawCo adds one small device of its own, named cawco, to it.`,
            "NetBird admits a device by a setup key. Make a one-off key under Setup Keys and paste it here. It's used once and never kept.",
          ],
          secondary: {
            label: "Open Setup Keys",
            act: () => undefined,
            away: true,
          },
          primary: {
            label: "Use this key",
            act: () => flow.useKey(),
            disabled: flow.key.trim() === "",
          },
        };
      }
      return {
        title,
        lines: [
          flow.network === "headscale"
            ? `This computer is on Headscale at ${control}. CawCo adds one small device of its own, named cawco, to it. Every device on it then opens CawCo by typing cawco.`
            : `This computer is on ${net} (${domain}). CawCo adds one small device of its own, named cawco, to it. Every device on it then opens CawCo by typing cawco.`,
          "No port on this computer, no root, and this machine keeps its name.",
        ],
        primary: {
          label: `Open ${net} sign-in`,
          act: () => flow.begin(),
          away: true,
        },
      };
    case "signin":
      return {
        title: "Waiting for your sign-in",
        lines: [
          flow.network === "headscale"
            ? `The sign-in opened in a new tab, at ${control}. Sign in there; Headscale then asks its admin to approve ${flow.name}. This keeps going if you close this.`
            : `The sign-in opened in a new tab. Approve the device ${flow.name} there, signed in to ${domain}. This keeps going if you close this.`,
        ],
        meta: {
          text: "Waiting",
          live: true,
          action: { label: "Open the sign-in again", act: () => undefined },
        },
      };
    case "admin":
      return {
        title: "Waiting for your admin",
        lines: [
          `Send your admin this; it registers ${flow.name} to ${HEADSCALE_USER}, the Headscale user this computer is signed in as.`,
        ],
        meta: { text: "Waiting", live: true },
      };
    case "answers":
      return {
        title: `${flow.name} answers`,
        lines: [`${flow.name} joined ${domain}.`],
        meta: {
          text: `Making sure ${flow.address} answers from here…`,
          live: true,
        },
      };
    case "phone":
      return phoneWords(flow, form);
    case "https":
      return httpsWords(flow);
    case "done":
      return {
        title: `${flow.name} is live`,
        lines: [`Type ${flow.typed} on any device signed in to ${domain}.`],
        primary: { label: "Done", act: () => undefined },
      };
    case "failed": {
      const said = failureWords(flow, flow.cause);
      let meta: StateWords["meta"];
      if (flow.watching === "certs") {
        meta = { text: "Watching for certificates…", live: true };
      } else if (flow.watching === "name") {
        meta = { text: "Watching for cawco to be free…", live: true };
      } else if (flow.cause === "no-answer") {
        meta = { text: "Trying again in 60 s", live: true };
      } else if (flow.cause === "stopped") {
        meta = { text: `Checking for ${net} every 30 s`, live: true };
      } else if (flow.checkedAgain) {
        meta = { text: "Checked again: nothing changed yet", live: false };
      }
      return {
        title: said.title,
        lines: [said.line],
        meta,
        secondary: said.secondary
          ? { label: said.secondary, act: () => flow.watch("name"), away: true }
          : undefined,
        primary: {
          label: said.button,
          act: () => flow.wayOut(),
          away: said.button.startsWith("Open"),
          // Name taken is a stop with a choice: Use cawco-1 stands as the primary (§4.5).
          quiet: !said.secondary,
        },
      };
    }
  }
}

function phoneWords(flow: AddressFlow, form: Form): StateWords {
  if (form === "phone" && flow.phoneOpened) {
    // The phone's own view changes once a phone opened it: the step is done.
    return {
      title: `${flow.phoneOpened === "here" ? "This phone" : PEER} opened it`,
      lines: [
        `From now on ${flow.bareWordWorks ? flow.name : flow.long} alone works in that browser.`,
      ],
      primary: { label: "Done", act: () => flow.next() },
    };
  }
  if (form === "phone") {
    return {
      title: "Open it here, once",
      lines: [
        flow.bareWordWorks
          ? `Tap this once, slash and all. After that, ${flow.name} alone works in this browser.`
          : `NetBird names it ${flow.long}. Tap this once and this browser remembers it.`,
      ],
      secondary: { label: "Skip for now", act: () => flow.next() },
      primary: {
        label: `Open ${flow.typed}`,
        act: () => flow.openedHere(),
        away: true,
      },
    };
  }
  const opened = flow.phoneOpened !== null;
  return {
    title: "Open it on your phone, once",
    lines: [
      flow.bareWordWorks
        ? `A browser treats a bare word as a search until that device has opened ${flow.typed} once, slash and all. From then on ${flow.name} alone works.`
        : `NetBird names it ${flow.long}. The bare word needs your admin to add ${flow.facts.domain} as a search domain; until then, open the long name.`,
    ],
    meta: opened
      ? { text: `${PEER} opened it`, live: false }
      : { text: "Waiting for a phone to open it", live: true },
    secondary: opened
      ? undefined
      : { label: "Skip for now", act: () => flow.next() },
    primary: {
      label: "Done",
      act: () => flow.next(),
    },
  };
}

function httpsWords(flow: AddressFlow): StateWords {
  if (flow.certs) {
    return {
      title: "Secure address is on",
      lines: [
        `CawCo got ${flow.name}'s certificate and renews it itself. ${flow.name}/ sends you on here.`,
      ],
      meta: { text: "Certificate held · renews 21 Jan 2027", live: false },
      primary: { label: "Done", act: () => flow.go("done") },
    };
  }
  return {
    title: "Make it secure (optional)",
    lines: [
      `An admin turns on HTTPS Certificates on Tailscale's DNS page, which puts machine names in a public log. CawCo then gets ${flow.name}'s certificate, renews it, and sends ${flow.name}/ on to ${flow.secureAddress}.`,
    ],
    meta:
      flow.watching === "certs"
        ? { text: "Watching for certificates…", live: true }
        : undefined,
    secondary: { label: "Skip", act: () => flow.go("done") },
    primary: {
      label: "Open DNS settings",
      act: () => flow.watch("certs"),
      away: true,
    },
  };
}

/** One of Done's three marks: a fact ticked, one not yet with the press that does it, or a plain fact. */
export interface Mark {
  action?: Press;
  /** `yes` ticked, `wait` the live dot, `not` a hollow mark with its action, `no` a fact that won't change. */
  kind: "yes" | "not" | "no" | "wait";
  lock?: boolean;
  text: string;
}

export function doneMarks(flow: AddressFlow, form: Form): Mark[] {
  const marks: Mark[] = [];
  if (flow.phoneOpened) {
    marks.push({
      kind: "yes",
      text:
        flow.phoneOpened === "here" || form === "phone"
          ? "This phone opened it"
          : `${PEER} opened it`,
    });
  } else {
    marks.push({
      kind: "not",
      text: "Phone: not yet",
      action: {
        label: form === "phone" ? "Open it here" : "Open it on your phone",
        act: () => flow.reopen("phone"),
      },
    });
  }
  if (flow.issuesCerts) {
    marks.push(
      flow.certs
        ? { kind: "yes", lock: true, text: flow.secureAddress }
        : {
            kind: "not",
            text: "Secure: not yet",
            action: { label: "Set up HTTPS", act: () => flow.reopen("https") },
          }
    );
  } else {
    marks.push({
      kind: "no",
      text: `No https for names on ${flow.facts.name} yet`,
    });
  }
  if (flow.network === "netbird") {
    marks.push({ kind: "yes", text: "A setup key's peer never expires" });
  } else if (flow.network === "headscale") {
    marks.push({ kind: "yes", text: "No expiry: the server sets none" });
  } else if (flow.expiryOff) {
    marks.push({ kind: "yes", text: "Expiry off" });
  } else if (flow.watching === "expiry") {
    marks.push({ kind: "wait", text: "Watching for expiry to go off…" });
  } else {
    marks.push({
      kind: "not",
      text: `Signed in until ${dateOf(EXPIRES)}`,
      action: {
        label: "Switch expiry off",
        act: () => flow.watch("expiry"),
        away: true,
      },
    });
  }
  return marks;
}

/** The row's want line while the tray is parked: where the work stands. */
export function rowLine(flow: AddressFlow): { text: string; live: boolean } {
  switch (flow.step) {
    case "start":
      return {
        text: `Type ${flow.typed} on any of your devices to open CawCo. ${flow.network === "netbird" ? "One setup key" : "One sign-in"} sets it up.`,
        live: false,
      };
    case "signin":
      return { text: "Waiting for your sign-in…", live: true };
    case "admin":
      return { text: "Waiting for your admin…", live: true };
    case "answers":
      return { text: `Making sure ${flow.address} answers…`, live: true };
    case "phone":
      return flow.phoneOpened
        ? { text: `${PEER} opened it`, live: false }
        : { text: "Waiting for a phone to open it", live: true };
    case "https":
      if (flow.watching === "certs") {
        return { text: "Watching for certificates…", live: true };
      }
      return flow.certs
        ? { text: `Secure at ${flow.secureAddress}`, live: false }
        : {
            text: `${flow.address} answers. Secure is optional.`,
            live: false,
          };
    case "done":
      return { text: `Live at ${flow.address}`, live: false };
    case "failed":
      return { text: failureWords(flow, flow.cause).title, live: false };
  }
}

/** What CawCo never does, said where the set-up starts. */
const NEVER: Fact[] = [
  { mark: "no", text: "No port on this computer" },
  { mark: "no", text: "No root, no rename, no relaying" },
];

/** The error each cause came back with, word for word. */
const ERRORS: Record<Cause, string> = {
  stopped: "tailscaled: backend state Stopped",
  unsupported: "no network client here gives its devices names",
  "stale-link": "auth URL expired: no login within 1h0m0s",
  "wrong-tailnet":
    "logged in to tailnet other-team.ts.net, expected heron-pike.ts.net",
  refused: "node registration rejected by an admin",
  "key-refused":
    "rpc error: code = PermissionDenied desc = setup key is expired or used up",
  taken: "hostname cawco in use; assigned cawco-1",
  "no-answer": "dial tcp 100.94.12.7:80: i/o timeout",
  expired: "node key expired",
  "certs-off": "cert: HTTPS certificates are not enabled for this tailnet",
};

/** Show details' facts: a few drawn facts for the state. */
export function factsFor(flow: AddressFlow): Fact[] {
  const { name: net, domain, control } = flow.facts;
  switch (flow.step) {
    case "start":
      return [
        { mark: "yes", text: `${net} is running here` },
        { mark: "info", text: `Names end in ${domain}` },
        { mark: "yes", text: "CawCo adds one device: cawco" },
        ...NEVER,
      ];
    case "signin":
      return [
        { mark: "info", text: `Approve it as an account on ${domain}` },
        {
          mark: "info",
          text: "The link goes stale if nobody approves it in 1 hour",
        },
        { mark: "wait", text: "Nothing to run here: CawCo watches for it" },
      ];
    case "admin":
      return [
        { mark: "info", text: `Control server: ${control}` },
        {
          mark: "info",
          text: `User ${HEADSCALE_USER}, read from this computer's own login`,
        },
        { mark: "wait", text: "CawCo checks every 5 seconds" },
      ];
    case "answers":
      return [
        { mark: "info", text: `Asked for cawco, given ${flow.name}` },
        { mark: "info", text: "Its address on the network: 100.94.12.7" },
        { mark: "wait", text: "Dialled by name from CawCo's own device" },
      ];
    case "phone":
      return [
        { mark: "info", text: `The QR opens ${flow.address}` },
        { mark: "info", text: `The phone must be signed in to ${domain}` },
        ...(flow.bareWordWorks
          ? []
          : [
              {
                mark: "info" as const,
                text: `Search domains: ${flow.facts.consoles.dns}`,
              },
            ]),
      ];
    case "https":
      return flow.certs
        ? [
            { mark: "yes", text: `Certificate for ${flow.long}` },
            { mark: "info", text: "Issued 23 Oct 2026, renews 21 Jan 2027" },
          ]
        : [
            { mark: "no", text: "HTTPS Certificates: off on the DNS page" },
            {
              mark: "info",
              text: `${flow.name}/ stays http: no authority certifies a bare word`,
            },
            {
              mark: "info",
              text: "Only an admin of the tailnet can switch it",
            },
          ];
    case "done":
      return [
        { mark: "yes", text: `${net}, ${domain}` },
        {
          mark: "info",
          text: `Device ${flow.name}, signed in as ${HEADSCALE_USER}`,
        },
        flow.certs && flow.issuesCerts
          ? { mark: "yes", text: "Certificate held; renews 21 Jan 2027" }
          : { mark: "no", text: "No certificate" },
      ];
    case "failed":
      if (flow.cause === "unsupported") {
        return [
          { mark: "no", text: "ZeroTier is running here: it gives no names" },
          { mark: "no", text: "WireGuard alone has no names at all" },
        ];
      }
      return [
        { mark: "info", text: "Last tried 40 s ago" },
        { mark: "wait", text: "CawCo tries again by itself every minute" },
      ];
  }
}

/** What came back, word for word: a failure's error, else what the hub holds. */
export function rawFor(flow: AddressFlow): string {
  if (flow.step === "failed") {
    return JSON.stringify(
      {
        network: flow.network,
        cause: flow.cause,
        error: ERRORS[flow.cause],
        lastTried: "2026-10-24T21:14:08Z",
      },
      null,
      2
    );
  }
  return JSON.stringify(
    {
      network: flow.network,
      domain: flow.facts.domain,
      hostname: flow.name,
      ips: ["100.94.12.7"],
      certDomains: flow.certs && flow.issuesCerts ? [flow.long] : [],
    },
    null,
    2
  );
}
