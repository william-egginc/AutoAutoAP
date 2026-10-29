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

/** The `at` of each release.ts history entry this bundle was built with (vite.config.ts): the banner
 *  never lists those as new (lib/updateNotes.ts). Absent in tests and dev. */
declare const __BUILD_NOTE_ATS__: string[];
