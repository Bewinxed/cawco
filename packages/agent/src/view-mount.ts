/**
 * `cawco view-mount`: the mounts of a Linux view of a folder (layer.ts),
 * made inside it. The agent runs it by `nsenter` into the view holder's user
 * and mount namespaces (layer.ts `viewArgv`), which the distro's bwrap made
 * and holds; joining a user namespace grants every capability in it
 * (setns(2)), and nsenter makes that join single-threaded, which the agent
 * itself cannot (a multithreaded process may not setns into a user
 * namespace). It reads the view's mounts as JSON on stdin and makes each in
 * order with mount(2) itself: util-linux `mount` refuses any caller whose
 * real uid is not 0 (libmount context.c `restricted`), and the uid here stays
 * the person's (`--preserve-credentials`).
 *
 * Every source (each overlay's lower, upper and work dir, each bind's path)
 * is opened (`O_PATH`) before the first mount and named by its
 * `/proc/self/fd/<n>`, so it is the host's tree it names: an overlay mounted
 * at F hides what is mounted under F, and the agent's own state when F holds
 * it. Targets are resolved as the view stands at each mount, as bwrap's
 * `--overlay` and `--bind` did (its sources were `/oldroot`'s, its targets
 * the new root's).
 *
 * Answers nothing on success; on a refusal, one sentence on stderr that
 * names its cause and what fixes it, and exit 1.
 */
import { dlopen, FFIType, read } from "bun:ffi";
import { constants, release } from "node:os";

/** One mount of a view: an overlay of `overlay` (its lower dir and mount point), or `bind` bound onto itself from the host's tree. */
export type ViewMount =
  { overlay: string; upper: string; work: string } | { bind: string };

/** open(2) flags on x86_64 and aarch64 (asm-generic/fcntl.h `O_PATH` 010000000, `O_CLOEXEC` 02000000). */
const O_PATH = 0x20_00_00;
const O_CLOEXEC = 0x8_00_00;
/** mount(2) flags (linux/mount.h). */
const MS_BIND = 4096;
const MS_REC = 16_384;

/** The first Linux that mounts an overlay in a user namespace: "allows non-privileged users to make use of Overlayfs" (kernelnewbies.org/Linux_5.11). */
const USERNS_OVERLAY: readonly [number, number] = [5, 11];

const libc = dlopen("libc.so.6", {
  open: { args: [FFIType.ptr, FFIType.i32], returns: FFIType.i32 },
  mount: {
    args: [FFIType.ptr, FFIType.ptr, FFIType.ptr, FFIType.u64, FFIType.ptr],
    returns: FFIType.i32,
  },
  __errno_location: { args: [], returns: FFIType.ptr },
}).symbols;

/** `text` as C reads it: the buffer itself is passed, so it lives through the call. */
const c = (text: string): Buffer => Buffer.from(`${text}\0`);

/** errno as its name (`EPERM`), read right after the call that set it. */
const errnoName = (): string => {
  const at = libc.__errno_location();
  const code = at ? read.i32(at, 0) : 0;
  return (
    Object.entries(constants.errno).find(([, value]) => value === code)?.[0] ??
    `errno ${code}`
  );
};

/** `path` opened where the host's tree has it, as a path mount(2) follows to it. */
const sourceOf = (path: string): string => {
  // biome-ignore lint/suspicious/noBitwiseOperators: open(2) takes its flags or'd
  const fd = libc.open(c(path), O_PATH | O_CLOEXEC);
  if (fd < 0) {
    throw new Error(`${path} could not be opened: ${errnoName()}`);
  }
  return `/proc/self/fd/${fd}`;
};

const kernelBelowFloor = (): boolean => {
  const [major = 0, minor = 0] = release().split(".").map(Number);
  const [floorMajor, floorMinor] = USERNS_OVERLAY;
  return major < floorMajor || (major === floorMajor && minor < floorMinor);
};

/** The sentence for mount(2)'s `errno` at `at`: its cause and what fixes it. */
const refusal = (at: string, errno: string, overlay: boolean): string => {
  const instead =
    "or delegate in a git repository, whose workspace is a clone of its own";
  if (errno === "EPERM" && overlay && kernelBelowFloor()) {
    return `${at} could not be layered: this machine runs Linux ${release()}, and a user's own overlay mount needs Linux ${USERNS_OVERLAY.join(".")} or later. Upgrade the kernel, ${instead}.`;
  }
  if (errno === "EPERM") {
    return `${at} could not be mounted in the view: Linux ${release()} refused CawCo's mount in the view's user namespace: a security module (AppArmor, SELinux) or a seccomp filter on the agent denies mount(2) there. Allow the agent's user to mount in a user namespace of its own, ${instead}.`;
  }
  if (errno === "ENODEV" && overlay) {
    return `${at} could not be layered: this machine's kernel has no overlay filesystem. Load it with \`sudo modprobe overlay\` (and name \`overlay\` in /etc/modules-load.d to keep it), ${instead}.`;
  }
  return `${at} could not be mounted in the view: mount(2) said ${errno}.`;
};

/** One mount as mount(2) takes it: its sources already opened ({@link sourceOf}). */
interface Call {
  at: string;
  data: string | null;
  flags: number;
  source: string;
  type: string | null;
}

const callOf = (mount: ViewMount): Call =>
  "bind" in mount
    ? {
        at: mount.bind,
        data: null,
        // biome-ignore lint/suspicious/noBitwiseOperators: mount(2) takes its flags or'd
        flags: MS_BIND | MS_REC,
        source: sourceOf(mount.bind),
        type: null,
      }
    : {
        at: mount.overlay,
        // The words bwrap's `--overlay` builds (bubblewrap.c), its paths the opened sources.
        data: `lowerdir=${sourceOf(mount.overlay)},upperdir=${sourceOf(mount.upper)},workdir=${sourceOf(mount.work)},userxattr`,
        flags: 0,
        source: "overlay",
        type: "overlay",
      };

/** Makes `mounts` in order, every source opened before the first is made. */
const mountAll = (mounts: readonly ViewMount[]): void => {
  const calls = mounts.map(callOf);
  for (const call of calls) {
    const made = libc.mount(
      c(call.source),
      c(call.at),
      call.type === null ? null : c(call.type),
      call.flags,
      call.data === null ? null : c(call.data)
    );
    if (made !== 0) {
      throw new Error(refusal(call.at, errnoName(), call.type === "overlay"));
    }
  }
};

try {
  mountAll((await Bun.stdin.json()) as ViewMount[]);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
