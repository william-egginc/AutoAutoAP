/**
 * public/about.html (About and privacy) says things that must stay true of the code: no player ID in it,
 * the counters named while they load, the retention times the collector uses, the relay storing nothing,
 * and the removal wording. If one of these fails, change the page and the code together.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SCRIPT_ORIGINS, securityTxt } from './securityHeaders';
import { AUTO_FOLLOW_FIRST } from './followPolicy';

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

  it('says what goes without the leaderboard tick or without a press: a sweep upload, auto-follow, the version (25 Oct 2026)', () => {
    expect(text).not.toContain('only when you press a button');
    expect(text).toContain(
      'One exception: Science › Submit a sweep sends a public row and its CSV when you press Submit this sweep'
    );
    expect(text).toContain('Submit this sweep , without that tick.');
    // Science › Submit a sweep (explorer/SweepUpload.vue): the row to /submit, then its CSV, with no consent in between.
    const upload = read('src/explorer/SweepUpload.vue');
    expect(upload).toContain('res = await fetch(`${props.base}/submit`, {');
    expect(upload).not.toMatch(/useConsent|consentAgreed/);
    if (AUTO_FOLLOW_FIRST)
      expect(text).toContain(
        'Two things are sent without a press. The route you follow can be saved online by itself: the first answer for Fastest to 490 TE and for Egg Day 2027, when you follow nothing for that goal'
      );
    else expect(text).not.toContain('The route you follow can be saved online by itself');
    expect(text).toContain(
      'And each open copy of the page sends its version, at most once a day, unless your browser sends Global Privacy Control or Do Not Track'
    );
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
      'If you set them, the row also has your awake hours (the times of day you said you are awake, shown in the Schedule column) and the days you marked as time off. It always has the weekday your plan starts on. Rows are public.'
    );
    expect(text).toContain('Last updated Oct 26, 2026.');
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

  it('says what the instant answer and the private search results send (23 Oct 2026)', () => {
    expect(text).toContain(
      'If you tick "Share my instant answer with my runs" (on My runs), a row you send also has your instant answer for that run: the route (the stops), the finish date, the TE, and when it was worked out. It is shown on your public run so others can compare. Without that tick it is not sent.'
    );
    expect(read('src/stores/chainSearch.ts')).toContain("if (payload.baseline || !consentAgreed('shareBaseline')) return payload;");
    expect(text).toContain(
      "the best result of a Fast, Exact or Custom search on your account for the same goal (it is in the record's exact field, which before Oct 23, 2026 held the price of the instant answer's own route)"
    );
    expect(text).toContain('They are anonymous, sent only with that consent, and never shown publicly.');
    expect(text).toContain('Last updated Oct 26, 2026.');
    expect(text).not.toContain('Keep sharing my checks');
  });

  it('says each open page sends only its version, at most once a day, kept as a count for 30 days (24 Oct 2026)', () => {
    expect(text).toContain(
      'Each open copy of the planner tells our server which version it is, at most once a day: just the version, nothing else. We keep only a count per version per day, for 30 days, so we know when old versions are still in use. If your browser sends Global Privacy Control or Do Not Track, nothing is sent.'
    );
    expect(text).toContain('Version counts 30 days, then deleted.');
    // What it says must stay true: the page sends the build id alone, once a day, not with GPC or DNT ...
    const page = read('src/lib/buildCount.ts');
    expect(page).toContain('body: build,');
    expect(page).toContain("referrerPolicy: 'no-referrer',");
    expect(page).toContain('if (store && sentOn(raw, build!, day)) return stop();');
    expect(page).toContain('if (nav.globalPrivacyControl === true) return true;');
    // ... and the collector keeps a count per day and build, 30 days, nothing else.
    expect(read('collector/migrations/0003_buildcount.sql').replace(/--.*\n/g, '').replace(/\s+/g, ' ').trim()).toBe(
      'CREATE TABLE IF NOT EXISTS build_counts ( day TEXT NOT NULL, build TEXT NOT NULL, n INTEGER NOT NULL, PRIMARY KEY (day, build) ) WITHOUT ROWID;'
    );
    expect(read('collector/buildcount.js')).toContain('export const BUILD_KEEP_DAYS = 30;');
    const setup = read('src/components/auto/YourSetup.vue').replace(/\s+/g, ' ');
    expect(setup).toContain(
      'is sent to the planner\'s server at most once a day: just the version, nothing else, so the maintainer knows when old versions are still in use. Global Privacy Control or Do Not Track turns it off.'
    );
  });

  it('says the route you follow is saved online under a code made from the ID, what is stored and how to restore (23 Oct 2026)', () => {
    expect(text).toContain(
      'the route you follow for that goal is saved online, under a code made from your player ID. That is so another device shows your route when you enter your ID there'
    );
    expect(text).toContain('Anyone who knows your player ID can make the same code, so they can see the route you follow, and change it.');
    expect(text).toContain(
      "If it couldn't be saved when you pressed it (you were offline, say), it is saved once the next time your account is loaded, unless a newer one is saved online by then."
    );
    expect(text).toContain(
      "If it still isn't saved, My runs, Right now, says so under the route, with Save it online"
    );
    expect(text).toContain('Nothing else saves it.');
    // The first answer becoming the follow (lib/followPolicy.ts, 24 Oct 2026): there exactly while the constant is on.
    const auto =
      'The first answer for Fastest to 490 TE and for Egg Day 2027 becomes the route you follow and is saved online, unless you already follow one.';
    if (AUTO_FOLLOW_FIRST) {
      expect(text).toContain(auto);
      expect(text).toContain(
        'That is the instant answer as its box shows it, or a Fast, Exact or Custom run that becomes your route on My runs, Right now, whichever comes first.'
      );
      expect(text).toContain('Every other goal (another Highest TE by a date, a Fastest to N TE target of your own) is saved only when you press Follow this route');
      expect(text).toContain('so a route you follow on another device is never replaced. After that, a better answer only asks you');
    } else expect(text).not.toContain('The first answer for Fastest to 490 TE');
    expect(text).not.toContain('When you are not following another route for a goal');
    const setup = read('src/components/auto/YourSetup.vue');
    expect(setup).toContain('It is saved when you press Follow this route,');
    expect(setup).toContain('v-if="AUTO_FOLLOW_FIRST"');
    expect(setup.replace(/\s+/g, ' ')).toContain(
      'The first answer for {{ fastestName(store.finalTE) }} and for Egg Day {{ CLOUD_EGG_DAY_YEAR }} becomes the route you follow and is saved online, unless you already follow one; other goals are saved when you press Follow. After that, a better answer only asks you.'
    );
    expect(text).not.toContain('not loading your account');
    expect(text).toContain(
      'What is stored: the route (the stops), the goal, when you set it, where it came from (the instant answer, a Fast, Exact or Custom run, or picked by hand), when the plan starts and when it finishes, its TE and time to spare, the awake hours window you used, the time of your save, and the simulator and planner version. Never your player ID or a name. Your days, time off and no prestige days are not stored.'
    );
    expect(text).toContain('The last 5 versions for each goal are kept. To put an earlier one back, open Earlier versions');
    expect(text).toContain('The routes you follow No time limit. The last 5 versions of each goal, for up to 8 goals.');
    expect(text).toContain('Last updated Oct 26, 2026.');
    // What it says must stay true: the key made in the browser from the ID, the value's fields, Follow the only write.
    const cloud = read('src/lib/followCloud.ts');
    expect(cloud).toContain("export const FOLLOW_KEY_PREFIX = 'aaap-follow-v1:';");
    expect(cloud).toContain("const id = (playerId ?? '').trim().toUpperCase();");
    expect(cloud).toContain('export const FOLLOW_VERSIONS = 5;');
    for (const f of ['chain', 'planStart', 'source', 'at', 'finish', 'endTE', 'spareSeconds', 'hours', 'saveTime', 'simVersion', 'build'])
      expect(cloud).toMatch(new RegExp(`\\n  ${f}\\??: `));
    expect(cloud).not.toMatch(/\n  (label|name|playerId|eiUserId)\??: /);
    const store = read('src/stores/follow.ts');
    expect(store.match(/putFollow\(/g)?.length).toBe(1);
    expect(store.indexOf('putFollow(')).toBeGreaterThan(store.indexOf('async function saveOnline('));
    // follow() and Right now's "Save it online" (saveNow, a press): the only two saves of a goal's route besides the
    // next load's one retry.
    expect(store.match(/saveOnline\(goalKey, f\)/g)?.length).toBe(2);
  });
  it('says your choices and Setup are saved online under the follow code, who can read them, and the limits (26 Oct 2026)', () => {
    // The Collector chat's draft (aaap-tools/notes/prefs-about-draft.md).
    expect(text).toContain(
      'Your sharing choices (the Help improve the planner answer, what you agreed to send, and whether you are credited by a name or stay anonymous) and your Setup (awake hours and the days they apply to, time off, no prestige days, your target TE and your time zone) are saved online, under the same code made from your player ID that the route you follow uses.'
    );
    expect(text).toContain('Anyone who knows your player ID can make the same code, so they could read these choices, and change them.');
    expect(text).toContain(
      'What is stored: the answers and ticks, the name you chose to be credited by (only if you chose a name), when you answered, and the Setup values above. Never your player ID. The settings for This computer (workers, memory, the per-ascension detail) and the Stepping away? choices are not stored. The last 5 versions of each are kept, and at most 30 changes an hour are saved.'
    );
    expect(text).toContain('Your choices and Setup are saved online only when you change them, and read whenever you load an account');
    expect(text).toContain('Your choices and Setup No time limit. The last 5 versions of each.');
    const setup = read('src/components/auto/YourSetup.vue').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    expect(setup).toContain(
      'Your choices and Setup are saved online : your consent choices and your Setup (awake hours, time off, no prestige days, target TE and time zone) are saved under the same code as the route you follow, made from your player ID. Anyone who knows your player ID can read and change them. Never the ID itself, and a name only if you chose to be credited by name. The last 5 versions of each are kept, and at most 30 changes an hour are saved.'
    );
    // What it says must stay true: the follow key, the 5 versions, the 30 an hour, no "This computer" settings.
    const cloud = read('src/lib/prefsCloud.ts');
    expect(cloud).toContain('export const prefsKey = followKey;');
    expect(cloud).toContain('export const PREFS_VERSIONS = 5;');
    expect(cloud).toContain('export const PREFS_WRITES_PER_HOUR = 30;');
    expect(cloud).not.toMatch(/\n  (workers|memory|memoryCap|playerId|eiUserId)\??: /);
    expect(cloud).toContain("if (c.credit === 'name' && name) value.nickname = name;");
    // Only the sharing consents go online (not the Stepping away? ones), and Setup has no field for the detail setting.
    expect(cloud).toContain(
      "export const SYNCED_CONSENTS = ['leaderboard', 'sendCsv', 'diagnosticsDefault', 'keepSharingChecks', 'shareBaseline'] as const;"
    );
    const setupShape = cloud.slice(cloud.indexOf('export interface CloudSetup {'), cloud.indexOf('export type CloudPrefValue'));
    expect(setupShape).not.toMatch(/leg|detail|budget|workers/i);
  });

  it('says where per-ascension detail is kept on disk, the 10-minute download copy, and what a send carries (26 Oct 2026)', () => {
    expect(text).toContain(
      "A search's per-ascension detail is kept in a file in this browser, so the downloaded CSV can have every route's detail, not only the fastest routes set by Keep per-ascension detail for N fastest routes (Setup › This computer)."
    );
    expect(text).toContain(
      'There is one file for each account and screen, named like aaap-legs/legs-fastest-&lt;code&gt;.spill . The code is made from your player ID, not the ID itself.'
    );
    expect(text).toContain('Download CSV writes the full file through this storage too, and that copy is removed 10 minutes later.');
    expect(text).toContain('Nothing in these files leaves your computer, except what a send includes');
    expect(text).toContain('The command line keeps its own file, legs.spill , on the computer it runs on.');
    expect(text).toContain(
      'The CSV of the routes the search priced, with each route\'s total time. It has the per-ascension times for the top 20,000 routes only (5,000, or none, if the file would be too big to send), not the full file that Download CSV saves.'
    );
    expect(text).not.toContain('The CSV of every route the search priced');
    // What it says must stay true: the file names, the 10 minutes, and the 20,000 / 5,000 / none of a send.
    expect(read('src/workers/legSpill.protocol.ts')).toContain("export const LEG_SPILL_DIR = 'aaap-legs';");
    expect(read('src/lib/legSpillOpfs.ts')).toContain('return `legs-${kind}-${partitionHash.slice(0, 32)}.spill`;');
    expect(read('src/lib/legSpillText.ts')).toContain('export const DOWNLOAD_FILE_TTL_MS = 10 * 60_000;');
    expect(read('src/search/csv.ts')).toContain('export const DEADLINE_LEG_ROUTES = 20000;');
    const store = read('src/stores/chainSearch.ts');
    expect(store.match(/for \(const legRoutes of \[DEADLINE_LEG_ROUTES, Math\.floor\(DEADLINE_LEG_ROUTES \/ 4\), 0\]\)/g)?.length).toBe(2);
    expect(read('scripts/siteRun.ts')).toContain('legs.spill');
  });

  it("says what My runs' quiet save check sends: the same request as loading a save, through the relay (26 Oct 2026)", () => {
    expect(text).toContain(
      "My runs also checks, quietly, whether the game's server has a newer save than the one loaded. It makes the same request as loading your save: your player ID goes through the same relay to the game's server, and your save comes back. The planner keeps only the save's time, and only until you close or reload the page."
    );
    expect(text).toContain(
      'It checks once per page load for each account, and not when you are offline or your save is under 10 minutes old. Nothing goes to the planner\'s own server.'
    );
    // What it says must stay true: Load's own request, only the time kept, the 10 minutes.
    const check = read('src/lib/serverSave.ts');
    expect(check).toContain('const { backup } = await requestSave(playerId, o.request ? { request: o.request } : {});');
    expect(check).toContain('known.set(hash, { checkedAt: Math.floor(o.nowSeconds), serverBackupTime: t });');
    expect(check).toContain('export const QUIET_CHECK_MIN_AGE_S = 10 * 60;');
    expect(check).toContain("export const NEWER_ON_SERVER = 'A newer save is on the server · Load it';");
    expect(text).toContain('unless you press A newer save is on the server · Load it');
  });

  it("says My runs reads your own run's CSV back by the row's id, never the player ID (26 Oct 2026)", () => {
    expect(text).toContain(
      "If the route you follow comes from a Fast, Exact or Custom run you sent from another browser, My runs reads that run's CSV back from the planner's server, once per page load, to get its exact per-ascension times. It asks by the run's row ID on the Leaderboard, never by your player ID."
    );
    expect(text).toContain("If the run has no CSV, or it can't be read, My runs shows the estimate instead.");
    // What it says must stay true: the fetch takes a row id only.
    expect(read('src/composables/useBoardRunLegs.ts')).toContain('fetchCsv(row.id)');
    expect(read('src/explorer/collector.ts')).toContain('const res = await fetch(`${base}/csv?id=${encodeURIComponent(id)}`, { signal });');
  });
});
