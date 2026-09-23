/**
 * @module lib/charts/tooltip
 * @description Escaping for echarts tooltip formatters.
 *
 * WHY THIS HAS TO EXIST. A tooltip `formatter` returns a STRING, and echarts puts it on the page
 * with `el.innerHTML = content + arrow` (see TooltipHTMLContent.js). `tooltip.renderMode` defaults
 * to `'auto'`, which resolves to `'html'` for a DOM tooltip, so every formatter in this project is
 * building raw HTML whether or not it meant to. A formatter that interpolates a value it did not
 * generate itself is an innerHTML sink.
 *
 * THE VALUE THAT MATTERS IS `nickname`. Submissions carry a free-text nickname — 40 characters,
 * scrubbed by `scrubText`/`scrubIdentifiers` for `EI\d{16}` and nothing else. The explorer builds
 * its series names out of it and reads them back as `params.seriesName`, so before this module a
 * nickname of `<img src=x onerror=…>` was stored XSS against anyone who opened the Chain Explorer
 * and hovered a line. 40 characters is plenty. The collector's own HTML leaderboard already knew
 * this and escapes with its `esc()`; the charts did not.
 *
 * Numbers do not need this and escaping them costs nothing, so the rule is simply that every
 * interpolation in a formatter goes through `esc`. A rule with an exception is a rule someone
 * forgets to apply.
 */

/**
 * Text made safe to interpolate into a tooltip's HTML string.
 *
 * The five characters that matter inside element content and quoted attributes. Anything that is
 * not a string is coerced first, so a formatter can pass an echarts field of uncertain type
 * without a guard at every call site.
 */
export function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
