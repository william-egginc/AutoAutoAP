// Post a saved payload.json + table.csv the way the planner's sendSubmission does: /submit, then
// the gzipped, scrubbed table to /csv with the one-time upload token. Drops `run` (PC harness speed
// is not browser speed and would skew the Explorer's time estimates).
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
const BASE = 'https://ascension-chain-collector.williamthe5thc.workers.dev';
for (const dir of process.argv.slice(2)) {
  const raw = readFileSync(dir + '/payload.json', 'utf8');
  if (/EI\d{16}/.test(raw)) {
    console.log(dir, 'SKIPPED: payload mentions a player id');
    continue;
  }
  const payload = JSON.parse(raw);
  delete payload.run;
  // Credited to the owner's board names (asked for 2026-09-24): main runs as Williamthe5thc, alt as Willsalt.
  const name = dir.replace(/\\/g, '/').split('/').pop();
  payload.nickname = name.startsWith('alt-') ? 'Willsalt' : 'Williamthe5thc';
  const csv = readFileSync(dir + '/table.csv', 'utf8').replace(/EI\d{16}/g, 'EI[redacted]');
  const res = await fetch(BASE + '/submit', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.log(dir, 'REFUSED', res.status, JSON.stringify(body));
    continue;
  }
  const gz = gzipSync(csv);
  const t = await fetch(`${BASE}/csv?id=${encodeURIComponent(body.id)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/gzip', 'x-upload-token': body.uploadToken },
    body: gz,
  });
  console.log(
    dir,
    'id',
    body.id,
    'flagged',
    JSON.stringify(body.flagged ?? []),
    'csv',
    t.status,
    (gz.length / 1024).toFixed(0) + ' KB gz'
  );
}
