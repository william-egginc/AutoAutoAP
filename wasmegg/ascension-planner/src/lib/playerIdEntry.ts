/**
 * The player ID box, our side of it (QA's R7 red team, finding 4). The box is the shared ui/components/PlayerIdForm.vue
 * (not ours to change), whose check (lib/schema PlayerIdSchema) takes "EI" in upper case only: a lower-case "ei…"
 * left Load disabled with no message. App.vue listens around the form, in the capture phase, so these run before the
 * form reads the box: the "EI" is upper-cased as it is typed, and a whole lower-case ID pasted loads as one in upper
 * case would. Upstream, the shared check could do this itself (see notes/spec-r7redteam-a.md).
 */
import { PlayerIdSchema } from 'lib/schema';

/** The box's element id in the shared form. */
const BOX_ID = 'playerId';

/** `text` with the "EI" of an ID being typed upper-cased ("ei", "ei12", "mk2!ei…", spaces around); anything else as it is. */
export function upperCaseIdPrefix(text: string): string {
  return text.replace(/^(\s*(?:mk2!)?)ei(?=\d*\s*$)/i, '$1EI');
}

/** What the input handler touches of the box (an HTMLInputElement in the page). */
type BoxLike = { id?: string; value: string; selectionStart?: number | null; setSelectionRange?: (a: number, b: number) => void };

/** The box's input event, before the form reads it: the "EI" upper-cased, the caret where it was (the same length). */
export function idInputUpperCase(e: { target: unknown }): void {
  const box = e.target as BoxLike | null;
  if (!box || box.id !== BOX_ID || typeof box.value !== 'string') return;
  const next = upperCaseIdPrefix(box.value);
  if (next === box.value) return;
  const at = box.selectionStart;
  box.value = next;
  if (typeof at === 'number') box.setSelectionRange?.(at, at);
}

type PasteLike = {
  target: unknown;
  clipboardData?: { getData: (type: string) => string } | null;
  preventDefault: () => void;
  stopPropagation: () => void;
};

/**
 * A paste into the box: a whole ID with a lower-case "ei" is the ID to load (upper case), and the paste goes no
 * further (the form would paste it as text). Anything else, an upper-case ID included (the form's own load on
 * paste), is left to the form: null.
 */
export function idPasteUpperCase(e: PasteLike): string | null {
  const box = e.target as { id?: string } | null;
  if (!box || box.id !== BOX_ID) return null;
  const text = (e.clipboardData?.getData('text') ?? '').trim();
  if (PlayerIdSchema.safeParse(text).success) return null;
  const id = upperCaseIdPrefix(text);
  if (!PlayerIdSchema.safeParse(id).success) return null;
  e.preventDefault();
  e.stopPropagation();
  return id;
}
