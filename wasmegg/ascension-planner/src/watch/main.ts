/**
 * The run watcher (watch.html): the "Stepping away?" box's second option (StepAwayOptions.vue).
 *
 * NO VUE, NO PINIA, NO SIMULATOR: it imports search/stepAway.ts alone, so it stays a few KB and
 * cannot itself be what runs the machine out of memory. The run tab writes a heartbeat into this
 * site's localStorage on every black-box beat (composables/useStepAway.ts); this page reads it. If
 * the run is marked running and the heartbeat is over 2 minutes old, it opens the run's page again
 * (the same address, hash route included), which carries on by itself.
 *
 * Hidden tabs' timers are clamped to about once a minute in Chromium, so this checks every 30 s and
 * expects to be woken less often. A BroadcastChannel message or a storage event also wakes it.
 *
 * Popups: a hidden tab opening another without a click is a popup, and blocked unless the player
 * allows popups for the site. When `window.open` comes back empty, this tab navigates to the run's
 * page itself instead: the run still carries on, but nothing is watching it any more.
 */
import {
  CHANNEL,
  WATCHER_SEEN_KEY,
  agoShort,
  clock12,
  heartbeatAge,
  lastHour,
  nextReopenAllowedAt,
  readRunMark,
  watchVerdict,
  writeRunMark,
} from '@/search/stepAway';

const statusEl = document.getElementById('status')!;
const detailEl = document.getElementById('detail')!;
const reopensEl = document.getElementById('reopens')!;

function show(text: string, tone: 'ok' | 'warn' | 'done', detail = ''): void {
  statusEl.textContent = text;
  statusEl.className = tone;
  detailEl.textContent = detail;
  const m = readRunMark();
  const recent = m ? lastHour(m.reopens, Date.now()) : [];
  reopensEl.replaceChildren(
    ...recent.map(t => {
      const li = document.createElement('li');
      li.textContent = `Reopened at ${clock12(t)}.`;
      return li;
    })
  );
  document.title = `${text.split('.')[0]} - Run watcher`;
}

/** Opens the run's page again; false when the browser blocked it and this tab is going there. */
function reopen(url: string): boolean {
  // Counted before opening, so a second watcher tab (or a slow open) can't double it.
  const m = readRunMark();
  if (!m) return true;
  const now = Date.now();
  writeRunMark({ ...m, reopens: [...lastHour(m.reopens, now), now] });
  let opened: Window | null = null;
  try {
    opened = window.open(url, '_blank');
  } catch {
    opened = null;
  }
  if (!opened) {
    show('Pop-ups are blocked, so this tab is opening the run page itself.', 'warn', 'Watching stops here.');
    window.location.href = url;
    return false;
  }
  return true;
}

/** A run that ended before this tab opened is history, not news: this tab is waiting for the next. */
const openedAt = Date.now();

function check(): void {
  const now = Date.now();
  try {
    localStorage.setItem(WATCHER_SEEN_KEY, String(now));
  } catch {
    // the run tab just can't tell a watcher is open
  }
  const m = readRunMark();
  const ended = !!m && m.status !== 'running' && (m.endedAt ?? 0) < openedAt;
  const v = ended ? 'idle' : watchVerdict(m, now);
  const age = m ? agoShort(heartbeatAge(m, now)) : '';
  switch (v) {
    case 'idle':
      show(
        'Not watching anything yet.',
        'done',
        'Start a run with "Watch this run from a second tab" ticked, and this tab will watch it.'
      );
      return;
    case 'watching':
      show('Watching.', 'ok', `Last heartbeat ${age} ago.`);
      return;
    case 'reopen':
      if (reopen(m!.url))
        show(
          `Reopened the run at ${clock12(now)}.`,
          'warn',
          `It had been quiet for ${age}. It should carry on by itself.`
        );
      return;
    case 'guarded':
      show(
        'The run has gone quiet again.',
        'warn',
        `It was reopened 3 times in the last hour, so this tab won't reopen it again until ${clock12(nextReopenAllowedAt(m!.reopens, now))}. Last heartbeat ${age} ago.`
      );
      return;
    case 'finished':
      show('The run finished. You can close this tab.', 'done');
      return;
    case 'stopped':
      show('The run was stopped. You can close this tab.', 'done');
      return;
    case 'closed':
      show('The run page was closed or reloaded, so there is nothing to reopen. You can close this tab.', 'done');
      return;
    case 'stuck':
      show(
        "The run couldn't carry on by itself, so this tab has stopped watching.",
        'done',
        'Open the planner and carry it on by hand.'
      );
      return;
  }
}

check();
setInterval(check, 30_000);
window.addEventListener('storage', e => {
  // Not the watcher's own key: two watcher tabs would wake each other for ever.
  if (e.key === null || (e.key.startsWith('aap.stepAway.') && e.key !== WATCHER_SEEN_KEY)) check();
});
try {
  const channel = new BroadcastChannel(CHANNEL);
  channel.onmessage = () => check();
} catch {
  // no BroadcastChannel: the timer and storage events are enough
}
document.addEventListener('visibilitychange', check);
