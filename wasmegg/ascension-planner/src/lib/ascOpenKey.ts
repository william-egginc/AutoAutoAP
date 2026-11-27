import type { InjectionKey } from 'vue';

/** Whether My Runs' ascension blocks (components/myruns/EventsTable.vue) start open. Never provided by the page (they all start closed,
 *  Jordan, 18 Nov 2026); a spec that reads what an opened block holds provides true (test/renderComponent.ts `openAscensions`). */
export const ASC_START_OPEN: InjectionKey<boolean> = Symbol('ascStartOpen');
