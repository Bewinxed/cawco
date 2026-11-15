/**
 * Web Bluetooth LE scanning for the FIDO caBLE advert (service UUID 0xFFF9),
 * run from a page context (the offscreen document, or the popup): a service
 * worker has no `navigator.bluetooth`.
 */

/** The FIDO caBLE service UUID, 0xFFF9, in the long form Web Bluetooth keys service data by. */
const FIDO_SERVICE_UUID = "0000fff9-0000-1000-8000-00805f9b34fb";

/** A caBLE advert's service data is exactly this many bytes. */
const ADVERT_BYTES = 20;

/** What the person does when Chrome has no `requestLEScan`. */
export const FLAG_INSTRUCTION =
  "Enable chrome://flags/#enable-experimental-web-platform-features and restart Chrome";

/** The experimental scan API, which `lib.dom` does not type. */
interface LEScanOptions {
  filters: { services: (number | string)[] }[];
  keepRepeatedDevices: boolean;
}
interface LEScan {
  stop(): void;
}
interface AdvertisementEvent extends Event {
  rssi?: number;
  serviceData: Map<string, DataView>;
}
interface ScanningBluetooth extends EventTarget {
  requestLEScan?: (options: LEScanOptions) => Promise<LEScan>;
}

/** An advert as the hub takes it (core `BrowserPasskeyAdvertArgs`). */
export interface CapturedAdvert {
  /** ms epoch when the advert was captured. */
  capturedAt: number;
  rssi: number;
  /** The 20 service-data bytes, base64. */
  serviceData: string;
}

export type ScanStart =
  | { ok: true; stop: () => void }
  | { ok: false; reason: "flag" | "failed"; detail: string };

const base64 = (bytes: Uint8Array): string => {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
};

/** Starts the scan; `onAdvert` hears each 0xFFF9 advert that carries 20 bytes of service data. */
export async function startScan(
  onAdvert: (advert: CapturedAdvert) => void
): Promise<ScanStart> {
  const bluetooth = (navigator as { bluetooth?: ScanningBluetooth }).bluetooth;
  if (!bluetooth || typeof bluetooth.requestLEScan !== "function") {
    return { ok: false, reason: "flag", detail: FLAG_INSTRUCTION };
  }
  const listener = (event: Event) => {
    const { serviceData, rssi } = event as AdvertisementEvent;
    const data = serviceData.get(FIDO_SERVICE_UUID);
    if (data?.byteLength !== ADVERT_BYTES) {
      return;
    }
    onAdvert({
      serviceData: base64(
        new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
      ),
      rssi: rssi ?? 0,
      capturedAt: Date.now(),
    });
  };
  bluetooth.addEventListener("advertisementreceived", listener);
  try {
    const scan = await bluetooth.requestLEScan({
      filters: [{ services: [0xff_f9] }],
      keepRepeatedDevices: true,
    });
    return {
      ok: true,
      stop: () => {
        scan.stop();
        bluetooth.removeEventListener("advertisementreceived", listener);
      },
    };
  } catch (error) {
    bluetooth.removeEventListener("advertisementreceived", listener);
    return {
      ok: false,
      reason: "failed",
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}
