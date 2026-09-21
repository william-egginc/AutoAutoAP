/**
 * Utility to trigger a file download in the browser.
 */
export function downloadFile(filename: string, content: string, contentType: string) {
  downloadParts(filename, [content], contentType);
}

/**
 * The same download, from a file supplied in pieces.
 *
 * FOR ANYTHING THAT MIGHT BE LARGE. `new Blob([wholeFile])` needs the whole file as one JS string
 * first, and building that string is itself a full extra copy on top of whatever produced it --
 * three copies of a multi-hundred-megabyte chain table alive at once is what was killing the tab
 * on a big Insane export. An iterable lets the producer yield a chunk at a time and lets each one
 * be collected as soon as the Blob has taken it; the Blob holds the bytes once, and the browser is
 * free to back that with disk rather than the JS heap.
 *
 * The parts are accumulated into an array rather than folded into a growing Blob, which would copy
 * everything seen so far on every chunk and turn a linear job quadratic.
 */
/**
 * A CSV download, with the byte-order mark Excel needs.
 *
 * WITHOUT IT, EXCEL GUESSES — and on a Windows machine it guesses the legacy ANSI codepage, not
 * UTF-8. The chain CSV is full of characters that do not survive that guess: the em dashes and
 * arrows in the header block, and `·` in the inventory line. They arrive as Ã¢Â€Â" and friends,
 * which looks like the export is corrupt when the bytes are perfectly good UTF-8.
 *
 * The BOM is three bytes at the very front and nothing else changes. Every spreadsheet that reads
 * UTF-8 already skips it, and `\uFEFF` at the start of a Blob part is encoded as exactly those
 * three bytes.
 *
 * DOWNLOAD ONLY, deliberately. The same CSV also goes to the collector, where it is scrubbed with
 * a regex and gzipped; a BOM there would sit inside the stored bytes and be served back to anyone
 * parsing them programmatically, for the benefit of a spreadsheet that is not involved.
 */
export function downloadCsv(filename: string, parts: Iterable<BlobPart>) {
  downloadParts(filename, [CSV_BOM, ...parts], 'text/csv;charset=utf-8');
}

/** U+FEFF. One character in JS, three bytes once the Blob encodes it as UTF-8. */
export const CSV_BOM = '\uFEFF';

export function downloadParts(filename: string, parts: Iterable<BlobPart>, contentType: string) {
  const blob = new Blob([...parts], { type: contentType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  // Revoked on the next turn rather than in this one. The browser reads the blob out of the URL
  // after the synthetic click returns, so revoking immediately is a race against that read -- one
  // this codebase has always run and evidently usually won, since the same-tick revoke shipped for
  // a long time. Deferring costs nothing and removes the race; it is a precaution, not a fix for
  // anything measured here.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
