/**
 * WebSocket frames read off a raw byte stream (RFC 6455 §5.2), for a relay
 * a spec puts between an agent and its hub: each frame whole, its opcode,
 * and its payload unmasked.
 */

/**
 * Where the first WebSocket frame in `bytes` ends, and where its mask and
 * payload start (RFC 6455 §5.2); null until it has come whole.
 */
const frameAt = (
  bytes: Buffer
): { end: number; mask: number | null; payload: number } | null => {
  if (bytes.length < 2) {
    return null;
  }
  const second = bytes[1] as number;
  // biome-ignore lint/suspicious/noBitwiseOperators: the frame's length is the second byte's low seven bits
  const short = second & 0x7f;
  // biome-ignore lint/suspicious/noBitwiseOperators: its mask bit is the second byte's high bit
  const masked = (second & 0x80) !== 0;
  const sizes: Record<number, [number, () => number]> = {
    126: [4, () => bytes.readUInt16BE(2)],
    127: [10, () => Number(bytes.readBigUInt64BE(2))],
  };
  const [head, read] = sizes[short] ?? [2, () => short];
  if (bytes.length < head) {
    return null;
  }
  const payload = head + (masked ? 4 : 0);
  const end = payload + read();
  return bytes.length < end
    ? null
    : { end, mask: masked ? head : null, payload };
};

/** Two bytes XORed: how a frame's key unmasks it. */
// biome-ignore lint/suspicious/noBitwiseOperators: unmasking is a byte-wise XOR with the frame's key
const xor = (a: number, b: number): number => a ^ b;

/** A frame's payload, unmasked: a client masks every frame (RFC 6455 §5.3). */
const unmasked = (frame: Buffer, mask: number | null, at: number): Buffer => {
  const payload = Buffer.from(frame.subarray(at));
  if (mask !== null) {
    for (let index = 0; index < payload.length; index += 1) {
      payload[index] = xor(
        payload[index] as number,
        frame[mask + (index % 4)] as number
      );
    }
  }
  return payload;
};

/** One frame off the stream: its bytes, its opcode and its payload. */
export interface WsFrame {
  frame: Buffer;
  /** RFC 6455 §5.2: 0x8 and up a control frame (close, ping, pong). */
  opcode: number;
  payload: Buffer;
}

/** A ping (RFC 6455 §5.5.2). */
export const PING = 0x9;

/** Splits a stream into whole frames as its bytes come. */
export const frames = () => {
  let buffered = Buffer.alloc(0);
  return (data: Buffer): WsFrame[] => {
    buffered = Buffer.concat([buffered, data]);
    const out: WsFrame[] = [];
    for (let at = frameAt(buffered); at; at = frameAt(buffered)) {
      const frame = Buffer.from(buffered.subarray(0, at.end));
      out.push({
        frame,
        // biome-ignore lint/suspicious/noBitwiseOperators: the opcode is the first byte's low four bits
        opcode: (frame[0] as number) & 0x0f,
        payload: unmasked(frame, at.mask, at.payload),
      });
      buffered = buffered.subarray(at.end);
    }
    return out;
  };
};
