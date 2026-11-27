/**
 * Protobuf's wire format read field by field, with no schema: what CawCo
 * reads of agy's own protobuf files and blobs (agy-store-files.ts
 * `jetbox_summaries_proto.pb`, agy-store.ts `raw_summary`), whose `.proto`
 * agy does not ship.
 */

/** Wire type 0: a varint. */
export const VARINT = 0;
/** Wire type 1: eight bytes. */
const FIXED64 = 1;
/** Wire type 2: a length-delimited field. */
export const LENGTH_DELIMITED = 2;
/** Wire type 5: four bytes. */
const FIXED32 = 5;

/** Reads one protobuf varint of `bytes` at `at`: its value and where the next field begins. */
const varint = (bytes: Uint8Array, at: number): [number, number] => {
  let value = 0;
  let shift = 0;
  let next = at;
  for (;;) {
    const byte = bytes[next];
    if (byte === undefined) {
      throw new Error("a varint runs past the end");
    }
    next += 1;
    value += (byte % 128) * 2 ** shift;
    shift += 7;
    if (byte < 128) {
      return [value, next];
    }
  }
};

/** One field of a message as written: its number, wire type, and where its bytes lie. */
export interface WireField {
  /** A length-delimited field's body; none for any other wire type. */
  readonly body: Uint8Array | undefined;
  /** Its bytes whole, key included: `bytes.subarray(start, end)`. */
  readonly end: number;
  readonly field: number;
  readonly start: number;
  /** A varint field's value; none for any other wire type. */
  readonly value: number | undefined;
  readonly wire: number;
}

/** Each top-level field of message `bytes`, in order. Throws on bytes that are no message (a group, or a field past the end). */
export function* wireFields(bytes: Uint8Array): Generator<WireField> {
  let at = 0;
  while (at < bytes.length) {
    const start = at;
    const [key, afterKey] = varint(bytes, at);
    const wire = key % 8;
    const field = Math.floor(key / 8);
    let value: number | undefined;
    let body: Uint8Array | undefined;
    if (wire === VARINT) {
      [value, at] = varint(bytes, afterKey);
    } else if (wire === LENGTH_DELIMITED) {
      const [size, from] = varint(bytes, afterKey);
      at = from + size;
      if (at > bytes.length) {
        throw new Error("a field runs past the end");
      }
      body = bytes.subarray(from, at);
    } else if (wire === FIXED64) {
      at = afterKey + 8;
    } else if (wire === FIXED32) {
      at = afterKey + 4;
    } else {
      throw new Error(`wire type ${wire} is not read`);
    }
    yield { field, wire, value, body, start, end: at };
  }
}

/** The last field numbered `field` of message `bytes`, as protobuf takes a repeated scalar or message field: none when it holds none. */
export const wireField = (
  bytes: Uint8Array,
  field: number
): WireField | undefined => {
  let found: WireField | undefined;
  for (const one of wireFields(bytes)) {
    if (one.field === field) {
      found = one;
    }
  }
  return found;
};
