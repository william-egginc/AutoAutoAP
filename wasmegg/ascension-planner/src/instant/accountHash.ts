/**
 * The saved runs' account key: Joo's `hashID` (SHA-256 hex) of the loaded player ID, never the ID.
 */
import { hashID } from '@/lib/storage/db';

export async function accountHash(playerId: string | null | undefined): Promise<string | null> {
  if (!playerId) return null;
  try {
    return await hashID(playerId);
  } catch {
    return null;
  }
}
