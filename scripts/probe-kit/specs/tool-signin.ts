/**
 * A tool's own sign-in as a machine capability (core `ToolSpec.signin`,
 * agent tools.ts `probeToolStatus` and tool-signin.ts), driven against a
 * fake `agy` first on the PATH under a scratch HOME (fake-agy.ts), so no
 * Google sign-in is touched:
 *
 * - a. Signed out: the machine's tool report has Antigravity CLI installed
 *   and signed out, in its own words ("authentication required"), within
 *   a few seconds: agy says it and then waits 60 s for a login, and the
 *   read ends where it is said (agent tools.ts `readSignin`), not at the
 *   wait's end, which held the machine's whole tools read for a minute.
 * - b. Begin: the tool's own sign-in starts and its link on
 *   accounts.google.com comes back.
 * - c. A refused code: refused in words with the exit and the screen, the
 *   code never in them; nothing is signed in.
 * - d. A code with no sign-in waiting (the refused one spent it): refused.
 * - e. Begin again, the good code: the answer is the tool's status, signed
 *   in, and the next report says so.
 * - f. A read that says neither: unknown, with the exit and its words.
 * - g. A tool with no sign-in of its own (Claude Code): refused in words.
 * - h. Signed in, the read through the tether's real shell (core tether.ts
 *   `spawnTethered`, a process group of its own): agy's status runs, exits
 *   0, and the report says signed in. Spawned in the agent's group the
 *   tether refused (exit 125) before agy ran, and every read said unknown.
 *
 *   bun scripts/probe-kit/run.ts tool-signin
 */

import {
  beginToolSignin,
  completeToolSignin,
} from "../../../packages/agent/src/tool-signin";
import { probeToolStatus } from "../../../packages/agent/src/tools";
import { TOOL_CATALOG, toolSpec } from "../../../packages/core/src/tools";
import { toolWords } from "../../../packages/core/src/words/tools";
import { fakeAgy } from "../fake-agy";
import type { Kit, Spec } from "../spec";

/**
 * How long a signed-out read may take: agy says it is signed out at once and
 * then waits 60 s for a login (fake-agy.ts), so a read that ends where it is
 * said answers in well under this.
 */
const SIGNED_OUT_READ_MS = 5000;

/** What a call answered, or its error's words. */
const outcome = async <T>(
  run: () => Promise<T>
): Promise<{ ok: true; value: T } | { ok: false; error: string }> => {
  try {
    return { ok: true, value: await run() };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
};

export default {
  group: "The hub and machines",
  name: "tool-signin",
  ownHome:
    "it puts a fake agy in ~/.local/bin and its sign-in state under HOME, which the agent's tool probe reads",
  run: async (kit: Kit) => {
    const { check } = kit;
    const agy = await fakeAgy();
    const spec = toolSpec("antigravity");
    if (!spec) {
      check("the catalog has Antigravity CLI", false);
      return;
    }
    const report = () => probeToolStatus(spec, { fresh: true });

    const asked = performance.now();
    const out = await report();
    const tookMs = performance.now() - asked;
    kit.note(`a: ${JSON.stringify(out)}`);
    check(
      "a. signed out: installed 1.5.0, signed out in its own words",
      out.state === "installed" &&
        out.version === "1.5.0" &&
        out.signin?.state === "signed-out" &&
        (out.signin.detail ?? "")
          .toLowerCase()
          .includes(spec.signin?.signedOut[0] ?? "-"),
      JSON.stringify(out)
    );
    check(
      `a. the read answered within ${SIGNED_OUT_READ_MS / 1000} s, not at the end of agy's wait for a login`,
      tookMs < SIGNED_OUT_READ_MS,
      `${(tookMs / 1000).toFixed(2)} s`
    );

    const begun = await outcome(() => beginToolSignin("antigravity"));
    kit.note(`b: ${JSON.stringify(begun)}`);
    check(
      "b. begin: the tool's own link on accounts.google.com, kept a while",
      begun.ok &&
        new URL(begun.value.url).host === "accounts.google.com" &&
        begun.value.expiresAt > Date.now(),
      JSON.stringify(begun)
    );
    check(
      "b. begin ran the tool's own sign-in, `agy acp --login`",
      JSON.stringify((await agy.runs()).at(-1)) ===
        JSON.stringify(["acp", "--login"])
    );

    const refused = await outcome(() =>
      completeToolSignin("antigravity", "bad-code")
    );
    kit.note(`c: ${JSON.stringify(refused)}`);
    check(
      "c. a refused code: its exit and screen in words, the code never shown, still signed out",
      !refused.ok &&
        refused.error.startsWith(
          toolWords.signinFailed(spec.name, 3, "").slice(0, 40)
        ) &&
        refused.error.includes("That code was not accepted.") &&
        !refused.error.includes("bad-code") &&
        (await report()).signin?.state === "signed-out",
      JSON.stringify(refused)
    );

    const spent = await outcome(() =>
      completeToolSignin("antigravity", "good-code")
    );
    check(
      "d. a code with no sign-in waiting: refused",
      !spent.ok && spent.error === toolWords.signinNotWaiting(spec.name),
      JSON.stringify(spent)
    );

    await beginToolSignin("antigravity");
    const signed = await outcome(() =>
      completeToolSignin("antigravity", "good-code")
    );
    kit.note(`e: ${JSON.stringify(signed)}`);
    check(
      "e. the good code: answered with the tool signed in",
      signed.ok &&
        signed.value.state === "installed" &&
        signed.value.signin?.state === "signed-in",
      JSON.stringify(signed)
    );
    check(
      "e. the next report says signed in",
      (await report()).signin?.state === "signed-in"
    );

    await agy.mode("broken");
    const unread = await report();
    check(
      "f. a read that says neither: unknown, with its exit and words",
      unread.signin?.state === "unknown" &&
        unread.signin.detail ===
          toolWords.signinUnread(spec.name, 2, "something else entirely"),
      JSON.stringify(unread)
    );
    await agy.mode("image");

    const claude = TOOL_CATALOG.find((one) => one.id === "claude");
    const none = await outcome(() => beginToolSignin("claude"));
    check(
      "g. a tool with no sign-in of its own: refused in words",
      !none.ok && none.error === toolWords.signinNone(claude?.name ?? "claude"),
      JSON.stringify(none)
    );

    await agy.signedIn(true);
    await agy.runs();
    const read = await report();
    const ran = await agy.runs();
    check(
      "h. the read runs through the real tether shell: agy's status ran and exited 0, and the report says signed in",
      read.signin?.state === "signed-in" &&
        ran.some(
          (args) => JSON.stringify(args) === JSON.stringify(spec.signin?.status)
        ),
      `${JSON.stringify(read)}; agy ran ${JSON.stringify(ran)}`
    );
  },
} satisfies Spec;
