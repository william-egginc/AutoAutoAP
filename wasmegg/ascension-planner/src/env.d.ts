/// <reference types="vite/client" />

declare module '*.vue' {
  import { DefineComponent } from 'vue';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/ban-types
  const component: DefineComponent<{}, {}, any>;
  export default component;
}

/** When this bundle was built (vite.config.ts); compared with release.ts to decide whether an open
 *  tab has to reload. */
declare const __BUILD_TIME__: string;

/** True only in a build made with AAP_EGG_BETA_RELOAD_AT set (vite.config.ts, lib/versionJson.ts): the egg-beta timed
 *  reload (lib/eggBetaReload.ts) is compiled in. False in specs (vitest.config.ts). */
declare const __AAP_EGG_BETA_RELOAD__: boolean;

/** The `at` of each release.ts history entry this bundle was built with (vite.config.ts): the banner
 *  never lists those as new (lib/updateNotes.ts). Absent in tests and dev. */
declare const __BUILD_NOTE_ATS__: string[];

/** The key (lib/updateNotes.ts noteKey, a hash of the text) of each release.ts history entry this bundle was built
 *  with (vite.config.ts): a note is new to a tab only when its key is not here. Absent in tests. */
declare const __BUILD_NOTE_KEYS__: string[];

/** A hash of the code that decides results (vite.config.ts, lib/resultCodeHash.ts): every kept result carries it, and
 *  one kept under another is worked out again (lib/resultCode.ts). Absent in tests: `resultCode()` is then 'dev'. */
declare const __RESULT_CODE_HASH__: string;
