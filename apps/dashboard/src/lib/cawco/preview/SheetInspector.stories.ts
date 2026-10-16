/**
 * The inspector's sheet (Component Story Format 3, live components): the
 * real SheetInspector, mounted by CawCo's stage, on StatTile's sheet as the
 * stage reads it (its props are docgen's answer for StatTile.svelte). Each
 * story is a state the person meets: beside the page on a desk, over its
 * foot on a phone, with a change not saved, with props the stage could not
 * read, and with a write refused. The decorator stands the inspector in a
 * well the size of a desk's pane (a phone's for Phone), as the pane does.
 */
import type { SheetOnPage } from "@cawco/core/stage";
import Card from "#lib/components/ui/card/card.svelte";
import Inspector from "./SheetInspector.svelte";
import { SheetInspector } from "./sheet-inspector.svelte";

/** StatTile's sheet as its stage reads it. */
const STAT_TILE: SheetOnPage = {
  file: "src/lib/cawco/StatTile.stories.ts",
  stories: [
    {
      name: "Spend",
      line: 15,
      column: 14,
      args: {},
      code: {},
      component: null,
    },
    {
      name: "Live",
      line: 18,
      column: 14,
      args: { label: "Running", value: 3, unit: "sessions", tone: "live" },
      code: {},
      component: null,
    },
  ],
  meta: {
    args: { label: "Spend today", value: "4.20", unit: "USD" },
    code: {},
    component: "src/lib/cawco/StatTile.svelte",
  },
  components: [
    {
      file: "src/lib/cawco/StatTile.svelte",
      name: "StatTile",
      types: "checked",
      props: [
        {
          name: "action",
          type: { name: "slot", raw: "Snippet<[]>" },
          required: false,
          defaultValue: null,
          description: null,
        },
        {
          name: "label",
          type: { name: "string", raw: "string" },
          required: true,
          defaultValue: null,
          description: null,
        },
        {
          name: "tone",
          type: {
            name: "enum",
            raw: '"neutral" | "live" | "attn" | "done" | "fail"',
          },
          required: false,
          defaultValue: '"neutral"',
          description:
            "A status pair the figure takes (a drawn view's tile); none by default.",
          options: ["neutral", "live", "attn", "done", "fail"],
        },
        {
          name: "unit",
          type: { name: "string", raw: "string" },
          required: false,
          defaultValue: null,
          description: null,
        },
        {
          name: "value",
          type: { name: "string", raw: "string | number" },
          required: true,
          defaultValue: null,
          description: null,
        },
      ],
    },
  ],
};

/** An inspector on `sheet`, its story `chosen`, writes answered by `write`. */
const inspector = (
  sheet: SheetOnPage = STAT_TILE,
  chosen = "Live",
  write: () => Promise<unknown> = () => Promise.resolve({})
) => {
  const one = new SheetInspector(() => undefined, write);
  one.heard(sheet);
  one.choose(chosen);
  return one;
};

/** One with a change not saved: Live's tone made done. */
const edited = () => {
  const one = inspector();
  const tone = STAT_TILE.components[0]?.props.find(
    (prop) => prop.name === "tone"
  );
  if (tone) {
    one.set(tone, "done");
  }
  return one;
};

/** One whose Save the stage refused, in its words. */
const refused = () => {
  const one = edited();
  one.problem =
    'tone takes one of "neutral", "live", "attn", "done", "fail"; "blue" is none of them. Nothing was written.';
  return one;
};

/** The well the inspector stands in, a desk's pane by default. */
const well = (width: number, height: number) => () => ({
  Component: Card,
  props: {
    class: "relative overflow-hidden p-0",
    style: `inline-size: ${width}px; block-size: ${height}px`,
  },
});

const desk = [well(720, 600)];

export default {
  component: Inspector,
  args: { layout: "panel", onclose: () => undefined },
};

/** Beside the page on a desk: Live's props, the variant its list, the slot a pin. */
export const Desk = { args: { inspector: inspector() }, decorators: desk };

/** Over the page's foot on a phone. */
export const Phone = {
  args: { inspector: inspector(), layout: "sheet" },
  decorators: [well(390, 640)],
};

/** A change not saved: Save and Discard stand ready, the story marked edited. */
export const Edited = { args: { inspector: edited() }, decorators: desk };

/** Props the stage could not read: said, never hidden. */
export const Unknown = {
  args: {
    inspector: inspector(
      {
        ...STAT_TILE,
        components: [
          {
            file: "src/lib/cawco/StatTile.svelte",
            name: "StatTile",
            types: "unknown",
            props: [],
            note: "Types unknown: add TypeScript to the project (or type the props with JSDoc and add TypeScript), and its checker reads them.",
          },
        ],
      },
      "Spend"
    ),
  },
  decorators: desk,
};

/** A write the stage refused: its sentence under the buttons. */
export const Refused = { args: { inspector: refused() }, decorators: desk };
