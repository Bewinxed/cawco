import { dlopen, FFIType, type Pointer, ptr, toArrayBuffer } from "bun:ffi";

function collect(name: string): number[] {
  if (process.platform === "linux") {
    if (
      Number(process.env.LISTEN_PID) !== process.pid ||
      Number(process.env.LISTEN_FDS) !== 1
    ) {
      throw new Error(
        "Dashboard requires one socket inherited from its service manager"
      );
    }
    return [3];
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
  if (error !== 0) {
    throw new Error(`launch_activate_socket(${name}) failed: errno ${error}`);
  }
  const address = Number(descriptors[0]) as Pointer;
  try {
    const result = [
      ...new Int32Array(toArrayBuffer(address, 0, Number(count[0]) * 4)),
    ];
    if (result.length !== 1) {
      throw new Error(
        `Dashboard requires exactly one inherited socket; got ${result.length}`
      );
    }
    return result;
  } finally {
    library.symbols.free(address);
    library.close();
  }
}
export default { collect };
