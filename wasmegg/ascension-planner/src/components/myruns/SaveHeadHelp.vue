<!--
  THE SAVE BEHIND RIGHT NOW'S "?" (Jordan, 12 Nov 2026): My runs has no save box beside the Right now card any more; the
  save is in the card's header line (RightNowCard.vue, lib/calculatedFromWords.ts) and this "?" after it opens the same
  strip (myruns/SaveAgeStrip.vue, slim and small, as layout/SaveSide.vue draws it on Fastest and By a date): its age,
  Why and Details once old, amber past a day, Load latest save, the clock check. Closed by default on the quiet line;
  open by default when the strip says more than that (the clock check, a newer save on the server), so a safety line is
  never hidden. `display: contents`: the "?" sits on the header row, the panel takes a row of its own under it.
  The "?" is CardHelp's look (14 px, an invisible 44 px area on a phone, so the line does not move), a real button with
  aria-expanded and aria-controls. Its name is Words' (lib/layoutWords.ts SAVE_DETAILS_LABEL).
-->
<template>
  <span class="contents">
    <button
      type="button"
      class="relative self-center before:absolute before:-inset-[15px] before:content-[''] sm:before:hidden w-3.5 h-3.5 rounded-full border border-slate-400 text-slate-500 text-small font-bold leading-none flex items-center justify-center hover:border-slate-600 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
      :aria-label="SAVE_DETAILS_LABEL"
      :aria-expanded="open ? 'true' : 'false'"
      :aria-controls="id"
      data-testid="now-save-help"
      @click="picked = !open"
    >
      ?
    </button>
    <div :id="id" class="basis-full min-w-0 mt-1" :hidden="!open" data-testid="now-save-panel">
      <SaveAgeStrip
        :state="state"
        :server="server"
        :now="now"
        :loading="loading"
        testid="save-line-age"
        slim
        small
        :load-words="LOAD_LATEST_SAVE"
        @fresh="emit('fresh')"
      />
    </div>
  </span>
</template>

<script setup lang="ts">
import { computed, ref, useId } from 'vue';
import SaveAgeStrip from './SaveAgeStrip.vue';
import type { SaveBannerState } from '@/lib/saveBanner';
import type { ServerSaveState } from '@/lib/serverSave';
import { LOAD_LATEST_SAVE } from '@/composables/useAutoSaveStrip';
import { SAVE_DETAILS_LABEL } from '@/lib/layoutWords';

const props = defineProps<{ state: SaveBannerState | null; server: ServerSaveState; loading: boolean; now: number }>();
const emit = defineEmits<{ fresh: [] }>();
const id = `now-save-${useId()}`;
/** The player's own open/close; until then, open only when the strip is more than the quiet line. */
const picked = ref<boolean | null>(null);
const open = computed(() => picked.value ?? ((!!props.state && props.state.tone !== 'green') || props.server.kind === 'newer'));
</script>
