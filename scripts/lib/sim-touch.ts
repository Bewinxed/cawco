/**
 * A finger in an iOS Simulator, from inside it: Maestro's runner, an XCTest
 * bundle kept up by `xcodebuild test-without-building`, which reads and
 * touches from inside the simulator. It is the one way a touch reaches a page
 * WebKit draws in its web content process: every axe tap, touch and drag
 * first reads the frontmost app through the host's accessibility translator,
 * which reaches only the app's own process, and refuses the tap with "No
 * translation object returned for simulator" (532f5489).
 *
 * The runner dials the simulator's testmanagerd socket: a CawCo workspace's
 * boundary lets that one socket through (boundary.ts `TEST_MANAGER_SOCKET`)
 * and gives Maestro its home in the workspace (paths.ts `workspaceMaestroEnv`).
 * The runner ends with the slot's simulator: mac-slot.sh's keeper ends it as
 * it deletes the simulator, however the probe ends (lib/mac-sim.ts).
 *
 *   const finger = simTouch(udid);
 *   await finger.front();            // "CawCo": starts the runner, reads what stands in front
 *   await finger.touch({ x, y });    // window points
 */

/**
 * Maestro on the Mac: on the JDK Homebrew keeps for it (its `opt` link,
 * which `brew --prefix openjdk` names; `brew` itself cannot run in a
 * workspace), its analytics, update check and analysis notice off, and JDK
 * 26's final-field warning answered after the workspace's own options
 * (MAESTRO_OPTS reaches its `java` line).
 */
const MAESTRO = `JAVA_HOME=/opt/homebrew/opt/openjdk MAESTRO_OPTS="\${MAESTRO_OPTS:-} --enable-final-field-mutation=ALL-UNNAMED" MAESTRO_CLI_NO_ANALYTICS=1 MAESTRO_DISABLE_UPDATE_CHECK=true MAESTRO_CLI_ANALYSIS_NOTIFICATION_DISABLED=true /opt/homebrew/bin/maestro`;
/** What Maestro's CLI prints after its error, before the stack. */
const MAESTRO_STACK = "The stack trace was:";

/** A point in the simulator's window, in points. */
export interface Point {
  x: number;
  y: number;
}

/** Runs `script` in bash; its stdout, or throws with its stderr. */
async function sh(script: string): Promise<string> {
  const child = Bun.spawn(["bash", "-c", `set -euo pipefail\n${script}`], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const [text, err, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  if (code !== 0) {
    throw new Error(`exited ${code}: ${err.trim() || text.trim()}`);
  }
  return text;
}

/** Maestro's runner on simulator `udid`, for app `app`; it starts on its first read. */
export function simTouch(udid: string, app = "dev.cawco.app") {
  // A free port of its own: the default, 22087, is every simulator's.
  const free = Bun.listen({
    hostname: "127.0.0.1",
    port: 0,
    socket: { data: () => undefined },
  });
  const { port } = free;
  free.stop(true);
  let started = false;

  /** The foreground app's name as the runner reads it; the first read starts the runner. */
  const front = async (): Promise<string> => {
    const text = await sh(
      `${MAESTRO} --device ${udid} --driver-host-port ${port} hierarchy --no-reinstall-driver`
    ).catch((error: unknown) => {
      const words = (error instanceof Error ? error.message : String(error))
        .split(MAESTRO_STACK)[0]
        .trim();
      throw new Error(`Maestro's read of the screen failed: ${words}`);
    });
    started = true;
    const whole = JSON.parse(
      text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)
    ) as { children?: { attributes?: Record<string, string> }[] };
    return (
      whole.children?.[0]?.attributes?.accessibilityText || "nothing named"
    );
  };

  /** One of the runner's routes, once it runs. */
  const runner = async (route: string, body: Record<string, unknown>) => {
    if (!started) {
      await front();
    }
    return sh(
      `curl -sS --fail-with-body --max-time 30 -H 'Content-Type: application/json' --data-binary @- http://127.0.0.1:${port}/${route} <<'BODY'\n${JSON.stringify(body)}\nBODY`
    );
  };

  return {
    front,
    /** One finger's tap, the runner's `POST /touch` (where every `tapOn` of Maestro's ends). */
    touch: (at: Point) =>
      runner("touch", { x: Math.round(at.x), y: Math.round(at.y) }),
    /** Types into what has the keyboard, the runner's `POST /inputText` (InputTextRequest: `text`, `appIds`). */
    type: (text: string) => runner("inputText", { text, appIds: [app] }),
    /** One finger from `from` to `to` over `seconds`, the runner's `POST /swipeV2`. */
    swipe: (from: Point, to: Point, seconds: number) =>
      runner("swipeV2", {
        startX: Math.round(from.x),
        startY: Math.round(from.y),
        endX: Math.round(to.x),
        endY: Math.round(to.y),
        duration: seconds,
      }),
  };
}

export type SimTouch = ReturnType<typeof simTouch>;
