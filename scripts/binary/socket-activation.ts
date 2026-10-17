import { dlopen, FFIType, type Pointer, ptr, toArrayBuffer } from "bun:ffi";

/** The first descriptor systemd passes (sd_listen_fds(3) `SD_LISTEN_FDS_START`). */
const SD_LISTEN_FDS_START = 3;
/** sd_listen_fds(3)'s name for a descriptor the service manager named none. */
const UNNAMED = "unknown";
/** launch_activate_socket(3): "[ENOENT] The socket name specified does not exist in the caller's launchd.plist(5)." */
const ENOENT = 2;

/** No socket under a name: `ENOENT`, as the npm socket-activation package throws it, so a wanted socket's absence reads the same on every build. */
const noSocket = (message: string): Error =>
  Object.assign(new Error(message), { code: "ENOENT" });

/**
 * Every listening socket the service manager passed under `name`, in the
 * order its unit names them: one per address the dashboard's socket listens
 * on (cli service.ts `dashboardListens`). systemd passes `LISTEN_FDS`
 * descriptors from 3, each named in `LISTEN_FDNAMES` (sd_listen_fds(3));
 * launchd returns a socket entry's descriptors from launch_activate_socket(3).
 */
function collect(name: string): number[] {
  if (process.platform === "linux") {
    const count = Number(process.env.LISTEN_FDS);
    if (Number(process.env.LISTEN_PID) !== process.pid || !(count > 0)) {
      throw new Error(
        "Dashboard requires the sockets its service manager passes it, and was passed none"
      );
    }
    // A descriptor with no name in LISTEN_FDNAMES is named "unknown"
    // (sd_listen_fds(3), Special names: "The process received no name for the
    // specific file descriptor from the service manager"), never every name.
    const names = process.env.LISTEN_FDNAMES?.split(":") ?? [];
    const fds = Array.from(
      { length: count },
      (_, index) => SD_LISTEN_FDS_START + index
    ).filter((_, index) => (names[index] ?? UNNAMED) === name);
    if (fds.length === 0) {
      throw noSocket(
        `Dashboard was passed no socket named ${name} (LISTEN_FDNAMES=${process.env.LISTEN_FDNAMES})`
      );
    }
    return fds;
  }
  if (process.platform !== "darwin") {
    throw new Error("Socket activation requires Linux or macOS");
  }
  const library = dlopen("/usr/lib/libSystem.B.dylib", {
    launch_activate_socket: {
      args: [FFIType.ptr, FFIType.ptr, FFIType.ptr],
      returns: FFIType.i32,
    },
    free: { args: [FFIType.ptr], returns: FFIType.void },
  });
  const descriptors = new BigUint64Array(1);
  const count = new BigUint64Array(1);
  const error = library.symbols.launch_activate_socket(
    ptr(Buffer.from(`${name}\0`)),
    ptr(descriptors),
    ptr(count)
  );
  if (error === ENOENT) {
    throw noSocket(`launchd holds no socket named ${name} for this job`);
  }
  if (error !== 0) {
    throw new Error(`launch_activate_socket(${name}) failed: errno ${error}`);
  }
  const address = Number(descriptors[0]) as Pointer;
  try {
    const result = [
      ...new Int32Array(toArrayBuffer(address, 0, Number(count[0]) * 4)),
    ];
    if (result.length === 0) {
      throw noSocket(`launchd passed no socket named ${name}`);
    }
    return result;
  } finally {
    library.symbols.free(address);
    library.close();
  }
}
export default { collect };
