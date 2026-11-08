/**
 * A hideable section's Hide, handed to its card (CollapsibleSection.vue `hideInHeading`): the card draws it in its own
 * heading row instead of a lone pill on the section's edge (spec-uxpass items 8 and 13, 8 Nov 2026).
 */
import type { InjectionKey } from 'vue';

export const SECTION_HIDE: InjectionKey<() => void> = Symbol('section-hide');
