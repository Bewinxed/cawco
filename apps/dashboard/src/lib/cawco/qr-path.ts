/**
 * Encode a URI as QR modules and return an SVG path of unit squares.
 * Used by PhoneQr and PasskeyQr to draw the same kind of crisp,
 * ink-coloured QR on a raised surface.
 */
import { encode } from "uqr";

export interface QrCode {
  /** An SVG `d` of unit-square modules. */
  path: string;
  /** The total side length including the quiet zone. */
  size: number;
}

export function qrPath(uri: string): QrCode {
  const { data, size } = encode(uri, { ecc: "M", border: 2 });
  let path = "";
  data.forEach((row, y) => {
    row.forEach((on, x) => {
      if (on) {
        path += `M${x} ${y}h1v1h-1z`;
      }
    });
  });
  return { path, size };
}
