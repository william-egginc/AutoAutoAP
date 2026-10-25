<template>
  <form class="mx-4 sm:mx-auto sm:max-w-xs sm:w-full mt-2 mb-4 space-y-1" @submit.prevent="submit">
    <div>
      <label for="playerId" class="sr-only">Player ID</label>
      <div class="flex items-center gap-2">
        <button
          v-if="activeEid"
          type="button"
          class="inline-flex items-center justify-center min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 text-gray-400 hover:text-blue-500 focus:outline-none"
          aria-label="Edit name"
          @click="eidsStore.editName(activeEid, eids.get(activeEid)?.nickname)"
        >
          ✎
        </button>
        <base-input
          id="playerId"
          v-model="displayValue"
          type="text"
          name="playerId"
          :readonly="!editing"
          class="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
          :class="{ 'cursor-pointer': !editing && activeEid }"
          :title="!editing && activeEid ? 'Click to reveal/edit the EID' : undefined"
          placeholder="Player ID"
          @focus="onFocus"
          @blur="onBlur"
          @paste="onPaste"
        />
      </div>
      <!-- A native disclosure, not a hover tooltip: it opens by tap, click, Enter or Space, and is read out. -->
      <details v-if="eids.size <= 1" class="mt-2 text-center" data-testid="player-id-help">
        <summary
          class="inline-flex items-center space-x-1 min-h-[44px] sm:min-h-0 cursor-pointer list-none [&::-webkit-details-marker]:hidden"
        >
          <base-info />
          <span class="text-xs text-gray-500">Where do I find my ID?</span>
        </summary>
        <p class="mt-1 text-xs text-gray-600 text-left">
          {{ ID_HELP }}
        </p>
      </details>
      <div v-else class="mt-2 mb-2 w-fit mx-auto">
        <div class="flex flex-wrap gap-2 w-fit">
          <span
            v-for="[eid, entry] of eids"
            :key="eid"
            class="inline-flex items-center px-1 py-1 rounded-full border text-xs w-fit"
            :class="
              eid === activeEid
                ? 'bg-blue-100 border-blue-400 text-gray-900'
                : 'bg-gray-200 border-gray-300 text-gray-900'
            "
          >
            <button
              type="button"
              class="mr-1 text-gray-400 hover:text-blue-500 focus:outline-none"
              aria-label="Edit name"
              @click="eidsStore.editName(eid, entry.nickname)"
            >
              ✎
            </button>
            <span
              class="hover:underline cursor-pointer"
              style="text-decoration-thickness: 1.5px"
              @click="loadEid(eid)"
              >{{ eidsStore.displayName(eid) }}</span
            >
            <button
              type="button"
              class="mx-0.5 text-gray-500 hover:text-red-500 focus:outline-none"
              aria-label="Remove"
              @click="eidsStore.removeEid(eid)"
            >
              &times;
            </button>
          </span>
        </div>
      </div>
    </div>
    <div>
      <button
        type="submit"
        class="w-full flex items-center justify-center min-h-[44px] py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
        :class="{ 'cursor-not-allowed': !submittable }"
        :disabled="!submittable"
        @mousedown.prevent
      >
        Load Player Data
      </button>
    </div>
  </form>
</template>

<script lang="ts">
import { defineComponent, toRefs, watch } from 'vue';

import BaseInfo from './BaseInfo.vue';
import BaseInput from './BaseInput.vue';
import { pastedPlayerId, useEidInput } from '../composables/eid_input';
import { PlayerIdSchema } from 'lib/schema';

const ID_HELP =
  "The ID asked for here is the unique ID used by Egg, Inc.'s server to identify your account. You can find it in game screen -> nine dots menu -> Settings -> Privacy & Data, at the very bottom. It should look like EI1234567890123456. Your old game services ID prior to the Artifact Update does not work here. Also note that the ID is case-sensitive.";

export default defineComponent({
  components: {
    BaseInfo,
    BaseInput,
  },
  props: {
    playerId: {
      type: String,
      default: '',
    },
    /** Load straight away when a whole valid ID is pasted into the box (once per paste). */
    loadOnPaste: {
      type: Boolean,
      default: false,
    },
  },
  emits: {
    submit: (_playerId: string) => true,
  },
  setup(props, { emit }) {
    const { playerId } = toRefs(props);

    const { eidsStore, eids, activeEid, editing, displayValue, submittable, onFocus, onBlur, resolveSubmit, commit } =
      useEidInput(playerId.value);

    // Initialize with current playerId
    if (playerId.value) {
      eidsStore.addEid(playerId.value);
    }

    // The parent drives the active player via the prop.
    watch(playerId, () => {
      commit(playerId.value);
      eidsStore.addEid(playerId.value);
    });

    const load = (eid: string) => {
      const trimmed = eid.trim();
      if (!PlayerIdSchema.safeParse(trimmed).success) {
        return;
      }
      commit(trimmed);
      emit('submit', trimmed);
    };

    // The button submits the typed EID (or reloads the active player in display
    // mode).
    const submit = () => {
      load(resolveSubmit());
    };

    // Pasting a whole valid ID loads it, once per paste: the pasted text is checked as it comes off the
    // clipboard, so nothing watches the box and nothing can fire twice. Anything else pastes as usual.
    const onPaste = (event: ClipboardEvent) => {
      if (!props.loadOnPaste) return;
      const eid = pastedPlayerId(event.clipboardData?.getData('text') ?? '');
      if (!eid) return;
      event.preventDefault();
      load(eid);
    };

    // Clicking a recent-ID pill loads that player.
    const loadEid = (eid: string) => {
      load(eid);
    };

    return {
      activeEid,
      editing,
      displayValue,
      onFocus,
      onBlur,
      submittable,
      submit,
      onPaste,
      loadEid,
      ID_HELP,
      eids,
      eidsStore,
    };
  },
});
</script>
