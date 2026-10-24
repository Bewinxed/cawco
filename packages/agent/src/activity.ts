/**
 * THIS MACHINE'S DESKTOP, AS THE PERSON USES IT: in use, idle, locked or
 * asleep, and how long since the last keyboard or pointer input. It rides
 * every heartbeat (`activity`) and a beat of its own when the state changes,
 * and only once the person said yes to this machine's report: until then,
 * and from the moment they turn it off, nothing is read (the hub's
 * `reportActivity` on each beat's answer, daemon.ts). Only the state word
 * and the idle time leave the machine, never what the person does.
 *
 * Each is read from the platform's own source, nothing of ours in between:
 *
 * - **Idle, Linux on Wayland**: the compositor's ext-idle-notify-v1, the
 *   protocol for "clients to monitor user idle status" (wayland.app), which
 *   KWin, sway, Hyprland, niri and COSMIC speak; version 2's
 *   `get_input_idle_notification` where offered, which "ignores idle
 *   inhibitors, … only input from the user, e.g. from a keyboard or mouse,
 *   counts as activity", else version 1's. KDE answers nothing else on
 *   Wayland: its `GetSessionIdleTime` replies "GetSessionIdleTime is not
 *   supported on this platform" (kscreenlocker interface.cpp), and "logind's
 *   IdleHint is never set by Plasma" (github.com/danilofalcao/kidle). Spoken
 *   with `wayland-client`, a pure JavaScript client over the socket.
 * - **Idle, GNOME**: Mutter has no ext-idle-notify (wayland.app's support
 *   table), so its `org.gnome.Mutter.IdleMonitor.GetIdletime` on the
 *   session bus, in ms.
 * - **Idle, Linux on X11**: `org.freedesktop.ScreenSaver.GetSessionIdleTime`.
 * - **Lock, Linux**: logind's `LockedHint` on the person's graphical session
 *   (their user's `Display`), which desktops "keep up to date to allow
 *   applications to easily track session's Lock status" (systemd 42d35e1);
 *   KDE's lock screen sets it on lock and unlock (kscreenlocker ksldapp.cpp
 *   `m_logind->setLocked(true)`).
 * - **Sleep, Linux**: logind's `PrepareForSleep(true)`, heard on the system
 *   bus through `gdbus monitor`: asleep is said the moment it is announced.
 * - **Idle, macOS**: CoreGraphics' `CGEventSourceSecondsSinceLastEventType`
 *   for any input in the combined session state, through Bun's FFI.
 * - **Lock, macOS**: `CGSSessionScreenIsLocked` in the console user's
 *   session, as `ioreg -n Root -d1` lists IOConsoleUsers.
 * - **Sleep, macOS**: NSWorkspace's `NSWorkspaceWillSleepNotification` and
 *   `NSWorkspaceDidWakeNotification`, heard by a small script on macOS's own
 *   JavaScript bridge (`osascript -l JavaScript`, its ObjC bridge passing a
 *   function where a block is expected), which runs in the logged-in
 *   session the agent runs in. Asleep is said once the script says it
 *   listens; before that, and wherever it cannot, a Mac that stops beating
 *   is unknown to the hub, its last input still counting.
 *
 * A machine with none of these (no graphical session, a desktop that answers
 * none) has no activity, said once in the log, and its beats carry none.
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  type MachineActivity,
  type MachineState,
  presenceLogWords,
} from "@cawco/core";
import { Display, type Wl_interface } from "wayland-client";
import coreProtocol from "wayland-client/protocol/wayland.json" with { type: "json" };
import { resolveBin, toolEnv } from "./tools";

/** How often the polled sources are read. Our call: a lock or a return shows within 5 s. */
const LOOK_MS = 5000;
/**
 * Idle after this long without input: the threshold Chromium's Idle
 * Detection holds as its least (60 s), so a tab and a machine agree.
 */
export const IDLE_AFTER_MS = 60_000;
/** How long a D-Bus call may take before its read counts as none. */
const CALL_MS = 3000;

/**
 * ext-idle-notify-v1 (wayland-protocols staging), as wayland-client reads a
 * protocol: version 2's two notifier requests and the notification's two
 * events.
 */
const IDLE_NOTIFY = [
  {
    name: "ext_idle_notifier_v1",
    version: 2,
    description: "",
    summary: "idle notification manager",
    requests: [
      {
        name: "destroy",
        type: "destructor",
        description: "",
        summary: "destroy the manager",
        args: [],
      },
      {
        name: "get_idle_notification",
        description: "",
        summary: "create a notification object",
        args: [
          {
            name: "id",
            type: "new_id",
            interface: "ext_idle_notification_v1",
            summary: "",
          },
          { name: "timeout", type: "uint", summary: "" },
          { name: "seat", type: "object", interface: "wl_seat", summary: "" },
        ],
      },
      {
        name: "get_input_idle_notification",
        since: 2,
        description: "",
        summary: "create a notification object",
        args: [
          {
            name: "id",
            type: "new_id",
            interface: "ext_idle_notification_v1",
            summary: "",
          },
          { name: "timeout", type: "uint", summary: "" },
          { name: "seat", type: "object", interface: "wl_seat", summary: "" },
        ],
      },
    ],
    events: [],
    enums: {},
  },
  {
    name: "ext_idle_notification_v1",
    version: 2,
    description: "",
    summary: "idle notification",
    requests: [
      {
        name: "destroy",
        type: "destructor",
        description: "",
        summary: "destroy the notification object",
        args: [],
      },
    ],
    events: [
      {
        name: "idled",
        description: "",
        summary: "notification object is idle",
        args: [],
      },
      {
        name: "resumed",
        description: "",
        summary: "notification object is no longer idle",
        args: [],
      },
    ],
    enums: {},
  },
];

/**
 * The core protocol with wl_registry.bind's one `new_id` spelled out as the
 * wire carries it (interface, version, id), as wayland-client's own `init`
 * does: its `init` reads the protocol file from disk, which a compiled agent
 * does not have, so the bundled copy is loaded here instead.
 */
const CORE = (
  coreProtocol as { name: string; requests: { args: unknown[] }[] }[]
).map((itf) =>
  itf.name === "wl_registry"
    ? {
        ...itf,
        requests: itf.requests.map((request, opcode) =>
          opcode === 0
            ? {
                ...request,
                args: [
                  { name: "id", type: "uint", summary: "" },
                  { name: "interface", type: "string", summary: "" },
                  { name: "version", type: "uint", summary: "" },
                  { name: "id", type: "new_id", summary: "" },
                ],
              }
            : request
        ),
      }
    : itf
);

/** The compositor's connection: wayland-client's display, opened from the bundled protocol. */
class Compositor extends Display {
  async open(): Promise<void> {
    await this.load(CORE);
    await this.load(IDLE_NOTIFY);
    const display = this.registerInterface(1, "wl_display") as Wl_interface & {
      get_registry: () => Promise<Wl_interface>;
      sync: () => Promise<void>;
    };
    this._bindRegistry(await display.get_registry());
    await display.sync();
  }
}

/** What reads the idle time: since when the person has been idle, or undefined while they are not. */
interface IdleSource {
  /** Lets go of what it holds open (a compositor connection), when it holds any. */
  readonly close?: () => void;
  readonly name: string;
  /** The idle time now, ms; undefined when it could not be read. */
  readonly read: () => Promise<number | undefined>;
}

/** A D-Bus call's answer through `busctl --json=short`: its `data`, or undefined. */
const busctl = (args: readonly string[]): Promise<unknown[] | undefined> =>
  new Promise((resolve) => {
    const bin = resolveBin("busctl");
    if (!bin) {
      resolve(undefined);
      return;
    }
    const child = spawn(bin, ["--json=short", ...args], {
      env: toolEnv(),
      stdio: ["ignore", "pipe", "ignore"],
      timeout: CALL_MS,
    });
    let out = "";
    child.stdout.on("data", (chunk: Buffer) => {
      out += chunk.toString("utf8");
    });
    child.on("error", () => resolve(undefined));
    child.on("close", (code) => {
      if (code !== 0) {
        resolve(undefined);
        return;
      }
      try {
        const answer = JSON.parse(out) as { data?: unknown };
        resolve(Array.isArray(answer.data) ? answer.data : [answer.data]);
      } catch {
        resolve(undefined);
      }
    });
  });

/** The Wayland socket the agent's session names: `$XDG_RUNTIME_DIR/$WAYLAND_DISPLAY`. */
const waylandSocket = (): string | undefined => {
  const runtime =
    process.env.XDG_RUNTIME_DIR ??
    (process.getuid ? `/run/user/${process.getuid()}` : undefined);
  const name = process.env.WAYLAND_DISPLAY ?? "wayland-0";
  if (!runtime) {
    return;
  }
  const path = name.startsWith("/") ? name : join(runtime, name);
  return existsSync(path) ? path : undefined;
};

/**
 * The compositor's input idle (ext-idle-notify-v1): one notification at
 * {@link IDLE_AFTER_MS}; idled means idle since then less the threshold,
 * resumed means in use. Undefined when the socket or the global is not there.
 */
const waylandIdle = async (): Promise<IdleSource | undefined> => {
  const path = waylandSocket();
  if (!path) {
    return;
  }
  const { connect } = await import("node:net");
  const socket = connect(path);
  const opened = await new Promise<boolean>((resolve) => {
    socket.once("connect", () => resolve(true));
    socket.once("error", () => resolve(false));
  });
  if (!opened) {
    socket.destroy();
    return;
  }
  const compositor = new Compositor(socket);
  let lost: string | undefined;
  compositor.on("error", (error: Error) => {
    lost = error.message;
  });
  compositor.on("close", () => {
    lost ??= "the compositor closed the connection";
  });
  try {
    await compositor.open();
    const globals = new Set(compositor.listGlobals());
    if (!(globals.has("ext_idle_notifier_v1") && globals.has("wl_seat"))) {
      await compositor.close();
      return;
    }
    const seat = await compositor.bind("wl_seat", 1);
    const notifier = (await compositor.bind(
      "ext_idle_notifier_v1"
    )) as Wl_interface & {
      get_idle_notification: (
        timeout: number,
        seat: Wl_interface
      ) => Promise<Wl_interface>;
      get_input_idle_notification: (
        timeout: number,
        seat: Wl_interface
      ) => Promise<Wl_interface>;
    };
    const input = notifier.version >= 2;
    const notification = await (input
      ? notifier.get_input_idle_notification(IDLE_AFTER_MS, seat)
      : notifier.get_idle_notification(IDLE_AFTER_MS, seat));
    let idledAt: number | undefined;
    notification.on("idled", () => {
      idledAt = Date.now();
    });
    notification.on("resumed", () => {
      idledAt = undefined;
    });
    return {
      name: `ext-idle-notify-v1 v${notifier.version}${input ? " (input idle)" : ""}`,
      close: () => {
        compositor.close().catch(() => undefined);
        socket.destroy();
      },
      read: () => {
        if (lost !== undefined) {
          return Promise.resolve(undefined);
        }
        return Promise.resolve(
          idledAt === undefined ? 0 : Date.now() - idledAt + IDLE_AFTER_MS
        );
      },
    };
  } catch {
    socket.destroy();
  }
};

/** Mutter's idle monitor (GNOME), in ms. */
const mutterIdle = async (): Promise<IdleSource | undefined> => {
  const args = [
    "--user",
    "call",
    "org.gnome.Mutter.IdleMonitor",
    "/org/gnome/Mutter/IdleMonitor/Core",
    "org.gnome.Mutter.IdleMonitor",
    "GetIdletime",
  ];
  const first = await busctl(args);
  if (typeof first?.[0] !== "number") {
    return;
  }
  return {
    name: "org.gnome.Mutter.IdleMonitor",
    read: async () => {
      const [ms] = (await busctl(args)) ?? [];
      return typeof ms === "number" ? ms : undefined;
    },
  };
};

/** The X11 screensaver's idle time (KDE and Xfce on X11), in ms. */
const x11Idle = async (): Promise<IdleSource | undefined> => {
  const args = [
    "--user",
    "call",
    "org.freedesktop.ScreenSaver",
    "/org/freedesktop/ScreenSaver",
    "org.freedesktop.ScreenSaver",
    "GetSessionIdleTime",
  ];
  const first = await busctl(args);
  if (typeof first?.[0] !== "number") {
    return;
  }
  return {
    name: "org.freedesktop.ScreenSaver.GetSessionIdleTime",
    read: async () => {
      const [ms] = (await busctl(args)) ?? [];
      return typeof ms === "number" ? ms : undefined;
    },
  };
};

/**
 * The person's graphical session as logind names it: their user's
 * `Display`, which "encodes which graphical session should be used as the
 * primary UI display for the user" (org.freedesktop.login1(5)); its object
 * path, or undefined. An agent run as a user service is in no session of
 * its own, so it asks by its user.
 */
const logindSession = async (): Promise<string | undefined> => {
  const uid = process.getuid?.();
  if (uid === undefined) {
    return;
  }
  const [user] =
    (await busctl([
      "--system",
      "call",
      "org.freedesktop.login1",
      "/org/freedesktop/login1",
      "org.freedesktop.login1.Manager",
      "GetUser",
      "u",
      String(uid),
    ])) ?? [];
  if (typeof user !== "string") {
    return;
  }
  const [display] =
    (await busctl([
      "--system",
      "get-property",
      "org.freedesktop.login1",
      user,
      "org.freedesktop.login1.User",
      "Display",
    ])) ?? [];
  const path = Array.isArray(display) ? display[1] : undefined;
  return typeof path === "string" && path !== "/" ? path : undefined;
};

/** logind's `LockedHint` on that session; undefined when it could not be read. */
const lockedHint = async (session: string): Promise<boolean | undefined> => {
  const [locked] =
    (await busctl([
      "--system",
      "get-property",
      "org.freedesktop.login1",
      session,
      "org.freedesktop.login1.Session",
      "LockedHint",
    ])) ?? [];
  return typeof locked === "boolean" ? locked : undefined;
};

/**
 * The tether `gdbus monitor` runs under, as `sh -c TETHER sh gdbus …`. gdbus
 * reads no stdin, so it cannot watch the agent itself; the shell does. It
 * starts gdbus in the background and hands its own stdout to it alone
 * (`exec … >/dev/null`, so the pipe the agent reads closes when gdbus
 * exits). A background `cat` reads the shell's stdin, the agent's end of a
 * pipe, until end of file, which is when the agent is gone however it ended
 * (a SIGKILL included); the shell waits on it, then ends gdbus. The stdin
 * goes to `cat` as fd 3 because dash(1): "If the shell is not interactive,
 * the standard input of an asynchronous command is set to /dev/null". `cat`
 * runs in the background so a signal to the shell ends gdbus at once:
 * POSIX `wait`: "When the shell is waiting, by means of the wait utility,
 * for asynchronous commands to complete, the reception of a signal for
 * which a trap has been set shall cause the wait utility to return
 * immediately with an exit status >128, immediately after which the trap
 * associated with that signal shall be taken"
 * (pubs.opengroup.org/onlinepubs/9799919799/utilities/V3_chap02.html §2.12).
 *
 * Not `setpriv --pdeathsig`: PR_SET_PDEATHSIG(2const) "will be sent when
 * that thread terminates …, rather than after all of the threads in the
 * parent process terminate", the thread that forked the child, which the
 * agent's runtime chooses and does not promise to be its main one.
 */
const TETHER = `trap 'kill "$monitor" "$reader" 2>/dev/null; exit 0' HUP INT TERM
"$@" </dev/null & monitor=$!
exec 3<&0 >/dev/null
cat <&3 >/dev/null & reader=$!
wait "$reader"
kill "$monitor" 2>/dev/null`;

/**
 * logind's `PrepareForSleep` as it is announced, through `gdbus monitor` on
 * the system bus: `going` true as the machine goes to sleep, false as it
 * wakes. `listening` once gdbus says it monitors logind; never when gdbus
 * is not there or the bus refuses it. gdbus runs under {@link TETHER}, so it
 * ends with the agent; when it ends first, the agent closes the tether's
 * stdin and the tether ends too.
 */
export const hearSleep = (
  onSleep: (going: boolean) => void,
  listening: () => void
): (() => void) => {
  const gdbus = resolveBin("gdbus");
  if (!gdbus) {
    return () => undefined;
  }
  const child = spawn(
    "/bin/sh",
    [
      "-c",
      TETHER,
      "sh",
      gdbus,
      "monitor",
      "--system",
      "--dest",
      "org.freedesktop.login1",
      "--object-path",
      "/org/freedesktop/login1",
    ],
    {
      env: toolEnv(),
      // stdin is the agent's end of the pipe whose close ends the listener.
      stdio: ["pipe", "pipe", "ignore"],
    }
  );
  child.unref();
  child.stdin.on("error", () => undefined);
  child.stdout.on("end", () => child.stdin.end());
  let carry = "";
  child.stdout.on("data", (chunk: Buffer) => {
    const lines = (carry + chunk.toString("utf8")).split("\n");
    carry = lines.pop() ?? "";
    for (const line of lines) {
      if (line.startsWith("Monitoring signals")) {
        listening();
      }
      const said = PREPARE_FOR_SLEEP.exec(line);
      if (said) {
        onSleep(said[1] === "true");
      }
    }
  });
  child.on("error", () => undefined);
  // Closing the tether's stdin ends it and the listener with it.
  return () => child.stdin.end();
};

const PREPARE_FOR_SLEEP = /PrepareForSleep \((true|false),\)/;

/** macOS: CoreGraphics' seconds since any input in the combined session state. */
const macIdle = async (): Promise<IdleSource | undefined> => {
  try {
    const { dlopen, FFIType } = await import("bun:ffi");
    const graphics = dlopen(
      "/System/Library/Frameworks/CoreGraphics.framework/CoreGraphics",
      {
        CGEventSourceSecondsSinceLastEventType: {
          args: [FFIType.i32, FFIType.u32],
          returns: FFIType.f64,
        },
      }
    );
    // kCGEventSourceStateCombinedSessionState = 0, kCGAnyInputEventType = ~0.
    const seconds = () =>
      graphics.symbols.CGEventSourceSecondsSinceLastEventType(0, 0xff_ff_ff_ff);
    if (!Number.isFinite(seconds())) {
      return;
    }
    return {
      name: "CGEventSourceSecondsSinceLastEventType",
      read: () => Promise.resolve(Math.round(seconds() * 1000)),
    };
  } catch {
    // No CoreGraphics to open: this Mac has no idle source.
  }
};

/**
 * macOS's sleep and wake, from NSWorkspace's notification centre, through
 * `osascript -l JavaScript`: the script prints `listening` once both
 * observers stand, then `sleep` or `wake` as each is posted. It exits when
 * its stdin reads end of file, which is when the agent that holds the pipe's
 * other end is gone however it ended (a SIGKILL included): a listener with
 * no agent to tell is never left running. (JXA hands NSData's `length` back
 * as a string, hence the `Number`.)
 */
const MAC_SLEEP = `ObjC.import("AppKit");
ObjC.import("stdlib");
const out = $.NSFileHandle.fileHandleWithStandardOutput;
const say = (word) => out.writeData($(word + "\\n").dataUsingEncoding($.NSUTF8StringEncoding));
const center = $.NSWorkspace.sharedWorkspace.notificationCenter;
center.addObserverForNameObjectQueueUsingBlock("NSWorkspaceWillSleepNotification", $(), $.NSOperationQueue.mainQueue, () => say("sleep"));
center.addObserverForNameObjectQueueUsingBlock("NSWorkspaceDidWakeNotification", $(), $.NSOperationQueue.mainQueue, () => say("wake"));
const input = $.NSFileHandle.fileHandleWithStandardInput;
$.NSNotificationCenter.defaultCenter.addObserverForNameObjectQueueUsingBlock("NSFileHandleReadCompletionNotification", input, $.NSOperationQueue.mainQueue, (note) => {
  if (Number(note.userInfo.objectForKey("NSFileHandleNotificationDataItem").length) === 0) $.exit(0);
  input.readInBackgroundAndNotify;
});
input.readInBackgroundAndNotify;
say("listening");
$.NSRunLoop.currentRunLoop.run;`;

const hearMacSleep = (
  onSleep: (going: boolean) => void,
  listening: () => void
): (() => void) => {
  const child = spawn(
    "/usr/bin/osascript",
    ["-l", "JavaScript", "-e", MAC_SLEEP],
    {
      // stdin is the agent's end of the pipe whose close ends the listener.
      stdio: ["pipe", "pipe", "ignore"],
    }
  );
  child.unref();
  let carry = "";
  child.stdout.on("data", (chunk: Buffer) => {
    const lines = (carry + chunk.toString("utf8")).split("\n");
    carry = lines.pop() ?? "";
    for (const line of lines) {
      if (line === "listening") {
        listening();
      } else if (line === "sleep" || line === "wake") {
        onSleep(line === "sleep");
      }
    }
  });
  child.on("error", () => undefined);
  // Its stdin closing ends the script.
  return () => child.stdin.end();
};

/** macOS: whether the console user's screen is locked, as `ioreg` lists IOConsoleUsers. */
const macLocked = (): Promise<boolean | undefined> =>
  new Promise((resolve) => {
    const child = spawn("/usr/sbin/ioreg", ["-n", "Root", "-d1"], {
      stdio: ["ignore", "pipe", "ignore"],
      timeout: CALL_MS,
    });
    let out = "";
    child.stdout.on("data", (chunk: Buffer) => {
      out += chunk.toString("utf8");
    });
    child.on("error", () => resolve(undefined));
    child.on("close", (code) => {
      if (code !== 0 || !out.includes("IOConsoleUsers")) {
        resolve(undefined);
        return;
      }
      resolve(
        out.includes('"CGSSessionScreenIsLocked"=Yes') ||
          out.includes('"kCGSSessionOnConsoleKey"=No')
      );
    });
  });

/** The state a reading says: asleep and locked first, then idle past the threshold. */
const stateOf = (
  idleMs: number,
  locked: boolean,
  asleep: boolean
): MachineState => {
  if (asleep) {
    return "asleep";
  }
  if (locked) {
    return "locked";
  }
  return idleMs >= IDLE_AFTER_MS ? "idle" : "active";
};

/** This machine's activity: the last reading, and what hears it change. */
export interface Activity {
  /** The activity as last read; undefined when this machine has no source. */
  readonly now: () => MachineActivity | undefined;
  /** `listener` hears each change of state, the moment it is read. */
  readonly onChange: (
    listener: (activity: MachineActivity) => void
  ) => () => void;
  /** Stops reading: every source let go, nothing read or said after. */
  readonly stop: () => void;
}

/**
 * This machine has a desktop its agent could read (a Mac, or a Linux
 * graphical session), said on every beat whether or not it reads it, so
 * the presence menu can offer its switch. It reads nothing of the desktop.
 */
export const desktopReadable = (): boolean =>
  process.platform === "darwin" ||
  (process.platform === "linux" &&
    (process.env.WAYLAND_DISPLAY !== undefined ||
      process.env.DISPLAY !== undefined ||
      process.env.XDG_SESSION_TYPE === "wayland" ||
      process.env.XDG_SESSION_TYPE === "x11"));

/**
 * Starts reading this machine's desktop every {@link LOOK_MS}, from the
 * sources its platform has (see the module's head), once the person said
 * yes to this machine's report (the hub's `reportActivity`); `stop` lets
 * every source go when they turn it off.
 */
export const watchActivity = async (): Promise<Activity> => {
  const listeners = new Set<(activity: MachineActivity) => void>();
  let last: MachineActivity | undefined;
  const none: Activity = {
    now: () => undefined,
    onChange: () => () => undefined,
    stop: () => undefined,
  };
  /** What the reading holds open, let go of on `stop`. */
  const held: (() => void)[] = [];
  let stopped = false;

  /** The platform's idle source, found again when the one in hand stops answering. */
  let find: () => Promise<IdleSource | undefined> = () =>
    Promise.resolve(undefined);
  let lock: (() => Promise<boolean | undefined>) | undefined;
  let lockName = "";
  let asleep = false;
  let sleepName: string | undefined;

  if (process.platform === "darwin") {
    find = macIdle;
    lock = macLocked;
    lockName = "ioreg IOConsoleUsers";
    held.push(
      hearMacSleep(
        (going) => {
          asleep = going;
          look().catch(() => undefined);
        },
        () => {
          sleepName = "NSWorkspace sleep";
        }
      )
    );
  } else if (process.platform === "linux") {
    const wayland =
      process.env.XDG_SESSION_TYPE === "wayland" ||
      process.env.WAYLAND_DISPLAY !== undefined;
    find = wayland
      ? async () => (await waylandIdle()) ?? (await mutterIdle())
      : x11Idle;
    const session = await logindSession();
    if (session) {
      lock = () => lockedHint(session);
      lockName = `logind LockedHint (${session})`;
    }
    held.push(
      hearSleep(
        (going) => {
          asleep = going;
          look().catch(() => undefined);
        },
        () => {
          sleepName = "logind PrepareForSleep";
        }
      )
    );
  }

  let idle = await find();
  if (!idle) {
    console.warn(
      `[activity] this machine's desktop is not read: no idle source answered (${process.platform}${process.env.XDG_SESSION_TYPE ? `, ${process.env.XDG_SESSION_TYPE}` : ""}${process.env.XDG_CURRENT_DESKTOP ? `, ${process.env.XDG_CURRENT_DESKTOP}` : ""})`
    );
    for (const release of held) {
      release();
    }
    return none;
  }
  const sourceOf = (reading: IdleSource): string =>
    [reading.name, lock ? lockName : undefined, sleepName]
      .filter(Boolean)
      .join(" + ");
  console.info(presenceLogWords.reading(sourceOf(idle)));

  const look = async (): Promise<void> => {
    if (stopped) {
      return;
    }
    const [idleMs, locked] = await Promise.all([
      idle ? idle.read() : Promise.resolve(undefined),
      lock ? lock() : Promise.resolve(false),
    ]);
    if (idleMs === undefined) {
      // Stopped answering (the compositor restarted): nothing is said of
      // the desktop until a source answers again.
      if (last !== undefined) {
        console.warn(
          `[activity] ${idle?.name ?? "the idle source"} stopped answering; looking for it again`
        );
      }
      last = undefined;
      idle = await find();
      return;
    }
    const state = stateOf(idleMs, locked ?? false, asleep);
    const changed = state !== last?.state;
    const source = idle ? sourceOf(idle) : "";
    last = { state, idleMs, source };
    if (changed) {
      console.info(
        `[activity] ${state} (idle ${Math.round(idleMs / 1000)}s, ${source})`
      );
      for (const listener of listeners) {
        listener(last);
      }
    }
  };

  const looking = setInterval(() => {
    look().catch(() => undefined);
  }, LOOK_MS);
  looking.unref();
  await look();

  return {
    now: () => (stopped ? undefined : last),
    onChange: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    stop: () => {
      stopped = true;
      clearInterval(looking);
      listeners.clear();
      idle?.close?.();
      for (const release of held) {
        release();
      }
      console.info(presenceLogWords.notRead);
    },
  };
};
