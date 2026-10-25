/**
 * The page's clock set to tsk16.js NOW, so the hint's age ("1w ago") reads
 * as it did when the preview was made. Imported first by main.js: modules
 * evaluate in import order, so nothing reads the time before this runs.
 * Animations run on the document's timeline, which this leaves alone.
 */
import { NOW } from "./tsk16.js";

const Real = Date;
const offset = NOW - Real.now();
class Fixed extends Real {
  constructor(...args) {
    super(...(args.length === 0 ? [Real.now() + offset] : args));
  }
  static now() {
    return Real.now() + offset;
  }
}
globalThis.Date = Fixed;
