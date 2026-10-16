import { stored } from "./storage";

/**
 * DEBUG only: the region a probe names in localStorage `cawco-debug-fault`
 * throws while it renders, so the probe-kit spec `region-boundary` can prove
 * that region's boundary (RegionBoundary) holds it and the rest of the page
 * keeps working. Nothing in the product writes the key; read once per page.
 */
const FAULT = stored("local", "cawco-debug-fault");

/** Throws when the page was told to fail `region`. */
export function debugFault(region: string): void {
  if (FAULT === region) {
    throw new Error(`cawco-debug-fault: the ${region} was told to fail`);
  }
}
