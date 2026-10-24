/**
 * Values the design proposes that the house tokens don't hold yet, drawn in
 * this preview only while the design is unpicked (as the design graph draws
 * its proposed hues). Each says where it would go.
 */

/**
 * proposed; the token moves to 160 if picked: the phone step's QR at the
 * report's 160px (design e791c712, §4.2), in place of --c-address-qr (112px)
 * inside the preview's phone object. 160 wherever the tray stands at its
 * 380; only where the page squeezes the desk column below that (a 320
 * window) does it give way, down to 96, so the steps beside it keep room for
 * a whole address (the phone object is its container).
 */
export const PROPOSED_QR = "clamp(96px, 100cqi - 172px, 160px)";
