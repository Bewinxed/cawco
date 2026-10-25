/**
 * Every word Configure › Accounts says, on the dashboard and in the native
 * app alike: its list, an account's page and its machines' sign-ins, the
 * stepped setup, a provider's routing, the strategy figures, and the names
 * accounts, harnesses and colours go by.
 *
 * The dashboard imports this module; `bun run words` writes it into the app
 * as `Words.Accounts` (CawCoCore/Words.generated.swift) and `words:check`
 * fails the typecheck chain when that file is stale or when an Accounts file
 * on either side spells a word itself. Grouped by the web component that
 * shows each; a word marked "the app's alone" is one only the app says,
 * where the HIG asks for something the web does another way.
 */
import type { AccountHue, PlacementStrategy } from "../accounts";
import { commonWords } from "./common";
import { andList, pad2 } from "./helpers";

/** One strategy, as its card names it and its line explains it. */
export interface StrategyWords {
  id: PlacementStrategy;
  label: string;
  line: string;
}

/** One account colour, in the order the swatches offer them. */
export interface SwatchWords {
  hue: AccountHue;
  name: string;
}

export const accountsWords = {
  // ── The list (accounts/+page.svelte, AccountListRow) ──────────────────
  add: "Add account",
  addFirst: "Add your first account",
  routing: "Routing",
  /** An account no machine has signed in yet, which has no name to go by. */
  notSignedInYet: "Not signed in yet",
  /** The same account where a sentence names it (core `accountName`). */
  unnamed: "an account not signed in yet",
  /** A key account with no nickname: its last four characters. */
  keyTail: (tail: string) => `••••${tail}`,
  /** What is wrong with an account, in its row's second line. */
  problem: {
    someoneElse: (machine: string) => `${machine} is signed in as someone else`,
    nowhere: "Not signed in on any machine",
    missingOn: (machine: string, others: number) =>
      others === 0
        ? `Not signed in on ${machine}`
        : `Not signed in on ${machine} and ${others} other${others === 1 ? "" : "s"}`,
  },

  // ── Providers and harnesses (model.svelte.ts) ─────────────────────────
  /** Claude's two picker rows ("Claude", "Anthropic Console"), and its name. */
  claude: "Claude",
  anthropicConsole: "Anthropic Console",
  /** The harnesses that use an account, as a sentence names them. */
  harnesses: {
    claude: "Claude Code",
    opencode: "OpenCode",
    pi: "pi",
  },
  /** "Claude Code and OpenCode". */
  harnessList: (names: readonly string[]) => andList(names),

  // ── An account (AccountEditor) ────────────────────────────────────────
  editor: {
    /** What the editor's row is, for "That account is gone". */
    what: "account",
    nickname: "Nickname",
    save: commonWords.saveChanges,
    remove: "Remove account",
    removing: "Removing…",
    removeTitle: (name: string) => `Remove ${name}?`,
    /** What the removal reaches: the machines signed in to it, named. */
    removeBody: (machines: readonly string[], harnesses: string) =>
      machines.length > 0
        ? `${andList(machines)} ${machines.length === 1 ? "is" : "are"} signed in to it: ${machines.length === 1 ? "it signs" : "each signs"} it out of ${harnesses} and forgets it. New sessions stop being placed on it.`
        : "No machine is signed in to it. New sessions stop being placed on it.",
    machines: "Machines",
    looks: "Looks",
    limits: "Limits",
    neverBackup: "Never use as a backup",
    /** At a plan limit with extra usage on (core `AtPlanLimit`): on, its sessions keep going there. */
    extraUsage: "Keep going on extra usage at a plan limit",
    extraUsageOn: "Its sessions carry on here, paid from its extra usage.",
    extraUsageOff: "Its sessions move to an account with plan room.",
    reserve: "Stop placing new work past",
    reserveUnit: "% of the week",
    reserveInvalid:
      "A reserve is a whole number from 0 to 100. Empty it for none.",
    /** The app's alone: a field and its unit as VoiceOver reads them, one label. */
    fieldWithUnit: (label: string, unit: string) => `${label}, ${unit}`,
    /** The app's alone: a field whose text is not a whole number from 0 to 100. */
    invalid: "Invalid",
  },

  // ── An account's machines (AccountMachines) ───────────────────────────
  machines: {
    /** What a row says where the account is not signed in. */
    state: {
      "signed-out": "Not signed in",
      mismatch: "Signed in as someone else",
      offline: "Offline",
    },
    none: "No machine runs this account's agents yet.",
    signIn: "Sign in",
    sendKey: "Send key",
    /** A sign-in under way, its popover put away: one press opens it again as it was. */
    openSignIn: "Open sign-in",
    pasteCode: "Paste code",
    /** What a row says while its sign-in waits, the popover put away. */
    waitingCode: "Waiting for the code",
    waitingPaste: "Waiting for the pasted code",
    /** The sign-in's label: "Sign in you@x.com on obelisk". */
    signInOn: (verb: string, account: string, machine: string) =>
      `${verb} ${account} on ${machine}`,
    signOut: "Sign out on this machine",
    /** A row's ⋯ menu's subject: "you@x.com on obelisk". */
    accountOn: (account: string, machine: string) => `${account} on ${machine}`,
    /**
     * The app's alone: a sign-out running on its row. A machine's answer
     * takes a moment, and the HIG asks that a wait be shown where it was
     * asked (Feedback); the web's ⋯ menu closes on it and says nothing.
     */
    signingOut: "Signing out…",
    /**
     * The app's alone: the row's sign-in opens under it (a popover on a
     * phone is a sheet, which hides the row it is about), so its button
     * closes it again.
     */
    close: "Close",
    closeOn: (machine: string) => `Close the sign-in on ${machine}`,
  },

  // ── Claude Code's sign-in on a machine (SigninPanel, signin.svelte.ts) ─
  signin: {
    offline: (machine: string) =>
      `${machine} is offline. Sign in there once it's back.`,
    openLink: "Open sign-in link",
    opening: "Opening…",
    thenPaste: "then paste the code",
    codeLabel: "Code from the sign-in page",
    codePlaceholder: "Code",
    done: "Done",
    checking: "Checking…",
    signedInAs: "Signed in as",
    /** Who it signed in as, when the machine did not say. */
    theAccount: "the account",
    mismatch: (machine: string, who: string | null, expected: string | null) =>
      `${machine} signed in as ${who ?? "another account"}, so it signed out again. Sign in as ${expected ?? "this account"} with a new link.`,
    /** A code the machine's login did not take. */
    refused:
      "That code didn't sign the machine in. Open the sign-in link again for a new code.",
    /** Part of the page's code: the machine's login still waits for the whole of it. */
    notWhole:
      "That's only part of the code. Copy all of it from the sign-in page, then paste it again.",
    /** The app's alone: a machine that answered a device code where a link was asked for. */
    notALink:
      "The machine answered a code, not a sign-in link. Update CawCo on it, then start again.",
  },

  // ── A device-code sign-in (DevicePanel, device.svelte.ts) ─────────────
  device: {
    start: "Start sign-in",
    again: "Start again",
    starting: "Starting…",
    copy: "Copy code",
    /** As the web's CopyButton says it, for as long as its check stands. */
    copied: "Copied",
    /** The code as a screen reader hears it. */
    said: (code: string) => `Code ${code}`,
    enterWithin: "Enter it within",
    /** How long is left to enter it: "4:05". */
    countdown: (minutes: number, seconds: number) =>
      `${minutes}:${pad2(seconds)}`,
    expired: "Code expired.",
    mismatch: (machine: string, who: string | null) =>
      `${machine} signed in as ${who ?? "another account"}, so it signed out again.`,
    notACode:
      "The machine answered a sign-in link, not a code. Update CawCo on it, then start again.",
    /** The text answer to a question the provider's sign-in asks. */
    answer: "Continue",
    answering: "Continuing…",
    /** Under a sign-in link: what to paste back once the page is done. */
    linked:
      "Sign in at the link, then paste the code or the address the page ends on.",
  },

  // ── A key account's key (KeyPanel) ────────────────────────────────────
  key: {
    label: "API key",
    placeholder: "Paste the key",
    show: "Show key",
    hide: "Hide key",
    /** The app's alone: the reveal toggle's state, as VoiceOver reads it. */
    shown: "Shown",
    machines: "Machines",
    offline: "Offline",
    send: "Send key",
    sending: "Sending…",
    sent: "Key sent",
    otherKey:
      "That's a different key from this account's; it was taken back off.",
    notTaken: "The machine didn't take the key.",
  },

  // ── Adding an account (AccountSetup) ──────────────────────────────────
  setup: {
    title: "Add account",
    /** An account whose setup was left before it was done, on its row in the list. */
    unfinished: (step: string) => `Setup not finished · ${step}`,
    steps: {
      provider: "Provider",
      signIn: "Sign in",
      nameIt: "Name it",
      yourSessions: "Your sessions",
      delegates: "Delegates",
      atLimit: "At the limit",
      done: "Done",
    },
    stepsLabel: "Steps",
    /** The app's alone: a step's state, as VoiceOver reads it (the web marks the current one `aria-current`). */
    stepPassed: "Done",
    stepCurrent: "Current step",
    back: "Back",
    next: "Continue",
    save: "Save account",
    openAccounts: "Open Accounts",
    chooseFirst: "Choose a provider first.",
    search: "Search providers",
    /** The picker's two groups, by how an account signs in. */
    pickSignin: "Sign in",
    pickKeys: "API keys",
    noMatch: (query: string) => `No provider matches “${query}”`,
    /** Why a row no machine can use is dimmed: "No machine runs OpenCode or pi". */
    noMachineRuns: (harnesses: readonly string[]) =>
      `No machine runs ${harnesses.join(" or ")}`,
    signedIn: "Signed in",
    /** A sign-in that came out as an account the hub already had: the setup carries on with that one. */
    joined: (who: string) =>
      `${who} was already one of your accounts, so this sign-in joined it. Naming it here renames that account.`,
    someoneElse: "Someone else",
    offline: "Offline",
    signIn: "Sign in",
    /** The app's alone: a row's Sign in, as VoiceOver reads it. */
    signInOn: (machine: string) => `Sign in on ${machine}`,
    codeFor: (machine: string) => `Code for ${machine}`,
    pasteCode: "Paste the code",
    mismatch: (machine: string, who: string | null) =>
      `${machine} signed in as ${who ?? "another account"}, so it signed out again. Open the link again and sign in as the account you're adding.`,
    none: (harnesses: string) =>
      `No machine runs ${harnesses} yet. Install it on one, and it shows here.`,
    howItShows: "How it shows",
    nickname: "Nickname",
    optional: "optional",
    nicknamePlaceholder: "Leave empty to use the email",
    /** The app's alone: the nickname field as VoiceOver reads it. */
    nicknameSaid: "Nickname, optional",
    setUp: (first: string, second: string) =>
      `${first} and ${second} are set up`,
    withMoves: (line: string) => `${line} · Moves at the limit`,
  },

  // ── A provider's routing (RoutingEditor, StrategyPicker, OrderList) ───
  routingEditor: {
    /** What the editor's row is, for "That routing is gone". */
    what: "routing",
    title: (provider: string) => `${provider} routing`,
    save: "Save routing",
    whichSessions: "Which sessions",
    yours: "Your sessions",
    delegates: "Delegates",
    /** The strategy a tab has, after its name: "Your sessions · Spread". */
    trail: (strategy: string) => `· ${strategy}`,
    pinnedAccount: "Pinned account",
    /** A card as a screen reader hears it: "Spread: The account with the most headroom". */
    card: (label: string, line: string) => `${label}: ${line}`,
    forks: "Forks stay on their parent’s account, whatever the strategy.",
    order: "Order: drag to change it",
    draggable: "draggable",
    place: (name: string, place: number, count: number) =>
      `${name}, place ${place} of ${count}. Arrow keys move it.`,
    /** The app's alone: VoiceOver moves a row with its Move up and Move down actions, not arrow keys. */
    placeSaid: (name: string, place: number, count: number) =>
      `${name}, place ${place} of ${count}`,
    moveUp: "Move up",
    moveDown: "Move down",
    /** "Pinned to you@gmail.com". */
    pinnedTo: (strategy: string, account: string) =>
      `${strategy} to ${account}`,
    /** "You: Pinned to you@gmail.com · Delegates: Soonest reset". */
    line: (yours: string, delegates: string) =>
      `You: ${yours} · Delegates: ${delegates}`,
  },

  /** The strategies, in the picker's order. */
  strategies: [
    { id: "pinned", label: "Pinned", line: "Always one account" },
    {
      id: "fill-first",
      label: "Fill first",
      line: "In your order; the next when one is blocked",
    },
    {
      id: "spread",
      label: "Spread",
      line: "The account with the most headroom",
    },
    {
      id: "soonest-reset",
      label: "Soonest reset",
      line: "Whose 5-hour window resets first",
    },
  ] satisfies StrategyWords[] as readonly StrategyWords[],

  // ── At the limit (AtLimitBlock) ───────────────────────────────────────
  atLimit: {
    head: "When a session hits its limit and another account is free",
    move: "Move running sessions between accounts",
    wait: "Wait if the window resets within",
    minutes: "minutes",
    over: "Compact it after the move if it’s over",
    kTokens: "k tokens",
    compacts:
      "It files its open items, then Claude Code’s own /compact runs. Stop either like any turn.",
    terms:
      "Moving a conversation between Claude subscriptions is subject to Anthropic’s terms",
  },

  // ── A session at its account's limit: a wait, never a failure (core
  // `stallWords`, `accountMoveWords`, `heldReasonWords`; its row, tab,
  // transcript line and tray chip) ─
  held: {
    /** Its status word, read before its title and on its tab. */
    status: "At its limit",
    /** Whose limit it is: the head of every line that says the wait. */
    at: (account: string) => `At ${account}'s limit`,
    /** Another account frees first and takes it: "moves to Petralab in 1h 19m". */
    movesIn: (to: string, left: string) => `moves to ${to} in ${left}`,
    /** It waits for its own account's reset. */
    resetsIn: (left: string) => `resets in ${left}`,
    /** On its way to `to`, now or at its turn's end. */
    moving: (to: string) => `moving to ${to}…`,
    /** Its move to `to` waits for its work in flight (`work`: "1 command running"). */
    carrying: (to: string, work: string) =>
      `moves to ${to} when its work in flight ends (${work})`,
    /** The cap its carrying move goes by, whatever the work. */
    atTheLatest: (left: string) => `in ${left} at the latest`,
    /** One other account could take it now. */
    fits: (name: string) => `${name} could take it`,
    /** More than one could. */
    fitCount: (count: number) => `${count} accounts could take it`,
    /** A project with Caw off: nothing sends it on past the limit. */
    cawOff: (account: string) => `At ${account}'s limit · Caw is off`,
    /** Its reset has passed: history. */
    continued: (on: string) => `Continued on ${on}`,
    /** The tray chip while it waits for a moment: its status word and the time left. */
    chipIn: (left: string) => `At its limit · ${left}`,
    /** The way out, on the line's second line: to the one account that fits. */
    moveTo: (name: string) => `Move to ${name}`,
    /** …or to one of several, from their list. */
    moveToAnother: "Move to another account",
    /** Why it waits, by its reason, as the line's second line says it. */
    why: {
      full: "No other account can take it now",
      free: (tokens: string) =>
        `Waiting costs nothing: its cache lasts past the reset, and a move would re-read ${tokens} cold`,
      soon: (account: string, tokens: string) =>
        `${account} resets sooner than re-reading ${tokens} elsewhere is worth`,
      off: "Moving at the limit is switched off",
      fork: "A fork stays on the account its origin's cache is on",
      /** No account but its own is signed in where it runs. */
      alone: "No other account is signed in on its machine",
      /** History only: lines a hub stored before admission changed. */
      room: (tokens: string) =>
        `Another account has room, but re-reading ${tokens} there would take more than half of what it has left`,
      /** History only: lines a hub stored while a delegate's work could carry on past its reset. */
      work: "Its work item carries on here after the reset",
      /** Each account that could take it, after the reason: "design could take it, 37% left". */
      fitsLeft: (name: string, left: string) =>
        `${name} could take it, ${left}`,
    },
    /** Why another account didn't take it, or that it could, beside its name. */
    reason: {
      signin: "not signed in here",
      allowed: (by: string) => `not allowed by this ${by}`,
      benched: "benched",
      reserve: (pct: number) => `past its ${pct}% reserve`,
      unread: "limits unread",
      limit: "at its limit",
      backup: "never a backup",
      alone:
        "takes one move at a time until its window is measured, and one is landing there",
      room: (left: string, takes: number) =>
        `${left}, its move takes ${takes}%`,
      runsOut: (left: string, inTime: string) =>
        `${left}, runs out in ${inTime}`,
      fits: (left: string, carries: boolean) =>
        `could take it, ${left}${carries ? ", its cache carrying" : ""}`,
      /** When a benched or limited account is back. */
      back: (left: string) => `, back in ${left}`,
      /** What an account has left: "37% left". */
      left: (pct: number) => `${pct}% left`,
    },
  },

  // ── A delegate stopped on a refused sign-in (delegate_list): a stop at a limit
  // is core `stallWords` ─
  stalled: {
    /** Claude Code refused its account's sign-in, and no other account can take it yet. */
    signedOut: (from: string) =>
      `Stopped: ${from}’s sign-in was refused; continues once an account can take it`,
  },

  // ── The strategy figures (figure.ts) ──────────────────────────────────
  figure: {
    blocked: "blocked",
    full: "full",
    /** A lane's clock: "resets 4h 25m". */
    resets: (time: string) => `resets ${time}`,
    /** A time left: "4h 05m", "12m". */
    time: (hours: number, minutes: number) =>
      hours > 0 ? `${hours}h ${pad2(minutes)}m` : `${minutes}m`,
    /** A window that just reset: the whole of it, ahead. */
    window: "5h",
    policyBelow: "At the limit → the policy below",
    unusedWasted: "What’s unused at reset is wasted, so it goes first.",
    fullSkipped: "A full account is skipped.",
    waits: (minutes: number) => `Waits ${minutes}m for the window to reset`,
    movesWhole: "Moves the whole conversation",
    compacts: "Moves it whole, then compacts it",
    tokens: (k: number) => `${k}k`,
    reread: (k: number) => `re-read ${k}k`,
    compacted: (k: number) => `${k}k compacted`,
  },

  // ── Colours (Swatches) ────────────────────────────────────────────────
  colour: "Colour",
  /** The seven account colours, in the order the swatches offer them. */
  swatches: [
    { hue: "orange", name: "Orange" },
    { hue: "cyan", name: "Cyan" },
    { hue: "green", name: "Green" },
    { hue: "amber", name: "Amber" },
    { hue: "blue", name: "Blue" },
    { hue: "rose", name: "Rose" },
    { hue: "violet", name: "Violet" },
  ] satisfies SwatchWords[] as readonly SwatchWords[],
};
