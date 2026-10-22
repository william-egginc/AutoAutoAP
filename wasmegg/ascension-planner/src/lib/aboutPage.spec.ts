/**
 * public/about.html (About and privacy) says things that must stay true of the code: no player ID in it,
 * the counters named while they load, the retention times the collector uses, the relay storing nothing,
 * and the removal wording. If one of these fails, change the page and the code together.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SCRIPT_ORIGINS, securityTxt } from './securityHeaders';

const root = new URL('../../', import.meta.url);
const read = (p: string) => readFileSync(new URL(p, root), 'utf8');
const about = read('public/about.html');
const text = about.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

describe('About and privacy page', () => {
  it('has no player ID and no real name in it', () => {
    expect(about).not.toMatch(/EI\d{16}/);
    expect(about).not.toMatch(/William(?!the5thc)/);
  });

  it('names both counters while they are allowed to load, and says no cookies only while none are set', () => {
    expect(/goatcounter/i.test(read('index.html'))).toBe(true);
    expect(about).toContain('GoatCounter');
    expect(SCRIPT_ORIGINS.some(o => o.includes('static.cloudflareinsights.com'))).toBe(true);
    expect(about).toContain('Cloudflare Web');
    expect(about).toContain('No cookies');
    expect(read('src/main.ts') + read('src/App.vue')).not.toContain('document.cookie');
    expect(read('collector/worker.js')).not.toMatch(/set-cookie/i);
  });

  it('gives the retention the collector uses', () => {
    const worker = read('collector/worker.js');
    expect(worker).toMatch(/EXTRA_TTL_SECONDS = 180 \* 24 \* 60 \* 60/);
    expect(worker).toMatch(/INSTANT_TTL_SECONDS = 180 \* 24 \* 60 \* 60/);
    expect(read('collector/watch.js')).toMatch(/not updated in 7 days/);
    expect(about).toContain('180 days');
    expect(about).toContain('7 days after the last update');
  });

  it('says the relay stores and logs nothing only while its code has no storage, bindings or logging', () => {
    expect(text).toContain('It stores nothing, logs nothing, and only talks to the game');
    const relay = read('../_proxy/index.js');
    expect(relay).not.toMatch(/console\.|\benv\b|caches\.|\bKV\b|\bD1\b|\bR2\b/);
    // The only places it forwards to: the game's own hosts.
    const origins = [...relay.matchAll(/proxiedOrigin !== '([^']+)'/g)].map(m => m[1]);
    expect(origins.length).toBeGreaterThan(0);
    expect(origins.every(o => /auxbrain/.test(o))).toBe(true);
  });

  it('has the removal wording: hide from the public, show again, and the Discord contact', () => {
    expect(text).toContain('Hide from the public');
    expect(text).toContain('Show again');
    expect(text).toContain('stops other people downloading their CSV');
    expect(text).not.toMatch(/no delete button/i);
    expect(read('collector/worker.js')).toContain('Contact Williamthe5thc on Discord');
    expect(about).toContain('Williamthe5thc');
  });

  it('says the CSV needs the agreement first, and links security.txt that points to GitHub issues', () => {
    expect(text).toContain('Nothing is sent until you tick the agreement');
    expect(text).toContain('"Send my CSV too" starts ticked');
    expect(about).toContain('/.well-known/security.txt');
    expect(securityTxt()).toMatch(/Contact: https:\/\/github\.com\/.+\/issues/);
  });

  it('names the study record and what it holds, and says it is never sent (22 Oct 2026)', () => {
    expect(text).toContain(
      'This browser keeps your answer in a record called aap.study . It holds the answer (yes, no thanks or withdrawn), when you answered, the ticks, whether you chose a name or to stay anonymous, and a scrambled tag for each account that answered, made in this browser so it never shows the player ID. It holds no player ID and no name, and it is never sent.'
    );
    // What it says must stay true: the record's own fields (lib/study.ts storedStudy).
    const study = read('src/lib/study.ts');
    expect(study).toContain('answer: rec.answer,');
    expect(study).toContain('accounts: { ...rec.accounts },');
    expect(study).toContain("export const STUDY_KEY = 'aap.study';");
  });

  it('says a public row has the hours, the time off and the start weekday, as the collector keeps them', () => {
    expect(text).toContain(
      'If you set them, the row also has your hours (the times of day you said you can play, shown in the Schedule column) and the days you marked as time off. It always has the weekday your plan starts on. Rows are public.'
    );
    expect(text).toContain('Last updated 22 Oct 2026.');
    // The fields behind those words: sent by the planner, and kept on the public row by the collector.
    const sub = read('src/search/submission.ts');
    expect(sub).toContain('window: i.availability ? describeAvailability(i.availability) : null,');
    expect(sub).toContain('...(i.timeOff?.length ? { timeOff: i.timeOff.map(w => ({ ...w })) } : {}),');
    expect(sub).toContain('startWeekday: weekdayIn(i.planStart, tz),');
    const worker = read('collector/worker.js');
    const pick = worker.slice(worker.indexOf('function pickSubmission('));
    for (const f of ['window:', 'startWeekday:', 'timeOff: timeOffList(s.timeOff)']) expect(pick).toContain(f);
  });
});
