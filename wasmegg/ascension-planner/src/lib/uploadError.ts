/** A file refused, in words a player can act on (lib/uploadGuard.ts). Its own module so the CSV reader
 *  (lib/csvParse.ts), which the phone page's bundle reaches, pulls in nothing else. */
export class UploadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UploadError';
  }
}
