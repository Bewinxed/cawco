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
 */
const FOLLOWS =
  ":is(hr, h2, h3, h4) + :is(p, ul, ol, dl, pre, blockquote, table, figure, img, video, picture, h1, h2, h3, h4, h5, h6, hr, div, details, section, aside)";

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
