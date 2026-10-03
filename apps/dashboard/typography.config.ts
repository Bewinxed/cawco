/**
 * @tailwindcss/typography's own configuration (app.css `@config`): the one
 * change to its rules this app makes, for speed, not for looks.
 *
 * The plugin takes the top margin off whatever follows a rule or a heading
 * with `.prose :where(h2 + *)` and the like: a sibling inside any descendant
 * of the prose root, ending on `*`. Chrome cannot narrow that to the element
 * after the insertion, so every block put into a reply's markdown restyled
 * the whole reply (2,645 elements and 22ms for one paragraph; 9,897 elements
 * and 106ms on a long answer, a frame dropped for every block streamed in).
 * Each size's four `+ *` rules give way to one that names what can follow,
 * with the same declaration: the plugin wraps it in the same
 * `:where(…):not(not-prose)` and writes it after the rules those four beat,
 * so every element ends with the margin it had. Removing the four alone
 * restyled nothing on an insertion (32.8ms to under 0.1ms).
 *
 * It names no `div`. A transcript row is a bare div in virtua's list, so a
 * rule whose subject a bare div matches had Chrome restyle every block of
 * every mounted row whenever a row was put in between two (245–261
 * elements). In this markdown a heading or rule is only ever followed by a
 * div that is one of Streamdown's own blocks — a table's or an alert's
 * wrapper, which take no top margin here, or a fence's `.not-prose` well,
 * which the plugin leaves alone — and it renders no raw HTML, so no
 * `details`, `section` or `aside` ever follows one. A fixture with each of
 * them after h2, h3, h4 and hr kept every top margin, in the transcript and
 * in plain prose.
 */
const FOLLOWS =
  ":is(hr, h2, h3, h4) + :is(p, ul, ol, dl, pre, blockquote, table, figure, img, video, picture, h1, h2, h3, h4, h5, h6, hr)";

/** The plugin's sizes; each carries its own copy of the four rules. */
const SIZES = ["DEFAULT", "sm", "base", "lg", "xl", "2xl"];

export default {
  theme: {
    extend: {
      typography: Object.fromEntries(
        SIZES.map((size) => [
          size,
          {
            css: {
              "hr + *": null,
              "h2 + *": null,
              "h3 + *": null,
              "h4 + *": null,
              [FOLLOWS]: { marginTop: "0" },
            },
          },
        ])
      ),
    },
  },
};
