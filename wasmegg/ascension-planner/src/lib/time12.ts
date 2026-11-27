/**
 * 12-hour text for the By Egg Day time box (R11, Jordan 21 Nov 2026: forced 12-hour text, not the browser's own picker).
 * The screen keeps "HH:MM" (24-hour, lib/byDateForm.ts); this shows and reads the 12-hour form.
 */
const HM = /^([01]?\d|2[0-3]):([0-5]\d)$/;

/** "09:00" → "9:00 AM"; '' for anything that is not an HH:MM time. */
export function formatTime12(hhmm: string): string {
  const m = HM.exec(String(hhmm ?? '').trim());
  if (!m) return '';
  const h = Number(m[1]);
  return `${h % 12 || 12}:${m[2]} ${h < 12 ? 'AM' : 'PM'}`;
}

/** What a person types ("9am", "9:00 PM", "9.30 pm", "21:00") → "HH:MM"; null when it is not a time. */
export function parseTime12(text: string): string | null {
  const t = String(text ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  const twelve = /^(\d{1,2})(?:[:.](\d{2}))? ?([ap])\.?m?\.?$/.exec(t);
  if (twelve) {
    const h = Number(twelve[1]);
    const min = Number(twelve[2] ?? '0');
    if (h < 1 || h > 12 || min > 59) return null;
    const h24 = (h % 12) + (twelve[3] === 'p' ? 12 : 0);
    return `${String(h24).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
  }
  const m = HM.exec(t);
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : null;
}
