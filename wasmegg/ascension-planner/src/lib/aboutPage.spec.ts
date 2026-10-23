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
    expect(text).toContain('Last updated 23 Oct 2026.');
    // The fields behind those words: sent by the planner, and kept on the public row by the collector.
    const sub = read('src/search/submission.ts');
    expect(sub).toContain('window: i.availability ? describeAvailability(i.availability) : null,');
    expect(sub).toContain('...(i.timeOff?.length ? { timeOff: i.timeOff.map(w => ({ ...w })) } : {}),');
    expect(sub).toContain('startWeekday: weekdayIn(i.planStart, tz),');
    const worker = read('collector/worker.js');
    const pick = worker.slice(worker.indexOf('function pickSubmission('));
    for (const f of ['window:', 'startWeekday:', 'timeOff: timeOffList(s.timeOff)']) expect(pick).toContain(f);
  });
  it('says a row and a shared check say where the plan started from, as the planner and the collector keep it (22 Oct 2026)', () => {
    expect(text).toContain(
      "A row also says where the plan started from: whether the planner used a save it had just fetched, the save kept in this browser, a save file, a saved Manual plan or an account switch; the Truth Eggs your save has claimed and the ones still pending for each egg, kept apart; your save's time and a short code made from that time and your eggs, never from your player ID; the eggs delivered for each egg at the start; whether the plan starts now, at a time you set, or at a time handed over from a search; and how long the page had been open and how old the planner's version was."
    );
    expect(text).toContain('with the same note as a row on where it started from');
    // The fields behind those words.
    const prov = read('src/search/startProvenance.ts');
    expect(prov).toContain("export const START_SOURCES = ['fresh', 'stored', 'file', 'draft', 'switch'] as const;");
    expect(prov).toContain("export const PLAN_START_SOURCES = ['now', 'override', 'handoff'] as const;");
    expect(read('src/search/submission.ts')).toContain('...(start ? { start } : {}),');
    const worker = read('collector/worker.js');
    expect(worker.slice(worker.indexOf('function pickSubmission('))).toContain('start: startBlock(s.start),');
    expect(worker).toContain("const START_SOURCES = ['fresh', 'stored', 'file', 'draft', 'switch'];");
  });

  it('says what the instant baseline and the private search results send (23 Oct 2026)', () => {
    expect(text).toContain(
      'If you tick "Share my instant baseline with my runs" (on My runs), a row you send also has your instant baseline for that run: the route (the stops), the finish date, the TE, and when it was worked out. It is shown on your public run so others can compare. Without that tick it is not sent.'
    );
    expect(read('src/stores/chainSearch.ts')).toContain("if (payload.baseline || !consentAgreed('shareBaseline')) return payload;");
    expect(text).toContain(
      "the best result of a Fast, Exact or Custom search on your account for the same goal (it is in the record's exact field, which held Check exactly's price until that was retired on 23 Oct 2026)"
    );
    expect(text).toContain('They are anonymous, sent only with that consent, and never shown publicly.');
    expect(text).toContain('Last updated 23 Oct 2026.');
    expect(text).not.toContain('Keep sharing my checks');
  });

  it('says the route you follow is saved online under a code made from the ID, what is stored and how to restore (23 Oct 2026)', () => {
    expect(text).toContain(
      'the route you follow for that goal is saved online, under a code made from your player ID. That is so another device shows your route when you enter your ID there'
    );
    expect(text).toContain('Anyone who knows your player ID can make the same code, so they can see the route you follow, and change it.');
    expect(text).toContain('Nothing else saves it: not a result, not loading your account.');
    expect(text).toContain(
      'What is stored: the route (the stops), the goal, when you set it, where it came from (the instant answer, a Fast, Exact or Custom run, or picked by hand), when the plan starts and when it finishes, its TE and time to spare, the hours window you used, the time of your save, and the simulator and planner version. Never your player ID or a name. Your days and time off are not stored.'
    );
    expect(text).toContain('The last 5 versions for each goal are kept. To put an earlier one back, open Earlier versions');
    expect(text).toContain('The routes you follow No time limit. The last 5 versions of each goal, for up to 8 goals.');
    expect(text).toContain('Last updated 23 Oct 2026.');
    // What it says must stay true: the key made in the browser from the ID, the value's fields, Follow the only write.
    const cloud = read('src/lib/followCloud.ts');
    expect(cloud).toContain("export const FOLLOW_KEY_PREFIX = 'aap-follow-v1:';");
    expect(cloud).toContain("const id = (playerId ?? '').trim().toUpperCase();");
    expect(cloud).toContain('export const FOLLOW_VERSIONS = 5;');
    for (const f of ['chain', 'planStart', 'source', 'at', 'finish', 'endTE', 'spareSeconds', 'hours', 'saveTime', 'simVersion', 'build'])
      expect(cloud).toMatch(new RegExp(`\\n  ${f}\\??: `));
    expect(cloud).not.toMatch(/\n  (label|name|playerId|eiUserId)\??: /);
    const store = read('src/stores/follow.ts');
    expect(store.match(/putFollow\(/g)?.length).toBe(1);
    expect(store.indexOf('putFollow(')).toBeGreaterThan(store.indexOf('async function saveOnline('));
    expect(store.match(/saveOnline\(goalKey, f\)/g)?.length).toBe(1);
  });
});
