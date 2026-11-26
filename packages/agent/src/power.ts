/**
 * THIS MACHINE'S SLEEP AND WAKE, AS ITS AGENT HEARS THEM: for work that
 * must not run across a sleep (an update's install, binary-update.ts) and
 * for the desktop's reading (activity.ts, which says asleep only once the
 * person said yes to its report). Heard from the moment the agent starts;
 * nothing of it leaves the machine.
 *
 * - **macOS**: NSWorkspace's `NSWorkspaceWillSleepNotification` and
 *   `NSWorkspaceDidWakeNotification`, heard by a small script on macOS's
 *   own JavaScript bridge (`osascript -l JavaScript`, its ObjC bridge
 *   passing a function where a block is expected), which runs in the
 *   logged-in session the agent runs in.
 * - **Linux**: logind's `PrepareForSleep`, true as the machine suspends and
 *   false as it resumes, heard on the system bus through `gdbus monitor`.
 * - **Every platform, after the fact**: the two clocks drifting apart.
 *   `performance.now()` counts awake time only and `Date.now()` the
 *   wall's, which a sleep moves (core bounded.ts, "Which clock a deadline
 *   counts"): read every {@link GAP_LOOK_MS}, the wall gaining more than
 *   {@link SLEPT_MS} on the awake clock says this process was held across a
 *   sleep (or the wall clock was set, which reads the same and costs a
 *   retry). It is heard where no listener answers (no gdbus, a script that
 *   ended) and for a wake no notification announces (a Mac's dark wake,
 *   which wakes no display). A loop held by its own work moves both clocks
 *   alike, so it is never read as a sleep.
 *
 * Asleep means a sleep was announced and no wake since; a listener that
 * ends says nothing more, so what it last said is let go and the clocks
 * alone are heard.
 */
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { Readable } from "node:stream";
import { spawnTethered, untether } from "@cawco/core/tether";
import { systemProgram } from "@cawco/core/workspace-needs";
import { Effect } from "effect";
import { every } from "./daemon-runtime";
import { resolveBin, toolEnv } from "./tools";

/** What was heard: a sleep announced, a wake announced, or a sleep found after it ended (the clocks). */
export type PowerEvent = "sleep" | "wake" | "slept";

/** This machine's sleep and wake as last heard, and what hears them as they come. */
export interface Power {
  /** Whether a sleep was announced and no wake since. */
  readonly asleep: () => boolean;
  /**
   * The awake time (ms) since the machine last woke: since its last wake,
   * sleep or found sleep; `Infinity` while none was heard since the agent
   * started, which a wake does not do.
   */
  readonly awakeMs: () => number;
  /** `listener` hears each, as it is heard. */
  readonly onChange: (listener: (event: PowerEvent) => void) => () => void;
  /** The listeners that listen now, by name: what activity.ts says it reads. */
  readonly sources: () => string[];
}

/** How often the clocks are compared. */
const GAP_LOOK_MS = 5000;
/**
 * How far the wall's clock may gain on the awake one between two looks
 * before it is a sleep: well past a timer's own lateness and a clock's
 * slew, short of any sleep worth the name.
 */
const SLEPT_MS = 10_000;

/** The one watch, once started ({@link watchPower}). */
let watched: Power | undefined;

/** This machine's sleep and wake: one watch for the process, started at the first ask (daemon.ts asks as it starts). */
export const watchPower = (): Power => {
  watched ??= startWatch();
  return watched;
};

const startWatch = (): Power => {
  const listeners = new Set<(event: PowerEvent) => void>();
  const listening = new Set<string>();
  let asleep = false;
  let wokeAt = Number.NEGATIVE_INFINITY;
  const hear = (event: PowerEvent): void => {
    if (event === "sleep") {
      asleep = true;
    }
    if (event === "wake") {
      asleep = false;
    }
    wokeAt = performance.now();
    for (const listener of listeners) {
      listener(event);
    }
  };
  /** A listener named `name` began, or (`false`) ended: what it last said goes with it. */
  const listens = (name: string, on: boolean): void => {
    if (on) {
      listening.add(name);
      return;
    }
    if (listening.delete(name)) {
      console.warn(
        `[power] ${name} stopped listening: this machine's sleep is heard only from its clocks now`
      );
      asleep = false;
    }
  };
  if (process.platform === "darwin") {
    hearMacSleep(hear, (on) => listens("NSWorkspace sleep", on));
  } else if (process.platform === "linux") {
    hearLogindSleep(hear, (on) => listens("logind PrepareForSleep", on));
  }
  let wall = Date.now();
  let awake = performance.now();
  every(
    "power",
    GAP_LOOK_MS,
    Effect.suspend(() => {
      const wallNow = Date.now();
      const awakeNow = performance.now();
      const gained = wallNow - wall - (awakeNow - awake);
      wall = wallNow;
      awake = awakeNow;
      if (gained > SLEPT_MS) {
        hear("slept");
        return Effect.logInfo(
          `[power] this machine slept about ${Math.round(gained / 1000)} s (its wall clock gained that on its awake clock)`
        );
      }
      return Effect.void;
    })
  );
  return {
    asleep: () => asleep,
    awakeMs: () => performance.now() - wokeAt,
    onChange: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    sources: () => [...listening],
  };
};

/**
 * logind's `PrepareForSleep` as it is announced, through `gdbus monitor` on
 * the system bus: `sleep` as the machine goes to sleep, `wake` as it
 * wakes. `listens(true)` once gdbus says it monitors logind, `listens(false)`
 * when it ends; never when gdbus is not there or the bus refuses it. gdbus
 * runs under core tether.ts, so it ends with the agent; when it ends first,
 * the agent closes the tether's stdin and the tether's reader ends too.
 */
const hearLogindSleep = (
  hear: (event: PowerEvent) => void,
  listens: (on: boolean) => void
): void => {
  const gdbus = resolveBin("gdbus");
  if (!gdbus) {
    return;
  }
  let child: Bun.Subprocess<"pipe", "pipe", "ignore">;
  try {
    // stdin is the agent's end of the pipe whose close ends the listener.
    child = spawnTethered(
      [
        gdbus,
        "monitor",
        "--system",
        "--dest",
        "org.freedesktop.login1",
        "--object-path",
        "/org/freedesktop/login1",
      ],
      { env: toolEnv(), stdout: "pipe", stderr: "ignore" }
    );
  } catch {
    return;
  }
  child.unref();
  const lines = createInterface({ input: Readable.fromWeb(child.stdout) });
  lines.on("line", (line) => {
    if (line.startsWith("Monitoring signals")) {
      listens(true);
    }
    const said = PREPARE_FOR_SLEEP.exec(line);
    if (said) {
      hear(said[1] === "true" ? "sleep" : "wake");
    }
  });
  // gdbus gone first: its stdout's end lets the tether's reader go.
  lines.on("close", () => {
    listens(false);
    untether(child.stdin);
  });
};

const PREPARE_FOR_SLEEP = /PrepareForSleep \((true|false),\)/u;

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
  hear: (event: PowerEvent) => void,
  listens: (on: boolean) => void
): void => {
  const child = spawn(
    systemProgram("osascript"),
    ["-l", "JavaScript", "-e", MAC_SLEEP],
    {
      // stdin is the agent's end of the pipe whose close ends the listener.
      stdio: ["pipe", "pipe", "ignore"],
    }
  );
  child.unref();
  createInterface({ input: child.stdout }).on("line", (line) => {
    if (line === "listening") {
      listens(true);
    } else if (line === "sleep" || line === "wake") {
      hear(line);
    }
  });
  child.on("error", () => undefined);
  child.on("exit", () => listens(false));
};
