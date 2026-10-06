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
 * Separate processes: the run page opens this tab with `noopener`, and this tab reopens the run with
 * `noopener` too. A tab opened WITH its opener shares the opener's renderer process in Chromium, so
 * the crash this tab exists to catch would take it down as well (and a reopened run would share this
 * tab's process, so a second crash would kill both).
 *
 * Popups: a hidden tab opening another without a click is a popup, and blocked unless the player
 * allows popups for the site. With `noopener`, `window.open` returns null either way, so the reopened
 * page says it loaded instead (RUN_PAGE_KEY, written by every planner page as it starts). When it
 * hasn't within REOPEN_CONFIRM_MS, this tab navigates to the run's page itself: the run still carries
 * on, but nothing is watching it any more.
 */
import {
  CHANNEL,
  REOPEN_CONFIRM_MS,
  RUN_PAGE_KEY,
  STALE_MS,
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

function runPageSeenAt(): number {
  try {
    return Number(localStorage.getItem(RUN_PAGE_KEY)) || 0;
  } catch {
    return 0;
  }
}

/** Opens the run's page again, in a process of its own (`noopener`). */
function reopen(url: string): void {
  // Counted before opening, so a second watcher tab (or a slow open) can't double it.
  const m = readRunMark();
  if (!m) return;
  const now = Date.now();
  writeRunMark({ ...m, reopens: [...lastHour(m.reopens, now), now] });
  try {
    window.open(url, '_blank', 'noopener');
  } catch {
    // blocked outright: the check below finds no page
  }
  // `noopener` gives no handle back, blocked or not: the page itself says it loaded.
  setTimeout(() => {
    if (runPageSeenAt() >= now) return;
    show('Pop-ups are blocked, so this tab is opening the run page itself.', 'warn', 'Watching stops here.');
    window.location.href = url;
  }, REOPEN_CONFIRM_MS);
}

/** A run that ended before this tab opened is history, not news: this tab is waiting for the next. */
const openedAt = Date.now();

/** Another watcher tab was already open: this one stands down (and closes, where it may). */
let standDown = false;

function check(): void {
  if (standDown) return;
  const now = Date.now();
  try {
    localStorage.setItem(WATCHER_SEEN_KEY, String(now));
  } catch {
    // the run tab just can't tell a watcher is open
  }
  const m = readRunMark();
  const ended = !!m && m.status !== 'running' && (m.endedAt ?? 0) < openedAt;
  const v = ended ? 'idle' : watchVerdict(m, now, STALE_MS, openedAt);
  const age = m ? agoShort(heartbeatAge(m, now)) : '';
  switch (v) {
    case 'idle':
      show(
        'Not watching anything yet.',
        'done',
        'Start a run with "Watch this run from a second tab" ticked, and this tab will watch it.'
      );
      return;
    case 'waiting':
      show(
        'Waiting for a run to start.',
        'done',
        `The last run here went quiet ${age} ago, before this tab opened, so this tab won't reopen it. Carry it on in the planner, and this tab will watch it.`
      );
      return;
    case 'watching':
      show('Watching.', 'ok', `Last heartbeat ${age} ago.`);
      return;
    case 'reopen':
      reopen(m!.url);
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
  // Each click on "Open the watcher tab" opens a new tab (with `noopener` there is no named tab to
  // bring back), so a second watcher asks whether one is already watching, and if so closes itself.
  const me = Math.random().toString(36).slice(2);
  const channel = new BroadcastChannel(CHANNEL);
  let asking = true;
  setTimeout(() => (asking = false), 1500);
  channel.onmessage = (e: MessageEvent<{ type?: string; id?: string } | null>) => {
    const d = e.data;
    if (d?.type === 'watcher-hello') {
      // Only an established watcher answers: two opened together would otherwise both stand down.
      if (d.id !== me && !standDown && !asking) channel.postMessage({ type: 'watcher-here', id: me });
      return;
    }
    if (d?.type === 'watcher-here') {
      if (d.id !== me && asking && !standDown) {
        standDown = true;
        statusEl.textContent = 'A watcher tab is already open, so this one is not needed. You can close it.';
        statusEl.className = 'done';
        detailEl.textContent = '';
        reopensEl.replaceChildren();
        document.title = 'Already watching - Run watcher';
        window.close();
      }
      return;
    }
    check();
  };
  channel.postMessage({ type: 'watcher-hello', id: me });
} catch {
  // no BroadcastChannel: the timer and storage events are enough
}
document.addEventListener('visibilitychange', check);
