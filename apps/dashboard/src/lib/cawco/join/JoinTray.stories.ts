/**
 * Connect a machine, reworked (Component Story Format 3, live components):
 * every state of the tray, the designer's A to I, on the owner's own
 * Hetzner box added over SSH by key, each at the desk's dialog (its 512px
 * tray, in a 640px window: the dialog's own width past the phone line) and
 * on a phone's bottom sheet at 390. The tray is the live dialog's own
 * (JoinTray), fed the add as the hub holds it through its fixture
 * (preview/JoinTrayFrame). The meta's args are every story's; a story's
 * own args are what it changes. Flows play on the live instance: the add
 * running on through its steps, then joining, failing or stopping.
 */
import JoinTrayFrame from "./preview/JoinTrayFrame.svelte";
import {
  ADDRESSES,
  doneJob,
  HOST,
  hostKeyChanged,
  JOINED,
  runningAt,
  SSH_KEY,
  signatureFailed,
  signInRefused,
  stoppedJob,
  TARGET,
  WAITING,
} from "./preview/join-fixtures";

export default {
  title: "Connect a machine/States",
  component: JoinTrayFrame,
  args: {
    layout: "desk",
    way: "ssh",
    job: null,
    joined: null,
    addresses: ADDRESSES,
    sshKey: SSH_KEY,
  },
};

const phone = { layout: "phone" };

/** A. Over SSH, the start: the target, its port, and Add machine. */
export const FormSsh = {
  args: { target: TARGET },
  parameters: { viewport: 640 },
};
/** A. Over SSH on the phone: Port under the target, Add machine in the foot. */
export const FormSshPhone = {
  args: { ...phone, target: TARGET },
  parameters: { viewport: 390 },
};

/** B. With one command: the address, the command, waiting for check-in. */
export const FormCommand = {
  args: { way: "command" },
  parameters: { viewport: 640 },
};
/** B. With one command on the phone: the command wraps between its words. */
export const FormCommandPhone = {
  args: { ...phone, way: "command" },
  parameters: { viewport: 390 },
};

/** C. A machine asked to join a hub that requires paired devices: Admit. */
export const Admit = {
  args: { way: "command", waiting: WAITING },
  parameters: { viewport: 640 },
};
/** C. Admit on the phone, full width in the sheet's foot. */
export const AdmitPhone = {
  args: { ...phone, way: "command", waiting: WAITING },
  parameters: { viewport: 390 },
};

/** D. Signing in, before the first step line: nothing has run there yet. */
export const SigningIn = {
  args: { job: runningAt(0) },
  parameters: { viewport: 640 },
};
/** D. Signing in on the phone: the rail alone, Stop in the foot. */
export const SigningInPhone = {
  args: { ...phone, job: runningAt(0) },
  parameters: { viewport: 390 },
};

/** E. Installing, the long middle: the service step 42s in, still going. */
export const Installing = {
  args: { job: runningAt(10), stepElapsed: 42_000 },
  parameters: { viewport: 640 },
};
/** E. Installing on the phone. */
export const InstallingPhone = {
  args: { ...phone, job: runningAt(10), stepElapsed: 42_000 },
  parameters: { viewport: 390 },
};

/** E, played: signed in, the add runs through its ten step lines. */
export const InstallingLive = {
  args: { job: runningAt(0) },
  parameters: { viewport: 640 },
  from: "SigningIn",
  play: async ({
    update,
    userEvent,
  }: {
    update: (next: Record<string, unknown>) => Promise<void>;
    userEvent: { wait: (ms: number) => Promise<void> };
  }) => {
    for (let count = 1; count <= 10; count += 1) {
      // biome-ignore lint/performance/noAwaitInLoops: one step line at a time, as the hub reports them
      await update({ job: runningAt(count) });
      await userEvent.wait(400);
    }
  },
};

/** F. The machine refused the hub's key: asked for a password in place, Retry. */
export const NeedsYou = {
  args: { job: signInRefused() },
  parameters: { viewport: 640 },
};
/** F. Needs you on the phone: Retry in the foot, Change details over it. */
export const NeedsYouPhone = {
  args: { ...phone, job: signInRefused() },
  parameters: { viewport: 390 },
};

/** F. The host key changed: the fix's command to copy, then Retry. */
export const HostKey = {
  args: { job: hostKeyChanged() },
  parameters: { viewport: 640 },
};
/** F. The host key changed, on the phone. */
export const HostKeyPhone = {
  args: { ...phone, job: hostKeyChanged() },
  parameters: { viewport: 390 },
};

/** G. Done: hetzner-1 joined; Open machine, Start session. */
export const Joined = {
  args: { job: doneJob(), joined: JOINED },
  parameters: { viewport: 640 },
};
/** G. Done on the phone: Start session over Open machine. */
export const JoinedPhone = {
  args: { ...phone, job: doneJob(), joined: JOINED },
  parameters: { viewport: 390 },
};

/** G, played: the last step, then the join (the rail closes, Caw, the ways on). */
export const JoinMoment = {
  args: { job: runningAt(10) },
  parameters: { viewport: 640 },
  from: "Installing",
  play: async ({
    update,
  }: {
    update: (next: Record<string, unknown>) => Promise<void>;
  }) => {
    await update({ job: doneJob(), joined: JOINED });
  },
};

/** H. Failed on the release check: its output opened by itself, Retry. */
export const Failed = {
  args: { job: signatureFailed() },
  parameters: { viewport: 640 },
};
/** H. Failed on the phone: the output scrolls inside its box. */
export const FailedPhone = {
  args: { ...phone, job: signatureFailed() },
  parameters: { viewport: 390 },
};

/** I. Stopped after the download: Retry starts it again. */
export const Stopped = {
  args: { job: stoppedJob(7) },
  parameters: { viewport: 640 },
};
/** I. Stopped on the phone. */
export const StoppedPhone = {
  args: { ...phone, job: stoppedJob(7) },
  parameters: { viewport: 390 },
};
/** I. Stopped before signing in: nothing on that machine changed. */
export const StoppedBeforeSignIn = {
  args: { job: stoppedJob(0) },
  parameters: { viewport: 640 },
};

/** Change details from H: the form again, the failure over its fields. */
export const ChangeDetails = {
  args: {
    target: TARGET,
    retry: true,
    formAlert: {
      text: `The step “verifying the release signature” failed on ${TARGET}. Fix what it names, then Retry.`,
      tone: "fail",
    },
  },
  parameters: { viewport: 640 },
};
/** Change details on the phone. */
export const ChangeDetailsPhone = {
  args: {
    ...phone,
    target: TARGET,
    retry: true,
    formAlert: {
      text: `${HOST} did not answer on port 22 (ECONNREFUSED). Check the address and that SSH is running there, then Retry.`,
      tone: "fail",
    },
  },
  parameters: { viewport: 390 },
};
