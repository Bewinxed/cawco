/**
 * Transparent huge pages off for this process and every process it starts,
 * imported first by each of CawCo's own entry points (the binary's, the CLI's,
 * the agent's, the hub's, sessiond's, and the probe kit's, which starts stage
 * hosts of its own). Every other CawCo process descends from one of them:
 * stage hosts, boundary hosts, sessions and their tools.
 *
 * Why: a stage host runs the project's Vite, whose bundler (rolldown's native
 * binding, with its own mimalloc v3) madvises each 1 GiB arena
 * `MADV_HUGEPAGE`. Under the kernel's default `defrag=madvise` a fault in
 * such a region compacts memory synchronously (docs.kernel.org
 * admin-guide/mm/transhuge.rst: "madvise: will enter direct reclaim like
 * `always` but only for regions that are have used madvise(MADV_HUGEPAGE)"),
 * which raises memory PSI on a machine with plenty free, and a session's
 * start then waits on that reading (machine-room.ts). On obelisk
 * on 2026-10-20 the stage hosts held 0.25 to 2.1 GiB of AnonHugePages each.
 *
 * `prctl(PR_SET_THP_DISABLE, 1, 0, 0, 0)` with flags 0 "will disable THPs
 * completely for the process, irrespective of global THP controls or
 * MADV_COLLAPSE", and it "is inherited by a child created via fork(2) and is
 * preserved across execve(2)" (man7.org PR_SET_THP_DISABLE(2const)), so one
 * call covers every allocator in the tree, whichever library madvises.
 * Linux 3.15 and later; macOS has no transparent huge pages.
 */
import { dlopen, FFIType } from "bun:ffi";

/** `PR_SET_THP_DISABLE`, from `<linux/prctl.h>`. */
const PR_SET_THP_DISABLE = 41;

if (process.platform === "linux") {
  const { prctl } = dlopen("libc.so.6", {
    prctl: {
      args: [FFIType.i32, FFIType.u64, FFIType.u64, FFIType.u64, FFIType.u64],
      returns: FFIType.i32,
    },
  }).symbols;
  if (prctl(PR_SET_THP_DISABLE, 1, 0, 0, 0) !== 0) {
    process.stderr.write(
      "cawco: the kernel refused prctl(PR_SET_THP_DISABLE), so this process and its children keep transparent huge pages\n"
    );
  }
}
